(() => {
  const videos = [...document.querySelectorAll('[data-viewport-video]')];
  if (!videos.length) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const setPlayback = (video, shouldPlay) => {
    if (reducedMotion.matches || !shouldPlay) {
      video.pause();
      return;
    }

    const playback = video.play();
    if (playback && typeof playback.catch === 'function') playback.catch(() => {});
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      setPlayback(entry.target, entry.isIntersecting && entry.intersectionRatio >= 0.2);
    });
  }, { threshold: [0, 0.2, 0.5] });

  videos.forEach((video) => {
    video.pause();
    observer.observe(video);
  });
})();