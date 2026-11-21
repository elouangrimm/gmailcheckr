# Gmail Checkr — Audit & Customization Plan

Audit of your local build at `/home/elouan/Coding/gmailcheckr` (v36.7.1, MV3).
Working tree is clean; your two commits `31743eb remove paywall` and `64da13c change labels to unlock premium` are in place.

---

## 0. TL;DR — the one thing that matters most

**Your paywall removal did not actually remove the paywall.** It changed UI labels and locale strings, but the gating *logic* is untouched. Worse, because parts of the contribute flow were stripped, the gated features are now **silently broken** rather than merely locked.

Everything else below (dead files, branding, perf, themes) is real and worth doing, but item **1.1** is the highest-value 5-line fix in the repo.

| Area | Verdict |
| :--- | :--- |
| Paywall | ❌ Still active in code — ~20 controls dead |
| Dead files | ~2.0 MB (~27% of working tree) removable |
| Creator branding | 175 `jasonsavard.com` refs, 1 privacy leak |
| Popup load | 530 KB of **blocking** JS, 88% of it unused icons |
| Missing features | Dark mode, skins, custom CSS all exist but are unreachable |

---

## 1. Critical: the paywall is still in the code

### 1.1 The gate itself

`js/common.js:2362`

```js
async function donationClicked(action, monthly) {
    if (await storage.get("donationClicked")) {
        return true;
    } else {
        openContributeDialog(action, {monthly: monthly});
        return false;
    }
}
```

`donationClicked` is only ever written in one place — a hidden easter egg at `js/options.js:3313`: double-click the logo on the options page toggles it. It is **not** set by your commits, so it is `undefined` on your install.

### 1.2 The second gate

`js/common.js:2044` — every settings write passes through this:

```js
if ((element.closest("[mustDonate]") || params.mustDonate) && !donationClickedFlagForPreventDefaults && !OFF_OR_DEFAULT) {
    params.event.preventDefault();
    openContributeDialog(params.key);
    return Promise.reject(JError.DID_NOT_CONTRIBUTE);
}
```

`options.html` contains **19** `indexdb-storage` inputs carrying `mustDonate`, plus the Appearance `<select id="appearance" mustDonate>`. These writes are rejected outright.

### 1.3 Every feature currently broken

| Feature | Location | Effect now |
| :--- | :--- | :--- |
| **Dark mode / Appearance** | `options.js:1030`, `options.html:1059` | Select reverts to previous value, fires a `fetch` to jasonsavard.com |
| **Popup action buttons** (`showArchive`, `showSpam`, `showDelete`, `showMoveLabel`, `showReply`, `showOpen`, `showMarkAsRead`, `showMarkAsUnread`, `showArchiveAll`, `showMarkAllAsSpam`, `showMarkAllAsRead`, `showAddToCalendar`, `showAddToTasks`, `showListenToEmail`, `showPrint`) | `options.html:955-961…` | Checkboxes cannot be saved |
| **`setPositionAndSize`, `removeShareLinks`, `showOnlyRecentUnreadEmails`, `resetEmailUnreadIconWhenButtonClicked`** | `options.html` | Same |
| **DND schedule** (all-day / all-week / hour cells) | `options.js:635, 670, 685` | Clicks no-op |
| **Account alias** | `popup.js:5440` | Menu item does nothing |
| **Account colours** | `popup.js:5461` | Colour picker blocked |
| **Set account icon** | `popup.js:5481` | Blocked |
| **Popup background colour** | `popup.js:6497` | Blocked |
| **Skins / themes** | `popup.js:6331` | "Add skin" opens contribute dialog |

Because `openContributeDialog()` still renders a dialog but the contribute page links were partly stripped, several of these fail in a confusing half-open state.

### 1.4 The fix

Three edits, no redesign:

1. `js/common.js:2362` — `donationClicked()` → `return true;` (keep the signature; ~9 call sites still invoke it).
2. `js/common.js:2044` — delete the `mustDonate` branch so `setStorage()` always writes.
3. `options.html` — drop the 20 `mustDonate` attributes and the `.mustDonate {opacity:.4}` CSS at lines 92-93 (cosmetic only, but it leaves controls looking greyed out).

Optional follow-up: delete `openContributeDialog`, `contribute.html`, `js/contribute.js`, and the `donationClicked` easter egg at `options.js:3313` once nothing references them.

---

## 2. Dead files & folders

Working tree is ~7.4 MB (the other 9.6 MB is `.git`). Roughly **2.0 MB is unreferenced**.

| Path | Size | Evidence it is dead |
| :--- | ---: | :--- |
| `js/lib/prettier/` | 605 KB | Only loaded by `custom-css-editor.html`, which nothing links to |
| `js/firebase-firestore.js` | 448 KB | Only imported by `off_screen.js:281` for `init-firebase` |
| `js/lib/ical.js` | 281 KB | `popup.html` loads `lib/ical.js`, **not** `js/lib/ical.js` — byte-identical duplicate |
| `js/lib/codemirror/` | 205 KB | Same orphan as prettier |
| `js/lib/Autolinker.js` | 213 KB | `popup.html` loads `lib/Autolinker.js` — duplicate |
| `js/firebase-app.js` | 104 KB | Realtime sync only; Chrome supports GCM so `isGCMSupported()` short-circuits it |
| `images/browserButtons/` non-default variants | 156 KB | All 8 fonts are offered in options — **keep**; listed here only so you don't delete blind |
| `js/config.js` + `config.example.js` | 2 KB | `CONFIG` is never read anywhere. Also holds a plaintext OAuth client secret (gitignored, local-only) |
| `js/playVideos.js` | 4 KB | One `console.log`, zero references |
| `js/gmail-page.js` | 4 KB | Superseded by `js/gmail-unread-count-context.js` (the file `ContentScriptIds` actually registers) |
| `custom-css-editor.html` + `js/custom-css-editor.js` | 8 KB | No link, no menu entry, no option opens it |
| `skins/skins.json` | 56 KB | Never read — options fetches skins from the network instead (see §5.2) |
| Payment images¹ | 60 KB | `stripe.svg`, `paypal.png`, `bitcoin.svg`, `applePayQR.png`, `wechat-pay.png`, `alipay.png`, `googlePay.png`, `powered_by_stripe.svg`, `search.png` |
| `images/allExtensionIcons/` | 44 KB | Only used by `contribute.html` cross-promotion |
| `images/jason.png` | 44 KB | Author's avatar, special-cased at `checkerPlusForGmail.js:1153` |
| `images/checker-plus-compose-in-*.jpg` | 88 KB | Promo screenshots in `options.html` |
| `sounds/ohshit.mp3`, `sounds/bell.mp3` | 25 KB | Not in the sound `<select>` and referenced nowhere |
| `_locales/en_GB/` | 4 KB | 6 keys, all payment strings ("Get Pro", "Ultra Suite") |
| `_locales/` (39 other locales) | ~1.2 MB | Loaded per-browser-language at runtime, so trimming saves disk only, not speed |

¹ `stripe.svg` / `alipay.png` / `applePayQR.png` / `search.png` already have **zero** references in the current tree.

**Keep (don't be fooled):** `lib/Autolinker.js` and `lib/ical.js` are the live copies used by `popup.html`. `js/sanitizer/` and `js/mime/` are loaded by `popup.html` and `background.js`. `skins/catppuccin-macchiato.css` is yours and still usable once §5.2 lands.

---

## 3. Branding & creator links

175 `jasonsavard.com` references outside `_locales`. Distribution:

`popup.js` 30 · `options.html` 26 · `common.js` 16 · `contribute.html` 16 · `contribute.js` 15 · `checkerPlusForGmail.js` 15 · `options.js` 14 · `background.js` 11 · `account.js` 10 · `grant-access.html` 6 · `skins/skins.json` 4

### 3.1 Remove outright

| Item | Location |
| :--- | :--- |
| Whole donation/payment page | `contribute.html`, `js/contribute.js` |
| Manifest exposure of store/payment origins | `manifest.json` → `web_accessible_resources[0].matches` (`jasonsavard.com`, `checkout.stripe.com`, `paypal.com`, `nowpayments.io`) |
| "Unlock Premium" links | `options.html:333`, `popup.html:1511`, `popup.html:1701` |
| Menu items `discoverMyApps`, `aboutMe`, `changelog`, `help` | `popup.html:1513-1514`, handlers at `popup.js:7407/7419` |
| Header links: title, changelog, help | `options.html:323, 332, 334`; same in `grant-access.html:69, 78`; `contribute.html:251, 260` |
| `COPYRIGHT` file | "Copyright Jason Savard" — see §7 |

### 3.2 Runtime calls to the author's servers (not just links)

| What | Location | Note |
| :--- | :--- | :--- |
| **Uninstall telemetry — privacy leak** | `background.js:587-599` | Base64-encodes **your email address** + install age + donation status and sends it to `jasonsavard.com/uninstalled` on uninstall. Delete `setUninstallUrl()` and its call at `background.js:359`. |
| Skin catalogue + install counters | `common.js:3857` (`Controller.DOMAIN = "https://apps.jasonsavard.com/"`), `getSkins` at `:3889`, `updateSkinInstalls` at `:3907` | Network fetch on every Skins tab open, 10 s timeout |
| Quota text on appearance change | `options.js:1036` | `fetch("https://jasonsavard.com/getQuotaText…")` |
| Changelog | `checkerPlusForGmail.js:3095` | Remote wiki fetch |
| Payment endpoints | `contribute.js:269, 323, 354, 406, 515, 884-904` | QR, Stripe/PayPal forms, YouTube embed proxy |
| Realtime DB | `off_screen.js:286` | `https://watch.firebaseio.com` — author's Firebase |
| Avatar special-casing | `checkerPlusForGmail.js:1153-1162` | `@jasonsavard.com` → `jason.png`; twitter/facebook/pinterest/linkedin logos |
| Firefox add-on IDs | `checkerPlusForGmail.js:265-267` | `checkerplusforgmail@jasonsavard.com` |
| URL-parse sentinel | `common.js:2495, 2498` | `https://jasondefault.com` used as a fake base for `getUrlValue`/`setUrlParam`. Harmless (never fetched) but rename to something like `https://example.invalid` for cleanliness. |

### 3.3 Rename the product

Already done: `nameNoTM` → "Gmail Checkr" across locales (your commit).

Still pointing at the original identity:

- `manifest.json` → `"name": "Gmail Checkr"`, `"default_title"`, `"description": "__MSG_description__"`
- `manifest.json:2` → `"update_url": "https://clients2.google.com/service/update2/crx"`. **Remove this.** Ignored for unpacked loads, but it makes a packed build phone home to the Web Store updater and can silently replace your modifications.
- `manifest.json` → `"oauth2.client_id": "450788627700-…"` is the author's Google Cloud project. Works, but you inherit his quotas and rate limits. Replace with your own client ID if you ever hit 403 quota errors (needs a Google Cloud project + the Gmail API enabled).
- `popup.html:1888-1891` → "Checker Plus Compose" tooltips
- `_locales/en/messages.json` → ~28 keys mentioning donate/contribute/premium (`donate`, `donationRequired`, `thankYouForYourContribution`, `extraFeaturesPopup2`, `unlockOtherExtensions`, `reduceDonationAd_*`, …)

---

## 4. Performance

### 4.1 The popup boot path is the problem

`popup.html:1399-1401` loads **three blocking scripts** (no `defer`, no `async`):

```
js/common.js   209 KB
js/jdom.js      96 KB
js/icons.js    225 KB   ← 530 KB raw / 138 KB gzip, parsed before first paint
```

Then 14 more deferred scripts totalling ~700 KB, including `lib/Autolinker.js` (213 KB) and `lib/ical.js` (281 KB).

### 4.2 `js/icons.js` is 88% waste

- **875** `<g name="…">` SVG definitions
- **97** distinct icon names actually referenced anywhere in the codebase
- `js/jdom.js:1826` resolves icons with `document.querySelector('svg defs g[name="…"]')`, and `:1833` **throws** `Icon not found` otherwise — so the lookup is safe to audit exhaustively (I did: zero referenced-but-undefined names).

Trimming to the used set removes ~200 KB of parse work and a large DOM subtree on **every popup open**. If you want to be safe, keep all 875 but move `icons.js` to a `<link rel=preload>` / lazy load — the trim is the better win.

### 4.3 Other easy wins

| Win | Where | Why |
| :--- | :--- | :--- |
| Kill the dark-mode **FOUC** | `jdom.js:2540` calls `initColorScheme()` at top level, which does an **async** `storage.get` | Page paints light, then flips. Add a tiny inline script in `<head>` that reads a synchronously-available hint (or `matchMedia`) and sets `documentElement[color-scheme]` before first paint. |
| Parallelise popup init | `popup.js:505-515` | 10 sequential `await storage.get(...)`. Wrap in `Promise.all`. |
| Default `console_messages` off | `common.js:1938` | Currently `console.log` is only stubbed when the setting is *on*; so by default every log call runs. Invert the default. |
| Stop the skins network fetch | `options.js:1195` | 10 s timeout on a remote PHP endpoint every time you open Skins & Themes. Fix in §5.2. |
| Drop `update_url` | `manifest.json:2` | No background update checks. |

---

## 5. Features to build

Your `TODO.md` asks for three things. All three are already 80% written in the repo.

### 5.1 Dark mode + options-page theming

**Already exists, just locked.** `css/jdom.css:39` defines a complete dark palette under `:root[color-scheme='dark'], .apply-dark-theme` with 16 rules. `jdom.js:2086-2127` already implements `getColorSchemeSetting()` / `initColorScheme()` reading a `darkMode` setting (`light` / `dark` / `system`), and `options.html:1059` has the select.

So: unlock §1.4, then fix the FOUC (§4.3). That is the whole feature.

For **options-page** theming specifically, `options.html:11` hardcodes `--header-bg-color: #d23f31` and there is no theme block. To do properly:

1. Move every hardcoded colour in the `<style>` block (293 lines) to CSS custom properties on `:root`.
2. Add `:root[color-scheme='dark']` overrides reusing the `--text-color` / `--bg-color` / `--bg-light-color` / `--border-color` / `--separator-color` names already in `jdom.css` (already global, already loaded on this page).
3. Add a live preview card per theme in the Appearance section.

### 5.2 Local skin system

Right now `options.js:1195` does `await Controller.getSkins()`, which hits `apps.jasonsavard.com/controller.php`, and the "add" button at `options.js:1248` just calls `window.open("https://jasonsavard.com/wiki/Skins_and_Themes…")`. **The options-page skin picker cannot actually install a skin** — there is no `storage.set("skins", …)` anywhere in `options.js`. Only the popup can, and it is donation-gated.

Meanwhile `skins/skins.json` already contains **41 skins** in exactly the right shape (`id`, `name`, `css`, `image`, `author`, `author_url`), including your Catppuccin Macchiato. It is simply never read.

Plan:

1. `fetch(chrome.runtime.getURL("skins/skins.json"))` instead of `Controller.getSkins()`.
2. Implement the add/remove handler that `options.js:1248` is missing — copy the working logic from `popup.js:6297-6330`, minus the `donationClickedFlag` branch.
3. Implement an applier: read `storage.get("skins")`, concatenate each `skin.css`, and inject into popup/options via a single `<style>` node (`jdom.js` has no applier today — grep for `skins` in `jdom.js` returns nothing).

### 5.3 Revive the custom CSS editor

`custom-css-editor.html` + `js/custom-css-editor.js` is a **complete** CodeMirror + Prettier CSS editor with dark-mode detection, debounced auto-save to storage, and CSS formatting. It is loaded by nothing and its output is applied by nothing.

This is the cheapest "make it mine" feature in the repo:

1. Add an entry point: a button in options → Appearance, e.g. `<j-button onclick="window.open('custom-css-editor.html')">`.
2. Add an applier next to the skin applier in §5.2 — same code path, one more `<style>` node.
3. Delete `js/config.js` (it's loaded by the editor's `<head>` at line 150 and is otherwise unused) and replace with nothing; the editor works without `CONFIG`.

You get live editable theming for both popup and options, with syntax highlighting and formatting already built.

### 5.4 Themes

- Catppuccin: you only have `macchiato`. The other three flavours (Latte, Frappé, Mocha) are a straight copy of `skins/catppuccin-macchiato.css` with the palette block swapped — 271 lines each, all tokens already defined at the top.
- Note `skins/catppuccin-macchiato.css` has no wrapper block; it starts with a bare `* { --ctp-… }`. That is fine once injected as a stylesheet but it will apply Aurora tokens to everything — worth scoping to `:root`.
- The `tools-catppuccin` skill is available in this environment and validates port accuracy if you want the palette checked.

### 5.5 Niceties worth adding

| Idea | Effort | Why |
| :--- | :--- | :--- |
| Trim `icons.js` to used set | Low | Biggest single perf win (§4.2) |
| Inline pre-paint theme script | Low | Kills FOUC |
| `Promise.all` popup init | Low | ~10 serial round-trips → 1 |
| Settings **export/import** to a local JSON file | Low | `storage.sync` logic exists at `common.js:4079-4192`; a plain file download is simpler and vendor-free |
| Replace `oauth2.client_id` with your own | Medium | Removes dependence on the author's quota |
| Keyboard shortcut for DND toggle | Low | `commands` block in manifest already has 7 entries; add one |
| Remove the 39 unused locales | Low | Disk only, ~1.2 MB |

---

## 6. Suggested order of work

1. **Unlock the gates** (§1.4) — 3 edits, unblocks ~20 broken controls including dark mode.
2. **Delete the dead 2 MB** (§2) — start with `js/firebase-*`, `js/lib/prettier`, `js/lib/codemirror`, `js/lib/{Autolinker,ical}.js`. Do this *after* step 1 so you can tell whether a removal broke a feature.
3. **Strip branding + the uninstall telemetry** (§3.1, §3.2) — kill `contribute.html`/`contribute.js`, `setUninstallUrl`, the `Controller.DOMAIN` network dependency.
4. **Fix popup load** (§4) — icon trim, inline theme script, `Promise.all`.
5. **Build the theme system** (§5.1-5.3) — local `skins.json` + custom CSS editor + applier. One applier serves all three.
6. **Polish** (§5.4-5.5).

Steps 1-3 are mechanical and low-risk. Step 5 is the only part with real design decisions.

---

## 7. One practical note

`COPYRIGHT` reads `Copyright Jason Savard`, and there is no licence file granting redistribution rights. For **personal, self-installed use** that is not a problem — but it does mean you should not publish the modified build to the Web Store, share a packed `.crx`, or post the source publicly. Keeping the `COPYRIGHT` file in place (or extending it to note your modifications) is the honest move; deleting it does not change the underlying situation. Renaming the extension for your own local install is fine.

Also: your `popup.html`/`options.html` still link to `jasonsavard.com` in ~56 places. Removing the *links* is cosmetic; removing the *runtime fetches* in §3.2 is what actually stops your install from talking to his servers.
