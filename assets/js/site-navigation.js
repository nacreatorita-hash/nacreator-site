(() => {
  const toggle = document.querySelector('.menu-toggle');
  const menu = document.querySelector('.nav-links');
  if (!toggle || !menu) return;

  const header = toggle.closest('header');
  const links = [...menu.querySelectorAll('a')];

  const setOpen = (open, { focusToggle = false } = {}) => {
    menu.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Chiudi il menu' : 'Apri il menu');
    document.body.classList.toggle('menu-open', open);

    if (open) {
      links[0]?.focus();
    } else if (focusToggle) {
      toggle.focus();
    }
  };

  toggle.addEventListener('click', () => {
    setOpen(!menu.classList.contains('open'));
  });

  links.forEach((link) => link.addEventListener('click', () => setOpen(false)));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menu.classList.contains('open')) {
      setOpen(false, { focusToggle: true });
    }
  });

  document.addEventListener('click', (event) => {
    if (menu.classList.contains('open') && header && !header.contains(event.target)) {
      setOpen(false);
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 950 && menu.classList.contains('open')) setOpen(false);
  });

  setOpen(false);
})();
