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
