const hasKorean = (text) => /[\uAC00-\uD7AF]/u.test(text);

export function splitBilingual(value = '') {
  const text = String(value).trim();
  if (!text) return { en: '', ko: '' };
  const parts = text.split(/\s*\/\/\s*|\r?\n/);
  if (parts.length === 2 && parts.every((part) => part.trim())) {
    const [first, second] = parts.map((part) => part.trim());
    if (!hasKorean(first) && hasKorean(second)) return { en: first, ko: second };
    if (hasKorean(first) && !hasKorean(second)) return { en: second, ko: first };
  }
  const koreanStart = text.search(/[\uAC00-\uD7AF]/u);
  if (koreanStart > 0 && !/[\r\n]/u.test(text)) {
    return { en: text.slice(0, koreanStart).trim(), ko: text.slice(koreanStart).trim() };
  }
  return hasKorean(text) && !/[a-z]/iu.test(text) ? { en: '', ko: text } : { en: text, ko: '' };
}

export function sermonSpeakers(sermon) {
  if (typeof sermon.speakerEn === 'string' || typeof sermon.speakerKo === 'string') {
    return { en: sermon.speakerEn || '', ko: sermon.speakerKo || '' };
  }
  return splitBilingual(sermon.speaker);
}

export const SERMON_SERVICE_FILTERS = [
  { id: 'sunday-1', en: 'Sunday 1st Service', ko: '주일 1부 예배' },
  { id: 'sunday-2', en: 'Sunday 2nd Service', ko: '주일 2부 예배' },
  { id: 'sunday-3', en: 'Sunday 3rd Service', ko: '주일 3부 예배' },
  { id: 'wednesday', en: 'Wednesday Service', ko: '수요예배' },
  { id: 'friday', en: 'Friday Service', ko: '금요예배' },
];

export function sermonServiceType(value) {
  const { en, ko } = splitBilingual(value);
  const normalize = (text) => text.toLowerCase().replace(/\s+/gu, '').replace(/예베$/u, '예배');
  return SERMON_SERVICE_FILTERS.find((service) =>
    (!en || normalize(en) === normalize(service.en)) &&
    (!ko || normalize(ko) === normalize(service.ko)) &&
    (en || ko))?.id;
}
