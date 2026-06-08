// Copyright Jason Savard
"use strict";

function closeWindow() {
    //document.body.append(getMessage("done"));
    const clipboardIcon = document.getElementById("clipboard-icon");
    if (clipboardIcon) {
        clipboardIcon.style.display = "block";
        clipboardIcon.classList.add("flash");
    }

    setTimeout(async () => {
        const windowResponse = await chrome.windows.getCurrent();
        chrome.windows.remove(windowResponse.id);

        setTimeout(() => {
            document.body.append(createBR(), createBR(), `You can close this window!`);
    
            try {
                window.close();
            } catch (error) {
                console.warn("couldn't close window: ", error);
            }
        }, 500);
    }, 500);
}

docReady(() => {
    const otpCode = getUrlValue("otpCode");
    const otpCodeField = byId("otp-code");
    otpCodeField.value = otpCode;
    otpCodeField.focus();
    otpCodeField.select();
    document.execCommand("copy");

    closeWindow();
});