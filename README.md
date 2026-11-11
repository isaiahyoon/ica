# Immanuel Church of America (미주임마누엘교회)

> “Immanuel, which being interpreted is, God with us.” — Matthew 1:23

Public website: [immanuelchurchofamerica.org](https://immanuelchurchofamerica.org).

## Features

- **Information page** (landing page, `/`) — welcome and overview, with Scripture passages that open English KJV and Korean KRV links to that passage.
- **About** (`/about`) — bilingual page on our family church, worship services and times, worship style, preaching, what we affirm, and leadership with contact numbers.
- **Sermons** (`/sermons`, `/sermons/:id`) — public audio player list and individual sermon pages, with speaker, service and date shown in separate English and Korean rows, optional service information, expandable descriptions, preserved text line breaks, native sharing where supported, and a copy-link option. Recognized Scripture references offer KJV and KRV links, including matching bilingual references on separate lines or separated by parentheses; existing `//` references display on separate lines. Split verse ranges get separate links.
- **Clickable Scripture** — passage menus use silver-plated borders except on sermon cards, where the reference retains its understated left rule. Keyboard-focus feedback is visible and reduced motion is supported. Unrecognized or conflicting references remain plain text.
- **Link previews** — absolute, bilingual Open Graph and Twitter Card metadata with a custom 1200×630 preview image; the canonical URL is set for each page. Each sermon has a server-generated PNG at `/sermons/:id/preview.png` with its title, saved Bible reference, and optional service label centered within the original blue-and-gold artwork—not verse text or the description. Image URLs change when any of those fields changes; a bounded in-memory cache avoids repeated rendering. Messaging apps may retain older previews. Missing references or service labels are omitted from the image; without a reference, metadata offers a bilingual listening invitation.
- **Contact** (`/contact`) — address with a Google Maps link, a bilingual location diagram showing the parking lot directly behind the building's south side, visitor details, and Instagram, with a link to worship times on About; includes a clickable 1 Corinthians 13:12 verse beside the church logo, with English KJV and Korean KRV links, and is linked from the welcome page.
- **Admin** (`/admin`) — two-step sign-in (password, then authenticator code) for uploading, replacing, and removing sermon audio; sermon details have separate English and Korean speaker fields, one date and an optional service dropdown, and support multiline text. Existing custom service values are preserved when editing. Replacement keeps the existing sermon details and link; audio starts uploading as soon as it is selected, while sermon details can be entered for new sermons; the owner can add, reset, and remove other admins.
- **Font study** (`/font-study.html`) — English and Korean typeface specimens with a live four-font serif/sans pairing preview.
- **Analytics** — optional Umami page-view tracking on public server-rendered pages. Set `UMAMI_WEBSITE_ID`; `UMAMI_SCRIPT_URL` optionally selects an HTTPS script URL (defaults to Umami Cloud). Admin pages are excluded.

## Code layout

- `server.js` defines the Express app and routes; `lib/` contains server-side rendering and supporting modules.
- `lib/sermon-preview.js` renders sermon preview PNGs with Sharp, Resvg, and shared CSS colors. `assets/fonts/` bundles regular Cormorant Garamond and Noto Serif CJK KR (the Korean regional face of Noto Serif) for consistent English/Korean rendering on all hosts, with their SIL Open Font Licenses. No browser, external rendering service, or build step is required.
- `public/scripts/` holds page-specific browser behavior, separate from the server-rendered HTML templates in `lib/render.js`.
- `public/styles.css` is the shared stylesheet and design-token source; `tests/` contains the automated test suite.

## Run locally

Requires Node 20+.

```sh
npm install
ADMIN_PASSWORD='use-a-unique-passphrase-of-16-characters-or-more' npm start   # http://localhost:8100
```

If `ADMIN_PASSWORD` is not set in local development, a freshly generated password is printed in the terminal on each start. Production requires `ADMIN_PASSWORD`. Sign in at `/admin/login`.

To enable Umami, set `UMAMI_WEBSITE_ID` to the website ID from your Umami project. Umami Cloud is the default; for a self-hosted instance, also set `UMAMI_SCRIPT_URL` to its HTTPS `script.js` URL. Tracking is disabled when the website ID is empty, and admin pages are never tracked.

Other commands: `npm run dev` (auto-restart), `npm test`, `npm run reset-owner-2fa` (clears the owner's authenticator if their phone and recovery codes are both lost). Set `PORT` to change the port.

## Instagram sermon slides

Different sermons use visibly different compositions, not just changed gradients: the renderer rotates flowing silk, vaulted arches, angular corner fans, and oval medallions by existing image count and batch order, with seeded variations. The assistant must compare the set visually before delivery, especially for batches larger than four. Automated checks compare same-seed compositions to ensure their geometry differs substantially.

The art-direction quality target is richer than those geometry checks: the owner's navy-covering reference calls for textured, sculptural midnight-blue folds, luminous interwoven pastel silk, believable depth and lighting, and metallic-gold edges and glints within the artwork. Flat pastel triangles, concentric bands, and generic borders are not an acceptable substitute. This is a visual quality requirement, not a claim that the current procedural renderer already achieves the reference's material richness.

For separately approved reference-inspired image generation, include an optional `backgroundPath` (absolute local image path) in each JSON entry. The renderer fits that artwork to the portrait and overlays exact English/Korean text locally instead of adding procedural decorations. Use different artwork for each sermon and inspect the finished slide. The renderer never calls an image service itself; separately generating backgrounds may consume credits and needs approval.

Artwork overlays balance title lines, render Korean companion text at a smaller size with deliberate language separation, and space Scripture and names by their measured heights. Section gaps are at least 60 logical pixels, greater than language gaps. The redundant speaker label is omitted; dense metadata is rejected. The understated bilingual founding-year footer sits at the bottom and may overlap ribbons.

All Instagram lettering uses the restrained ivory `--paper` token and shares the canvas centerline, with no individually offset groups. The text presentation is solemn and stately; pastel and metallic colors belong to the artwork, not the lettering. This applies to both procedural slides and supplied artwork.

For older viewers, both rendering paths share enlarged secondary sermon metadata (at least 64 exported pixels), lightly reinforced regular serif strokes, and comfortable line/language spacing. The quiet bottom footer uses smaller 52/48 exported-pixel lettering. Dense metadata is rejected instead of being reduced below the reading minimum. Inspect the finished slides at phone size as well as full resolution.

Slide footers read **Since 1994 · 1994년부터** instead of a listening invitation, matching the church founding year displayed on the website.

Ask the assistant: “Create Instagram posts for these sermon links: …” The repository's `instagram-post` skill verifies the linked metadata, creates **one 2160×2700 portrait JPG per link**, and returns each image, a caption, and five hashtags. The caption is the saved **Sermon Overview** verbatim, with a blank line between English and Korean, followed by “Listen to the sermon via the link in our bio.” and “프로필 링크를 통해 설교를 들으실 수 있습니다.” on separate lines. No paraphrasing or invented translations; a missing overview stops generation. Captions appear above the hashtags. The first two hashtags are always `#ImmanuelChurchOfAmerica` and `#미주임마누엘교회`; the remaining three are relevant to the sermon title and/or Scripture.

Each slide always displays the saved **title, speaker, and Scripture reference**, preserving available English/Korean text. The saved **service label** replaces the generic "Sermon" heading, with English and Korean on separate lines when available; that heading is omitted if no service is specified. Missing required fields stop generation rather than being invented. Deep midnight/royal blue replaces greenish teal in the artwork, with visibly generous yellow, lavender/purple, and pink glows and flowing, layered gold-edged ribbons inspired by the owner's navy-covering reference. Each render varies its gradients, ribbon curves, and accent placement while keeping text on dark blue and blue dominant. The artwork-specific `--midnight`, `--royal-blue`, and `--ribbon-blue` tokens live in `public/styles.css` and do not change the website's existing surfaces. Bundled regular serif fonts render English and Korean locally, without a browser or external image service.

For a quick render directly from the local sermon store:

```sh
npm run instagram -- "http://localhost:8100/sermons/<sermon-id>" "https://immanuelchurchofamerica.org/sermons/<another-id>"
```

URL arguments identify sermons in `data/sermons.json` (or `ICA_DATA_DIR`, overridden by `--data-dir`). **They do not fetch live pages**; the assistant checks supplied pages before using that snapshot. Quick renders use `#Sermon #BibleTeaching #Scripture` as the additional tags.

For verified metadata from a page not in the local store, or custom per-sermon tags, use `npm run instagram -- --input "/path/to/metadata.json"` with a JSON array:

```json
[{
  "url": "https://immanuelchurchofamerica.org/sermons/eb590a2a-e48d-4160-b335-cdff6b3352cc",
  "title": "<exact saved title>",
  "speakerEn": "<saved English speaker>",
  "speakerKo": "<saved Korean speaker>",
  "scripture": "<exact saved Scripture reference>",
  "service": "<saved service label, if present>",
  "date": "2026-11-08",
  "description": "<exact saved Sermon Overview>",
  "hashtags": ["<relevant tag>", "<relevant tag>", "<relevant tag>"]
}]
```

One speaker language is sufficient; legacy `speaker` text is supported. Provide exactly three distinct discretionary hashtags; the two church tags are prepended automatically. Inputs are validated before generation, and overly dense text is rejected rather than shrunk below legible sizes. The command prints image paths, captions, and hashtags, and writes only JPGs directly in `data/instagram/` (git-ignored), with **no subfolders**. Filenames use `sermons-[saved YYYY-MM-DD date]-[service slug].jpg`, e.g. `sermons-2026-11-08-sunday-2nd-service.jpg`. Use the saved sermon date, not the generation date. The slug uses the saved English service when available, otherwise Korean, lowercased and separated by hyphens. Missing values use `undated` and `unspecified-service`; invalid dates are rejected. Existing files are preserved, with repeat names receiving `-2`, `-3`, etc., including concurrent runs. Use `--output "/path/to/folder"` to change the output root. This is a local assistant tool, not an Express endpoint or Instagram publishing integration.

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
