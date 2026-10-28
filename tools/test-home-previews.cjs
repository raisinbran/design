// Exercise decoded-slide startup, fades, and pause conditions without real timers.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require("node:path").join(__dirname, "../js/home.js"), "utf8");
const flush = async () => { for (let turn = 0; turn < 30; turn++) await Promise.resolve(); };
async function harness({ reduced = false, touch = false, failFirst = false } = {}) {
  const timers = new Map();
  const events = {};
  let timerId = 0;
  let observer;
  const image = () => ({ style: {}, async decode() {
    assert.equal(this.loading, "eager", "Detached slides must load before insertion");
    if (failFirst && this.src.includes("temple")) throw Error("missing image");
  }, remove() { this.removed = true; stage.children = stage.children.filter(child => child !== this); } });
  const fallback = { style: {}, remove() { stage.children = stage.children.filter(child => child !== this); } };
  const stage = { dataset: {homePreview: "photography"}, children: [fallback],
    querySelectorAll() { return this.children; }, appendChild(img) { this.children.push(img); },
    closest() { return card; } };
  const card = { events: {}, addEventListener(name, callback) { this.events[name] = callback; } };
  const motion = { matches: reduced, addEventListener(name, callback) { this.change = callback; } };
  const doc = { hidden: false, querySelectorAll: () => [stage], createElement: image,
    addEventListener(name, callback) { events[name] = callback; } };
  const window = { matchMedia: query => query.includes("reduced") ? motion : { matches: !touch },
    IntersectionObserver: true, PORTFOLIO_PHOTOS: [
      { file: "DSCF1024_edit_crop.jpg", alt: "Temple", thumbnail: "temple.webp", thumbnailVersion: "new" },
      { file: "DSCF3546_crop.jpg", alt: "Court", thumbnail: "court.webp" },
      { file: "DSCF0179.jpg", alt: "Hidden", visible: false }] };
  vm.runInNewContext(source, { document: doc, window,
    IntersectionObserver: class { constructor(callback) { observer = callback; } observe() {} },
    setTimeout(callback, ms) { const id = ++timerId; timers.set(id, {callback, ms}); return id; },
    clearTimeout(id) { timers.delete(id); } });
  await flush();
  observer([{isIntersecting: true}]);
  function tick(ms) {
    const entry = [...timers.entries()].find(([, timer]) => timer.ms === ms);
    assert(entry, `Expected ${ms}ms timer`);
    timers.delete(entry[0]);
    return entry[1].callback();
  }
  return {stage, card, timers, tick, motion, doc, events, observer};
}
(async () => {
  const h = await harness();
  assert.equal(h.stage.children.length, 2, "Hidden photos excluded and static fallback replaced");
  assert.equal(h.stage.children[0].src, "photography/thumbnails/temple.webp?v=new");
  const advancing = h.tick(3500);
  await flush();
  assert.equal(h.stage.children[1].style.opacity, "1");
  h.tick(1000);
  await advancing;
  assert.equal(h.stage.children[0].style.opacity, "0");
  h.card.events.mouseenter(); assert.equal(h.timers.size, 0, "Mouse hover pauses");
  h.card.events.mouseleave(); assert.equal(h.timers.size, 1);
  h.card.events.focusin(); assert.equal(h.timers.size, 0, "Keyboard focus pauses");
  h.card.events.focusout();
  h.doc.hidden = true; h.events.visibilitychange(); assert.equal(h.timers.size, 0);
  h.doc.hidden = false; h.events.visibilitychange(); assert.equal(h.timers.size, 1);
  h.observer([{isIntersecting: false}]); assert.equal(h.timers.size, 0);
  h.observer([{isIntersecting: true}]);
  const outgoing = h.stage.children[0];
  outgoing.decode = async () => { throw Error("removed after startup"); };
  await h.tick(3500);
  assert(outgoing.removed, "Failed rotating image is removed");
  assert.equal(h.timers.size, 0, "One remaining image stays still");
  assert.equal((await harness({reduced: true})).timers.size, 0, "Reduced motion disables rotation");
  const touch = await harness({touch: true});
  touch.card.events.mouseenter(); assert.equal(touch.timers.size, 1, "Synthetic touch hover does not pause");
  const failed = await harness({failFirst: true});
  assert.equal(failed.stage.children.length, 1, "Invalid candidates never enter the slideshow");
  assert(failed.stage.children[0].src.includes("court"));
  console.log("Passed decoded startup, fades, catalog exclusions, hover/focus/visibility pauses, image failures, touch, and reduced motion.");
})().catch(error => { console.error(error); process.exitCode = 1; });
