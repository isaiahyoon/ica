# Immanuel Church of America (미주임마누엘교회)

> “Immanuel, which being interpreted is, God with us.” — Matthew 1:23

Public website: [immanuelchurchofamerica.org](https://immanuelchurchofamerica.org).

## Features

- **Navigation** — a compact bilingual mobile header keeps the public links visible with generous touch targets; links wrap when additional space is needed.
- **Information page** (landing page, `/`) — welcome and overview, with About, Sermons, Articles, Gallery, and Contact links in a responsive action grid. Desktop shows three links above two centered links; mobile shows a 2×2 grid with Contact spanning the final row. Scripture passages open English KJV and Korean KRV links to that passage.
- **About** (`/about`) — bilingual page on our family church, worship services and times, worship style, preaching, what we affirm, and leadership with contact numbers.
- **Sermons** (`/sermons`, `/sermons/:id`) — audio players, bilingual speaker, service and date, expandable descriptions, native sharing where supported, and copyable links. A bilingual dropdown filters the archive by Sunday 1st/2nd/3rd, Wednesday, or Friday service (`?service=sunday-1`, `sunday-2`, `sunday-3`, `wednesday`, or `friday`), retaining the filter through pagination. All services includes unspecified and custom labels; recognized English and Korean labels match their category. Recognized Scripture references offer KJV and KRV links, including matching bilingual references, multiple passages, and split verse ranges; unrecognized or conflicting references remain plain text.
- **Pastoral columns** (`/columns`, `/columns/:slug`) — a paginated article list with English/Korean titles and previews. Dedicated articles support bilingual text, a compressed article image, and an optional video link. Admins publish and delete articles from `/admin`.
- **Link previews** — absolute, bilingual Open Graph and Twitter Card metadata with a custom 1200×630 preview image; the canonical URL is set for each page. Each sermon has a server-generated PNG at `/sermons/:id/preview.png` with its title, saved Bible reference, and optional service label centered within the original blue-and-gold artwork—not verse text or the description. Image URLs change when any of those fields changes; a bounded in-memory cache avoids repeated rendering. Messaging apps may retain older previews. Missing references or service labels are omitted from the image; without a reference, metadata offers a bilingual listening invitation.
- **Contact** (`/contact`) — address and Google Maps link, bilingual parking diagram, visitor information, Instagram, a link to worship times on About, and the 1 Corinthians 13:12 passage beside the church logo.
- **Gallery** (`/gallery`, `/gallery/:id`) — a public grid of 24 photos per page with optional bilingual captions and a full-size viewer. Stable photo links survive replacement and pagination changes. Previous/Next buttons and arrow keys navigate across pages; closing the viewer restores focus and position. At `/admin/gallery`, upload up to 100 JPEG, PNG, WebP, HEIC, or HEIF photos per batch (20 MB and 40 megapixels each), review private previews, add captions, publish, edit, or replace photos. Individual upload errors do not discard successful uploads.
- **Admin** (`/admin`) — two-step sign-in (password, then authenticator code) for uploading, replacing, and removing sermon audio. A shared pastor list starts with Pastor John Yoon / 윤태선 목사 and can be managed by admins; removing a pastor does not change existing sermons. The Scripture selector offers the 66 books, KJV chapter and verse counts, multiple ranges and passages; references and bilingual speaker fields remain manually editable. Existing custom service values are preserved when editing. Replacement keeps the existing sermon details and link; audio starts uploading as soon as it is selected, while sermon details can be entered for new sermons; the owner can add, reset, and remove other admins.
- **Font study** (`/font-study.html`) — English and Korean typeface specimens with a live four-font serif/sans pairing preview.
- **Analytics** — optional Umami page-view tracking on public server-rendered pages. Set `UMAMI_WEBSITE_ID`; `UMAMI_SCRIPT_URL` optionally selects an HTTPS script URL (defaults to Umami Cloud). Admin pages are excluded.

## Code layout

- `server.js` defines the Express app and routes; `lib/` contains server-side rendering and supporting modules.
- `lib/sermon-preview.js` renders sermon preview PNGs with Sharp, Resvg, and shared CSS colors. `assets/fonts/` bundles regular Cormorant Garamond and Noto Serif CJK KR (the Korean regional face of Noto Serif) for consistent English/Korean rendering on all hosts, with their SIL Open Font Licenses. No browser, external rendering service, or build step is required.
- `lib/gallery-routes.js` handles gallery storage, private drafts, publishing, editing, and replacement. Sharp validates still images, corrects orientation, strips metadata, and generates WebP display images and thumbnails; originals are removed. `lib/gallery-heif-worker.js` decodes HEIC/HEIF off the main thread. Templates live in `lib/render.js`; browser behavior lives in `public/scripts/gallery.js` and `public/scripts/admin-gallery.js`.
- `lib/column-routes.js` handles pastoral article storage and image validation. Articles and uploaded WebP images are served through dedicated record-checked routes.
- `/admin/gallery/reorder` provides dragging, Earlier/Later buttons, and direct-position moves. Changes remain unpublished until saved; a revision check rejects stale saves with 409. New batches go first in upload order, while replacements retain their position and stable links.
- `public/scripts/` holds page-specific browser behavior, separate from the server-rendered HTML templates in `lib/render.js`.
- `public/scripts/sermon-filter.js` dismisses the service dropdown on Escape, outside clicks/taps, or focus moving to another control. Focus loss without a new target leaves the menu open so mobile Safari can activate tapped option links.
- `public/styles.css` is the shared stylesheet and design-token source; `tests/` contains the automated test suite.

## Run locally

Requires Node 20+.

```sh
npm install
ADMIN_PASSWORD='use-a-unique-passphrase-of-16-characters-or-more' npm start   # http://localhost:8100
```

If `ADMIN_PASSWORD` is not set in local development, a freshly generated password is printed in the terminal on each start. Production requires `ADMIN_PASSWORD`. Sign in at `/admin/login`.

To enable Umami, set `UMAMI_WEBSITE_ID` to the website ID from your Umami project. The Render Blueprint configures the church's Umami Cloud website ID. Umami Cloud is the default; for a self-hosted instance, also set `UMAMI_SCRIPT_URL` to its HTTPS `script.js` URL. Tracking is disabled when the website ID is empty, and admin pages are never tracked.

Other commands: `npm run dev` (auto-restart), `npm test`, `npm run reset-owner-2fa` (clears the owner's authenticator if their phone and recovery codes are both lost). Set `PORT` to change the port.

## Prepare HEIC photos for gallery uploads

On a Mac, build the local drag-and-drop converter once:

```sh
npm run build-photo-converter
```

In Finder, drag HEIC or HEIF photos onto **Gallery Photo Converter.app** in the project folder. Alternatively, open the app to choose multiple photos. It processes photos one at a time and saves each JPEG beside its original, even when the photos are in different folders. Originals and existing JPEGs are never overwritten. Every JPEG is strictly under 0.7 MB (700,000 bytes) and fits within the website's 2048 × 2048 display size. Images are never enlarged. The converter uses high JPEG quality and reduces dimensions further if needed to fit the size limit. If `jpegtran` is available on the PATH, lossless JPEG optimization can reduce the file further; otherwise the app reports that optimization is unavailable. Conversion to JPEG and resizing are lossy. The local copies may retain photo metadata; the website strips it when publishing. Errors are reported per photo; no photos are uploaded by this tool. The app requires Node.js and macOS `sips`; rebuild it after changing the converter.

The same converter can be run in the terminal with `npm run prepare-gallery -- "/path/to/photo.heic" "/path/to/another.heif"`.

## Instagram sermon slides

The [Instagram post skill](.github/skills/instagram-post/SKILL.md) contains the assistant's full verification, art direction, privacy, and inspection workflow. A direct sermon-post request authorizes one credit-consuming custom background per post; other image generation requires approval. The renderer itself does not call an image service: it overlays exact text locally on a supplied `backgroundPath` or generates procedural artwork.

Ask the assistant: “Create Instagram posts for these sermon links: …” The repository's `instagram-post` skill verifies the linked metadata, creates **one 2160×2700 portrait JPG per link**, and returns each image, a caption, and five hashtags. For a link-free request, provide the English and Korean sermon titles, Scripture reference, and sermon description. The speaker defaults to Pastor John Yoon / 윤태선 목사, and the sermon date defaults to the request date. Wednesday and Friday requests use their corresponding service; for Sunday, specify the 1st, 2nd, or 3rd service. Titles and Scripture references are used as supplied. Korean sermon description text is translated into English for the caption, with the original Korean retained below it. The caption presents English first, then Korean, followed by “Listen to the sermon via the link in our bio.” and “프로필 링크를 통해 설교를 들으실 수 있습니다.” on separate lines. A missing overview stops generation. Captions appear above the hashtags. The first two hashtags are always `#ImmanuelChurchOfAmerica` and `#미주임마누엘교회`; the remaining three are relevant to the sermon title and/or Scripture.

Each slide displays the title, Scripture reference, and founding-year footer. A speaker, date, and service label are included when provided or saved; missing values are omitted rather than invented. The blue-led artwork and centered, readable text follow the skill's design and inspection requirements.

For a quick render directly from the local sermon store:

```sh
npm run instagram -- "http://localhost:8100/sermons/<sermon-id>" "https://immanuelchurchofamerica.org/sermons/<another-id>"
```

URL arguments identify sermons in `data/sermons.json` (or `ICA_DATA_DIR`, overridden by `--data-dir`). **They do not fetch live pages**; the assistant checks supplied pages before using that snapshot. Quick renders use `#Sermon #BibleTeaching #Scripture` as the additional tags.

For verified metadata from a page not in the local store, metadata supplied directly by the user, or custom per-sermon tags, use `npm run instagram -- --input "/path/to/metadata.json"` with a JSON array. For Korean-only, link-free input, only `title`, `scripture`, and `description` are required:

```json
[{
  "title": "<provided title>",
  "scripture": "<provided Scripture reference>",
  "description": "<provided Sermon Overview>",
  "speakerKo": "<optional speaker>",
  "date": "<optional saved date>",
  "hashtags": ["<relevant tag>", "<relevant tag>", "<relevant tag>"]
}]
```

When using a link, saved metadata is verified against the page. A user-provided title, Scripture, or overview is preserved exactly; do not infer missing sermon details or translate it. Speaker and date are optional; include the date only when provided or saved, never substitute the generation date. Service and hashtags are optional; the two church hashtags are prepended to three default tags when custom tags are omitted. Inputs are validated before generation, and overly dense text is rejected rather than shrunk below legible sizes. The command prints image paths, captions, and hashtags, and writes only JPGs directly in `data/instagram/` (git-ignored), with **no subfolders**. Filenames use `sermons-[saved YYYY-MM-DD date]-[service slug].jpg`, e.g. `sermons-2026-11-08-sunday-2nd-service.jpg`; missing date uses `undated`, and missing service uses `unspecified-service`. The slug uses the saved English service when available, otherwise Korean, lowercased and separated by hyphens. Existing files are preserved, with repeat names receiving `-2`, `-3`, etc., including concurrent runs. Use `--output "/path/to/folder"` to change the output root. This is a local assistant tool, not an Express endpoint or Instagram publishing integration.

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

Gallery records, including private draft ownership and expiry, are stored in `data/gallery.json`; generated images live in `uploads/gallery/`, and temporary incoming files in `uploads/gallery-staging/`. These directories are never exposed through static serving: public image routes only serve files belonging to published records. Draft preview routes require the uploading admin session. Unpublished photos expire after one hour; cleanup runs at startup, every minute, and when opening gallery management. Drafts from a revoked session are inaccessible and expire normally. Reloading gallery management restores unexpired previews, but unsaved caption text is not retained. Publishing accepts 1–100 distinct drafts atomically; captions are optional and limited to 1,000 characters per language. New batches may be uploaded after publishing.

## Data

Sermon, gallery, and pastoral-column metadata are saved in `data/`, and uploaded audio, gallery images, and article images in `uploads/` (both git-ignored). Deleting these folders permanently removes their contents, including admin records and uploads; back up anything needed before resetting. Deployments may use different directories via `ICA_DATA_DIR` and `ICA_UPLOAD_DIR`.

## Design

Dominantly blue (KRV palette from `src/word`), navy and brass for a regal feel, with pink, lavender, and yellow accents. English uses regular-weight Cormorant Garamond and Optima; Korean uses Noto Serif KR and Noto Sans KR. Headings and Scripture are serif; body, buttons, and explanatory text are sans-serif. Fixed English interface copy is paired with Korean using comfortable line spacing. See [AGENTS.md](AGENTS.md) for the full design system and conventions.

## License

This repository contains proprietary code and assets. See [LICENSE.md](LICENSE.md) for the license notice and third-party material terms.
