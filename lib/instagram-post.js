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
  const overview = requiredText(description, 'Sermon Overview', 10000);
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

export function postBackground(c, seed, designIndex) {
  const bytes = crypto.createHash('sha256').update(seed).digest();
  const design = (designIndex ?? bytes[6]) % 4;
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
    ${design === 0 ? `<g transform="${mirror ? 'translate(1080 0) scale(-1 1)' : ''}">
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
    </g>` : design === 1 ? `
    <g fill="none" stroke="url(#silk)">
      <path d="M-70 1450V430C-70 -100 1150 -100 1150 430V1450" stroke-width="160" opacity=".75"/>
      <path d="M-25 1450V410C-25 -20 1105 -20 1105 410V1450" stroke="${c.lavender}" stroke-width="35" opacity=".9"/>
      <path d="M12 1450V425C12 20 1068 20 1068 425V1450" stroke="${c.pink}" stroke-width="28" opacity=".9"/>
      <path d="M32 1450V430C32 45 1048 45 1048 430V1450" stroke="url(#metal)" stroke-width="3"/>
      <path d="M-40 1300Q540 1090 1120 1300" stroke="${c.yellow}" stroke-width="45" opacity=".75"/>
    </g>
    <ellipse cx="540" cy="30" rx="490" ry="300" fill="url(#aura-2)"/>
    ` : design === 2 ? `
    <g stroke="url(#metal)" stroke-width="2">
      <path d="M-80 0H360L0 390Z" fill="url(#silk)" opacity=".95"/>
      <path d="M-60 0H265L0 295Z" fill="${c.lavender}" opacity=".9"/>
      <path d="M-40 0H150L0 180Z" fill="${c.pink}" opacity=".9"/>
      <path d="M1080 0H780L1080 310Z" fill="${c.yellow}" opacity=".75"/>
      <path d="M-80 1350H390L0 970Z" fill="${c.yellow}" opacity=".8"/>
      <path d="M1160 1350H650L1080 ${1010 - bend}Z" fill="url(#silk)" opacity=".95"/>
      <path d="M1120 1350H800L1080 1070Z" fill="${c.pink}" opacity=".9"/>
      <path d="M1100 1350H940L1080 1190Z" fill="${c.lavender}" opacity=".9"/>
      <path d="M15 480L70 550L15 620L-40 550Z" fill="${c.lavender}" opacity=".8"/>
      <path d="M1065 700L1120 770L1065 840L1010 770Z" fill="${c.pink}" opacity=".8"/>
    </g>
    <ellipse cx="1050" cy="1200" rx="440" ry="400" fill="url(#aura-0)"/>
    <ellipse cx="0" cy="180" rx="400" ry="300" fill="url(#aura-1)"/>
    ` : `
    <g fill="none" stroke-width="42">
      <ellipse cx="540" cy="675" rx="${530 + bend}" ry="790" stroke="url(#silk)" opacity=".9"/>
      <ellipse cx="540" cy="675" rx="565" ry="765" stroke="${c.lavender}" opacity=".9"/>
      <ellipse cx="540" cy="675" rx="535" ry="740" stroke="${c.pink}" opacity=".85"/>
      <ellipse cx="540" cy="675" rx="510" ry="715" stroke="${c.yellow}" stroke-width="12" opacity=".8"/>
      <ellipse cx="540" cy="675" rx="497" ry="702" stroke="url(#metal)" stroke-width="2"/>
    </g>
    <ellipse cx="90" cy="670" rx="260" ry="800" fill="url(#aura-1)"/>
    <ellipse cx="990" cy="670" rx="260" ry="800" fill="url(#aura-0)"/>
    `}
    <g fill="none" stroke="url(#metal)">
      ${design % 2 === 0 ? `<rect x="26" y="26" width="1028" height="1298" stroke-width="3"/>
      <rect x="36" y="36" width="1008" height="1278" opacity=".45"/>
      <path d="M58 114V58H114M966 58H1022V114M58 1236V1292H114M966 1292H1022V1236" stroke-width="3"/>`
    : `<path d="M70 26H1010L1054 70V1280L1010 1324H70L26 1280V70Z" stroke-width="3"/>
      <path d="M85 39H995L1041 85V1265L995 1311H85L39 1265V85Z" opacity=".5"/>`}
      <path d="M190 345H480M600 345H890M190 1198H480M600 1198H890"/>
      <path d="M540 335L550 345L540 355L530 345ZM540 1188L550 1198L540 1208L530 1198Z" fill="url(#metal)"/>
    </g>
  </svg>`;
}

export async function instagramArtworkTextLayers(sermon, c) {
  const details = postDetails(sermon);
  const layers = [];
  const block = async (text, size, width, height, fill, minimum = size) => {
    const input = await textLayer(text, size * 2, width * 2, height * 2, fill,
      { minRenderedSize: minimum * 2, balanced: true, lineHeight: 1.18, strokeWidth: 1.2 });
    const bounds = await sharp(input).metadata();
    return { input, width: bounds.width, height: bounds.height, text };
  };
  const pair = async (value, enSize, koSize, width, height, fill, gap, minimum = enSize) => {
    const { en, ko } = splitBilingual(value);
    const rows = [];
    if (en) rows.push(await block(en, enSize, width, height, fill, minimum));
    if (ko) rows.push(await block(ko, koSize, width, height, fill, Math.min(minimum, koSize)));
    return { rows, gap: gap * 2,
      height: rows.reduce((sum, row) => sum + row.height, 0) + Math.max(0, rows.length - 1) * gap * 2 };
  };
  const place = (group, top) => {
    let y = Math.round(top * 2);
    const previous = layers.at(-1);
    if (previous && y - previous.top - previous.height < 20) {
      throw new Error('Sermon metadata is too dense to fit with readable spacing.');
    }
    for (const row of group.rows) {
      layers.push({ input: row.input, text: row.text,
        left: Math.round(1080 - row.width / 2), top: y, width: row.width, height: row.height });
      y += row.height + group.gap;
    }
    return top + group.height / 2;
  };
  const header = await pair('Immanuel Church of America\n미주 임마누엘 교회', 38, 32, 800, 100, c.paper, 14);
  place(header, 70);
  if (details.service) {
    place(await pair(details.service, 36, 32, 760, 100, c.paper, 14, 32), 230);
  }
  const title = await pair(details.title, 64, 44, 720, 210, c.paper, 24, 40);
  if (title.height > 700) throw new Error('Sermon title is too dense to fit legibly.');
  const titleBottom = place(title, 550 - title.height / 4);
  const reference = await pair(details.scripture, 38, 34, 720, 110, c.paper, 14, 32);
  const referenceBottom = place(reference, titleBottom + 64);
  const speaker = await pair(details.speaker, 36, 32, 720, 100, c.paper, 14, 32);
  const speakerBottom = place(speaker, referenceBottom + 60);
  if (speakerBottom > 1100) throw new Error('Sermon metadata is too dense to fit clear of the artwork.');
  const footer = await pair('Since 1994\n1994년부터', 26, 24, 600, 65, c.paper, 12, 24);
  place(footer, 1290 - footer.height / 2);
  return layers;
}

export async function renderInstagramPost(sermon, { seed = crypto.randomUUID(), designIndex, backgroundPath } = {}) {
  postDetails(sermon);
  const c = await colors();
  if (backgroundPath !== undefined && (typeof backgroundPath !== 'string' || !backgroundPath.trim())) {
    throw new TypeError('Background artwork must be a local image path.');
  }
  const background = backgroundPath
    ? await sharp(backgroundPath).resize(2160, 2700, { fit: 'cover' }).png().toBuffer()
    : new Resvg(postBackground(c, seed, designIndex), { fitTo: { mode: 'width', value: 2160 } }).render().asPng();
  const text = await instagramArtworkTextLayers(sermon, c);
  return sharp(background).composite(text.map(({ input, left, top }) => ({ input, left, top })))
    .jpeg({ quality: 96, chromaSubsampling: '4:4:4' }).toBuffer();
}
