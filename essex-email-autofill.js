(function () {
  "use strict";
  if (window.__essexLeadAutofill) return;        // guard against double-injection
  window.__essexLeadAutofill = true;

  /* ------------------------------------------------------------------
     1) CONFIG — edit selectors / field map here if your DOM changes
  ------------------------------------------------------------------ */
  var CFG = {
    emailInput:  "#Email",                                  // Jetboost search input = contact email
    listWrapper: ".jetboost-list-wrapper-6xn5",             // Jetboost results container
    leadCard:    ".lead_card, .jetboost-list-item, .w-dyn-item", // one lead row

    // data-attribute on the lead card  ->  form field to fill
    fields: [
      { attr: "data-lead-org",    sel: "#Organization", kind: "text"  },
      { attr: "data-lead-first",  sel: "#First-Name",   kind: "text"  },
      { attr: "data-lead-last",   sel: "#Last-Name",    kind: "text"  },
      { attr: "data-lead-city",   sel: "#City",         kind: "text"  },
      { attr: "data-lead-phone",  sel: "#Phone",        kind: "text"  },
      { attr: "data-lead-role",   sel: "role",          kind: "radio" }, // radio group name=
      { attr: "data-lead-region", sel: "region",        kind: "radio" }
    ],

    radioActiveClass: "is-active-inputactive",  // label class your design adds when a radio is selected
    debounceMs: 550,                            // idle wait after typing STOPS before checking for a match
    blockSubmitOnInvalid: false,                // true = also stop form submit on a non-work email

    lists: {
      free:               "https://cdn.jsdelivr.net/npm/free-email-domains/domains.json",
      disposable:         "https://cdn.jsdelivr.net/npm/disposable-email-domains/index.json",
      disposableWildcard: "https://cdn.jsdelivr.net/npm/disposable-email-domains/wildcard.json"
    }
  };

  var MSG = {
    syntax:     "Please enter a valid email address.",
    free:       "Please use your work email — personal addresses (Gmail, Outlook, etc.) aren’t accepted.",
    disposable: "Temporary / disposable email addresses aren’t accepted. Please use your work email."
  };

  /* ------------------------------------------------------------------
     2) Small helpers
  ------------------------------------------------------------------ */
  var norm = function (s){ return s == null ? "" : String(s).trim(); };
  var lc   = function (s){ return norm(s).toLowerCase(); };

  /* ------------------------------------------------------------------
     3) Work-email validation (free + disposable lists)
  ------------------------------------------------------------------ */
  var EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

  // Built-in shortlists so it works instantly / offline; CDN augments them.
  var FREE = new Set([
    "gmail.com","googlemail.com","yahoo.com","yahoo.co.uk","yahoo.co.in","ymail.com",
    "rocketmail.com","hotmail.com","hotmail.co.uk","hotmail.fr","hotmail.de","hotmail.es",
    "hotmail.it","outlook.com","outlook.fr","outlook.de","live.com","live.co.uk","msn.com",
    "aol.com","aim.com","icloud.com","me.com","mac.com","proton.me","protonmail.com","pm.me",
    "gmx.com","gmx.net","gmx.de","gmx.at","gmx.ch","mail.com","zoho.com","yandex.com","yandex.ru",
    "ya.ru","mail.ru","inbox.com","fastmail.com","hey.com","hushmail.com","tutanota.com","tuta.io",
    "comcast.net","verizon.net","att.net","sbcglobal.net","bellsouth.net","cox.net","earthlink.net",
    "charter.net","btinternet.com","web.de","t-online.de","libero.it","orange.fr","wanadoo.fr",
    "free.fr","laposte.net","naver.com","daum.net","qq.com","163.com","126.com","sina.com",
    "foxmail.com","rediffmail.com"
  ]);
  var DISP = new Set([
    "mailinator.com","guerrillamail.com","guerrillamail.info","grr.la","sharklasers.com",
    "10minutemail.com","10minutemail.net","tempmail.com","temp-mail.org","tempmailo.com",
    "throwawaymail.com","yopmail.com","getnada.com","nada.email","maildrop.cc","dispostable.com",
    "trashmail.com","mailnesia.com","mailcatch.com","fakeinbox.com","spam4.me","mohmal.com",
    "emailondeck.com","mintemail.com","tempinbox.com","mytemp.email","moakt.com","tmpmail.org",
    "tempr.email","discard.email","mailsac.com","inboxkitten.com","anonbox.net","burnermail.io",
    "spamgourmet.com","jetable.org","33mail.com","tempail.com","1secmail.com","1secmail.org",
    "dropmail.me"
  ]);
  var DISP_WC = [];   // wildcard suffixes (match domain or any subdomain of it)

  function isDisposable(domain){
    if (DISP.has(domain)) return true;
    for (var i = 0; i < DISP_WC.length; i++){
      var w = DISP_WC[i];
      if (domain === w || domain.slice(-(w.length + 1)) === "." + w) return true;
    }
    return false;
  }

  // -> { state: "empty" | "valid" | "invalid", reason?: "syntax"|"free"|"disposable" }
  function classify(raw){
    var e = lc(raw);
    if (!e) return { state: "empty" };
    if (!EMAIL_RE.test(e)) return { state: "invalid", reason: "syntax" };
    var domain = e.split("@")[1];
    if (isDisposable(domain)) return { state: "invalid", reason: "disposable" };
    if (FREE.has(domain))     return { state: "invalid", reason: "free" };
    return { state: "valid" };
  }

  // Lazy-load the full lists, then re-evaluate once.
  (function loadLists(){
    if (!window.fetch) return;
    var grab = function (url){
      return fetch(url).then(function (r){ return r.ok ? r.json() : []; }).catch(function (){ return []; });
    };
    Promise.all([grab(CFG.lists.free), grab(CFG.lists.disposable), grab(CFG.lists.disposableWildcard)])
      .then(function (res){
        (res[0] || []).forEach(function (d){ FREE.add(lc(d)); });
        (res[1] || []).forEach(function (d){ DISP.add(lc(d)); });
        DISP_WC = (res[2] || []).map(lc);
        evaluate(false);
      });
  })();

  /* ------------------------------------------------------------------
     4) Boot — wait for the email field, then wire everything up
  ------------------------------------------------------------------ */
  var emailInput, form, fieldWrap, icon, msgEl;
  var tries = 0;
  (function boot(){
    emailInput = document.querySelector(CFG.emailInput);
    if (!emailInput) { if (tries++ < 40) return void setTimeout(boot, 150); return; }
    form = emailInput.closest("form") || document;
    init();
  })();

  function init(){
    fieldWrap = emailInput.parentElement; // .multi-form17_input-field
    if (getComputedStyle(fieldWrap).position === "static") fieldWrap.style.position = "relative";

    // green checkmark
    icon = document.createElement("span");
    icon.className = "lead-status-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<polyline points="4 12 10 18 20 6"></polyline></svg>';
    fieldWrap.appendChild(icon);

    // validation message (under the field wrapper)
    msgEl = document.createElement("div");
    msgEl.className = "lead-email-msg";
    msgEl.setAttribute("role", "alert");
    (fieldWrap.parentElement || fieldWrap).appendChild(msgEl);

    // events
    var t;
    emailInput.addEventListener("input", function () {
      // If they edit away from the matched email, pull the revealed data
      // IMMEDIATELY (don't wait out the idle timer) so nothing lingers.
      if (didAutofill && lc(emailInput.value) !== lastMatchedEmail){
        clearFill(); setState("neutral"); showMsg("");
      }
      clearTimeout(t); t = setTimeout(function () { evaluate(false); }, CFG.debounceMs);
    });
    emailInput.addEventListener("change", function () { clearTimeout(t); evaluate(true); });
    emailInput.addEventListener("blur",   function () { clearTimeout(t); evaluate(true); });

    // Jetboost rewrites the list asynchronously — re-check when it does
    var wrap = document.querySelector(CFG.listWrapper);
    if (wrap){
      new MutationObserver(function () {
        clearTimeout(t); t = setTimeout(function () { evaluate(false); }, CFG.debounceMs);
      }).observe(wrap, { childList: true, subtree: true, attributes: true, attributeFilter: ["class","style"] });
    }

    if (CFG.blockSubmitOnInvalid && form.tagName === "FORM"){
      form.addEventListener("submit", function (e){
        var raw = emailInput.value;
        if (raw && !pickMatch(lc(raw)) && classify(raw).state === "invalid"){
          e.preventDefault(); e.stopPropagation();
          evaluate(true); emailInput.focus();
        }
      }, true);
    }

    evaluate(false); // handle prefilled / back-button states
  }

  /* ------------------------------------------------------------------
     5) Lead detection (read Jetboost's visible cards)
  ------------------------------------------------------------------ */
  function visibleCards(){
    var wrap = document.querySelector(CFG.listWrapper);
    if (!wrap) return [];
    var out = [];
    wrap.querySelectorAll(CFG.leadCard).forEach(function (c){
      if (!c.querySelector("[data-lead-email]")) return;            // must be a real lead card
      if (c.getClientRects().length === 0) return;                  // hidden (display:none / removed)
      if (c.classList.contains("jetboost-list-item-hide")) return;  // Jetboost "hidden" markers
      if (c.classList.contains("jetboost-hidden")) return;
      out.push(c);
    });
    return out;
  }

  function emailOf(card){
    var n = card.querySelector("[data-lead-email]");
    return n ? lc(n.getAttribute("data-lead-email") || n.textContent) : "";
  }

  function pickMatch(typedLc){
    // SECURITY: only ever match a COMPLETE, EXACT email address. A partial
    // string (e.g. a first name or first letters) must never reveal a lead,
    // even if Jetboost has narrowed the list down to a single visible card.
    if (!EMAIL_RE.test(typedLc)) return null;          // require a full address incl. ".com"
    var cards = visibleCards();
    for (var i = 0; i < cards.length; i++){
      if (emailOf(cards[i]) === typedLc) return cards[i]; // exact, whole-email match only
    }
    return null;
  }

  /* ------------------------------------------------------------------
     6) Autofill engine
  ------------------------------------------------------------------ */
  var didAutofill = false;
  var lastMatchedEmail = "";   // the exact email currently autofilled (for instant-clear on edit)

  function setText(sel, val){
    var el = form.querySelector(sel);
    if (!el) return;
    el.value = val;
    el.dispatchEvent(new Event("input",  { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setRadio(name, val){
    var radios = form.querySelectorAll('input[type="radio"][name="' + name + '"]');
    var hit = null;
    radios.forEach(function (r){
      var on = lc(r.value) === lc(val);
      r.checked = on;
      var label = r.closest("label.w-radio") || r.parentElement;
      if (label){
        var dot = label.querySelector(".w-radio-input");
        if (dot) dot.classList.toggle("w--redirected-checked", on);     // Webflow's default dot
        if (CFG.radioActiveClass) label.classList.toggle(CFG.radioActiveClass, on);
      }
      if (on) hit = r;
    });
    if (hit) hit.dispatchEvent(new Event("change", { bubbles: true }));
    return !!hit;
  }

  function fillFrom(card){
    CFG.fields.forEach(function (f){
      var node = card.querySelector("[" + f.attr + "]");
      var val  = node ? norm(node.getAttribute(f.attr) || node.textContent) : "";
      if (f.kind === "radio") setRadio(f.sel, val);
      else setText(f.sel, val);
    });
    didAutofill = true;
    lastMatchedEmail = emailOf(card);   // remember the exact email we filled from
  }

  function clearFill(){
    if (!didAutofill) return;   // never wipe values a brand-new lead typed themselves
    CFG.fields.forEach(function (f){
      if (f.kind === "radio") setRadio(f.sel, " ");  // matches nothing -> unchecks the group
      else setText(f.sel, "");
    });
    didAutofill = false;
    lastMatchedEmail = "";
  }

  /* ------------------------------------------------------------------
     7) UI state
  ------------------------------------------------------------------ */
  function setState(s){ // "match" | "valid" | "invalid" | "neutral"
    emailInput.classList.remove("is-lead-match","is-email-valid","is-email-invalid");
    if (icon) icon.classList.remove("is-visible");
    if (s === "match")   { emailInput.classList.add("is-lead-match","is-email-valid"); if (icon) icon.classList.add("is-visible"); }
    else if (s === "valid")   emailInput.classList.add("is-email-valid");
    else if (s === "invalid") emailInput.classList.add("is-email-invalid");
  }
  function showMsg(text){
    if (!msgEl) return;
    msgEl.textContent = text || "";
    msgEl.classList.toggle("is-visible", !!text);
  }

  /* ------------------------------------------------------------------
     8) Main decision (commit = fired on blur/change/submit)
  ------------------------------------------------------------------ */
  function evaluate(commit){
    if (!emailInput) return;
    var raw = emailInput.value, typed = lc(raw);

    if (!typed){                       // field cleared
      clearFill(); setState("neutral"); showMsg(""); return;
    }

    var match = pickMatch(typed);
    if (match){                        // returning lead -> fill + green check (skip work-email gate)
      fillFrom(match); setState("match"); showMsg(""); return;
    }

    clearFill();                       // new / unknown lead -> validate work email
    var v = classify(raw);
    if (v.state === "valid"){ setState("valid"); showMsg(""); }
    else if (v.state === "invalid"){
      if (v.reason === "syntax" && !commit){ setState("neutral"); showMsg(""); }  // don't nag mid-typing
      else { setState("invalid"); showMsg(MSG[v.reason] || MSG.syntax); }
    } else { setState("neutral"); showMsg(""); }
  }
})();

