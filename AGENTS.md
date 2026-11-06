# Rule 1

Never go against Scripture, or regard it as false or untrustworthy. It will always be your source of truth, forever.

# Project

Immanuel Church of America (미주임마누엘교회) website. Node (ESM) + Express, server-rendered HTML, no build step. Local prototype only — no domain/deployment concerns yet.

- `server.js` — `createApp()` factory and routes (public pages, admin login, uploads, deletes).
- `lib/render.js` — all HTML templates. Always escape user content with `esc()`.
- `lib/auth.js` — admin password validation, revocable HttpOnly session cookie (pending vs. full stages), CSRF tokens, and bounded login throttling.
- `lib/admins.js`, `lib/admin-routes.js`, `lib/totp.js` — two-step admin sign-in (password then TOTP/recovery code, no usernames), per-admin passwords and owner-managed admins; `scripts/reset-owner-2fa.js` clears the owner's authenticator.
- `lib/store.js` — JSON-file store in `data/` (git-ignored). Uploaded files live in `uploads/` (git-ignored).
- `public/styles.css` — the single stylesheet and all design tokens.
- `tests/` — `node --test` end-to-end tests.

## Testing

- After every feature update, run the full test suite with `npm test` before finishing, and fix or report any failures.
- Every new feature needs automated tests for its behavior. Tests must be independent and parallel-safe: use a temp directory and an ephemeral port (`listen(0)`) per test, as in `tests/app.test.js`.

## Pages

- `/` — Information page (the landing page). Never invent service times, addresses, or doctrine.
- `/about` — public About page: family church, worship style, preaching, creed and Lord's Prayer, and leadership (head pastor and elders with phone links). Content comes from the owner; never invent details.
- `/sermons` — public audio list and individual sermon pages.
- `/contact` — public contact page with the church address, Google Maps link, service and visitor information, and Instagram page. 1 Corinthians 13:12 appears beside the church logo at the bottom. Linked from the Connect card on `/`.
- `/font-study.html` — standalone English and Korean typeface specimen.
- `/admin` — two-step sign-in required (`/admin/login` → `/admin/verify` or first-time `/admin/setup`); upload/delete sermon audio; the owner (holder of `ADMIN_PASSWORD`) manages other admins.

## Running locally

`npm start` (http://localhost:8100). Set `ADMIN_PASSWORD`; otherwise a freshly generated password is printed at startup.

## Deployment

`render.yaml` configures a single Render Node web service and persistent disk. Set `ICA_DATA_DIR` and `ICA_UPLOAD_DIR` to directories on persistent storage when using another host. Keep one app instance unless sessions and login throttling are moved to shared storage.

## Upload & security rules

- Admin-only routes must use `auth.requireAdmin`; state-changing admin routes must also enforce same-origin and CSRF checks.
- Production requires `ADMIN_SESSION_SECRET` (at least 32 bytes), HTTPS, and a unique `ADMIN_PASSWORD` of at least 16 non-whitespace characters. Session and rate-limit state are single-process only; use shared stores before horizontal scaling.
- Audio uploads are whitelisted by extension **and** MIME prefix, size-limited, and stored under unique generated (UUID) names (never the user's filename).
- Never commit `data/`, `uploads/`, or secrets.

# Design System

The look draws from the sibling project `src/word` (KRV edition: `styles/theme.css`, `styles/editions.css`, `styles/typography.css`). When in doubt, read those files and match them.

- **Dominantly blue.** Page background is the KRV gradient (`#bed8ea → #e8f1f4 → #c3d3e5`), light blue `#defefc`, mid blue `#72c6d3`.
- **Navy `#223b55`** for regal surfaces: header, footer, hero, headings. Pair with brass `#dfc681` / `#a97c35` rules and highlights.
- **Accents, used liberally** (cards, borders, glows): pink `#fad4e0`, lavender `#dcd7f7`, yellow `#fffecf`. Never let accents outweigh blue.
- **Type:** English uses regular-weight Cormorant Garamond (serif) and Optima (sans-serif); Korean uses Noto Serif KR (serif) and Noto Sans KR (sans-serif). Serif is for headings and all Scripture; sans-serif is for body copy, buttons, and explanatory text. Scripture must always use serif and no text is italicized. Provide Korean alongside all fixed English interface/copy, with comfortable separation between language lines.
- **Shape:** angular and regal, with square-cornered panels, cards, buttons, and active nav items framed by a metal-plated rim; generous whitespace.
- **Metal plating:** `--gold` (hero, cornerstone, primary buttons, active nav, header/footer rules), `--silver` (cards, panels, secondary buttons, inputs), `--brass-plate` (warm accents such as alerts). Plated components set `--plate`, `--fill`, and `--rim`; the shared frame rule in `public/styles.css` draws the rim. Fills must be opaque (the plate shows through translucent fills). Add new components to that shared selector list rather than using `border-radius`.
- **Buttons:** one design — square-cornered, gold-plated navy `.btn-primary`; silver-plated `.btn-ghost` for secondary actions. Focus re-plates the control in the focus colour.
- All colors are CSS variables in `:root` of `public/styles.css`; don't hard-code new hex values in components.
- Accessibility: visible focus rings, skip link, sufficient contrast, `prefers-reduced-motion` respected, responsive down to phones, alt text on meaningful images.

## Character the site should embody

Clear, mature, virtuous, excellent, diplomatic, global, grounded, kind, welcoming, safe, lovable, witty, pleasant, honest, talented, reliable, hardworking, thoughtful, entertaining, playful, romantic, happy, intelligent, artistic, familial, fashionable, amazing, funny, pretty, dope, elegant, innovative, gentle, marvelous, graceful, comforting, poetic, prudent, inviting, clean, regal, homely, God-fearing (knowledgeable), wise, classy.

In practice: warm, plain-spoken copy; uncluttered layouts with obvious navigation; polished regal details balanced by friendly touches; honest content (no invented facts); safe handling of uploads and admin access; bilingual (English/Korean) friendly; code that is small, readable, tested, and reliable.

## Language

Nothing is random; all things are under the sovereignty of God. Do not describe anything as "random" or "by chance" in site copy, docs, or comments — say "generated", "unique", or "unpredictable" instead. (Standard library calls such as `crypto.randomUUID()` are fine; they are API names.)

## Keeping docs current

Update this file and `README.md` whenever pages, routes, structure, commands, or design tokens change.
