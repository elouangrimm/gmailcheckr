# Gmail Checkr Codebase Guide

This guide provides a detailed overview of the **Gmail Checkr** extension codebase, designed to help you modify UI elements, add features, and understand the core logic.

## 1. Project Structure Overview

The project follows a standard Chrome Extension architecture (Manifest V3).

| File/Directory | Purpose |
| :--- | :--- |
| **`manifest.json`** | The blueprint. Defines entry points, permissions, and icons. Start here to see what scripts run where. |
| **`js/background.js`** | **The Brain.** Runs in the background (Service Worker). Handles alarms, polling, push notifications (GCM), and global state. |
| **`js/common.js`** | **Shared Logic.** Contains utility functions, OAuth logic (the custom manual flow is here), constants, and global helpers used by all pages. |
| **`popup.html`** & **`js/popup.js`** | **The UI.** What you see when clicking the toolbar button. Handles email rendering, tabs, and user interaction. |
| **`options.html`** & **`js/options.js`** | **Settings.** The configuration page. Uses a declarative system for saving settings. |
| **`js/checkerPlusForGmail.js`** | **Gmail API Wrapper.** Contains classes and methods for interacting with Gmail (fetching threads, messages, labels). |
| **`css/`** | Stylesheets. `jdom.css` is the core library, `popup.css` (if exists) or inline styles in HTML define the look. |

---

## 2. User Interface Customization

### Toolbar Button & Badge
*   **Where:** `js/background.js` (logic) and `manifest.json` (default icon).
*   **Logic:** The `updateBadge()` function in `js/background.js` coordinates the icon update. It uses `chrome.action.setBadgeText`.
*   **Events:** `chrome.action.onClicked` in `background.js` handles what happens when you click the icon (e.g., opening popup vs. opening Gmail tab).

### Popup Window (`popup.html`)
*   **Structure:** It's a single HTML page that dynamically renders content.
*   **Modifying Styles:** CSS is largely in `<style>` blocks within `popup.html` or `css/jdom.css`.
*   **Key Functions (`js/popup.js`):**
    *   `initPopupView()`: Decides whether to show the "Inbox View" (iframe) or "Checker Plus View" (list of emails).
    *   `initTabs()`: Renders the category tabs (Inbox, Social, etc.).
    *   `executeMailAction()`: Handles archive, delete, mark as read actions.

### Options Page (`options.html`)
*   **Structure:** Sections are divided by tabs (`<div class="page" value="...">`).
*   **Adding a Setting:**
    1.  Add an input element in `options.html`.
    2.  Add the attribute `indexdb-storage="YOUR_SETTING_NAME"`.
    3.  **Magic:** `js/options.js` automatically binds these inputs to `storage.get/set`. No extra JS needed for simple settings!

---

## 3. Core Logic & Events

### Code on Launch / Startup
*   **Where:** `js/background.js`
*   **Event:** `chrome.runtime.onStartup` and `chrome.runtime.onInstalled`.
*   **Hook:** Place code inside `init("onStartup")` to run every time the browser starts.

### Polling & Updates
*   **Where:** `js/background.js`
*   **Mechanism:**
    *   **Alarms:** `chrome.alarms.onAlarm` handles periodic tasks like `Alarms.CHECK_EMAILS` or `Alarms.EVERY_MINUTE`.
    *   **Push (GCM):** `chrome.gcm.onMessage` triggers real-time updates without polling.
*   **Hook:** To run code every X minutes, create an alarm in `background.js` and add a case to the `onAlarm` listener.

### Notifications
*   **Where:** `js/background.js` -> `showMessageNotification()` or `chrome.notifications.create()`.
*   **Customization:**
    *   **Desktop:** standard Chrome notifications.
    *   **Voice:** uses `chrome.tts` (invoked in `background.js` and `options.js`).
*   **Hook:** Look for `showNotificationTest` in `js/options.js` to see how options trigger test notifications.

---

## 4. Common "How-To" Tasks

### How to change the Toolbar Button icon?
1.  Go to `js/background.js`.
2.  Find `updateBadge()`.
3.  Modify the logic that calls `chrome.action.setIcon` or `chrome.action.setBadgeText`.

### How to add a new "Option"?
1.  Open `options.html`.
2.  Find the relevant section (e.g., `<div id="generalPage"...>`).
3.  Add your HTML:
    ```html
    <label>
        <span class="label-text">My New Setting</span>
        <input type="checkbox" indexdb-storage="myNewSettingResult">
    </label>
    ```
4.  Open `js/common.js` (or wherever default settings are) and add `myNewSettingResult` to the default settings object if needed for immediate availability.

### How to execute code when a new email arrives?
1.  Open `js/background.js`.
2.  Find `onRealtimeMessageReceived` (for Push) or `checkEmails` (for Polling).
3.  Look for where `unreadCount` changes or `showNotification` is called.
4.  Insert your function there: `myCustomFunction(email)`.

### How to debug the Background Script?
1.  Go to `chrome://extensions`.
2.  Click "Service Worker" under "Gmail Checkr".
3.  A separate DevTools window opens. This is where `console.log` from `background.js` appears.

---

## 5. Critical Files Map

*   **`js/common.js`**: `manualLaunchWebAuthFlow` (Your custom OAuth fix is here!), `oauthFetch`.
*   **`js/background.js`**: Notification clicks, Alarms, Startup logic.
*   **`manifest.json`**: Permissions (add `host_permissions` here if fetching new URLs).
