# Cloud Console setup — step by step

You said you already created a new project. Start from that project.

Your extension ID is **`jaogjaacnemkkjdbjpljjdjeahfiaeic`**, so your redirect URI is:

```
https://jaogjaacnemkkjdbjpljjdjeahfiaeic.chromiumapp.org/provider_cb
```

Copy that exactly. A single character wrong gives `redirect_uri_mismatch` again.

---

## Step 1 — Enable the Gmail API

1. Go to <https://console.cloud.google.com/> and select your new project in the top bar.
2. In the left menu: **APIs & Services** → **Library**.
3. Search for `Gmail API` → click it → **Enable**.
4. Optional, only if you want contact photos and avatars: go back to Library, search `People API` → **Enable**.

Nothing to configure here. Enabling is the whole step.

---

## Step 2 — Configure the consent screen

1. **APIs & Services** → **OAuth consent screen**.

   If it asks you to choose a user type, pick **External**. (Internal only works for Google Workspace organisations.)

2. **App information**
   - App name: anything, e.g. `Gmail Checkr local`
   - User support email: your address
   - Developer contact email: your address
3. **Save and continue.**
4. **Scopes** → **Add or remove scopes**. Paste these one at a time into the "filter" box and tick them:

   ```
   https://www.googleapis.com/auth/gmail.modify
   https://www.googleapis.com/auth/contacts.readonly
   https://www.googleapis.com/auth/contacts.other.readonly
   https://www.googleapis.com/auth/userinfo.profile
   ```

   Only `gmail.modify` is strictly required. The other three cover contact photos and account avatars; add them if you want those, omit them if you don't.

5. **Save and continue.**
6. **Test users** → **Add users** → type your own Gmail address → **Save**.
7. **Save and continue** through the summary.

### Important: Testing vs Published

While the app is in **Testing**, Google expires refresh tokens after **7 days**. That is almost certainly the "it keeps signing me out" behaviour you hit before.

Two options:

- **Stay in Testing**: re-open the extension and sign in again every week.
- **Publish the app**: on the consent screen click **Publish app** → confirm. It shows *In production*. Verification is not required for personal use — you will see an "unverified app" warning at sign-in which you dismiss via **Advanced → Go to (unsafe)**. Tokens then keep refreshing indefinitely.

For a personal build, publish it.

---

## Step 3 — Create the OAuth client

This is the step that must be right, because the client **type** determines what works.

1. **APIs & Services** → **Credentials**.
2. **+ Create credentials** → **OAuth client ID**.
3. **Application type: Web application**.

   Do **not** pick "Chrome extension". A Chrome-extension client only works through `chrome.identity.getAuthToken`, which needs Google's native messaging service — Helium does not ship it. That is the trap you hit previously.

4. **Name**: anything, e.g. `Gmail Checkr local`.
5. **Authorized redirect URIs** → **+ Add URI** → paste exactly:

   ```
   https://jaogjaacnemkkjdbjpljjdjeahfiaeic.chromiumapp.org/provider_cb
   ```

6. **Create**.
7. A dialog shows your **Client ID** and **Client secret**. Copy the **Client ID** — it looks like `123456789012-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com`.

   Leave the client secret alone. The extension uses PKCE, which does not need it, and a secret inside an extension is not actually secret.

---

## Step 4 — Put the client ID in the extension

Open `js/oauth-config.js` and fill in one line:

```js
CLIENT_ID: "123456789012-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com",
```

Leave `CLIENT_SECRET` and `TOKEN_ENDPOINT` empty.

You do **not** need to touch `manifest.json`. Its `oauth2.client_id` is only read by the native flow, which does not run on Helium.

---

## Step 5 — Reload and verify

1. Go to `chrome://extensions` (or `helium://extensions`), find the extension, click **Reload**.
2. Click **service worker** to open its console.
3. You should see:

   ```
   [local] OAuth ready. Redirect URI in use: https://jaogjaacnemkkjdbjpljjdjeahfiaeic.chromiumapp.org/provider_cb
   ```

4. Compare that line, character by character, against the URI in the Cloud console. They must match exactly.
5. Now use **Add account** in the extension.

If you see `[local] No OAuth client configured` instead, the file was not saved or the extension was not reloaded.

If you still get `redirect_uri_mismatch`, copy the URI **from the console** rather than from this document — that is the value actually being sent.

---

## Why "the secret was missing" happened

Worth understanding, because it explains the 401 you saw after adding the secret.

The upstream refresh path never talks to Google. `refreshToken()` posts to the
author's `extensions-auth.uc.r.appspot.com/oauthToken` endpoint, expecting *his*
server-side client secret to complete the exchange. Adding a secret to the
extension could never satisfy that — the request still went to his server, which
rejected it with `401`.

Two further traps in that same code path:

1. **Response obfuscation.** `getAuthTokenFromServer()` runs `dStr()` over the
   response, shifting every character by `-1`, before `JSON.parse`. A plain
   Google JSON body would be corrupted.
2. **Obfuscated refresh token.** The refresh token is sent as a field called
   `ert`, character-shifted by `+1`, not as `refresh_token`.

`js/oauth-native.js` now intercepts `fetchWrapper()` — the single funnel every
request passes through — and redirects just the token endpoint to Google. It
undoes the `ert` shift on the way out and re-applies the response shift on the
way back, so the upstream parser keeps working unchanged.

## Troubleshooting

| Symptom | Cause | Fix |
| :--- | :--- | :--- |
| `redirect_uri_mismatch` | URI in Cloud console differs from the one sent | Copy it from the service worker console |
| `[local] No OAuth client configured` | `CLIENT_ID` empty or extension not reloaded | Fill it in, reload |
| Sign-in works, then breaks ~7 days later | App still in **Testing** | Publish the app (Step 2) |
| `Access blocked: app not verified` | App is published but unverified | **Advanced → Go to … (unsafe)**; expected for personal builds |
| `Error 403: access_denied` | Your address is not a Test user | Add it under Test users (Step 2.6) |
| Sign-in works but no mail appears | Scope not granted | Ensure `gmail.modify` was ticked in Step 2.4 |
| Changing the folder path breaks sign-in | Extension ID is derived from the path | Add the new redirect URI for the new ID |

## If you ever move the extension folder

The ID comes from the folder path, so moving it changes the ID and every redirect URI breaks. Either keep the folder where it is, or add a second authorised redirect URI for the new ID. You can see the current ID any time on `chrome://extensions` under the extension's card.
