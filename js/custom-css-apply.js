// Local build: applies user-authored custom CSS (from the Skins & Themes editor)
// to the popup and options page. Stored under storage key "customCss".

"use strict";

globalThis.CustomCss = (function () {
    const STYLE_ID = "userCustomCss";
    const STORAGE_KEY = "customCss";
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
        // `storage` comes from common.js. It must be init()ed before any get(),
        // otherwise getObjectStore() throws "DB not opened - try reinstalling"
        // and that surfaces to the user as "Corrupt browser profile".
        if (typeof storage === "undefined" || !storage?.get) {
            return;
        }
        try {
            if (storage.init) {
                await storage.init("customCssApply");
            }

            // Two independent sources, both legitimately user-authored:
            //  - customCss  : the inline editor on Options > Skins & Themes
            //  - customSkin : the "custom" entry in the popup's skin dialog (css + image)
            const inlineCss = (await storage.get(STORAGE_KEY)) || "";
            const popupSkin = await storage.get("customSkin");
            const skinCss = popupSkin?.css || "";

            apply([skinCss, inlineCss].filter(Boolean).join("\n"));
        } catch (error) {
            console.warn("could not apply custom css: " + error);
        }
    }

    // Re-apply whenever the editor saves, without needing a reload.
    function listenForChanges() {
        if (chrome.storage?.onChanged) {
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area == "local" && (changes[STORAGE_KEY] || changes.customSkin)) {
                    loadAndApply();
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

    return {init, apply, loadAndApply, STYLE_ID, STORAGE_KEY};
})();

CustomCss.init();
