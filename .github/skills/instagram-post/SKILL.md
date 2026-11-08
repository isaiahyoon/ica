---
name: instagram-post
description: "Create Instagram sermon update posts from church sermon links. Use when asked to generate Instagram slides, sermon announcement images, or hashtags for Immanuel Church of America."
---

# Instagram sermon posts

Create exactly one 2160×2700 portrait JPG per supplied sermon link, in the supplied order. Return the image, caption, and exactly five hashtags per sermon. No carousel, added verse quotation, or invented sermon summary.

The caption is the saved Sermon Overview (`description`) verbatim, English then Korean separated by a blank line, followed by this bilingual invitation:

Listen to the sermon via the link in our bio.
프로필 링크를 통해 설교를 들으실 수 있습니다.

Place the caption above the hashtags. Preserve the overview's wording and internal paragraph breaks; do not paraphrase, add headings, translate missing text, or infer teachings. If the overview is missing, ask the user for it before generation.

Use `Since 1996 · 1996년부터` in the slide footer, not "Listen to the sermon." This is the owner's requested Instagram text; do not change the website header's year.

1. `#ImmanuelChurchOfAmerica`
2. `#미주임마누엘교회`
3. Three distinct tags relevant to the saved sermon title and/or Scripture reference. Do not infer sermon teachings from a title or research hashtag popularity.

## Procedure

1. Read the repository's `AGENTS.md` design rules and the linked sermon pages. Verify the exact title, speaker names, Scripture reference, and service label. The service label replaces the generic "Sermon" heading; omit that heading when no service is specified. Preserve provided English/Korean text; do not invent translations, references, or names. If any required field is missing, ask the user for it before rendering.
2. The renderer can resolve church and localhost sermon URLs against the local `data/sermons.json` (or `ICA_DATA_DIR`). This is a local snapshot, not a live fetch: compare it with the supplied page. Never read or expose `admins.json` or credentials.
3. Prepare a temporary JSON array in the session workspace, with one entry per link:
   ```json
   [{
     "url": "https://immanuelchurchofamerica.org/sermons/eb590a2a-e48d-4160-b335-cdff6b3352cc",
     "title": "<exact saved title>",
     "speakerEn": "<saved English name, if present>",
     "speakerKo": "<saved Korean name, if present>",
     "scripture": "<exact saved reference>",
     "service": "<saved service label, if present>",
     "date": "2026-11-08",
     "description": "<exact saved Sermon Overview, including both languages if present>",
     "hashtags": ["<relevant tag>", "<relevant tag>", "<relevant tag>"]
   }]
   ```
   Only one speaker language is required. Legacy `speaker` text is also supported. `hashtags` contains only the three discretionary tags, without spaces; the renderer prepends the two church tags.
4. From the repository root run `npm run instagram -- --input "<temporary JSON>"`. The local command uses bundled fonts, Sharp/Resvg, and website design tokens; it does not upload data, fetch recordings, call an image service, or post to Instagram. Save images directly in `data/instagram/`, with no subfolders, as `sermons-[saved YYYY-MM-DD date]-[service slug].jpg`, for example `sermons-2026-11-08-sunday-2nd-service.jpg`. Include the verified sermon date in the input; never substitute the generation date. The service slug uses saved English when available, otherwise Korean, lowercased with hyphens. Missing date/service uses `undated` / `unspecified-service`. Existing filenames are preserved; repeats receive `-2`, `-3`, etc. `--output "<folder>"` changes the output root.
5. Inspect every JPG at both full resolution and phone-sized scale using local image/browser tools. Check that all three required fields and the saved service label are legible, complete, correctly spelled, and separated, including Korean glyphs. Follow the owner's navy-covering reference: deep midnight/royal blue, not greenish teal, with visibly generous yellow, purple/lavender, and pink glows and flowing, layered gold-edged silk ribbons. Keep blue dominant and text on dark blue. Each image gets unique gradient directions, stops, accent placement, and ribbon curves; inspect the set and regenerate if two look too similar.
6. Remove the temporary input JSON. Deliver the JPG links and each sermon's caption above its five hashtags. Use the command's `caption` output without rewriting the overview. Register the JPGs as artifacts when supported. No supporting deliverables unless asked.

For a quick render using the local snapshot and three generic sermon/Scripture tags:

```sh
npm run instagram -- "<sermon link>" "<another sermon link>"
```

If a link is absent from the local store, use verified page metadata with `--input`; never silently substitute another sermon.
