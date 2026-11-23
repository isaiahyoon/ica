const form = document.querySelector('[data-column-editor]');
const status = form.querySelector('[data-column-status]');
const submit = form.querySelector('[data-column-submit]');
const pending = new Map();
const editors = [...form.querySelectorAll('[data-column-language]')].map((section) => ({
  language: section.dataset.columnLanguage,
  surface: section.querySelector('[data-column-surface]'),
  range: null,
}));
let dirty = false;

function rememberSelection(editor) {
  const selection = window.getSelection();
  if (selection.rangeCount && editor.surface.contains(selection.anchorNode) && editor.surface.contains(selection.focusNode)) {
    editor.range = selection.getRangeAt(0).cloneRange();
  }
}

function insertionRange(editor) {
  const range = editor.range?.cloneRange() ?? document.createRange();
  if (!editor.range || !editor.surface.contains(range.startContainer) || !editor.surface.contains(range.endContainer)) {
    range.selectNodeContents(editor.surface);
    range.collapse(false);
  }
  const start = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
  const link = start?.closest('a');
  if (link && editor.surface.contains(link)) range.selectNode(link);
  return range;
}

function insert(editor, node) {
  const range = insertionRange(editor);
  range.deleteContents();
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  editor.surface.focus();
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  editor.range = range.cloneRange();
  dirty = true;
}

function serializeChildren(element) {
  return [...element.childNodes].flatMap((node) => {
    if (node.nodeType === Node.TEXT_NODE) return [{ type: 'text', text: node.data }];
    if (node.nodeType !== Node.ELEMENT_NODE) return [];
    if (node.tagName === 'BR') return [{ type: 'break' }];
    if (node.tagName === 'IMG') return [{ type: 'image', file: node.dataset.columnImage, alt: node.alt }];
    if (node.tagName === 'A') return [{ type: 'link', href: node.getAttribute('href'), children: serializeChildren(node) }];
    if (node.tagName === 'DIV' || node.tagName === 'P') return [{ type: 'block', children: serializeChildren(node) }];
    const format = { B: 'bold', STRONG: 'bold', I: 'italic', EM: 'italic', U: 'underline' }[node.tagName];
    if (format) return [{ type: format, children: serializeChildren(node) }];
    return serializeChildren(node);
  });
}

function referencedImages(nodes, refs = new Set()) {
  for (const node of nodes) {
    if (node.type === 'image') refs.add(node.file);
    if (node.children) referencedImages(node.children, refs);
  }
  return refs;
}

document.addEventListener('selectionchange', () => editors.forEach(rememberSelection));
for (const editor of editors) {
  const section = editor.surface.closest('[data-column-language]');
  section.querySelector('[data-column-fallback]').hidden = true;
  section.querySelector('.column-editor-tools').hidden = false;
  editor.surface.hidden = false;
  editor.surface.addEventListener('click', (event) => {
    if (event.target.closest('a')) event.preventDefault();
  });
  editor.surface.addEventListener('paste', (event) => {
    event.preventDefault();
    insert(editor, document.createTextNode(event.clipboardData.getData('text/plain')));
  });
  editor.surface.addEventListener('drop', (event) => {
    event.preventDefault();
    status.textContent = 'Use Insert image to add pictures. · 이미지는 이미지 삽입을 사용해 주세요.';
  });

  for (const button of section.querySelectorAll('[data-format]')) {
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      const range = editor.range?.cloneRange();
      if (!range || !editor.surface.contains(range.startContainer) || !editor.surface.contains(range.endContainer)) {
        status.textContent = 'Place the cursor in the article first. · 먼저 기사에 커서를 놓아 주세요.';
        return;
      }
      editor.surface.focus();
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      if (!document.execCommand(button.dataset.format, false)) {
        status.textContent = 'Text formatting is unavailable in this browser. · 이 브라우저에서는 글 서식을 사용할 수 없습니다.';
        return;
      }
      rememberSelection(editor);
      dirty = true;
      status.textContent = '';
    });
  }

  section.querySelector('[data-insert-link]').addEventListener('click', () => {
    const urlInput = section.querySelector('[data-link-url]');
    const textInput = section.querySelector('[data-link-text]');
    let url;
    try { url = new URL(urlInput.value.trim()); } catch {
      status.textContent = 'Enter a valid link address. · 올바른 링크 주소를 입력해 주세요.';
      return;
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      status.textContent = 'Use an HTTP or HTTPS link without credentials. · 인증 정보가 없는 HTTP 또는 HTTPS 링크를 사용해 주세요.';
      return;
    }
    const label = textInput.value.trim() || editor.range?.toString().trim();
    if (!label) {
      status.textContent = 'Select text or enter link text. · 글을 선택하거나 링크 글을 입력해 주세요.';
      return;
    }
    const link = document.createElement('a');
    link.href = url.href;
    link.textContent = label;
    insert(editor, link);
    urlInput.value = '';
    textInput.value = '';
    status.textContent = '';
  });

  section.querySelector('[data-insert-image]').addEventListener('click', () => {
    const input = section.querySelector('[data-inline-file]');
    const alt = section.querySelector('[data-inline-alt]');
    const file = input.files[0];
    const extension = file?.name.match(/\.(jpe?g|png|webp|avif)$/i)?.[0].toLowerCase();
    const types = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif' };
    if (!file || !extension || types[extension] !== file.type || file.size > 20 * 1024 * 1024) {
      status.textContent = 'Choose a JPEG, PNG, WebP, or AVIF image up to 20 MB. · 20MB 이하의 JPEG, PNG, WebP 또는 AVIF 이미지를 선택해 주세요.';
      return;
    }
    const id = `new:${crypto.randomUUID()}`;
    const src = URL.createObjectURL(file);
    pending.set(id, { file, extension, src });
    const image = document.createElement('img');
    image.src = src;
    image.alt = alt.value.trim();
    image.dataset.columnImage = id;
    image.contentEditable = 'false';
    insert(editor, image);
    input.value = '';
    alt.value = '';
    status.textContent = '';
  });
}

form.addEventListener('input', () => { dirty = true; });
form.addEventListener('change', () => { dirty = true; });
window.addEventListener('beforeunload', (event) => {
  if (dirty) event.preventDefault();
});
window.addEventListener('pagehide', () => {
  for (const item of pending.values()) URL.revokeObjectURL(item.src);
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const docs = Object.fromEntries(editors.map((editor) => [editor.language, serializeChildren(editor.surface)]));
  const refs = referencedImages(docs.en, referencedImages(docs.ko));
  if (refs.size > 10) {
    status.textContent = 'An article can contain up to 10 images. · 기사에는 이미지를 최대 10개까지 넣을 수 있습니다.';
    return;
  }
  const data = new FormData(form);
  data.set('bodyEnDoc', JSON.stringify(docs.en));
  data.set('bodyKoDoc', JSON.stringify(docs.ko));
  for (const ref of refs) {
    const item = pending.get(ref);
    if (item) data.append('inlineImages', item.file, `${ref.slice(4)}${item.extension}`);
  }
  submit.disabled = true;
  status.textContent = 'Saving article… · 기사를 저장하고 있습니다…';
  try {
    const response = await fetch(form.action, {
      method: 'POST', credentials: 'same-origin', headers: { 'x-csrf-token': data.get('_csrf') }, body: data,
    });
    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw new Error('Could not save the article. Check your sign-in and try again. · 기사를 저장할 수 없습니다. 로그인 상태를 확인한 후 다시 시도해 주세요.');
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not save the article. · 기사를 저장할 수 없습니다.');
    if (typeof result.location !== 'string' || !result.location.startsWith('/columns/')) {
      throw new Error('The saved article address was invalid. · 저장된 기사 주소가 올바르지 않습니다.');
    }
    dirty = false;
    window.location.assign(result.location);
  } catch (error) {
    status.textContent = error.message || 'Could not save the article. · 기사를 저장할 수 없습니다.';
    submit.disabled = false;
  }
});
submit.disabled = false;
