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
- `wave-relay.js` — parent-page bridge that relays the mouse into a
  `pointer-events:none` wave-visualizer iframe via `postMessage`, so its
  parallax + click-to-reverse interactions keep working from behind the embed.
  Attribute-configurable (`.iframe-mouse-relay` overlay), single source of truth
  across pages. Pairs with the visualizer's own `message` listener
  (`essexsolutions/visualizer`).
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
  systems: `.ss_contentbox` is animated by two native Webflow IX3 custom
  triggers (built in Designer) — the script emits **`"slidechange"`** when a new
  slide becomes active (play copy IN) and **`"slidehide"`** at `FADE_OUT_AT`
  (80%), just before the switch (play copy OUT, the reverse). The
  `.image_wrapper` GSAP fade is **optional and off by default** (set
  `data-ss-content-anim="true"` on `.ss_slide_sidenav` to fade it in on enter
  and out at `FADE_OUT_AT` before the switch).

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
9. `[data-page-anchor]` — append `#value` to a link's existing href so it lands
   on the target page already anchored to that section.
10. `[data-modal-lightbox]` — open a hidden Webflow lightbox by its element ID
    (`data-modal-lightbox="video-player"` → clicks `#video-player`).

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

## wave-relay.js — drive the wave visualizer from behind the iframe

The wave visualizer (`essexsolutions/visualizer`, mounted at `/wave/`) is
embedded in an `<iframe>` that carries `pointer-events:none` so the page
scrolls and clicks straight through it. The trade-off: the iframe never sees
native mouse events, so its **parallax tilt** and **click-to-reverse-flow**
interactions go dead. This script is the parent-page half of the fix — a single
source of truth to drop on any page holding the embed instead of pasting the
inline snippet each time.

How it works: a transparent overlay (`.iframe-mouse-relay`) sits on top of the
iframe and *does* receive the mouse. On `mousemove` / `mouseleave` / `click`
the script forwards a normalized (0–1) pointer to the iframe via `postMessage`.
The visualizer's own `message` listener (`src/scripts/main.js`) consumes:

```js
{ source: 'iframe-relay', type: 'mousemove'|'mouseleave'|'click', x, y }
```

and maps it to parallax (`mousemove`/`mouseleave`) and flow reversal (`click`).

Setup in Webflow:
1. Add the visualizer `<iframe>` — give it an ID (default `responsive-iframe`)
   and set `pointer-events:none` in its style.
2. Add a transparent overlay element on top of it, same size/position, with the
   class `iframe-mouse-relay` and `pointer-events:auto`.
3. Load this script (Before `</body>`). The defaults match the original inline
   snippet, so **no attributes are required**.

Config — set as custom attributes on the `.iframe-mouse-relay` overlay:

| Attribute | Default | Notes |
| --- | --- | --- |
| `data-relay-iframe` | `#responsive-iframe` | CSS selector (or bare id) of the iframe to drive |
| `data-relay-origin` | **auto** (derived from the iframe's `src`, then this page's origin) | `postMessage` targetOrigin — **must equal the origin of the iframe's `src`** or messages are dropped silently. Left unset, the script reads it off the iframe automatically, so it's correct on **`essexsolutions.com`** (production), **`essexsolutions.webflow.io`** (staging), and `localhost` alike. Only set this to pin a specific origin. |

Notes:
- **Origin is handled automatically — prod and staging both work with no config.**
  The target origin is derived from the iframe's own `src`, so the same script
  is correct on production (`https://essexsolutions.com`), Webflow staging
  (`https://essexsolutions.webflow.io`), and local dev. Relative embeds
  (`src="/wave/"`) resolve against the parent page's origin, so they're covered
  too. If the `src` can't be read at all, it falls back to **this page's own
  origin** (Webflow Cloud serves the visualizer same-origin as the page), which
  stays correct on both domains — no hardcoded domain to keep in sync. Set
  `data-relay-origin` only if you deliberately want to lock it to one origin.
- Multiple embeds on one page: add several `.iframe-mouse-relay` overlays, each
  with its own `data-relay-iframe`; every overlay is wired independently.
- Load pinned to a tag, same as the others:

  ```html
  <script src="https://cdn.jsdelivr.net/gh/essexsolutions/essex-tools@v2.22.0/wave-relay.js"></script>
  ```

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

2. **Load via jsDelivr**, pinned to the tag. Put this in *Site/Page Settings →
   Custom Code → Before </body>* and DELETE the old `h2mwk5.csb.app` tag (and
   the commented-out `@latest` line):

   ```html
   <script src="https://cdn.jsdelivr.net/gh/essexsolutions/essex-tools@v1.0.0/multi-step.js"></script>
   ```

### Subresource Integrity (optional)

Pinning to an immutable tag already means the file at that URL can never change,
so an `integrity` hash is **optional**. It buys one extra thing: if jsDelivr
itself were compromised and served different bytes at that exact URL, the
browser would refuse to run the file. Real, but low-probability — and it comes
at a cost: every time you cut a new version you **must** recompute the hash or
the browser hard-blocks the script (silent breakage).

If you want it, add `integrity` + `crossorigin` (both are required together —
SRI on a cross-origin script needs `crossorigin` to verify):

   ```html
   <script
     src="https://cdn.jsdelivr.net/gh/essexsolutions/essex-tools@v1.0.0/multi-step.js"
     integrity="sha384-+4ILDGNkXPXENbL9KUAcuPfdBLD2U7YO7tweXcH6w9cvQLYp9VtrKJoZL0w3jwUm"
     crossorigin="anonymous"></script>
   ```

   Recompute the hash whenever you tag a new version:

   ```sh
   echo "sha384-$(openssl dgst -sha384 -binary multi-step.js | openssl base64 -A)"
   ```

Current practice on the Essex site is to load **without** SRI — the tag pin is
considered enough for these public, secret-free scripts.

### Purging the jsDelivr cache (only needed for `@latest` / branches)

Immutable tags (`@v2.22.0`) **never** need purging — the bytes at that URL can't
change, so jsDelivr caches them forever and that's the whole point. You only need
to purge when you load a **floating** ref whose bytes *do* change under the same
URL: `@latest`, `@main`, or a branch name. jsDelivr caches those at its edge for
up to 7 days, so a fresh `git push` won't reach the site until the cache is purged.

Purge by hitting `purge.jsdelivr.net` with the exact same path you load — once per
file:

```sh
curl https://purge.jsdelivr.net/gh/essexsolutions/essex-tools@latest/essex-global.js
curl https://purge.jsdelivr.net/gh/essexsolutions/essex-tools@latest/multi-step.js
```

Each call returns JSON with the refreshed cache status. You can also paste the
full file URL into the web tool: <https://www.jsdelivr.com/tools/purge>.

Notes:
- Purge is **per exact URL** — purge every file *and* every floating ref you
  actually load (`@latest` and `@main` are separate cache entries).
- It can take a minute or two to propagate across all of jsDelivr's edge nodes.
- Your browser caches too — hard-refresh (Cmd-Shift-R) after purging to confirm.
- The clean alternative to purging is to stop using `@latest`: cut a new tag and
  bump the `@v…` in your embed (see above). New tag = new URL = instant, no purge.

### Notes
- Pinning to `@v1.0.0` (or a full commit SHA) means it can never silently
  auto-update the way `@latest` does.
- Keep exactly ONE multi-step.js script tag on the page.
- jsDelivr caches tagged releases aggressively; a new tag = new URL, so cache
  busting is automatic.
