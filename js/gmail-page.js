if (!globalThis.gmailPageLoaded) {
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

    clearInterval(globalThis.unreadCountInterval);
    globalThis.unreadCountInterval = setInterval(() => {
        let unreadCount = getUnreadCount();
        if (unreadCount !== lastUnreadCount) {
            console.log("Unread count changed:", unreadCount);
            lastUnreadCount = unreadCount;

            if (globalThis.debounceTimeout) {
                clearTimeout(globalThis.debounceTimeout);
            }
            globalThis.debounceTimeout = setTimeout(() => {
                try {
                    chrome.runtime.sendMessage({ command: "unread-count-change-gmail-ui", unreadCount: unreadCount });
                } catch (error) {
                    console.log("Error with sendMessage", error);
                }
            }, 1000);
        }
    }, 1000);

    globalThis.gmailPageLoaded = true;
} else {
    console.log("gmail-page.js script already loaded.");
}