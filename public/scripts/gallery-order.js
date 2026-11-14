const orderForm = document.querySelector('[data-gallery-order]');
if (orderForm) {
  const grid = orderForm.querySelector('[data-order-grid]');
  const status = orderForm.querySelector('[data-order-status]');
  const save = orderForm.querySelector('[data-order-save]');
  const reload = orderForm.querySelector('[data-order-reload]');
  const initialOrder = [...grid.children].map((card) => card.dataset.orderId).join(',');
  let dirty = false;
  let busy = false;
  let dragged = null;

  function refresh() {
    const cards = [...grid.children];
    dirty = cards.map((card) => card.dataset.orderId).join(',') !== initialOrder;
    cards.forEach((card, index) => {
      card.querySelector('[data-order-number]').textContent = index + 1;
      card.querySelector('[data-order-position]').value = index + 1;
      card.querySelector('[data-order-position]').disabled = busy;
      card.querySelector('[data-order-earlier]').disabled = busy || index === 0;
      card.querySelector('[data-order-later]').disabled = busy || index === cards.length - 1;
      card.querySelector('[data-order-move]').disabled = busy;
      card.querySelector('[data-order-drag]').disabled = busy;
      card.querySelector('[data-order-drag]').setAttribute('aria-label', `Drag photo ${index + 1} · 사진 ${index + 1} 끌어서 이동`);
      card.querySelector('[data-order-position]').setAttribute('aria-label', `Move photo ${index + 1} to position · 사진 ${index + 1} 이동할 순서`);
    });
    save.disabled = busy || !dirty;
  }

  function move(card, position) {
    if (busy) return;
    const cards = [...grid.children];
    if (!Number.isInteger(position) || position < 1 || position > cards.length) {
      status.textContent = `Enter a whole position from 1 to ${cards.length}. · 1부터 ${cards.length}까지의 정수 순서를 입력해 주세요.`;
      return;
    }
    const remaining = cards.filter((item) => item !== card);
    grid.insertBefore(card, remaining[position - 1] ?? null);
    refresh();
    status.textContent = dirty
      ? `Photo moved to position ${position}. Save order to publish your changes. · 사진이 ${position}번째로 이동했습니다. 순서를 저장하면 공개 갤러리에 적용됩니다.`
      : 'Original order restored. No changes to save. · 원래 순서로 돌아왔습니다. 저장할 변경 사항이 없습니다.';
  }

  grid.addEventListener('click', (event) => {
    const card = event.target.closest('[data-order-id]');
    if (!card || busy) return;
    const index = [...grid.children].indexOf(card);
    if (event.target.closest('[data-order-earlier]')) move(card, index);
    else if (event.target.closest('[data-order-later]')) move(card, index + 2);
    else if (event.target.closest('[data-order-move]')) move(card, card.querySelector('[data-order-position]').valueAsNumber);
  });
  grid.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target.matches('[data-order-position]')) {
      event.preventDefault();
      move(event.target.closest('[data-order-id]'), event.target.valueAsNumber);
    }
  });
  grid.addEventListener('dragstart', (event) => {
    if (busy || !event.target.closest('[data-order-drag]')) {
      event.preventDefault();
      return;
    }
    dragged = event.target.closest('[data-order-id]');
    dragged.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', dragged.dataset.orderId);
  });
  grid.addEventListener('dragover', (event) => {
    const target = event.target.closest('[data-order-id]');
    if (!dragged || !target || target === dragged || busy) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    grid.querySelectorAll('.is-drop-target').forEach((card) => card.classList.remove('is-drop-target'));
    target.classList.add('is-drop-target');
  });
  grid.addEventListener('drop', (event) => {
    const target = event.target.closest('[data-order-id]');
    if (!dragged || !target || target === dragged || busy) return;
    event.preventDefault();
    const remaining = [...grid.children].filter((card) => card !== dragged);
    const bounds = target.getBoundingClientRect();
    const after = event.clientX >= bounds.left + bounds.width / 2;
    move(dragged, remaining.indexOf(target) + (after ? 2 : 1));
  });
  grid.addEventListener('dragend', () => {
    grid.querySelectorAll('.is-dragging, .is-drop-target').forEach((card) => {
      card.classList.remove('is-dragging', 'is-drop-target');
    });
    dragged = null;
  });

  function confirmDiscard(event) {
    if (dirty && !window.confirm('Discard your unsaved photo order? · 저장하지 않은 사진 순서를 취소할까요?')) {
      event.preventDefault();
    } else {
      dirty = false;
    }
  }
  orderForm.querySelector('[data-order-cancel]').addEventListener('click', confirmDiscard);
  reload.addEventListener('click', confirmDiscard);
  window.addEventListener('beforeunload', (event) => {
    if (dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  orderForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !dirty) return;
    busy = true;
    refresh();
    status.textContent = 'Saving photo order... · 사진 순서를 저장하는 중...';
    try {
      const result = await galleryRequest('/admin/gallery/order', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _csrf: orderForm.elements._csrf.value,
          revision: orderForm.elements.revision.value,
          ids: [...grid.children].map((card) => card.dataset.orderId),
        }),
      });
      dirty = false;
      window.location.assign(result.location);
    } catch (error) {
      status.textContent = error.message;
      reload.hidden = false;
      busy = false;
      refresh();
    }
  });
}
