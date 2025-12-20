"use strict";

var offScreenJSLoaded = true;

async function offlineOnlineChanged(e) {
    console.log("offscreen detected: " + e.type + " " + new Date());
    chrome.runtime.sendMessage({ command: "online-status", status: e.type });
}

globalThis.addEventListener('offline', offlineOnlineChanged);
globalThis.addEventListener('online', offlineOnlineChanged);

let audioPlayer;
let audioMessage;
let audioSendResponse;

// MUST declare all variables inside here as global ie. changedSrc and audioEventTriggered
function audioStopped(event) {
    console.log("audioStopped", event);
    // ignore the abort event when we change the .src
    if (!(audioMessage.data.changedSrc && event.type == "abort") && !globalThis.audioEventTriggered) {
        globalThis.audioEventTriggered = true;
        audioSendResponse();
    }
}

function loadImage(image) {
    return new Promise((resolve, reject) => {
        image.onload = () => {
            resolve();
        }
        image.onerror = event => {
            reject(event);
        }
    });
}

function convertGmailPrintHtmlToText(node) {
	// removing font tags because Gmail usuaully uses them for the footer/signature and/or the quoted text in the gmail print html 
	node.querySelectorAll("font[color]").forEach(thisNode => {
		thisNode.remove();
	});

	var html = node.innerHTML;
	
	// replace br with space
	html = html.replace(/<br\s*[\/]?>/gi, " ");
	
	// replace <p> and </p> with spaces
	html = html.replace(/<\/?p\s*[\/]?>/gi, " ");
	
	// add a space before <div>
	html = html.replace(/<\/?div\s*[\/]?>/gi, " ");
	
	// this is usually the greyed out footer/signature in gmail emails, so remove it :)
	//html = html.replace(/<font color=\"#888888\">.*<\/font>/gi, "");
	
	// this is apparently the quoted text
	//html = html.replace(/<font color=\"#550055\">.*<\/font>/gi, "");
	
    const doc = new DOMParser().parseFromString(html, "text/html");
    let text = doc.documentElement.textContent;
	
	// repace new lines with space
	text = text.replace(/\n/g, " ");
	
	// remove 2+ consecutive spaces
	text = text.replace(/\s\s+/g, " ");
	
	return text.trim();
}

globalThis.myOffscreenListener = (message, sender, sendResponse) => {
    try {
        if (message.type != "htmlToText") {
            console.log("message", message);
        }

        if (message.target !== 'offscreen') {
            return false;
        }

        if (message.type == "parse-feed") {
            const parser = new DOMParser();
            const document = parser.parseFromString(message.data, 'text/xml');

            const returnObj = {
                title: document.querySelector('title')?.textContent,
                fullcount: document.querySelector('fullcount')?.textContent,
                entries: [],
            }

            document.querySelectorAll('entry').forEach(entry => {
                const entryObj = {
                    id: entry.querySelector('id').textContent,
                    title: entry.querySelector('title')?.textContent,
                    summary: entry.querySelector('summary').textContent,
                    issued: entry.querySelector('issued').textContent,
                    link: entry.querySelector('link')?.getAttribute('href'),
                    author: {
                        name: entry.querySelector('author name').textContent,
                        email: entry.querySelector('author email').textContent,
                    }
                }

                const contributors = entry.querySelectorAll('contributor');
                const contributorArr = [];
                contributors.forEach(contributor => {
                    const contributorObj = {
                        name: contributor.querySelector('name').textContent,
                        email: contributor.querySelector('email').textContent,
                    };
                    contributorArr.push(contributorObj);
                });
                entryObj.contributors = contributorArr;

                returnObj.entries.push(entryObj);
            });

            console.log("returnobj", returnObj);
            sendResponse(returnObj);
        } else if (message.type == "parse-thread") {
            const parser = new DOMParser();
            const document = parser.parseFromString(message.data, 'text/html');

            const returnObj = {};

            const messagesFromDOM = Array.from(document.querySelectorAll(".maincontent .message"));
            if (messagesFromDOM.length && messagesFromDOM.forEach) {
                const messages = [];
                messagesFromDOM.forEach((messageNode, index) => {
                    const message = {
                        fromText: messageNode.querySelector("tr").querySelector("td")?.textContent,
                        tds: Array.from(messageNode.querySelector("tr").querySelectorAll("td")).map(td => td.textContent),
                        emails: Array.from(messageNode.querySelectorAll("tr")[1].querySelectorAll("td div")).map(emailNode => emailNode.textContent)
                    }

                    const gmailPrintContent = messageNode.querySelector("tbody > tr:last-child table td");
                    // remove some styling
                    if (gmailPrintContent) {
                        gmailPrintContent.querySelector("div").removeAttribute("style");
                        gmailPrintContent.querySelector("font").removeAttribute("size");

                        message.content = gmailPrintContent.innerHTML;
                        message.textContent = convertGmailPrintHtmlToText(gmailPrintContent);
                    }

                    /*
                    if (index == returnObj.messages.length - 1) {
                        messageNode.textOnly = 
                    }
                    */

                    messages.push(message);
                });

                returnObj.messages = messages;
                console.log("messages", messages)
            } else {
                returnObj.content = document.documentElement.innerHTML;
                returnObj.textContent = convertGmailPrintHtmlToText(document.documentElement);
            }

            sendResponse(returnObj);
        } else if (message.type == "htmlToText") {
            const html = message.data
                .replace(/<br\s?\/?>/ig,"\n")
                .replace(/<(?:.|\n)*?>/gm, '')
            ;
            const doc = new DOMParser().parseFromString(html, "text/html");
            sendResponse(doc.documentElement.textContent);
        } else if (message.type == "play-sound") {
            audioMessage = message;
            audioSendResponse = sendResponse;

            globalThis.audioEventTriggered = false;

            if (!audioPlayer) {
                audioPlayer = new Audio();
            }

            if (message.data.src) {
                audioPlayer.src = message.data.src;
            }

            if (globalThis.controller) {
                globalThis.controller.abort();
            }
            globalThis.controller = new AbortController();

            audioPlayer.addEventListener("ended", audioStopped, {signal: globalThis.controller.signal });
            audioPlayer.addEventListener("error", audioStopped, {signal: globalThis.controller.signal });
            audioPlayer.addEventListener("abort", audioStopped, {signal: globalThis.controller.signal });
        
            audioPlayer.volume = message.data.volume;
            audioPlayer.play().catch(error => {
                console.warn("might have stopped sign via close notif before play started: " + error, audioPlayer);
                if (/firefox/i.test(navigator.userAgent)) {
                    const prevSrc = audioPlayer.src;
                    audioPlayer.src = "";
                    audioPlayer.pause();
                    audioPlayer.currentTime = 0;
                    setTimeout(() => {
                        console.log("try again", prevSrc)
                        audioPlayer.src = prevSrc
                        audioPlayer.play().catch(error => {
                            console.error("Failed to play sound: " + error);
                            sendResponse();
                        });
                    }, 1000)
                } else {
                    sendResponse();
                }
            });
            return true;
        } else if (message.type == "stop-audio") {
            if (audioPlayer) {
                audioPlayer.pause();
                audioPlayer.currentTime = 0;
            }
            sendResponse();
        } else if (message.type == "get-images") {
            const dom = (new DOMParser()).parseFromString(message.data.html, "text/html");

            const images = Array.from(dom.querySelectorAll(`img, meta[${message.data.dummyAttribute}]`)).map(image => {
                return {
                    src: image.getAttribute('src'),
                    alt: image.getAttribute('alt'),
                    height: image.getAttribute('height'),
                    width: image.getAttribute('width'),
                };
            });

            sendResponse(images);
        } else if (message.type == "get-image-dimensions") {
            const copyOfImage = new Image();
            copyOfImage.src = message.data;

            loadImage(copyOfImage).then(() => {
                sendResponse({
                    height: copyOfImage.height,
                    width: copyOfImage.width
                });
            }).catch(error => {
                sendResponse({
                    errorInOffscreen: error.message ?? error
                });
            });

            return true;
        } else if (message.type == "init-firebase") {
            console.log("init-firebase");
            (async () => {

                const thisEmailsBeginMonitoredId = message.data.emails.join(",");
                if (globalThis.emailsBeingMonitoredId == thisEmailsBeginMonitoredId) {
                    console.warn("already monitoring emails, skipping init-firebase");
                    sendResponse({
                        firebase: true
                    });
                    return;
                } else {
                    console.log("begin monitoring emails", thisEmailsBeginMonitoredId);
                }

                const appMod = await import('/js/firebase-app.js');
                const fsMod = await import('/js/firebase-firestore.js');

                const app = appMod.initializeApp({
                    projectId: "cool-kit-794",
                    appId: "1:450788627700:web:e8ba020938740eff163aa1",
                    databaseURL: "https://watch.firebaseio.com"
                });
                const db = fsMod.getFirestore(app, "watch");
                console.log("db", db);

                const listen = async () => {
                    window.firestoreUnsubscribeFunctions = window.firestoreUnsubscribeFunctions || [];
                    window.firestoreUnsubscribeFunctions.forEach(unsubscribeFunction => {
                        unsubscribeFunction();
                    });
                    window.firestoreUnsubscribeFunctions = [];

                    message.data.emails.forEach(email => {
                        const queryRef = fsMod.query(fsMod.collection(db, "messages"), fsMod.where("email", "==", email), fsMod.limit(1));

                        fsMod.onSnapshot(queryRef, snapshot => {
                            snapshot.forEach(doc => {
                                const message = doc.data();
                                console.log("firebase message", new Date(), message);
                                if (message.historyId) {
                                    if (!/firefox/i.test(navigator.userAgent)) {
                                        chrome.runtime.sendMessage({
                                            command: "firestore-message",
                                            data: message
                                        });
                                    } else {
                                        onRealtimeMessageReceived(message, "firestore");
                                    }
                                }
                            });
                            globalThis.emailsBeginMonitoredId = thisEmailsBeginMonitoredId;
                        }, error => {
                            console.error("onsnapshot error: ", error);
                            setTimeout(listen, 5000);
                        });
                    });
                }

                listen();

                sendResponse({
                    firebase: true
                });
            })();

            return true;
        } else if (message.type == "find-otp-code-in-html") {
            const parser = new DOMParser();
            const doc = parser.parseFromString(message.data.html, 'text/html');

            let matchResult;

            // Look for text nodes that might contain the code
            Array.from(doc.querySelectorAll('td, span')).find(node => {
                const matches = node.textContent.match(new RegExp(message.data.serializedRegex.pattern, message.data.serializedRegex.flags));
                console.log("matches", matches);
                if (matches) {
                    matchResult = matches[0];
                    return matches;
                }
            });

            sendResponse(matchResult);
        } else if (message.type == "test") {
            setTimeout(() => {
                sendResponse(message.data.delay);
            }, message.data.delay);
            return true;
        } else {
            console.warn(`Unexpected message type received: '${message.type}'.`);
            return false;
        }
    } catch (error) {
        console.error("offscreen", error);
        sendResponse({
            errorInOffscreen: error.message ?? error
        });
    }
}

if (!/firefox/i.test(navigator.userAgent)) {
    chrome.runtime.onMessage.addListener(myOffscreenListener);
}