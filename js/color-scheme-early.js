// Local build: pre-paint colour-scheme hint.
// jdom.js resolves the real setting from IndexedDB, which is async — so the page
// used to paint light and then flip to dark (FOUC). storage.get() is async and
// unusable this early, so we keep a mirror of the resolved scheme in localStorage
// (synchronous) and apply it before first paint. jdom.js refreshes the mirror.

"use strict";

(function () {
    try {
        const cached = localStorage.getItem("_colorSchemeCache");
        let scheme;

        if (cached === "dark" || cached === "light") {
            scheme = cached;
        } else {
            // no mirror yet: fall back to the OS preference so we are never badly wrong
            scheme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        }

        document.documentElement.setAttribute("color-scheme", scheme);
    } catch (error) {
        // never let theming break page load
    }
})();
