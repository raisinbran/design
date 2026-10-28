(() => {
  "use strict";
  // Match Portfolio Studio's Color harmony weights and greedy nearest-neighbor
  // strategy, then reverse the proposed order.
  const catalog = (window.PORTFOLIO_PHOTOS || []).filter(photo =>
    photo.visible !== false && photo.file && photo.alt);
  const ratios = window.PHOTO_ASPECT_RATIOS || {};
  const key = "portfolio-color-features-v1";
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(key) || "{}"); }
  catch (_) { stored = {}; }
  const features = new Map();
  const orderCache = new Map();
  let ready = false;

  function measure(photo) {
    const revision = photo.thumbnailVersion || photo.mediaVersion || "";
    const previous = stored[photo.file];
    if (previous && previous.revision === revision && Array.isArray(previous.rgb)) {
      features.set(photo.file, previous.rgb);
      return Promise.resolve();
    }
    return new Promise(resolve => {
      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const scale = Math.min(1, 110 / Math.max(image.naturalWidth, image.naturalHeight));
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const context = canvas.getContext("2d", { willReadFrequently: true });
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          const bytes = context.getImageData(0, 0, canvas.width, canvas.height).data;
          const rgb = [0, 0, 0];
          for (let i = 0; i < bytes.length; i += 4) {
            rgb[0] += bytes[i];
            rgb[1] += bytes[i + 1];
            rgb[2] += bytes[i + 2];
          }
          for (let channel = 0; channel < 3; channel++) rgb[channel] /= bytes.length / 4;
          features.set(photo.file, rgb);
          stored[photo.file] = { revision, rgb };
        } catch (_) { features.set(photo.file, [128, 128, 128]); }
        resolve();
      };
      image.onerror = () => { features.set(photo.file, [128, 128, 128]); resolve(); };
      image.src = photo.thumbnail
        ? "photography/thumbnails/" + encodeURIComponent(photo.thumbnail) +
          (photo.thumbnailVersion ? "?v=" + encodeURIComponent(photo.thumbnailVersion) : "")
        : "photography/published/" + encodeURIComponent(photo.file);
    });
  }

  function proximity(first, second) {
    const a = features.get(first.file) || [128, 128, 128];
    const b = features.get(second.file) || [128, 128, 128];
    const color = Math.hypot(...a.map((value, index) => value - b[index])) / 441.67;
    const brightness = Math.abs(a.reduce((sum, v) => sum + v, 0) -
      b.reduce((sum, v) => sum + v, 0)) / 765;
    const saturation = Math.abs((Math.max(...a) - Math.min(...a)) -
      (Math.max(...b) - Math.min(...b))) / 255;
    const aTags = new Set(first.tags || []);
    const bTags = new Set(second.tags || []);
    const intersection = [...aTags].filter(tag => bTags.has(tag)).length;
    const union = new Set([...aTags, ...bTags]).size;
    const theme = 1 - intersection / Math.max(1, union);
    const aRatio = ratios[first.file] || first.aspectRatio || 1.5;
    const bRatio = ratios[second.file] || second.aspectRatio || 1.5;
    const shape = Math.min(1, Math.abs(Math.log(Math.max(.1, aRatio) /
      Math.max(.1, bRatio))) / 2);
    return .64 * color + .22 * brightness + .06 * saturation +
      .04 * theme + .04 * shape;
  }

  window.PortfolioSortedPhotos = candidates => {
    if (!ready || candidates.length < 2) return candidates;
    const signature = candidates.map(photo => photo.file).join("|");
    if (orderCache.has(signature)) return orderCache.get(signature);
    const remaining = candidates.slice();
    const proposed = [remaining.shift()];
    while (remaining.length) {
      const current = proposed[proposed.length - 1];
      let best = 0;
      for (let index = 1; index < remaining.length; index++) {
        if (proximity(current, remaining[index]) < proximity(current, remaining[best]))
          best = index;
      }
      proposed.push(remaining.splice(best, 1)[0]);
    }
    const reversed = proposed.reverse();
    orderCache.set(signature, reversed);
    return reversed;
  };

  async function initialize() {
    // Limit parallel decoding to keep mobile browsers responsive.
    for (let offset = 0; offset < catalog.length; offset += 4)
      await Promise.all(catalog.slice(offset, offset + 4).map(measure));
    try { localStorage.setItem(key, JSON.stringify(stored)); }
    catch (_) { /* Storage is optional. */ }
    ready = true;
    window.PortfolioPhotographyGallery?.setFilters(
      window.PortfolioPhotographySelectedTags || []);
  }
  initialize();
})();
