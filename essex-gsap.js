/**
 * Essex — GSAP scroll/in-view animations
 * Lightweight, attribute-driven animations you can sprinkle anywhere.
 *
 * Requires GSAP core on the page (window.gsap). No ScrollTrigger plugin
 * needed — entry is detected with IntersectionObserver. Degrades cleanly:
 * if GSAP is missing or the user prefers reduced motion, elements are
 * snapped straight to their final state (the number still reads correctly).
 *
 * Animations
 *   1. Count up on view   [data-gsap-counter="<number>"]
 *
 * Add GSAP before this file, e.g.:
 *   <script src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js"></script>
 *   <script src="https://cdn.jsdelivr.net/gh/essexsolutions/essex-tools@vX.Y.Z/essex-gsap.js"></script>
 */
(function () {
  "use strict";

  var prefersReduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  /* ============================================================
   * 1. COUNT UP ON VIEW  [data-gsap-counter="<number>"]
   *
   * As the element scrolls into view, its text counts from a start
   * value up to the target over a short duration (default 0.5s).
   *
   * The target number is the attribute value. Everything about how
   * it's displayed is inferred from the text you typed in Webflow,
   * so "$1,200+" just works — type the final string, set the
   * attribute to 1200, done. Each piece can be overridden:
   *
   *   data-gsap-counter           target number (required)   e.g. 1200
   *   data-gsap-counter-duration  seconds                    default 0.5
   *   data-gsap-counter-start     value to count from        default 0
   *   data-gsap-counter-ease      GSAP ease                  default power1.out
   *   data-gsap-counter-decimals  decimal places             default: inferred
   *   data-gsap-counter-separator thousands separator        default: inferred ("," if grouped)
   *   data-gsap-counter-prefix    text before the number     default: inferred
   *   data-gsap-counter-suffix    text after the number      default: inferred
   *   data-gsap-counter-once      "false" to replay each time it enters
   * ============================================================ */
  var COUNTER_SELECTOR = "[data-gsap-counter]";
  var DEFAULT_DURATION = 0.5;
  var DEFAULT_EASE = "power1.out";
  var THRESHOLD = 0.25; // fraction visible before it fires

  // Pull the numeric core out of the typed text, e.g. "$1,200+" → "1,200".
  // Returns prefix/suffix and the formatting implied by the core.
  function parseTemplate(text) {
    var match = text.match(/[\d.,]*\d[\d.,]*/);
    if (!match) {
      return { prefix: "", suffix: "", decimals: null, group: false };
    }
    var core = match[0];
    var dot = core.indexOf(".");
    return {
      prefix: text.slice(0, match.index),
      suffix: text.slice(match.index + core.length),
      decimals: dot === -1 ? 0 : core.length - dot - 1,
      group: core.indexOf(",") !== -1,
    };
  }

  function decimalsOf(str) {
    var dot = String(str).indexOf(".");
    return dot === -1 ? 0 : String(str).length - dot - 1;
  }

  function buildConfig(el) {
    var d = el.dataset;
    var rawTarget = d.gsapCounter;
    var target = parseFloat(String(rawTarget).replace(/,/g, ""));
    if (isNaN(target)) return null; // nothing sensible to count to

    var tpl = parseTemplate((el.textContent || "").trim());

    var decimals =
      d.gsapCounterDecimals != null
        ? parseInt(d.gsapCounterDecimals, 10)
        : tpl.decimals != null
        ? tpl.decimals
        : decimalsOf(rawTarget);

    var separator =
      d.gsapCounterSeparator != null
        ? d.gsapCounterSeparator
        : tpl.group
        ? ","
        : "";

    return {
      el: el,
      target: target,
      start: d.gsapCounterStart != null ? parseFloat(d.gsapCounterStart) : 0,
      duration:
        d.gsapCounterDuration != null
          ? parseFloat(d.gsapCounterDuration)
          : DEFAULT_DURATION,
      ease: d.gsapCounterEase || DEFAULT_EASE,
      decimals: decimals,
      separator: separator,
      prefix: d.gsapCounterPrefix != null ? d.gsapCounterPrefix : tpl.prefix,
      suffix: d.gsapCounterSuffix != null ? d.gsapCounterSuffix : tpl.suffix,
      once: d.gsapCounterOnce !== "false",
    };
  }

  function format(value, cfg) {
    var num = cfg.decimals > 0 ? value.toFixed(cfg.decimals) : String(Math.round(value));
    if (cfg.separator) {
      var parts = num.split(".");
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, cfg.separator);
      num = parts.join(".");
    }
    return cfg.prefix + num + cfg.suffix;
  }

  function render(cfg, value) {
    cfg.el.textContent = format(value, cfg);
  }

  function runCounter(cfg) {
    var g = window.gsap;
    if (!g || prefersReduced) {
      render(cfg, cfg.target); // snap to final — number still reads right
      return;
    }
    var proxy = { val: cfg.start };
    render(cfg, cfg.start);
    g.to(proxy, {
      val: cfg.target,
      duration: cfg.duration,
      ease: cfg.ease,
      overwrite: "auto",
      onUpdate: function () {
        render(cfg, proxy.val);
      },
      onComplete: function () {
        render(cfg, cfg.target); // guard against float drift on the last frame
      },
    });
  }

  function initCounters() {
    var els = document.querySelectorAll(COUNTER_SELECTOR);
    if (!els.length) return;

    // No IntersectionObserver (old browser): just run them all immediately.
    if (!("IntersectionObserver" in window)) {
      els.forEach(function (el) {
        var cfg = buildConfig(el);
        if (cfg) runCounter(cfg);
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var cfg = buildConfig(entry.target);
          if (cfg) {
            runCounter(cfg);
            if (cfg.once) observer.unobserve(entry.target);
          }
        });
      },
      { threshold: THRESHOLD }
    );

    els.forEach(function (el) {
      observer.observe(el);
    });
  }

  /* ============================================================
   * Boot. Robust to this file loading before or after DOM ready
   * (CDN scripts can land either way).
   * ============================================================ */
  function init() {
    initCounters();
    // Future data-gsap-* animations: add their init() calls here.
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
