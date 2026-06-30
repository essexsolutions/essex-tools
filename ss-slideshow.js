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
 *   - Progress bars accumulate:
 *       · active block  → fill animates 0 → 100% over the interval (the clock)
 *       · passed blocks → stay pinned at 100%
 *       · upcoming      → 0%
 *     When the LAST block finishes it loops: every bar resets to 0 and the
 *     first block starts filling again.
 *   - Click / tap a block to jump to it (earlier bars snap full) and restart.
 *   - Pauses while the cursor is over the side nav; resumes on leave.
 */
document.addEventListener("DOMContentLoaded", () => {
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
      return {
        block,
        trigger,
        targetId: trigger.getAttribute("data-slide-toggle"),
        iconDefault: block.querySelector(".ss_icon--default"),
        iconActive: block.querySelector(".ss_icon--active"),
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

  // Activate block `index`. `reset` wipes every bar first (used when looping
  // back to the start or jumping to the first block).
  const go = (index, reset) => {
    clearTimeout(fallback);
    if (reset) blocks.forEach((nav) => setBar(nav, "empty"));
    current = index;

    blocks.forEach((nav, i) => {
      const on = i === index;
      nav.block.classList.toggle("is-active", on);
      if (nav.iconDefault) nav.iconDefault.style.opacity = on ? "0" : "1";
      if (nav.iconActive) nav.iconActive.style.display = on ? "block" : "none";
      if (i < index) setBar(nav, "full");   // already passed → stay full
      else if (i > index) setBar(nav, "empty"); // upcoming → empty
      // i === index: animated below
    });

    // Switch the Webflow tab pane.
    const link = resolveTabLink(blocks[index].targetId);
    if (link) link.click();

    // Run the active bar; its finish advances the slideshow.
    const anim = runBar(blocks[index]);
    if (anim) anim.onfinish = advance;
    else fallback = setTimeout(advance, DURATION);
  };

  function advance() {
    const next = (current + 1) % blocks.length;
    go(next, next === 0); // wrapping to the first block resets all bars
  }

  // Click / tap to jump. stopPropagation keeps the global [data-slide-toggle]
  // handler from also firing (we switch the pane ourselves in go()).
  blocks.forEach((nav, i) => {
    nav.trigger.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      go(i, i === 0);
    });
  });

  // Pause on hover over the side nav, resume on leave.
  sidenav.addEventListener("mouseenter", () => {
    const a = blocks[current] && blocks[current].anim;
    if (a) a.pause();
  });
  sidenav.addEventListener("mouseleave", () => {
    const a = blocks[current] && blocks[current].anim;
    if (a) a.play();
  });

  // Start on the first block.
  go(0, true);
});
