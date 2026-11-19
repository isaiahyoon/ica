---
name: instagram-post
description: "Create Instagram sermon update posts from sermon links or supplied metadata. Use when asked to generate Instagram slides, sermon announcement images, or hashtags for Immanuel Church of America."
---

# Instagram sermon posts

Create exactly one 2160×2700 portrait JPG per supplied sermon link or direct metadata entry, in the supplied order. For link-free requests, the user supplies sermon metadata; no sermon link is required. Return the image, caption, and exactly five hashtags per sermon. No carousel, added verse quotation, or invented sermon summary.

Preserve the saved or user-provided Sermon Overview (`description`) and its paragraph breaks. Translate Korean description text faithfully into English for the caption, then include the Korean original after a blank line. Keep any supplied English description verbatim instead of translating it again. Do not paraphrase, add headings, or infer teachings. Translate only the description; use titles and Scripture references exactly as supplied or saved. The caption has English first, then Korean separated by a blank line, followed by this bilingual invitation:

Listen to the sermon via the link in our bio.
프로필 링크를 통해 설교를 들으실 수 있습니다.

Place the caption above the hashtags. Do not translate or otherwise change title or Scripture-reference text unless the user supplies both language versions. Do not add Scripture verse text. If the overview is missing, ask the user for it before generation.

Use `Since 1994 · 1994년부터` in the slide footer, not "Listen to the sermon." Match the church founding year displayed on the website. Check fixed church facts against existing site content and flag discrepancies rather than reproducing them.

1. `#ImmanuelChurchOfAmerica`
2. `#미주임마누엘교회`
3. Three distinct tags relevant to the saved sermon title and/or Scripture reference. Do not infer sermon teachings from a title or research hashtag popularity.

## Procedure

A direct request to generate a post authorizes the local workflow and one credit-consuming custom background per post. Do not ask whether the post already exists or request generic confirmation; the renderer preserves existing files and adds a suffix for repeats. Ask when required sermon metadata is missing. Other credit-consuming image generation requires explicit approval.

### Sermon-informed artwork

For each supplied link, read the linked page and verify its saved Sermon Overview (`description`) against the local snapshot. For direct metadata entries, use the user's supplied text as authoritative. If the overview is missing, stop and ask for it. Keep the overview verbatim for the caption, then privately distill its explicit themes, setting, and imagery into a short visual concept for that sermon. Let both the title's explicit imagery and the description guide the background's subject and atmosphere; every background must visibly incorporate a title-derived motif (for example, soldier-inspired imagery for a soldier-themed title). Keep that motif symbolic and faithful; do not invent doctrine, depict a specific biblical event unless the overview clearly calls for it, or add lettering to the artwork.

Review earlier generated slides in `data/instagram/` and their matching saved sermon descriptions in `data/sermons.json` for continuity and to avoid repeating recent subjects, metaphors, and compositions. Use them only as local inspiration; do not combine previous sermon details with the current one or send previous descriptions or metadata to an image service. Keep the new visual concept grounded in the current overview.

Use the bundled reference images in `.github/skills/instagram-post/references/` as visual guidance: `navy-covering.jpg` is the primary reference for the deep-blue folds, depth, and gold-edged silk; `joseon-silk-blue.png` and `pastel-silk.png` inform the flowing translucent silk, highlights, and pastel accents. When calling the image tool, include all three as visual references. Keep the final artwork blue-led and dark behind the centered text; the light background in `pastel-silk.png` is not a target. Treat all three as inspiration, not images to copy.

Image-service generation can consume credits. The owner has granted standing approval for one custom background per directly requested sermon post; do not ask for approval again for this Instagram workflow. This approval does not cover unrelated image generation. Create one distinct, text-free background per sermon using the short visual concept and bundled references. Do not send the full overview, sermon title, speaker names, Scripture reference, code, or previous sermon metadata to the image service. Then add the generated local absolute path as `backgroundPath` in that sermon’s verified JSON input; the local renderer places all exact text.

Different sermons must have visibly different designs, not subtle recolors of one ribbon template. The renderer rotates four composition families (flowing silk, vaulted arches, angular corner fans, oval medallions) using existing image count and batch order, with seeded variations; tests compare the families with identical seeds. Compare the full set side by side, especially when a family repeats in larger batches; regenerate a near-identical design before delivery.

The owner's quality bar is "super dope," luxurious artwork inspired by the navy-covering image: textured, sculptural blue folds; luminous translucent interwoven pastel silk; convincing highlights, shadows, and depth; metallic-gold edges and specular glints with restrained gold dust. Gold belongs inside the artwork, not just around its frame. Flat triangles, simple concentric bands, and generic pastel borders do not meet this bar. The current procedural composition families do not by themselves establish that this material quality has been achieved; inspect the result honestly and improve the rendering approach rather than delivering another flat template.

Every Instagram slide should embody: multicultural, clear, mature, virtuous, excellent, diplomatic, global, grounded, kind, welcoming, safe, lovable, witty, pleasant, honest, talented, reliable, hardworking, hot, thoughtful, entertaining, playful, romantic, happy, intelligent, artistic, familial, fashionable, amazing, funny, pretty, dope, elegant, innovative, gentle, marvelous, graceful, comforting, poetic, prudent, inviting, clean, regal, homely, God-fearing (knowledgeable), wise, and classy. Express these qualities through distinct, polished compositions, warm bilingual presentation, and thoughtful artistic details; never sacrifice legibility, truthful sermon content, reverence, or mature church identity for novelty.

Typography must be graceful and airy: balanced title lines without orphan words, smaller Korean companion text, deliberate language gaps, and spacing between Scripture and speaker groups based on measured rendered heights rather than oversized fixed boxes. Leave at least 60 logical pixels between title, Scripture, and speaker sections, greater than language gaps. Omit the redundant speaker label. Place an understated bilingual founding-year footer at the bottom; it may overlap ribbons. Inspect both short and long titles; keep main metadata clear of luminous folds.

Keep the lettering solemn, serious, and stately, befitting the Gospel. All text groups must share the canvas centerline, never individually offset to accommodate decoration. Use restrained ivory (`--paper`) consistently for every text row; reserve pastel and metallic accents for the artwork. Preserve a dark, clear centered text area and inspect alignment and contrast in every finished slide.

Show the saved date for linked sermons. For link-free requests, use the request's calendar date as the sermon date, not the machine's generation date. Show the date in English and Korean between Scripture and speaker. For link-free requests, default the speaker to `Pastor John Yoon` / `윤태선 목사` unless the user specifies otherwise.

Prioritize older viewers: use the same measured layout for procedural and supplied artwork, with at least 32 logical pixels (64 exported pixels) for secondary sermon metadata, larger titles, lightly reinforced serif strokes, and comfortable line/language spacing. The understated bottom footer is the exception, using 26/24 logical pixels. Do not shrink dense metadata below its minimum. Inspect each finished image at phone size; full-resolution readability alone is insufficient.

Follow "Sermon-informed artwork" above to generate one distinct text-free background per sermon with a calm dark central text area, and add its local absolute path as `backgroundPath` in that input entry. The renderer overlays exact bilingual metadata locally, without procedural decorations. The local renderer itself does not call an image service.

1. Read the repository's `AGENTS.md` design rules. For linked sermons, verify the exact title, speaker names, Scripture reference, saved sermon date, and service label against the linked page. For direct metadata, retain the supplied title, Scripture reference, and Korean description exactly; translate Korean description text into English for the caption while retaining the Korean original. Default the speaker to `Pastor John Yoon` / `윤태선 목사`; set the date to the calendar date of the request. Infer `Wednesday Service` / `수요예배` or `Friday Service` / `금요예배` when the request date falls on Wednesday or Friday. If it falls on Sunday, ask which Sunday service (1st, 2nd, or 3rd); on other days, omit service unless the user provides it. The service label replaces the generic "Sermon" heading; omit it when no service is specified. Do not invent references, names, or sermon content.
2. The renderer can resolve church and localhost sermon URLs against the local `data/sermons.json` (or `ICA_DATA_DIR`). This is a local snapshot, not a live fetch: compare it with the supplied page. For link-free input, use the user-provided metadata. Never read or expose `admins.json` or credentials.
3. Prepare a temporary JSON array in the session workspace, with one entry per requested sermon:
   ```json
   [{
     "url": "<optional sermon link>",
     "title": "<exact saved or user-provided title>",
     "speakerEn": "<optional saved or user-provided English name>",
     "speakerKo": "<optional saved or user-provided Korean name>",
     "scripture": "<exact saved or user-provided reference>",
     "service": "<optional saved or user-provided service label>",
     "date": "<optional saved or user-provided YYYY-MM-DD date>",
     "description": "<English description or faithful translation, blank line, then exact Korean original>",
     "hashtags": ["<relevant tag>", "<relevant tag>", "<relevant tag>"]
   }]
   ```
   One speaker language is supported; legacy `speaker` text is also supported. Apply the link-free speaker, date, and service defaults above. Translate the Korean description for the caption, retaining the exact Korean source. Keep title and Scripture text as supplied. `hashtags` may be omitted or contain only the three discretionary tags, without spaces; the renderer prepends the two church tags.
4. From the repository root run `npm run instagram -- --input "<temporary JSON>"`. The local command uses bundled fonts, Sharp/Resvg, and website design tokens; it does not upload data, fetch recordings, call an image service, or post to Instagram. Save images directly in `data/instagram/`, with no subfolders, as `sermons-[saved YYYY-MM-DD date or undated]-[service slug].jpg`, for example `sermons-2026-11-08-sunday-2nd-service.jpg`. Include a date only when verified or provided; never substitute the generation date. The service slug uses saved English when available, otherwise Korean, lowercased with hyphens. Missing service uses `unspecified-service`. Existing filenames are preserved; repeats receive `-2`, `-3`, etc. `--output "<folder>"` changes the output root.
5. Inspect every JPG at both full resolution and phone-sized scale using local image/browser tools. Check the provided title and Scripture and any supplied service, date, or speaker for legibility, completeness, spelling, and Korean glyphs. Follow the owner's navy-covering reference: deep midnight/royal blue, not greenish teal, with visibly generous yellow, purple/lavender, and pink glows and flowing, layered gold-edged silk ribbons. Keep blue dominant and text on dark blue. Each image gets unique gradient directions, stops, accent placement, and ribbon curves; inspect the set and regenerate if two look too similar.
6. Remove the temporary input JSON. Deliver the JPG links and each sermon's caption above its five hashtags. Use the command's `caption` output without rewriting the overview. Register the JPGs as artifacts when supported. No supporting deliverables unless asked.

For a quick render using the local snapshot and three generic sermon/Scripture tags:

```sh
npm run instagram -- "<sermon link>" "<another sermon link>"
```

If a link is absent from the local store, use verified page metadata with `--input`; link-free user-provided metadata is also supported. Never silently substitute another sermon or invent missing text.
