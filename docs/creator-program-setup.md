# Creator Program setup

Creators connect YouTube, TikTok or Twitch in **Settings → Creator Program**. Disband reads only their public handle and follower count. At 2,500 or more followers on any one platform, the Content Creator badge appears, and hovering over it shows the counts.

You need to do three things: apply the database migration, register an app on each platform, and add the keys to the environment.

## 1. Apply the migration

Run `supabase/migrations/0177_v2_33_platform.sql` on the Supabase project, either through the SQL editor or with `supabase db push`. Until you do, Creator Program, Account Standing, Management and Wallet all return 404s.

## 2. Callback URLs

Every platform asks for a redirect URL. Register these, using your real domain in place of `disband.app`:

| Platform | Production | Local |
|---|---|---|
| YouTube | `https://disband.app/api/creator/callback/youtube` | `http://localhost:3021/api/creator/callback/youtube` |
| TikTok | `https://disband.app/api/creator/callback/tiktok` | TikTok needs HTTPS. Test through a tunnel such as ngrok. |
| Twitch | `https://disband.app/api/creator/callback/twitch` | `http://localhost:3021/api/creator/callback/twitch` |

## 3. YouTube (Google Cloud)

1. Go to console.cloud.google.com, then create or pick a project.
2. Open **APIs & Services → Library** and enable **YouTube Data API v3**.
3. Open **OAuth consent screen**:
   - Choose External.
   - Add the scope `https://www.googleapis.com/auth/youtube.readonly`.
   - Add yourself as a test user.
4. Open **Credentials**, choose **Create credentials → OAuth client ID**, and pick **Web application**.
5. Add the callback URLs from step 2 as **Authorised redirect URIs**.
6. Copy the client ID into `GOOGLE_OAUTH_CLIENT_ID` and the secret into `GOOGLE_OAUTH_CLIENT_SECRET`.
7. Before going live, submit the consent screen for verification. The scope is sensitive, so Google reviews it.

## 4. TikTok (Login Kit)

1. Go to developers.tiktok.com, then **Manage apps → Connect an app**.
2. Add the **Login Kit** product.
3. Request the scopes `user.info.basic`, `user.info.profile` and `user.info.stats`. The `user.info.stats` scope provides the follower count.
4. Add the HTTPS redirect URI from step 2.
5. Copy the Client key into `TIKTOK_CLIENT_KEY` and the Client secret into `TIKTOK_CLIENT_SECRET`.
6. Submit the app for review. While it's in sandbox, only accounts you add as target users can connect.

## 5. Twitch

1. Go to dev.twitch.tv/console, then **Register Your Application**.
2. Set the category to Website Integration and add the redirect URLs from step 2.
3. Choose **New Secret**.
4. Copy the client ID into `TWITCH_CLIENT_ID` and the secret into `TWITCH_CLIENT_SECRET`.
5. Twitch needs no extra scopes, because follower counts are public.

## 6. Environment variables

Add these to `.env.local`, and to Vercel or wherever production runs. Never commit them.

```
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
CREATOR_STATE_SECRET=        # any long random string, e.g. `openssl rand -hex 32`
SUPABASE_SERVICE_ROLE_KEY=   # probably already set
```

Restart the dev server after you change the variables. Any platform that's missing its keys shows **Not available yet** instead of a Connect button.

## 7. Test it

1. Open **Settings → Creator Program → Connect** for a platform.
2. Approve access, and you land back in Settings with `?creator=connected`, or with `?creator=verified` if the account has 2,500+ followers.
3. Check the badge on your profile and hover over it to see the counts.
4. **Disconnect** removes the connection, and the badge goes too if no platform is still over the threshold.

## Troubleshooting

- **404 on `creator_connections`:** the migration from step 1 isn't applied.
- **`redirect_uri_mismatch`:** the URL registered with the platform doesn't exactly match the callback. Check the protocol, the port and that there's no trailing slash.
- **TikTok shows a permissions error:** the app is still in sandbox, or the `user.info.stats` scope hasn't been approved.
- **"Invalid state":** the user took longer than 10 minutes to approve, or `CREATOR_STATE_SECRET` changed between starting and finishing.
