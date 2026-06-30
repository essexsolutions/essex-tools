/**
 * Essex — slide-toggle
 * Any element with [data-slide-toggle="some-id"] becomes a trigger.
 * On click it activates the Webflow native tab whose ID matches that value.
 *
 * Usage in Webflow:
 *   1. Give a tab link an ID (e.g. "tab-industrial").
 *   2. Add a custom attribute data-slide-toggle="tab-industrial" to any element.
 *   3. Clicking that element switches to the matching tab.
 */
(function () {
  "use strict";

  var ATTR = "data-slide-toggle";

  // Resolve the actual Webflow tab link to click.
  // Accepts an ID pointing at either the tab link (.w-tab-link)
  // or the tab pane (.w-tab-pane) — both resolve to the correct link.
  function resolveTabLink(id) {
    var el = document.getElementById(id);
    if (!el) return null;

    if (el.classList.contains("w-tab-link")) return el;

    // ID was placed on the pane instead of the link — match via data-w-tab.
    if (el.classList.contains("w-tab-pane")) {
      var key = el.getAttribute("data-w-tab");
      if (key) {
        var tabs = el.closest(".w-tabs");
        if (tabs) {
          return tabs.querySelector('.w-tab-link[data-w-tab="' + key + '"]');
        }
      }
    }

    return el; // fall back to clicking the element itself
  }

  function activate(id) {
    var link = resolveTabLink(id);
    if (link) {
      link.click(); // Webflow's own handler does the tab switch + animation
    } else {
      console.warn("[slide-toggle] no tab found for id:", id);
    }
  }

  function onClick(e) {
    var trigger = e.target.closest("[" + ATTR + "]");
    if (!trigger) return;
    e.preventDefault();
    activate(trigger.getAttribute(ATTR));
  }

  function init() {
    // Single delegated listener — covers elements added later too.
    document.addEventListener("click", onClick);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
