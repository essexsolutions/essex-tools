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

     TAGS  (on every render)
       • Finsweet writes the English `fs-list-value` into the applied-filter
         bubbles (`fs-list-element="tag-value"`). On Weglot subdomains the
         bubble is rewritten with the translated label of the checkbox that
         produced it, so "North America" reads "Amérique du Nord" on fr-fr.
         No-op in English, where label and value are identical.

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

    // Deferred for the same reason as in bindWriters: Webflow's delegated
    // toggle runs after the synthetic change events dispatched above.
    setTimeout(syncVisuals, 0);
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

    // Checkboxes / radios / selects: immediate URL write, DEFERRED visual
    // sync. Webflow's own handler for custom checkboxes is a delegated
    // `change` listener on document that blindly *toggles*
    // `.w--redirected-checked`. It runs after this form-level listener, so
    // setting the class synchronously here gets flipped back by Webflow and
    // the checkmark lags one interaction behind. Waiting one tick lets
    // Webflow toggle first, then we set the class from the real state.
    form.addEventListener("change", (e) => {
      const el = e.target;
      if (!el || !el.hasAttribute("fs-list-field")) return;
      if (el.type === "text" || el.type === "search") return; // handled below
      writeToURL();
      setTimeout(syncVisuals, 0);
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
   * TAGS: show the translated label, not the English fs-list-value
   * ------------------------------------------------------------- */

  // Finsweet renders one tag per field and joins its values with " | ".
  // The text it writes is the checkbox's `fs-list-value`, which must stay
  // English for matching to work (see README), so on a Weglot subdomain the
  // applied-filter bubbles read "North America" next to a checkbox labelled
  // "Amérique du Nord". Weglot does not pick the bubbles up (not even with
  // the tag class listed as a dynamic element or via Weglot.refresh()), so
  // we rewrite each bubble from the visible, already-translated label of
  // the checkbox that produced it. In English every label equals its value,
  // so this is a no-op there.
  const TAG_VALUE_SEP = " | ";

  function labelMap() {
    const map = {}; // fs-list-value -> visible label text
    const form = filtersForm();
    if (!form) return map;
    form.querySelectorAll('input[fs-list-field][type="checkbox"], input[fs-list-field][type="radio"]').forEach((inp) => {
      const value = inputValue(inp).trim();
      if (!value) return;
      const label = inp.closest("label");
      const textEl = label && (label.querySelector(".w-form-label") || label);
      const text = textEl ? textEl.textContent.trim() : "";
      if (text) map[value] = text;
    });
    return map;
  }

  function localizeTags() {
    const tags = document.querySelectorAll('[fs-list-element="tag-value"]');
    if (!tags.length) return;
    const map = labelMap();

    tags.forEach((el) => {
      // Finsweet updates an existing bubble in place when a second value
      // of the same field is ticked, so the current text is the raw
      // English source unless it is exactly what we wrote last time. Keep
      // the raw copy so a language change can re-map from the source.
      const current = el.textContent;
      let raw = el.getAttribute("data-list-value");
      if (raw === null || current !== el.getAttribute("data-list-label")) {
        raw = current.trim();
        el.setAttribute("data-list-value", raw);
      }
      const text = raw
        .split(TAG_VALUE_SEP)
        .map((v) => map[v.trim()] || v.trim())
        .join(TAG_VALUE_SEP);
      if (current !== text) el.textContent = text;
      el.setAttribute("data-list-label", text);
      // Already in the page language; keep Weglot's dynamic pass off it.
      el.setAttribute("data-wg-notranslate", "true");
    });
  }

  function bindTagLocalizer() {
    // Tags live outside the filters form and Finsweet rebuilds them on
    // every change, so watch the document rather than one container.
    // Debounced to one pass per batch; our own text write re-triggers the
    // observer once and the second pass finds nothing to change.
    let t;
    new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(localizeTags, 0);
    }).observe(document.body, { childList: true, characterData: true, subtree: true });

    // Weglot re-translates the labels on an in-page language switch.
    if (window.Weglot && typeof window.Weglot.on === "function") {
      window.Weglot.on("languageChanged", () => setTimeout(localizeTags, 100));
    }

    localizeTags();
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
      bindTagLocalizer();
      applyFromURL();
    },
  ]);
})();
