"use strict";

function closeWindow() {
    setTimeout(() => {
        document.body.append(getMessage("done"), createBR(), createBR(), `You can close this window!`);

        try {
            window.close();
        } catch (error) {
            console.warn("couldn't close window: ", error);
        }
    }, 500);
}

(async () => {
    await initUI();

    byId("email-account").textContent = getUrlValue("email");

    onClick("#grant-access", async function () {
        const tokenResponse = await requestPermission({
            email: getUrlValue("email"),
            useGoogleAccountsSignIn: true
        });

        if (tokenResponse) {
            await sendMessageToBG("initOauthHybridAccount", {tokenResponse: tokenResponse});
            hideLoading();
            try {
                await chrome.action.openPopup();
            } catch (error) {
                console.error("error opening popup", error);
                // for firefox cause it requires a user gesture
                await niceAlert("Click the extension icon to open the popup window");
                chrome.action.openPopup();
            }
            await niceAlert("Click to close window", true);
            closeWindow();
        }
    });

})();