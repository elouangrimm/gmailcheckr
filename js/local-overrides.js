// Local build: overrides for the removed donation/contribution system.
//
// common.js defines these as function *declarations* (and Controller.* as
// properties assigned inside Controller(), which is only called later during
// initMisc). Reassigning a function declaration here works because classic
// scripts share one global scope and the declaration becomes a writable
// property of globalThis. Controller.* needs to be patched lazily instead,
// since Controller() has not run yet when this file loads.

"use strict";

(function () {
    // ---- function declarations: safe to replace immediately ----------------

    // Was: showed a "please contribute" dialog and resolved with "ok"/"cancel".
    // Callers only branch on those values, so resolving "ok" keeps every call
    // site working while nothing is ever charged or blocked.
    globalThis.openContributeDialog = async function (key, params = {}) {
        console.log("[local] contribution dialog skipped:", key);
        return "ok";
    };

    // Was: passed the local contribute.html path to the wiki as "cUrl" so the
    // site could render a "buy" button. contribute.html no longer ships.
    globalThis.openChangelog = function (ref) {
        const url = new URL("https://jasonsavard.com/wiki/Checker_Plus_for_Gmail_changelog");
        if (ref) {
            url.searchParams.set("ref", ref);
        }
        openUrl(url.href);
    };

    // Was: showed the author's own avatar for mail from @jasonsavard.com, plus
    // brand logos for a handful of social senders. Pure branding, and the image
    // file is gone; returning undefined makes callers fall back to contact photos.
    globalThis.getPresetPhotoUrl = function () {
        return undefined;
    };

    // ---- Controller.*: assigned inside Controller(), patch lazily ----------

    // Runs after Controller() has populated the object. Idempotent.
    const patchController = () => {
        const ControllerRef = globalThis.Controller;
        if (!ControllerRef || ControllerRef._localPatched) {
            return;
        }
        ControllerRef._localPatched = true;

        // Was: uploaded an anonymous install counter to the author's server.
        ControllerRef.updateSkinInstalls = () => Promise.resolve();

        // Was: fetched minimum contribution amounts from the author's server on
        // popup open, driving the "reduced donation" ad. Nothing needs it now.
        ControllerRef.getMinimumPayment = async () => ({
            onetime_payment: 0,
            onetime_payment_reduced: 0,
            onetime_payment_already_contributed: 0,
            monthly_payment: 0,
            yearly_payment: 0,
            getOneTimePayment: () => 0,
            getOneTimeReducedPayment: () => 0,
            getMonthlyPayment: () => 0,
            getYearlyPayment: () => 0
        });
    };


    // ---- High-DPI toolbar icons for the "material" set ---------------------
    //
    // ButtonIcon.setIcon() only requests a retina variant for the "default"
    // icon set, passing a single 19px path for everything else. The material
    // set ships a 38px file too, so serve that on 2x displays. This wraps
    // chrome.action.setIcon rather than editing the class in place.

    function patchActionIcon() {
        if (!chrome?.action?.setIcon || chrome.action.setIcon._localWired) {
            return false;
        }
        chrome.action.setIcon._localWired = true;

        const upstream = chrome.action.setIcon.bind(chrome.action);

        chrome.action.setIcon = function (details) {
            try {
                const path = details?.path;
                if (path && typeof path === "object" && path["19"] && !path["38"]
                    && /browserButtons\/material\//.test(path["19"])) {

                    const retina = path["19"].replace(/(\.png)$/, "_retina$1");
                    if (retina != path["19"]) {
                        details = Object.assign({}, details, {
                            path: {"19": path["19"], "38": retina}
                        });
                    }
                }
            } catch (error) {
                // never let icon sizing break the update cycle
            }
            return upstream(details);
        };

        return true;
    }

    if (!patchActionIcon()) {
        const t = setInterval(() => {
            if (patchActionIcon()) {
                clearInterval(t);
            }
        }, 50);
        setTimeout(() => clearInterval(t), 5000);
    }


    // ---- Toolbar icon: apply icon_set changes without a restart -----------
    //
    // ButtonIcon.setIcon() early-returns when the incoming params match the
    // cached lastSetIconParams. But `icon_set` is NOT part of those params, so
    // changing the toolbar style produces an identical params object and the
    // call is skipped. That cache is also persisted to storage, so a style
    // switch appears to do nothing until the service worker is restarted.
    //
    // Wrap the instance method and stamp the current icon_set into the params,
    // so a style change always looks like a change.

    function patchButtonIcon() {
        const icon = globalThis.buttonIcon;
        if (!icon || typeof icon.setIcon != "function" || icon.setIcon._localSetWired) {
            return false;
        }

        const upstream = icon.setIcon;
        icon.setIcon = async function (params) {
            try {
                const iconSet = await storage.get("icon_set");
                if (iconSet && params) {
                    params = Object.assign({}, params, {_iconSet: iconSet});
                } else if (iconSet) {
                    params = {_iconSet: iconSet, force: true};
                }
            } catch (error) {
                // storage not ready; fall through and let the original decide
            }
            return upstream.call(this, params);
        };
        icon.setIcon._localSetWired = true;

        return true;
    }

    // buttonIcon is created during initMisc(), which runs after this file.
    if (!patchButtonIcon()) {
        const t = setInterval(() => {
            if (patchButtonIcon()) {
                clearInterval(t);
            }
        }, 50);
        setTimeout(() => clearInterval(t), 10000);
    }


    // ---- Default the toolbar icon set to "material" ----------------------
    //
    // DEFAULT_SETTINGS is a plain object literal in checkerPlusForGmail.js. It is
    // only consulted for keys that are absent from storage, so adjusting it here
    // sets the default for fresh installs without touching a saved choice.
    function applyDefaultIconSet() {
        const defaults = globalThis.DEFAULT_SETTINGS;
        if (!defaults || defaults._localIconDefault) {
            return false;
        }
        defaults._localIconDefault = true;

        if (!defaults.icon_set || defaults.icon_set === "default") {
            defaults.icon_set = "material";
        }
        return true;
    }

    if (!applyDefaultIconSet()) {
        const t = setInterval(() => {
            if (applyDefaultIconSet()) {
                clearInterval(t);
            }
        }, 25);
        setTimeout(() => clearInterval(t), 5000);
    }


    // ---- Honour the user's badge colour even with zero unread ------------
    //
    // updateBadge() hardcodes a grey-blue badge background on the "no unread"
    // branch:
    //     chrome.action.setBadgeBackgroundColor({ color: [110, 140, 180, 255] });
    // so a colour picked in settings silently reverts whenever the inbox hits
    // zero, and only reapplies once mail arrives. Stamp the stored colour over
    // that call so what you choose is what you see, always.
    function patchBadgeColour() {
        if (!chrome?.action?.setBadgeBackgroundColor || chrome.action.setBadgeBackgroundColor._localWired) {
            return false;
        }
        chrome.action.setBadgeBackgroundColor._localWired = true;

        const upstream = chrome.action.setBadgeBackgroundColor.bind(chrome.action);

        chrome.action.setBadgeBackgroundColor = function (details) {
            // the hardcoded fallback is exactly this tuple
            const isHardcodedFallback = Array.isArray(details?.color)
                && details.color.length === 4
                && details.color[0] === 110
                && details.color[1] === 140
                && details.color[2] === 180;

            if (isHardcodedFallback) {
                // Prefer the value the user picked; fall back to the sensible
                // default so we never leave the badge unpainted.
                const chosen = globalThis.__localBadgeColour || "#d32f2f";
                details = Object.assign({}, details, {color: chosen});
            } else if (typeof details?.color === "string") {
                // cache whatever the extension decided is authoritative
                globalThis.__localBadgeColour = details.color;
            }

            return upstream(details);
        };

        // Seed the cache from storage so the very first zero-unread update uses
        // the saved colour rather than waiting for a real one to arrive.
        try {
            if (globalThis.storage?.get) {
                storage.get("unreadCountBackgroundColor").then(color => {
                    if (color) {
                        globalThis.__localBadgeColour = color;
                    }
                }).catch(() => {});
            }
        } catch (error) {
            // storage not ready yet; the cache fills on first real colour
        }

        return true;
    }

    if (!patchBadgeColour()) {
        const t = setInterval(() => {
            if (patchBadgeColour()) {
                clearInterval(t);
            }
        }, 50);
        setTimeout(() => clearInterval(t), 5000);
    }

    if (globalThis.Controller) {
        patchController();
    } else {
        // Controller() is called during initMisc; poll briefly for it to appear.
        let tries = 0;
        const timer = setInterval(() => {
            if (globalThis.Controller) {
                patchController();
                clearInterval(timer);
            } else if (++tries > 100) {
                clearInterval(timer);
            }
        }, 50);
    }
})();
