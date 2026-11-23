const button = document.querySelector('.column-scroll-top');

if (button) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const updateVisibility = () => {
    const scrollTop = Math.max(window.scrollY, document.scrollingElement?.scrollTop ?? 0);
    button.hidden = scrollTop <= 420;
  };

  window.addEventListener('scroll', updateVisibility, { passive: true });
  window.addEventListener('resize', updateVisibility, { passive: true });
  button.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
  });
  updateVisibility();
}
