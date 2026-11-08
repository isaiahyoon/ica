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

initializeAudioUploads();
initializeAdminConfirmations();
