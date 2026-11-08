import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { Resvg } from '@resvg/resvg-js';
import { esc } from './render.js';
import { formatScriptureReference } from './scripture-links.js';

const asset = (name) => fileURLToPath(new URL(name, import.meta.url));

export function sermonPreviewVersion(sermon) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(['6', sermon.title, sermon.scripture || '', sermon.service || '']))
    .digest('hex').slice(0, 20);
}

function wrapLines(text, size, width) {
  const lines = [];
  const limit = Math.floor(width / size);
  const weight = (value) => [...value].reduce((total, c) => total + (/[^\u0000-\u00FF]/u.test(c) ? 1 : 0.6), 0);
  for (const paragraph of text.replaceAll('\r\n', '\n').split('\n')) {
    let line = '';
    let units = 0;
    for (const word of paragraph.split(/(\s+)/)) {
      if (line && units + weight(word) > limit) {
        lines.push(line.trimEnd());
        line = '';
        units = 0;
      }
      for (const c of word) {
        if (!line && /\s/u.test(c)) continue;
        if (units + weight(c) > limit) {
          lines.push(line);
          line = '';
          units = 0;
        }
        line += c;
        units += weight(c);
      }
    }
    lines.push(line);
  }
  return lines;
}

function balancedLines(text, size, width) {
  return text.replaceAll('\r\n', '\n').split('\n').flatMap((paragraph) => {
    const words = paragraph.trim().split(/\s+/u);
    const units = (word) => [...word].reduce((sum, c) => sum + (/[^\u0000-\u00FF]/u.test(c) ? 1 : .6), 0);
    const limit = Math.floor(width / size);
    if (words.some((word) => units(word) > limit)) return wrapLines(paragraph, size, width);
    const cost = Array(words.length + 1).fill(Infinity);
    const next = Array(words.length);
    cost[words.length] = 0;
    for (let start = words.length - 1; start >= 0; start -= 1) {
      let length = 0;
      for (let end = start; end < words.length; end += 1) {
        length += units(words[end]) + (end > start ? .6 : 0);
        if (length > limit) break;
        const score = (limit - length) ** 2 + cost[end + 1];
        if (score < cost[start]) { cost[start] = score; next[start] = end + 1; }
      }
    }
    const lines = [];
    for (let i = 0; i < words.length; i = next[i]) lines.push(words.slice(i, next[i]).join(' '));
    return lines;
  });
}

export async function textLayer(text, size, width, height, color,
  { minRenderedSize = 0, bilingualFonts = false, balanced = false, lineHeight = 1.3, strokeWidth = 0 } = {}) {
  const korean = /[\uAC00-\uD7AF]/u.test(text);
  const font = bilingualFonts ? 'Cormorant Garamond, Noto Serif CJK KR'
    : korean ? 'Noto Serif CJK KR' : 'Cormorant Garamond';
  const wrap = balanced ? balancedLines : wrapLines;
  let lines = wrap(text, size, width);
  while (size > 12 && lines.length * size * lineHeight > height) {
    size -= 2;
    lines = wrap(text, size, width);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="2000">
    <text fill="${color}" stroke="${color}" stroke-width="${strokeWidth}" paint-order="stroke fill"
      font-family="${font}" font-size="${size}" font-weight="400" text-anchor="middle">
    ${lines.map((line, i) => `<tspan x="1000" y="${size + i * size * lineHeight}">${esc(line)}</tspan>`).join('')}
    </text></svg>`;
  const renderer = new Resvg(svg, {
    font: {
      fontFiles: [asset('../assets/fonts/CormorantGaramond.ttf'), asset('../assets/fonts/NotoSerifKR.otf')],
      loadSystemFonts: false, defaultFontFamily: font,
    },
  });
  const bounds = renderer.getBBox();
  if (!bounds) throw new Error('Could not render sermon preview text.');
  bounds.x -= 2;
  bounds.y -= 2;
  bounds.width += 4;
  bounds.height += 4;
  const scale = Math.min(1, width / bounds.width, height / bounds.height);
  if (size * scale < minRenderedSize) {
    throw new Error('Sermon text is too dense to fit legibly. Shorten it or remove unnecessary line breaks.');
  }
  renderer.cropByBBox(bounds);
  return sharp(renderer.render().asPng()).resize({ width, height, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
}

export function createSermonPreviewRenderer() {
  const cache = new Map();

  async function render(sermon) {
    const css = await fs.readFile(asset('../public/styles.css'), 'utf8');
    const color = (token) => {
      const value = css.match(new RegExp(`--${token}:\\s*(#[a-f\\d]{6})`, 'i'))?.[1];
      if (!value) throw new Error(`Missing preview design token: ${token}`);
      return value;
    };
    const gold = color('brass-soft');
    const paper = color('paper');
    const mask = Buffer.from(`<svg width="720" height="630" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="fade"><stop offset="0.86" stop-color="white"/>
      <stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient></defs>
      <rect width="720" height="630" fill="url(#fade)"/>
    </svg>`);
    // Reuse the artwork's unlettered blue texture and feather it over the original lettering.
    const texture = await sharp(asset('../public/link-preview.png'))
      .extract({ left: 0, top: 0, width: 580, height: 145 })
      .resize(720, 630, { fit: 'fill' }).ensureAlpha()
      .composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
    const ornament = Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="gold"><stop stop-color="${gold}" stop-opacity="0"/>
      <stop offset=".5" stop-color="${gold}"/><stop offset="1" stop-color="${gold}" stop-opacity="0"/></linearGradient></defs>
      <path d="M120 188L330 185L540 188L330 191Z" fill="url(#gold)"/>
    </svg>`);
    const centeredText = async (text, size, height, top, fill) => {
      const input = await textLayer(text, size, 530, height, fill);
      const metadata = await sharp(input).metadata();
      return { input, left: Math.round((660 - metadata.width) / 2), top };
    };
    const layers = [
      { input: texture, left: 0, top: 0 },
      { input: ornament, left: 0, top: 0 },
      await centeredText('Immanuel Church\nof America', 36, 85, 58, paper),
      await centeredText('미주 임마누엘 교회', 25, 36, 143, paper),
      await centeredText(sermon.title, 68, 155, 228, paper),
    ];
    if (sermon.scripture) {
      layers.push(await centeredText(formatScriptureReference(sermon.scripture), 36, 80, 410, gold));
    }
    if (sermon.service) {
      layers.push(await centeredText(sermon.service, 30, 65, 523, paper));
    }
    return sharp(asset('../public/link-preview.png')).composite(layers).png().toBuffer();
  }

  return (sermon) => {
    const key = sermonPreviewVersion(sermon);
    if (!cache.has(key)) {
      const pending = render(sermon).catch((error) => {
        cache.delete(key);
        throw error;
      });
      cache.set(key, pending);
      if (cache.size > 32) cache.delete(cache.keys().next().value);
    }
    return cache.get(key);
  };
}
