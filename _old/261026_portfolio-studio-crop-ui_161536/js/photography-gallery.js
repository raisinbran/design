(() => {
  "use strict";

  const gallery = document.getElementById("photo-gallery");
  if (!gallery) return;

  const allPhotos = (window.PORTFOLIO_PHOTOS || []).filter(
    p => p.visible !== false && p.file && p.alt
  );
  let photos = allPhotos;
  const ratios = window.PHOTO_ASPECT_RATIOS || {};

  const path = name => "photography/published/" + encodeURIComponent(name);

  function ratioAt(index) {
    const p = photos[index];
    const ratio = ratios[p.file];
    return Number.isFinite(ratio) && ratio > 0 ? ratio : 1.5;
  }

  function priorityValue(photo) {
    const raw = String(photo.displayPriority || "").trim().toLowerCase();
    if (raw === "low") return -1;
    if (raw === "portraitboost") return 2;
    if (raw === "featured") return 3;
    if (photo.featured === true) return 3; // backward compatibility
    return 0; // "normal" or omitted
  }

  function desiredPortraitMin(photo) {
    const p = priorityValue(photo);
    if (p >= 3) return 470;
    if (p >= 2) return 445;
    return 410;
  }

  function desiredRowHeight(rowPhotos, isPortraitRow) {
    let desired = isPortraitRow ? 470 : 295;
    let maxPriority = 0;
    let hasLow = false;

    rowPhotos.forEach(photo => {
      const p = priorityValue(photo);
      maxPriority = Math.max(maxPriority, p);
      if (p < 0) hasLow = true;
    });

    if (isPortraitRow && maxPriority >= 2) desired += 55;
    else if (!isPortraitRow && maxPriority >= 3) desired += 20;

    if (hasLow) desired -= isPortraitRow ? 20 : 10;
    return desired;
  }

  const allTiles = allPhotos.map((photo, index) => {
    const tile = document.createElement("div");
    
    tile.className = "photo-tile";
    
    tile.dataset.priority = String(photo.displayPriority || (photo.featured ? "featured" : "normal"));

    const img = document.createElement("img");
    img.loading = "lazy";
    img.decoding = "async";
    img.src = path(photo.file);
    img.alt = photo.alt;

    /* portfolio-crop:stage6c */
    // Framing is applied inside existing justified-row tiles, without altering
    // source photographs or tile dimensions.
    const galleryZoom = Number(photo.galleryZoom ?? 1);
    const focusX = Number(photo.focusX ?? 0.5);
    const focusY = Number(photo.focusY ?? 0.5);
    if (Number.isFinite(galleryZoom) && galleryZoom > 1 && galleryZoom <= 3 &&
        Number.isFinite(focusX) && focusX >= 0 && focusX <= 1 &&
        Number.isFinite(focusY) && focusY >= 0 && focusY <= 1) {
      const bound = (galleryZoom - 1) / 2;
      const shiftX = Math.max(-bound, Math.min(bound, galleryZoom * (0.5 - focusX)));
      const shiftY = Math.max(-bound, Math.min(bound, galleryZoom * (0.5 - focusY)));
      img.style.setProperty("transform",
        `translate(${shiftX * 100}%, ${shiftY * 100}%) scale(${galleryZoom})`,
        "important");
      img.style.transformOrigin = "center center";
      img.style.objectFit = "cover";
    }


    tile.appendChild(img);
    
    return tile;
  });
  let tiles = allTiles;

  // Edit photo ordering / visibility / displayPriority in photography-items.js.
  // R30 adds optional displayPriority:
  //   "low"           = allow somewhat smaller presentation
  //   "normal"        = default
  //   "portraitBoost" = try to keep portrait photos more legible on desktop
  //   "featured"      = strongest emphasis
  // Existing featured: true remains supported.
  function render() {
    const width = gallery.clientWidth;
    if (!width) return;

    const gap = width < 720 ? 8 : 12;
    const target = width < 1024 ? 250 : 295;
    const n = tiles.length;
    const r = photos.map((_, i) => ratioAt(i));

    gallery.replaceChildren();

    function addRow(begin, end, height, fullWidth) {
      const wrapper = document.createElement("div");
      wrapper.className = "photo-justified-row";
      wrapper.style.gap = gap + "px";

      let hasPortrait = false;
      let maxPriority = 0;
      for (let i = begin; i < end; i++) {
        if (r[i] < 0.95) hasPortrait = true;
        maxPriority = Math.max(maxPriority, priorityValue(photos[i]));
      }
      if (hasPortrait) wrapper.classList.add("photo-portrait-row");
      if (!fullWidth) wrapper.classList.add("photo-final-row");
      if (maxPriority >= 2) wrapper.classList.add("photo-priority-row");

      for (let i = begin; i < end; i++) {
        const tile = tiles[i];
        tile.style.width = (height * r[i]) + "px";
        tile.style.height = height + "px";
        wrapper.appendChild(tile);
      }
      gallery.appendChild(wrapper);
    }

    if (width < 1024) {
      // Keep the already-accepted mobile/tablet behavior simple and dense.
      let begin = 0, sum = 0;
      for (let i = 0; i < n; i++) {
        sum += r[i];
        if (sum * target + gap * (i - begin) >= width) {
          addRow(begin, i + 1, (width - gap * (i - begin)) / sum, true);
          begin = i + 1;
          sum = 0;
        }
      }
      if (begin < n) {
        addRow(begin, n, Math.min(target, (width - gap * Math.max(0, n - begin - 1)) / sum), false);
      }
      return;
    }

    // Desktop: plan all rows together so portraits are not squeezed by following photos.
    const dp = Array(n + 1).fill(Infinity);
    const choice = Array(n).fill(null);
    dp[n] = 0;

    for (let i = n - 1; i >= 0; i--) {
      let sum = 0;
      for (let end = i + 1; end <= Math.min(n, i + 6); end++) {
        sum += r[end - 1];
        const count = end - i;
        const rowPhotos = photos.slice(i, end);
        const exact = (width - gap * (count - 1)) / sum;
        const last = end === n;
        const hasPortrait = rowPhotos.some((_, rowIndex) => r[i + rowIndex] < 0.95);
        const desired = desiredRowHeight(rowPhotos, hasPortrait);

        // Last rows may be shorter than full width by design, but still bounded.
        const lastCap = hasPortrait ? Math.min(560, desired + 15) : Math.min(320, desired + 10);
        const height = last ? Math.min(exact, lastCap) : exact;

        let penalty = 110 * Math.pow(Math.log(height / desired), 2);

        // Avoid very small portrait rows.
        if (hasPortrait) {
          const minPortrait = Math.max(...rowPhotos.map((p, rowIndex) => {
            return r[i + rowIndex] < 0.95 ? desiredPortraitMin(p) : 0;
          }));
          if (height < minPortrait) {
            penalty += 950 * Math.pow((minPortrait - height) / minPortrait, 2) + 120;
          }
        }

        // Avoid oversized rows.
        const maxComfort = rowPhotos.some(p => priorityValue(p) >= 2) ? 640 : 590;
        if (height > maxComfort) {
          penalty += 800 * Math.pow((height - maxComfort) / maxComfort, 2) + 90;
        }

        if (height < 190) penalty += 150;
        if (count === 1) penalty += 150;

        // Per-photo priority preferences.
        for (let j = i; j < end; j++) {
          const photo = photos[j];
          const pr = priorityValue(photo);
          const isPortrait = r[j] < 0.95;

          if (pr >= 2 && isPortrait && height < desiredPortraitMin(photo)) {
            penalty += 220 * Math.pow((desiredPortraitMin(photo) - height) / desiredPortraitMin(photo), 2) + 40;
          }
          if (pr >= 3 && !isPortrait && height < 265) {
            penalty += 70;
          }
          if (pr < 0 && height > (isPortrait ? 500 : 330)) {
            penalty += 90 * Math.pow((height - (isPortrait ? 500 : 330)) / (isPortrait ? 500 : 330), 2);
          }
        }

        // Light penalty for large unused width in a shortened final row.
        if (last && exact > height) {
          const used = sum * height + gap * (count - 1);
          penalty += 40 * Math.pow((width - used) / width, 2);
        }

        const score = penalty + dp[end];
        if (score < dp[i]) {
          dp[i] = score;
          choice[i] = { end, height, fullWidth: !last || exact <= height };
        }
      }
    }

    let i = 0;
    while (i < n && choice[i]) {
      const item = choice[i];
      addRow(i, item.end, item.height, item.fullWidth);
      i = item.end;
    }
  }

  let frame = 0;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(render);
  }, { passive: true });

  window.PortfolioPhotographyGallery = Object.freeze({
    setFilters(selected) {
      const active = new Set(selected);
      photos = allPhotos.filter(photo =>
        [...active].every(tag => Array.isArray(photo.tags) && photo.tags.includes(tag))
      );
      tiles = photos.map(photo => allTiles[allPhotos.indexOf(photo)]);
      const empty = document.getElementById("photo-empty");
      if (empty) {
        empty.hidden = photos.length !== 0;
        if (!photos.length) empty.textContent = "No photographs match those tags.";
      }
      render();
      return { showing: photos.length, total: allPhotos.length };
    }
  });

  render();
})();
