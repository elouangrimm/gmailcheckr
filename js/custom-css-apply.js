// Local build: applies user-authored custom CSS (from custom-css-editor.html)
// to the popup and options page. The editor writes storage key "customSkin".

"use strict";

globalThis.CustomCss = (function () {
    const STYLE_ID = "userCustomCss";
    let applying = null;

    function apply(css) {
        let $style = document.getElementById(STYLE_ID);

        if (!css || !css.trim()) {
            $style?.remove();
            return;
        }

        if (!$style) {
            $style = document.createElement("style");
            $style.id = STYLE_ID;
            (document.head || document.documentElement).appendChild($style);
        }

        $style.textContent = css;
    }

    async function loadAndApply() {
        // `storage` comes from common.js; guard so this file never breaks a page
        // that loads it without that dependency (or during early teardown).
        if (typeof storage === "undefined" || !storage?.get) {
            return;
        }
        try {
            const customSkin = await storage.get("customSkin");
            apply(customSkin?.css);
        } catch (error) {
            console.warn("could not apply custom css: " + error);
        }
    }

    // Re-apply whenever the editor saves, without needing a reload.
    function listenForChanges() {
        if (chrome.storage?.onChanged) {
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area == "local" && changes.customSkin) {
                    apply(changes.customSkin.newValue?.css);
                }
            });
        }
    }

    function init() {
        if (applying) {
            return applying;
        }
        applying = (async () => {
            // storage may not be ready at document_start; wait for DOM so `storage` exists.
            if (document.readyState == "loading") {
                await new Promise(resolve => document.addEventListener("DOMContentLoaded", resolve, {once: true}));
            }
            await loadAndApply();
            listenForChanges();
        })();
        return applying;
    }

    return {init, apply, loadAndApply, STYLE_ID};
})();

CustomCss.init();
