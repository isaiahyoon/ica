function initializeAudioUpload(form) {
  const audio = form.querySelector('input[name="audio"]');
  const staged = form.querySelector('input[name="stagedAudio"]');
  const progress = form.querySelector('[data-audio-progress]');
  const status = form.querySelector('[data-audio-status]');
  const submit = form.querySelector('[data-audio-submit]');
  const uploadUrl = form.dataset.uploadUrl;
  let request = null;
  let uploadId = '';

  submit.disabled = true;
  status.textContent = 'Choose an audio file to begin. · 오디오 파일을 선택하면 업로드가 시작됩니다.';
  audio.addEventListener('change', () => {
    if (request) {
      const previous = request;
      request = null;
      previous.abort();
    }
    uploadId = '';
    staged.value = '';
    submit.disabled = true;
    progress.hidden = true;
    progress.value = 0;
    const file = audio.files[0];
    if (!file) {
      status.textContent = 'Choose an audio file to begin. · 오디오 파일을 선택하면 업로드가 시작됩니다.';
      return;
    }

    status.textContent = 'Starting audio upload... · 오디오 업로드를 시작합니다...';
    progress.hidden = false;
    const data = new FormData();
    data.set('_csrf', form.querySelector('input[name="_csrf"]').value);
    data.set('audio', file);
    const current = new XMLHttpRequest();
    request = current;
    current.open('POST', uploadUrl);
    current.upload.addEventListener('progress', (event) => {
      if (request !== current) return;
      if (event.lengthComputable) {
        progress.value = event.loaded / event.total * 100;
        const percent = Math.round(progress.value);
        status.textContent = 'Uploading audio: ' + percent + '% · 오디오 업로드: ' + percent + '%';
      } else {
        progress.removeAttribute('value');
        status.textContent = 'Uploading audio... · 오디오 업로드 중...';
      }
    });
    current.addEventListener('load', () => {
      if (request !== current) return;
      request = null;
      let result;
      try {
        result = JSON.parse(current.responseText);
      } catch {
        status.textContent = 'Audio upload failed. Please try again. · 오디오 업로드에 실패했습니다. 다시 시도해 주세요.';
        return;
      }
      if (current.status !== 201 || !result?.uploadId) {
        status.textContent = (result?.error || 'Audio upload failed.') + ' · 오디오 업로드에 실패했습니다.';
        return;
      }
      uploadId = result.uploadId;
      staged.value = uploadId;
      progress.value = 100;
      submit.disabled = false;
      status.textContent = form.action.endsWith('/audio')
        ? 'Audio is ready. Submit to replace the current audio. · 오디오 업로드가 완료되었습니다. 제출하면 현재 오디오가 교체됩니다.'
        : 'Audio is ready. Add sermon details and upload the sermon. · 오디오 업로드가 완료되었습니다. 설교 정보를 입력한 후 게시해 주세요.';
    });
    current.addEventListener('error', () => {
      if (request !== current) return;
      request = null;
      status.textContent = 'Audio upload failed. Check your connection and try again. · 오디오 업로드에 실패했습니다. 연결을 확인하고 다시 시도해 주세요.';
    });
    current.send(data);
  });

  form.addEventListener('submit', (event) => {
    if (!uploadId) {
      event.preventDefault();
      status.textContent = 'Wait for the audio upload to finish. · 오디오 업로드가 끝날 때까지 기다려 주세요.';
      return;
    }
    audio.removeAttribute('name');
    staged.value = uploadId;
  });
}

function initializeAudioUploads() {
  document.querySelectorAll('form[data-audio-upload]').forEach(initializeAudioUpload);
}

function initializeAdminConfirmations() {
  document.addEventListener('submit', (event) => {
    const confirmedForm = event.target.closest('form[data-confirm]');
    if (confirmedForm && !window.confirm(confirmedForm.dataset.confirm)) {
      event.preventDefault();
    }
  });
}

function initializePastorSelectors() {
  document.querySelectorAll('[data-pastor-select]').forEach((select) => {
    select.addEventListener('change', () => {
      if (!select.value) return;
      const option = select.selectedOptions[0];
      select.form.elements.speakerEn.value = option.dataset.en;
      select.form.elements.speakerKo.value = option.dataset.ko;
    });
    for (const field of [select.form.elements.speakerEn, select.form.elements.speakerKo]) {
      field.addEventListener('input', () => { select.value = ''; });
    }
  });
}

async function initializeScriptureEntries() {
  const entries = document.querySelectorAll('[data-scripture-entry]');
  if (!entries.length) return;
  let counts;
  try {
    const response = await fetch('/bible-verses.json');
    if (!response.ok) throw new Error('Bible reference data unavailable');
    counts = await response.json();
  } catch {
    entries.forEach((entry) => {
      entry.querySelector('[data-scripture-status]').textContent = 'Could not load the Scripture selector. Enter the reference above. · 성경 선택기를 불러올 수 없습니다. 위에 본문을 입력해 주세요.';
    });
    return;
  }
  entries.forEach((entry) => {
    const book = entry.querySelector('[data-book]');
    const chapter = entry.querySelector('[data-chapter]');
    const start = entry.querySelector('[data-start]');
    const end = entry.querySelector('[data-end]');
    const verses = entry.querySelector('[data-verses]');
    const reference = entry.querySelector('[name="scripture"]');
    const status = entry.querySelector('[data-scripture-status]');
    const populate = (select, count) => {
      select.replaceChildren();
      for (let n = 1; n <= count; n++) select.add(new Option(String(n), String(n)));
      select.disabled = !count;
    };
    const updateVerses = () => {
      const count = counts[Number(book.value)]?.[Number(chapter.value) - 1] || 0;
      populate(start, count);
      populate(end, count);
      verses.value = '';
    };
    book.addEventListener('change', () => {
      populate(chapter, book.value === '' ? 0 : counts[Number(book.value)].length);
      updateVerses();
    });
    chapter.addEventListener('change', updateVerses);
    start.addEventListener('change', () => { end.value = start.value; });
    entry.querySelector('[data-add-range]').addEventListener('click', () => {
      if (!start.value || Number(end.value) < Number(start.value)) {
        status.textContent = 'Choose a valid verse range. · 올바른 절 범위를 선택해 주세요.';
        return;
      }
      const range = start.value === end.value ? start.value : `${start.value}-${end.value}`;
      verses.value = [verses.value.trim(), range].filter(Boolean).join(', ');
      status.textContent = 'Verse added. · 절이 추가되었습니다.';
    });
    entry.querySelector('[data-add-passage]').addEventListener('click', () => {
      const raw = verses.value.trim();
      const max = Number(end.options.length);
      const ranges = raw.split(',').map((part) => part.trim());
      const valid = raw && ranges.every((range) => {
        const match = range.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
        return match && Number(match[1]) >= 1 && Number(match[2] || match[1]) >= Number(match[1]) && Number(match[2] || match[1]) <= max;
      });
      if (!book.value || !chapter.value || !valid) {
        status.textContent = 'Choose a book, chapter, and valid verses. · 성경, 장 및 올바른 절을 선택해 주세요.';
        return;
      }
      const option = book.selectedOptions[0];
      const range = ranges.map((part) => part.replace(/\s*-\s*/g, '-')).join(', ');
      const passage = `${option.dataset.en} ${chapter.value}:${range} (${option.dataset.ko} ${chapter.value}:${range})`;
      const combined = [reference.value.trim(), passage].filter(Boolean).join('; ');
      if (combined.length > reference.maxLength) {
        status.textContent = 'The Scripture reference is too long. · 성경 본문이 너무 깁니다.';
        return;
      }
      reference.value = combined;
      verses.value = '';
      status.textContent = 'Passage added. Choose another book or chapter to add more. · 본문이 추가되었습니다. 다른 성경이나 장을 추가할 수 있습니다.';
    });
  });
}

initializeAudioUploads();
initializeAdminConfirmations();
initializePastorSelectors();
initializeScriptureEntries();
