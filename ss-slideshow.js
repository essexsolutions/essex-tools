/**
 * Essex — slideshow sidenav  (.ss_slide_sidenav)
 *
 * Drives a Webflow native Tabs component from the custom side nav.
 * Each .ss_side-navblock has:
 *   - a.ss_slide-link[data-slide-toggle="tab-…"]  → the Webflow tab link id
 *   - .ss_icon--default / .ss_icon--active        → swapped on active
 *   - .ss_slide_bar > .ss_slidebar--fill          → progress bar
 *
 * Behavior:
 *   - Auto-advances every DURATION ms (default 5000; override with
 *     data-ss-duration on .ss_slide_sidenav).
 *   - Click / tap a block to jump to it and restart the timer.
 *   - The active block's fill animates 0 → 100% over DURATION, and its
 *     finish event is what advances the slideshow — one clock, no drift.
 *   - Pauses while the cursor is over the side nav; resumes on leave.
 */
document.addEventListener("DOMContentLoaded", () => {
  const sidenav = document.querySelector(".ss_slide_sidenav");
  if (!sidenav) return;

  const DURATION = Number(sidenav.dataset.ssDuration) || 5000;

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
      const track = fill ? fill.parentElement : null;
      // Orientation of the progress bar (vertical connector vs. horizontal).
      const vertical = track ? track.offsetHeight >= track.offsetWidth : true;
      return {
        block,
        trigger,
        targetId: trigger.getAttribute("data-slide-toggle"),
        iconDefault: block.querySelector(".ss_icon--default"),
        iconActive: block.querySelector(".ss_icon--active"),
        fill,
        vertical,
      };
    });

  if (!blocks.length) return;

  let current = -1;
  let anim = null;          // the running fill animation = our timer
  let fallback = null;      // setTimeout used only if a block has no fill

  const scaleEmpty = (nav) => (nav.vertical ? "scaleY(0)" : "scaleX(0)");
  const scaleFull  = (nav) => (nav.vertical ? "scaleY(1)" : "scaleX(1)");

  const resetFill = (nav) => {
    if (!nav.fill) return;
    nav.fill.style.transformOrigin = nav.vertical ? "top center" : "left center";
    nav.fill.style.transform = scaleEmpty(nav);
  };

  // Move to a block: swap icons, switch the pane, animate the bar, arm the clock.
  const go = (index) => {
    if (anim) { anim.cancel(); anim = null; }
    clearTimeout(fallback);
    current = index;

    blocks.forEach((nav, i) => {
      const on = i === index;
      nav.block.classList.toggle("is-active", on);
      if (nav.iconDefault) nav.iconDefault.style.opacity = on ? "0" : "1";
      if (nav.iconActive) nav.iconActive.style.display = on ? "block" : "none";
      if (!on) resetFill(nav);
    });

    // Switch the Webflow tab pane.
    const link = resolveTabLink(blocks[index].targetId);
    if (link) link.click();

    // Run the progress bar; its finish advances the slideshow.
    const nav = blocks[index];
    if (nav.fill) {
      nav.fill.style.transformOrigin = nav.vertical ? "top center" : "left center";
      anim = nav.fill.animate(
        [{ transform: scaleEmpty(nav) }, { transform: scaleFull(nav) }],
        { duration: DURATION, easing: "linear", fill: "forwards" }
      );
      anim.onfinish = next;
    } else {
      fallback = setTimeout(next, DURATION);
    }
  };

  function next() {
    go((current + 1) % blocks.length);
  }

  // Click / tap to jump. stopPropagation keeps the global [data-slide-toggle]
  // handler from also firing (we switch the pane ourselves in go()).
  blocks.forEach((nav, i) => {
    nav.trigger.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      go(i);
    });
  });

  // Pause on hover over the side nav, resume on leave.
  sidenav.addEventListener("mouseenter", () => { if (anim) anim.pause(); });
  sidenav.addEventListener("mouseleave", () => { if (anim) anim.play(); });

  // Start on the first block.
  go(0);
});
