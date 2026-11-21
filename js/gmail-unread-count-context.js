(() => {
    'use strict';

    const SCRIPT_ID = Math.random().toString(36).substring(2, 9);
    const SCRIPT_ATTR = 'gmailUnreadCountContextId';
    let unreadCountInterval;

    function cleanUp() {
        console.log("Cleaning unread count script...");
        clearInterval(unreadCountInterval);
    }

    function handleInjection() {
        const html = document.documentElement;
        const existingId = html.dataset[SCRIPT_ATTR];

        if (existingId) {
            // We found a zombie! Send a signal to the old script to die.
            //console.log(`New script (${SCRIPT_ID}) replacing old script (${existingId})`);
            console.log("Signaling existing script to clean up...");
            window.dispatchEvent(new CustomEvent('EXT_CLEANUP_' + existingId));
        }

        // Set the DOM flag to THIS script's ID
        html.dataset[SCRIPT_ATTR] = SCRIPT_ID;

        // Set up a listener for when the NEXT reload happens
        window.addEventListener('EXT_CLEANUP_' + SCRIPT_ID, () => {
            console.log("Shutting down orphaned script...");
            cleanUp();
        }, { once: true });
    }

    handleInjection();

    console.log("Detect unread count...");

    var lastUnreadCount = 0;

    // Function to extract unread count from the Inbox label
    function getUnreadCount() {
        let inboxLabel = document.querySelector('a[href*="#inbox"].J-Ke');
        if (!inboxLabel) return 0;

        let label = inboxLabel.getAttribute("aria-label");
        if (!label) return 0;
        let match = label.match(/\b\d+\b/);
        return match ? parseInt(match[0], 10) : 0;
    }

    let debounceTimeout;

    clearInterval(unreadCountInterval);
    unreadCountInterval = setInterval(() => {
        let unreadCount = getUnreadCount();
        if (unreadCount !== lastUnreadCount) {
            console.log("Unread count changed:", unreadCount);
            lastUnreadCount = unreadCount;

            if (debounceTimeout) {
                clearTimeout(debounceTimeout);
            }
            debounceTimeout = setTimeout(() => {
                try {
                    chrome.runtime.sendMessage({ command: "unread-count-change-gmail-ui", unreadCount: unreadCount });
                } catch (error) {
                    console.log("Error with sendMessage", error);
                }
            }, 1000);
        }
    }, 1000);
})();