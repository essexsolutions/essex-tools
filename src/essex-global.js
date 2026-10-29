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
 *   9. Append URL anchor to links            [data-page-anchor]
 *  10. Open Webflow lightbox by ID           [data-modal-lightbox]
 *  11. Global search Enter-to-submit         input[data-search="true"]
 *  12. Mobile smooth scroll-to               [data-mobile-scrollto]
 *  13. Lazy-load iframes                      iframe[data-src]
 *  14. Query param from link text            a[data-param-from-text]
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


  /* ============================================================
   * 9. APPEND URL ANCHOR TO LINKS  [data-page-anchor]
   * A link with data-page-anchor="value" gets "#value" appended to
   * its existing href, so it lands on the target page already anchored
   * to that section (e.g. href="/about" + data-page-anchor="team"
   * → "/about#team"). The attribute value may include the leading "#"
   * or not — both work. Any existing #hash on the href is replaced.
   *
   * Runs once at load and rewrites the href (rather than intercepting
   * the click) so middle-click, open-in-new-tab, and link hover
   * previews all carry the anchor too.
   * ============================================================ */
  document.querySelectorAll("[data-page-anchor]").forEach((link) => {
    const anchor = (link.getAttribute("data-page-anchor") || "").replace(/^#/, "").trim();
    if (!anchor) return;

    const href = link.getAttribute("href");
    if (href === null) return; // no URL to append to

    const base = href.split("#")[0]; // drop any existing hash
    link.setAttribute("href", `${base}#${anchor}`);
  });


  /* ============================================================
   * 10. OPEN WEBFLOW LIGHTBOX BY ID  [data-modal-lightbox]
   * Any element with data-modal-lightbox="<element-id>" opens the
   * hidden Webflow lightbox that carries that ID, by triggering its
   * native click. Lets a card/button anywhere open a lightbox it
   * isn't nested inside. Delegated, so CMS/IX-added triggers work too.
   * The value may include the leading "#" or not — both work.
   * ============================================================ */
  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-modal-lightbox]");
    if (!trigger) return;
    e.preventDefault();

    const id = (trigger.getAttribute("data-modal-lightbox") || "").replace(/^#/, "").trim();
    if (!id) return;

    const lightbox = document.getElementById(id);
    if (lightbox) {
      lightbox.click(); // Webflow's own handler opens the modal
    } else {
      console.warn(`[modal-lightbox] no lightbox found for id "#${id}"`);
    }
  });


  /* ============================================================
   * 11. GLOBAL SEARCH ENTER-TO-SUBMIT  input[data-search="true"]
   * The global search form (method="get" action="/results") submits
   * fine on button click, but pressing Enter in the field wasn't
   * triggering the implicit submit. Force it: on Enter, run the same
   * native submission the Search button does (requestSubmit → GET
   * redirect, honoring the field's `required` validation). We don't
   * touch the button path, which already works.
   * ============================================================ */
  document.querySelectorAll('form input[data-search="true"]').forEach((input) => {
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;

      const form = input.closest("form");
      if (!form) return;

      e.preventDefault(); // cancel the (non-firing) implicit submit
      if (typeof form.requestSubmit === "function") {
        form.requestSubmit(); // same path as clicking Search: validate + GET
      } else {
        form.submit(); // legacy fallback (skips constraint validation)
      }
    });
  });


  /* ============================================================
   * 12. MOBILE SMOOTH SCROLL-TO  [data-mobile-scrollto]
   * Tablet & below only: clicking an element with
   * data-mobile-scrollto="<element-id>" smooth-scrolls to the element
   * with that ID. On desktop the trigger keeps its native behavior.
   * Delegated, so CMS/IX-added triggers work too.
   * ============================================================ */
  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-mobile-scrollto]");
    if (!trigger) return;
    if (window.innerWidth > TABLET_BREAKPOINT) return; // tablet & below only

    const target = document.getElementById(trigger.getAttribute("data-mobile-scrollto"));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });


  /* ============================================================
   * 13. LAZY-LOAD IFRAMES  iframe[data-src]
   * Defers iframe loading until the page has fully loaded: on window
   * `load`, swap each iframe's data-src into src so heavy embeds don't
   * block initial page load. Runs on `load` (not DOMContentLoaded) on
   * purpose — that's what makes the deferral worthwhile.
   * ============================================================ */
  window.addEventListener("load", () => {
    document.querySelectorAll("iframe[data-src]").forEach((iframe) => {
      iframe.src = iframe.getAttribute("data-src");
    });
  });

  /* ============================================================
   * 14. QUERY PARAM FROM LINK TEXT  a[data-param-from-text]
   * Keeps one query parameter on a link in sync with the link's own
   * Weglot-translated text, e.g. the footer Terms link:
   *   <a href="/terms?q=Terms and Conditions" data-param-from-text="q">
   *     Terms &amp; Conditions
   *   </a>
   * On the base language (default `en`; override per link with
   * data-param-from-text-base="xx") the href is left exactly as
   * authored, so the English value can differ from the label. On every
   * other language the named param is replaced with the link's current
   * visible text, so whatever Weglot shows is what gets sent. Other
   * params, the path and the hash are preserved. Re-syncs whenever the
   * link text or <html lang> changes and on Weglot's events, so it
   * tracks the initial translation and in-page language switches.
   * ============================================================ */
  (() => {
    const links = Array.from(document.querySelectorAll("a[data-param-from-text]"));
    if (!links.length) return;

    const pageLang = () =>
      (document.documentElement.getAttribute("lang") || "").trim().toLowerCase();

    const isBaseLang = (link) => {
      const base = (link.getAttribute("data-param-from-text-base") || "en").trim().toLowerCase();
      const lang = pageLang();
      return !lang || lang === base || lang.startsWith(base + "-");
    };

    const sync = (link) => {
      const key = (link.getAttribute("data-param-from-text") || "").trim();
      if (!key) return;

      // Remember the authored href once so every rebuild starts from it.
      if (link.dataset.paramFromTextHref === undefined) {
        link.dataset.paramFromTextHref = link.getAttribute("href") || "";
      }
      const original = link.dataset.paramFromTextHref;

      if (isBaseLang(link)) {
        if (link.getAttribute("href") !== original) link.setAttribute("href", original);
        return;
      }

      const text = (link.textContent || "").replace(/\s+/g, " ").trim();
      if (!text) return;

      let url;
      try {
        url = new URL(original, window.location.href);
      } catch {
        return;
      }
      url.searchParams.set(key, text);

      // Keep the authored form: absolute stays absolute, relative stays relative.
      const next = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(original)
        ? url.href
        : url.pathname + url.search + url.hash;
      if (link.getAttribute("href") !== next) link.setAttribute("href", next);
    };

    const syncAll = () => links.forEach(sync);
    syncAll();

    // Weglot swaps the text nodes in place; follow every change.
    const textObserver = new MutationObserver((records) => {
      const touched = new Set();
      records.forEach((r) => {
        const node = r.target.nodeType === Node.ELEMENT_NODE ? r.target : r.target.parentElement;
        const link = node && node.closest("a[data-param-from-text]");
        if (link) touched.add(link);
      });
      touched.forEach(sync);
    });
    links.forEach((link) =>
      textObserver.observe(link, { childList: true, characterData: true, subtree: true })
    );

    // Language switches update <html lang>; Weglot also emits events.
    new MutationObserver(syncAll).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["lang"],
    });
    if (window.Weglot && typeof window.Weglot.on === "function") {
      window.Weglot.on("initialized", () => setTimeout(syncAll, 100));
      window.Weglot.on("languageChanged", () => setTimeout(syncAll, 200));
    }
  })();

});
