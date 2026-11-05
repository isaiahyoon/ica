# Immanuel Church of America (미주임마누엘교회)

> “Immanuel, which being interpreted is, God with us.” — Matthew 1:23

Church website prototype.

## Features

- **Information page** (landing page, `/`) — welcome and overview; About details to come.
- **Sermons** (`/sermons`) — public audio player list.
- **Gallery** (`/gallery`) — public photo gallery.
- **Admin** (`/admin`) — password-protected upload and removal of sermon audio and photos.
- **Font study** (`/font-study.html`) — English and Korean typeface specimens with a live four-font serif/sans pairing preview.

## Run locally

Requires Node 20+.

```sh
npm install
ADMIN_PASSWORD='choose-a-password' npm start   # http://localhost:8100
```

If `ADMIN_PASSWORD` is not set, a freshly generated password is printed in the terminal on each start. Sign in at `/admin/login`.

Other commands: `npm run dev` (auto-restart), `npm test`. Set `PORT` to change the port.

## Data

Sermon and photo metadata is saved in `data/` and files in `uploads/` (both git-ignored). Delete those folders to reset.

## Design

Dominantly blue (KRV palette from `src/word`), navy and brass for a regal feel, with pink, lavender, and yellow accents. English uses regular-weight Cormorant Garamond and Optima; Korean uses Noto Serif KR and Noto Sans KR. Headings and Scripture are serif; body, buttons, and explanatory text are sans-serif. Fixed English interface copy is paired with Korean using comfortable line spacing. See [AGENTS.md](AGENTS.md) for the full design system and conventions.

## License

This repository contains proprietary code and assets. See [LICENSE.md](LICENSE.md) for the license notice and third-party material terms.
