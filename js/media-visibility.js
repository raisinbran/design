/* Play project video only while it is visible, including expanded accordion sections. */
document.addEventListener('DOMContentLoaded', function () {
  const videos = document.querySelectorAll('video[data-play-when-visible]');
  if (!('IntersectionObserver' in window)) {
    videos.forEach(video => { video.controls = true; });
    return;
  }
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const video = entry.target;
      if (entry.isIntersecting && !document.hidden) {
        const promise = video.play();
        if (promise && typeof promise.catch === 'function') promise.catch(() => {
          video.controls = true;
        });
      } else {
        video.pause();
      }
    });
  }, {threshold: 0.1});
  videos.forEach(video => observer.observe(video));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) videos.forEach(video => video.pause());
    else videos.forEach(video => {
      if (video.getBoundingClientRect().bottom > 0 &&
          video.getBoundingClientRect().top < window.innerHeight &&
          video.getClientRects().length) {
        const promise = video.play();
        if (promise && typeof promise.catch === 'function') promise.catch(() => {
          video.controls = true;
        });
      }
    });
  });
});
