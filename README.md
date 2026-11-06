# Immanuel Church of America (미주임마누엘교회)

> “Immanuel, which being interpreted is, God with us.” — Matthew 1:23

Church website prototype.

## Features

- **Information page** (landing page, `/`) — welcome and overview; About details to come.
- **About** (`/about`) — bilingual page on our family church, worship style, preaching, what we affirm, and leadership with contact numbers.
- **Sermons** (`/sermons`, `/sermons/:id`) — public audio player list and individual sermon pages, with native sharing where supported and a copy-link option.
- **Link previews** — bilingual Open Graph and Twitter metadata with a custom 1200×630 preview image.
- **Contact** (`/contact`) — address with a Google Maps link, worship times, visitor details, and Instagram; includes 1 Corinthians 13:12 beside the church logo and is linked from the welcome page.
- **Admin** (`/admin`) — two-step sign-in (password, then authenticator code) for upload and removal of sermon audio; the owner can add, reset, and remove other admins.
- **Font study** (`/font-study.html`) — English and Korean typeface specimens with a live four-font serif/sans pairing preview.

## Run locally

Requires Node 20+.

```sh
npm install
ADMIN_PASSWORD='use-a-unique-passphrase-of-16-characters-or-more' npm start   # http://localhost:8100
```

If `ADMIN_PASSWORD` is not set in local development, a freshly generated password is printed in the terminal on each start. Production requires `ADMIN_PASSWORD`. Sign in at `/admin/login`.

Other commands: `npm run dev` (auto-restart), `npm test`, `npm run reset-owner-2fa` (clears the owner's authenticator if their phone and recovery codes are both lost). Set `PORT` to change the port.

## Admin security

The configured admin password must contain at least 16 non-whitespace characters. Use a unique passphrase and keep it in your deployment's secret manager. Production requires `NODE_ENV=production` and an `ADMIN_SESSION_SECRET` of at least 32 bytes; use the same secret across restarts. Production cookies are `Secure`, `HttpOnly`, `SameSite=Strict`, and host-only. Serve the site over HTTPS in production.

### Two-step sign-in and several admins

There are no usernames. Everyone signs in with a password and then a 6-digit code from an authenticator app (Google or Microsoft Authenticator).

- **Owner:** the person who holds `ADMIN_PASSWORD`. Sign in once to set up the authenticator (scan the QR code, type the code) and save the 8 one-time recovery codes. Do this right after launch.
- **Other admins:** the owner opens `/admin`, types the person's name under **Admins**, and gives them the temporary code shown once. The new admin signs in at `/admin/login` with it, sets up their authenticator, chooses their own password (16+ characters, different from everyone else's), and saves their recovery codes.
- **Lost phone:** sign in with a recovery code instead of the app (each works once). The owner can **Reset sign-in** for an admin, which issues a new temporary code and signs them out; **Remove** deletes an admin and ends their sessions.

Passwords are stored as salted scrypt hashes and authenticator secrets in `data/admins.json` (git-ignored; back it up with the rest of `data/`). A code can be used only once; the password-only step grants no access, and code attempts are also limited per account.

Login attempts are limited to 8 failures per client IP in 15 minutes. Login and admin changes require same-origin requests; state-changing admin forms also use session-bound CSRF tokens. Admin sessions expire after 8 hours and are revoked on sign-out or server restart. The session and rate-limit stores are in-memory and intended for a single server process. Before running multiple instances, replace them with a shared session store and shared rate limiter. If running behind a reverse proxy, set `TRUST_PROXY_HOPS` to the exact number of trusted proxy hops so rate limits use the client IP; do not trust arbitrary forwarded headers.

## Deploy on Render

The [Render Blueprint](render.yaml) creates a Node web service with a 1 GB persistent disk mounted at `/var/data`. Sermon metadata and uploaded audio files are stored there so they survive deploys and restarts. The service uses one instance because admin sessions and login rate limits are held in memory.

Create a Blueprint in Render from this repository and provide a unique `ADMIN_PASSWORD` of at least 16 non-whitespace characters when prompted. Render generates `ADMIN_SESSION_SECRET`; keep it stable across restarts. After the first deploy, add `immanuelchurchofamerica.org` in the service's **Settings → Custom Domains**, register the domain with a registrar if it is available, then set the DNS records Render displays and verify the domain. Render provisions HTTPS after DNS verification.

The app also supports `ICA_DATA_DIR` and `ICA_UPLOAD_DIR` for persistent storage on other hosts. Both directories should be on persistent storage, not an ephemeral deploy filesystem.

## Data

Sermon metadata is saved in `data/` and uploaded audio files in `uploads/` (both git-ignored). Delete those folders to reset.

## Design

Dominantly blue (KRV palette from `src/word`), navy and brass for a regal feel, with pink, lavender, and yellow accents. English uses regular-weight Cormorant Garamond and Optima; Korean uses Noto Serif KR and Noto Sans KR. Headings and Scripture are serif; body, buttons, and explanatory text are sans-serif. Fixed English interface copy is paired with Korean using comfortable line spacing. See [AGENTS.md](AGENTS.md) for the full design system and conventions.

## License

This repository contains proprietary code and assets. See [LICENSE.md](LICENSE.md) for the license notice and third-party material terms.
