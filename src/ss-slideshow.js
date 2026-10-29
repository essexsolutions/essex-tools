/**
 * Essex — slideshow sidenav  (.ss_slide_sidenav)
 *
 * Drives a Webflow native Tabs component from the custom side nav and runs an
 * accumulating progress bar down the list.
 *
 * Each .ss_side-navblock has:
 *   - a.ss_slide-link[data-slide-toggle="tab-…"]  → the Webflow tab link id
 *   - .ss_icon--default / .ss_icon--active        → swapped on active
 *   - .ss_slide_bar > .ss_slidebar--fill          → progress fill
 *
 * Behavior:
 *   - Auto-advances every TIMER_SECONDS (see CONFIG). Cycles through however
 *     many .ss_side-navblock items exist — add/remove tabs freely.
 *   - Progress bars, active icons, and labels accumulate:
 *       · active block  → bar fills 0 → 100% over the interval (the clock)
 *       · a block's icon swaps to active and its label recolours to
 *         ACTIVE_LABEL_COLOR once the bar passes ICON_AT (default 85%)
 *       · passed blocks → bar pinned at 100%, icon + label stay active
 *       · upcoming      → bar 0%, default icon, muted label
 *     When the LAST block finishes it loops: bars reset to 0 and icons +
 *     labels revert to default as the first block starts filling again.
 *   - Pane content animation, split across two systems:
 *       · .ss_contentbox copy — driven by two native Webflow IX3 custom
 *         triggers built in Designer. "slidechange" fires when a new slide
 *         becomes active (play copy IN); "slidehide" fires at FADE_OUT_AT,
 *         just before the switch (play copy OUT, the reverse). The script
 *         only emits the events; the interactions own the timing/easing.
 *       · .image_wrapper — OPTIONAL GSAP fade, OFF by default. Set
 *         data-ss-content-anim="true" on .ss_slide_sidenav to ease it in on
 *         enter and fade it out at FADE_OUT_AT (80%) before the switch.
 *         No-ops cleanly if GSAP isn't loaded.
 *   - Click / tap a block to jump to it (earlier bars snap full) and restart.
 *   - Pauses while the cursor is over the side nav; resumes on leave.
 *   - Starts only once the slideshow scrolls into view (IntersectionObserver),
 *     and on desktop only: inert at/below MOBILE_MAX (default 991px) so the
 *     repeated tab-clicks don't steal focus from the mobile navbar. Re-checks on
 *     resize / orientation change. Manual tab taps still work via the global
 *     [data-slide-toggle] handler.
 */
function initSlideshow() {
  const sidenav = document.querySelector(".ss_slide_sidenav");
  if (!sidenav) return;

  /* ===================== CONFIG ===================== *
   * How long each tab stays before advancing, in SECONDS.
   * Change it here, or — without a code push — set
   * data-ss-seconds="8" on the .ss_slide_sidenav element in Webflow.
   * ================================================== */
  const TIMER_SECONDS = 5;

  const seconds = Number(sidenav.dataset.ssSeconds) || TIMER_SECONDS;
  const DURATION = seconds * 1000;

  // Progress bars are vertical by default (fill grows top → bottom). Set
  // data-ss-bar="horizontal" on .ss_slide_sidenav if your bars run sideways.
  const VERTICAL = sidenav.dataset.ssBar !== "horizontal";

  // Fraction of the bar fill at which a block's icon + label switch to active.
  const ICON_AT = 0.85;
  // Label colour while a block is active (your Webflow text variable).
  const ACTIVE_LABEL_COLOR = "var(--text)";

  // GSAP pane content animation. The incoming pane's .image_wrapper fades
  // 0 → 1, then fades back out once the bar passes FADE_OUT_AT so the next
  // slide can take over. (.ss_contentbox is animated separately by the native
  // "slidechange"/"slidehide" IX3 triggers — see emitIx below.)
  const IN_DURATION = 0.5;   // seconds, content ease-in
  const FADE_OUT_AT = 0.80;  // fraction of the bar at which content fades out
  // GSAP content animation is OFF by default so it can't fight a native Webflow
  // tab fade. Set data-ss-content-anim="true" on .ss_slide_sidenav (and turn the
  // native tab fade OFF) to use the slide-up + image fade instead.
  const CONTENT_ANIM = sidenav.dataset.ssContentAnim === "true";

  // Auto-advance is disabled at/below this width (px) so its repeated tab-clicks
  // don't steal focus from the mobile navbar. Override with data-ss-mobile-max
  // on .ss_slide_sidenav (e.g. "767" to keep it running on tablet).
  const MOBILE_MAX = Number(sidenav.dataset.ssMobileMax) || 991;

  // Resolve a data-slide-toggle id to its Webflow tab link.
  const resolveTabLink = (id) => {
    const el = document.getElementById(id);
    if (!el) return null;
    if (el.classList.contains("w-tab-link")) return el;
    if (el.classList.contains("w-tab-pane")) {
      const key = el.getAttribute("data-w-tab");
      const tabs = el.closest(".w-tabs");
      if (key && tabs) return tabs.querySelector(`.w-tab-link[data-w-tab="${key}"]`);
    }
    return el;
  };

  // Build a model of each nav block.
  const blocks = Array.from(sidenav.querySelectorAll(".ss_side-navblock"))
    .map((block) => {
      const trigger = block.querySelector("[data-slide-toggle]") || block;
      const fill = block.querySelector(".ss_slidebar--fill");
      // Resolve the matching Webflow tab pane so we can animate its content.
      const link = resolveTabLink(trigger.getAttribute("data-slide-toggle"));
      const paneId = link && link.getAttribute("aria-controls");
      const pane = paneId ? document.getElementById(paneId) : null;
      return {
        block,
        trigger,
        targetId: trigger.getAttribute("data-slide-toggle"),
        iconDefault: block.querySelector(".ss_icon--default"),
        iconActive: block.querySelector(".ss_icon--active"),
        label: trigger.querySelector(":scope > div:not(.ss_slide-icons)"),
        image: pane ? pane.querySelector(".image_wrapper") : null,
        fill,
        vertical: VERTICAL,
        anim: null,
      };
    });

  if (!blocks.length) return;

  const origin = (nav) => (nav.vertical ? "top center" : "left center");
  const empty  = (nav) => (nav.vertical ? "scaleY(0)" : "scaleX(0)");
  const full   = (nav) => (nav.vertical ? "scaleY(1)" : "scaleX(1)");

  const cancel = (nav) => { if (nav.anim) { nav.anim.cancel(); nav.anim = null; } };

  // Active visual state for a block: swap icon + recolour label.
  const setActiveVisual = (nav, on) => {
    if (nav.iconDefault) nav.iconDefault.style.opacity = on ? "0" : "1";
    if (nav.iconActive) nav.iconActive.style.display = on ? "block" : "none";
    if (nav.label) nav.label.style.color = on ? ACTIVE_LABEL_COLOR : "";
  };

  // Fire a native Webflow IX3 custom trigger. Interactions built in Designer
  // against these events animate each pane's .ss_contentbox; the script only
  // emits the events and the interactions own their timing/easing:
  //   · "slidechange" — a new slide becomes active → play the copy IN.
  //   · "slidehide"   — the active slide is about to leave (fired at
  //                     FADE_OUT_AT) → play the copy OUT (reverse of IN).
  // No-ops if ix3 isn't available (e.g. IX2-only sites or the Designer canvas).
  const emitIx = (event) => {
    try {
      const wfIx = window.Webflow && window.Webflow.require && window.Webflow.require("ix3");
      if (wfIx) wfIx.emit(event);
    } catch (e) {
      // ix3 not present — no-op.
    }
  };

  // A global `transition: all` (or any CSS transition on these elements) fights
  // GSAP — the browser re-animates every per-frame inline change. Disable the
  // transition while GSAP drives the element; restore it when the tween ends so
  // idle/hover transitions still work.
  const freeze = (el) => { if (el) el.style.transition = "none"; };
  const thaw = (el) => () => { if (el) el.style.transition = ""; };

  const animateIn = (nav) => {
    const g = window.gsap;
    if (!g || !nav.image) return;
    freeze(nav.image);
    g.fromTo(nav.image, { opacity: 0 },
      { opacity: 1, duration: IN_DURATION, ease: "power2.out", overwrite: "auto", onComplete: thaw(nav.image) });
  };

  const animateOut = (nav) => {
    const g = window.gsap;
    if (!g || !nav.image) return;
    freeze(nav.image);
    // Fade out over the remaining time so it lands right as the tab switches.
    const outDur = (DURATION * (1 - FADE_OUT_AT)) / 1000;
    g.to(nav.image, { opacity: 0, duration: outDur, ease: "power1.in", overwrite: "auto" });
  };

  const resetContent = (nav) => {
    const g = window.gsap;
    if (!nav.image) return;
    if (g) { g.killTweensOf(nav.image); g.set(nav.image, { clearProps: "opacity,transform" }); }
    nav.image.style.transition = "";
  };

  // Snap a bar to a fixed state (instant, no animation).
  const setBar = (nav, state) => {
    if (!nav.fill) return;
    cancel(nav);
    nav.fill.style.transformOrigin = origin(nav);
    nav.fill.style.transform = state === "full" ? full(nav) : empty(nav);
  };

  // Animate the active bar 0 → 100% over DURATION; its finish drives advance.
  const runBar = (nav) => {
    if (!nav.fill) return null;
    cancel(nav);
    nav.fill.style.transformOrigin = origin(nav);
    nav.anim = nav.fill.animate(
      [{ transform: empty(nav) }, { transform: full(nav) }],
      { duration: DURATION, easing: "linear", fill: "forwards" }
    );
    return nav.anim;
  };

  let current = -1;
  let fallback = null;

  // Fire per-block phases as the bar fills: play the copy OUT (native "slidehide"
  // IX3 trigger) at FADE_OUT_AT so it reverses just before the next slide's
  // "slidechange" plays the new copy IN, and flip icon + label at ICON_AT. Polls
  // the live animation so both honour hover-pause (currentTime freezes while
  // paused).
  const armPhases = (nav, anim) => {
    const phases = [
      { at: FADE_OUT_AT, done: false, fn: () => emitIx("slidehide") },
      { at: ICON_AT, done: false, fn: () => setActiveVisual(nav, true) },
    ];
    if (CONTENT_ANIM) phases.push({ at: FADE_OUT_AT, done: false, fn: () => animateOut(nav) });
    if (!anim) { // no bar to track → fire on plain timers (guarded if stale)
      phases.forEach((p) =>
        setTimeout(() => { if (blocks[current] === nav) p.fn(); }, DURATION * p.at));
      return;
    }
    const tick = () => {
      if (nav.anim !== anim) return; // superseded by advance / click
      const frac = (typeof anim.currentTime === "number" ? anim.currentTime : 0) / DURATION;
      phases.forEach((p) => { if (!p.done && frac >= p.at) { p.done = true; p.fn(); } });
      if (phases.every((p) => p.done)) return;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  // Activate block `index`. `reset` wipes every bar first (used when looping
  // back to the start or jumping to the first block).
  const go = (index, reset) => {
    clearTimeout(fallback);
    if (reset) blocks.forEach((nav) => setBar(nav, "empty"));
    current = index;

    blocks.forEach((nav, i) => {
      const on = i === index;
      nav.block.classList.toggle("is-active", on);
      // Passed blocks show their active icon + coloured label. The current
      // block starts on its default icon/muted label and flips at ICON_AT;
      // upcoming blocks stay default.
      setActiveVisual(nav, i < index);
      if (i < index) setBar(nav, "full");   // already passed → stay full
      else if (i > index) setBar(nav, "empty"); // upcoming → empty
      // i === index: bar animated below
    });

    // Switch the Webflow tab pane.
    const active = blocks[index];
    const link = resolveTabLink(active.targetId);
    if (link) link.click();

    // Fire the native "slidechange" IX3 trigger every time — it animates the
    // pane's .ss_contentbox IN via a Designer interaction. The matching
    // "slidehide" (OUT) is fired later at FADE_OUT_AT (see armPhases).
    emitIx("slidechange");
    // Optionally ease the pane's .image_wrapper in with GSAP (opt-in; off by
    // default so it can't fight a native Webflow tab fade).
    if (CONTENT_ANIM) animateIn(active);

    // Run the active bar; its finish advances the slideshow.
    const anim = runBar(active);
    if (anim) anim.onfinish = advance;
    else fallback = setTimeout(advance, DURATION);

    // Fade content out at FADE_OUT_AT, flip icon + label at ICON_AT.
    armPhases(active, anim);
  };

  function advance() {
    const next = (current + 1) % blocks.length;
    go(next, next === 0); // wrapping to the first block resets all bars
  }

  let running = false;

  const start = () => {
    if (running) return;
    running = true;
    // Click / tap to jump. stopPropagation keeps the global [data-slide-toggle]
    // handler from also firing (we switch the pane ourselves in go()).
    blocks.forEach((nav, i) => {
      nav.onClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        go(i, i === 0);
      };
      nav.trigger.addEventListener("click", nav.onClick);
    });
    go(0, true);
  };

  const stop = () => {
    if (!running) return;
    running = false;
    clearTimeout(fallback);
    current = -1;
    blocks.forEach((nav) => {
      cancel(nav);
      resetContent(nav); // kill GSAP tweens + clear inline opacity/transform
      if (nav.onClick) {
        nav.trigger.removeEventListener("click", nav.onClick);
        nav.onClick = null;
      }
      // Clear every inline style we set so bars/icons/label fall back to CSS.
      if (nav.fill) { nav.fill.style.transform = ""; nav.fill.style.transformOrigin = ""; }
      if (nav.iconDefault) nav.iconDefault.style.opacity = "";
      if (nav.iconActive) nav.iconActive.style.display = "";
      if (nav.label) nav.label.style.color = "";
      nav.block.classList.remove("is-active");
    });
  };

  // Pause on hover over the side nav, resume on leave (desktop only).
  sidenav.addEventListener("mouseenter", () => {
    if (!running) return;
    const a = blocks[current] && blocks[current].anim;
    if (a) a.pause();
  });
  sidenav.addEventListener("mouseleave", () => {
    if (!running) return;
    const a = blocks[current] && blocks[current].anim;
    if (a) a.play();
  });

  // Start only once the slideshow scrolls into view, and on desktop only.
  // Tears down at/below MOBILE_MAX; re-checks on resize / orientation change.
  const mq = window.matchMedia(`(max-width: ${MOBILE_MAX}px)`);
  let inView = false;
  const apply = () => {
    if (mq.matches) stop();      // mobile → never auto-run
    else if (inView) start();    // desktop + seen → run (no-op if already running)
    // desktop but not yet in view → wait for the observer
  };

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        inView = true;
        io.disconnect(); // one-shot: start once, then stop observing
        apply();
      }
    }, { threshold: 0.25 });
    io.observe(sidenav);
  } else {
    inView = true; // no IntersectionObserver → start without the in-view gate
  }

  apply(); // mobile teardown is immediate; desktop waits for in-view
  if (mq.addEventListener) mq.addEventListener("change", apply);
  else if (mq.addListener) mq.addListener(apply); // Safari < 14
}

// Run now if the DOM is ready, else wait — robust to the CDN script loading
// after DOMContentLoaded has already fired.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSlideshow);
} else {
  initSlideshow();
}
