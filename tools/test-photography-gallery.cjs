// Exercise the actual gallery/filter scripts against a small DOM model.
// Run: node tools/test-photography-gallery.cjs
const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
function element() {
  return { children: [], dataset: {}, handlers: {}, attributes: {},
    style: { setProperty(name, value) { this[name] = value; } },
    classList: { add() {} }, clientWidth: 1136,
    getBoundingClientRect() { return {width: 70, height: 44}; },
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(name, callback) { this.handlers[name] = callback; },
    appendChild(child) {
      if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child);
      child.parent = this; this.children.push(child); return child;
    },
    append(...children) { children.forEach(child => this.appendChild(child)); },
    replaceChildren(...children) { this.children = []; this.append(...children); } };
}
function harness(customPhotos, customRatios) {
  const nodes = { "photo-gallery": element(), "photo-filters": element(), "photo-empty": element() };
  const resizeHandlers = {};
  const pendingImages = [];
  const context = vm.createContext({
    Image: class { set src(value) { pendingImages.push(this); } },
    localStorage: { getItem() { return null; }, setItem() {} },
    getComputedStyle: () => ({columnGap: "7px"}),
    window: { innerWidth: 1440, innerHeight: 900,
      matchMedia() { return {matches: this.innerWidth <= 720}; }, addEventListener(name, callback) {
    (resizeHandlers[name] ||= []).push(callback);
  } },
    document: { getElementById: id => nodes[id], createElement: element, querySelector: () => null },
    requestAnimationFrame(callback) { callback(); }, cancelAnimationFrame() {} });
  vm.runInContext(fs.readFileSync(path.join(root, "js/photography-catalog.js"), "utf8"), context);
  if (customPhotos) {
    context.window.PORTFOLIO_PHOTOS = customPhotos;
    context.window.PHOTO_ASPECT_RATIOS = customRatios;
  }
  for (const file of ["photography.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, "js", file), "utf8"), context);
  }
  const api = context.window.PortfolioPhotographyGallery;
  const all = context.window.PORTFOLIO_PHOTOS.filter(photo => photo.visible !== false && photo.file && photo.alt);
  const ratios = context.window.PHOTO_ASPECT_RATIOS;
  function check(tags, width, viewportHeight = 750, viewportWidth = width) {
    nodes["photo-gallery"].clientWidth = width;
    context.window.innerHeight = viewportHeight;
    context.window.innerWidth = viewportWidth;
    const cappedRows = width < 720 || (viewportWidth <= 1024 && viewportHeight <= 500);
    const viewingCap = Math.min(360, viewportHeight * 0.48);
    api.setFilters(tags);
    const expected = all.filter(photo => !tags.length || tags.some(tag => (photo.tags || []).includes(tag)));
    const rows = nodes["photo-gallery"].children;
    const rendered = rows.flatMap(row => row.children.map(tile => tile.dataset.file));
    const expectedFiles = Array.from(expected, photo => photo.file);
    assert.deepEqual([...rendered].sort(), [...expectedFiles].sort(), `Membership: ${width}, ${tags}`);
    if (viewportWidth > 720) assert.deepEqual(rendered, expectedFiles, "Desktop retains catalog order");
    else {
      for (const isPortrait of [true, false]) {
        const orientation = file => ((ratios[file] || 1.5) < .95) === isPortrait;
        assert.deepEqual(rendered.filter(orientation), expectedFiles.filter(orientation), "Mobile preserves order within each orientation");
      }
    }
    const gap = width < 720 ? 8 : 12;
    for (const row of rows) {
      const files = row.children.map(tile => tile.dataset.file);
      const nonPortraits = files.filter(file => (ratios[file] || 1.5) >= 0.95).length;
      assert(nonPortraits <= 2, "Three landscapes/squares must not share a row");
      assert(files.length <= 3, "At most three photos per row");
      assert(!(files.length === 3 && nonPortraits === 1), "Two portraits must not share a row with a landscape/square");
      const height = parseFloat(row.children[0].style.height);
      const used = row.children.reduce((sum, tile) => sum + parseFloat(tile.style.width), 0) + gap * (files.length - 1);
      const priority = expected.filter(photo => files.includes(photo.file)).some(photo =>
        ["featured", "portraitBoost"].includes(photo.displayPriority) || photo.featured);
      const cap = width < 720 ? Math.min(priority ? 640 : 590, width * 1.2) : priority ? 640 : 590;
      const standaloneNonPortrait = files.length === 1 && nonPortraits === 1;
      if (viewportWidth <= 720) assert(nonPortraits === 0 || files.length === 1, "Mobile separates orientations and gives landscapes their own row");
      if (cappedRows && !standaloneNonPortrait) assert(height <= viewingCap + 0.01, "Portrait/multi-photo row exceeds viewing height");
      if (standaloneNonPortrait) assert(Math.abs(used - width) < 0.01, "Standalone landscapes fill the gallery width");
      if (row === rows.at(-1) && !standaloneNonPortrait) assert(height <= cap + 0.01, "Final portrait/multi-photo row exceeds height limit");
      else if (row !== rows.at(-1) && !cappedRows) assert(Math.abs(used - width) < 0.01, "Interior rows must fill the width regardless of height");
      assert(used <= width + 0.01, "Horizontal overflow");
      const ratioSum = files.reduce((sum, file) => sum + (ratios[file] || 1.5), 0);
      const exact = (width - gap * (files.length - 1)) / ratioSum;
      if (files.length > 1 && exact <= (cappedRows ? viewingCap : cap)) {
        assert(Math.abs(used - width) < 0.01, "Multi-photo row should fill width, including the final row");
      }
    }
    return rows;
  }
  return { check, all, nodes, context, resizeHandlers, pendingImages };
}
const gallery = harness();
const tags = gallery.context.window.PHOTO_TAG_LABELS;
let cases = 0;
for (const width of [288, 343, 360, 398, 688, 768, 1000, 1136, 1600]) {
  for (const selected of [[], ...tags.map(tag => [tag]), ...tags.flatMap((a, i) => tags.slice(i + 1).map(b => [a, b])), ["unknown"]]) {
    gallery.check(selected, width); cases++;
  }
}
// Measured landscape chrome: 95px navigation offset + 64px filter strip.
// With a row aligned below it, show at least 24px of the following row.
for (const [viewportWidth, viewportHeight, galleryWidth] of [[844,390,781],[932,430,869]]) {
  for (const selected of [[], ...tags.map(tag => [tag]), ...tags.flatMap((a,i) => tags.slice(i+1).map(b => [a,b])), ["unknown"]]) {
    const rows = gallery.check(selected, galleryWidth, viewportHeight, viewportWidth);
    for (const row of rows.slice(0,-1)) {
      if (row.children.length === 1 && (gallery.context.window.PHOTO_ASPECT_RATIOS[row.children[0].dataset.file] || 1.5) >= .95) continue;
      const height = parseFloat(row.children[0].style.height);
      assert(viewportHeight - 159 - height - 12 >= 24, "Next row must remain recognizable below landscape photos");
    }
    cases++;
  }
}
// Height-only resizing must recompute rows; desktop widths keep their geometry.
const desktopRows = () => gallery.nodes["photo-gallery"].children.map(row =>
  row.children.map(tile => [tile.dataset.file,tile.style.width,tile.style.height]));
gallery.check([],1136,900,1440);
const desktopBefore = desktopRows();
gallery.context.window.innerHeight = 390;
gallery.resizeHandlers.resize.forEach(callback => callback());
assert.deepEqual(desktopRows(),desktopBefore,"Short desktop windows must retain the normal layout");
gallery.check([],781,844,844);
gallery.context.window.innerHeight = 390;
gallery.resizeHandlers.resize.forEach(callback => callback());
assert(gallery.nodes["photo-gallery"].children.every(row =>
  (row.children.length === 1 && (gallery.context.window.PHOTO_ASPECT_RATIOS[row.children[0].dataset.file] || 1.5) >= .95) ||
  parseFloat(row.children[0].style.height) <= 390 * .48 + .01),"Height-only mobile resize must cap existing rows");
const photos = Array.from({ length: 6 }, (_, index) => ({ file: `${index}.jpg`, alt: "Synthetic photograph", tags: [] }));
const portraits = harness(photos, Object.fromEntries(photos.map(photo => [photo.file, 2 / 3])));
assert.deepEqual(portraits.check([], 1136).map(row => row.children.length), [3, 3]);
const landscapes = harness(photos.slice(0, 4), Object.fromEntries(photos.map(photo => [photo.file, 1.5])));
assert.deepEqual(landscapes.check([], 1136).map(row => row.children.length), [2, 2]);
// Check each ordering of the forbidden two-portrait/one-landscape trio.
for (const ratios of [[.67,.67,1.5],[.67,1.5,.67],[1.5,.67,.67]]) {
  const mixed = harness(photos.slice(0,3), Object.fromEntries(ratios.map((ratio,i) => [`${i}.jpg`,ratio])));
  for (const width of [360,768,1136,1600]) mixed.check([],width);
}
const chips = gallery.nodes["photo-filters"].children[0].children;
const framed = harness([{file:"full.jpg",alt:"Framed photo",tags:[],thumbnail:"full.jpg.webp",
  thumbnailVersion:"123abc",thumbnailFramed:true,galleryCrop:{x:.1,y:.2,width:.5,height:.5}}],{"full.jpg":1.5});
const framedTile=framed.check([],1136)[0].children[0];
assert.equal(framedTile.href,undefined,"Gallery tiles must not link to full photos");
assert.equal(framedTile.target,undefined);
assert.equal(framedTile.children[0].src,"photography/thumbnails/full.jpg.webp?v=123abc");
assert.equal(framedTile.children[0].style.left,undefined,"A preframed thumbnail must not be cropped twice");
chips.find(chip => chip.textContent === tags[0]).handlers.click();
chips.find(chip => chip.textContent === tags[1]).handlers.click();
assert.equal(chips.find(chip => chip.textContent === tags[0]).attributes["aria-pressed"], "false");
assert.equal(chips.find(chip => chip.textContent === tags[1]).attributes["aria-pressed"], "true");
assert.equal(chips.filter(chip => chip.attributes["aria-pressed"] === "true").length, 1);
chips.find(chip => chip.textContent === "All").handlers.click();
assert.equal(gallery.nodes["photo-empty"].hidden, true);
assert.equal(gallery.nodes["photo-gallery"].children.flatMap(row => row.children).length, gallery.all.length);
console.log(`Passed ${cases} tag/viewport layout cases, portrait triplets, landscape pairs, and All reset.`);

// Complete asynchronous color sampling through its supported image-error fallback.
(async () => {
  const selectedTag = tags[0];
  chips.find(chip => chip.textContent === selectedTag).handlers.click();
  for (let turn = 0; turn < 100; turn++) {
    gallery.pendingImages.splice(0).forEach(image => image.onerror());
    await Promise.resolve();
  }
  const rendered = gallery.nodes["photo-gallery"].children.flatMap(row => row.children.map(tile => tile.dataset.file));
  const expected = gallery.all.filter(photo => photo.tags.includes(selectedTag)).map(photo => photo.file);
  assert.deepEqual([...rendered].sort(), [...expected].sort(), "Async sorting must preserve active filter membership");
  assert.equal(gallery.context.window.PortfolioPhotographySelectedTags[0], selectedTag);
  const sorted = gallery.context.window.PortfolioSortedPhotos(gallery.all);
  assert.deepEqual(Array.from(sorted, photo => photo.file).sort(), Array.from(gallery.all, photo => photo.file).sort(), "Sorting preserves catalog membership");
  console.log("Passed async color-sort fallback and selected-filter preservation.");
})().catch(error => { console.error(error); process.exitCode = 1; });
