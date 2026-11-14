const viewer = document.querySelector('.gallery-viewer');
if (viewer && typeof viewer.showModal === 'function') {
  document.querySelectorAll('[data-gallery-photo]').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const image = viewer.querySelector('img');
      image.src = link.href;
      image.alt = link.querySelector('img').alt;
      viewer.querySelector('.gallery-viewer-caption').replaceChildren(
        link.closest('figure').querySelector('figcaption').cloneNode(true),
      );
      viewer.showModal();
    });
  });
  viewer.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      viewer.close();
    }
  });
  viewer.addEventListener('close', () => viewer.querySelector('img').removeAttribute('src'));
}
