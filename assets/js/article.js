(() => {
  const items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    items.forEach((item) => item.classList.add('visible'));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });
  items.forEach((item) => observer.observe(item));
})();

(() => {
  const article = document.querySelector('.article-content');
  if (!article) return;

  const title = document.querySelector('h1')?.textContent.trim() || document.title;
  const url = location.href.split('#')[0];
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  const sharePanel = document.createElement('section');
  sharePanel.className = 'article-share reveal visible';
  sharePanel.setAttribute('aria-label', 'Condividi questo articolo');
  sharePanel.innerHTML = `
    <div class="article-share__heading">
      <span class="article-share__eyebrow">Condividi</span>
      <p>Pubblica l’articolo sui tuoi social.</p>
    </div>
    <div class="article-share__actions">
      <button class="share-button share-button--native" type="button" hidden>Condividi</button>
      <a class="share-button" href="https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}" target="_blank" rel="noopener noreferrer" aria-label="Condividi su Facebook">Facebook</a>
      <a class="share-button" href="https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}" target="_blank" rel="noopener noreferrer" aria-label="Condividi su LinkedIn">LinkedIn</a>
      <a class="share-button" href="https://wa.me/?text=${encodedTitle}%20${encodedUrl}" target="_blank" rel="noopener noreferrer" aria-label="Condividi su WhatsApp">WhatsApp</a>
      <button class="share-button share-button--copy" type="button">Copia link</button>
    </div>`;
  article.append(sharePanel);

  const nativeButton = sharePanel.querySelector('.share-button--native');
  if (typeof navigator.share === 'function') {
    nativeButton.hidden = false;
    nativeButton.addEventListener('click', async () => {
      try {
        await navigator.share({ title, url });
      } catch (error) {
        if (error.name !== 'AbortError') console.warn('Condivisione non riuscita', error);
      }
    });
  }

  const copyButton = sharePanel.querySelector('.share-button--copy');
  copyButton.addEventListener('click', async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        const field = document.createElement('textarea');
        field.value = url;
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.append(field);
        field.select();
        document.execCommand('copy');
        field.remove();
      }
      copyButton.textContent = 'Link copiato';
      setTimeout(() => { copyButton.textContent = 'Copia link'; }, 2200);
    } catch (error) {
      copyButton.textContent = 'Copia non riuscita';
      setTimeout(() => { copyButton.textContent = 'Copia link'; }, 2200);
    }
  });
})();

(() => {
  const article = document.querySelector('.article-content');
  if (!article) return;

  const apiUrl = 'https://na-creator-like-counter.nacreatorita.workers.dev/likes';
  const fileName = location.pathname.split('/').pop() || 'articolo';
  const articleId = fileName.replace(/\.html?$/i, '').toLowerCase();
  const storageKey = `na-creator-liked:${fileName}`;
  const voterStorageKey = 'na-creator-like-voter';
  const liked = localStorage.getItem(storageKey) === 'true';
  let voterId = localStorage.getItem(voterStorageKey);
  if (!voterId) {
    voterId = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(16).padStart(8, '0')}-0000-4000-8000-${Math.random().toString(16).slice(2).padEnd(12, '0').slice(0, 12)}`;
    localStorage.setItem(voterStorageKey, voterId);
  }

  const panel = document.createElement('section');
  panel.className = 'article-like reveal visible';
  panel.setAttribute('aria-label', 'Valuta questo articolo');
  panel.innerHTML = `
    <div>
      <span class="article-like__eyebrow">Ti è stato utile?</span>
      <p>Lascia un Mi piace a questo articolo.</p>
    </div>
    <button class="article-like__button${liked ? ' is-liked' : ''}" type="button" aria-pressed="${liked}">
      <span class="article-like__icon" aria-hidden="true">♥</span>
      <span class="article-like__label">${liked ? 'Ti piace' : 'Mi piace'}</span>
      <span class="article-like__count" aria-live="polite" aria-label="Conteggio Mi piace">…</span>
    </button>`;
  article.append(panel);

  const button = panel.querySelector('button');
  const countElement = button.querySelector('.article-like__count');

  const requestLikes = async (options = {}) => {
    const response = await fetch(`${apiUrl}?article=${encodeURIComponent(articleId)}`, options);
    if (!response.ok) throw new Error(`Errore contatore: ${response.status}`);
    return response.json();
  };

  const updateCount = (count) => {
    countElement.textContent = new Intl.NumberFormat('it-IT').format(Number(count) || 0);
  };

  const syncLike = (nextLiked) => requestLikes({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ voterId, liked: nextLiked })
  });

  (async () => {
    try {
      const data = liked ? await syncLike(true) : await requestLikes();
      updateCount(data.count);
    } catch (error) {
      countElement.textContent = '—';
      console.warn('Contatore Mi piace non disponibile', error);
    }
  })();

  button.addEventListener('click', async () => {
    if (button.disabled) return;
    const nextLiked = button.getAttribute('aria-pressed') !== 'true';
    button.disabled = true;
    button.setAttribute('aria-pressed', String(nextLiked));
    button.classList.toggle('is-liked', nextLiked);
    button.querySelector('.article-like__label').textContent = nextLiked ? 'Ti piace' : 'Mi piace';
    localStorage.setItem(storageKey, String(nextLiked));

    try {
      const data = await syncLike(nextLiked);
      updateCount(data.count);
    } catch (error) {
      button.setAttribute('aria-pressed', String(!nextLiked));
      button.classList.toggle('is-liked', !nextLiked);
      button.querySelector('.article-like__label').textContent = !nextLiked ? 'Ti piace' : 'Mi piace';
      localStorage.setItem(storageKey, String(!nextLiked));
      console.warn('Aggiornamento Mi piace non riuscito', error);
    } finally {
      button.disabled = false;
    }
  });
})();
