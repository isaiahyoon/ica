const IMAGE_NAME = /^[a-f0-9-]{36}\.webp$/;
const NEW_IMAGE = /^new:[a-f0-9-]{36}$/;

export class ColumnInputError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function validColumnUrl(value) {
  if (typeof value !== 'string' || value.length > 2000) return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function parseColumnDocument(value) {
  if (typeof value !== 'string' || value.length > 300_000) {
    throw new ColumnInputError('The article is too long. · 기사가 너무 깁니다.');
  }
  let input;
  try {
    input = JSON.parse(value);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new ColumnInputError('The article could not be read. · 기사를 읽을 수 없습니다.');
  }
  let count = 0;
  let length = 0;
  const images = new Set();
  function nodes(items, depth, inLink = false, inFormat = false) {
    if (!Array.isArray(items) || depth > 20) throw new ColumnInputError('The article format is invalid. · 기사 형식이 올바르지 않습니다.');
    return items.map((item) => {
      if (++count > 5000 || !item || typeof item !== 'object' || Array.isArray(item)) {
        throw new ColumnInputError('The article format is invalid. · 기사 형식이 올바르지 않습니다.');
      }
      if (item.type === 'text' && typeof item.text === 'string') {
        length += item.text.length;
        if (length > 50_000) throw new ColumnInputError('Each article language is limited to 50,000 characters. · 각 언어의 기사는 50,000자까지 입력할 수 있습니다.');
        return { type: 'text', text: item.text };
      }
      if (item.type === 'break') return { type: 'break' };
      if (item.type === 'block' && !inLink && !inFormat) return { type: 'block', children: nodes(item.children, depth + 1) };
      if (item.type === 'link' && !inLink && validColumnUrl(item.href)) {
        return { type: 'link', href: item.href, children: nodes(item.children, depth + 1, true, inFormat) };
      }
      if (['bold', 'italic', 'underline'].includes(item.type)) {
        return { type: item.type, children: nodes(item.children, depth + 1, inLink, true) };
      }
      if (item.type === 'image' && !inLink && !inFormat && typeof item.file === 'string' &&
          (IMAGE_NAME.test(item.file) || NEW_IMAGE.test(item.file)) &&
          typeof item.alt === 'string' && item.alt.length <= 300) {
        images.add(item.file);
        if (images.size > 10) throw new ColumnInputError('An article can contain up to 10 images. · 기사에는 이미지를 최대 10개까지 넣을 수 있습니다.');
        return { type: 'image', file: item.file, alt: item.alt };
      }
      throw new ColumnInputError('The article contains an invalid link or image. · 기사의 링크 또는 이미지가 올바르지 않습니다.');
    });
  }
  return { nodes: nodes(input, 0), images };
}

export function mapColumnImages(nodes, replacements) {
  return nodes.map((node) => {
    if (node.type === 'image') return { ...node, file: replacements.get(node.file) ?? node.file };
    if (node.children) return { ...node, children: mapColumnImages(node.children, replacements) };
    return node;
  });
}

export function columnPlainText(nodes) {
  return nodes.map((node) => {
    if (node.type === 'text') return node.text;
    if (node.type === 'break') return '\n';
    if (node.type === 'block') return `${columnPlainText(node.children)}\n`;
    if (node.children) return columnPlainText(node.children);
    return '';
  }).join('').trim();
}

export function columnHasContent(nodes) {
  return Array.isArray(nodes) && nodes.some((node) =>
    (node.type === 'text' && Boolean(node.text.trim())) || node.type === 'image' ||
    (node.children && columnHasContent(node.children)));
}

export function renderColumnDocument(nodes, esc) {
  return nodes.map((node) => {
    if (node.type === 'text') return esc(node.text);
    if (node.type === 'break') return '<br>';
    if (node.type === 'block') return `<div>${renderColumnDocument(node.children, esc)}</div>`;
    if (node.type === 'link') return `<a href="${esc(node.href)}" target="_blank" rel="noopener noreferrer">${renderColumnDocument(node.children, esc)}</a>`;
    if (node.type === 'bold') return `<strong>${renderColumnDocument(node.children, esc)}</strong>`;
    if (node.type === 'italic') return `<em>${renderColumnDocument(node.children, esc)}</em>`;
    if (node.type === 'underline') return `<u>${renderColumnDocument(node.children, esc)}</u>`;
    if (node.type === 'image') return `<img src="/columns/images/${encodeURIComponent(node.file)}" data-column-image="${esc(node.file)}" alt="${esc(node.alt)}" loading="lazy">`;
    throw new Error('Unrecognized saved article content.');
  }).join('');
}
