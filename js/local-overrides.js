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
