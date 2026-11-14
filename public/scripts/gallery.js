const viewer = document.querySelector('.gallery-viewer');
if (viewer && typeof viewer.showModal === 'function') {
  const image = viewer.querySelector('img');
  const caption = viewer.querySelector('.gallery-viewer-caption');
  const previous = viewer.querySelector('[data-gallery-previous]');
  const next = viewer.querySelector('[data-gallery-next]');
  const status = viewer.querySelector('[data-gallery-viewer-status]');
  const initialPage = Number(viewer.dataset.page);
  const totalPages = Number(viewer.dataset.pages);
  const links = [...document.querySelectorAll('[data-gallery-photo]')];
  const pages = new Map([[initialPage, links]]);
  let currentPage = initialPage;
  let currentIndex = 0;
  let request = null;
  let pressedBackdrop = false;

  function returnToPhoto(link) {
    link.focus({ preventScroll: true });
    link.closest('figure').scrollIntoView({ block: 'center', behavior: 'instant' });
  }

  const returnedPhoto = links.find((link) => `#${link.closest('figure').id}` === window.location.hash);
  if (returnedPhoto) {
    window.addEventListener('pageshow', () => returnToPhoto(returnedPhoto), { once: true });
  }

  function outsideViewer(event) {
    const bounds = viewer.getBoundingClientRect();
    return event.target === viewer &&
      (event.clientX < bounds.left || event.clientX > bounds.right ||
       event.clientY < bounds.top || event.clientY > bounds.bottom);
  }

  function updateControls() {
    previous.disabled = Boolean(request) || (currentPage === 1 && currentIndex === 0);
    next.disabled = Boolean(request) ||
      (currentPage === totalPages && currentIndex === pages.get(currentPage).length - 1);
  }

  function showPhoto(pageNumber, index) {
    const pageLinks = pages.get(pageNumber);
    const link = pageLinks[index];
    currentPage = pageNumber;
    currentIndex = index;
    image.src = link.href;
    image.alt = link.querySelector('img').alt;
    caption.replaceChildren(link.closest('figure').querySelector('figcaption').cloneNode(true));
    status.textContent = `Photo ${index + 1}/${pageLinks.length} · Page ${pageNumber}/${totalPages} · 사진 ${index + 1}/${pageLinks.length} · 페이지 ${pageNumber}/${totalPages}`;
    updateControls();
  }

  async function movePhoto(direction) {
    if (request || !viewer.open) return;
    let pageNumber = currentPage;
    let index = currentIndex + direction;
    if (index < 0) pageNumber--;
    else if (index >= pages.get(currentPage).length) pageNumber++;
    if (pageNumber < 1 || pageNumber > totalPages) return;

    const controller = new AbortController();
    request = controller;
    updateControls();
    try {
      if (!pages.has(pageNumber)) {
        status.textContent = 'Loading photos... · 사진을 불러오는 중...';
        const response = await fetch(`/gallery?page=${pageNumber}`, {
          headers: { Accept: 'text/html' }, signal: controller.signal,
        });
        if (!response.ok) throw new Error('Could not load photos. Try again. · 사진을 불러올 수 없습니다. 다시 시도해 주세요.');
        const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
        const pageViewer = parsed.querySelector('.gallery-viewer');
        const pageLinks = [...parsed.querySelectorAll('[data-gallery-photo]')];
        if (Number(pageViewer?.dataset.page) !== pageNumber || !pageLinks.length) {
          throw new Error('The gallery changed. Close the viewer and reload the page. · 갤러리가 변경되었습니다. 사진 보기를 닫고 새로고침해 주세요.');
        }
        pages.set(pageNumber, pageLinks);
      }
      if (request !== controller || !viewer.open) return;
      if (pageNumber !== currentPage) index = direction > 0 ? 0 : pages.get(pageNumber).length - 1;
      showPhoto(pageNumber, index);
    } catch (error) {
      if (request === controller && error.name !== 'AbortError') {
        status.textContent = error.message || 'Could not load photos. Try again. · 사진을 불러올 수 없습니다. 다시 시도해 주세요.';
      }
    } finally {
      if (request === controller) {
        request = null;
        updateControls();
      }
    }
  }

  links.forEach((link, index) => {
    link.addEventListener('click', (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      showPhoto(initialPage, index);
      viewer.showModal();
    });
  });
  previous.addEventListener('click', () => movePhoto(-1));
  next.addEventListener('click', () => movePhoto(1));
  viewer.addEventListener('pointerdown', (event) => {
    pressedBackdrop = outsideViewer(event);
  });
  viewer.addEventListener('click', (event) => {
    if (pressedBackdrop && outsideViewer(event)) viewer.close();
    pressedBackdrop = false;
  });
  viewer.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      viewer.close();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      return movePhoto(event.key === 'ArrowLeft' ? -1 : 1);
    }
  });
  viewer.addEventListener('close', () => {
    request?.abort();
    request = null;
    image.removeAttribute('src');
    const link = pages.get(currentPage)[currentIndex];
    if (currentPage !== initialPage) {
      window.location.assign(`/gallery?page=${currentPage}#${encodeURIComponent(link.closest('figure').id)}`);
    } else {
      returnToPhoto(link);
    }
  });
}
