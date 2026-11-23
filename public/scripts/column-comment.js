const form = document.querySelector('.column-comment-form');
const status = form.querySelector('[data-comment-status]');
const button = form.querySelector('button[type="submit"]');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  button.disabled = true;
  status.textContent = 'Submitting comment… · 댓글을 보내고 있습니다…';
  try {
    const response = await fetch(form.action, {
      method: 'POST',
      credentials: 'same-origin',
      body: new URLSearchParams(new FormData(form)),
    });
    const destination = new URL(response.url);
    if (!response.ok || !response.redirected || destination.origin !== window.location.origin ||
        destination.searchParams.get('status') !== 'submitted') {
      if (response.status === 403) throw new Error('Request could not be verified. Reload the page and try again. · 요청을 확인할 수 없습니다. 페이지를 새로고침해 주세요.');
      if (response.status === 429) throw new Error('Too many requests. Please try again later. · 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
      throw new Error('Could not submit the comment. Please check your entries and try again. · 댓글을 보낼 수 없습니다. 입력 내용을 확인한 후 다시 시도해 주세요.');
    }
    form.reset();
    status.textContent = 'Thank you. Your comment will appear after review. · 감사합니다. 댓글은 검토 후 게시됩니다.';
  } catch (error) {
    status.textContent = error instanceof TypeError
      ? 'Could not submit the comment. Please check your connection and try again. · 댓글을 보낼 수 없습니다. 연결을 확인한 후 다시 시도해 주세요.'
      : error.message || 'Could not submit the comment. Please try again. · 댓글을 보낼 수 없습니다. 다시 시도해 주세요.';
  } finally {
    button.disabled = false;
  }
});
