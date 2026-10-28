/* Small, decorative photo previews: no controls or slide announcements. */
(() => {
  "use strict";
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const engineering = [
    "images/PCJPB/IMG_1242_edit.jpg",
    "assets/homepage-2026/engineering-field.jpg",
    "images/PCJPB/IMG_0355_edit.jpg"
  ];
  // Curated photographs, resolved through the live publication catalog so that
  // hidden/removed entries disappear and new exports use their current versions.
  const picks = ["DSCF1024_edit_crop.jpg", "DSCF3546_crop.jpg",
    "DSCF1024_edit.jpg", "DSCF3546.jpg", "IMG_2553_edit.jpg", "DSCF0179.jpg"];
  const photos = window.PORTFOLIO_PHOTOS || [];
  const photography = picks.flatMap(file => {
    const photo = photos.find(p => p.file === file && p.visible !== false);
    if (!photo) return [];
    if (photo.publishedImage && !photo.thumbnail) return "";
    const folder = photo.thumbnail ? "thumbnails" : "published";
    const name = photo.thumbnail || photo.file;
    const version = photo.thumbnail ? photo.thumbnailVersion : photo.mediaVersion;
    return [`photography/${folder}/${encodeURIComponent(name)}${version ? `?v=${encodeURIComponent(version)}` : ""}`];
  });

  document.querySelectorAll("[data-home-preview]").forEach(stage => {
    const sources = stage.dataset.homePreview === "engineering" ? engineering : photography;
    if (!sources.length) return;
    const card = stage.closest("a");
    const slides = sources.map((src, i) => {
      const img = i === 0 ? stage.querySelector("img") : document.createElement("img");
      img.alt = "";
      img.decoding = "async";
      img.loading = "lazy";
      img.src = src;
      img.style.opacity = i === 0 ? "1" : "0";
      if (i) stage.appendChild(img);
      return img;
    });
    let current = 0, timer = null, inView = false, hovered = false, focused = false;
    let busy = false;
    const allowed = () => slides.length > 1 && inView && !document.hidden &&
      !motion.matches && !hovered && !focused;
    function schedule() {
      clearTimeout(timer);
      timer = null;
      if (allowed() && !busy) timer = setTimeout(advance, 5000);
    }
    async function advance() {
      timer = null;
      if (!allowed()) return;
      busy = true;
      const next = (current + 1) % slides.length;
      const incoming = slides[next], outgoing = slides[current];
      try {
        // Decode before fading: a missing/slow image never blanks the card.
        await incoming.decode();
        if (!allowed()) { busy = false; schedule(); return; }
        incoming.style.zIndex = "2";
        outgoing.style.zIndex = "1";
        incoming.style.opacity = "1";
        setTimeout(() => {
          outgoing.style.opacity = "0";
          incoming.style.zIndex = "1";
          outgoing.style.zIndex = "0";
          current = next;
          busy = false;
          schedule();
        }, 1000);
      } catch {
        // Remove failed slides and continue with the remaining photographs.
        incoming.remove();
        slides.splice(next, 1);
        if (next < current) current--;
        busy = false;
        schedule();
      }
    }
    card.addEventListener("mouseenter", () => { hovered = true; schedule(); });
    card.addEventListener("mouseleave", () => { hovered = false; schedule(); });
    card.addEventListener("focusin", () => { focused = true; schedule(); });
    card.addEventListener("focusout", () => { focused = false; schedule(); });
    document.addEventListener("visibilitychange", schedule);
    motion.addEventListener("change", schedule);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(entries => {
        inView = entries[0].isIntersecting;
        schedule();
      }, {threshold: 0.15}).observe(stage);
    } else { inView = true; schedule(); }
  });
})();
