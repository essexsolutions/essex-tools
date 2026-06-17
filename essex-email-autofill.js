/* =====================================================================
   Essex Solutions — Returning-lead autofill (server-side lookup)
   ---------------------------------------------------------------------
   Loaded on /contact via jsDelivr alongside essex-email-autofill.css.

   v2 — NO Jetboost, NO on-page collection list. The email is sent to our
   own edge API (/api/contact-lookup on Webflow Cloud) which returns ONLY
   the single matching contact, or nothing. Contact PII is never shipped
   to the browser, there is no 100-item limit, and nothing can disable the
   form's Submit button (that was the old Jetboost search-input bug).

   ON THE WEBFLOW PAGE you must also:
     • Delete the Jetboost results Collection List from /contact.
     • Remove the `jetboost-list-search-input-6xn5` class from #Email.

   WHAT IT DOES:
     • On a complete, valid email (debounced) -> GET /api/contact-lookup.
     • Match  -> autofills Organization / First / Last / City / Phone (text)
                 and selects the Role / Region radios; shows a green check.
     • No match -> validates "work email only" (rejects free/disposable),
                 fills nothing (new lead).
     • Editing the email away from a match instantly clears the autofilled
       values — but never wipes what a brand-new lead typed themselves.
   ===================================================================== */
(function () {
  "use strict";
  if (window.__essexLeadAutofill) return;        // guard against double-injection
  window.__essexLeadAutofill = true;

  /* ------------------------------------------------------------------
     1) CONFIG — edit selectors / field map here if your DOM changes
  ------------------------------------------------------------------ */
  var CFG = {
    // Same-origin path to the Webflow Cloud app (mount path = /api).
    // The script may be served from jsDelivr, but it RUNS on the Webflow
    // page, so this relative URL resolves to essexsolutions.webflow.io/api/...
    lookupUrl:   "/api/contact-lookup",

    emailInput:  "#Email",                       // contact email field

    // lookup JSON key  ->  form field
    fields: [
      { key: "organization", sel: "#Organization", kind: "text"  },
      { key: "firstName",    sel: "#First-Name",   kind: "text"  },
      { key: "lastName",     sel: "#Last-Name",    kind: "text"  },
      { key: "city",         sel: "#City",         kind: "text"  },
      { key: "phone",        sel: "#Phone",        kind: "text"  },
      { key: "role",         sel: "role",          kind: "radio" }, // radio group name=
      { key: "region",       sel: "region",        kind: "radio" }
    ],

    radioActiveClass: "is-active-inputactive",   // label class your design adds when a radio is selected
    debounceMs: 400,                             // idle wait after typing STOPS before the lookup
    blockSubmitOnInvalid: false,                 // true = also stop form submit on a non-work email

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
      // If they edit away from the matched email, clear the revealed data
      // IMMEDIATELY (don't wait out the idle timer) so nothing lingers.
      if (didAutofill && lc(emailInput.value) !== lastMatchedEmail){
        clearFill(); setState("neutral"); showMsg("");
      }
      clearTimeout(t); t = setTimeout(function () { evaluate(false); }, CFG.debounceMs);
    });
    emailInput.addEventListener("change", function () { clearTimeout(t); evaluate(true); });
    emailInput.addEventListener("blur",   function () { clearTimeout(t); evaluate(true); });

    if (CFG.blockSubmitOnInvalid && form.tagName === "FORM"){
      form.addEventListener("submit", function (e){
        var typed = lc(emailInput.value);
        // A recognized lead (the email we just matched) is always allowed.
        if (typed && typed !== lastMatchedEmail && classify(typed).state === "invalid"){
          e.preventDefault(); e.stopPropagation();
          evaluate(true); emailInput.focus();
        }
      }, true);
    }

    evaluate(false); // handle prefilled / back-button states
  }

  /* ------------------------------------------------------------------
     5) Autofill engine
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

  function fillFrom(contact, email){
    CFG.fields.forEach(function (f){
      var val = norm(contact[f.key]);
      if (f.kind === "radio") setRadio(f.sel, val);
      else setText(f.sel, val);
    });
    didAutofill = true;
    lastMatchedEmail = lc(email);   // remember the exact email we filled from
  }

  function clearFill(){
    if (!didAutofill) return;   // never wipe values a brand-new lead typed themselves
    CFG.fields.forEach(function (f){
      if (f.kind === "radio") setRadio(f.sel, " ");  // matches nothing -> unchecks the group
      else setText(f.sel, "");
    });
    didAutofill = false;
    lastMatchedEmail = "";
  }

  /* ------------------------------------------------------------------
     6) UI state
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
     7) Server-side lookup (exact, complete email only)
  ------------------------------------------------------------------ */
  var lastQueried = "";   // dedupe identical lookups
  var reqSeq = 0;         // ignore responses superseded by a newer keystroke

  function lookup(email, commit){
    if (email === lastQueried) return;
    lastQueried = email;
    var seq = ++reqSeq;

    fetch(CFG.lookupUrl + "?email=" + encodeURIComponent(email), {
      method: "GET",
      headers: { "Accept": "application/json" },
      credentials: "omit"
    })
      .then(function (r){ return r.ok ? r.json() : { match: false }; })
      .then(function (data){
        if (seq !== reqSeq) return;               // a newer keystroke superseded this
        if (lc(emailInput.value) !== email) return;
        if (data && data.match && data.contact){  // returning lead -> fill + green check
          fillFrom(data.contact, email); setState("match"); showMsg("");
        } else {
          gateWorkEmail(email, commit);           // new / unknown lead
        }
      })
      .catch(function (){
        if (seq !== reqSeq) return;
        gateWorkEmail(email, commit);             // network error -> fall back to local validation
      });
  }

  // New/unknown lead: enforce "work email only", fill nothing.
  function gateWorkEmail(email, commit){
    clearFill();
    var v = classify(email);
    if (v.state === "valid"){ setState("valid"); showMsg(""); }
    else if (v.state === "invalid"){
      if (v.reason === "syntax" && !commit){ setState("neutral"); showMsg(""); }
      else { setState("invalid"); showMsg(MSG[v.reason] || MSG.syntax); }
    } else { setState("neutral"); showMsg(""); }
  }

  /* ------------------------------------------------------------------
     8) Main decision (commit = fired on blur/change/submit)
  ------------------------------------------------------------------ */
  function evaluate(commit){
    if (!emailInput) return;
    var typed = lc(emailInput.value);

    if (!typed){                       // field cleared
      lastQueried = ""; clearFill(); setState("neutral"); showMsg(""); return;
    }

    // Only ever query a COMPLETE, EXACT email address. A partial string
    // (a name, first letters) must never trigger a lookup.
    if (!EMAIL_RE.test(typed)){
      clearFill();
      if (commit){ gateWorkEmail(typed, commit); }   // show "valid email?" only on blur/submit
      else { setState("neutral"); showMsg(""); }      // don't nag mid-typing
      return;
    }

    lookup(typed, commit);
  }
})();
