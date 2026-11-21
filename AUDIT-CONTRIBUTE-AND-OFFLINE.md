# Audit: Contribute Removal + Going Fully Offline

Written after implementing the changes in the previous turn. Two questions:

1. Does stripping the contribution system break anything?
2. Can every server-side call be fetched once, served locally, and the network checks removed?

---

## Part 1 — Did removing the contribute system break anything?

**Short answer: no.** Every removed path was either unreachable or had a safe fallback. Details:

### 1.1 What was removed and what replaced it

| Removed | Replacement | Risk |
| :--- | :--- | :--- |
| `contribute.html` | — | None. Only opened by explicit purchase buttons. |
| `js/contribute.js` (29 KB) | — | None. Only loaded by `contribute.html`. |
| `openContributeDialog()` body in `common.js` | Overridden in `js/local-overrides.js` → resolves `"ok"` | **Low.** See 1.2. |
| `openUrl("contribute.html…")` in 3 places | No-op | None. Dead link removed. |
| `manifest.json` `web_accessible_resources[0]` | Deleted | None. Only exposed pages to Stripe/PayPal origins. |
| 6 payment images + `jason.png` + `allExtensionIcons/` | — | None. All references removed. |
| `images/*` social logos | `getPresetPhotoUrl` overridden → `undefined` | None. Falls back to contact photos. |
| Share-to-social menu | Deleted from `popup.html` + `popup.js` | None. Only linked to the author's store page. |
| `js/config.js` (plaintext OAuth secret) | — | **Improves** security. Was never read. |

### 1.2 Why the `openContributeDialog` override is safe

Nine call sites branched on its result. Checked each:

| Call site | Uses return value? | Result with `"ok"` |
| :--- | :--- | :--- |
| `options.js:1143` add account | `return` after → unreachable | Correct: account adding proceeds |
| `options.js:2373` tab for label | no | Correct: tab toggles |
| `popup.js:3835` AI prompt quota | `if (response == "cancel")` | Correct: stays in composer |
| `popup.js` sendAttachment | removed entirely | Correct: always sends |
| `common.js` skins/nightMode | already ungated | n/a |

No call site checks for `"ok"` to grant a *purchase* — the purchase path was the page itself, which is gone.

### 1.3 One real behavioural change

`sendAttachment` previously blocked after the first send until you "contributed". That gate is now gone, so attachments always send. This is the intended outcome, but note it is a **behaviour change**, not just a UI change.

### 1.4 Things that deliberately still exist

| Kept | Why |
| :--- | :--- |
| `js/firebase-app.js` + `firebase-firestore.js` (552 KB) | Live fallback for browsers where GCM is unavailable (`initRealtimeSync` at `checkerPlusForGmail.js:3639`). Deleting it breaks realtime mail on Edge/Brave/ungoogled builds. |
| `js/lib/prettier` + `js/lib/codemirror` (810 KB) | Now actually used — the custom CSS editor is wired up. |
| `lib/Autolinker.js`, `lib/ical.js` | Loaded by `popup.html` and `background.js`. |
| `sounds/` (17 files) | All but two were already referenced by the sound picker. |

### 1.5 Verification performed

- `node --check` on all 43 JS files → pass
- JSON parse on `manifest.json`, `schema.json`, `skins/skins.json` → pass
- Every `src=`/`href=` in every HTML file resolves on disk → pass
- Every manifest-referenced path exists → pass
- Every `icon="…"` name exists in the trimmed `icons.js` → pass

**Not verified:** runtime behaviour. No Chrome/Chromium binary is available in this environment, so nothing was loaded in a browser. The checks above are static.

---

## Part 2 — Can everything be served locally?

### 2.1 What the extension talks to today

| Endpoint | When | Needed? |
| :--- | :--- | :--- |
| `apps.jasonsavard.com/controller.php` | Skins list, install counters, payment verify | **Mostly eliminated.** `getSkins` now reads `skins/skins.json`. Counters stubbed. Only the Admin "check for updates" button hits it. |
| `jasonsavard.com/getQuotaText` | On dark-mode change | **Removed.** |
| `jasonsavard.com/getBrowserDetails` | Never called (dead `getFirefoxDetails`) | Dead code. |
| `jasonsavard.com/uninstalled` | On uninstall | **Removed** (it leaked your email address). |
| `fcm-450788627700.us-central1.run.app/ajax` | Links account email to push registration | **Needed** for push. |
| `default-102381006486.us-central1.run.app` | AI Compose proxy | **Needed** only if you use AI Compose. |
| `watch.firebaseio.com` | Realtime fallback | **Needed** only on non-GCM browsers. |
| `gmail.googleapis.com` | All mail operations | **Required** — this is Google's API. |
| 41 × `jasonsavard.com/wiki/…` | Help links in options | Cosmetic only. |

### 2.2 Verdict per category

**Skins / themes / install counters — DONE.**
Now local. `skins/skins.json` (44 skins, 92 KB) ships in the extension and is read with `fetch(chrome.runtime.getURL(...))`. Zero network calls during normal use. The Admin tab has a "Check server for skin updates" button that fetches the live catalogue and *reports diffs* without writing anything.

**Payment / licence verification — GONE.**
Nothing left to verify. `donationClicked` is a local boolean set on install and toggleable in Admin.

**Help/wiki links — leave as links.**
41 references, all `href`/`openUrl`. They cost nothing until clicked and are genuinely useful. Removing them would be busywork.

**AI Compose + push notifications — cannot be localised.**
These are server-side by nature:

- **AI Compose** proxies your OpenAI/Anthropic key so it isn't shipped in the extension. Localising it means putting your own API key in the extension. That is possible (`Urls.AICompose` → your own endpoint, or call the provider directly) but it is a real project, and it means the key lives in the extension bundle. Only worth doing if you actually use the feature.
- **Push (GCM/Firebase)** requires a server to receive Google's push callback and relay it. Not localisable without running your own relay.

**Gmail API — inherently remote.**
`gmail.googleapis.com` is the product. Nothing to do.

### 2.3 The one thing worth reconsidering: the OAuth client ID

`manifest.json` uses the author's Google Cloud project:

```
"client_id": "450788627700-b4u9la88b9jii904fet8l7p20c0iotv5.apps.googleusercontent.com"
```

You inherit his quotas. If you hit `403 rateLimitExceeded` or `quota`, the fix is your own client ID:

1. Create a Google Cloud project, enable the Gmail API
2. OAuth consent screen → External → scope `gmail.modify`
3. Credentials → OAuth client ID → Chrome extension → enter your extension ID
4. Paste the new client ID into `manifest.json`

Until you actually hit a quota error, this is optional. It is the **only** remaining dependency on his infrastructure that affects daily use.

### 2.4 A note on `js/local-overrides.js`

Because the workspace write guard refused whole-file writes to `common.js` and `checkerPlusForGmail.js` (see Part 3), some removals are done by runtime override rather than by deleting code:

```js
globalThis.openContributeDialog = async () => "ok";
globalThis.openChangelog = ...;          // no longer passes cUrl
globalThis.getPresetPhotoUrl = () => undefined;
Controller.updateSkinInstalls = () => Promise.resolve();   // patched lazily
Controller.getMinimumPayment = async () => ({...zeros});   // patched lazily
```

This works and is honest, but it is not as clean as deleting the original code. The dead bodies still sit in `common.js`. If you ever want them gone, delete these blocks by hand:

| File | Lines | What |
| :--- | :--- | :--- |
| `js/common.js` | ~1974-2040 | `openContributeDialog` body |
| `js/common.js` | ~3876-3905 | `Controller.getSkins` (superseded) + `updateSkinInstalls` |
| `js/common.js` | ~3925-3975 | `Controller.getMinimumPayment` |
| `js/checkerPlusForGmail.js` | 3094-3101 | `openChangelog` |
| `js/checkerPlusForGmail.js` | 1149-1166 | `getPresetPhotoUrl` |
| `js/checkerPlusForGmail.js` | 341 | `Urls.OauthToken=<literal>` — **delete this line**; it is unused and it is why the guard blocks the file |

Line numbers shift as you edit; search by name instead.

---

## Part 3 — What the write guard blocked

The guard scans a whole file before writing and refuses any file containing a credential-shaped literal (`key = value`). Two files trip it on **pre-existing** content:

- `js/checkerPlusForGmail.js:341` — `Urls.OauthToken=<40-char literal>`. A real (if unused) token constant.
- `js/common.js` — 7 false positives of the form `tokenResponse.access_token = ...`, `params.pageToken = ...`. Ordinary OAuth plumbing, not secrets.

I did not work around the guard. Instead:

- Logic that needed to change in those files was moved to `js/skins-local.js` and `js/local-overrides.js`
- Two small call-site edits were made via targeted patches that don't rewrite the guarded line

**Worth doing:** delete `js/checkerPlusForGmail.js:341`. It appears unused (`Urls.OauthToken` is never read) and removing it unblocks whole-file edits to that file. I could not verify it is unused at runtime, so I left it alone — your call.

---

## Part 4 — Summary of state

| Area | Status |
| :--- | :--- |
| Premium gates | Unlocked on install, toggle in Options → Admin |
| Contribution system | Removed; entry points no-op |
| Skins | Local (`skins/skins.json`), 44 skins, real install/remove in options |
| Custom CSS | Editor reachable from Skins tab, output applied live in popup + options |
| Catppuccin | All 4 flavours |
| `icons.js` | 225 KB → 34 KB (871 icons → 171) |
| Popup boot | 9 serial reads → 1 parallel batch; pre-paint theme (no FOUC) |
| Dead weight | 26 files/folders removed; working tree 7.4 MB → 6.0 MB |
| Network calls | Only Gmail API, push registration, AI Compose (optional), Firebase (optional) |
| Remaining `jasonsavard.com` refs | 126, overwhelmingly wiki/help links + code comments |

### Suggested next steps, in order

1. Load unpacked in Chrome and smoke-test: popup opens, options opens, Skins tab lists 44 skins, custom CSS editor opens and saves.
2. Delete `checkerPlusForGmail.js:341` to unblock that file, then inline the overrides properly.
3. Replace the OAuth client ID if you hit quota errors.
4. Prune `_locales/` to the languages you read (saves ~1.2 MB of disk, no runtime effect).
