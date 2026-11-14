async function galleryRequest(url, options) {
  const response = await fetch(url, {
    ...options, headers: { Accept: 'application/json', ...options.headers },
  });
  if (response.redirected) throw new Error('Your sign-in expired. Sign in again. · 로그인이 만료되었습니다. 다시 로그인해 주세요.');
  if (!(response.headers.get('content-type') || '').includes('application/json')) {
    throw new Error('The request failed. Reload and try again. · 요청에 실패했습니다. 새로고침 후 다시 시도해 주세요.');
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The request failed. · 요청에 실패했습니다.');
  return result;
}

async function uploadGalleryPhoto(file, token) {
  if (file.size > 20 * 1024 * 1024) {
    throw new Error('Each photo must be at most 20 MB. · 사진당 최대 20MB입니다.');
  }
  const data = new FormData();
  data.append('photos', file);
  const result = await galleryRequest('/admin/gallery/uploads', {
    method: 'POST', headers: { 'X-CSRF-Token': token }, body: data,
  });
  if (!result.photos?.[0]?.id || !result.photos[0].preview) {
    throw new Error('The upload response was invalid. Reload to check your uploads. · 업로드 응답이 올바르지 않습니다. 새로고침하여 업로드를 확인해 주세요.');
  }
  return result.photos[0];
}

const uploadPanel = document.querySelector('[data-gallery-upload]');
if (uploadPanel) {
  const input = uploadPanel.querySelector('[data-gallery-files]');
  const form = uploadPanel.querySelector('[data-gallery-publish]');
  const drafts = uploadPanel.querySelector('[data-gallery-drafts]');
  const status = uploadPanel.querySelector('[data-gallery-status]');
  const errors = uploadPanel.querySelector('[data-gallery-errors]');
  const progress = uploadPanel.querySelector('[data-gallery-progress]');
  const submit = form.querySelector('button');
  const token = form.elements._csrf.value;
  let busy = false;

  input.addEventListener('change', async () => {
    if (busy) return;
    const files = [...input.files];
    if (!files.length) return;
    errors.replaceChildren();
    errors.hidden = true;
    if (files.length + drafts.children.length > 100) {
      status.textContent = 'Choose at most 100 photos including your pending uploads. · 아직 게시하지 않은 사진을 포함하여 최대 100장을 선택해 주세요.';
      input.value = '';
      return;
    }
    busy = true;
    input.disabled = true;
    submit.disabled = true;
    progress.hidden = false;
    progress.max = files.length;
    progress.value = 0;
    let uploaded = 0;
    for (const [index, file] of files.entries()) {
      status.textContent = `Uploading ${index + 1}/${files.length}: ${file.name} · 사진 업로드 중`;
      try {
        const photo = await uploadGalleryPhoto(file, token);
        const card = uploadPanel.querySelector('[data-gallery-template]').content.firstElementChild.cloneNode(true);
        card.dataset.draftId = photo.id;
        card.querySelector('img').src = photo.preview;
        card.querySelector('[data-photo-name]').textContent = file.name;
        drafts.append(card);
        uploaded++;
      } catch (error) {
        const item = document.createElement('li');
        item.textContent = `${file.name}: ${error.message}`;
        errors.append(item);
        errors.hidden = false;
      }
      progress.value = index + 1;
    }
    busy = false;
    input.disabled = false;
    input.value = '';
    submit.disabled = !drafts.children.length;
    status.textContent = `${uploaded}/${files.length} uploaded. Review the previews and captions before publishing. · 미리보기와 설명을 확인한 후 게시해 주세요.`;
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !drafts.children.length) return;
    busy = true;
    submit.disabled = true;
    input.disabled = true;
    try {
      const photos = [...drafts.children].map((card) => ({
        id: card.dataset.draftId,
        captionEn: card.querySelector('[name="captionEn"]').value,
        captionKo: card.querySelector('[name="captionKo"]').value,
      }));
      const result = await galleryRequest('/admin/gallery/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _csrf: token, photos }),
      });
      window.location.assign(result.location);
    } catch (error) {
      status.textContent = error.message;
      busy = false;
      submit.disabled = false;
      input.disabled = false;
    }
  });
}

document.querySelectorAll('[data-gallery-replace]').forEach((form) => {
  const input = form.querySelector('input[type="file"]');
  const staged = form.elements.stagedPhoto;
  const status = form.querySelector('[role="status"]');
  const preview = form.querySelector('[data-replacement-preview]');
  const submit = form.querySelector('button');
  input.addEventListener('change', async () => {
    submit.disabled = true;
    staged.value = '';
    preview.hidden = true;
    const file = input.files[0];
    if (!file) return;
    input.disabled = true;
    status.textContent = 'Uploading replacement... · 교체할 사진 업로드 중...';
    try {
      const photo = await uploadGalleryPhoto(file, form.elements._csrf.value);
      staged.value = photo.id;
      preview.src = photo.preview;
      preview.hidden = false;
      submit.disabled = false;
      status.textContent = 'Review the preview, then save the replacement. Captions will stay unchanged. · 미리보기를 확인하고 교체를 저장해 주세요. 설명은 유지됩니다.';
    } catch (error) {
      status.textContent = error.message;
    } finally {
      input.disabled = false;
    }
  });
  form.addEventListener('submit', (event) => {
    if (!staged.value) {
      event.preventDefault();
      status.textContent = 'Wait for the replacement upload to finish. · 교체할 사진의 업로드가 끝날 때까지 기다려 주세요.';
    } else {
      submit.disabled = true;
    }
  });
});
