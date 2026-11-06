# Portfolio Website — Read-Only Responsive Layout Audit

**Standalone assignment for a new browser-capable agent**  
**Prepared:** 2026-10-29  
**Status:** Planning brief only; no audit has yet been executed.

## Objective

Evaluate the *currently deployed* portfolio site's mobile and desktop layout, especially the alignment, indentation, justification, width and vertical rhythm of headings, subtitles, body text, navigation, cards, photographs, filters and project sections. Identify (1) choices that work well, (2) inconsistent or problematic choices and (3) specific, prioritized resolutions grounded in reputable UX, responsive-design and accessibility guidance. Preserve intentional editorial design; do not force uniform alignment where a meaningful hierarchy exists.

## Website and scope

- Home: https://raisinbran.github.io/design/index.html
- Photography: https://raisinbran.github.io/design/photography.html
- Engineering: https://raisinbran.github.io/design/engineeringdesign.html
- Archive: https://raisinbran.github.io/design/creativedesign.html
- Public source repository, **optional and read-only** if DOM/CSS inspection is necessary: https://github.com/raisinbran/design

**Do not edit files, create branches, open pull requests, commit, merge, push, deploy, or change the site.** Audit the live pages first. Source code can explain observed behavior but must not replace visual evidence. Do not assume previous versions of the website are still deployed.

## Screen-size evidence and revised test matrix

September 2026 Steam Hardware Survey *primary display resolution* (all platforms combined): **1920 × 1080: 47.91%; 2560 × 1440: 27.04%; 3840 × 2160: 4.79%; 1440 × 900: 0.62%.** This corrects the suggestion that 4K was second or that 1440 × 900 was the dominant desktop size. Steam is a gaming-user sample, **not a representative sample of this website's visitors**. For wider desktop web usage, Statcounter reported **1920 × 1080: 28.07%, 1536 × 864: 10%, 1366 × 768: 7.95%** worldwide in September 2026.

**Monitor resolution is not browser viewport size.** Browser chrome, operating-system scaling, zoom, and nonmaximized windows affect the actual CSS-pixel viewport. Record `window.innerWidth`, `window.innerHeight` and browser zoom, instead of calling an emulated viewport a physical monitor resolution.

**Eight mandatory browser checks (four pages × two viewport sizes):**

| Device context | Browser layout viewport (CSS px) | Pages |
|---|---|---|
| Mobile portrait | **390 × 844** | All four |
| Large desktop / 1080p-class window | **1920 × 960** | All four |

1920 × 960 is an *audit approximation* of the usable area on some maximized 1920 × 1080 browsers, not a measured population statistic. **1440 × 900 remains a valid optional diagnostic viewport**, but not the primary desktop baseline.

**Up to four additional viewport/page checks, only if justified by a finding:** 1536 × 864 (common desktop web size), 1366 × 768 (compact laptop), 768 × 1024 (tablet/breakpoint), or 320px CSS width (WCAG reflow). Select the page/size combination most relevant to the observed problem; do not mechanically test all combinations.

## Browser-agent workflow (single agent only)

1. In one browser session, inspect all four live pages at 390 × 844. Capture visible alignment issues and use scroll/interaction only as needed. Repeat at 1920 × 960. Keep **at most 12 screenshots** total: target eight baseline captures, with four reserved for targeted evidence or additional widths. Use DOM measurements rather than excessive screenshots.
2. For each page and viewport, compare left/right alignment of: navigation and brand; page title versus subtitle; section headings versus supporting text; project headings versus project-body padding; photo/media edges; cards and captions; and footer. Note actual margin/padding and content max-width where determinable. Record viewport dimensions, relevant element rectangles and whether positions are centered, left-aligned or deliberately inset.
3. Review line lengths, paragraph readability, headings' relative sizes/weights/color, text wrapping, line height, section gaps and empty space. Flag clipped content, unexpected horizontal page scrolling, overlapping sticky headers, or controls with inaccessible text. Distinguish **observed defects**, **inconsistencies**, and **subjective design preferences**.
4. Inspect page-specific cases: **Home** hero image sizing and maximum width, introductory line, Engineering/Photography preview-card text/media alignment; **Photography** title, subtitle, snug sequential tag buttons, sticky filter position and gallery gutters; **Engineering** first project (including the “Caltrain” heading), project headers, expanded text sections and media; **Archive** section hierarchy and project/gallery spacing. Test an interaction only when essential to reveal a layout state.
5. Consult the few sources linked below; tie recommendations to relevant principles. Avoid inventing universal pixel requirements. Use source CSS selectively if needed to explain root causes, identifying exact selectors and files when confirmed.
6. Produce a concise report following the structure below. No implementation or follow-on code-writing in this task.

## Required report output

Deliver `portfolio-responsive-layout-audit-report.md` (or a normal response if file delivery is unavailable) containing:

1. **Executive summary:** top three observations, including existing strengths.
2. **Evidence matrix:** eight baseline page/viewport results with measured alignment/gutter findings; note any page that could not be tested.
3. **Done well:** layouts, consistency or visual hierarchy worth preserving, supported by actual observations.
4. **Conflicts:** page/viewport, current behavior, expected or more coherent behavior, severity, evidence reference and whether objective or subjective.
5. **Prioritized resolutions:** P1 functional/accessibility, P2 visual inconsistency, P3 optional polish. Recommend the smallest maintainable adjustment; avoid wholesale redesign.
6. **Constraints and limitations:** device/browser, measured CSS viewports, screenshots captured, unknowns and what was not tested.

For high-impact findings, include before/target alignment descriptions or annotated screenshot references. **Do not claim actual-device testing from desktop browser emulation.** Preserve distinctions between established accessibility requirements, expert recommendations and aesthetic judgments.

## Credit and action limits

The user reports **approximately 15% of their current five-hour ChatGPT/Codex credit allowance remaining**. Usage cannot be guaranteed or measured from this brief. Conserve it through **one agent**, **one browser session**, **eight mandatory viewport/page inspections**, **no more than four additional inspections**, **no more than 12 screenshots**, and **at most four external guidance sources**. Do not launch subagents, undertake broad research, run comprehensive automated test suites, build the project or modify code. If the budget or available browser capability prevents completion, stop after the evidence obtained and report precise gaps rather than guessing.

## References for the agent

- [Valve Steam Hardware & Software Survey — September 2026](https://store.steampowered.com/hwsurvey/hw/) — primary display resolutions; gaming-user sample.
- [Statcounter worldwide desktop screen resolutions — September 2026](https://gs.statcounter.com/screen-resolution-stats/desktop-ww/worldwide) — wider web-traffic perspective.
- [MDN: Viewport concepts](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/CSSOM_view/Viewport_concepts) — browser viewport vs physical screen; [Window.innerWidth](https://developer.mozilla.org/en-US/docs/Web/API/Window/innerWidth) for measurements.
- [web.dev: Responsive web design basics](https://web.dev/articles/responsive-web-design-basics) — content-driven breakpoints, horizontal overflow, viewport sizing.
- [W3C WCAG 2.2](https://www.w3.org/TR/wcag/) — especially 1.4.10 Reflow and 1.4.12 Text Spacing (requirements, not prescriptions for uniform visual appearance).
- [Nielsen Norman Group: How Chunking Helps Content Processing](https://www.nngroup.com/articles/chunking/) — grouping, scannability, line lengths and hierarchy.

**Done criterion:** The agent delivers the evidence-based report and recommendations **without changing the website**.
