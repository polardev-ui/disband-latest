/* Client-side search over the docs. No build step, no dependencies. */
(function () {
  "use strict";

  var index = [];
  var overlay, input, results, status;
  var active = -1;

  function init() {
    overlay = document.getElementById("search-overlay");
    input = document.getElementById("search-input");
    results = document.getElementById("search-results");
    status = document.getElementById("search-status");
    if (!overlay) return;

    fetch("assets/search-index.json")
      .then(function (r) { return r.json(); })
      .then(function (data) { index = data; })
      .catch(function () {
        // Opened from file:// where fetch is blocked. Search degrades to a
        // message rather than silently doing nothing.
        index = null;
      });

    document.querySelectorAll("[data-search-open]").forEach(function (el) {
      el.addEventListener("click", open);
    });

    document.addEventListener("keydown", function (e) {
      var typingElsewhere =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement;

      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        open();
        return;
      }
      if (e.key === "/" && !typingElsewhere && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        open();
        return;
      }
      if (e.key === "Escape" && overlay.classList.contains("is-open")) close();
    });

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) close();
    });

    input.addEventListener("input", function () { run(input.value); });
    input.addEventListener("keydown", function (e) {
      var items = results.querySelectorAll("a");
      if (!items.length) return;
      if (e.key === "ArrowDown") { e.preventDefault(); move(1, items); }
      else if (e.key === "ArrowUp") { e.preventDefault(); move(-1, items); }
      else if (e.key === "Enter" && active >= 0) { e.preventDefault(); items[active].click(); }
    });
  }

  function move(delta, items) {
    active = (active + delta + items.length) % items.length;
    items.forEach(function (el, i) { el.classList.toggle("is-active", i === active); });
    items[active].scrollIntoView({ block: "nearest" });
  }

  function open() {
    overlay.classList.add("is-open");
    document.body.style.overflow = "hidden";
    input.value = "";
    active = -1;
    run("");
    setTimeout(function () { input.focus(); }, 40);
  }

  function close() {
    overlay.classList.remove("is-open");
    document.body.style.overflow = "";
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /** Highlights the matched term inside a snippet. */
  function snippet(text, term) {
    var i = text.toLowerCase().indexOf(term.toLowerCase());
    if (i < 0) return escapeHtml(text.slice(0, 120)) + "…";
    var start = Math.max(0, i - 45);
    var raw = text.slice(start, start + 150);
    var out = escapeHtml(raw);
    var safeTerm = escapeHtml(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return (start > 0 ? "…" : "") +
      out.replace(new RegExp(safeTerm, "ig"), function (m) { return "<mark>" + m + "</mark>"; }) + "…";
  }

  function run(query) {
    active = -1;
    var q = query.trim();

    if (index === null) {
      status.textContent = "Search needs the site to be served over HTTP. Try: python3 -m http.server";
      results.innerHTML = "";
      return;
    }
    if (!q) {
      status.textContent = "Type to search. ↑ ↓ to navigate, Enter to open, Esc to close.";
      results.innerHTML = "";
      return;
    }

    var terms = q.toLowerCase().split(/\s+/);
    var hits = [];

    index.forEach(function (entry) {
      var hay = (entry.title + " " + entry.section + " " + entry.text).toLowerCase();
      var score = 0;
      var matchedAll = terms.every(function (t) {
        var at = hay.indexOf(t);
        if (at < 0) return false;
        score += entry.title.toLowerCase().indexOf(t) >= 0 ? 12 : 0;
        score += entry.section.toLowerCase().indexOf(t) >= 0 ? 6 : 0;
        score += 1;
        return true;
      });
      if (matchedAll) hits.push({ entry: entry, score: score });
    });

    hits.sort(function (a, b) { return b.score - a.score; });
    hits = hits.slice(0, 12);

    status.textContent = hits.length
      ? hits.length + (hits.length === 1 ? " result" : " results")
      : "No results for “" + q + "”";

    results.innerHTML = hits.map(function (h) {
      var e = h.entry;
      return (
        '<a href="' + e.url + '">' +
          '<span class="r-top">' +
            '<span class="r-page">' + escapeHtml(e.title) + "</span>" +
            (e.section ? '<span class="r-sec">' + escapeHtml(e.section) + "</span>" : "") +
          "</span>" +
          '<span class="r-text">' + snippet(e.text, terms[0]) + "</span>" +
        "</a>"
      );
    }).join("");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

/* Reveal sections as they scroll into view. Respects reduced-motion. */
(function () {
  "use strict";
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!("IntersectionObserver" in window)) return;

  function start() {
    var targets = document.querySelectorAll(".content h2, .content table, .content pre, .content .cards, .content .note, .content .warn, .content .danger");
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("revealed");
        io.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -40px 0px", threshold: 0.05 });

    targets.forEach(function (el) {
      // Only animate what starts below the fold. Hiding content that is
      // already on screen causes a visible flash before the observer fires,
      // and leaves the page blank if the callback is delayed.
      if (el.getBoundingClientRect().top < window.innerHeight) return;
      el.classList.add("reveal");
      io.observe(el);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();

/* Copy buttons on code blocks. */
(function () {
  "use strict";
  function start() {
    document.querySelectorAll(".code-wrap .copy").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var pre = btn.parentElement.querySelector("pre");
        if (!pre) return;
        navigator.clipboard.writeText(pre.innerText).then(function () {
          var prev = btn.textContent;
          btn.textContent = "Copied";
          setTimeout(function () { btn.textContent = prev; }, 1200);
        });
      });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();

/* Reading progress bar fixed to the top of the page. */
(function () {
  "use strict";
  function start() {
    var bar = document.createElement("div");
    bar.id = "scroll-progress";
    document.body.appendChild(bar);

    var ticking = false;
    function update() {
      ticking = false;
      var doc = document.documentElement;
      var max = doc.scrollHeight - doc.clientHeight;
      bar.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + "%";
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener("resize", update);
    update();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
