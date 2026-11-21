// Local build: storage self-healing.
//
// Problem this solves: if the IndexedDB connection is ever lost (extension
// reloaded while it was open, or a transaction aborts), `wrappedDB.opened`
// stays true but `wrappedDB.db` is a dead handle. Every subsequent read then
// throws from getObjectStore(), which the generic handler surfaces to the user
// as "Corrupt browser profile" — even though nothing is actually corrupt.
// Re-opening the DB fixes it, which is why reloading the extension worked.
//
// This module retries a failed storage operation once against a fresh
// connection before letting the error reach the UI.

"use strict";

(function () {
    const MAX_REOPEN_ATTEMPTS = 3;

    // The DB handle and its flag live at module scope in common.js as
    // `wrappedDB`. Classic scripts share one global scope, but `const` at top
    // level of a classic script does NOT become a globalThis property, so we
    // cannot reach it directly. Instead we re-open through the public API that
    // common.js already exposes: storage.init() returns the existing promise or
    // resolves immediately when loaded, so we reset the handle via a fresh
    // wrappedDB.open() call made available on globalThis by this module.
    let reopenPromise = null;

    // Errors arrive here already re-wrapped by throwDBError() as
    //   Error("Corrupt browser profile...", {cause: <original>})
    // so the real diagnosis lives on `.cause`, and possibly further down that
    // chain. Walk it.
    function chainsToDeadConnection(error) {
        let current = error;
        let depth = 0;

        while (current && depth++ < 5) {
            const name = current.name || "";
            const text = (current.message || String(current) || "").toLowerCase();

            if (name == "InvalidStateError"
                || name == "TransactionInactiveError"
                || name == "DatabaseClosedError"
                || name == "AbortError") {
                return true;
            }

            if (text.includes("db not opened")
                || text.includes("try reinstalling")
                || text.includes("database connection is closing")
                || text.includes("connection is closing")
                || text.includes("notopen")
                || text.includes("has been closed")
                || text.includes("the database connection")) {
                return true;
            }

            current = current.cause;
        }

        return false;
    }

    // Re-open the database and swap the handle back into the storage object.
    async function reopenDatabase() {
        if (reopenPromise) {
            return reopenPromise;
        }

        reopenPromise = (async () => {
            try {
                console.warn("[local] storage: attempting to re-open the database");

                // Force storage.init() to run again by clearing its memoised
                // promises. These are plain properties on the instance, so they
                // are reachable even though the class internals are not.
                const store = globalThis.storage;
                if (!store) {
                    return false;
                }

                store.openingPromise = null;
                store.loaded = false;

                // `wrappedDB` is declared with `const` at the top level of
                // common.js. That creates a binding in the shared global lexical
                // environment, so it is reachable by bare name from here even
                // though it is not a property of globalThis.
                if (typeof wrappedDB != "undefined" && wrappedDB.open) {
                    wrappedDB.opened = false;
                    wrappedDB.db = null;
                }

                await store.init("selfHeal");
                console.warn("[local] storage: re-open succeeded");
                return true;
            } catch (error) {
                console.error("[local] storage: re-open failed", error);
                return false;
            } finally {
                setTimeout(() => {
                    reopenPromise = null;
                }, 1000);
            }
        })();

        return reopenPromise;
    }

    // Wrap the storage read/write methods so one dead-connection error triggers
    // a transparent retry instead of a "corrupt profile" banner.
    function hardenStorageApi() {
        const store = globalThis.storage;
        if (!store || store._localHardened) {
            return false;
        }
        store._localHardened = true;

        ["get", "getRaw", "set", "deleteSetting", "remove"].forEach(method => {
            const original = store[method];
            if (typeof original != "function") {
                return;
            }

            store[method] = async function (...args) {
                try {
                    if (method == "get" || method == "getRaw") {
                        // a read before init is the single most common cause of
                        // the bogus "corrupt profile" banner
                        if (store.init && !store.loaded) {
                            await store.init("autoBeforeRead");
                        }
                    }
                    return await original.apply(this, args);
                } catch (error) {
                    if (!chainsToDeadConnection(error)) {
                        throw error;
                    }

                    console.warn(`[local] storage.${method} failed, retrying after re-open`, error);

                    let reopened = false;
                    for (let attempt = 0; attempt < MAX_REOPEN_ATTEMPTS && !reopened; attempt++) {
                        reopened = await reopenDatabase();
                    }

                    if (!reopened) {
                        throw error;
                    }

                    return await original.apply(this, args);
                }
            };
        });

        return true;
    }

    if (!hardenStorageApi()) {
        // storage is created at the end of common.js; this script loads right
        // after it, but be defensive in case of ordering changes.
        let tries = 0;
        const timer = setInterval(() => {
            if (hardenStorageApi() || ++tries > 100) {
                clearInterval(timer);
            }
        }, 50);
    }
})();
