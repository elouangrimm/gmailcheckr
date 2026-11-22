// Local build: route sign-in through a browser-only OAuth flow.
//
// Why this is needed
// ------------------
// On Helium (un-Googled Chromium) there is no native messaging service, so
// chrome.identity.getAuthToken is unavailable. The remaining upstream path
// calls launchWebAuthFlow with the author's *web* client, and Google rejects
// that with redirect_uri_mismatch because the only URIs registered on his
// client belong to his own extension IDs. His exchange server is also unusable
// (it holds his client secret).
//
// The fix: run a normal OAuth 2.0 + PKCE authorization-code flow in the
// browser. launchWebAuthFlow yields a code; LocalOAuth exchanges it with
// Google directly. No server and no native messaging involved.
//
// We replace the token acquisition method on each OAuthForDevices instance.
// That is the single entry point every sign-in goes through and it owns the
// storage wiring, so replacing it wholesale is cleaner than intercepting a
// half-finished flow.

"use strict";

(function () {
    const PATCH_FLAG = "_localOauthPatched";
    const METHOD = "get" + "AccessToken";

    function patchOauthInstance(oauth, label) {
        if (!oauth || oauth[PATCH_FLAG]) {
            return false;
        }
        if (typeof oauth[METHOD] != "function") {
            return false;
        }
        oauth[PATCH_FLAG] = true;

        const upstream = oauth[METHOD].bind(oauth);

        oauth[METHOD] = async function (params = {}) {
            const localReady = globalThis.LocalOAuth && LocalOAuth.isConfigured();

            // No personal client -> keep upstream behaviour untouched.
            if (!localReady) {
                return upstream(params);
            }

            console.log("[local] browser-only OAuth for " + label);

            const defaultScopes = oauth.getDefaultParams().scopes;
            const scopes = params.scopes || defaultScopes;

            const response = await LocalOAuth.authorize({
                scopes,
                email: params.email
            });

            // CRITICAL: expiry must be set BEFORE any authenticated request.
            // ensureToken() consults expiryDate, and an absent/expired one makes
            // it call refreshToken(), which posts to the author's server and
            // fails with 401. That was the "secret was missing" dead end.
            if (response.expires_in) {
                response.expiryDate = new Date(Date.now() + (parseInt(response.expires_in, 10) * 1000));
            }

            // Identify the account with the credentials we just obtained.
            // second argument is the request helper the caller expects:
            // ({tokenResponse, url, data}) => parsed JSON
            const request = options => oauth.send(options);
            const identity = await oauth.getUserEmail(response, request);
            identity.userEmail ??= params.email;

            if (!identity.userEmail) {
                throw Error("Could not determine the signed-in address");
            }

            response.userEmail = identity.userEmail;
            if (identity.name) {
                response.name = identity.name;
            }
            if (identity.photoUrl) {
                response.photoUrl = identity.photoUrl;
            }
            response.scopes = response.scopes || scopes;

            const all = await oauth.getTokenResponses();
            const index = await oauth.findTokenResponseIndex({userEmail: response.userEmail});

            if (index != -1) {
                all[index] = response;
            } else {
                all.push(response);
            }

            await storage.setEncryptedObj(oauth.getDefaultParams().storageKey, all);

            return response;
        };

        return true;
    }

    function patchAll() {
        const targets = [
            ["oAuthForEmails", globalThis.oAuthForEmails],
            ["oAuthForContacts", globalThis.oAuthForContacts],
            ["oAuthForProfiles", globalThis.oAuthForProfiles]
        ];

        let count = 0;
        targets.forEach(pair => {
            if (patchOauthInstance(pair[1], pair[0])) {
                count++;
            }
        });
        return count;
    }

    // ---- Token-endpoint redirect ------------------------------------------
    //
    // refreshToken() (a closure inside OAuthForDevices) posts to the author's
    // server, which cannot authenticate us. It cannot be reached or replaced
    // from outside, but every request it makes goes through fetchWrapper().
    // So we redirect just that one URL to Google's token endpoint, translating
    // the payload shape on the way through.
    //
    // This covers both the hourly access-token refresh and any retry path.
    function patchFetchWrapper() {
        const upstream = globalThis.fetchWrapper;
        if (typeof upstream != "function" || upstream._localPatched) {
            return false;
        }

        const TOKEN_HOST = "extensions-auth.uc.r.appspot.com";
        const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";

        globalThis.fetchWrapper = async function (url, options = {}) {
            const urlString = (typeof url === "string") ? url : (url?.href || "");

            if (!urlString.includes(TOKEN_HOST) || !globalThis.LocalOAuth?.isConfigured()) {
                return upstream(url, options);
            }

            console.log("[local] redirecting token request to Google");

            // The upstream payload is JSON: {refresh_token | code, extension, ...}
            let payload = {};
            try {
                if (typeof options.body == "string") {
                    payload = JSON.parse(options.body);
                }
            } catch (error) {
                console.warn("[local] could not parse upstream token payload", error);
            }

            const form = new URLSearchParams();

            // The upstream code obfuscates the refresh token into a field named
            // "ert" (every char shifted by +1) and shifts the whole response
            // back by -1 on the way out. We must undo that here, and re-apply it
            // to the response, or JSON.parse upstream would fail.
            const deobfuscate = value => String(value || "")
                .split("")
                .map(ch => String.fromCharCode(ch.charCodeAt(0) - 1))
                .join("");

            const refreshValue = payload.ert || payload.refresh_token;

            if (refreshValue) {
                form.set("refresh_token", payload.ert ? deobfuscate(refreshValue) : refreshValue);
                form.set("grant_type", "refresh_token");
            } else if (payload.code) {
                form.set("code", payload.code);
                form.set("grant_type", "authorization_code");
                form.set("code_verifier", payload.code_verifier || "");
            } else {
                // nothing usable; let the original fail so the error is honest
                return upstream(url, options);
            }

            form.set("client_id", OAuthConfig.CLIENT_ID);
            if (OAuthConfig.CLIENT_SECRET) {
                form.set("client_secret", OAuthConfig.CLIENT_SECRET);
            }
            if (payload.google_redirect_uri) {
                form.set("redirect_uri", payload.google_redirect_uri);
            }

            const response = await upstream(GOOGLE_TOKEN, {
                method: "POST",
                headers: {"content-type": "application/x-www-form-urlencoded"},
                body: form.toString()
            });

            // getAuthTokenFromServer() calls dStr() on the body, shifting every
            // character by -1, then JSON.parse()s it. Google returns plain JSON,
            // so re-shift it by +1 here to survive that round trip untouched.
            try {
                const text = await response.clone().text();
                const shifted = text
                    .split("")
                    .map(ch => String.fromCharCode(ch.charCodeAt(0) + 1))
                    .join("");

                return new Response(shifted, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers
                });
            } catch (error) {
                console.warn("[local] could not re-shift token response", error);
                return response;
            }
        };

        globalThis.fetchWrapper._localPatched = true;
        return true;
    }

    if (!patchFetchWrapper()) {
        let tries = 0;
        const timer = setInterval(() => {
            if (patchFetchWrapper() || ++tries > 400) {
                clearInterval(timer);
            }
        }, 25);
    }

    // initOauthAPIs() creates these during initMisc, so poll until they exist.
    if (!patchAll()) {
        let tries = 0;
        const timer = setInterval(() => {
            if (patchAll() || ++tries > 400) {
                clearInterval(timer);
            }
        }, 25);
    }
})();
