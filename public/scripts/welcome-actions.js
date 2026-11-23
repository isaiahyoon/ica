const actions = document.querySelector('[data-welcome-actions]');
const gallery = actions.querySelector('[href="/gallery"]');
const articles = actions.querySelector('[href="/articles"]');
const desktop = window.matchMedia('(min-width: 681px)');

function arrangeActions() {
  const first = desktop.matches ? articles : gallery;
  const second = desktop.matches ? gallery : articles;
  if (first.nextElementSibling === second) return;
  const focused = document.activeElement === first;
  actions.insertBefore(first, second);
  if (focused) first.focus({ preventScroll: true });
}

desktop.addEventListener('change', arrangeActions);
arrangeActions();
