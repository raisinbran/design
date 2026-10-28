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

  const status = document.createElement("output");
  status.className = "photo-filter-status";
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");

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
  status.setAttribute("hidden", "");

  const mobileLabel = document.createElement("label");
  mobileLabel.className = "photo-filter-mobile";
  mobileLabel.textContent = "Filter photos";
  const select = document.createElement("select");
  select.setAttribute("aria-label", "Filter photographs by tag");
  ["All", ...labels].forEach(label => {
    const option = document.createElement("option");
    option.value = label === "All" ? "" : label;
    option.textContent = label === "All" ? "All photos" : label;
    select.appendChild(option);
  });
  select.addEventListener("change", () => {
    selection.clear();
    if (select.value) selection.add(select.value);
    update();
  });
  mobileLabel.appendChild(select);
  host.appendChild(mobileLabel);

  function update() {
    window.PortfolioPhotographySelectedTags = Array.from(selection);
    buttons.get("All").setAttribute("aria-pressed", String(selection.size === 0));
    labels.forEach(tag => buttons.get(tag).setAttribute("aria-pressed", String(selection.has(tag))));
    select.value = Array.from(selection)[0] || "";
    const counts = gallery.setFilters(Array.from(selection));
    // Counter intentionally hidden. Filtering remains accessible through button states.
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
