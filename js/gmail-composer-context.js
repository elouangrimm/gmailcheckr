// Copyright Jason Savard - AI Compose Feature

(() => {
    'use strict';

    // Generate a unique ID for THIS script execution
    const SCRIPT_ID = Math.random().toString(36).substring(2, 9);
    const SCRIPT_ATTR = 'gmailComposeContextId';
    let aiComposeObserver;

    function cleanUp() {
        if (aiComposeObserver) {
            console.log("Disconnecting observer...");
            aiComposeObserver.disconnect();
            aiComposeObserver = null;
        }

        console.log("Abort button event listeners...");
        aiComposeAbortController.abort();

        console.log("Removing Compose button...");
        document.querySelectorAll(".aiComposeButton").forEach(button => {
            button.remove();
        });
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

    // must declare as var for context scripts to load again
    var composeType;
    var transferParameters = {};

    let aiComposeAbortController = new AbortController();

    const HEADER_AND_MESSAGE_AND_FOOTER_AREA_SELECTOR = ".M9";
    const BOTTOM_AREA_SELECTOR = ".HE"; // Send button, mic etc.
    const COMPOSE_AREA_SELECTOR = ".Am.Al.editable.LW-avf";

    var $aiComposeButton;

    function getComposeType($messageAndFooterArea) {
        const $subjectInput = $messageAndFooterArea?.querySelector('input[name="subjectbox"]');
        const subjectVisible = !!$subjectInput && $subjectInput.offsetParent !== null;
        return subjectVisible ? "new" : "reply";
    }

    function removeSignaturesAndQuotations($node) {
        const clonedMessage = $node.cloneNode(true);
        const selectorsToRemove = [
            '.adL', // seems to be used for some quoted sections
            '.ajR', // used for "Show trimmed content" ellipsis button
            '.gmail_quote', // Gmail's standard quoted content
            '.gmail_quote_container', // Gmail quote container
            '.gmail_signature_prefix', // Gmail signature prefix
            'blockquote', // common for quoted content
            '[data-smartmail="gmail_signature"]', // Gmail signatures
            '[id*="divRplyFwdMsg"]', // Outlook mobile signatures
            '[id*="ms-outlook-mobile-signature"]' // Another possible Outlook mobile signature pattern
        ];
        selectorsToRemove.forEach(selector => {
            clonedMessage.querySelectorAll(selector).forEach(el => el.remove());
        });
        return clonedMessage;
    }

    function getEmailData() {
        const responseObj = {};

        responseObj.subject = document.querySelector("div[role='main'] .hP");
        if (responseObj.subject) {
            responseObj.subject = responseObj.subject.textContent.trim();
        }

        const messageElements = Array.from(
            document.querySelectorAll('div[role="main"] .gs .ii:not([style*="display: none"])')
        );
        
        if (messageElements.length === 0) {
            return responseObj;
        }

        // Prefer messages that appear before the compose window
        let candidates = messageElements;

        const $composeArea = document.querySelector(COMPOSE_AREA_SELECTOR)
        if ($composeArea) {
            const beforeCompose = messageElements.filter($msg =>
                Boolean($composeArea.compareDocumentPosition($msg) & Node.DOCUMENT_POSITION_PRECEDING)
            );

            if (beforeCompose.length) {
                candidates = beforeCompose;
            }

            responseObj.draft = removeSignaturesAndQuotations($composeArea).innerHTML.trim() || '';
        }

        const lastMessage = candidates[candidates.length - 1];
        responseObj.promptMessageId = lastMessage.closest("[data-legacy-thread-id]")?.getAttribute("data-legacy-thread-id")
            || lastMessage.closest("[data-legacy-message-id]")?.getAttribute("data-legacy-message-id");
        
        // Get the last visible message
        //const lastMessage = messageElements[messageElements.length - 1];

        responseObj.replyMessageAndQuotations = lastMessage.textContent.trim() || '';

        // Remove quoted text (Gmail uses .gmail_quote for quoted content)
        const clonedMessage = removeSignaturesAndQuotations(lastMessage);

        // Also remove any "On [date] [person] wrote:" headers
        const text = clonedMessage.textContent.trim();
        const lines = text.split('\n');
        
        // Filter out lines that look like "On ... wrote:" 
        const filteredLines = lines.filter(line => !line.match(/^On\s+.+\s+wrote:/i));
        
        responseObj.replyMessageOnly = filteredLines.join('\n').trim() || '';

        // Remove leading newlines and limit consecutive newlines to max 2
        responseObj.replyMessageOnly = responseObj.replyMessageOnly
            .replace(/^\n+/, '')  // Remove all leading newlines
            .replace(/\n{3,}/g, '\n\n');  // Replace 3+ consecutive newlines with exactly 2

        responseObj.replyMessageOnlyHTML = clonedMessage.innerHTML.trim() || '';

        return responseObj;
    }

    function addAIComposeButtons() {
        const $messageAndFooterAreas = document.querySelectorAll(HEADER_AND_MESSAGE_AND_FOOTER_AREA_SELECTOR);
        
        //console.log("addAIComposeButtons")
        if ($messageAndFooterAreas.length) {
            $messageAndFooterAreas.forEach($messageAndFooterArea => {
                const $bottomArea = $messageAndFooterArea.querySelector(BOTTOM_AREA_SELECTOR);
                const $composeArea = $messageAndFooterArea.querySelector(COMPOSE_AREA_SELECTOR);
                
                // Make sure not already added and compose area exists
                //console.log("addAIComposeButtons2")

                if ($bottomArea && $composeArea && !$bottomArea.querySelector(".aiComposeButton")) {

                    //console.log("addAIComposeButtons3")
                    const checkerPlusComposeTitle = localStorage.getItem("checkerPlusComposeTitle") || "Checker Plus Compose";
                    console.log("Adding Checker Plus Compose button... " + checkerPlusComposeTitle);

                    // Create AI reply button
                    $aiComposeButton = document.createElement("td");
                    $aiComposeButton.classList.add("aiComposeButton", "oc", "gU");
                    $aiComposeButton.setAttribute("data-tooltip", checkerPlusComposeTitle);
                    $aiComposeButton.setAttribute("aria-label", checkerPlusComposeTitle);

                    const $outerDiv = document.createElement("div");
                    $outerDiv.classList.add("J-Z-I", "J-J5-Ji");
                    $outerDiv.setAttribute("aria-selected", "false");
                    $outerDiv.setAttribute("role", "button");
                    $outerDiv.setAttribute("style", "-webkit-user-select: none;");

                    const $outerDiv2 = document.createElement("div");
                    $outerDiv2.classList.add("J-J5-Ji", "J-Z-I-Kv-H");

                    const $outerDiv3 = document.createElement("div");
                    $outerDiv3.classList.add("J-J5-Ji", "J-Z-I-J6-H");

                    const $aiImage = document.createElement("div");
                    $aiImage.classList.add("dv", "aiComposeImage");
                    // Using the "auto_awesome" Material icon style
                    $aiImage.innerHTML = '✨';
                    $aiImage.style.fontSize = '20px';
                    $aiImage.style.lineHeight = '20px';
                    $aiImage.style.backgroundImage = 'none';

                    $outerDiv3.append($aiImage);
                    $outerDiv2.append($outerDiv3);
                    $outerDiv.append($outerDiv2);
                    $aiComposeButton.append($outerDiv);

                    //$aiComposeButton.removeEventListener("click", handleAIComposeButtonClick);
                    $aiComposeButton.addEventListener("click", async (event) => {
                        console.log("click");
                        event.preventDefault();
                        event.stopPropagation();

                        if (!(event.currentTarget instanceof Element)) {
                            return;
                        }

                        const $composeWindow = event.currentTarget.closest(HEADER_AND_MESSAGE_AND_FOOTER_AREA_SELECTOR);
                        composeType = getComposeType($composeWindow);

                        const emailData = getEmailData();
                        if (!emailData) {
                            alert('No email content found to generate a reply.');
                            return;
                        }

                        emailData.command = 'openAIPrompt';
                        emailData.composeType = composeType;
                        if (composeType === "new" && !$composeWindow.dataset.checkerPlusPromptId) {
                            $composeWindow.dataset.checkerPlusPromptId = crypto.randomUUID();
                        }
                        emailData.promptIdentity = JSON.stringify([
                            location.origin + location.pathname,
                            composeType,
                            composeType === "new"
                                ? $composeWindow.dataset.checkerPlusPromptId
                                : emailData.promptMessageId || location.hash.split("?")[0]
                        ]);

                        try {
                            const response = await chrome.runtime.sendMessage(emailData);
                            console.log("Response from background script:", response);
                            if (response?.error) {
                                alert(response.error);
                            }
                        } catch (error) {
                            console.error('Error communicating with background script:', error);
                            if (error.message.includes('listener indicated an asynchronous response')) {
                                // ignore this error
                            } else {
                                // Error: Extension context invalidated
                                alert("Reload this page to use the AI Compose feature.");
                            }
                        }
                    }, { signal: aiComposeAbortController.signal });

                    
                    // Insert button after the first button in the bottom area
                    const firstButton = $bottomArea.querySelector(".oc.gU");
                    if (firstButton) {
                        firstButton.before($aiComposeButton);
                    } else {
                        $bottomArea.prepend($aiComposeButton);
                    }

                    
                }
            });
        }
    }

    function insertTextIntoComposeArea(text) {
        let $composeArea = document.querySelector(COMPOSE_AREA_SELECTOR);
        if ($composeArea) {

            // when composing a new email, the editable area is inside another div because the signature is below and we don't want remove that
            if (composeType === "new") {
                $composeArea = $composeArea.querySelector("div");
            }

            // Clear the compose area
            $composeArea.innerHTML = '';
            
            // Split text by newlines and insert as text nodes with <br> elements
            const lines = text.split('\n');
            lines.forEach((line, index) => {
                const textNode = document.createTextNode(line);
                $composeArea.appendChild(textNode);
                
                // Add <br> after each line except the last one
                if (index < lines.length - 1) {
                    const br = document.createElement('br');
                    $composeArea.appendChild(br);
                }
            });
            
            // Trigger input event to ensure Gmail recognizes the change
            const inputEvent = new Event('input', { bubbles: true });
            $composeArea.dispatchEvent(inputEvent);
            
            // Focus the compose area
            $composeArea.focus();
            
            // Move cursor to the end of the text
            const range = document.createRange();
            const selection = window.getSelection();
            range.selectNodeContents($composeArea);
            range.collapse(false); // false means collapse to end
            selection.removeAllRanges();
            selection.addRange(range);
            
            return true;
        }
        return false;
    }

    // Listen for messages from the extension
    console.log("listen for messages...");
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log("Received message in content script:", message.command);

        if (sender.id !== chrome.runtime.id) {
            console.warn("Received message from unknown sender:", sender);
            return;
        }

        if (message.command === "initCheckerPlusCompose") {
            console.log("Init Checker Plus Compose:", message);
            localStorage.setItem("checkerPlusComposeTitle", message.strings?.checkerPlusCompose);
            transferParameters = message;
            scheduleAddAIComposeButtons();
        } else if (message.command === "insertAIDraft") {
            const success = insertTextIntoComposeArea(message.responseText);
            sendResponse({ success: success });
        } else if (message.command === "removeAICompose") {
            console.log("Removing Checker Plus Compose buttons and observers...");
            cleanUp();
            sendResponse({ success: true });
        }
    });

    console.log('Checker Plus Compose feature enabled, initializing... ' + location.href);

    const scheduleAddAIComposeButtons = (() => {
        let pending = false;

        return () => {
            if (pending) {
                return;
            }
            pending = true;
            requestAnimationFrame(() => {
                pending = false;
                addAIComposeButtons();
            });
        };
    })();

    const observeRoot = document.body; //document.querySelector('div[role="main"]') || document.body;
    //console.log("observeRoot", observeRoot);

    aiComposeObserver = new MutationObserver(() => {

        // If the DOM flag no longer matches our unique ID, we are a zombie.
        if (document.documentElement.dataset[SCRIPT_ATTR] !== SCRIPT_ID) {
            console.log("Detected orphaned script, stopping Checker Plus Compose observers and buttons...");
            cleanUp();
            return;
        }

        scheduleAddAIComposeButtons();
    });

    aiComposeObserver.observe(observeRoot, {
        childList: true,
        subtree: true
    });

    scheduleAddAIComposeButtons();
})();