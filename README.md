# Immanuel Church of America (미주임마누엘교회)

> “Immanuel, which being interpreted is, God with us.” — Matthew 1:23

Church website prototype.

## Features

- **Information page** (landing page, `/`) — welcome and overview; About details to come.
- **About** (`/about`) — bilingual page on our family church, worship style, preaching, what we affirm, and leadership with contact numbers.
- **Sermons** (`/sermons`) — public audio player list.
- **Gallery** (`/gallery`) — public photo gallery.
- **Contact** (`/contact`) — address with a Google Maps link, worship times, visitor details, and Instagram; includes 1 Corinthians 13:12 beside the church logo and is linked from the Connect card on the welcome page.
- **Admin** (`/admin`) — password-protected upload and removal of sermon audio and photos.
- **Font study** (`/font-study.html`) — English and Korean typeface specimens with a live four-font serif/sans pairing preview.

## Run locally

Requires Node 20+.

```sh
npm install
ADMIN_PASSWORD='use-a-unique-passphrase-of-16-characters-or-more' npm start   # http://localhost:8100
```

If `ADMIN_PASSWORD` is not set in local development, a freshly generated password is printed in the terminal on each start. Production requires `ADMIN_PASSWORD`. Sign in at `/admin/login`.

Other commands: `npm run dev` (auto-restart), `npm test`. Set `PORT` to change the port.

## Admin security

The configured admin password must contain at least 16 non-whitespace characters. Use a unique passphrase and keep it in your deployment's secret manager. Production requires `NODE_ENV=production` and an `ADMIN_SESSION_SECRET` of at least 32 bytes; use the same secret across restarts. Production cookies are `Secure`, `HttpOnly`, `SameSite=Strict`, and host-only. Serve the site over HTTPS in production.

Login attempts are limited to 8 failures per client IP in 15 minutes. Login and admin changes require same-origin requests; state-changing admin forms also use session-bound CSRF tokens. Admin sessions expire after 8 hours and are revoked on sign-out or server restart. The session and rate-limit stores are in-memory and intended for a single server process. Before running multiple instances, replace them with a shared session store and shared rate limiter. If running behind a reverse proxy, set `TRUST_PROXY_HOPS` to the exact number of trusted proxy hops so rate limits use the client IP; do not trust arbitrary forwarded headers.

## Data

Sermon and photo metadata is saved in `data/` and files in `uploads/` (both git-ignored). Delete those folders to reset.

## Design

Dominantly blue (KRV palette from `src/word`), navy and brass for a regal feel, with pink, lavender, and yellow accents. English uses regular-weight Cormorant Garamond and Optima; Korean uses Noto Serif KR and Noto Sans KR. Headings and Scripture are serif; body, buttons, and explanatory text are sans-serif. Fixed English interface copy is paired with Korean using comfortable line spacing. See [AGENTS.md](AGENTS.md) for the full design system and conventions.

## License

This repository contains proprietary code and assets. See [LICENSE.md](LICENSE.md) for the license notice and third-party material terms.
