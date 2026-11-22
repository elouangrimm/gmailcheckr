// Local build: your own OAuth credentials.
//
// Why this file exists
// --------------------
// The upstream extension authenticates through the author's Google Cloud
// project and, for the "web" flow, through a token-exchange server he runs.
// That cannot work in a personal build:
//
//   * The web client he uses only whitelists HIS extension IDs as redirect
//     URIs, so yours fails with `Error 400: redirect_uri_mismatch`.
//   * The code-exchange step posts to his server, which you cannot use.
//
// So you need your own Google Cloud credentials. Fill them in below.
//
// Which client type to create
// ---------------------------
// You are on Helium (un-Googled Chromium), so create a **Web application**
// client, NOT a "Chrome extension" client.
//
// Reason: a Chrome-extension client only works through
// chrome.identity.getAuthToken, which needs Google's native messaging service
// that un-Googled builds do not ship. The web client works with
// chrome.identity.launchWebAuthFlow, which is a plain browser API.
//
// The extension ID is derived from the folder path (no `key` in the manifest),
// and resolves to:
//
//     jaogjaacnemkkjdbjpljjdjeahfiaeic
//
// So the redirect URI you must register is:
//
//     https://jaogjaacnemkkjdbjpljjdjeahfiaeic.chromiumapp.org/provider_cb
//
// Steps:
//   1. https://console.cloud.google.com/ -> your existing project
//   2. "APIs & Services" -> "Library" -> enable **Gmail API**
//      (also enable **People API** if you want contact photos)
//   3. "APIs & Services" -> "OAuth consent screen"
//        - User type: External
//        - Add your own Google address under "Test users"
//        - IMPORTANT: while the app is in "Testing", refresh tokens expire
//          after 7 days. To stop the periodic sign-outs, either re-run consent
//          weekly or click "Publish app" (it may stay unverified; you will get
//          an "unverified app" warning you can dismiss).
//        - Scopes: .../auth/gmail.modify (+ contacts.readonly, userinfo.profile)
//   4. "APIs & Services" -> "Credentials" -> "Create credentials"
//        -> "OAuth client ID" -> Application type: **Web application**
//        -> Authorised redirect URIs: add the URI above, exactly
//   5. Paste the client ID into CLIENT_ID below.
//      You do NOT need to change manifest.json: that one is only used by the
//      native flow, which does not run on this browser.
//
// Keep this file out of version control if you fork this publicly.

"use strict";

globalThis.OAuthConfig = {
    // e.g. "123456789012-abcdefghijklmnop.apps.googleusercontent.com"
    CLIENT_ID: "",

    // Only needed if you use the authorization-code ("web") flow for extra
    // accounts. Chrome Extension clients do not have a secret, so leave blank
    // unless you deliberately created a Web application client.
    CLIENT_SECRET: "",

    // Where the code exchange happens. Empty string = talk to Google directly.
    // The upstream build pointed this at the author's server; leave empty.
    TOKEN_ENDPOINT: "",
};

// True once a real client ID has been supplied.
globalThis.isOwnOAuthConfigured = function () {
    return typeof OAuthConfig.CLIENT_ID == "string"
        && OAuthConfig.CLIENT_ID.includes(".apps.googleusercontent.com");
};
