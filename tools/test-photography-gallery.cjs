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
  const context = vm.createContext({ window: { addEventListener() {} },
    document: { getElementById: id => nodes[id], createElement: element, querySelector: () => null },
    requestAnimationFrame() {}, cancelAnimationFrame() {} });
  vm.runInContext(fs.readFileSync(path.join(root, "js/photography-catalog.js"), "utf8"), context);
  if (customPhotos) {
    context.window.PORTFOLIO_PHOTOS = customPhotos;
    context.window.PHOTO_ASPECT_RATIOS = customRatios;
  }
  for (const file of ["photography-gallery.js", "photography-tags.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, "js", file), "utf8"), context);
  }
  const api = context.window.PortfolioPhotographyGallery;
  const all = context.window.PORTFOLIO_PHOTOS.filter(photo => photo.visible !== false && photo.file && photo.alt);
  const ratios = context.window.PHOTO_ASPECT_RATIOS;
  function check(tags, width) {
    nodes["photo-gallery"].clientWidth = width;
    api.setFilters(tags);
    const expected = all.filter(photo => !tags.length || tags.some(tag => (photo.tags || []).includes(tag)));
    const rows = nodes["photo-gallery"].children;
    const rendered = rows.flatMap(row => row.children.map(tile => tile.dataset.file));
    assert.deepEqual(rendered, Array.from(expected, photo => photo.file), `Order/count: ${width}, ${tags}`);
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
      if (row === rows.at(-1)) assert(height <= cap + 0.01, "Final row exceeds standard height limit");
      else assert(Math.abs(used - width) < 0.01, "Interior rows must fill the width regardless of height");
      assert(used <= width + 0.01, "Horizontal overflow");
      const ratioSum = files.reduce((sum, file) => sum + (ratios[file] || 1.5), 0);
      const exact = (width - gap * (files.length - 1)) / ratioSum;
      if (files.length > 1 && exact <= cap) {
        assert(Math.abs(used - width) < 0.01, "Multi-photo row should fill width, including the final row");
      }
    }
    return rows;
  }
  return { check, all, nodes, context };
}
const gallery = harness();
const tags = gallery.context.window.PHOTO_TAG_LABELS;
let cases = 0;
for (const width of [360, 768, 1000, 1136, 1600]) {
  for (const selected of [[], ...tags.map(tag => [tag]), ...tags.flatMap((a, i) => tags.slice(i + 1).map(b => [a, b])), ["unknown"]]) {
    gallery.check(selected, width); cases++;
  }
}
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
