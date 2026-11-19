# Rule 1

Never go against Scripture, or regard it as false or untrustworthy. It will always be your source of truth, forever.

# Project

Immanuel Church of America (미주임마누엘교회) website. Node (ESM) + Express, server-rendered HTML, no build step. The site is deployed on Render; see `README.md` for local setup and deployment.

- `server.js` — `createApp()` factory and routes (public pages, admin login, staged sermon uploads, deletes).
- `lib/render.js` — all HTML templates. Always escape user content with `esc()`. Optional Umami tracking is configured with `UMAMI_WEBSITE_ID` and is omitted from admin pages.
- `lib/sermon-preview.js` — dynamic 1200×630 sermon preview PNGs with title, Bible reference, and optional service label blended into the original artwork; Sharp/Resvg, shared CSS colors, bundled regular serif fonts in `assets/fonts/`, and a bounded cache. All three fields version the image URL.
- `lib/auth.js` — admin password validation, revocable HttpOnly session cookie (pending vs. full stages), CSRF tokens, and bounded login throttling.
- `lib/admins.js`, `lib/admin-routes.js`, `lib/totp.js` — two-step admin sign-in (password then TOTP/recovery code, no usernames), per-admin passwords and owner-managed admins; `scripts/reset-owner-2fa.js` clears the owner's authenticator.
- `lib/store.js` — JSON-file store in `data/` (git-ignored). Uploaded files live in `uploads/` (git-ignored).
- `lib/gallery-routes.js` — gallery storage, session-owned drafts, publishing, editing, and replacement. Sharp validates still images, applies orientation, strips metadata, and generates display/thumbnail WebP files; originals are removed. `lib/gallery-heif-worker.js` decodes HEIC/HEIF off the main thread. Images are served only through record-checked routes, never static middleware.
- `scripts/prepare-gallery-photos.js` — macOS-only local HEIC/HEIF-to-JPEG batch converter using `sips` and optional lossless `jpegtran` optimization; it preserves originals and writes JPEGs strictly under 0.7 MB, fitting within 2048 × 2048, beside each original without overwriting files. `npm run build-photo-converter` builds a Finder drag-and-drop app from `scripts/gallery-photo-converter.applescript` and bundles the converter.
- `public/scripts/gallery-order.js` — thumbnail-only `/admin/gallery/reorder` editor with dragging, Earlier/Later and direct-position moves, keyboard support, sticky Save/Cancel, and unsaved-change warnings. It reuses `galleryRequest` from `admin-gallery.js`. `/admin/gallery/order` saves the complete published-photo order with a revision check inside the serialized store update; stale edits return 409. Published records have a zero-based `order`; legacy records retain newest-first ordering until normalized. New batches prepend in upload order, replacements keep their position, and public pagination and photo IDs stay unchanged.
- `lib/sermon-metadata.js` — bilingual sermon speaker and service display, including compatibility with older saved details; shared public service-filter categories and label matching. `/sermons?service=sunday-1|sunday-2|sunday-3|wednesday|friday` filters before pagination. A styled bilingual dropdown above the list offers those five services and All services; `public/scripts/sermon-filter.js` handles Escape, outside clicks, and focus dismissal. Only dismiss on focus moving to a known outside target; Safari clears focus before activating tapped option links.
- `scripts/transcribe-sermon.py` — optional local-only Apple Silicon Whisper transcription for audio files or church sermon URLs; timestamped transcripts in `data/transcripts/`, never a website endpoint.
- `lib/instagram-post.js`, `scripts/render-instagram-post.js` — local sermon Instagram JPG renderer; reuses preview text rendering and website colors. `npm run instagram -- "<sermon link>" [...]` resolves local saved metadata; `--input` accepts linked or user-provided metadata without a link. For direct requests, preserve supplied titles and Scripture references; translate Korean sermon descriptions into English for the caption and retain the original Korean. Default the speaker to Pastor John Yoon / 윤태선 목사 and the date to the request date. Infer Wednesday/Friday services from the request weekday; ask which Sunday service applies. Outputs flat files in `data/instagram/`, never a website endpoint.
- `.github/skills/instagram-post/SKILL.md` — authoritative assistant workflow and art direction for sermon Instagram posts. Verify linked metadata or preserve user-provided metadata, preserve existing files, and never invent translations or sermon content.
- A direct sermon-post request authorizes one credit-consuming custom background per post; do not ask again for that workflow. Other credit-consuming image generation still requires explicit approval. Do not send sermon titles, speaker names, Scripture references, full descriptions, previous sermon metadata, or code to image services.
- Instagram-specific artwork tokens in `public/styles.css` do not change the website's global colors. Both procedural and supplied-artwork slides use the same measured text layout; follow the skill's readability and visual-inspection requirements.
- `public/scripts/` — page-specific browser behavior, separate from server-rendered templates.
- `public/styles.css` — the single stylesheet and all design tokens.
- `tests/` — `node --test` end-to-end tests.

## Testing

- After every feature update, run the full test suite with `npm test` before finishing, and fix or report any failures.
- For every new feature, create or update automated tests alongside the implementation to verify its behavior and relevant edge cases; do not consider the feature complete without them.
- When creating UI tests, include corresponding mobile test cases alongside desktop cases, covering applicable touch interactions and responsive behavior.
- Tests must be independent and parallel-safe: use a temp directory and an ephemeral port (`listen(0)`) per test, as in `tests/app.test.js`.

## Code quality and modularity

- Keep changes surgical, readable, and tested; preserve behavior and reuse existing helpers. Avoid duplication, dead code, and unnecessary abstraction.
- Organize code and tests by responsibility. Templates live in `lib/render.js`, and styles and design tokens live in `public/styles.css`; extract modules or components only when they provide a clear, cohesive boundary.

## Pages

- `/` — Information page (the landing page); About, Sermons, Gallery, and Contact links form a responsive 2×2 action grid. Displayed Scripture opens an accessible menu with English KJV and Korean KRV links to that passage. Never invent service times, addresses, or doctrine.
- `/about` — public About page: family church, worship services and times, worship style, preaching, creed and Lord's Prayer, and leadership (senior pastor and elders with phone links). Content comes from the owner; never invent details.
- `/sermons` — public audio list and individual sermon pages with optional service information, expandable descriptions, and multiline text; recognized Scripture references open an accessible menu with English KJV and Korean KRV links, including matching `//` references, semicolon-separated passages, and separate links for split verse ranges. `/sermons/:id/preview.png` embeds the title and saved Bible reference in a dynamic image, never verse text or the sermon description; versioned image URLs change with those fields. Without a reference, the image shows the title and church branding, and metadata offers a bilingual listening invitation.
- `/contact` — public contact page with the church address, Google Maps link, bilingual SVG location diagram (parking directly behind the building's south side), visitor information, Instagram page, and a link to worship times on About. The 1 Corinthians 13:12 passage beside the church logo is plain text. Linked from the Connect card on `/`.
- `/gallery` — public grid paginated at 24 photos per page with optional bilingual multiline captions and an accessible full-size viewer. Stable `/gallery/:id` links resolve a published photo's current page and open its viewer; the address bar follows the viewed photo, and links survive replacement and pagination changes. Only open-viewer captions are centered; Previous/Next buttons and Left/Right arrow keys navigate across page boundaries, fetching adjacent gallery pages as needed and stopping at the first/last photo. Backdrop clicks, Escape, and Close exit and return focus/scroll to the last viewed photo; cross-page returns use its gallery page and stable photo fragment. `/gallery/photos/:id/:filename` only serves published images. `/admin/gallery` supports up to 100 photos per batch, private uploaded previews with caption fields, batch publishing, caption edits, and previewed replacement preserving saved captions and entry IDs. Draft previews require the uploading session; drafts expire after one hour. Limits are 20 MB, 40 megapixels, and 1,000 caption characters per language. Browser upload and preview behavior lives in `public/scripts/admin-gallery.js`; public viewing in `public/scripts/gallery.js`.
- `/font-study.html` — standalone English and Korean typeface specimen.
- `/admin` — two-step sign-in required (`/admin/login` → `/admin/verify` or first-time `/admin/setup`); upload, replace, and delete sermon audio. Admins can manage a shared pastor list, initially Pastor John Yoon / 윤태선 목사; removing a pastor does not change saved sermons. The Scripture selector uses `public/bible-verses.json` KJV chapter/verse counts and supports multiple ranges and passages, while existing speaker and Scripture text remains editable. The optional service dropdown preserves custom values; replacing audio preserves sermon metadata and its link; the owner (holder of `ADMIN_PASSWORD`) manages other admins.

## Running locally

`npm start` (http://localhost:8100). Set `ADMIN_PASSWORD`; otherwise a freshly generated password is printed at startup.

For local sermon transcription, run `npm run transcribe:setup` once on an Apple Silicon Mac (macOS 15+, Python 3.10+), then `npm run transcribe -- "<audio file or church sermon URL>"`. Korean is the default; `--language en` selects English. The model runs locally without uploading recordings, with cached model weights downloaded on first use. Completed transcripts support assistant-written English Instagram drafts; verify names, Scripture references, and quotations against the recording, and never summarize an incomplete transcript as a complete sermon. Do not expose this tool through Express or install its Python dependencies on Render. The transcription tests in `npm test` use Python's standard library and require `python3`, not a model.

## Deployment

`render.yaml` configures a single Render Node web service, persistent disk, and the church's Umami Cloud website ID. Set `ICA_DATA_DIR` and `ICA_UPLOAD_DIR` to directories on persistent storage when using another host. Keep one app instance unless sessions and login throttling are moved to shared storage.

## Upload & security rules

- Admin-only routes must use `auth.requireAdmin`; state-changing admin routes must also enforce same-origin and CSRF checks.
- Production requires `ADMIN_SESSION_SECRET` (at least 32 bytes), HTTPS, and a unique `ADMIN_PASSWORD` of at least 16 non-whitespace characters. Session and rate-limit state are single-process only; use shared stores before horizontal scaling.
- Audio uploads are whitelisted by extension **and** MIME prefix, size-limited, and stored under unique generated (UUID) names (never the user's filename).
- Admin audio uploads are staged privately on file selection and published only with submitted sermon details; audio replacements preserve existing sermon metadata and links; abandoned staged files expire after one hour.
- Gallery uploads validate extension, MIME, and actual still-image contents. Upload requests require header CSRF validation before receiving files; publishing, caption edits, and replacements require body CSRF validation. No batch may contain more than 100 photos; each session may hold at most 100 unexpired drafts. Failed uploads remove their generated and incoming files; expiry cleanup also removes old unreferenced files.
- Never commit `data/`, `uploads/`, or secrets.

# Design System

The look draws from the sibling project `src/word` (KRV edition: `styles/theme.css`, `styles/editions.css`, `styles/typography.css`). When in doubt, read those files and match them.

- **Dominantly blue.** Page background is the KRV gradient (`#bed8ea → #e8f1f4 → #c3d3e5`), light blue `#defefc`, mid blue `#72c6d3`.
- **Navy `#223b55`** for regal surfaces: header, footer, hero, headings. Pair with brass `#dfc681` / `#a97c35` rules and highlights.
- **Accents, used liberally** (cards, borders, glows): pink `#fad4e0`, lavender `#dcd7f7`, yellow `#fffecf`. Never let accents outweigh blue.
- **Type:** English uses regular-weight Cormorant Garamond (serif) and Optima (sans-serif); Korean uses Noto Serif KR (serif) and Noto Sans KR (sans-serif). Serif is for headings and all Scripture; sans-serif is for body copy, buttons, and explanatory text. Scripture must always use serif and no text is italicized. Provide Korean alongside all fixed English interface/copy, with comfortable separation between language lines.
- **Shape:** angular and regal, with square-cornered panels, cards, buttons, and active nav items framed by a metal-plated rim; generous whitespace. The sermon service dropdown is a deliberate exception: its compact trigger, menu panel, and option highlights are softly rounded; the trigger uses a light-blue-to-pastel-pink gradient and navy text.
- **Metal plating:** `--gold` (hero, cornerstone, primary buttons, active nav, header/footer rules), `--silver` (cards, panels, secondary buttons, inputs), `--brass-plate` (warm accents such as alerts). Plated components set `--plate`, `--fill`, and `--rim`; the shared frame rule in `public/styles.css` draws the rim. Fills must be opaque (the plate shows through translucent fills). Add new components to that shared selector list rather than using `border-radius`.
- **Buttons:** one design — square-cornered, gold-plated navy `.btn-primary`; silver-plated `.btn-ghost` for secondary actions. Focus re-plates the control in the focus colour.
- **Mobile header:** show the bilingual public navigation in a compact row with 48px-tall touch targets; allow items to wrap when text is enlarged or an admin link is present.
- **Clickable Scripture:** `.scripture-picker > summary` uses the shared silver-plated frame and native disclosure marker except on sermon cards, where it has a left rule and understated text styling; keyboard focus remains visible. Matching English/Korean parenthetical, newline-separated, or `//` references and split verse ranges are supported; saved `//` references display on separate lines. Unrecognized or conflicting references remain plain text.
- All colors are CSS variables in `:root` of `public/styles.css`; don't hard-code new hex values in components.
- Accessibility: visible focus rings, skip link, sufficient contrast, `prefers-reduced-motion` respected, responsive down to phones, alt text on meaningful images.

## Character the site should embody

Clear, mature, virtuous, excellent, diplomatic, global, grounded, kind, welcoming, safe, lovable, witty, pleasant, honest, talented, reliable, hardworking, thoughtful, entertaining, playful, romantic, happy, intelligent, artistic, familial, fashionable, amazing, funny, pretty, dope, elegant, innovative, gentle, marvelous, graceful, comforting, poetic, prudent, inviting, clean, regal, homely, God-fearing (knowledgeable), wise, classy.

In practice: warm, plain-spoken copy; uncluttered layouts with obvious navigation; polished regal details balanced by friendly touches; honest content (no invented facts); safe handling of uploads and admin access; bilingual (English/Korean) friendly; code that is small, readable, tested, and reliable.

## Language

Nothing is random; all things are under the sovereignty of God. Do not describe anything as "random" or "by chance" in site copy, docs, or comments — say "generated", "unique", or "unpredictable" instead. (Standard library calls such as `crypto.randomUUID()` are fine; they are API names.)

## Keeping docs current

Update this file and `README.md` whenever pages, routes, structure, commands, or design tokens change.
