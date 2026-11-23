const form = document.querySelector('.column-comment-form');
const commentButton = form.querySelector('button[type="submit"]');
const likeForm = document.querySelector('.column-like-form');
const likeButton = likeForm.querySelector('button[type="submit"]');
const likeAction = likeForm.querySelector('[name="like_action"]');
const toast = document.querySelector('[data-toast-message]');
let toastTimer;
let likePending = false;

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = '';
  void toast.offsetWidth;
  toast.textContent = message;
  toastTimer = setTimeout(() => { toast.textContent = ''; }, 4100);
}

if (toast.textContent.trim()) {
  toastTimer = setTimeout(() => { toast.textContent = ''; }, 4100);
}

likeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (likePending) return;
  likePending = true;
  likeButton.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch(likeForm.action, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      body: new URLSearchParams(new FormData(likeForm)),
    });
    if (!response.ok) {
      if (response.status === 403) throw new Error('Request could not be verified. Reload the page and try again. · 요청을 확인할 수 없습니다. 페이지를 새로고침한 후 다시 시도해 주세요.');
      if (response.status === 429) throw new Error('Too many requests. Please try again later. · 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
      throw new Error('Could not save your like. Please try again. · 좋아요를 저장할 수 없습니다. 다시 시도해 주세요.');
    }
    const result = await response.json();
    if (typeof result.liked !== 'boolean' || !Number.isSafeInteger(result.likes) || result.likes < 0) {
      throw new Error('Could not save your like. Please reload the page. · 좋아요를 확인할 수 없습니다. 페이지를 새로고침해 주세요.');
    }
    likeButton.setAttribute('aria-pressed', String(result.liked));
    likeAction.value = result.liked ? 'unlike' : 'like';
    const count = likeButton.querySelector('[data-like-count]');
    count.textContent = String(result.likes);
    count.setAttribute('aria-label', `Likes · 좋아요 수: ${result.likes}`);
    const heart = likeButton.querySelector('svg');
    heart.classList.remove('like-pop', 'like-deflate');
    void heart.getBoundingClientRect();
    heart.classList.add(result.liked ? 'like-pop' : 'like-deflate');
    showToast(result.liked ? 'Article liked. · 칼럼에 좋아요를 눌렀습니다.' : 'Like removed. · 좋아요를 취소했습니다.');
  } catch (error) {
    showToast(error instanceof TypeError
      ? 'Could not save your like. Check your connection and try again. · 좋아요를 저장할 수 없습니다. 연결을 확인한 후 다시 시도해 주세요.'
      : error.message || 'Could not save your like. Please try again. · 좋아요를 저장할 수 없습니다. 다시 시도해 주세요.');
  } finally {
    likePending = false;
    likeButton.removeAttribute('aria-busy');
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  commentButton.disabled = true;
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
    showToast('Comment submitted for review. · 댓글이 검토를 위해 제출되었습니다.');
  } catch (error) {
    showToast(error instanceof TypeError
      ? 'Could not submit the comment. Please check your connection and try again. · 댓글을 보낼 수 없습니다. 연결을 확인한 후 다시 시도해 주세요.'
      : error.message || 'Could not submit the comment. Please try again. · 댓글을 보낼 수 없습니다. 다시 시도해 주세요.');
  } finally {
    commentButton.disabled = false;
  }
});
