(() => {
  document.querySelectorAll('.nav-links').forEach((menu) => {
    if (menu.querySelector('a[href$="web-app.html"]')) return;

    const link = document.createElement('a');
    link.href = '/web-app.html';
    link.textContent = 'Web App';
    const anchor = menu.querySelector('a[href$="articoli.html"], a[href$="download.html"], .nav-cta');
    menu.insertBefore(link, anchor || null);
  });

  const toggle = document.querySelector('.menu-toggle');
  const menu = document.querySelector('.nav-links');
  if (!toggle || !menu) return;

  toggle.addEventListener('click', () => {
    const isOpen = menu.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });

  menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    menu.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }));
})();
