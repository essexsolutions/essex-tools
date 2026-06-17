# essex-tools

Self-hosted front-end scripts for the Essex Solutions Webflow site.

## Files

- `multi-step.js` — beacon-stripped copy of videsigns "Formly" multi-step form helper.
- `essex-email-autofill.js` / `essex-email-autofill.css` — email autofill helper.

## multi-step.js — what was changed vs. the original

Original source: `https://cdn.jsdelivr.net/gh/videsigns/webflow-tools@latest/multi-step.js`
(was being loaded on `/contact` from `https://h2mwk5.csb.app/src/multi-step.js`).

- Removed the `updateCounter()` **call** so the script no longer POSTs to
  `https://videsigns-staging.co.uk/counter` on page load.
  (The function body is left intact but is never invoked; no network request is made.)
- Nothing else was modified. Form behavior is unchanged.

## How to load these from Webflow safely

1. **Tag an immutable release** (never use `@latest`):

   ```sh
   git tag v1.0.0
   git push origin v1.0.0
   ```

2. **Load via jsDelivr**, pinned to the tag, with Subresource Integrity.
   Put this in *Site/Page Settings → Custom Code → Before </body>* and
   DELETE the old `h2mwk5.csb.app` tag (and the commented-out `@latest` line):

   ```html
   <script
     src="https://cdn.jsdelivr.net/gh/essexsolutions/essex-tools@v1.0.0/multi-step.js"
     integrity="sha384-+4ILDGNkXPXENbL9KUAcuPfdBLD2U7YO7tweXcH6w9cvQLYp9VtrKJoZL0w3jwUm"
     crossorigin="anonymous"></script>
   ```

   The `integrity` hash makes the browser refuse to run the file if even one byte
   changes — so a compromised CDN cannot inject code. Recompute it whenever you
   intentionally update the file:

   ```sh
   echo "sha384-$(openssl dgst -sha384 -binary multi-step.js | openssl base64 -A)"
   ```

### Notes
- Pinning to `@v1.0.0` (or a full commit SHA) means it can never silently
  auto-update the way `@latest` does.
- Keep exactly ONE multi-step.js script tag on the page.
- jsDelivr caches tagged releases aggressively; a new tag = new URL, so cache
  busting is automatic.
