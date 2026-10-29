/**
 * Essex — wave relay (iframe mouse relay)
 *
 * The wave visualizer is embedded in an <iframe> that usually has
 * pointer-events:none (so the page scrolls/clicks through it). That means the
 * iframe never receives native mouse events, so its parallax + click-to-reverse
 * interactions go dead. This script sits on the PARENT (Webflow) page, listens
 * on a transparent overlay that DOES receive the mouse, and forwards the
 * pointer to the iframe via postMessage. The visualizer's own `message`
 * listener (essexsolutions/visualizer → src/scripts/main.js) consumes:
 *
 *     { source: 'iframe-relay', type: 'mousemove'|'mouseleave'|'click', x, y }
 *
 * where x/y are normalized 0–1 across the overlay (null on mouseleave).
 *
 * Usage in Webflow (Before </body>, or on the page holding the embed):
 *   1. Add the <iframe> for the visualizer — give it an ID (default
 *      "responsive-iframe") and set pointer-events:none in its style.
 *   2. Add a transparent overlay element ON TOP of the iframe with the class
 *      "iframe-mouse-relay" (same size/position, pointer-events:auto).
 *   3. Load this script. Defaults match the original inline snippet, so no
 *      attributes are required.
 *
 * Config (all optional — set as custom attributes on the .iframe-mouse-relay
 * overlay, so each relay is self-describing and multiple can coexist):
 *   data-relay-iframe  CSS selector (or bare #id) of the iframe to drive.
 *                      Default: "#responsive-iframe".
 *   data-relay-origin  targetOrigin for postMessage — MUST equal the origin of
 *                      the iframe's src or the messages are dropped silently.
 *                      Default: AUTO — derived from the iframe's own src (and if
 *                      that can't be read, this page's own origin). Either way it
 *                      is correct wherever the visualizer is mounted:
 *                      production (https://essexsolutions.com), staging
 *                      (https://essexsolutions.webflow.io), and localhost.
 *                      Only set this to pin a specific origin.
 *
 * Multiple embeds per page: add several .iframe-mouse-relay overlays, each with
 * its own data-relay-iframe. Every overlay is wired independently.
 */
(function () {
  "use strict";

  var RELAY_SELECTOR = ".iframe-mouse-relay";
  var DEFAULT_IFRAME = "#responsive-iframe";

  // Resolve the iframe a given overlay drives. Accepts a full CSS selector or a
  // bare id ("responsive-iframe" → "#responsive-iframe").
  function resolveIframe(relay) {
    var sel = relay.getAttribute("data-relay-iframe") || DEFAULT_IFRAME;
    if (!/^[.#\[]/.test(sel)) sel = "#" + sel; // bare id → #id
    var el = document.querySelector(sel);
    return el && el.tagName === "IFRAME" ? el : null;
  }

  // The postMessage targetOrigin. An explicit data-relay-origin always wins;
  // otherwise derive it from the iframe's src so it matches whatever domain the
  // visualizer is served from (prod .com, .webflow.io staging, localhost).
  // iframe.src is a resolved absolute URL, so relative embeds (src="/wave/")
  // correctly resolve against the parent page's origin.
  function resolveOrigin(relay, iframe) {
    var explicit = relay.getAttribute("data-relay-origin");
    if (explicit) return explicit;
    try {
      var o = new URL(iframe.src, location.href).origin;
      if (o && o !== "null") return o;
    } catch (e) { /* fall through to fallback */ }
    // Can't read the iframe src: assume it's served same-origin as this page
    // (how Webflow Cloud mounts it — /wave/ on the same domain), which is
    // correct on production (essexsolutions.com) and staging (…webflow.io) alike.
    return location.origin;
  }

  function wire(relay) {
    var iframe = resolveIframe(relay);
    if (!iframe) {
      console.warn("[wave-relay] iframe not found for overlay:", relay);
      return;
    }
    var origin = resolveOrigin(relay, iframe);

    function send(type, x, y) {
      var win = iframe.contentWindow;
      if (!win) return;
      win.postMessage({ source: "iframe-relay", type: type, x: x, y: y }, origin);
    }

    // Normalize the pointer to 0–1 across the overlay's box.
    function norm(e) {
      var r = relay.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    }

    relay.addEventListener("mousemove", function (e) {
      var p = norm(e);
      send("mousemove", p.x, p.y);
    });
    relay.addEventListener("mouseleave", function () {
      send("mouseleave", null, null);
    });
    relay.addEventListener("click", function (e) {
      var p = norm(e);
      send("click", p.x, p.y);
    });
  }

  function init() {
    var relays = document.querySelectorAll(RELAY_SELECTOR);
    if (!relays.length) {
      console.warn("[wave-relay] no " + RELAY_SELECTOR + " overlay found");
      return;
    }
    relays.forEach(wire);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
