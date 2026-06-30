/**
 * Essex — global site scripts
 * Single bundle for the Webflow site-wide custom code (Before </body>).
 *
 * Sections
 *   1. Parent dropdown onclick navigation   [data-dd-onclick]
 *   2. Limit text to N words                 [data-max-words]
 *   3. Keep navbar tabs from closing menu    .navbar_menu .w-tab-link / [data-tab-toggle]
 *   4. Custom subnav tab toggles             [data-tab-toggle]
 *   5. Dropdown mouseleave blur fix          .navbar_menu-dropdown
 *   6. Region subnav prefilter               [data-prefilter]
 *   7. Subnav category filters               [data-procat-toggle="submit"]
 *   8. Slide-toggle → Webflow native tabs    [data-slide-toggle]
 */
document.addEventListener("DOMContentLoaded", () => {

  /* ============================================================
   * 1. PARENT DROPDOWN ONCLICK NAVIGATION  [data-dd-onclick]
   * Desktop only: clicking a parent dropdown navigates to its slug.
   * On tablet/below the dropdown keeps its native open/close behavior.
   * ============================================================ */
  const TABLET_BREAKPOINT = 991; // Webflow tablet = 991px and below

  document.querySelectorAll("[data-dd-onclick]").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (window.innerWidth <= TABLET_BREAKPOINT) return; // let it behave normally

      const slug = el.getAttribute("data-dd-onclick");
      if (!slug) return;

      e.preventDefault();
      const path = slug.charAt(0) === "/" ? slug : "/" + slug;
      window.location.href = window.location.origin + path;
    });
  });


  /* ============================================================
   * 2. LIMIT TEXT TO N WORDS  [data-max-words]
   * Trims an element's text to its data-max-words count, adding "…".
   * ============================================================ */
  const limitWords = (text, maxWords) => {
    const words = text.trim().split(/\s+/);
    return words.length > maxWords
      ? words.slice(0, maxWords).join(" ") + "..."
      : text;
  };

  document.querySelectorAll("[data-max-words]").forEach((el) => {
    const max = Number(el.dataset.maxWords);
    el.textContent = limitWords(el.textContent, max);
  });


  /* ============================================================
   * 3. KEEP NAVBAR TABS FROM CLOSING THE MENU
   * Stops clicks on navbar native tabs / toggles from bubbling up
   * and collapsing the open dropdown menu.
   * ============================================================ */
  document
    .querySelectorAll(".navbar_menu .w-tab-link, .navbar_menu [data-tab-toggle]")
    .forEach((control) => {
      control.addEventListener("click", (e) => e.stopPropagation());
    });


  /* ============================================================
   * 4. CUSTOM SUBNAV TAB TOGGLES  [data-tab-toggle]
   * A custom control points (via selector) at a Webflow native tab.
   * Desktop (true hover) activates on mouseenter; touch/small falls
   * back to click. Active control gets the .is-active class.
   * ============================================================ */
  const toggleButtons = document.querySelectorAll("[data-tab-toggle]");

  const setActiveButton = (activeButton) => {
    toggleButtons.forEach((button) => {
      button.classList.toggle("is-active", button === activeButton);
    });
  };

  // Detect devices that truly support hover (desktop/trackpad, not touch)
  const supportsHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  toggleButtons.forEach((button) => {
    const activateTab = (e) => {
      e.preventDefault();
      e.stopPropagation();

      const targetSelector = button.getAttribute("data-tab-toggle");
      const targetTab = document.querySelector(targetSelector);

      if (targetTab) {
        targetTab.click();
        setActiveButton(button);
        if (document.activeElement && document.activeElement.blur) {
          document.activeElement.blur();
        }
      } else {
        console.warn(`Custom Tab Toggle: No tab found for "${targetSelector}"`);
      }
    };

    if (supportsHover) {
      button.addEventListener("mouseenter", activateTab); // desktop → hover
    } else {
      button.addEventListener("click", activateTab);      // touch/small → click
    }
  });


  /* ============================================================
   * 5. DROPDOWN MOUSELEAVE BLUR FIX
   * Active (focused) elements can keep the products dropdown open
   * after the cursor leaves. Blur on mouseleave so it closes cleanly.
   * ============================================================ */
  const productsDropdown = document.querySelector(".navbar_menu-dropdown.w-dropdown");
  productsDropdown?.addEventListener("mouseleave", () => {
    if (productsDropdown.contains(document.activeElement)) {
      document.activeElement.blur();
    }
  });


  /* ============================================================
   * 6. REGION SUBNAV PREFILTER  [data-prefilter]
   * Sends the user to href + a prefilter query string.
   * ============================================================ */
  document.querySelectorAll("[data-prefilter]").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const baseUrl = link.getAttribute("href") || "/products";
      const prefilter = link.getAttribute("data-prefilter") || "";
      window.location.href = `${baseUrl}${prefilter}`;
    });
  });


  /* ============================================================
   * 7. SUBNAV CATEGORY FILTERS  [data-procat-toggle="submit"]
   * Reads checked shape/material/temp options and builds a
   * /products?shape=…&material=…&temp=… query, then navigates.
   * ============================================================ */
  const normalizeValue = (value, key) => {
    if (!value) return "";
    if (key === "temp") return value.replace(/[^\d]/g, "");
    return value.trim().toLowerCase().replace(/\s+/g, "-");
  };

  const getCheckedValues = (root, attributeName, key) => {
    return Array.from(root.querySelectorAll(`[${attributeName}]`))
      .filter((item) => {
        const input = item.querySelector("input");
        return input && input.checked;
      })
      .map((item) => normalizeValue(item.getAttribute(attributeName), key))
      .filter(Boolean);
  };

  document.querySelectorAll('[data-procat-toggle="submit"]').forEach((button) => {
    button.addEventListener("click", (e) => {
      e.preventDefault();

      const form = button.closest("form") || document;
      const types = getCheckedValues(form, "data-procat-shape", "shape");
      const materials = getCheckedValues(form, "data-procat-material", "material");
      const temps = getCheckedValues(form, "data-procat-temp", "temp");

      const params = [];
      if (types.length) params.push(`shape=${types.map(encodeURIComponent).join(",")}`);
      if (materials.length) params.push(`material=${materials.map(encodeURIComponent).join(",")}`);
      if (temps.length) params.push(`temp=${encodeURIComponent(temps[0])}`);

      const query = params.length ? `?${params.join("&")}` : "";
      window.location.href = `/products${query}`;
    });
  });


  /* ============================================================
   * 8. SLIDE-TOGGLE → WEBFLOW NATIVE TABS  [data-slide-toggle]
   * Any element with data-slide-toggle="<tab-id>" activates the
   * Webflow tab with that ID. The ID may sit on the tab link
   * (.w-tab-link) or the tab pane (.w-tab-pane). Delegated, so it
   * also covers triggers added later (CMS, interactions).
   * ============================================================ */
  const resolveTabLink = (id) => {
    const el = document.getElementById(id);
    if (!el) return null;

    if (el.classList.contains("w-tab-link")) return el;

    if (el.classList.contains("w-tab-pane")) {
      const key = el.getAttribute("data-w-tab");
      if (key) {
        const tabs = el.closest(".w-tabs");
        if (tabs) return tabs.querySelector(`.w-tab-link[data-w-tab="${key}"]`);
      }
    }

    return el; // fall back to clicking the element itself
  };

  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-slide-toggle]");
    if (!trigger) return;
    e.preventDefault();

    const link = resolveTabLink(trigger.getAttribute("data-slide-toggle"));
    if (link) {
      link.click(); // Webflow's own handler does the tab switch + animation
    } else {
      console.warn("[slide-toggle] no tab found for id:", trigger.getAttribute("data-slide-toggle"));
    }
  });

});
