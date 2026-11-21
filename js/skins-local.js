// Local build: bundled skin catalogue.
// Replaces the network call to the author's server (Controller.getSkins)
// with the local skins/skins.json, plus an optional refresh from the server
// for the Admin tab.

"use strict";

globalThis.SkinsSource = (function () {
    const BUNDLED_URL = "skins/skins.json";
    const REMOTE_URL = "https://apps.jasonsavard.com/controller.php";

    let cache = null;
    let cacheTime = 0;
    const CACHE_TTL = 60 * 1000; // re-read the bundled file at most once a minute

    async function loadBundled(force) {
        const now = Date.now();
        if (!force && cache && (now - cacheTime) < CACHE_TTL) {
            return cache;
        }

        try {
            const response = await fetch(chrome.runtime.getURL(BUNDLED_URL));
            if (!response.ok) {
                throw new Error("HTTP " + response.status);
            }
            const skins = await response.json();
            if (!Array.isArray(skins)) {
                throw new Error("skins.json is not an array");
            }
            cache = skins;
            cacheTime = now;
            return skins;
        } catch (error) {
            console.warn("could not load bundled skins: " + error);
            return cache || [];
        }
    }

    // Same shape as the old Controller.getSkins(ids, timeMin)
    async function getSkins(ids) {
        let skins = await loadBundled();
        if (ids && ids.length) {
            skins = skins.filter(skin => ids.includes(skin.id));
        }
        return skins;
    }

    // Admin: pull the live catalogue and report what changed, without writing anything.
    // Returns a summary so the caller can show it in the UI.
    async function refreshFromServer() {
        const data = {
            action: "getSkins",
            extension: "gmail",
            misc: "admin-refresh"
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort({reason: "timeout"}), 10000);

        let remote;
        try {
            const response = await fetch(REMOTE_URL + "?" + new URLSearchParams(data), {
                headers: {"item-id": "gmail"},
                signal: controller.signal
            });
            if (!response.ok) {
                throw new Error("HTTP " + response.status);
            }
            remote = await response.json();
        } finally {
            clearTimeout(timeoutId);
        }

        if (!Array.isArray(remote)) {
            throw new Error("unexpected response from server");
        }

        const local = await loadBundled(true);
        const localById = new Map(local.map(skin => [skin.id, skin]));

        const added = [];
        const changed = [];
        for (const skin of remote) {
            const existing = localById.get(skin.id);
            if (!existing) {
                added.push(skin);
            } else if (JSON.stringify(existing) !== JSON.stringify(skin)) {
                changed.push(skin);
            }
        }

        const remoteIds = new Set(remote.map(skin => skin.id));
        const removed = local.filter(skin => !remoteIds.has(skin.id));

        return {
            remote,
            localCount: local.length,
            remoteCount: remote.length,
            added,
            changed,
            removed
        };
    }

    function invalidateCache() {
        cache = null;
        cacheTime = 0;
    }

    return {getSkins, refreshFromServer, loadBundled, invalidateCache};
})();
