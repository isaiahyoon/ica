const BOOKS = [
  ['Genesis', '창세기'], ['Exodus', '출애굽기'], ['Leviticus', '레위기'], ['Numbers', '민수기'],
  ['Deuteronomy', '신명기'], ['Joshua', '여호수아'], ['Judges', '사사기'], ['Ruth', '룻기'],
  ['1 Samuel', '사무엘상'], ['2 Samuel', '사무엘하'], ['1 Kings', '열왕기상'], ['2 Kings', '열왕기하'],
  ['1 Chronicles', '역대상'], ['2 Chronicles', '역대하'], ['Ezra', '에스라'], ['Nehemiah', '느헤미야'],
  ['Esther', '에스더'], ['Job', '욥기'], ['Psalms', '시편'], ['Proverbs', '잠언'],
  ['Ecclesiastes', '전도서'], ['Song of Solomon', '아가'], ['Isaiah', '이사야'], ['Jeremiah', '예레미야'],
  ['Lamentations', '예레미야애가'], ['Ezekiel', '에스겔'], ['Daniel', '다니엘'], ['Hosea', '호세아'],
  ['Joel', '요엘'], ['Amos', '아모스'], ['Obadiah', '오바댜'], ['Jonah', '요나'],
  ['Micah', '미가'], ['Nahum', '나훔'], ['Habakkuk', '하박국'], ['Zephaniah', '스바냐'],
  ['Haggai', '학개'], ['Zechariah', '스가랴'], ['Malachi', '말라기'], ['Matthew', '마태복음'],
  ['Mark', '마가복음'], ['Luke', '누가복음'], ['John', '요한복음'], ['Acts', '사도행전'],
  ['Romans', '로마서'], ['1 Corinthians', '고린도전서'], ['2 Corinthians', '고린도후서'],
  ['Galatians', '갈라디아서'], ['Ephesians', '에베소서'], ['Philippians', '빌립보서'],
  ['Colossians', '골로새서'], ['1 Thessalonians', '데살로니가전서'], ['2 Thessalonians', '데살로니가후서'],
  ['1 Timothy', '디모데전서'], ['2 Timothy', '디모데후서'], ['Titus', '디도서'], ['Philemon', '빌레몬서'],
  ['Hebrews', '히브리서'], ['James', '야고보서'], ['1 Peter', '베드로전서'], ['2 Peter', '베드로후서'],
  ['1 John', '요한1서'], ['2 John', '요한2서'], ['3 John', '요한3서'], ['Jude', '유다서'],
  ['Revelation', '요한계시록'],
];

const EDITIONS = [
  { route: 'krv', code: 'KRV', name: '한국어', language: 'ko' },
  { route: 'kjv', code: 'KJV', name: 'English', language: 'en' },
];

const normalize = (value) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
const booksByName = new Map();
for (const [name, koreanName] of BOOKS) {
  booksByName.set(normalize(name), name);
  booksByName.set(normalize(koreanName), name);
}
booksByName.set('psalm', 'Psalms');
booksByName.set('song of songs', 'Song of Solomon');
booksByName.set('아가서', 'Song of Solomon');

export function formatScriptureReference(reference) {
  return String(reference ?? '').replace(/\s*\/\/\s*/gu, '\n');
}

function parseReference(reference) {
  const text = String(reference ?? '').trim();
  const bilingual = text.match(/^([^()]+?)\s*\(([^()]+)\)$/u)
    ?? text.match(/^(.+?)\s*\/\/\s*(.+)$/su);
  if (bilingual) {
    const passage = parseReference(bilingual[1]);
    const other = parseReference(bilingual[2]);
    return passage && other && JSON.stringify(passage) === JSON.stringify(other) ? passage : null;
  }
  const lines = text.match(/^([^\r\n]+)\r?\n([^\r\n]+)$/u);
  if (lines) {
    const first = parseReference(lines[1]);
    const second = parseReference(lines[2]);
    if (first && second) return JSON.stringify(first) === JSON.stringify(second) ? first : null;
  }
  const match = text.match(/^(.+?)\s+(\d+)(?:\s*:\s*(\d+(?:\s*[-–—]\s*\d+)?(?:\s*,\s*\d+(?:\s*[-–—]\s*\d+)?)*)\s*)?$/su);
  if (!match) return null;

  const book = booksByName.get(normalize(match[1]));
  const chapter = Number(match[2]);
  if (!book || !Number.isSafeInteger(chapter) || chapter < 1) return null;

  const slug = book.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const passage = `b/${slug}/c/${chapter}`;
  if (match[3] === undefined) return [{ path: passage, verses: '' }];
  const ranges = match[3].split(',').map((part) => {
    const [start, end = start] = part.trim().split(/\s*[-–—]\s*/u).map(Number);
    if (!Number.isSafeInteger(start) || start < 1 || !Number.isSafeInteger(end) || end < start) return null;
    const verses = start === end ? `${start}` : `${start}-${end}`;
    return { path: `${passage}/v/${verses}`, verses };
  });
  return ranges.every(Boolean) ? ranges : null;
}

export function scriptureLanguageLinks(reference) {
  const passages = parseReference(reference);
  if (!passages) return '';

  const links = EDITIONS.flatMap(({ route, code, name, language }) =>
    passages.map(({ path, verses }) =>
      `<a href="https://theamazingword.org/${route}/${path}" lang="${language}" target="_blank" rel="noopener noreferrer">${code} · ${name}${passages.length > 1 ? ` · ${verses}` : ''}</a>`),
  ).join('');
  return `<nav class="scripture-language-links" aria-label="Korean or English Bible · 한국어 또는 영어 성경">${links}</nav>`;
}
