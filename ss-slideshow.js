/**
 * Essex — slideshow sidenav  (.ss_slide_sidenav)
 *
 * STEP 1 (this version): swap the default / active icons when a
 * .ss_side-navblock is selected.
 *   - active block:  .ss_icon--default → opacity 0,  .ss_icon--active → display block
 *   - other blocks:  default visible,                active hidden
 * An .is-active class is also toggled on the block for any CSS hooks.
 *
 * NEXT: drive the actual pane switch, 5s auto-advance, and .ss_slidebar--fill.
 */
document.addEventListener("DOMContentLoaded", () => {
  const sidenav = document.querySelector(".ss_slide_sidenav");
  if (!sidenav) return;

  const navBlocks = Array.from(sidenav.querySelectorAll(".ss_side-navblock"));
  if (!navBlocks.length) return;

  // Reveal one block as active; reset all the others.
  const setActive = (activeBlock) => {
    navBlocks.forEach((block) => {
      const isActive = block === activeBlock;
      const iconDefault = block.querySelector(".ss_icon--default");
      const iconActive = block.querySelector(".ss_icon--active");

      if (iconDefault) iconDefault.style.opacity = isActive ? "0" : "1";
      if (iconActive) iconActive.style.display = isActive ? "block" : "none";

      block.classList.toggle("is-active", isActive);
    });
  };

  // Click / tap a nav block to activate it.
  navBlocks.forEach((block) => {
    const trigger = block.querySelector(".ss_slide-link") || block;
    trigger.addEventListener("click", (e) => {
      e.preventDefault(); // remove once the link drives the real slide switch
      setActive(block);
    });
  });

  // Start with the first block active.
  setActive(navBlocks[0]);
});
