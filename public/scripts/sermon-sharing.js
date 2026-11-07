document.addEventListener('click', async (event) => {
  const share = event.target.closest('.share-link');
  const copy = event.target.closest('.copy-link');
  const link = share || copy;
  if (!link) return;

  event.preventDefault();
  const url = new URL(link.getAttribute('href'), location.origin).href;

  if (share && navigator.share) {
    try {
      const title = link.dataset.shareTitle;
      await navigator.share({ title, text: title, url });
      return;
    } catch (error) {
      if (error.name === 'AbortError') return;
    }
  }

  if (!navigator.clipboard) {
    location.href = url;
    return;
  }

  try {
    await navigator.clipboard.writeText(url);
  } catch {
    location.href = url;
    return;
  }

  const originalContent = link.innerHTML;
  link.textContent = link.dataset.copied;
  setTimeout(() => { link.innerHTML = originalContent; }, 2000);
});
