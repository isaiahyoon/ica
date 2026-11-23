import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { textLayer } from './sermon-preview.js';
import { formatDate } from './render.js';

const cssPath = fileURLToPath(new URL('../public/styles.css', import.meta.url));

function details(column, language) {
  const korean = language === 'ko';
  return {
    title: korean ? column.titleKo || column.titleEn : column.titleEn || column.titleKo,
    author: korean ? column.speakerKo || column.speakerEn : column.speakerEn || column.speakerKo,
    date: column.date ? formatDate(column.date, korean ? 'ko-KR' : 'en-US') : '',
  };
}

export function columnPreviewVersion(column, language) {
  return crypto.createHash('sha256').update(JSON.stringify(['1', language, details(column, language)])).digest('hex').slice(0, 20);
}

export function createColumnPreviewRenderer() {
  const cache = new Map();
  async function render(column, language) {
    const css = await fs.readFile(cssPath, 'utf8');
    const color = (name) => {
      const value = css.match(new RegExp(`--${name}:\\s*(#[a-f\\d]{6})`, 'i'))?.[1];
      if (!value) throw new Error(`Missing preview design token: ${name}`);
      return value;
    };
    const ink = color('navy');
    const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
      <defs><linearGradient id="background" x2="1" y2="1"><stop stop-color="${color('sky')}"/><stop offset=".55" stop-color="${color('paper')}"/><stop offset="1" stop-color="${color('mist')}"/></linearGradient></defs>
      <rect width="1200" height="630" fill="url(#background)"/>
      <rect x="45" y="45" width="1110" height="540" rx="26" fill="${color('paper')}" fill-opacity=".72"/>
      <path d="M470 175H730" stroke="${color('brass')}" stroke-width="2"/>
    </svg>`);
    const { title, author, date } = details(column, language);
    const layer = async (text, size, width, height, top) => {
      const input = await textLayer(text, size, width, height, ink, { bilingualFonts: true, balanced: true });
      const metadata = await sharp(input).metadata();
      return { input, left: Math.round((1200 - metadata.width) / 2), top };
    };
    const layers = [
      await layer(language === 'ko' ? '미주 임마누엘 교회' : 'Immanuel Church of America', 30, 950, 42, 105),
      await layer(title, 72, 940, 230, 215),
    ];
    if (author) layers.push(await layer(author, 31, 900, 55, 472));
    if (date) layers.push(await layer(date, 27, 900, 44, 535));
    return sharp(background).composite(layers).png().toBuffer();
  }
  return (column, language) => {
    const key = columnPreviewVersion(column, language);
    if (!cache.has(key)) {
      cache.set(key, render(column, language).catch((error) => { cache.delete(key); throw error; }));
      if (cache.size > 32) cache.delete(cache.keys().next().value);
    }
    return cache.get(key);
  };
}
