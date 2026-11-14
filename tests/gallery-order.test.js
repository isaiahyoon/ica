import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

async function editor({ request, confirm = () => true } = {}) {
  const document = { activeElement: null };
  const node = () => ({
    events: new Map(), disabled: false, hidden: false,
    addEventListener(name, handler) { this.events.set(name, handler); },
  });
  const cards = [1, 2, 3].map((number) => {
    const classes = new Set();
    const card = {
      dataset: { orderId: `photo-${number}` },
      classList: {
        add(...names) { names.forEach((name) => classes.add(name)); },
        remove(...names) { names.forEach((name) => classes.delete(name)); },
        contains(name) { return classes.has(name); },
      },
      getBoundingClientRect() { return { left: 0, width: 100 }; },
      scrollIntoView() {},
      closest(selector) { return selector === '[data-order-id]' ? this : null; },
    };
    const controls = new Map([
      'number', 'position', 'earlier', 'later', 'move', 'drag',
    ].map((name) => [`[data-order-${name}]`, {
      value: String(number), disabled: false,
      get valueAsNumber() { return this.value === '' ? NaN : Number(this.value); },
      setAttribute() {},
      setPointerCapture(id) { this.captured = id; },
      hasPointerCapture(id) { return this.captured === id; },
      releasePointerCapture() { delete this.captured; },
      focus() { document.activeElement = this; },
      matches(selector) { return selector === `[data-order-${name}]`; },
      closest(selector) {
        if (selector === '[data-order-id]') return card;
        return this.matches(selector) ? this : null;
      },
    }]));
    controls.get('[data-order-earlier]').disabled = number === 1;
    controls.get('[data-order-later]').disabled = number === 3;
    card.querySelector = (selector) => controls.get(selector);
    card.contains = (element) => [...controls.values()].includes(element);
    return card;
  });
  const grid = {
    ...node(), children: [...cards],
    contains(card) { return this.children.includes(card); },
    insertBefore(card, target) {
      this.children.splice(this.children.indexOf(card), 1);
      this.children.splice(target ? this.children.indexOf(target) : this.children.length, 0, card);
    },
    querySelectorAll(selector) {
      return this.children.filter((card) => selector.split(', ').some((name) => card.classList.contains(name.slice(1))));
    },
  };
  const status = {};
  const save = { ...node(), disabled: true };
  const reload = { ...node(), hidden: true };
  const cancel = node();
  const form = {
    ...node(), elements: { _csrf: { value: 'csrf' }, revision: { value: 'revision' } },
    querySelector(selector) {
      return {
        '[data-order-grid]': grid, '[data-order-status]': status,
        '[data-order-save]': save, '[data-order-reload]': reload, '[data-order-cancel]': cancel,
      }[selector];
    },
  };
  const window = { ...node(), confirm, location: { assign(url) { window.destination = url; } } };
  document.querySelector = () => form;
  document.elementFromPoint = () => document.dropTarget;
  const requests = [];
  runInNewContext(await fs.readFile(new URL('../public/scripts/gallery-order.js', import.meta.url), 'utf8'), {
    document, window,
    galleryRequest: async (url, options) => {
      requests.push({ url, ...JSON.parse(options.body) });
      return request ? request() : { location: '/admin/gallery?notice=ordered' };
    },
  });
  return { cards, grid, status, save, reload, cancel, form, window, document, requests };
}

const ids = (state) => state.grid.children.map((card) => card.dataset.orderId);
const event = (target) => ({ target, preventDefault() { this.prevented = true; } });
const control = (card, name) => card.querySelector(`[data-order-${name}]`);

test('photo order buttons and Enter-key position moves stay local until save and reject invalid positions', async () => {
  const state = await editor();
  const first = state.cards[0];
  state.document.activeElement = control(first, 'later');
  state.grid.events.get('click')(event(control(first, 'later')));
  assert.deepEqual(ids(state), ['photo-2', 'photo-1', 'photo-3']);
  assert.equal(state.save.disabled, false);
  assert.equal(state.document.activeElement, control(first, 'later'));
  assert.deepEqual(state.requests, []);
  control(first, 'position').value = '3';
  state.grid.events.get('keydown')({ ...event(control(first, 'position')), key: 'Enter' });
  assert.deepEqual(ids(state), ['photo-2', 'photo-3', 'photo-1']);
  state.grid.events.get('click')(event(control(first, 'earlier')));
  state.grid.events.get('click')(event(control(first, 'earlier')));
  assert.deepEqual(ids(state), ['photo-1', 'photo-2', 'photo-3']);
  assert.equal(state.save.disabled, true);
  for (const value of ['0', '4', '1.5', '']) {
    control(first, 'position').value = value;
    state.grid.events.get('click')(event(control(first, 'move')));
    assert.deepEqual(ids(state), ['photo-1', 'photo-2', 'photo-3']);
    assert.match(state.status.textContent, /Enter a whole position/);
  }
  control(first, 'position').value = '3';
  state.grid.events.get('click')(event(control(first, 'move')));
  await state.form.events.get('submit')(event(state.form));
  assert.deepEqual(state.requests, [{
    url: '/admin/gallery/order', _csrf: 'csrf', revision: 'revision', ids: ['photo-2', 'photo-3', 'photo-1'],
  }]);
  assert.equal(state.window.destination, '/admin/gallery?notice=ordered');
});

test('dragging updates the order while cancel warnings and failed saves preserve unsaved changes', async () => {
  let discard = false;
  const state = await editor({
    confirm: () => discard,
    request: async () => { throw new Error('The gallery changed. Reload before saving.'); },
  });
  state.grid.events.get('pointerdown')({
    ...event(control(state.cards[0], 'drag')), pointerId: 1, button: 0, isPrimary: true, clientX: 0, clientY: 0,
  });
  state.document.dropTarget = state.cards[2];
  const drop = { ...event(control(state.cards[0], 'drag')), pointerId: 1, clientX: 75, clientY: 10 };
  state.grid.events.get('pointermove')(drop);
  state.grid.events.get('pointerup')(drop);
  assert.deepEqual(ids(state), ['photo-2', 'photo-3', 'photo-1']);
  assert.equal(state.cards[0].classList.contains('is-dragging'), false);
  const cancel = event(state.cancel);
  state.cancel.events.get('click')(cancel);
  assert.equal(cancel.prevented, true);
  const leave = event();
  state.window.events.get('beforeunload')(leave);
  assert.equal(leave.prevented, true);
  await state.form.events.get('submit')(event(state.form));
  assert.match(state.status.textContent, /gallery changed/);
  assert.equal(state.reload.hidden, false);
  assert.equal(state.save.disabled, false);
  assert.deepEqual(ids(state), ['photo-2', 'photo-3', 'photo-1']);
  discard = true;
  state.reload.events.get('click')(event(state.reload));
  const afterDiscard = event();
  state.window.events.get('beforeunload')(afterDiscard);
  assert.equal(afterDiscard.prevented, undefined);
});

test('tapping a drag handle and canceling a pointer drag leave the order unchanged', async () => {
  const state = await editor();
  const handle = control(state.cards[0], 'drag');
  const pointer = { ...event(handle), pointerId: 1, button: 0, isPrimary: true, clientX: 0, clientY: 0 };
  state.document.dropTarget = state.cards[2];
  state.grid.events.get('pointerdown')(pointer);
  state.grid.events.get('pointermove')({ ...pointer, clientX: 3, clientY: 3 });
  state.grid.events.get('pointerup')({ ...pointer, clientX: 3, clientY: 3 });
  assert.deepEqual(ids(state), ['photo-1', 'photo-2', 'photo-3']);
  state.grid.events.get('pointerdown')(pointer);
  state.grid.events.get('pointermove')({ ...pointer, clientX: 75, clientY: 10 });
  state.grid.events.get('pointercancel')({ pointerId: 2 });
  assert.equal(handle.captured, 1);
  state.grid.events.get('pointercancel')({ pointerId: 1 });
  assert.equal(handle.captured, undefined);
  assert.equal(state.cards[0].classList.contains('is-dragging'), false);
  assert.deepEqual(ids(state), ['photo-1', 'photo-2', 'photo-3']);
  assert.equal(state.save.disabled, true);
});
