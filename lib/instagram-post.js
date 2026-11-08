import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { sermonSpeakers, splitBilingual } from './sermon-metadata.js';
import { formatScriptureReference } from './scripture-links.js';
import { textLayer } from './sermon-preview.js';

const requiredText = (value, field, limit) => {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) {
    throw new TypeError(`${field} must contain text (at most ${limit} characters).`);
  }
  return value.trim().replaceAll('\r\n', '\n');
};

export function sermonLink(value) {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const church = ['immanuelchurchofamerica.org', 'www.immanuelchurchofamerica.org'].includes(url.hostname);
  if (url.username || url.password || !(local ? ['http:', 'https:'].includes(url.protocol)
    : church && url.protocol === 'https:' && !url.port)) {
    throw new TypeError('Use an HTTPS church sermon link or a local development sermon link.');
  }
  const match = url.pathname.match(/^\/sermons\/([a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})\/?$/i);
  if (!match) throw new TypeError('Use an individual sermon link, not the sermon list or preview image.');
  return { id: match[1].toLowerCase(), url: `${url.origin}/sermons/${match[1].toLowerCase()}` };
}

export function postHashtags(extra = ['Sermon', 'BibleTeaching', 'Scripture']) {
  if (!Array.isArray(extra) || extra.length !== 3 || extra.some((tag) => typeof tag !== 'string')) {
    throw new TypeError('Provide exactly three additional hashtags.');
  }
  const tags = ['ImmanuelChurchOfAmerica', '미주임마누엘교회', ...extra.map((tag) => tag.replace(/^#/, ''))];
  if (tags.some((tag) => !/^[\p{L}\p{N}_]+$/u.test(tag))
    || new Set(tags.map((tag) => tag.toLocaleLowerCase())).size !== 5) {
    throw new TypeError('The five hashtags must be distinct and contain only letters, numbers, or underscores.');
  }
  return tags.map((tag) => `#${tag}`);
}

export function postCaption(description) {
  const overview = requiredText(description, 'Sermon Overview', 1000);
  const { en, ko } = splitBilingual(overview);
  let text = en && ko ? `${en}\n\n${ko}` : overview;
  if (!(en && ko)) {
    const boundary = overview.search(/\n[ \t]*(?=[\uAC00-\uD7AF])/u);
    if (boundary >= 0 && !/[\uAC00-\uD7AF]/u.test(overview.slice(0, boundary))) {
      text = `${overview.slice(0, boundary).trimEnd()}\n\n${overview.slice(boundary).trimStart()}`;
    }
  }
  return `${text}\n\nListen to the sermon via the link in our bio.\n프로필 링크를 통해 설교를 들으실 수 있습니다.`;
}

export function postDetails(sermon) {
  if (!sermon || typeof sermon !== 'object') throw new TypeError('Provide sermon metadata.');
  const title = requiredText(sermon.title, 'Sermon title', 140);
  const scripture = formatScriptureReference(requiredText(sermon.scripture, 'Scripture reference', 100));
  const names = sermonSpeakers(sermon);
  if (Object.values(names).some((name) => typeof name !== 'string')) {
    throw new TypeError('Speaker names must be text.');
  }
  const speaker = Object.values(names).filter((name) => typeof name === 'string' && name.trim())
    .map((name) => requiredText(name, 'Speaker name', 100)).join('\n');
  if (!speaker) throw new TypeError('A saved speaker name is required; do not infer one.');
  let service = '';
  if (sermon.service != null && sermon.service !== '') {
    const label = requiredText(sermon.service, 'Service label', 100);
    service = Object.values(splitBilingual(label)).filter(Boolean).join('\n');
  }
  return { title, scripture, speaker, service };
}

async function colors() {
  const css = await fs.readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  return Object.fromEntries(['midnight', 'royal-blue', 'ribbon-blue', 'sky',
    'pink', 'lavender', 'yellow', 'paper', 'brass', 'brass-soft'].map((token) => {
    const value = css.match(new RegExp(`--${token}:\\s*(#[a-f\\d]{6})`, 'i'))?.[1];
    if (!value) throw new Error(`Missing Instagram design token: ${token}`);
    return [token, value];
  }));
}

export function postBackground(c, seed) {
  const bytes = crypto.createHash('sha256').update(seed).digest();
  const accents = [c.pink, c.lavender, c.yellow];
  const offset = bytes[0] % 3;
  const ribbonColors = accents.map((_, index) => accents[(index + offset) % 3]);
  const x = 10 + bytes[2] * 80 / 255;
  const y = 5 + bytes[3] * 65 / 255;
  const stop = 30 + bytes[4] * 40 / 255;
  const bend = 20 + bytes[1] * 65 / 255;
  const mirror = bytes[5] % 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">
    <defs>
      <linearGradient id="base" x1="${x}%" y1="0%" x2="${100 - x}%" y2="100%">
        <stop stop-color="${c.midnight}"/><stop offset="${stop}%" stop-color="${c['royal-blue']}"/>
        <stop offset="100%" stop-color="${c.midnight}"/>
      </linearGradient>
      <radialGradient id="wash" cx="${x}%" cy="${y}%" r="85%">
        <stop stop-color="${c['ribbon-blue']}" stop-opacity=".2"/><stop offset="1" stop-color="${c.midnight}" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="silk" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop stop-color="${ribbonColors[0]}"/><stop offset=".3" stop-color="${c['ribbon-blue']}"/>
        <stop offset=".52" stop-color="${ribbonColors[1]}"/><stop offset=".75" stop-color="${ribbonColors[2]}"/>
        <stop offset="1" stop-color="${ribbonColors[0]}"/>
      </linearGradient>
      ${accents.map((color, index) => `<radialGradient id="aura-${index}">
        <stop stop-color="${color}" stop-opacity=".36"/><stop offset="1" stop-color="${color}" stop-opacity="0"/>
      </radialGradient>`).join('')}
      <linearGradient id="metal" x2="1" y2="1">
        <stop stop-color="${c.brass}"/><stop offset=".32" stop-color="${c.yellow}"/>
        <stop offset=".55" stop-color="${c['brass-soft']}"/><stop offset=".72" stop-color="${c.brass}"/>
        <stop offset="1" stop-color="${c['brass-soft']}"/>
      </linearGradient>
    </defs>
    <rect width="1080" height="1350" fill="url(#base)"/>
    <rect width="1080" height="1350" fill="url(#wash)"/>
    <g transform="${mirror ? 'translate(1080 0) scale(-1 1)' : ''}">
      <ellipse cx="80" cy="290" rx="390" ry="460" fill="url(#aura-0)"/>
      <ellipse cx="1030" cy="760" rx="340" ry="620" fill="url(#aura-1)"/>
      <ellipse cx="125" cy="1220" rx="350" ry="370" fill="url(#aura-2)"/>
      <g stroke="url(#metal)" stroke-width="1.3">
        <g transform="scale(.55 1)">
        <path d="M-120 -80C470 10 440 170 160 270C-80 355 50 555 110 655
          C-35 555 -125 370 30 215C210 85 135 50 -120 65Z" fill="url(#silk)" opacity=".9"/>
        <path d="M-100 -40C360 40 310 190 110 285C-30 365 10 490 100 610
          C25 405 115 365 180 290C360 125 290 30 -100 -65Z" fill="${c.lavender}" opacity=".9"/>
        <path d="M-80 -55C275 55 290 165 100 280C-50 380 5 470 100 610" fill="none" stroke="${c.yellow}" opacity=".75"/>
        </g>
        <g transform="translate(486 0) scale(.55 1)">
        <path d="M1190 420C${780 + bend} 625 900 785 1020 925
          C1180 1110 830 1300 640 1420L910 1440
          C1200 1300 1240 1100 1090 925C960 760 1025 625 1210 585Z" fill="url(#silk)" opacity=".88"/>
        <path d="M1210 480C920 680 955 815 1080 960C1190 1130 990 1300 790 1410
          L930 1435C1160 1280 1250 1100 1120 960C975 795 1030 665 1230 550Z" fill="${c.pink}" opacity=".88"/>
        <path d="M1200 540C1000 690 1040 850 1140 990C1280 1180 1010 1350 900 1430
          L1030 1450C1270 1250 1330 1090 1200 950C1115 805 1130 690 1230 650Z" fill="${c.yellow}" opacity=".64"/>
        </g>
      </g>
      <path d="M-100 1180C230 1360 380 1200 610 1380L420 1450
        C220 1330 95 1420 -100 1280Z" fill="url(#silk)" stroke="url(#metal)" opacity=".7"/>
    </g>
    <g fill="none" stroke="url(#metal)">
      <rect x="26" y="26" width="1028" height="1298" stroke-width="3"/>
      <rect x="36" y="36" width="1008" height="1278" opacity=".45"/>
      <path d="M58 114V58H114M966 58H1022V114M58 1236V1292H114M966 1292H1022V1236" stroke-width="3"/>
      <path d="M190 345H480M600 345H890M190 1198H480M600 1198H890"/>
      <path d="M540 335L550 345L540 355L530 345ZM540 1188L550 1198L540 1208L530 1198Z" fill="url(#metal)"/>
    </g>
  </svg>`;
}

export async function renderInstagramPost(sermon, { seed = crypto.randomUUID() } = {}) {
  const details = postDetails(sermon);
  const c = await colors();
  const background = new Resvg(postBackground(c, seed), { fitTo: { mode: 'width', value: 2160 } }).render().asPng();
  const layers = [];
  const centered = async (text, size, width, height, top, fill, minimum = size) => {
    const input = await textLayer(text, size * 2, width * 2, height * 2, fill,
      { minRenderedSize: minimum * 2, bilingualFonts: true });
    const bounds = await sharp(input).metadata();
    layers.push({ input, left: Math.round((2160 - bounds.width) / 2),
      top: Math.round(top * 2 + (height * 2 - bounds.height) / 2) });
  };
  await centered('Immanuel Church of America', 38, 860, 60, 135, c.paper);
  await centered('미주 임마누엘 교회', 25, 860, 44, 208, c.sky);
  if (details.service) {
    await centered(details.service, 21, 840, 70, 260, c['brass-soft'], 18);
  }
  await centered(details.title, 64, 860, 300, 410, c.paper, 30);
  await centered(details.scripture, 33, 850, 155, 765, c['brass-soft'], 24);
  await centered('Speaker · 설교자', 19, 840, 32, 970, c.sky);
  await centered(details.speaker, 29, 850, 125, 1010, c.paper, 22);
  await centered('Since 1996 · 1996년부터', 22, 840, 48, 1232, c.paper);
  return sharp(background).composite(layers).jpeg({ quality: 96, chromaSubsampling: '4:4:4' }).toBuffer();
}
