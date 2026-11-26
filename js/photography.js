/* Photography runtime: justified gallery in catalog order, and filter controls. */

(() => {
  "use strict";

  const MAX_PHOTOS_PER_ROW = 2;
  const TALL_PORTRAIT_MAX_RATIO = 2 / 3; // Minimum height:width ratio of 3:2.
  const MAX_PORTRAIT_ROW = 3; // Only three portraits may share a row.
  const MIN_SHORT_SIDE = 300; // Shortest side, in pixels, of any photo in a three-across row.
  const PORTRAIT_PAIR_PENALTY = 100;
  const WIDE_MIN_RATIO = 1.75; // A photo at least this wide may take a row alone.
  const MAX_UPSCALE = 1.15; // No photo is shown above this multiple of its file's pixels.
  const MAX_ROW_HEIGHT = 950; // About the page area of a maximized browser on a 1080p screen.
  const gallery = document.getElementById("photo-gallery");
  if (!gallery) return;

  const allPhotos = (window.PORTFOLIO_PHOTOS || []).filter(
    p => p.visible !== false && p.file && p.alt
  );
  let photos = allPhotos;

  const path = name => "photography/published/" + encodeURIComponent(name);
  // A value with a slash is a site path; a bare name lives in photography/thumbnails/.
  const thumbnailPath = value => value.includes("/")
    ? value.split("/").map(encodeURIComponent).join("/")
    : "photography/thumbnails/" + encodeURIComponent(value);

  function ratioAt(index) {
    const p = photos[index];
    const ratio = p.thumbnailWidth / p.thumbnailHeight || p.aspectRatio;
    return Number.isFinite(ratio) && ratio > 0 ? ratio : 1.5;
  }

  function priorityValue(photo) {
    const raw = String(photo.displayPriority || "").trim().toLowerCase();
    if (raw === "low") return -1;
    if (raw === "portraitboost") return 2;
    if (raw === "featured") return 3;
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
    
    tile.dataset.priority = String(photo.displayPriority || "normal");

    const img = document.createElement("img");
    img.loading = "lazy";
    img.decoding = "async";
    img.src = photo.thumbnail
      ? thumbnailPath(photo.thumbnail)
        + (photo.thumbnailVersion ? `?v=${encodeURIComponent(photo.thumbnailVersion)}` : "")
      : path(photo.file);
    img.alt = photo.alt;
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
  function render() {
    const width = gallery.clientWidth;
    if (!width) return;
    const viewportHeight = window.innerHeight || 750;
    // Short tablet viewports may cap the final row, never interior rows.
    const shortViewport = (window.innerWidth || width) <= 1024 && viewportHeight <= 500;

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

    // Phone rows retain catalog order, using one photo unless adjacent tall portraits pair.
    // All except the final two rows must fill the available width.
    if ((window.innerWidth || width) <= 720) {
      const rows = [];
      for (let begin = 0; begin < n;) {
        const pairTallPortraits = begin + 1 < n &&
          r[begin] <= TALL_PORTRAIT_MAX_RATIO &&
          r[begin + 1] <= TALL_PORTRAIT_MAX_RATIO;
        const end = begin + (pairTallPortraits ? 2 : 1);
        rows.push({ begin, end });
        begin = end;
      }

      rows.forEach(({ begin, end }, rowIndex) => {
        const count = end - begin;
        const sum = r.slice(begin, end).reduce((total, ratio) => total + ratio, 0);
        const exact = (width - gap * (count - 1)) / sum;
        const isPortraitRow = r[begin] < 0.95;
        const isTrailingRow = rowIndex >= rows.length - 2;
        // Only the final two portrait rows may use the old height limit.
        const height = isTrailingRow && isPortraitRow
          ? Math.min(exact, 360, viewportHeight * 0.48, 420, width * 0.9)
          : exact;
        addRow(begin, end, height, Math.abs(height - exact) < 0.01);
      });
      return;
    }

    // Plan the entire filtered set together, including the final row. Natural
    // aspect ratios and catalog order are preserved; no image is cropped here.
    const dp = Array(n + 1).fill(Infinity);
    const choice = Array(n).fill(null);
    dp[n] = 0;
    for (let begin = n - 1; begin >= 0; begin--) {
      let sum = 0;
      for (let end = begin + 1; end <= Math.min(n, begin + MAX_PORTRAIT_ROW); end++) {
        sum += r[end - 1];
        const count = end - begin;
        // A third photo joins a row only when all three are portraits.
        if (count > MAX_PHOTOS_PER_ROW && r.slice(begin, end).some(ratio => ratio >= 0.95)) continue;
        const rowPhotos = photos.slice(begin, end);
        const hasPortrait = rowPhotos.some(photo => {
          const ratio = photo.thumbnailWidth / photo.thumbnailHeight || photo.aspectRatio;
          return Number.isFinite(ratio) && ratio > 0 && ratio < 0.95;
        });
        const desired = width < 720
          ? (hasPortrait ? Math.min(420, width * 0.9) : 230)
          : width < 1024 ? (hasPortrait ? 440 : 280)
          : desiredRowHeight(rowPhotos, hasPortrait);
        const standardMax = rowPhotos.some(p => priorityValue(p) >= 2) ? 640 : 590;
        // Keep height caps available for the final row on short viewports.
        const maximum = shortViewport
          ? Math.min(360, viewportHeight * 0.48)
          : standardMax;
        const exact = (width - gap * (count - 1)) / sum;
        const wideSingle = count === 1 && r[begin] >= WIDE_MIN_RATIO;
        const cap = count === 1 ? Math.min(maximum, desired + (hasPortrait ? 15 : 40)) : maximum;
        const ceiling = Math.min(
          MAX_ROW_HEIGHT,
          ...rowPhotos.map(photo => MAX_UPSCALE * photo.thumbnailHeight || Infinity)
        );
        // Interior rows always span the gallery. Only the final row may be shorter.
        const height = end === n && (count > 1 || hasPortrait)
          ? Math.min(exact, cap, ceiling)
          : end === n ? Math.min(exact, ceiling) : exact;
        // Three across is allowed only while every photo keeps a short side this long.
        if (count > MAX_PHOTOS_PER_ROW && Math.min(...r.slice(begin, end)) * height < MIN_SHORT_SIDE) continue;
        const used = sum * height + gap * (count - 1);
        // A wide photo alone on a row is meant to be tall, so it is judged against its full-row height.
        const target = wideSingle ? Math.min(exact, 640) : desired;
        let penalty = 10 + 110 * Math.pow(Math.log(height / target), 2);
        penalty += 900 * Math.pow(Math.max(0, width - used) / width, 2);
        // An interior row can't be shortened, so a row beyond its photos' resolution is a last resort.
        if (height > ceiling) penalty += 2000 * (height / ceiling - 1) + 200;
        if (height < 190) penalty += 150;
        if (count === 1) penalty += wideSingle ? 15 : end === n ? 40 : 120;
        // Two portraits side by side make a very tall row, so pair a portrait with a landscape when order allows.
        if (count === 2 && r[begin] < 0.95 && r[begin + 1] < 0.95) penalty += PORTRAIT_PAIR_PENALTY;
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


(() => {
  "use strict";
  const gallery = window.PortfolioPhotographyGallery;
  const host = document.getElementById("photo-filters");
  if (!gallery || !host) return;
  const labels = window.PHOTO_TAG_LABELS || [];
  if (!Array.isArray(labels) || !labels.length) return;

  const selection = new Set();
  const group = document.createElement("div");
  group.className = "photo-filter-chips";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Filter photographs by tag");

  const buttons = new Map();
  function createChip(text, isAll) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "photo-filter-chip";
    button.textContent = text;
    button.setAttribute("aria-pressed", isAll ? "true" : "false");
    button.addEventListener("click", () => {
      selection.clear();
      if (!isAll) selection.add(text);
      update();
    });
    group.appendChild(button);
    buttons.set(text, button);
  }
  createChip("All", true);
  labels.forEach(label => createChip(label, false));
  host.append(group);

  function update() {
    buttons.get("All").setAttribute("aria-pressed", String(selection.size === 0));
    labels.forEach(tag => buttons.get(tag).setAttribute("aria-pressed", String(selection.has(tag))));
    gallery.setFilters(Array.from(selection));
  }
  const nav = document.querySelector(".site-nav-2026");
  function updateTop() {
    if (!nav) return;
    const h = Math.ceil(nav.getBoundingClientRect().height);
    host.style.setProperty("--photo-filter-top", `${h}px`);
  }
  if (nav && typeof ResizeObserver !== "undefined") {
    new ResizeObserver(updateTop).observe(nav);
  }
  window.addEventListener("resize", updateTop, { passive: true });
  updateTop();
  update();
})();
