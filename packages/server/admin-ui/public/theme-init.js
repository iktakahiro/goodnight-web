// Sets the light or dark class on <html> before the admin UI renders, so the
// page does not flash. Loaded as a blocking file (the admin CSP allows only
// 'self' scripts, no inline code). Same rules as
// src/shared/theme/color-scheme.ts.
(function () {
  var preference = null;
  try {
    preference = localStorage.getItem('goodnight-web.admin.theme');
  } catch {
    // Storage is unavailable; follow the system setting.
  }
  var dark =
    preference === 'dark' ||
    (preference !== 'light' &&
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
})();
