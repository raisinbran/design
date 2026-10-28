/* Decorative homepage previews with catalog-based, self-healing photography picks. */
(() => {
  "use strict";
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const engineering = [
    "images/PCJPB/IMG_1242_edit.jpg",
    "assets/homepage-2026/engineering-field.jpg",
    "images/PCJPB/IMG_0355_edit.jpg"
  ];

  // Curated visual preferences, spanning landscape, architecture, wildlife,
  // night scenes and light. A catalog entry is required for every photo.
  const preferred = [
    "DSCF0179_crop.jpg", "DSCF1024_edit_crop.jpg",
    "DSCF3655_crop.jpg", "DSCF2848_crop.jpg",
    "20220511_191505848_iOS_crop.jpg", "DSCF1359_crop.jpg",
    "DSCF1464_crop.jpg", "IMG_8889_edit_crop.jpg",
    "20241012_222059210_iOS_crop.jpg", "DSCF1520_crop.jpg",
    "DSCF3546_crop.jpg", "DSCF1972_crop.jpg"
  ];
  const desiredCount = 12;
  const catalog = (window.PORTFOLIO_PHOTOS || []).filter(photo =>
    photo.visible !== false && photo.file && photo.alt);
  const byName = new Map(catalog.map(photo => [photo.file, photo]));
  const photographyCandidates = [
    ...preferred.map(file => byName.get(file)).filter(Boolean),
    ...catalog.filter(photo => !preferred.includes(photo.file))
  ];
  const photoUrl = photo => {
    if (photo.publishedImage && !photo.thumbnail) return "";
    const name = photo.thumbnail || photo.file;
    const folder = photo.thumbnail ? "thumbnails" : "published";
    const version = photo.thumbnail ? photo.thumbnailVersion : photo.mediaVersion;
    return "photography/" + folder + "/" + encodeURIComponent(name) +
      (version ? "?v=" + encodeURIComponent(version) : "");
  };

  document.querySelectorAll("[data-home-preview]").forEach(stage => {
    const isPhotography = stage.dataset.homePreview === "photography";
    const card = stage.closest("a");
    const pool = isPhotography
      ? photographyCandidates.map(photoUrl)
      : engineering;
    const slides = [];
    let nextCandidate = 0;
    let current = 0;
    let timer = null;
    let inView = false;
    let hovered = false;
    let focused = false;
    const canHover = window.matchMedia("(hover: hover) and (pointer: fine)");
    let busy = false;
    const used = new Set();

    function createSlide(source) {
      const image = document.createElement("img");
      image.alt = "";
      image.decoding = "async";
      // Decode detached slides immediately; lazy images can wait for DOM visibility.
      image.loading = "eager";
      image.src = source;
      image.style.opacity = "0";
      image.style.zIndex = "0";
      return image;
    }

    // Validate candidates before display. Broken or delisted items are replaced
    // from the remaining published catalog, without introducing a blank slide.
    async function addNextPhoto() {
      while (nextCandidate < pool.length) {
        const source = pool[nextCandidate++];
        if (used.has(source)) continue;
        used.add(source);
        const image = createSlide(source);
        try {
          await image.decode();
          slides.push(image);
          stage.appendChild(image);
          return true;
        } catch {
          // Invalid images never enter the rotating set.
        }
      }
      return false;
    }

    async function refill() {
      const target = isPhotography ? Math.min(15, desiredCount) : pool.length;
      while (slides.length < target && await addNextPhoto()) {
        // Fill from currently published photos, excluding broken files.
      }
    }

    function allowed() {
      return slides.length > 1 && inView && !document.hidden &&
        !motion.matches && (!canHover.matches || !hovered) && !focused;
    }
    function schedule() {
      clearTimeout(timer);
      timer = null;
      if (allowed() && !busy) timer = setTimeout(advance, 3500);
    }

    async function advance() {
      timer = null;
      if (!allowed()) return;
      busy = true;
      let next = (current + 1) % slides.length;
      const incoming = slides[next];
      const outgoing = slides[current];
      try {
        // Revalidate on rotation in case an asset disappears after initial load.
        await incoming.decode();
        if (!allowed()) return;
        incoming.style.zIndex = "2";
        outgoing.style.zIndex = "1";
        incoming.style.opacity = "1";
        await new Promise(resolve => setTimeout(resolve, 1000));
        outgoing.style.opacity = "0";
        incoming.style.zIndex = "1";
        outgoing.style.zIndex = "0";
        current = next;
      } catch {
        incoming.remove();
        slides.splice(next, 1);
        if (next < current) current--;
        if (current >= slides.length) current = 0;
        await refill();
      } finally {
        busy = false;
        schedule();
      }
    }

    // Touch devices synthesize hover events; only pause for an actual mouse.
    card.addEventListener("mouseenter", () => { if (canHover.matches) { hovered = true; schedule(); } });
    card.addEventListener("mouseleave", () => { hovered = false; schedule(); });
    card.addEventListener("focusin", () => { focused = true; schedule(); });
    card.addEventListener("focusout", () => { focused = false; schedule(); });
    document.addEventListener("visibilitychange", schedule);
    motion.addEventListener("change", schedule);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(entries => {
        inView = entries[0].isIntersecting;
        schedule();
      }, { threshold: 0.15 }).observe(stage);
    } else {
      inView = true;
    }

    (async () => {
      // Show the first two verified slides immediately instead of waiting for
      // all 12 photos to download on a mobile connection.
      await addNextPhoto();
      await addNextPhoto();
      // Remove the static fallback only after verified replacements are ready.
      if (slides.length) {
        stage.querySelectorAll("img").forEach(image => {
          if (!slides.includes(image)) image.remove();
        });
        slides[0].style.opacity = "1";
        slides[0].style.zIndex = "1";
      }
      schedule();
      // Remaining slides populate without blocking rotation startup.
      refill().then(schedule);
    })();
  });
})();
