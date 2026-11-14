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
    const focused = card.contains(document.activeElement) ? document.activeElement : null;
    grid.insertBefore(card, remaining[position - 1] ?? null);
    refresh();
    if (focused) {
      (focused.disabled ? card.querySelector('[data-order-position]') : focused).focus({ preventScroll: true });
      card.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
    status.textContent = dirty
      ? `Moved to position ${position}. Not saved yet. · ${position}번째로 이동했습니다. 아직 저장되지 않았습니다.`
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
    } else if (event.key === 'Escape' && dragged) {
      event.preventDefault();
      clearDrag();
    }
  });
  function dropTarget(event) {
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-order-id]');
    return target && grid.contains(target) && target !== dragged.card ? target : null;
  }

  function clearDrag() {
    const previous = dragged;
    dragged = null;
    grid.querySelectorAll('.is-dragging, .is-drop-target').forEach((card) => {
      card.classList.remove('is-dragging', 'is-drop-target');
    });
    if (previous?.handle.hasPointerCapture(previous.pointerId)) {
      previous.handle.releasePointerCapture(previous.pointerId);
    }
  }

  grid.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest('[data-order-drag]');
    if (busy || dragged || !handle || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    handle.focus({ preventScroll: true });
    dragged = {
      card: handle.closest('[data-order-id]'), handle, pointerId: event.pointerId,
      x: event.clientX, y: event.clientY, active: false,
    };
    handle.setPointerCapture(event.pointerId);
  });
  grid.addEventListener('pointermove', (event) => {
    if (!dragged || event.pointerId !== dragged.pointerId) return;
    if (!dragged.active && Math.hypot(event.clientX - dragged.x, event.clientY - dragged.y) < 6) return;
    event.preventDefault();
    dragged.active = true;
    dragged.card.classList.add('is-dragging');
    grid.querySelectorAll('.is-drop-target').forEach((card) => card.classList.remove('is-drop-target'));
    dropTarget(event)?.classList.add('is-drop-target');
  });
  grid.addEventListener('pointerup', (event) => {
    if (!dragged || event.pointerId !== dragged.pointerId) return;
    const card = dragged.card;
    const target = dragged.active ? dropTarget(event) : null;
    clearDrag();
    if (target) {
      const remaining = [...grid.children].filter((item) => item !== card);
      const bounds = target.getBoundingClientRect();
      const after = event.clientX >= bounds.left + bounds.width / 2;
      move(card, remaining.indexOf(target) + (after ? 2 : 1));
    }
  });
  const cancelDrag = (event) => {
    if (dragged && event.pointerId === dragged.pointerId) clearDrag();
  };
  grid.addEventListener('pointercancel', cancelDrag);
  grid.addEventListener('lostpointercapture', cancelDrag);

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
