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
    tile.dataset.file = photo.file;
    tile.className = "photo-tile";
    
    tile.dataset.priority = String(photo.displayPriority || (photo.featured ? "featured" : "normal"));

    const img = document.createElement("img");
    img.loading = "lazy";
    img.decoding = "async";
    img.src = photo.thumbnail
      ? "photography/thumbnails/" + encodeURIComponent(photo.thumbnail)
        + (photo.thumbnailVersion ? `?v=${encodeURIComponent(photo.thumbnailVersion)}` : "")
      : path(photo.file);
    img.alt = photo.alt;

    /* portfolio-crop:stage6c */
    // Framing is applied inside existing justified-row tiles, without altering
    // source photographs or tile dimensions.
    const galleryZoom = Number(photo.galleryZoom ?? 1);
    const focusX = Number(photo.focusX ?? 0.5);
    const focusY = Number(photo.focusY ?? 0.5);
    if (!photo.thumbnailFramed && Number.isFinite(galleryZoom) && galleryZoom > 1 && galleryZoom <= 3 &&
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



    // portfolio-gallery-crop:stage6d
    // The catalog-generated aspect ratio adjusts the justified tile size.
    // Image geometry below displays exactly the selected crop region.
    const rect = photo.galleryCrop;
    if (!photo.thumbnailFramed && rect && Number.isFinite(Number(rect.x)) && Number.isFinite(Number(rect.y)) &&
        Number(rect.width) > 0 && Number(rect.height) > 0 &&
        Number(rect.x) >= 0 && Number(rect.y) >= 0 &&
        Number(rect.x) + Number(rect.width) <= 1.000001 &&
        Number(rect.y) + Number(rect.height) <= 1.000001) {
      tile.style.setProperty("position", "relative", "important");
      tile.style.setProperty("overflow", "hidden", "important");
      img.style.setProperty("position", "absolute", "important");
      img.style.setProperty("left", `${-100 * Number(rect.x) / Number(rect.width)}%`, "important");
      img.style.setProperty("top", `${-100 * Number(rect.y) / Number(rect.height)}%`, "important");
      img.style.setProperty("width", `${100 / Number(rect.width)}%`, "important");
      img.style.setProperty("height", `${100 / Number(rect.height)}%`, "important");
      img.style.setProperty("max-width", "none", "important");
      img.style.setProperty("max-height", "none", "important");
      img.style.setProperty("transform", "none", "important");
      img.style.setProperty("transform-origin", "top left", "important");
      img.style.setProperty("object-fit", "fill", "important");
    }

    tile.appendChild(img);
    
    return tile;
  });
  let tiles = allTiles;

  // Edit photo ordering / visibility / displayPriority through the media catalog.
  // R30 adds optional displayPriority:
  //   "low"           = allow somewhat smaller presentation
  //   "normal"        = default
  //   "portraitBoost" = try to keep portrait photos more legible on desktop
  //   "featured"      = strongest emphasis
  // Existing featured: true remains supported.
  function render() {
    const width = gallery.clientWidth;
    if (!width) return;
    const viewportHeight = window.innerHeight || 750;
    // Wide phones in landscape still need room to reveal the following row.
    // Keep normal desktop rows unchanged, including short desktop windows.
    const cappedRows = width < 720 ||
      ((window.innerWidth || width) <= 1024 && viewportHeight <= 500);

    const gap = width < 720 ? 8 : 12;
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

    // On phones, separate orientations while retaining the order within each
    // orientation. Pair portraits; an unpaired portrait is always the last row.
    // Landscape photographs get the full row individually.
    if ((window.innerWidth || width) <= 720) {
      const portraitIndices = [];
      const landscapeIndices = [];
      for (let index = 0; index < n; index++) {
        (r[index] < 0.95 ? portraitIndices : landscapeIndices).push(index);
      }
      // Group portrait pairs by the position of their first photograph,
      // leaving a final unmatched portrait until after every complete row.
      const groups = landscapeIndices.map(index => ({ index, members:[index] }));
      for (let offset = 0; offset + 1 < portraitIndices.length; offset += 2) {
        groups.push({
          index:portraitIndices[offset],
          members:portraitIndices.slice(offset, offset + 2)
        });
      }
      groups.sort((left, right) => left.index - right.index);
      if (portraitIndices.length % 2) {
        groups.push({
          index:portraitIndices[portraitIndices.length - 1],
          members:[portraitIndices[portraitIndices.length - 1]]
        });
      }
      for (const group of groups) {
        const rowRatios = group.members.map(index => r[index]);
        const count = group.members.length;
        const exact = (width - gap * (count - 1)) /
          rowRatios.reduce((total, ratio) => total + ratio, 0);
        const portraitRow = rowRatios[0] < 0.95;
        const limit = Math.min(360, viewportHeight * 0.48);
        const desired = portraitRow ? Math.min(420, width * 0.9) : 270;
        // Single non-portrait images fill the full row at natural aspect ratio.
        // Portrait pairs retain the mobile height limit.
        const height = portraitRow ? Math.min(exact, limit, desired) : exact;
        const wrapper = document.createElement("div");
        wrapper.className = "photo-justified-row";
        if (portraitRow) wrapper.classList.add("photo-portrait-row");
        if (group.members.length === 1 && portraitRow) {
          wrapper.classList.add("photo-final-row");
        }
        wrapper.style.gap = gap + "px";
        for (const index of group.members) {
          const tile = tiles[index];
          tile.style.width = (height * r[index]) + "px";
          tile.style.height = height + "px";
          wrapper.appendChild(tile);
        }
        gallery.appendChild(wrapper);
      }
      return;
    }

    // Plan the entire filtered set together, including the final row. Natural
    // aspect ratios and catalog order are preserved; no image is cropped here.
    const dp = Array(n + 1).fill(Infinity);
    const choice = Array(n).fill(null);
    dp[n] = 0;
    for (let begin = n - 1; begin >= 0; begin--) {
      let sum = 0;
      let nonPortraits = 0;
      for (let end = begin + 1; end <= Math.min(n, begin + 3); end++) {
        sum += r[end - 1];
        if (r[end - 1] >= 0.95) nonPortraits++;
        // Keep portrait triplets, but never shrink two portraits beside a landscape.
        // Three landscapes/squares also make each photograph too small.
        if (nonPortraits > 2 || (end - begin === 3 && nonPortraits === 1)) continue;
        const count = end - begin;
        const rowPhotos = photos.slice(begin, end);
        const hasPortrait = nonPortraits < count;
        const desired = width < 720
          ? (hasPortrait ? Math.min(420, width * 0.9) : 230)
          : width < 1024 ? (hasPortrait ? 440 : 280)
          : desiredRowHeight(rowPhotos, hasPortrait);
        const standardMax = rowPhotos.some(p => priorityValue(p) >= 2) ? 640 : 590;
        // Small screens need a visible continuation below each photograph.
        // Leave room for the surrounding navigation and the next row.
        const maximum = cappedRows
          ? Math.min(360, viewportHeight * 0.48)
          : standardMax;
        const exact = (width - gap * (count - 1)) / sum;
        // Desktop interior rows fill the gallery. Mobile rows may leave side space
        // to keep tall photographs within a comfortable viewing height.
        const cap = count === 1 ? Math.min(maximum, desired + (hasPortrait ? 15 : 40)) : maximum;
        const height = cappedRows || end === n ? Math.min(exact, cap) : exact;
        const used = sum * height + gap * (count - 1);
        let penalty = 10 + 110 * Math.pow(Math.log(height / desired), 2);
        penalty += 180 * Math.pow(Math.max(0, width - used) / width, 2);
        if (height < 190) penalty += 150;
        if (count === 1) penalty += end === n ? 40 : 120;
        if (hasPortrait) {
          const minimum = Math.max(...rowPhotos.map((photo, offset) => r[begin + offset] < 0.95
            ? Math.min(desiredPortraitMin(photo), width < 720 ? width * 0.65 : 410) : 0));
          if (height < minimum) penalty += 120 + 950 * Math.pow((minimum - height) / minimum, 2);
        }
        for (let index = begin; index < end; index++) {
          const priority = priorityValue(photos[index]);
          if (priority >= 3 && r[index] >= 0.95 && height < 265) penalty += 70;
          if (priority < 0 && height > (r[index] < 0.95 ? 500 : 330)) penalty += 35;
        }
        const score = penalty + dp[end];
        if (score < dp[begin]) {
          dp[begin] = score;
          choice[begin] = { end, height, fullWidth: Math.abs(height - exact) < 0.01 };
        }
      }
    }
    let begin = 0;
    while (begin < n && choice[begin]) {
      const row = choice[begin];
      addRow(begin, row.end, row.height, row.fullWidth);
      begin = row.end;
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
      photos = active.size === 0 ? allPhotos : allPhotos.filter(photo =>
        [...active].some(tag => Array.isArray(photo.tags) && photo.tags.includes(tag))
      );
      if (window.PortfolioSortedPhotos) photos = window.PortfolioSortedPhotos(photos);
      tiles = photos.map(photo => allTiles[allPhotos.indexOf(photo)]);
      const empty = document.getElementById("photo-empty");
      if (empty) {
        empty.hidden = photos.length !== 0;
        if (!photos.length) empty.textContent = active.size === 0
          ? "No photographs are currently available."
          : "No photographs match those tags.";
      }
      render();
      return { showing: photos.length, total: allPhotos.length };
    }
  });

  render();
})();
