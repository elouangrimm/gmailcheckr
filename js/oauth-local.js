// Local build: a self-contained OAuth flow for un-Googled browsers.
//
// The problem on Helium (and any ungoogled Chromium)
// -------------------------------------------------
// The extension has three ways to obtain a token:
//
//   1. chrome.identity.getAuthToken  -> requires Google's native messaging
//      service. Un-Googled builds ship without it, so this is unavailable.
//   2. launchWebAuthFlow + author's web client -> `redirect_uri_mismatch`,
//      because that client only whitelists his own extension IDs.
//   3. launchWebAuthFlow + his token server -> cannot work without his secret.
//
// On Helium only (2) and (3) are reachable, and both are broken for you. What
// DOES work is a plain OAuth 2.0 + PKCE authorization-code flow run entirely in
// the browser: launchWebAuthFlow gives us a code, and we exchange it against
// Google's token endpoint ourselves. No server, no native messaging.
//
// Requirements (unavoidable, Google requires them for any OAuth client)
// --------------------------------------------------------------------
//   * Your own OAuth client. On an un-Googled build you must use a
//     **Web application** client, because a "Chrome extension" client is bound
//     to chrome.identity and cannot be used with launchWebAuthFlow.
//   * That Web client needs this exact redirect URI registered:
//         https://<EXTENSION_ID>.chromiumapp.org/provider_cb
//     The ID is derived from the folder path; see OAUTH-SETUP.md.
//
// This module is inert until CLIENT_ID is filled in.

"use strict";

(function () {
    const PKCE_STORAGE_KEY = "_localPkce";
    const TOKEN_URL = "https://oauth2.googleapis.com/token";
    const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

    function base64UrlEncode(bytes) {
        return btoa(String.fromCharCode.apply(null, bytes))
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");
    }

    function generateVerifier() {
        const array = new Uint8Array(56);
        crypto.getRandomValues(array);
        return base64UrlEncode(array);
    }

    async function generateChallenge(verifier) {
        const data = new TextEncoder().encode(verifier);
        const digest = await crypto.subtle.digest("SHA-256", data);
        return base64UrlEncode(new Uint8Array(digest));
    }

    function isConfigured() {
        return typeof globalThis.OAuthConfig == "object"
            && typeof OAuthConfig.CLIENT_ID == "string"
            && OAuthConfig.CLIENT_ID.includes(".apps.googleusercontent.com");
    }

    // The redirect must match what is registered in the Cloud console exactly.
    function getRedirectUri() {
        let uri = `${chrome.identity.getRedirectURL()}provider_cb`;

        // un-Googled builds can report a rewritten host; chromiumapp.org is the
        // one Google accepts for extensions
        if (!uri.includes("chromiumapp.org") && !uri.includes("allizom.org")) {
            uri = uri.replace("ch40m1umapp.qjz9zk", "chromiumapp.org");
        }

        return uri;
    }

    async function authorize(params = {}) {
        if (!isConfigured()) {
            throw Error(
                "No OAuth client configured. Fill in CLIENT_ID in js/oauth-config.js " +
                "(create a Web application client and register " + getRedirectUri() +
                " as a redirect URI). See OAUTH-SETUP.md.",
                {cause: "OAUTH_NOT_CONFIGURED"}
            );
        }

        const verifier = generateVerifier();
        const challenge = await generateChallenge(verifier);
        const redirectUri = getRedirectUri();

        const scopes = params.scopes || ["https://www.googleapis.com/auth/gmail.modify"];

        const search = new URLSearchParams({
            client_id: OAuthConfig.CLIENT_ID,
            response_type: "code",
            redirect_uri: redirectUri,
            scope: scopes.join(" "),
            access_type: "offline",          // ask for a refresh token
            include_granted_scopes: "true",
            code_challenge: challenge,
            code_challenge_method: "S256",
            prompt: params.email ? "consent" : "consent select_account"
        });

        if (params.email) {
            search.set("login_hint", params.email);
        }

        // stash the verifier so a retry after a failed exchange can reuse it
        sessionStorage.setItem(PKCE_STORAGE_KEY, verifier);

        const responseUrl = await chrome.identity.launchWebAuthFlow({
            url: `${AUTH_URL}?${search.toString()}`,
            interactive: true
        });

        if (!responseUrl) {
            throw Error("Sign in was cancelled", {cause: "ACCESS_DENIED"});
        }

        const returned = new URL(responseUrl);
        const returnedParams = returned.searchParams;

        const error = returnedParams.get("error");
        if (error) {
            throw Error(error, {cause: "ACCESS_DENIED"});
        }

        const code = returnedParams.get("code");
        if (!code) {
            throw Error("No authorization code returned", {cause: "OAUTH_NO_CODE"});
        }

        return await exchangeCode({code, verifier, redirectUri});
    }

    async function exchangeCode({code, verifier, redirectUri}) {
        const body = new URLSearchParams({
            code,
            client_id: OAuthConfig.CLIENT_ID,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
            code_verifier: verifier
        });

        if (OAuthConfig.CLIENT_SECRET) {
            body.set("client_secret", OAuthConfig.CLIENT_SECRET);
        }

        const response = await fetch(TOKEN_URL, {
            method: "POST",
            headers: {"content-type": "application/x-www-form-urlencoded"},
            body: body.toString()
        });

        const json = await response.json();

        if (!response.ok) {
            const detail = json.error_description || json.error || `HTTP ${response.status}`;
            throw Error(`Token exchange failed: ${detail}`, {cause: "OAUTH_EXCHANGE"});
        }

        sessionStorage.removeItem(PKCE_STORAGE_KEY);
        return normalise(json);
    }

    async function refresh(refreshTokenValue) {
        const body = new URLSearchParams({
            client_id: OAuthConfig.CLIENT_ID,
            grant_type: "refresh_token"
        });

        body.set("refresh_token", refreshTokenValue);

        if (OAuthConfig.CLIENT_SECRET) {
            body.set("client_secret", OAuthConfig.CLIENT_SECRET);
        }

        const response = await fetch(TOKEN_URL, {
            method: "POST",
            headers: {"content-type": "application/x-www-form-urlencoded"},
            body: body.toString()
        });

        const json = await response.json();

        if (!response.ok) {
            throw Error(`Token refresh failed: ${json.error_description || json.error}`,
                        {cause: "OAUTH_REFRESH"});
        }

        return normalise(json);
    }

    // The rest of the extension expects Google's raw shape plus these extras.
    function normalise(json) {
        const out = Object.assign({}, json);
        out.token_type ??= "Bearer";
        if (out.scope && typeof out.scope == "string") {
            out.scopes = out.scope.split(" ");
        }
        out.launchWebAuthFlow = true;
        out.clientId = OAuthConfig.CLIENT_ID;
        return out;
    }

    globalThis.LocalOAuth = {
        isConfigured,
        getRedirectUri,
        authorize,
        refresh,
        // kept for parity with the earlier shim
        exchangeCodeWithGoogle: exchangeCode,
        refreshWithGoogle: refresh
    };

    if (!isConfigured()) {
        console.warn("[local] No OAuth client configured. Adding accounts needs one on this browser. " +
                     "See OAUTH-SETUP.md.");
    } else {
        console.log("[local] OAuth ready. Redirect URI in use:", getRedirectUri());
    }
})();
