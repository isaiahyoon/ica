const url = new URL(window.location.href);
if (!url.searchParams.has('lang')) {
  const preference = navigator.languages?.find((value) => /^(en|ko)(-|$)/i.test(value)) || '';
  url.searchParams.set('lang', /^ko(-|$)/i.test(preference) ? 'ko' : 'en');
  window.location.replace(url.href);
}
