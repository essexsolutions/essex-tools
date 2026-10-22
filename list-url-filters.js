/* =====================================================================
   Essex Solutions — Finsweet list filters <-> URL sync (Attributes v2)
   ---------------------------------------------------------------------
   Loaded on /products and /resources via jsDelivr (pin to a tag, never
   @latest). Works on any page with a Finsweet `fs-list-element="filters"`
   form: the filter keys are discovered from the form itself, so there is
   nothing to configure per page. On /products it replaces the page-level
   inline "[url-filters]" script in Page Settings -> Before </body>; remove
   that inline script when this file is loaded, or the two will fight over
   the checkboxes.

   WHAT IT DOES
     READ  (on load, after Finsweet's list module is ready)
       • Parses the friendly query string the rest of the site already
         produces (essex-global.js sections 6 + 7, subnav prefilters):
             /products?region=north-america&temp=200&shape=round,rectangular
             /resources?category=product-datasheets&language=french
         and checks the matching `fs-list-value` checkboxes. Values are
         matched loosely (case, spacing, punctuation and the °C suffix are
         ignored), so `north-america`, `North America` and `northamerica`
         all hit the same checkbox.
       • `q=` fills the keyword search box (`fs-list-field="*"`).
       • Keeps Webflow's custom checkbox visuals in step with the real
         checked state (Finsweet re-renders can wipe the visual class).

     WRITE (on every filter change, no reload)
       • Rebuilds the same friendly query string from the current filter
         state and swaps it into the address bar with history.replaceState.
       • A key disappears from the URL when its last value is unchecked.
       • Only the keys this script owns are touched; anything else in the
         query string (utm_*, Weglot params, …) is left alone.
       • Values come from the untranslated `fs-list-value` attributes, so
         the URL is identical on www., fr-fr., de-de., … and a link copied
         from one language works on every other.

   FORMAT
       key   = the fs-list-field name (lower-case) of any input in the
               filters form; `q` for the keyword box (`fs-list-field="*"`).
               Friendly aliases (plurals, `temperature`, `search`) are
               accepted on read and rewritten to the canonical key.
       value = lower-case, non-alphanumerics -> "-", multiple values joined
               by ",". `temp` and `thermal-class` keep digits only ("200").

   This file does NOT fix filter matching on Weglot subdomains by itself.
   Finsweet compares checkbox values against the item field TEXT, which
   Weglot translates. Each product card needs a hidden, `data-wg-notranslate`
   element carrying `fs-list-field` so the compared text stays English.
   See README.md -> "list-url-filters.js".
   ===================================================================== */
(function () {
  "use strict";

  /* ---------------------------------------------------------------
   * Config
   * ------------------------------------------------------------- */

  // Friendly spellings accepted on read, mapped to the fs-list-field name.
  // Every fs-list-field found in the filters form is ALSO accepted as its
  // own key (e.g. `category`, `language`), so this list only needs the
  // spellings that differ from the field name.
  const EXTRA_ALIASES = {
    applications: "application",
    materials: "material",
    temperature: "temp",
    temperatures: "temp",
    shapes: "shape",
    industries: "industry",
    countries: "country",
    categories: "category",
    languages: "language",
    regions: "region",
    thermalclass: "thermal-class",
    q: "*",
    search: "*",
    keyword: "*",
  };

  // Field name -> the param key we WRITE. Only `*` differs from its field.
  const CANONICAL_OVERRIDES = { "*": "q" };

  // Filled in at boot from the form on the page (see discoverFields).
  let ALIASES = {};   // url key (lower-case) -> field
  let CANONICAL = {}; // field -> url key

  // Fields whose URL value is digits only (temperature classes).
  const NUMERIC_FIELDS = new Set(["temp", "thermal-class"]);

  const SEARCH_DEBOUNCE_MS = 250;

  /* ---------------------------------------------------------------
   * Helpers
   * ------------------------------------------------------------- */

  const norm = (s) => (s || "").trim().toLowerCase();
  const compact = (s) => norm(s).replace(/[^a-z0-9]/g, "");
  const digits = (s) => {
    const m = (s || "").match(/\d+/);
    return m ? m[0] : "";
  };

  // Loose equality used when applying URL values to checkboxes.
  function valueMatches(want, candidate) {
    if (norm(want) === norm(candidate)) return true;
    if (compact(want) && compact(want) === compact(candidate)) return true;
    if (/^\d+$/.test(norm(want)) && digits(want) === digits(candidate)) return true;
    return false;
  }

  // Canonical URL form of a checkbox value. Mirrors normalizeValue() in
  // essex-global.js section 7 so both sides emit identical links.
  function toUrlValue(value, field) {
    if (!value) return "";
    if (NUMERIC_FIELDS.has(field)) return digits(value);
    return norm(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  const filtersForm = () => document.querySelector('[fs-list-element="filters"]');

  const fieldInputs = (field) =>
    Array.from(document.querySelectorAll('[fs-list-element="filters"] [fs-list-field="' + field + '"]'));

  const inputValue = (el) => el.getAttribute("fs-list-value") || el.value || "";

  // Build ALIASES / CANONICAL from the inputs actually present in the form.
  function discoverFields() {
    ALIASES = {};
    CANONICAL = {};
    const form = filtersForm();
    if (!form) return;

    form.querySelectorAll("input[fs-list-field], select[fs-list-field], textarea[fs-list-field]").forEach((el) => {
      const field = (el.getAttribute("fs-list-field") || "").trim();
      if (!field) return;
      const key = CANONICAL_OVERRIDES[field] || field.toLowerCase();
      CANONICAL[field] = key;
      ALIASES[key] = field;
    });

    Object.keys(EXTRA_ALIASES).forEach((alias) => {
      const field = EXTRA_ALIASES[alias];
      if (field in CANONICAL) ALIASES[alias] = field; // only for fields on this page
    });
  }

  /* ---------------------------------------------------------------
   * Webflow checkbox visuals
   * ------------------------------------------------------------- */

  function syncVisuals() {
    document.querySelectorAll('[fs-list-field][type="checkbox"], [fs-list-field][type="radio"]').forEach((inp) => {
      const label = inp.closest("label");
      const visual = label && label.querySelector(".w-checkbox-input, .w-radio-input");
      if (visual) visual.classList.toggle("w--redirected-checked", inp.checked);
    });
  }

  /* ---------------------------------------------------------------
   * READ: URL -> filters
   * ------------------------------------------------------------- */

  let suspendWrites = false;

  function checkOne(field, value) {
    const target = fieldInputs(field).find((el) => valueMatches(value, inputValue(el)));
    if (!target) return false;
    if (target.checked) return true;
    target.checked = true;
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function setSearch(value) {
    const box = fieldInputs("*").find((el) => el.tagName === "INPUT");
    if (!box) return false;
    if (box.value === value) return true;
    box.value = value;
    box.dispatchEvent(new Event("input", { bubbles: true }));
    box.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function applyFromURL() {
    const params = new URLSearchParams(location.search);
    const missed = [];

    suspendWrites = true;
    params.forEach((rawValue, rawKey) => {
      const field = ALIASES[rawKey.toLowerCase()];
      if (!field) return; // not ours (utm_*, etc.)

      if (field === "*") {
        setSearch(rawValue);
        return;
      }

      const values = rawValue.split(",").map((v) => v.trim()).filter(Boolean);
      const hits = values.map((v) => checkOne(field, v));
      if (!hits.some(Boolean)) missed.push(rawKey + "=" + rawValue);
    });
    suspendWrites = false;

    if (missed.length) console.warn("[list-url-filters] no match for:", missed);

    syncVisuals();
    setTimeout(syncVisuals, 200);
    setTimeout(syncVisuals, 600);

    // Canonicalise whatever we were handed (e.g. "North America" -> "north-america").
    writeToURL();
  }

  /* ---------------------------------------------------------------
   * WRITE: filters -> URL
   * ------------------------------------------------------------- */

  function collectState() {
    const state = {}; // field -> [urlValue, ...]
    const form = filtersForm();
    if (!form) return state;

    form.querySelectorAll("[fs-list-field]").forEach((el) => {
      const field = el.getAttribute("fs-list-field");
      if (!field || !(field in CANONICAL)) return;

      if (el.tagName === "INPUT" && (el.type === "checkbox" || el.type === "radio")) {
        if (!el.checked) return;
        const v = toUrlValue(inputValue(el), field);
        if (!v) return;
        (state[field] ||= []).push(v);
        return;
      }

      if (el.tagName === "SELECT") {
        Array.from(el.selectedOptions).forEach((opt) => {
          const v = toUrlValue(opt.value, field);
          if (v) (state[field] ||= []).push(v);
        });
        return;
      }

      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        const v = el.value.trim();
        if (v) (state[field] ||= []).push(v); // keyword kept verbatim
      }
    });

    return state;
  }

  function writeToURL() {
    if (suspendWrites) return;

    const url = new URL(location.href);
    const params = url.searchParams;

    // Drop every key we own (canonical and alias spellings, any case).
    Array.from(params.keys()).forEach((k) => {
      if (k.toLowerCase() in ALIASES) params.delete(k);
    });

    const state = collectState();
    Object.keys(state).forEach((field) => {
      const unique = Array.from(new Set(state[field]));
      if (unique.length) params.set(CANONICAL[field], unique.join(","));
    });

    // URLSearchParams encodes "," as %2C; keep the friendly, readable form.
    const qs = params.toString().replace(/%2C/gi, ",");
    const next = url.pathname + (qs ? "?" + qs : "") + url.hash;
    const current = location.pathname + location.search + location.hash;
    if (next !== current) history.replaceState(history.state, "", next);
  }

  let searchTimer;
  function bindWriters() {
    const form = filtersForm();
    if (!form) return;

    // Checkboxes / radios / selects: immediate.
    form.addEventListener("change", (e) => {
      const el = e.target;
      if (!el || !el.hasAttribute("fs-list-field")) return;
      if (el.type === "text" || el.type === "search") return; // handled below
      writeToURL();
      syncVisuals();
    });

    // Keyword box: debounced so we don't rewrite on every keystroke.
    form.addEventListener("input", (e) => {
      const el = e.target;
      if (!el || !el.hasAttribute("fs-list-field")) return;
      if (el.type !== "text" && el.type !== "search" && el.tagName !== "TEXTAREA") return;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(writeToURL, SEARCH_DEBOUNCE_MS);
    });

    // Finsweet's "Clear" resets inputs without firing change events.
    document.querySelectorAll('[fs-list-element="clear"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        setTimeout(() => {
          writeToURL();
          syncVisuals();
        }, 50);
      });
    });

    // Finsweet may re-render the filters panel; keep visuals honest.
    let t;
    new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(syncVisuals, 50);
    }).observe(form, { childList: true, subtree: true });
  }

  /* ---------------------------------------------------------------
   * Boot: wait for Finsweet's list module, then read + bind.
   * ------------------------------------------------------------- */

  window.FinsweetAttributes = window.FinsweetAttributes || [];
  window.FinsweetAttributes.push([
    "list",
    () => {
      discoverFields();
      if (!Object.keys(CANONICAL).length) return; // no filter form on this page
      bindWriters();
      applyFromURL();
    },
  ]);
})();
