# Immanuel Church of America (미주임마누엘교회)

> “Immanuel, which being interpreted is, God with us.” — Matthew 1:23

Public website: [immanuelchurchofamerica.org](https://immanuelchurchofamerica.org).

## Features

- **Information page** (landing page, `/`) — welcome and overview, with Scripture passages that open English KJV and Korean KRV links to that passage.
- **About** (`/about`) — bilingual page on our family church, worship services and times, worship style, preaching, what we affirm, and leadership with contact numbers.
- **Sermons** (`/sermons`, `/sermons/:id`) — public audio player list and individual sermon pages, with native sharing where supported, a copy-link option, and English KJV and Korean KRV links for recognized Scripture references, including matching bilingual references such as `Song of Songs 1:1 (아가서 1:1)`.
- **Clickable Scripture** — silver-plated borders and a disclosure marker identify passage menus across the site; hover and expanded states use gold plating, with visible keyboard-focus feedback and reduced-motion support. Unrecognized or conflicting references remain plain text.
- **Link previews** — absolute, bilingual Open Graph and Twitter Card metadata with a custom 1200×630 preview image; the canonical URL is set for each page.
- **Contact** (`/contact`) — address with a Google Maps link, a bilingual location diagram showing the parking lot directly behind the building's south side, visitor details, and Instagram, with a link to worship times on About; includes a clickable 1 Corinthians 13:12 verse beside the church logo, with English KJV and Korean KRV links, and is linked from the welcome page.
- **Admin** (`/admin`) — two-step sign-in (password, then authenticator code) for uploading, replacing, and removing sermon audio; replacement keeps the existing sermon details and link; audio starts uploading as soon as it is selected, while sermon details can be entered for new sermons; the owner can add, reset, and remove other admins.
- **Font study** (`/font-study.html`) — English and Korean typeface specimens with a live four-font serif/sans pairing preview.

## Code layout

- `server.js` defines the Express app and routes; `lib/` contains server-side rendering and supporting modules.
- `public/scripts/` holds page-specific browser behavior, separate from the server-rendered HTML templates in `lib/render.js`.
- `public/styles.css` is the shared stylesheet and design-token source; `tests/` contains the automated test suite.

## Run locally

Requires Node 20+.

```sh
npm install
ADMIN_PASSWORD='use-a-unique-passphrase-of-16-characters-or-more' npm start   # http://localhost:8100
```

If `ADMIN_PASSWORD` is not set in local development, a freshly generated password is printed in the terminal on each start. Production requires `ADMIN_PASSWORD`. Sign in at `/admin/login`.

Other commands: `npm run dev` (auto-restart), `npm test`, `npm run reset-owner-2fa` (clears the owner's authenticator if their phone and recovery codes are both lost). Set `PORT` to change the port.

## Local sermon transcription for Instagram drafts

This optional command runs **only on an Apple Silicon Mac**, with macOS 15+ and Python 3.10+. It is not a website feature or Render dependency: no public/admin transcription endpoint is added. The free Whisper model runs locally; recordings are never uploaded to a transcription service. The first run downloads model weights (roughly 1.6 GB) from Hugging Face; later runs reuse the local cache.

Install the isolated transcription environment once:

```sh
npm run transcribe:setup
```

Transcribe a local audio file or an individual public church sermon link:

```sh
npm run transcribe -- "/path/to/sermon.m4a"
npm run transcribe -- "https://immanuelchurchofamerica.org/sermons/eb590a2a-e48d-4160-b335-cdff6b3352cc"
```

Korean is the default spoken language; use `--language en` for an English recording. The command converts audio with macOS `afconvert`, transcribes ten-minute chunks, prints progress, and saves a timestamped `.txt` transcript plus a `.json` transcript with source, model, language, duration, and completion status. Outputs default to `data/transcripts/` (git-ignored and not served by Express). Use `--output data/transcripts/my-sermon` to choose another filename prefix; existing transcripts are not overwritten. Temporary downloaded audio and converted WAV files are cleaned up automatically. An interrupted or failed transcription remains clearly marked **INCOMPLETE**, not a finished transcript.

To draft an Instagram post, give the completed transcript to the assistant and ask: “Summarize this sermon in English for the church's Instagram, with the main message, three takeaways, and the sermon link.” The command itself does not generate or publish summaries, call a paid API, or post to Instagram. Review the draft against the recording before publishing: machine transcripts can mishear Korean names and Scripture references, especially during songs, silence, or group prayer. Do not invent quotations, sermon points, or passage references.

The optional tool's automated tests run with `npm test` and require `python3`, but do not download a model or require the transcription environment.

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

The live site is [immanuelchurchofamerica.org](https://immanuelchurchofamerica.org). The public pages publish absolute Open Graph image URLs and page-specific canonical URLs; the 1200×630 preview image is available at [immanuelchurchofamerica.org/link-preview.png](https://immanuelchurchofamerica.org/link-preview.png). Share apps may cache previews, so refresh the URL with a platform's sharing debugger when an updated image or description does not appear immediately.

To create a new Render service, create a Blueprint in Render from this repository and provide a unique `ADMIN_PASSWORD` of at least 16 non-whitespace characters when prompted. Render generates `ADMIN_SESSION_SECRET`; keep it stable across restarts. For a different deployment, configure the custom domain and DNS records in the host and verify HTTPS.

The app also supports `ICA_DATA_DIR` and `ICA_UPLOAD_DIR` for persistent storage on other hosts. Both directories should be on persistent storage, not an ephemeral deploy filesystem.

Audio selected in the admin form uploads to a private staging directory first. New audio is published with its sermon details only after the form is submitted; replacing audio keeps the existing sermon details and link. Abandoned staged uploads are removed after one hour.

## Data

Sermon metadata is saved in `data/` and uploaded audio files in `uploads/` (both git-ignored). Delete those folders to reset.

## Design

Dominantly blue (KRV palette from `src/word`), navy and brass for a regal feel, with pink, lavender, and yellow accents. English uses regular-weight Cormorant Garamond and Optima; Korean uses Noto Serif KR and Noto Sans KR. Headings and Scripture are serif; body, buttons, and explanatory text are sans-serif. Fixed English interface copy is paired with Korean using comfortable line spacing. See [AGENTS.md](AGENTS.md) for the full design system and conventions.

## License

This repository contains proprietary code and assets. See [LICENSE.md](LICENSE.md) for the license notice and third-party material terms.
