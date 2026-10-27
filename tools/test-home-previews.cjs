const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
function harness(reduced = false) {
  const timers = new Map(); let id = 0;
  const image = () => ({style: {}, decode: async () => {}, remove() {this.removed = true;}});
  const stage = {dataset: {homePreview: "photography"}, children: [image()],
    querySelector() {return this.children[0];}, appendChild(img) {this.children.push(img);},
    closest() {return card;}};
  const card = {events: {}, addEventListener(name, fn) {this.events[name] = fn;}};
  const motion = {matches: reduced, addEventListener() {}};
  const doc = {hidden: false, querySelectorAll: () => [stage], createElement: image, addEventListener() {}};
  vm.runInNewContext(fs.readFileSync(require("node:path").join(__dirname,"../js/home-previews.js"),"utf8"), {
    document: doc, window: {matchMedia: () => motion, PORTFOLIO_PHOTOS: [
      {file: "DSCF1024_edit_crop.jpg", thumbnail: "temple.webp", thumbnailVersion: "new"},
      {file: "DSCF3546_crop.jpg", thumbnail: "court.webp"},
      {file: "DSCF0179.jpg", visible: false}]},
    setTimeout(fn, ms) {const key=++id;timers.set(key,{fn,ms});return key;},
    clearTimeout(key) {timers.delete(key);}
  });
  async function tick(ms) {
    const entry = [...timers.entries()].find(([,timer]) => timer.ms === ms);
    assert(entry, `Expected ${ms}ms timer`);
    timers.delete(entry[0]); await entry[1].fn();
  }
  return {stage, card, timers, tick};
}
(async () => {
  const h = harness();
  assert.equal(h.stage.children.length,2,"Hidden catalog entries are excluded");
  assert.equal(h.stage.children[0].src,"photography/thumbnails/temple.webp?v=new");
  await h.tick(5000);
  assert.equal(h.stage.children[1].style.opacity,"1");
  await h.tick(1000);
  assert.equal(h.stage.children[0].style.opacity,"0");
  h.card.events.mouseenter(); assert.equal(h.timers.size,0,"Hover pauses rotation");
  h.card.events.mouseleave(); assert.equal(h.timers.size,1);
  h.card.events.focusin(); assert.equal(h.timers.size,0,"Focus pauses rotation");
  h.card.events.focusout();
  h.stage.children[0].decode = async () => {throw Error("missing");};
  await h.tick(5000);
  assert(h.stage.children[0].removed,"Failed image is removed");
  assert.equal(h.timers.size,0,"One remaining image stays still");
  assert.equal(harness(true).timers.size,0,"Reduced motion disables rotation");
  console.log("Passed preview fades, live catalog, hover/focus pause, failed image, and reduced motion checks.");
})();
