(() => {
  const videos = [...document.querySelectorAll('[data-scroll-video]')];
  if (!videos.length) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (value, min = 0, max = 1) => Math.min(Math.max(value, min), max);
  let frameRequest = 0;

  const syncVideoToScroll = (video) => {
    const section = video.closest('section') || video.parentElement;
    if (!section || !Number.isFinite(video.duration) || video.duration <= 0) return;

    if (reducedMotion.matches) {
      video.pause();
      video.currentTime = 0;
      return;
    }

    const sectionStart = section.getBoundingClientRect().top + window.scrollY;
    const scrollDistance = Math.max(section.offsetHeight, 1);
    const progress = clamp((window.scrollY - sectionStart) / scrollDistance);
    const nextTime = progress * video.duration;

    video.pause();
    if (Math.abs(video.currentTime - nextTime) > 0.01) {
      video.currentTime = Math.min(nextTime, Math.max(video.duration - 0.001, 0));
    }
  };

  const syncAllVideos = () => {
    frameRequest = 0;
    videos.forEach(syncVideoToScroll);
  };

  const scheduleSync = () => {
    if (!frameRequest) frameRequest = window.requestAnimationFrame(syncAllVideos);
  };

  videos.forEach((video) => {
    video.pause();
    video.addEventListener('loadedmetadata', scheduleSync, { once: true });
    video.addEventListener('durationchange', scheduleSync);
  });

  window.addEventListener('scroll', scheduleSync, { passive: true });
  window.addEventListener('resize', scheduleSync, { passive: true });
  reducedMotion.addEventListener?.('change', scheduleSync);
  scheduleSync();
})();