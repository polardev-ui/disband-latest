// DisbandSetup — prototype web-stub installer (Windows only).
//
// A tiny branded bootstrapper that never goes stale: it asks GitHub for the
// latest Disband release on every run, downloads the per-user NSIS setup,
// installs it silently, and launches the app. No version numbers, asset URLs,
// or API endpoints are baked in beyond the repo slug and filename patterns,
// so this binary never needs rebuilding unless those change.
//
// Flow: check -> download (progress) -> silent install -> launch -> quit.
// Any failure lands on the status label + a details dialog; nothing is
// half-installed because the NSIS installer itself is atomic.

using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Net.Http;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Text.Json;
using System.Windows.Forms;
#if SLIM
using Microsoft.Win32;
#endif

namespace DisbandSetup;

[SupportedOSPlatform("windows")]
internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new SetupForm());
    }
}

[SupportedOSPlatform("windows")]
internal sealed class RoundedBar : Control
{
    private double _value; // 0..1, <0 = indeterminate marquee

    public double Value
    {
        get => _value;
        set { _value = value; Invalidate(); }
    }

    public RoundedBar()
    {
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer, true);
        Height = 8;
        Dock = DockStyle.None;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        using var back = new SolidBrush(Color.FromArgb(49, 51, 56));
        using var path = RoundRect(ClientRectangle, 4);
        g.FillPath(back, path);
        if (_value >= 0)
        {
            int w = (int)(ClientRectangle.Width * Math.Clamp(_value, 0, 1));
            if (w > 0)
            {
                using var fill = new SolidBrush(Color.FromArgb(88, 101, 242));
                using var fillPath = RoundRect(new Rectangle(0, 0, w, ClientRectangle.Height), 4);
                g.FillPath(fill, fillPath);
            }
        }
        else
        {
            // Marquee: a sliding brand-colored slug while the length is unknown.
            int slug = Math.Max(60, ClientRectangle.Width / 4);
            int x = (int)((DateTime.Now.Ticks / 10000 % 1200) / 1200.0 * (ClientRectangle.Width + slug)) - slug;
            using var fill = new SolidBrush(Color.FromArgb(88, 101, 242));
            using var fillPath = RoundRect(new Rectangle(x, 0, slug, ClientRectangle.Height), 4);
            g.FillPath(fill, fillPath);
            Invalidate(); // keep marching until a real value arrives
        }
    }

    private static GraphicsPath RoundRect(Rectangle r, int radius)
    {
        var p = new GraphicsPath();
        int d = radius * 2;
        p.AddArc(r.X, r.Y, d, d, 180, 90);
        p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        p.CloseFigure();
        return p;
    }
}

[SupportedOSPlatform("windows")]
internal sealed class SetupForm : Form
{
    private const string RepoSlug = "polardev-ui/disband-latest";
    private const string ReleasesApi = "https://api.github.com/repos/" + RepoSlug + "/releases/latest";

    private static readonly Color Bg = Color.FromArgb(30, 31, 34);
    private static readonly Color Fg = Color.White;
    private static readonly Color Muted = Color.FromArgb(148, 155, 164);
    private static readonly Color Danger = Color.FromArgb(240, 71, 71);

    private readonly Label _status;
    private readonly Label _version;
    private readonly RoundedBar _bar;
    private readonly HttpClient _http;
    private bool _dragging;
    private Point _dragFrom;

    public SetupForm()
    {
        Text = "Disband Setup";
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(440, 320);
        BackColor = Bg;
        DoubleBuffered = true;

        var handler = new SocketsHttpHandler { PooledConnectionLifetime = TimeSpan.FromMinutes(2) };
        _http = new HttpClient(handler);
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("DisbandSetup/1.0");
        _http.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
        _http.Timeout = TimeSpan.FromMinutes(10);

        var logo = new PictureBox
        {
            Size = new Size(96, 96),
            Location = new Point((440 - 96) / 2, 28),
            SizeMode = PictureBoxSizeMode.Zoom,
        };
        var asm = Assembly.GetExecutingAssembly();
        using (var s = asm.GetManifestResourceStream("DisbandSetup.res.logo.png"))
        {
            if (s != null) logo.Image = Image.FromStream(s);
        }

        var title = new Label
        {
            Text = "Disband",
            Font = new Font("Segoe UI", 24, FontStyle.Bold),
            ForeColor = Fg,
            AutoSize = false,
            TextAlign = ContentAlignment.MiddleCenter,
            Location = new Point(0, 130),
            Size = new Size(440, 40),
        };

        _status = new Label
        {
            Text = "Getting ready…",
            Font = new Font("Segoe UI", 10),
            ForeColor = Muted,
            AutoSize = false,
            TextAlign = ContentAlignment.MiddleCenter,
            Location = new Point(40, 176),
            Size = new Size(360, 22),
        };

        _bar = new RoundedBar
        {
            Location = new Point(60, 206),
            Size = new Size(320, 8),
            Value = -1,
        };

        _version = new Label
        {
            Text = "",
            Font = new Font("Segoe UI", 9),
            ForeColor = Color.FromArgb(110, 114, 120),
            AutoSize = false,
            TextAlign = ContentAlignment.MiddleCenter,
            Location = new Point(40, 224),
            Size = new Size(360, 20),
        };

        var close = new Label
        {
            Text = "✕",
            Font = new Font("Segoe UI", 10),
            ForeColor = Muted,
            AutoSize = true,
            Location = new Point(412, 10),
            Cursor = Cursors.Hand,
        };
        close.Click += (_, _) => Close();

        var hint = new Label
        {
            Text = "Fetching the latest release from GitHub — this little installer never goes stale.",
            Font = new Font("Segoe UI", 9),
            ForeColor = Color.FromArgb(110, 114, 120),
            AutoSize = false,
            TextAlign = ContentAlignment.MiddleCenter,
            Location = new Point(40, 262),
            Size = new Size(360, 34),
        };

        Controls.AddRange([logo, title, _status, _bar, _version, close, hint]);

        Shown += async (_, _) => await RunAsync();
        MouseDown += (_, e) => { if (e.Button == MouseButtons.Left) { _dragging = true; _dragFrom = e.Location; } };
        MouseMove += (_, e) => { if (_dragging) { Left += e.X - _dragFrom.X; Top += e.Y - _dragFrom.Y; } };
        MouseUp += (_, _) => _dragging = false;
    }

    protected override void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        using var path = new GraphicsPath();
        int r = 20, d = r * 2;
        var rect = new Rectangle(0, 0, Width, Height);
        path.AddArc(rect.X, rect.Y, d, d, 180, 90);
        path.AddArc(rect.Right - d, rect.Y, d, d, 270, 90);
        path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);
        path.AddArc(rect.X, rect.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        Region = new Region(path);
    }

    private void Say(string text, bool error = false)
    {
        _status.Text = text;
        _status.ForeColor = error ? Danger : Muted;
    }

    private void Fail(string what, Exception ex)
    {
        Say(what, error: true);
        _bar.Value = 0;
        MessageBox.Show(this,
            $"{what}\n\nDetails: {ex.GetType().Name}: {ex.Message}\n\nCheck your connection and try again — nothing was installed or changed.",
            "Disband Setup", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        Close();
    }

    private async Task RunAsync()
    {
        string tempDir = Path.Combine(Path.GetTempPath(), "DisbandSetup");
        try
        {
#if SLIM
            // Slim build only: make sure the shared .NET Desktop Runtime is
            // present before anything else needs it.
            await EnsureDotNetAsync(tempDir);
#endif
            // 1. Latest release metadata.
            Say("Checking for the latest version…");
            using var metaResp = await _http.GetAsync(ReleasesApi);
            metaResp.EnsureSuccessStatusCode();
            using var metaDoc = JsonDocument.Parse(await metaResp.Content.ReadAsStreamAsync());
            var root = metaDoc.RootElement;
            string tag = root.GetProperty("tag_name").GetString() ?? "";
            if (string.IsNullOrWhiteSpace(tag)) throw new InvalidOperationException("Release has no tag name.");
            _version.Text = tag;

            bool arm = RuntimeInformation.OSArchitecture == Architecture.Arm64;
            string? assetUrl = null, assetName = null;
            foreach (var a in root.GetProperty("assets").EnumerateArray())
            {
                string name = a.GetProperty("name").GetString() ?? "";
                bool match = arm
                    ? name.Contains("arm64", StringComparison.OrdinalIgnoreCase) && name.EndsWith("-setup.exe", StringComparison.OrdinalIgnoreCase)
                    : name.EndsWith("x64-setup.exe", StringComparison.OrdinalIgnoreCase);
                if (!match) continue;
                // Prefer exact arch builds; fall back to anything setup-like.
                assetUrl = a.GetProperty("browser_download_url").GetString();
                assetName = name;
                if (name.Contains("Disband", StringComparison.OrdinalIgnoreCase)) break;
            }
            if (assetUrl == null || assetName == null)
                throw new InvalidOperationException($"No setup asset found in {tag}.");

            // 2. Download with progress.
            Directory.CreateDirectory(tempDir);
            string installerPath = Path.Combine(tempDir, assetName);
            Say($"Downloading {assetName}…");
            using (var dlResp = await _http.GetAsync(assetUrl, HttpCompletionOption.ResponseHeadersRead))
            {
                dlResp.EnsureSuccessStatusCode();
                long? total = dlResp.Content.Headers.ContentLength;
                await using var net = await dlResp.Content.ReadAsStreamAsync();
                await using var file = File.Create(installerPath);
                var buffer = new byte[81920];
                long done = 0;
                int read;
                var lastPaint = DateTime.Now;
                while ((read = await net.ReadAsync(buffer)) > 0)
                {
                    await file.WriteAsync(buffer.AsMemory(0, read));
                    done += read;
                    if (total is > 0 && DateTime.Now - lastPaint > TimeSpan.FromMilliseconds(100))
                    {
                        lastPaint = DateTime.Now;
                        _bar.Value = (double)done / total.Value;
                        Say($"Downloading Disband {tag}… {(100.0 * done / total.Value):F0}%");
                    }
                }
                _bar.Value = 1;
            }

            // 3. Silent per-user install. NSIS /S needs no elevation for
            // current-user installs; wait so a half-written install can never
            // be launched below.
            Say("Installing…");
            _bar.Value = -1;
            using (var p = new Process())
            {
                p.StartInfo = new ProcessStartInfo
                {
                    FileName = installerPath,
                    Arguments = "/S",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                };
                p.Start();
                await p.WaitForExitAsync();
                if (p.ExitCode != 0)
                    throw new InvalidOperationException($"Installer exited with code {p.ExitCode}.");
            }

            // 4. Launch the installed app (resolve, don't hardcode: product
            // renames must not strand this stub).
            Say("Starting Disband…");
            string exe = LocateInstalledApp() ?? throw new InvalidOperationException("Installed, but the app executable was not found.");
            Process.Start(new ProcessStartInfo { FileName = exe, UseShellExecute = true });

            try { File.Delete(installerPath); } catch { /* best effort */ }
            Close();
        }
        catch (Exception ex)
        {
            Fail("Setup couldn't finish.", ex);
        }
    }

    private static string? LocateInstalledApp()
    {
        string dir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Disband");
        if (!Directory.Exists(dir)) return null;
        string disband = Path.Combine(dir, "Disband.exe");
        if (File.Exists(disband)) return disband;
        // Fallback: first real exe that isn't the uninstaller.
        foreach (string exe in Directory.GetFiles(dir, "*.exe"))
        {
            string name = Path.GetFileName(exe);
            if (!name.StartsWith("Uninstall", StringComparison.OrdinalIgnoreCase)
                && !name.StartsWith("Update", StringComparison.OrdinalIgnoreCase))
                return exe;
        }
        return null;
    }

#if SLIM
    // Slim build only. The stub itself needs the shared .NET Desktop Runtime;
    // if it is missing (fresh Windows, no dev tools), fetch and install it
    // once, silently. This is the one elevation prompt in the whole flow —
    // everything after it stays per-user.
    private async Task EnsureDotNetAsync(string tempDir)
    {
        if (DotNetDesktopPresent()) return;
        bool arm = RuntimeInformation.OSArchitecture == Architecture.Arm64;
        string url = arm
            ? "https://aka.ms/dotnet/10.0/windowsdesktop-runtime-win-arm64.exe"
            : "https://aka.ms/dotnet/10.0/windowsdesktop-runtime-win-x64.exe";
        Directory.CreateDirectory(tempDir);
        string installerPath = Path.Combine(tempDir, "dotnet-runtime.exe");

        Say("Installing .NET runtime (one time only)…");
        _bar.Value = -1;
        using (var resp = await _http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead))
        {
            resp.EnsureSuccessStatusCode();
            long? total = resp.Content.Headers.ContentLength;
            await using var net = await resp.Content.ReadAsStreamAsync();
            await using var file = File.Create(installerPath);
            var buffer = new byte[81920];
            long done = 0;
            int read;
            while ((read = await net.ReadAsync(buffer)) > 0)
            {
                await file.WriteAsync(buffer.AsMemory(0, read));
                done += read;
                if (total is > 0)
                    _bar.Value = (double)done / total.Value;
            }
        }

        Say("Almost there — approving the runtime install…");
        int exit;
        using (var p = new Process())
        {
            // runas = the single UAC prompt. Without it the runtime installer
            // fails on standard accounts.
            p.StartInfo = new ProcessStartInfo
            {
                FileName = installerPath,
                Arguments = "/install /quiet /norestart",
                UseShellExecute = true,
                Verb = "runas",
            };
            try
            {
                p.Start();
            }
            catch (System.ComponentModel.Win32Exception ex) when (ex.NativeErrorCode == 1223)
            {
                throw new InvalidOperationException(
                    "The .NET runtime needs administrator approval once. Re-run setup and accept the prompt.");
            }
            await p.WaitForExitAsync();
            exit = p.ExitCode;
        }
        try { File.Delete(installerPath); } catch { /* best effort */ }
        // 0 = done, 3010/1641 = done-pending-reboot (runtime is usable now).
        if (exit != 0 && exit != 3010 && exit != 1641)
            throw new InvalidOperationException($"The .NET runtime installer exited with code {exit}.");
        if (!DotNetDesktopPresent())
            throw new InvalidOperationException("The .NET runtime still isn't detected after install.");
        _bar.Value = 1;
    }

    private static bool DotNetDesktopPresent()
    {
        try
        {
            using var key = Registry.LocalMachine.OpenSubKey(
                @"SOFTWARE\dotnet\Setup\InstalledVersions\x64\sharedfx\Microsoft.WindowsDesktop.App");
            if (key == null) return false;
            foreach (string name in key.GetValueNames())
            {
                if (Version.TryParse(name.Split(' ')[0], out var v) && v.Major >= 10)
                    return true;
            }
            return false;
        }
        catch
        {
            return false;
        }
    }
#endif
}
