// Runs before styles/React so a saved dark theme never flashes a light page.
// This stays external to work with the production Content Security Policy.
(() => {
  let preference = 'system';
  try { preference = localStorage.getItem('spendwise-theme') || 'system'; }
  catch { /* Theme selection also works without browser storage. */ }
  const dark = preference === 'dark' || (preference !== 'light' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  const theme = dark ? 'dark' : 'light';
  const color = dark ? '#0d191f' : '#f4f7fa';
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.documentElement.style.backgroundColor = color;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
})();
