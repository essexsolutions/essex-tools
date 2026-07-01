# essex-tools

Self-hosted front-end scripts for the Essex Solutions Webflow site.

## Files

- `multi-step.js` — beacon-stripped copy of videsigns "Formly" multi-step form helper.
- `essex-email-autofill.js` / `essex-email-autofill.css` — returning-lead autofill helper.
- `slide-toggle.js` — `[data-slide-toggle]` triggers that switch Webflow native tabs by ID.
- `essex-global.js` — site-wide bundle: navbar/subnav behavior, text limiting,
  prefilters, category filters, **and** the slide-toggle logic in one file.
- `essex-gsap.js` — attribute-driven GSAP animations to sprinkle anywhere.
  First animation: `[data-gsap-counter="<number>"]` counts up when it scrolls
  into view (0.5s default). Needs GSAP core on the page; no ScrollTrigger.
- `ss-slideshow.js` — `.ss_slide_sidenav` slideshow controller: timed auto-advance,
  click-to-switch, default/active icon swap, and an **accumulating**
  `.ss_slidebar--fill` progress bar (active block fills 0→100% over the interval,
  passed blocks stay full, all reset when it loops back to the first). Drives a
  Webflow native Tabs component via each block's `data-slide-toggle` id. Cycles
  through however many `.ss_side-navblock` items exist (auto-detected). Interval
  set in **seconds** via the `TIMER_SECONDS` constant, or per-page with
  `data-ss-seconds="8"` on `.ss_slide_sidenav`. Pauses on hover. Icon + label
  activate at `ICON_AT` (85%) of the fill; active label uses `ACTIVE_LABEL_COLOR`
  (`var(--text)`). Runs on desktop only — inert at/below `MOBILE_MAX` (default
  991px, override `data-ss-mobile-max`) so it can't steal focus from the mobile
  navbar; re-checks on resize/orientation. **Starts only once it scrolls into
  view** (IntersectionObserver). Pane content animation is split across two
  systems: `.ss_contentbox` is animated by the native Webflow IX3
  **"slidechange"** custom trigger (built in Designer — the script just emits
  `wfIx.emit("slidechange")` every time a new slide becomes active), while the
  `.image_wrapper` GSAP fade is **optional and off by default** (set
  `data-ss-content-anim="true"` on `.ss_slide_sidenav` to fade it in on enter
  and out at `FADE_OUT_AT` (80%) before the switch).

## essex-global.js — the site-wide bundle

One file for the Webflow **global** custom code (Before `</body>`). Sections:

1. `[data-dd-onclick]` — desktop-only parent dropdown click navigation.
2. `[data-max-words]` — trim element text to N words with an ellipsis.
3. Stop navbar tab clicks from closing the open menu.
4. `[data-tab-toggle]` — custom subnav tab controls (hover on desktop, click on touch).
5. Blur-on-mouseleave fix so the products dropdown closes cleanly.
6. `[data-prefilter]` — region subnav prefilter links.
7. `[data-procat-toggle="submit"]` — build a `/products?…` query from checked filters.
8. `[data-slide-toggle]` — activate a Webflow native tab by ID (see `slide-toggle.js`).

**Load this OR `slide-toggle.js`, not both** — section 8 is the same handler,
so loading both would fire the tab click twice. For the global settings, use
`essex-global.js` alone.

## essex-gsap.js — attribute-driven GSAP animations

A small framework for in-view animations. Detects entry with
IntersectionObserver (no ScrollTrigger plugin needed) and degrades cleanly:
if GSAP isn't on the page, or the visitor has *prefers-reduced-motion*, the
element is snapped straight to its final state so the number still reads right.

Load **GSAP core first**, then this file, both pinned to a version:

```html
<script src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js"></script>
<script src="https://cdn.jsdelivr.net/gh/essexsolutions/essex-tools@v2.17.0/essex-gsap.js"></script>
```

(GSAP 3.13+ is fully free, all plugins included.)

### Count up on view — `[data-gsap-counter]`

Type the final string in Webflow (e.g. `$1,200+`), then add
`data-gsap-counter="1200"`. The target is the attribute; the **prefix, suffix,
decimal places, and thousands separator are inferred from the text you typed**,
so `$1,200+`, `2.5M`, and `98%` all animate correctly with zero extra config.
Each piece can be overridden:

| Attribute | Default | Notes |
| --- | --- | --- |
| `data-gsap-counter` | — | Target number (required), e.g. `1200` |
| `data-gsap-counter-duration` | `0.5` | Seconds |
| `data-gsap-counter-delay` | `0` | Seconds to wait after entering view (stagger a row of stats) |
| `data-gsap-counter-start` | `0` | Value to count from |
| `data-gsap-counter-ease` | `power1.out` | Any GSAP ease |
| `data-gsap-counter-decimals` | inferred | Decimal places |
| `data-gsap-counter-separator` | inferred | Thousands separator (`""` to disable) |
| `data-gsap-counter-prefix` | inferred | Text before the number |
| `data-gsap-counter-suffix` | inferred | Text after the number |
| `data-gsap-counter-once` | `true` | `"false"` replays every time it enters view |

Adding more animation types: each is a self-contained block with its own
selector and an `initX()` call wired into `init()` at the bottom of the file.

## slide-toggle.js — switch Webflow tabs from any element

Lets any element activate a Webflow native tab without being inside the
Tabs component. Add `data-slide-toggle="<tab-link-id>"` to a button, div,
image, etc., and clicking it fires the matching tab.

Setup in Webflow:
1. Give a tab link an ID in Element Settings — e.g. `tab-industrial`.
2. On any element add custom attribute `data-slide-toggle` = `tab-industrial`.
3. Clicking that element runs the tab's native switch (animation included),
   because it triggers Webflow's own `.w-tab-link` click handler.

Notes:
- One delegated `click` listener, so triggers added later (CMS, IX) still work.
- The ID may sit on either the tab **link** (`.w-tab-link`) or the tab
  **pane** (`.w-tab-pane`) — both resolve to the correct link.
- `e.preventDefault()` stops links/buttons from jumping or submitting.

## essex-email-autofill.js — v2 (server-side lookup)

**Breaking change vs. v1.** v1 read a Jetboost on-page Collection List (every
contact's data was in the DOM, capped at 100 items, and the Jetboost search
input disabled the form's Submit button). v2 removes Jetboost entirely and
instead calls our own edge API:

    GET /api/contact-lookup?email=…   →   { match, contact }

served by the **`essexsolutions/api`** Webflow Cloud app (mounted at `/api`,
same origin as the form). Only the single matching contact is ever returned;
no contact data is shipped to the page.

Required Webflow page changes when deploying v2 to `/contact`:
- Delete the Jetboost results Collection List from the page.
- Remove the `jetboost-list-search-input-6xn5` class from the `#Email` field.

Everything else (green check, work-email validation, radio selection,
instant-clear when the email is edited away from a match) is unchanged.

### v2.1 — gate the multi-step "Next" button

The script also **blocks the multi-step form from advancing past the email
step unless the email is a valid work email** (or a recognized returning lead,
which is always allowed). It intercepts the `multi-step.js` Next click *and*
the Enter key in the capture phase, and greys out the Next button
(`.email-gate-blocked`) while the email is empty/invalid. Toggle via
`CFG.gateNextOnInvalidEmail`. This adds one rule to
`essex-email-autofill.css` — load the matching `@v…` tag for both files.

## multi-step.js — what was changed vs. the original

Original source: `https://cdn.jsdelivr.net/gh/videsigns/webflow-tools@latest/multi-step.js`
(was being loaded on `/contact` from `https://h2mwk5.csb.app/src/multi-step.js`).

- Removed the `updateCounter()` **call** so the script no longer POSTs to
  `https://videsigns-staging.co.uk/counter` on page load.
  (The function body is left intact but is never invoked; no network request is made.)
- Nothing else was modified. Form behavior is unchanged.

## How to load these from Webflow safely

1. **Tag an immutable release** (never use `@latest`):

   ```sh
   git tag v1.0.0
   git push origin v1.0.0
   ```

2. **Load via jsDelivr**, pinned to the tag, with Subresource Integrity.
   Put this in *Site/Page Settings → Custom Code → Before </body>* and
   DELETE the old `h2mwk5.csb.app` tag (and the commented-out `@latest` line):

   ```html
   <script
     src="https://cdn.jsdelivr.net/gh/essexsolutions/essex-tools@v1.0.0/multi-step.js"
     integrity="sha384-+4ILDGNkXPXENbL9KUAcuPfdBLD2U7YO7tweXcH6w9cvQLYp9VtrKJoZL0w3jwUm"
     crossorigin="anonymous"></script>
   ```

   The `integrity` hash makes the browser refuse to run the file if even one byte
   changes — so a compromised CDN cannot inject code. Recompute it whenever you
   intentionally update the file:

   ```sh
   echo "sha384-$(openssl dgst -sha384 -binary multi-step.js | openssl base64 -A)"
   ```

### Notes
- Pinning to `@v1.0.0` (or a full commit SHA) means it can never silently
  auto-update the way `@latest` does.
- Keep exactly ONE multi-step.js script tag on the page.
- jsDelivr caches tagged releases aggressively; a new tag = new URL, so cache
  busting is automatic.
