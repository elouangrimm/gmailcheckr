// Copyright Gmail Checkr
"use strict";

console.log("background.js loaded: " + new Date());

try {
    if (!globalThis.commonJSLoaded) {
        importScripts(
            "lib/Autolinker.js",
            "config.js",
            "common.js",
            "checkerPlusForGmail.js",
            "mime/addressparser.js",
            "mime/buffer.js",
            "mime/iconv.js",
            "mime/encoding.js",
            "mime/mimelib.js",
            "account.js",
            "mail.js",
            "sanitizer/html4.js",
            "sanitizer/uri.js",
            "sanitizer/sanitizer.js"
        );
    }
} catch (error) {
    console.error("error in sw:" + error);
}

var inBackground = true; // couldn't use const to delcare variable because it wouldn't be visible in onAlarms

var accounts = [];
var ignoredAccounts = [];
var pollingAccounts = false;

var lastNotificationAudioSource;

var webNotification;
var unauthorizedAccounts;
var checkingEmails = false;
var buttonIcon;
const fcmUpdateTimers = {};
const UNDEFINED_AT = "AT_J_UNDEFINED";

var at = UNDEFINED_AT;

let serviceWorkerStartupTime;

const storagePromise = storage.init("startup");
storagePromise.catch(error => {
	globalThis.settingsError = true;
})

var detectSleepMode = new DetectSleepMode();
let initCalled = false;

function openUnstableWarningPage(ref) {
    let url = "https://jasonsavard.com/wiki/Unstable_browser_channel";
    if (ref) {
        url = setUrlParam(url, "ref", ref);
    }
	openUrl(url);
}

async function getManagedStorage() {
    if (chrome.storage.managed) {
        try {
            const items = await chrome.storage.managed.get();
            console.log("managed items", items);
            return items;
        } catch (error) {
            console.error("managed error: " + error);
        }
    }
}

async function maybeRegisterId() {
    const poll = await storage.get("poll");
    if (poll == "realtime") {
        if (chrome.gcm) {
            const oldRegId = await storage.get("registrationId");
            try {
                const newRegId = await ensureGCMRegistration(true);
                if (newRegId && newRegId != oldRegId) {
                    for (const account of accounts) {
                        const params = {
                            email: account.getEmail(),
                            registrationId: newRegId
                        }
                        if (oldRegId) {
                            params.oldRegistrationId = oldRegId;
                        }
    
                        const response = await linkEmailToRegistrationId(params);
                        console.info("migrated to new reg id: " + response);
                    }
                }
            } catch (error) {
                console.error("migration registration error: " + error);
            }
        }
    }
}

chrome.runtime.onInstalled.addListener(async details => {
	//console.log("onInstalled: " + details.reason);
	await storagePromise;
	
	// patch: when extension crashes and restarts the reason is "install" so ignore if it installdate exists
	if (details.reason == "install" && !await storage.get("installDate")) {
        // Note: Install dates only as old as implementation of this today, Dec 14th 2013
        await storage.initInstallationVars();
        
        const managedItems = await getManagedStorage();
        if (!managedItems?.DoNotOpenWebsiteOnInstall) {
            const optionsUrl = chrome.runtime.getURL("options.html"); // i moved the "?action=install" to the redirect in the thankyouforinstalling page because siteground was giving me 403 forbidden whenever it found %3F (which is an encoded "?")
            chrome.tabs.create({
                url: `https://jasonsavard.com/thankYouForInstalling?app=gmail&optionsUrl=${encodeURIComponent(optionsUrl)}`
            });
        }
        
        // commented because too many for quota
        //sendGA("installed", chrome.runtime.getManifest().version);

        //some users might lose their settings lets help them out...
		if (details.previousVersion) {
			var previousVersionMajor = details.previousVersion.split(".")[0];
			if (previousVersionMajor < 13) {
				//
			}
		}
		
		await Controller.processFeatures();
		console.log("Features unlocked on install");
	} else if (details.reason == "update") {
		// seems that Reloading extension from extension page will trigger an onIntalled with reason "update"
		// so let's make sure this is a real version update by comparing versions
		const realUpdate = details.previousVersion != chrome.runtime.getManifest().version;
		if (realUpdate) {
			console.log("real version changed");

            // migrate users from gcm to firestore
            if (ltVersion(details.previousVersion, "25.0.10")) {
                //storage.setDate("_migrateToFirestore");
            }

			// extension has been updated to let's resync the data and save the new extension version in the sync data (to make obsolete any old sync data)
			// but let's wait about 60 minutes for (if) any new settings have been altered in this new extension version before saving syncing them
			chrome.alarms.create(Alarms.EXTENSION_UPDATED_SYNC, {delayInMinutes:60});
		}
		
		const previousVersionObj = parseVersionString(details.previousVersion);
        const currentVersionObj = parseVersionString(chrome.runtime.getManifest().version);
        const extensionUpdates = await storage.get("extensionUpdates");
		if ((extensionUpdates == "all" && realUpdate) || (extensionUpdates == "interesting" && (previousVersionObj.major != currentVersionObj.major || previousVersionObj.minor != currentVersionObj.minor))) {
            storage.set("_lastBigUpdate", chrome.runtime.getManifest().version);
        
            const options = {
                type: "basic",
                title: getMessage("extensionUpdated"),
                message: "Gmail Checkr " + chrome.runtime.getManifest().version,
                iconUrl: Icons.NotificationLogo,
            }

            if (supportsNotificationButtons()) {
                options.buttons = [{title: getMessage("seeUpdates") || "See Updates"}];
            } else {
                options.message += `\n${getMessage("seeUpdates")}`;
            }

            if (DetectClient.isFirefox()) {
                options.priority = 2;
            } else {
                if (!DetectClient.isMac()) { // patch for macOS Catalina not working with requireinteraction
                    options.requireInteraction = true;
                }
            }

            isDND().then(dndState => {
                if (!dndState) {
                    chrome.notifications.create("extensionUpdate", options, function(notificationId) {
                        if (chrome.runtime.lastError) {
                            console.error(chrome.runtime.lastError.message);
                        }
                    });
                }
            }).catch(error => {
                console.error("error in isDND: ", error);
            });
		}
    }
    
    init("onInstalled");
});

if (chrome.runtime.onStartup) {
    chrome.runtime.onStartup.addListener(() => {
        serviceWorkerStartupTime = new Date();
        init("onStartup");
    })
}

if (chrome.alarms) {
    chrome.alarms.onAlarm.addListener(async alarm => {
        try {
            console.log("alarm", alarm.name);
            await initMisc();

            if (alarm.name == Alarms.EVERY_MINUTE) {
                // for detecting and update the DND status to the user
                updateBadge();

                // ping
                detectSleepMode.ping();

                // repeat notification
                if (await storage.get("unreadCount") >= 1) {
                    const repeatNotification = await storage.get("repeatNotification");
                    if (repeatNotification && await Math.abs((await storage.get("_lastRepeatNotificationTime")).diffInMinutes()) >= repeatNotification && !await wasResetEmailUnreadIcon()) {
                        const _lastRepeatNotificationTime = new Date();
                        const SECONDS_BUFFER = 5; // since alarms might be inaccurate let's make sure the interval is just under the minute
                        _lastRepeatNotificationTime.addSeconds(-SECONDS_BUFFER);
                        await storage.set("_lastRepeatNotificationTime", _lastRepeatNotificationTime);
                        buttonIcon.startAnimation();
                        const soundSource = await getNotificationSoundSource(await storage.get("_recentEmailSoundSource"));
                        playNotificationSound(soundSource);
                    }
                }

                // make sure there are no duplicate accounts that could create lockout issue
                if (await storage.get("accountAddingMethod") == "autoDetect") {
                    if (accounts.length == 0) {
                        await pollAccounts({showNotification:true});
                    } else {
                        let uniqueAccounts = [];
                        let foundSomeDuplicateAccounts;
                        let duplicateAccountFlag;
                        // start from end so that we remove duplicates from the end, assuming the first ones in the array in their correct position
                        for (let a=accounts.length-1; a>=0; a--) {
                            for (let b=a-1; b>=0; b--) {
                                if (accounts[a].getEmail().trim().equalsIgnoreCase(accounts[b].getEmail().trim())) {
                                    console.warn("dupe detection interval: remove ", accounts[a].getEmail());
                                    duplicateAccountFlag = true;
                                    break;
                                }
                            }
                            if (duplicateAccountFlag) {
                                foundSomeDuplicateAccounts = true;
                                duplicateAccountFlag = false;
                            } else {
                                uniqueAccounts.unshift(accounts[a]);                            
                            }
                        }
                        
                        if (foundSomeDuplicateAccounts) {
                            accounts = uniqueAccounts;
                        }
                    }
                }
            } else if (alarm.name == Alarms.EVERY_DAY) {
                maybeRegisterId();
            } else if (alarm.name == Alarms.CHECK_EMAILS) {
                await checkEmails("interval");
            } else if (alarm.name == Alarms.RESET_SPAM_CHECKING) {
                if (await isAnAccountCheckingSpam()) {
                    console.log("accountsListCheckingSpam so refresh");
                    await storage.remove("_accountsCheckingSpam");

                    if (await storage.get("accountAddingMethod") == "oauth") {
                        await refreshAccounts({hardRefreshFlag: true});
                    } else {
                        await refreshAccounts();
                    }
                }
            } else if (alarm.name == Alarms.EXTENSION_UPDATED_SYNC) {
                syncOptions.save("extensionUpdatedSync");
            } else if (alarm.name == Alarms.SYNC_DATA) {
                syncOptions.save("sync key").catch(error => {
                    console.error("sync key error: " + error);
                });
            } else if (alarm.name == Alarms.UPDATE_CONTACTS) {
                if (await storage.get("showContactPhoto")) {
                    // update contacts
                    updateContacts().catch(error => {
                        console.warn("updateContacts() error: " + error);
                    });
                }
            } else if (alarm.name == Alarms.SYNC_SIGN_IN_ORDER) {
                if (await storage.get("accountAddingMethod") == "oauth") {
                    syncSignInOrderForAllAccounts().catch(error => {
                        console.warn("syncSignInOrderForAllAccounts() error: " + error);
                    });
                }
            } else if (alarm.name == Alarms.SYNC_FETCH_SEND_AS) {
                accounts.forEach(account => {
                    account.fetchSendAs().catch(error => {
                        console.info("sync fetchSendAs() error: " + error);
                    });
                });
            } else if (alarm.name.startsWith(Alarms.ENABLE_PUSH_NOTIFICATIONS_EMAIL_ALARM_PREFIX)) {
                const email = alarm.name.split(Alarms.ENABLE_PUSH_NOTIFICATIONS_EMAIL_ALARM_PREFIX)[1];
                const account = getAccountByEmail(email);
                if (account) {
                    await account.enablePushNotifications();
                }
            } else if (alarm.name.startsWith(Alarms.WATCH_EMAIL_ALARM_PREFIX)) {
                const email = alarm.name.split(Alarms.WATCH_EMAIL_ALARM_PREFIX)[1];
                const account = getAccountByEmail(email);
                if (account) {
                    await account.watch();
                }
            } else if (alarm.name.startsWith(Alarms.RESYNC_ALARM_PREFIX)) {
                const email = alarm.name.split(Alarms.RESYNC_ALARM_PREFIX)[1];
                const account = getAccountByEmail(email);
                if (account) {
                    if (account.resyncAttempts > 0) {
                        account.resyncAttempts--;
                        account.syncSignInId().then(async () => {
                            account.mustResync = false;
                            await serializeAccounts(accounts, {source: "resync"});
                        }).catch(error => {
                            console.error("syncsignin error: " + error);
                        });
                    }
                }
            } else if (alarm.name.startsWith(Alarms.GET_EMAILS_FROM_FCM_UPDATE_PREFIX)) {
                const email = alarm.name.split(Alarms.GET_EMAILS_FROM_FCM_UPDATE_PREFIX)[1];
                const account = getAccountByEmail(email);
                if (account) {
                    await getEmailsFromFCMUpdate(account);
                }
            } else if (alarm.name == Alarms.UPDATE_SKINS) {
                // Disabled - skins are now local only
                console.log("UPDATE_SKINS alarm disabled (local skins only)");
            } else if (alarm.name == Alarms.UPDATE_UNINSTALL_URL) {
                // do this every day so that the daysellapsed is updated in the uninstall url
                //setUninstallUrl(getFirstEmail(accounts)); // Removed setUninstallUrl
            } else if (alarm.name == Alarms.CLEAR_SUBJECTS_SPOKEN) {
                storage.remove("_subjectsSpoken");
            } else if (alarm.name == Alarms.AUTOMATIC_RESTART) {
                chrome.runtime.reload();
            }
        } catch (error) {
            console.error("error in alarm: ", error);
            if (inLocalExtension) {
                if ([ErrorCause.OFFLINE, ErrorCause.NETWORK_PROBLEM].includes(error.cause)) {
                    // do nothing
                } else {
                    showMessageNotification("Error in alarms", "Dev only", error);
                }
            }
        }
    });    
}

async function getDisplayForWindow(window) {
    const displays = await chrome.system.display.getInfo();
    for (const display of displays) {
        const displayBounds = display.bounds;
        if (window.left >= displayBounds.left &&
            window.top >= displayBounds.top &&
            window.left + window.width <= displayBounds.left + displayBounds.width &&
            window.top + window.height <= displayBounds.top + displayBounds.height) {
            return display;
        }
    }
    return null;
}

chrome.windows.onCreated.addListener(async thisWindow => {
    console.log("onCreated", thisWindow)
    if (thisWindow.type == "popup") {
        storage.get("_openOauthFlowDate").then(async launchWebAuthFlowDate => {
            const MAX_SECONDS_TO_AUTOMATICALLY_RESIZE = 10;
            if (launchWebAuthFlowDate?.diffInSeconds() > -MAX_SECONDS_TO_AUTOMATICALLY_RESIZE) {
                storage.remove("_openOauthFlowDate");
                
                let height = 980;
                try {
                    const displayFound = await getDisplayForWindow(thisWindow);
                    if (displayFound) {
                        console.log("Screen where this window is present: ", displayFound);
                        height = displayFound.workArea.height;
                    }
                } catch (error) {
                    console.warn("Error getting display for window:", error);
                }

                await chrome.windows.update(thisWindow.id, {
                    height: height,
                    width: 599
                });
            }
        }).catch(error => {
            console.warn("error in onCreated: ", error);
        });
    }
});

function getEmailsFromFCMUpdate(account) {
    console.log("getEmailsFromFCMUpdate: " + account.getEmail(), new Date());
    account.getEmails().then(() => {
        mailUpdate({showNotification:true});
    }).catch(error => {
        // nothing
    });
}

async function onRealtimeMessageReceived(rawMessage, source) {
    if (rawMessage.from == GCM_SENDER_ID || source == "firebase") {
        let message;
        if (source == "gcm") {
            message = rawMessage.data;
        } else {
            message = rawMessage;
        }
        if (message.historyId) {
            if (await storage.get("poll") == "realtime") {
                // reset check email timer (as a backup it runs every 5min)
                restartCheckEmailTimer(true);

                const email = message.email;
                const account = getAccountByEmail(email);
                if (account) {
                    if (!account.getHistoryId() || message.historyId > account.getHistoryId()) {
                        const lastGmailAPIActionByExtension = await storage.get("_lastGmailAPIActionByExtension");
                        if (lastGmailAPIActionByExtension.diffInSeconds() >= -MIN_SECONDS_BETWEEN_MODIFICATIONS_BY_EXTENSION_AND_GCM_MESSAGES) { // avoid race condition
                            console.log("Pausing checking emails because lastGmailAPIActionByExtension is too recent: " + lastGmailAPIActionByExtension);
                            chrome.alarms.create(Alarms.GET_EMAILS_FROM_FCM_UPDATE_PREFIX + email, {delayInMinutes: 0.5});
                        } else {
                            chrome.alarms.clear(Alarms.GET_EMAILS_FROM_FCM_UPDATE_PREFIX + email);

                            let delay;
                            if (account.lastGetEmailsDate.diffInSeconds() < -MIN_SECONDS_BETWEEN_GET_EMAILS) {
                                delay = 100; // v2 100, used to be 500: small buffer because when snoozing multiple emails I would get quick consecutive gcm calls
                            } else {
                                delay = seconds(MIN_SECONDS_BETWEEN_PROCESSING_GCM_MESSAGES);
                            }

                            clearTimeout(fcmUpdateTimers[email]);
                            fcmUpdateTimers[email] = setTimeout(() => {
                                getEmailsFromFCMUpdate(account);
                            }, delay);
                        }
                    } else {
                        console.warn("historyId is old: " + message.historyId);
                    }
                }
            }
        } else {
            console.warn("Unknown message", message);
        }
    } else {
        console.warn("Unknown message sender: " + message.from);
    }
}

if (chrome.gcm) {
	
	var MIN_SECONDS_BETWEEN_MODIFICATIONS_BY_EXTENSION_AND_GCM_MESSAGES = 15;
	var MIN_SECONDS_BETWEEN_GET_EMAILS = 5;
	var MIN_SECONDS_BETWEEN_PROCESSING_GCM_MESSAGES = 1;
	
	chrome.gcm.onMessage.addListener(async message => {
        console.log("gcm.onMessage", new Date(), message);
        await initMisc();
        await onRealtimeMessageReceived(message, "gcm");
	});
}

if (chrome.instanceID) {
    chrome.instanceID.onTokenRefresh.addListener(async function() {
        await initMisc();
        maybeRegisterId();
    });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    await initMisc();

    if (ContextMenu.OPEN_GMAIL == info.menuItemId) {
        openGmail();
    } else if (ContextMenu.COMPOSE == info.menuItemId) {
        accounts[0].openCompose();
    } else if (ContextMenu.REFRESH == info.menuItemId) {
        setBadgeEllipsis();
        refreshAccounts();
    } else if (ContextMenu.MARK_ALL_AS_READ == info.menuItemId) {
        markAllAsRead();
    } else if (ContextMenu.QUICK_COMPOSE == info.menuItemId) {
        openQuickCompose();
    } else if (ContextMenu.SEND_PAGE_LINK == info.menuItemId) {
        sendPageLink(info, tab, accounts.first());
    } else if (ContextMenu.SEND_PAGE_LINK_TO_CONTACT == info.menuItemId) {
        if (await storage.get("accountAddingMethod") == "autoDetect") {
            sendPageLinkToContact(info, tab);
        } else {
            var sendEmailParams = generateSendPageParams(info, tab);
            sendEmailParams.to = {email:await storage.get("quickComposeEmail")}; // name:storage.get("quickComposeEmailAlias")
            
            var originalMessage = sendEmailParams.message;
            sendEmailParams.htmlMessage = sendEmailParams.message + "<br><br><span style='color:gray'>Sent from <a style='color:gray;text-decoration:none' href='https://jasonsavard.com/Checker-Plus-for-Gmail?ref=sendpage'>Gmail Checkr</a></span>";
            // remove message since we put it into the htmlMessage and because it seems when gmail api sends in html only it generates the text/plain
            sendEmailParams.message = null;
            
            accounts[0].sendEmail(sendEmailParams).then(() => {
                const options = {
                    type: "basic",
                    title: getMessage("email") + " " + getMessage("sent"),
                    message: sendEmailParams.subject,
                    contextMessage: originalMessage,
                    iconUrl: Icons.NotificationLogo
                }
                
                var EMAIL_SENT_NOTIFICATION_ID = "emailSent";
                chrome.notifications.create(EMAIL_SENT_NOTIFICATION_ID, options, async function(notificationId) {
                    if (chrome.runtime.lastError) {
                        console.error(chrome.runtime.lastError.message);
                    } else {
                        await sleep(seconds(4));
                        chrome.notifications.clear(EMAIL_SENT_NOTIFICATION_ID, function() {});
                    }
                });
            }).catch(error => {
                showMessageNotification("Checker Plus Error", "Error sending mail", error);
            });
        }
    } else if (ContextMenu.SEND_PAGE_LINK_TO_CONTACT_WITH_MESSAGE == info.menuItemId) {
        sendPageLinkToContact(info, tab);
    } else if (ContextMenu.DND_OFF == info.menuItemId) {
        setDND_off();
    } else if (ContextMenu.DND_30_MIN == info.menuItemId) {
        setDND_minutes(30);
    } else if (ContextMenu.DND_1_HOUR == info.menuItemId) {
        setDND_minutes(60);
    } else if (ContextMenu.DND_2_HOURS == info.menuItemId) {
        setDND_minutes(120);
    } else if (ContextMenu.DND_4_HOURS == info.menuItemId) {
        setDND_minutes(240);
    } else if (ContextMenu.DND_8_HOURS == info.menuItemId) {
        setDND_minutes(480);
    } else if (ContextMenu.DND_TODAY == info.menuItemId) {
        setDND_today();
    } else if (ContextMenu.DND_INDEFINITELY == info.menuItemId) {
        setDND_indefinitely();
    } else if (ContextMenu.DND_OPTIONS == info.menuItemId) {
        openDNDOptions();
    } else {
        showMessageNotification("No code assigned to this menu", "Try re-installing the extension.");
    }
});




async function onButtonClicked(notificationId, buttonIndex) {
	console.log("onbuttonclicked", notificationId, buttonIndex);
	if (notificationId == "extensionUpdate") {
		if (buttonIndex == -1 || buttonIndex == 0) {
            openChangelog();
			chrome.notifications.clear(notificationId, function() {});
            storage.remove("_lastBigUpdate");
            sendGA("extensionUpdateNotification", "clicked button - see updates");
		}
	} else if (notificationId == "message") {
		// nothing
	} else if (notificationId == "error") {
		openUrl(Urls.NotificationError);
		chrome.notifications.clear(notificationId, function() {});
		sendGA("errorNotification", "clicked button on notification");
	} else if (notificationId == "extensionConflict") {
		openUrl(Urls.ExtensionConflict);
		chrome.notifications.clear(notificationId, function() {});
		sendGA("errorNotification", "clicked button on notification");
	} else if (notificationId.includes("spreauthUrl_")) {
		openUrl(notificationId.split("spreauthUrl_")[1]);
		chrome.notifications.clear(notificationId, function() {});
	} else if (notificationId == "corruptProfile") {
		openUrl(Urls.CorruptProfile);
		chrome.notifications.clear(notificationId, function() {});
		sendGA("errorNotification", "clicked button on notification");
	} else {
		stopAllSounds();
		let notificationButtonValue;
		if (buttonIndex == -1) { // when Windows native notifications were enabled in Chrome 68 this was equivalent to clicking anywhere
			notificationButtonValue = await storage.get("notificationClickAnywhere");
		} else {
            const richNotifButtonsWithValues = await storage.get("_richNotifButtonsWithValues");
			notificationButtonValue = richNotifButtonsWithValues[buttonIndex].value;
		}
		performButtonAction({notificationButtonValue:notificationButtonValue, notificationId:notificationId});
	}
}

function openUpdateBrowserLink() {
    if (DetectClient.isChrome()) {
        openUrl("https://support.google.com/chrome/answer/95414");
    } else if (DetectClient.isEdge()) {
        openUrl("https://support.microsoft.com/topic/microsoft-edge-update-settings-af8aaca2-1b69-4870-94fe-18822dbb7ef1");
    } else {
        openUrl("https://browser-update.org/update-browser.html");
    }
}

globalThis.addEventListener("notificationclick", event => {
    console.log("web notification click: ", event);

    const tag = event.notification.tag;
    if (tag.includes("email_")) {
        const emailId = tag.split("email_")[1];
        const email = findMailById(emailId);
        if (email) {
            email.open();
        }
    } else if (tag == NotificationTags.SHORTCUT_NOT_APPLICABLE_AT_THIS_TIME) {
        openUrl("https://jasonsavard.com/wiki/Keyboard_shortcuts");
    } else if (tag == NotificationTags.UPDATE_BROWSER) {
        openUpdateBrowserLink();
    } else if (tag == NotificationTags.UNSTABLE_BROWSER_CHANNEL) {
        openUnstableWarningPage("notif");
    }
});

if (chrome.notifications) {

	// clicked anywhere
	chrome.notifications.onClicked.addListener(async notificationId => {
        await initMisc();
		onButtonClicked(notificationId, -1);
	});

	// buttons clicked
	chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
        await initMisc();
		onButtonClicked(notificationId, buttonIndex);
	});
	
	// closed notif
	chrome.notifications.onClosed.addListener(async (notificationId, byUser) => {
		console.log("notif onclose", notificationId, byUser, new Date());
        await initMisc();
        
		if (notificationId == "extensionUpdate") {
			if (byUser) {
				sendGA("extensionUpdateNotification", "closed notification");
			}
		} else if (notificationId == "message") {
			// nothing
		} else if (notificationId == "error") {
			// nothing
		} else {
            storage.remove("_richNotifId");
			
			// Chrome <=60 byUser happens ONLY when X is clicked ... NOT by closing browser, NOT by clicking action buttons, ** NOT by calling .clear
			// Chrome 61 update: calling .clear will set byUser = true
			if (byUser && !globalThis.notificationClosedByDuration) {
				stopAllSounds();
			}
			// reset value
			globalThis.notificationClosedByDuration = false;
		}
	});
}

if (chrome.runtime.onMessageExternal) {
	chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
        (async function() {
            await initMisc();
            if (sender.id == "blacklistedExtension") {
                //sendResponse({});  // don't allow this extension access
            } else if (message.action == "turnOffDND") {
                setDND_off(true);
                sendResponse();
            } else if (message.action == "setDNDEndTime") {
                var endTime = new Date(message.endTime);
                if (!message.triggeredByCalendarExtension) {
                    setDNDEndTime(endTime, true);
                } else if (message.triggeredByCalendarExtension && await storage.get("dndDuringCalendarEvent")) {
                    // only overrite endtime from calendar extension if it's longer than the user's specifically set end time
                    if (!await storage.get("DND_endTime") || endTime.isAfter(await storage.get("DND_endTime"))) {
                        setDNDEndTime(endTime, true);
                    }
                }
                sendResponse();
            } else if (message.action == "getEventDetails") {
                // do not sendresponse here because we are alredy litening for this event in the popup window context
            } else if (message.action == "getInfo") {
                sendResponse({installed:true});
            } else if (message.action == "version") {
                sendResponse(chrome.runtime.getManifest().version);
            }
        })();
        return true;
	});
}

// Add listener once only here and it will only activate when browser action for popup = ""
chrome.action.onClicked.addListener(async tab => {
    await initMisc();
    const browserButtonAction = await storage.get("browserButtonAction");
    const checkerPlusBrowserButtonActionIfNoEmail = await storage.get("checkerPlusBrowserButtonActionIfNoEmail");
    const sidePanelBrowserButtonActionIfNoEmail = await storage.get("sidePanelBrowserButtonActionIfNoEmail");
    const gmailPopupBrowserButtonActionIfNoEmail = await storage.get("gmailPopupBrowserButtonActionIfNoEmail");
    const gmailSidePanelBrowserButtonActionIfNoEmail = await storage.get("gmailSidePanelBrowserButtonActionIfNoEmail");

    const unreadCount = await storage.get("unreadCount");

	const checkerPlusElseCompose = browserButtonAction == BrowserButtonAction.CHECKER_PLUS && checkerPlusBrowserButtonActionIfNoEmail == BrowserButtonAction.COMPOSE && unreadCount == 0;
    const sidePanelElseCompose = browserButtonAction == BrowserButtonAction.SIDE_PANEL && sidePanelBrowserButtonActionIfNoEmail == BrowserButtonAction.COMPOSE && unreadCount == 0;
	const gmailInboxElseCompose = browserButtonAction == BrowserButtonAction.GMAIL_INBOX && gmailPopupBrowserButtonActionIfNoEmail == BrowserButtonAction.COMPOSE && unreadCount == 0;
    const gmailInboxSidePanelElseCompose = browserButtonAction == BrowserButtonAction.GMAIL_INBOX_SIDE_PANEL && gmailSidePanelBrowserButtonActionIfNoEmail == BrowserButtonAction.COMPOSE && unreadCount == 0;
	
	if (browserButtonAction == BrowserButtonAction.CHECKER_PLUS_POPOUT || browserButtonAction == BrowserButtonAction.GMAIL_INBOX_POPOUT) {
		openInPopup();
	} else if (browserButtonAction == BrowserButtonAction.COMPOSE || checkerPlusElseCompose || sidePanelElseCompose || gmailInboxElseCompose || gmailInboxSidePanelElseCompose) {
		// open compose mail
		if (accounts.length) {
			accounts[0].openCompose();
		} else {
			openUrl(getSignInUrl());
		}
	} else {
		// open Gmail
        let accountId = -1;
		accounts.some((account, i) => {
			if (account.getUnreadCount() > 0) {
				accountId = account.id;
				return true;
			}
		});

        if (accountId == -1) {
            if (accounts.length) {
                accountId = accounts.first().id;
            } else {
                accountId = 0;
            }
        }

		// means not signed in so open gmail.com for user to sign in
		const accountToOpen = getAccountById(accountId);
		if (accountToOpen) {
			const params = {};
			if (browserButtonAction == BrowserButtonAction.GMAIL_IN_NEW_TAB || checkerPlusBrowserButtonActionIfNoEmail == BrowserButtonAction.GMAIL_IN_NEW_TAB) {
				params.openInNewTab = true;
			} else if (browserButtonAction == BrowserButtonAction.GMAIL_DETACHED) {
                params.openDetached = true;
            }
			accountToOpen.openInbox(params);
		} else {
			console.error("No mailaccount(s) found with account id " + accountId);		
			openUrl(getSignInUrl());
		}
	}

    storage.setDate("_lastClickedButtonIcon").then(async () => {
        if (await storage.get("resetEmailUnreadIconWhenButtonClicked")) {
            updateBadge();
        }
    });
});

function maybeAppendAllMsg(msg, emails) {
	if (emails.length == 1) {
		return msg;
	} else {
		return msg + " (" + getMessage("all") + ")";
	}
}

async function generateNotificationButton(buttons, buttonsWithValues, value, emails, strParam) {
	if (value) {
		let button;

        let NOTIF_BUTTONS_FOLDER;
        const notificationButtonIcon = await storage.get("notificationButtonIcon");
		if (notificationButtonIcon == "gray") {
			NOTIF_BUTTONS_FOLDER = "/images/notifButtonsGray/";
		} else {
			NOTIF_BUTTONS_FOLDER = "/images/notifButtons/";
        }
        
        function initButtonObj(title, icon) {
            let button = {
                title: title
            }

            if (notificationButtonIcon && icon) {
                button.iconUrl = NOTIF_BUTTONS_FOLDER + icon;
            }

            return button;
        }
		
		if (value == "markAsRead") {
            button = initButtonObj(maybeAppendAllMsg(getMessage("readLink"), emails), "checkmark.png");
		} else if (value == "delete") {
            button = initButtonObj(maybeAppendAllMsg(getMessage("delete"), emails), "trash.png");
		} else if (value == "archive") {
            button = initButtonObj(maybeAppendAllMsg(getMessage("archive"), emails), "archive.png");
		} else if (value == "spam") {
            button = initButtonObj(maybeAppendAllMsg(getMessage("reportSpam"), emails), "spam.png");
		} else if (value == "star") {
            button = initButtonObj(maybeAppendAllMsg(getMessage("starLinkTitle"), emails), "star.png");
		} else if (value == "starAndArchive") {
            button = initButtonObj(maybeAppendAllMsg(getMessage("starAndArchive"), emails), "star.png");
		} else if (value == "open") {
            button = initButtonObj(getMessage("open"), "open.png");
		} else if (value == "openInNewTab") {
            button = initButtonObj(getMessage("open"), "open.png");
		} else if (value == "openInPopup") {
			button = initButtonObj(getMessage("open"), "open.png");
		} else if (value == "reply") {
            button = initButtonObj(getMessage("reply"), "reply.png");
		} else if (value == "replyInPopup") {
            button = initButtonObj(getMessage("reply"), "reply.png");
		} else if (value == "reducedDonationAd") {
            button = initButtonObj(getMessage("extraFeatures") + " [" + getMessage("dismiss") + "]", "open.png");
		} else if (value == "markDone") {
            button = initButtonObj(maybeAppendAllMsg(getMessage("markDone"), emails), "checkmark.png");
		} else if (value == "dismiss") {
            button = initButtonObj(maybeAppendAllMsg(getMessage("dismiss"), emails), "checkmark.png");
		} else if (value == "otp-code") {
            button = initButtonObj(`${getMessage("copy")} ${strParam}`);
        }

		if (button) {
			buttons.push(button);
			
			const buttonWithValue = shallowClone(button);
			buttonWithValue.value = value;
			buttonsWithValues.push(buttonWithValue);
		}
	}
}

async function clearRichNotification(notificationId) {
    if (notificationId) {
        try {
            const wasCleared = await chrome.notifications.clear(notificationId);
        } catch (error) {
            console.error("clearRichNotification error: " + error);
        }
    }
}

function canDisplayImageInNotification(image) {
	return (image.src?.includes("//mail.google.com") || image.src?.includes(".googleusercontent.com")) && !image.alt?.includes("Image removed by sender");
}

async function fetchEmailImagePreview(mail) {
	if (await storage.get("showNotificationEmailImagePreview")) {
		if (await storage.get("accountAddingMethod") == "autoDetect") {

            const result = await chrome.permissions.contains({origins: [Origins.NOTIFICATION_IMAGES]});
            if (result) {
                if (mail.messages.last()) {
                    const images = await sendToOffscreenDoc("get-images", {
                        html: mail.messages.last().content,
                        dummyAttribute: DUMMY_ATTRIBUTE,
                    });

                    fixRelativeLinks(images, mail);
                    
                    let detectedIconUrl;
                    let mustTestLoadImage;
                    const image = images.find(image => {
                        const src = image.src;
                        
                        // do not show common gmail images such as these by ignore /images/
                        // .vcf icon = https://mail.google.com/mail/u/0/images/generic.gif
                        // .wav icon = https://mail.google.com/mail/u/0/images/sound.gif	
                        // /proxy/ used by Google news letters https://ci6.googleusercontent.com/proxy/b0dQF6UdprOZnNdy4YkkZRZYSz4OKeP6tnNaKKhKAHzc5DoRLm-6T9Ofs1I_nxTMa7p63sQXCvlyhmMf4nIKJxbU6hMDZ46Wv5esDXgENaw2csOyvTEfyb2ycnSEic4Yi7N81kiF=s0-d-e1-ft#https://www.gstatic.com/gmktg/mtv-img/cloudplatform_hero_image_2014_mar_w538.jpg
                        // google logo 						   https://ci4.googleusercontent.com/proxy/GYehbMfqpOfmkZni3YXcVpYFnSdFa4_3HNmCzVHxFFhtCBk_QulXrkB97v_UVSU0gt8t42RnDKOqw0SvszkMjvrdKHZjm3UErjYHQI7vsurAMj3tGuzIFiqw8xIvgCy_aoN9ujcdkHDJYGLdO9h6jySufmfLtNIRr8tXVfdR=s0-d-e1-ft#https://ssl.gstatic.com/s2/oz/images/notifications/logo/google-plus-6617a72bb36cc548861652780c9e6ff1.png
                        // twitter profile image: https://ci4.googleusercontent.com/proxy/6gEsiJis1bR3V0VjLSVPlXWkvG5gpih1SXl76ZtlPej0gbvzyT5csZHqRvspHtFm6RSN3GMjr341ggvV8bL1kUfidvh40p5QhrHlZHUgvGD9Rzzka29xynqxWPMupf5w0YCPXAterd8WXA=s0-d-e1-ft#https://pbs.twimg.com/profile_images/1710068300/avatar-sel-port_reasonably_small.jpg
                        // pinterest logos "/logo" ... https://ci4.googleusercontent.com/proxy/FljV4IcGHkNGLK57gCiy7cBamDrSWta_-7hOh_NMFw5xEjJo3MUga5TaUfk3gGcoZ2HQTvCgLoEUu60kokQkHWfke_Zg0QENUV_Z4flLXGIYhV7As6dHwGc=s0-d-e1-ft#http://email-assets.pinterest.com/email/shared/brand/logo_large.gif

                        console.log("image", image)
                        if (src && canDisplayImageInNotification(image) && !src.includes("/images/") && !src.includes("notifications/") && !src.includes("/logo")) {
                            // hostname is .google.com if they embedded the image
                            // hostname is .googleusercontent.com if they in Gmail > clicked Insert Photo > by Web address (URL)							
                            if (mail.authorMail?.includes("@facebookmail.com")) {
                                // https://ci3.googleusercontent.com/proxy/g96-WnOcJ8aMpwH8MgjPEGTy5Q32qaOHpaF30q0s6tJRXXxs8yRr5jFkDIWAX_-wDIkjnoGpvMmPqJp_GGHk4U5yhSmUiBmDma-tPDyIE7Y_2-jWYC0PmPxhRU8mcSqqJxoqi27HTYG6sh9Jcbzsuw=s0-d-e1-ft#https://fbcdn-profile-a.akamaihd.net/hprofile-ak-prn2/t5/1117010_779426678_323617099_q.jpg
                                if (src.includes("profile")) {
                                    detectedIconUrl = src;
                                    return true;
                                }
                            } else if ((image.width && image.width >= PREVIEW_IMAGE_MIN_WITDH_HEIGHT) && (image.height && image.height >= PREVIEW_IMAGE_MIN_WITDH_HEIGHT)) {
                                return true;
                            } else { // could not determine width/height
                                mustTestLoadImage = true;
                                return true;
                            }
                        } else {
                            console.log("did not pass image tests");
                        }
                    });

                    const src = image?.src;

                    if (detectedIconUrl) {
                        return {
                            detectedIconUrl: detectedIconUrl
                        }
                    } else if (mustTestLoadImage && src) {
                        // Get the real width/height
                        try {
                            const copyOfImage = await sendToOffscreenDoc("get-image-dimensions", src);
                            if (copyOfImage.width >= PREVIEW_IMAGE_MIN_WITDH_HEIGHT && copyOfImage.height >= PREVIEW_IMAGE_MIN_WITDH_HEIGHT) {
                                return {
                                    src: src
                                };
                            }
                        } catch (error) {
                            logError("could not load image: " + src + " " + error);
                        }
                    } else if (src) {
                        return {
                            src: src
                        }
                    }
                }
            }
		} else { // oauth
            const lastMessage = mail.messages.last();
			if (lastMessage) {
				const file = lastMessage.files.find(file => file.mimeType?.indexOf("image/") == 0 && file.body.size >= PREVIEW_IMAGE_MIN_SIZE && file.body.size < PREVIEW_IMAGE_MAX_SIZE);
                if (file) {
                    const queuedFile = mail.queueFile(lastMessage.id, file);
                    try {
                        const response = await queuedFile.fetchPromise;
                        console.log("mimetype: " + file.mimeType);
                        return {
                            src: generateBlobUrl(response.data, file.mimeType)
                        }
                    } catch (error) {
                        logError("could not fetch preview image (oauth) " + error?.message);
                    }
                }
			}
		}
	}
}

async function ensureDoNotShowNotificationIfGmailTabOpenTest(params = {}) {
    if (params.testType) {
        return true;
    } else if (params.accountWithNewestMail && await storage.get("doNotShowNotificationIfGmailTabOpen")) {
        // url: must be URL pattern like in manifest ex. http://abc.com/* (star is almost mandatory)
        const tabs = await chrome.tabs.query({url:params.accountWithNewestMail.getMailUrl() + "*"});
        console.log("gmail tabs: ", tabs);
        if (tabs?.length) {
            console.warn("Not showing notification because of option: doNotShowNotificationIfGmailTabOpen");
            return false;
        } else {
            return true;
        }
    } else {
        return true;
    }
} 

function showWebNotification(title, params = {}) {
    if (globalThis.registration) {
        
        webNotification = {
            tag: params.tag
        }

        return registration.showNotification(title, {
            body: params.body,
            icon: params.icon,
            requireInteraction: params.requireInteraction,
            tag: params.tag,
            silent: params.silent
        });
    } else {
        return new Promise((resolve, reject) => {
            webNotification = new Notification(title, {
                body: params.body,
                icon: params.icon,
                requireInteraction: params.requireInteraction,
                tag: params.tag,
                silent: params.silent
            });
            webNotification.onclick = function() {
                params.newNotificationOnClick(params);
                if (webNotification) {
                    webNotification.close();
                }
            }
            webNotification.onshow = function() {
                resolve();
            }
            webNotification.onclose = function() {
                console.log("onclose notification");
                webNotification = null;
            }
            webNotification.onerror = function(e) {
                reject("onerror with notification");
            }
        });
    }
}

async function closeWebNotifications() {
    if (globalThis.registration) {
        const notifs = await registration.getNotifications();
        notifs.forEach(notif => {
            notif.close();
        });
    } else if (webNotification) {
        webNotification.close();
    }
}

async function showNotification(params = {}) {
    storage.setDate("_lastNotificationDate");
    const newState = await chrome.idle.queryState(60);
    console.log("show notif state: " + newState + " " + new Date());
    if (newState == "active") {
        storage.setDate("_lastNotificationDateWhileActive");
    }
    
    const notificationDisplay = await storage.get("notificationDisplay");
    
    params.unsnoozedEmails ||= [];
    params.newEmails ||= [];

    if (params.unsnoozedEmails.length) {
        params.emails = params.unsnoozedEmails.concat(params.newEmails);
    } else {
        params.emails = params.newEmails;
    }

    if (!params.skipSerializing && params.newEmails.length) {
        try {
            storage.set("_lastShowNotifParams", await serializeMails(params));
        } catch (error) {
            console.warn("Could not serialize newEmails: " + error);
        }
    }

    const onlySnoozedEmails = params.unsnoozedEmails.length && !params.newEmails.length;

    var firstEmail;
    if (params.emails) {
        firstEmail = params.emails.first();
    }
    if (!firstEmail) {
        var error = "Could not find any emails";
        console.error(error);
        throw new Error(error);
    }

    const desktopNotification = await storage.get("desktopNotification");
    if (desktopNotification) {
        const dndState = await isDND({notificationRelated: true, account: firstEmail.account});
        if (dndState) {
            return "DND is enabled";
        } else {
            const passedDoNotShowNotificationIfGmailTabOpenTest = await ensureDoNotShowNotificationIfGmailTabOpenTest(params);
            if (passedDoNotShowNotificationIfGmailTabOpenTest) {
                var NOTIFICATION_DISABLE_WARNING = "Normally a notification for this email or some of these emails will not appear because you unchecked the notification in your Accounts/Labels settings for this particular email/label";
                
                const notifications = await firstEmail.account.getSetting("notifications");
                var notificationFlagForLabelsOfNewestEmail = await getSettingValueForLabels(firstEmail.account, notifications, firstEmail.labels, desktopNotification);

                var textNotification = params.testType == "text" || (params.testType == undefined && desktopNotification == "text");
                var richNotification = params.testType == "rich" || (params.testType == undefined && desktopNotification == "rich");

                if (textNotification || !chrome.notifications) {
                    // text window
                    if (notificationFlagForLabelsOfNewestEmail || params.testType) {					
                        var fromName = await generateNotificationDisplayName(firstEmail);
                        
                        const subject = firstEmail.title || "";
                        
                        var body = await firstEmail.getLastMessageText({maxSummaryLetters:101, htmlToText:true});
        
                        var title = "";

                        if (params.resumeFromIdle && !firstEmail.unSnoozed) {
                            const timeElapsedMsg = getTimeElapsed(firstEmail.issued);
                            if (timeElapsedMsg) {
                                title = `(${timeElapsedMsg}) `;
                            }
                        }
                        
                        if (accounts.length >= 2 && await storage.get("displayAccountReceivingEmail")) {
                            title += await firstEmail.account.getEmailDisplayName() + "\n";
                        }

                        if (notificationDisplay == "newEmail") {
                            title += firstEmail.unSnoozed ? getMessage("snoozed") : getMessage("newEmail");
                            body = "";
                        } else if (notificationDisplay == "from") {
                            title += firstEmail.unSnoozed ? getMessage("snoozed") + ": " : "" + fromName;
                            body = "";
                        } else if (notificationDisplay == "from|subject") {
                            title += firstEmail.unSnoozed ? getMessage("snoozed") + ": " : "" + fromName;
                            body = subject;
                        } else {
                            title += formatEmailNotificationTitle(fromName, subject);
                        }
                        
                        body = shortenUrls(body);

                        await showWebNotification(title, {
                            body: body,
                            icon: Icons.NotificationLogo,
                            requireInteraction: !DetectClient.isMac(),
                            tag: `email_${firstEmail.id}`,
                            silent: getNotificationSilentFlag(params.soundSource),
                            newNotificationOnClick: async () => {
                                firstEmail.open();
                            }
                        });

                        const showNotificationDuration = await storage.get("showNotificationDuration");
                        
                        if (!isNaN(showNotificationDuration)) {
                            if (webNotification) {
                                sleep(seconds(showNotificationDuration)).then(() => {
                                    closeWebNotifications();
                                });
                            }
                        }
                    } else {
                        var error = "Notification disabled for this email";
                        console.warn(error);
                        throw new Error(error);
                    }
                } else if (richNotification) {
                    // rich notif
                    
                    console.log("rich params: ", params);

                    var iconUrl = Icons.NotificationLogo;
                    
                    var buttons = [];
                    var buttonsWithValues = []; // used to associate button values inside notification object
                    var buttonValue;

                    // ignore google emails since most system notification automatically includes copy code, except from google voice
                    if (!firstEmail.authorMail.includes("google.") || firstEmail.authorMail.includes("voice.google.")) { // v1 commented because chrome started showing them: firstEmail.authorMail.includes("voice.google.")
                        globalThis.otpCode = await firstEmail.getOTPCode();
                    } else {
                        globalThis.otpCode = null;
                    }
                    
                    if (globalThis.otpCode) {
                        buttonValue = "otp-code";
                    } else {
                        buttonValue = await storage.get("notificationButton1");
                    }

                    if (onlySnoozedEmails && buttonValue == "markAsRead") {
                        // no button
                    } else {
                        await generateNotificationButton(buttons, buttonsWithValues, buttonValue, params.emails, globalThis.otpCode);
                    }
                    
                    if (globalThis.otpCode) {
                        buttonValue = await storage.get("notificationButton1");
                    } else {
                        if (await shouldShowReducedDonationMsg()) {
                            buttonValue = "reducedDonationAd";
                        } else {
                            buttonValue = await storage.get("notificationButton2");
                        }				
    
                    }

                    await generateNotificationButton(buttons, buttonsWithValues, buttonValue, params.emails);
                    
                    var options;

                    if (params.emails.length == 1) {
                        // single email
                        
                        if (notificationFlagForLabelsOfNewestEmail || params.testType) {
                            var fromName = await generateNotificationDisplayName(firstEmail);
        
                            var subject = "";
                            if (firstEmail.title) {
                                subject = firstEmail.title;
                                if (subject == null) {
                                    subject = "";
                                }
                            }
        
                            options = {
                                type: "basic",
                                title: "",
                                message: "",
                                iconUrl: iconUrl
                            }

                            if (params.resumeFromIdle && !firstEmail.unSnoozed) {
                                const timeElapsedMsg = getTimeElapsed(firstEmail.issued);
                                if (timeElapsedMsg) {
                                    options.title = `(${timeElapsedMsg}) `;
                                }
                            }

                            // Window Chrome notifications can display 2 bold + 3 regular lines
                            // Mac only 1 bold + 2 regular lines
                            // v2 seems new notifs in Windows can't display more lines https://jasonsavard.com/forum/discussion/comment/22748#Comment_22748
                            let manyLinesNotifs = false; //!DetectClient.isMac() && !DetectClient.isChromeOS();
                            let usingTitle = false;

                            if (accounts.length >= 2 && await storage.get("displayAccountReceivingEmail")) {
                                usingTitle = true;
                                options.title += await firstEmail.account.getEmailDisplayName();
                                if (manyLinesNotifs) {
                                    options.title += "\n";
                                }
                            }

                            let canUseTitle = manyLinesNotifs || !usingTitle;

                            let confidentialString = firstEmail.unSnoozed ? getMessage("snoozed") : getMessage("newEmail");
                            let prefixString = firstEmail.unSnoozed ? getMessage("snoozed") + ": " : "";
                            
                            if (notificationDisplay == "newEmail") {
                                if (canUseTitle) {
                                    options.title += confidentialString;
                                } else {
                                    options.message = confidentialString;
                                }
                            } else if (notificationDisplay == "from") {
                                if (canUseTitle) {
                                    options.title += prefixString + fromName;
                                } else {
                                    options.message = prefixString + fromName;
                                }
                            } else if (notificationDisplay == "from|subject") {
                                if (canUseTitle) {
                                    options.title += prefixString + fromName;
                                    options.message = subject;
                                } else {
                                    options.message = prefixString + fromName + "\n" + subject;
                                }
                            } else {
                                let emailMessage = await firstEmail.getLastMessageText({ maxSummaryLetters: 170, htmlToText:true, EOM_Message: " [" + getMessage("EOM") + "]" });
                                emailMessage ||= "";
                                emailMessage = shortenUrls(emailMessage);

                                console.log("emailmessage", emailMessage);

                                if (canUseTitle) {
                                    options.title += prefixString + formatEmailNotificationTitle(fromName, subject);
                                    options.message = emailMessage;
                                } else {
                                    options.message = prefixString + formatEmailNotificationTitle(fromName, subject) + "\n" + emailMessage;
                                }
                            }
                            
                            if (supportsNotificationButtons()) {
                                options.buttons = buttons;
                            }
                            
                            const email = params.emails.first();
                            let responses;
                            try {
                                responses = await Promise.allSettled([preloadProfilePhoto(email), fetchEmailImagePreview(firstEmail)]);
                                responses.forEach(result => {
                                    if (result.status == "rejected") {
                                        console.warn("notif image error", result.reason);
                                    }
                                });
                            } catch (error) {
                                console.warn("preloadProfilePhotos warn", error);
                            } finally {
                                let fetchEmailImagePreviewResult;
                                if (responses && responses[1]) {
                                    fetchEmailImagePreviewResult = responses[1].value;
                                }

                                if (email.contactPhotoUrl) {									
                                    console.log("iconUrl: " + email.contactPhotoUrl);
                                    options.iconUrl = email.contactPhotoUrl;
                                } else {
                                    if (fetchEmailImagePreviewResult?.detectedIconUrl) {
                                        options.iconUrl = fetchEmailImagePreviewResult.detectedIconUrl;
                                    }
                                }

                                if (fetchEmailImagePreviewResult?.src) {
                                    options.type = "image";
                                    options.imageUrl = fetchEmailImagePreviewResult.src;
                                }

                                await createNotification({
                                    options: options,
                                    buttonsWithValues: buttonsWithValues,
                                    emails: params.emails,
                                    soundSource: params.soundSource
                                });

                                if (notificationFlagForLabelsOfNewestEmail) {
                                    return;
                                } else {
                                    return NOTIFICATION_DISABLE_WARNING;
                                }
                            }
                        } else {
                            var warning = "Notification disabled for this email";
                            console.warn(warning);
                            return warning;
                        }
                    } else {
                        const emailsWithNotifications = [];
                        const items = [];

                        for (const email of params.emails) {
                            
                            console.log("item.push:", email);

                            const notificationPerEmail = await email.account.getSetting("notifications");
                            const notificationFlagForLabelsOfEmail = await getSettingValueForLabels(email.account, notificationPerEmail, email.labels, desktopNotification);
    
                            if (notificationFlagForLabelsOfEmail) {
                                emailsWithNotifications.push(email);

                                let prefix = email.unSnoozed ? getMessage("snoozed") + ": " : "";
                            
                                let subject = email.title;
                                if (subject) {
                                    subject = await sendToOffscreenDoc("htmlToText", subject);
                                }
                                subject ||= "";
                                
                                const item = {};
                                
                                if (notificationDisplay == "from") {
                                    item.title = prefix + await generateNotificationDisplayName(email);
                                    item.message = "";
                                } else if (notificationDisplay == "from|subject") {
                                    item.title = prefix + await generateNotificationDisplayName(email);
                                    item.message = subject;
                                } else {
                                    item.title = prefix + formatEmailNotificationTitle(await generateNotificationDisplayName(email), subject);
                                    let message = await email.getLastMessageText();
                                    if (message) {
                                        message = await sendToOffscreenDoc("htmlToText", message);
                                    }
                                    message ||= "";
                                    item.message = message;
                                }
    
                                const MAX_CHARACTERS_PER_MULTI_NOTIFICATION_LINE = 30;
                                item.title = ellipsis(item.title, MAX_CHARACTERS_PER_MULTI_NOTIFICATION_LINE);
                                
                                items.push(item);
                            }
                        }

                        options = {
                            message: "",
                            iconUrl: iconUrl
                        }
                        
                        if (supportsNotificationButtons()) {
                            options.buttons = buttons;
                        }

                        if (notificationDisplay == "newEmail") {
                            options.type = "basic";
                        } else {
                            if (false) { // commented because native Windows notifications didnt actually list more than 1 item...
                                options.type = "list";
                                options.items = items;
                            } else {
                                options.type = "basic";
                                var str = "";
                                items.forEach((item, index) => {
                                    str += item.title; // + " - " + item.message.summarize(10);
                                    if (index < items.length-1) {
                                        str += "\n";
                                    }
                                });
                                options.message = str;
                            }
                        }

                        var newEmailsCount;
                        // because i use a max fetch the total unread email count might not be accurate - so if user is just signing in or startup then fetch the totalunread instead of the emails.length  
                        if (await storage.get("accountAddingMethod") == "oauth" && (params.source == Source.SIGN_IN || params.source == Source.STARTUP)) {
                            newEmailsCount = params.totalUnread;
                        } else {
                            newEmailsCount = emailsWithNotifications.length;
                        }

                        options.title = "";

                        if (params.resumeFromIdle && !params.unsnoozedEmails.length) {
                            const timeElapsedMsg = getTimeElapsed(firstEmail.issued);
                            if (timeElapsedMsg) {
                                options.title = `(${timeElapsedMsg}) `;
                            }
                        }

                        if (params.unsnoozedEmails.length) {
                            options.title += getMessage("XSnoozedEmails", [params.unsnoozedEmails.length]);
                            if (newEmailsCount) {
                                options.title += "\n";
                            }
                        }
                        if (newEmailsCount) {
                            options.title += getMessage("XNewEmails", [newEmailsCount]);
                        }

                        await createNotification({
                            options: options,
                            buttonsWithValues: buttonsWithValues,
                            emails: emailsWithNotifications,
                            soundSource: params.soundSource
                        });
                    }
                } else {
                    // notification are probably set to Off
                    return "Notification settings are incorrect";
                }							
            } else {
                console.info("failed: passedDoNotShowNotificationIfGmailTabOpenTest");
            }
        }
    } else {
        return "Notifications are probably disabled in the extension";
    }
}

async function getAccountWithNewestMail() {
    const newestAccountId = await storage.get("_newestAccountId");
    if (newestAccountId != null) {
        return getAccountById(newestAccountId);
    }
}

async function showNotificationTest(params = {}) {
    await initMisc();

    const response = await ensureUserHasUnreadEmails();
    if (response.hasUnreadEmails) {
        
        const accountWithNewestMail = await getAccountWithNewestMail();
        params.accountWithNewestMail = accountWithNewestMail;

        if (params.showAll) {
            // fetch all unread emails
            params.newEmails = getAllUnreadMail(accounts);
        } else {
            // first only one unread email			
            var email;
            if (params.accountWithNewestMail) {
                email = params.accountWithNewestMail.getNewestMail();			
                if (!email) {
                    // else get most recent mail (not the newest because it might not have been fetch recently, this shwnotif could be done after a idle etc.)
                    email = params.accountWithNewestMail.getMails().first();
                }
            }
            if (!email) {
                email = getAnyUnreadMail();
            }
            
            // put one email into array to pass to shownotification
            params.newEmails = [email];
        }

        params.soundSource = await getNotificationSoundSource(await storage.get("notificationSound"), accountWithNewestMail);
        
        let timeoutLength;
        if (webNotification) {
            timeoutLength = 500;
        } else {
            timeoutLength = 0;
        }
        await closeWebNotifications();
        await sleep(timeoutLength);
        await showNotification(params).then(warning => {
            if (warning) {
                throw new Error(warning);
            }
        }).catch(error => {
            throw new Error("Error: " + error + " You might have disabled the notifications");
        });
    } else {
        throw new Error(params.requirementText);
    }
}

async function createNotification(params) { // expected args: options, buttonsWithValues, emails
    // remove previous notifications
    if (await storage.get("recycleNotification")) {
        await clearRichNotification(await storage.get("_richNotifId"));
    }

    // let's identify my notification with the mini icon IF we aren't already showing the extension logo in the notification iconurl
    if (DetectClient.isWindows() && params.options.iconUrl != Icons.NotificationLogo) {
        params.options.appIconMaskUrl = Icons.AppIconMaskUrl;
    }
    if (DetectClient.isFirefox()) {
        params.options.priority = 2;
    } else {
        // v2 changed !DetectClient.isMac() to DetectClient.isWindows() because linux notification was not disappearing: https://jasonsavard.com/forum/discussion/comment/33851#Comment_33851
        // if never and disble requireInteraction and chrome "show notifications in action center" then they will automatically go into action center after ~5 seconds
        // requireInteraction will awake computer if screen is off
        if (DetectClient.isWindows() && (!await storage.get("moveIntoActionCenter") && await storage.get("notificationWakesUpScreenTemporarily"))) {
            params.options.requireInteraction = true;
        }
        params.options.silent = getNotificationSilentFlag(params.soundSource); // only disables Windows notification sound (Chrome 71 still turns screen on)
    }
    
    const showNotificationDuration = await storage.get("showNotificationDuration");
    
    if (showNotificationDuration == "infinite") {
        if (!DetectClient.isMac()) { // refer to https://jasonsavard.com/forum/discussion/comment/34928#Comment_34928
            params.options.requireInteraction = true;
        }
    } else {
        setTimeout(async () => {
            const richNotifId = await storage.get("_richNotifId");
            if (richNotifId) {
                console.log("timeout close notif: " + richNotifId);
                globalThis.notificationClosedByDuration = true;
                clearRichNotification(richNotifId);
            }
        }, seconds(showNotificationDuration));
    }

    console.log("show notif", params.options, new Date());
        
    try {
        const notificationId = await chrome.notifications.create("", params.options);
        storage.set("_richNotifId", notificationId);
        storage.set("_richNotifButtonsWithValues", params.buttonsWithValues);
        return notificationId;
    } catch (error) {
        console.error("create error: " + error);
        if (!params.secondAttempt && error.toString().includes("Unable to download all specified images")) {
            params.options.iconUrl = Icons.NotificationLogo;

            if (params.options.type == "image") {
                params.options.type = "basic";
                params.options.imageUrl = null;
                //params.options.message = "";
            } else {
                params.options.imageUrl = null;
            }

            params.secondAttempt = true;
            const notificationId = await createNotification(params);
            return notificationId;
        } else if (!params.secondAttempt && error.toString().includes("requireInteraction")) {
            params.options.requireInteraction = null;
            const notificationId = await createNotification(params);
            return notificationId;
        } else {
            throw error;
        }
    }
}

async function getChromeWindowOrBackgroundMode() {
    if (chrome.permissions && !DetectClient.isFirefox()) {
        try {
            const result = await chrome.permissions.contains({ permissions: ["background"] });
            if (result) {
                return;
            }
        } catch (error) {
            console.warn(error);
        }
    }
    
    const windows = await chrome.windows.getAll(null);
    if (windows?.length) {
        return;
    } else {
        throw Error("No windows exist");
    }
}

async function getAllEmails(params) {
    console.log("getAllEmails");
    const getEmailsCallbackParams = [];
    unauthorizedAccounts = 0;
    const promises = params.accounts.map(account => {
        return account.getEmails({refresh: params.refresh}).then(params => {
            getEmailsCallbackParams.push(params);
        }).catch(error =>  {
            if (isUnauthorized(error)) {
                console.log("unauthorized", error);
                unauthorizedAccounts++;
            }
            throw error;
        });
    });
    await Promise.allSettled(promises);
    await storage.set("unauthorizedAccounts", unauthorizedAccounts);
    return getEmailsCallbackParams;
}

async function checkEmails(source) {
    const MAX_SECONDS_FOR_STARTUP = 5;
    if (serviceWorkerStartupTime?.diffInSeconds() > -MAX_SECONDS_FOR_STARTUP) {
        console.log("Just started so bypass checkEmails");
        return;
    }

    try {
        await getChromeWindowOrBackgroundMode();
    } catch (error) {
        console.warn("Maybe NO chromeWindowOrBackgroundMode, possible error: " + error);
        return;
    }

    let intervalStopped = false;

    // Jan 23, 2025: refactored to try fixing this issue #392: multiple duplicate notifications show consecutively after some online issues, refactor checkingEmails flag to be set outside of this logic
    if (checkingEmails) {
        console.log("currently checking emails so bypass instant check");
        return;
    } else if (source == "wentOnline") { // || source == "wakeupFromSleep"
        intervalStopped = true;
        console.log("check now for emails");
        // stop checking interval
        chrome.alarms.clear(Alarms.CHECK_EMAILS);
    }
    
    checkingEmails = true;

    let allEmailsCallbackParams;
    try {
        allEmailsCallbackParams = await getAllEmails({accounts:accounts});

        const accountsSummary = await getAccountsSummary(accounts);
        if (accountsSummary.allSignedOut) {
            if (accounts.length) {
                console.warn("All signed out, unauth: " + (await storage.get("unauthorizedAccounts")));
                if (await storage.get("accountAddingMethod") == "autoDetect") {
                    accounts = [];
                    setSignedOut();
                }
            }
        } else {
            await mailUpdate({
                showNotification: true,
                allEmailsCallbackParams: allEmailsCallbackParams
            });
        }
    } finally {
        checkingEmails = false;
    }

    if (intervalStopped) {
        // resume checking interval
        restartCheckEmailTimer();
    }

    return allEmailsCallbackParams;
}

async function startCheckEmailTimer(delayInMinutes) {
	let pollIntervalTime = await calculatePollingInterval(accounts);
	
	if (pollIntervalTime == "realtime") {
		pollIntervalTime = minutes(5);
	} else {
		// make sure it's not a string or empty because it will equate to 0 and thus run all the time!!!
		// make sure it's not too small like 0 or smaller than 30 seconds
		if (isNaN(pollIntervalTime) || parseInt(pollIntervalTime) < seconds(30)) {
			pollIntervalTime = seconds(30);
		}
	}
	
    console.log("polling interval: " + (pollIntervalTime / ONE_SECOND) + "s");

    const alarmOptions = {
        periodInMinutes: pollIntervalTime / ONE_MINUTE
    };
    if (delayInMinutes) {
        alarmOptions.delayInMinutes = delayInMinutes;
    }

    chrome.alarms.create(Alarms.CHECK_EMAILS, alarmOptions);
}

function restartCheckEmailTimer(immediately) {
	console.log("restarting check email timer: " + immediately)
	chrome.alarms.clear(Alarms.CHECK_EMAILS);
	
	// wait a little bit before restarting timer to let it's last execution run fully
    if (immediately) {
        startCheckEmailTimer();
    } else {
        startCheckEmailTimer(0.5);
    }
}

function shortcutNotApplicableAtThisTime(title) {
    showWebNotification(title, {
        body: "Click here to remove this shortcut.",
        icon: Icons.NotificationLogo,
        tag: NotificationTags.SHORTCUT_NOT_APPLICABLE_AT_THIS_TIME,
        newNotificationOnClick: async () => {
            openUrl("https://jasonsavard.com/wiki/Keyboard_shortcuts");
        }
    });
}

// execute action on all mails
function executeAction(mails, actionName) {
	if (mails.length <= MAX_EMAILS_TO_ACTION) {
		const promises = mails.map(mail => mail[actionName]({instantlyUpdatedCount:true}));
		
		Promise.all(promises).then(async () => {
			if (actionName != "star" && actionName != "starAndArchive") {
				if (await storage.get("accountAddingMethod") == "oauth") {
                    await storage.set("unreadCount", await storage.get("unreadCount") - mails.length);
				}
				updateBadge();
			}
		}).catch(async error => {
			const extensionConflictFlag = await storage.get("accountAddingMethod") == "autoDetect";
			showCouldNotCompleteActionNotification(error, extensionConflictFlag);
		});
	} else {
		showMessageNotification("Error in Checker Plus", "Too many emails to " + actionName + " , please use the Gmail webpage!");
		mails.first().account.openInbox();
	}
}

async function openInPopup(params = {}) {
	let url = getPopupFile("notification");
	
	if (params.previewMail) {
        const notifMails = await restoreLastNotifParams(true);
        if (notifMails.length == 1) {
            const mail = notifMails.first();
            url += "&previewMailId=" + mail.id;
        }
	}

    const windowId = await storage.get(LS_POPUP_WINDOW_ID);
	if (windowId) {
		await storage.remove(LS_POPUP_WINDOW_ID);
		chrome.windows.remove(parseInt(windowId), () => {
            if (chrome.runtime.lastError) {
                //console.warn(chrome.runtime.lastError.message);
            }
        });
	}
	
	const createWindowParams = await getPopupWindowSpecs({
        width: await storage.get("popupWidth"),
        height: await storage.get("popupHeight"),
        url: url,
    });
	const newWindow = await createWindow(createWindowParams);
    await storage.set(LS_POPUP_WINDOW_ID, newWindow.id);

	if (params.notificationId) {
		clearRichNotification(params.notificationId);
	}
}

async function performButtonAction(params) {
    console.log("notificationButtonValue: " + params.notificationButtonValue);
    const notifMails = await restoreLastNotifParams(true);
	
	// actions...
	if (params.notificationButtonValue == "markAsRead") {
		executeAction(notifMails, "markAsRead");
		clearRichNotification(params.notificationId);
	} else if (params.notificationButtonValue == "delete") {
		executeAction(notifMails, "deleteEmail");
		clearRichNotification(params.notificationId);
	} else if (params.notificationButtonValue == "archive") {
		executeAction(notifMails, "archive");
		clearRichNotification(params.notificationId);
	} else if (params.notificationButtonValue == "spam") {
		executeAction(notifMails, "markAsSpam");
		clearRichNotification(params.notificationId);
	} else if (params.notificationButtonValue == "star") {
		executeAction(notifMails, "star");
		clearRichNotification(params.notificationId);
	} else if (params.notificationButtonValue == "starAndArchive") {
		executeAction(notifMails, "starAndArchive");
		clearRichNotification(params.notificationId);
	} else if (params.notificationButtonValue == "open" || params.notificationButtonValue == "openInNewTab") {
		var openParams = {};
		if (params.notificationButtonValue == "openInNewTab") {
			openParams.openInNewTab = true;
		}
		
		if (notifMails.length == 1) {
			notifMails.first().open(openParams);
		} else {
			notifMails.first().account.openInbox(openParams);
		}
		clearRichNotification(params.notificationId);
	} else if (params.notificationButtonValue == "openInPopup" || params.notificationButtonValue == "replyInPopup") {
        params.previewMail = true;
		openInPopup(params);
	} else if (params.notificationButtonValue == "reply") {
		if (notifMails.length == 1) {
			notifMails.first().reply();
		} else {
			notifMails.first().account.openInbox();
		}
		clearRichNotification(params.notificationId);
	} else if (params.notificationButtonValue == "markDone") {
		executeAction(notifMails, "archive");
		clearRichNotification(params.notificationId);
	} else if (params.notificationButtonValue == "dismiss") {
		clearRichNotification(params.notificationId);
	} else if (params.notificationButtonValue == "reducedDonationAd") {
		await storage.enable("reducedDonationAdClicked");

		clearRichNotification(params.notificationId);
    } else if (params.notificationButtonValue == "otp-code") {
        const width = 180;
        const height = 180;
        const position = await getCenterWindowPosition(width, height);
        await createWindow({
            url: chrome.runtime.getURL(`otp-code.html?otpCode=${globalThis.otpCode}`),
            width: width,
            height: height,
            left: position.left,
            top: position.top,
            type: "popup",
        });
        clearRichNotification(params.notificationId);

        try {
            const mail = await findMailById(notifMails.first().id);
            const response = await mail.markAsRead();
            if (await storage.get("deleteAfterOTP")) {
                await mail.deleteEmail();
            }
            console.log("all good", response);
        } catch (error) {
            console.warn("ignore mark as read errors after copying otp code", error);
        }
	} else {
		logError("action not found for notificationButtonValue: " + params.notificationButtonValue);
	}
	
	//sendGA("richNotification", params.notificationButtonValue);
}

function markAllAsRead() {
	accounts.forEach(account => {
		if (account.unreadCount >= 1) {
			if (account.unreadCount > MAX_EMAILS_TO_ACTION) {
                showWebNotification(getMessage("tooManyUnread", MAX_EMAILS_TO_ACTION));
			} else {
				markAllAsX(account, "markAsRead").then(() => {
					// do nothing
				}).catch(error => {
					showMessageNotification("Checker Plus Error", "Can't mark as read", error);
				});
			}
		}
	});
}

function createContextMenu(id, text, params = {}) {
    if (id) {
        params.id = id;
    }

	if (!params.title && text) {
		params.title = text;
	}

	if (!params.contexts) {
		params.contexts = ["action"];
	}

	return chrome.contextMenus.create(params, () => {
        if (chrome.runtime.lastError) {
            if (!chrome.runtime.lastError.message.includes("duplicate id")) {
                console.error("error with menu id: " + id + " " + chrome.runtime.lastError.message);
            }
        }
    });
}

async function initWebRequest() {
    chrome.webRequest.onCompleted.addListener(
        async function(details) {
            if (details.url?.includes("/data")) { // only had to intercept this url  https://mail.google.com/mail/u/0/data ...
                await storage.init("webrequest");
                if (await storage.get("voiceInput")) {
                    console.log("oncomplete webrequest:", details);
                    
                    // added timeout because in compose popup window it seems the inserts were not working
                    await sleep(200);
                    insertSpeechRecognition(details.tabId);
                }
            }
        },
        {
            types:	["sub_frame"],
            urls:	["https://mail.google.com/mail/u/*"]
        }
    );

    const headerOptions = ["requestHeaders"]
    if (!DetectClient.isFirefox()) {
        headerOptions.push("extraHeaders");
    }

    chrome.webRequest.onBeforeSendHeaders.addListener(
        function(details) {
            console.log("onBeforeSendHeaders:", details);
            for (var a = 0; a < details.requestHeaders.length; a++) {
                const header = details.requestHeaders[a];
                if ("cookie" === header.name.toLowerCase()) {
                    const previousAt = at;
                    at = header.value.split("GMAIL_AT=")[1]?.split(";")[0];
                    if (at && at != previousAt && at != UNDEFINED_AT) {

                        // had to place this updateDynamicRules here because seems AT is not a variable below - it's hardcoded once it's set
                        chrome.declarativeNetRequest.updateDynamicRules({
                            removeRuleIds: [RuleIds.GMAIL_AT_BLOCKING],
                            addRules: [
                                {
                                    id: RuleIds.GMAIL_AT_BLOCKING,
                                    priority: 1,
                                    action: {
                                        type: "redirect",
                                        redirect: {
                                            transform: {
                                                queryTransform: {
                                                    addOrReplaceParams: [{
                                                        key: "at",
                                                        value: at
                                                    }]
                                                }
                                            },
                                        },
                                    },
                                    condition: {
                                        urlFilter: "https://mail.google.com/mail/u/0/s/*&at=" + MUI + "*",
                                        resourceTypes: [chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST]
                                    },
                                },
                            ],
                        });
                    }

                    break;
                }
            }
        },
        {
            types: ["xmlhttprequest"],
            urls: [
                "https://mail.google.com/mail/u/0/s/*&at=*",
            ]
        },
        headerOptions
    );

    chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [RuleIds.GMAIL_MOBILE_USER_AGENT],
        addRules: [
            {
                id: RuleIds.GMAIL_MOBILE_USER_AGENT,
                priority: 1,
                action: {
                    type: "modifyHeaders",
                    requestHeaders: [
                        {
                            operation: "set",
                            header: "user-agent",
                            value: "Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 CrKey/1.00.000000" // seems the CrKey is needed for the mobile version
                        }
                    ],
                },
                condition: {
                    urlFilter: `https://mail.google.com/mail/mu/mp/*${MUI}*`,
                    resourceTypes: [chrome.declarativeNetRequest.ResourceType.SUB_FRAME]
                },
            },
        ],
    });
}

async function restoreLastNotifParams(emailsOnly) {
    let lastShowNotifParams = await storage.get("_lastShowNotifParams");
    if (lastShowNotifParams) {
        try {
            lastShowNotifParams = await Encryption.decryptObj(lastShowNotifParams, accountsReviver);
            if (emailsOnly) {
                if (lastShowNotifParams.emails) {
                    return convertMailsToObjects(lastShowNotifParams.emails);
                } else {
                    return [];
                }
            } else {
                lastShowNotifParams.newEmails = convertMailsToObjects(lastShowNotifParams.newEmails);
                lastShowNotifParams.unsnoozedEmails = convertMailsToObjects(lastShowNotifParams.unsnoozedEmails);
                return lastShowNotifParams;
            }
        } catch (error) {
            console.warn("ignore decrypt error", error);
        }
    }
}

if (chrome.idle.onStateChanged) {
    chrome.idle.onStateChanged.addListener(async newState => {
        // returned from idle state
        console.log("onstatechange: " + newState + " " + new Date().toString());
        if (newState == "active") {
            await storage.init();
            globalThis?.ChromeTTS?.stop?.();

            const MIN_SECONDS_BETWEEN_NOTIFICATIONS = 60;
            const lastNotificationDate = await storage.get("_lastNotificationDate");
            if (await storage.get("unreadCount") >= 1 && (Math.abs(lastNotificationDate.diffInSeconds()) > MIN_SECONDS_BETWEEN_NOTIFICATIONS || await detectSleepMode.isWakingFromSleepMode()) && await storage.get("_lastNotificationDateWhileActive") < lastNotificationDate) {
                // move parsing inside condition to lessen load
                
                const lastShowNotifParams = await restoreLastNotifParams();
                if (lastShowNotifParams) {
                    if (await storage.get("showNotificationsMissedWhileIdling")) {
                        lastShowNotifParams.resumeFromIdle = true;
                        lastShowNotifParams.skipSerializing = true;
                        lastShowNotifParams.accountWithNewestMail = await getAccountWithNewestMail();
                        lastShowNotifParams.soundSource = "";
                
                        if (lastShowNotifParams && !unreadEmailsChanged(lastShowNotifParams.newEmails) && lastShowNotifParams.newEmails.first().account.lastSuccessfulMailUpdate >= lastNotificationDate) {
                            showNotification(lastShowNotifParams);
                        }
                    }
                }
            }
        }
    });
}

// for adding mailto links (note: onUpdated loads twice once with status "loading" and then "complete"
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status == "loading") {

        var alreadyDetectedInbox = false;
        
        if (tab.url) {
            if (tab.url.indexOf(MAIL_DOMAIN + MAIL_PATH) == 0) {
                await initMisc();
                await storage.setDate("_lastCheckedEmail");

                if (accounts) {
                    const allAccounts = accounts.concat(ignoredAccounts);
                    allAccounts.some(account => {
                        if (tab.url.indexOf(account.getMailUrl()) == 0) {
                            console.log("Gmail webpage changed: " + tab.url);
                            alreadyDetectedInbox = true;
                            
                            const ignoredAccount = ignoredAccounts.some(ignoredAccount => ignoredAccount.getMailUrl() == account.getMailUrl());
                            if (!ignoredAccount) {
                                // only fetch emails if user is viewing an email ie. by detecting the email message id ... https://mail.google.com/mail/u/0/?shva=1#inbox/13f577bf07878472
                                if (/\#.*\/[a-z0-9]{16}/.test(tab.url)) {
                                    account.getEmails().then(() => {
                                        mailUpdate();
                                    }).catch(error => {
                                        // nothing
                                    });
                                }
                            }
                            
                            return true;
                        }
                    });
                }

                const accountsSummary = await getAccountsSummary(accounts);
    
                if (!alreadyDetectedInbox || accountsSummary.signedIntoAccounts == 0) {
                    console.log("Signed into Gmail");
                    pollAccounts({noEllipsis:true, source:Source.SIGN_IN});
                }
            }
            
            /* new order...
                * 
                * https://mail.google.com/mail/u/0/?logout&hl=en&hlor
                * https://accounts.youtube.com/accounts/Logout2?hl=en&service=mail&ilo=1&ils=…s%3D1%26scc%3D1%26ltmpl%3Ddefault%26ltmplcache%3D2%26hl%3Den&zx=2053747305 
                * http://www.google.ca/accounts/Logout2?hl=en&service=mail&ilo=1&ils=s.CA&ilc…%3D1%26scc%3D1%26ltmpl%3Ddefault%26ltmplcache%3D2%26hl%3Den&zx=-1690400221
                * https://accounts.google.com/ServiceLogin?service=mail&passive=true&rm=false…=https://mail.google.com/mail/&ss=1&scc=1&ltmpl=default&ltmplcache=2&hl=en    
                */
            const PREVENT_CPU_ISSUE_MAX_URL_LENGTH = 1000; // patch to prevent cpu issue when opening a tab with a long url ie. data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ...
            if (tab.url.length < PREVENT_CPU_ISSUE_MAX_URL_LENGTH && /.*google\..*\/accounts\/Logout*/i.test(tab.url)) { //if (tab.url.includes("://www.google.com/accounts/Logout")) {
                await initMisc();
                const accountAddingMethod = await storage.get("accountAddingMethod");
                if (accountAddingMethod == "autoDetect") {
                    accounts = [];
                    setSignedOut();
                } else if (accountAddingMethod == "oauth") {
                    // reset account id
                    accounts.forEach(account => {
                        account.mustResync = true;
                        account.resyncAttempts = 3;
                    });
                    serializeAccounts(accounts, {source: "signout"});
                }
            }
        }
    } else if (changeInfo.status == "complete") {

    }
});

if (chrome.webRequest) {
    initWebRequest();
}

if (chrome.storage) {
    chrome.storage.onChanged.addListener(function(changes, areaName) {
        console.log("storage changes " + new Date() + " : ", changes, areaName);
    });
}

if (chrome.commands) {
    chrome.commands.onCommand.addListener(async command => {
        // patch for firefox only becaues they don't have active extension option by default and had to add this code above because required user action and i had async code below
        if (command == "activateExtension") {
            chrome.action.openPopup();
            return;
        }

        await initMisc();
        var errorFlag;
        var errorMsg;
        const richNotifId = await storage.get("_richNotifId");
        if (command == "markAsReadInNotificationWindow") {
            errorMsg = "Cannot mark email as read because there are no email notifications visible";
            if (await storage.get("desktopNotification") != "rich") {
                if (webNotification) {
                    if (webNotification.tag.includes("email_")) {
                        const emailId = webNotification.tag.split("email_")[1];
                        const email = findMailById(emailId);
                        if (email) {
                            email.markAsRead();
                        }
                        closeWebNotifications();
                        
                        if (await storage.get("accountAddingMethod") == "autoDetect") {
                            if (await storage.get("unreadCount") >= 1) {
                                const offset = -1;
                                updateBadge({
                                    totalUnread: await storage.get("unreadCount") + offset,
                                    offset: offset
                                });
                            }
                        }
                    }
                } else {
                    errorFlag = true;
                }
            } else {
                // rich notif
                if (richNotifId) {
                    performButtonAction({notificationButtonValue:"markAsRead", notificationId:richNotifId});
                } else {
                    errorFlag = true;
                }
            }
        } else if (command == "openEmailDisplayedInNotificationWindow") {
            errorMsg = "Cannot open email because there are no email notifications visible";
            if (await storage.get("desktopNotification") != "rich") {
                if (webNotification) {
                    if (webNotification.tag.includes("email_")) {
                        const emailId = webNotification.tag.split("email_")[1];
                        const email = findMailById(emailId);
                        if (email) {
                            email.open();
                        }
                        closeWebNotifications();
                        
                        if (await storage.get("accountAddingMethod") == "autoDetect") {
                            if (await storage.get("unreadCount") >= 1) {
                                const offset = -1;
                                updateBadge({
                                    totalUnread: await storage.get("unreadCount") + offset,
                                    offset: offset
                                });
                            }
                        }
                    }
                } else {
                    errorFlag = true;
                }
            } else {
                // rich notif
                if (richNotifId) {
                    performButtonAction({notificationButtonValue:"open", notificationId:richNotifId});
                } else {
                    errorFlag = true;
                }
            }
        } else if (command == "compose") {
            accounts[0].openCompose();
        } else if (command == "quickComposeEmail") {
            openQuickCompose();
        } else if (command == "refresh") {
            setBadgeEllipsis();
            refreshAccounts();
        } else if (command == "markAllAsRead") {
            markAllAsRead();
        } else if (command == "dnd") {
            isDND().then(dndState => {
                if (dndState) {
                    setDND_off();
                } else {
                    setDND_indefinitely();
                }
            });
        }
        
        if (errorFlag) {
            shortcutNotApplicableAtThisTime(errorMsg);
        }
        
    });
}

chrome.runtime.onMessage.addListener(/* DONT USE ASYNC HERE because of return true */ (message, sender, sendResponse) => {
    (async function() {
        try {
            // reconstruct params to because of firefox issue "The object could not be cloned."
            if (message.stringifyParams) {
                message.params = JSON.parse(message.params);
            }

            if (message.command == "indexedDBSettingSaved") {
                syncOptions.storageChanged({key:message.key});
                sendResponse();
            } else if (message.command == "openTabInBackground") {
                await chrome.tabs.create({ url: message.url, active: false });
                sendResponse();
            } else if (message.command == "getVoiceInputSettings") {
                await storage.init("voiceinput");
                sendResponse({
                    voiceInputSuggestions: await storage.get("voiceInputSuggestions"),
                    voiceInputDialect: await storage.get("voiceInputDialect")
                });
            } else if (message.command == "chromeTTS") {
                if (message.stop) {
                    globalThis?.ChromeTTS?.stop?.(); // if you diable and renable extenion seems ChromeTTS is not found
                } else if (message.isSpeaking) {
                    sendResponse(ChromeTTS.isSpeaking());
                } else {
                    await ChromeTTS.queue(message.text);
                    sendResponse();
                }
            } else if (message.command == "accountAction") {
                await initMisc();
                
                const account = getAccountById(message.params.account.id);
                const response = await account[message.params.action](message.params.actionParams);
                sendResponse(response);
            } else if (message.command == "removeAllAccountsAccess") {
                await initMisc();

                removeAllCachedTokens();

                const promises = accounts.map(account => {
                    return account.removeAccessToken();
                });

                try {
                    await Promise.all(promises);
                    sendResponse("Done");
                } catch (error) {
                    console.error(error);
                    sendResponse({error: error});
                }
            } else if (message.command == "removeAllAccounts") {
                await initMisc();

                const promises = accounts.map(account => {
                    return account.remove();
                });

                try {
                    await Promise.all(promises);
                    sendResponse("Done");
                } catch (error) {
                    console.error(error);
                    sendResponse({error: error});
                }
            } else if (message.command == "mailAction") {
                await initMisc();

                console.log("mailAction", message);

                let mail = findMailById(message.params.mail.id);
                if (!mail) {
                    console.warn("mail not found might have removed by markasread or other");
                    mail = convertMailToObject(message.params.mail);
                    mail.account = getAccountById(message.params.mail.account.id);
                }

                // patch to fetch correct "from" email when user user as sendAs, cause messages are sometimes only fetched from the preview window, so I must put it to the back end so i can generate the reply object. ref: https://jasonsavard.com/forum2/d/8244-replies-in-the-popup-are-not-being-sent-from-the-address-in-the-original-e-mail-being-replied-to/9
                const messages = message.params.actionParams?.messages;
                if (message.params.action == "postReply" && !mail.messages?.length && messages) {
                    console.log("patch to to retrieve correct sendAs");
                    mail.messages = messages;
                }

                try {
                    const response = await mail[message.params.action](message.params.actionParams);
                    sendResponse(response);
                } catch (error) {
                    console.error("mailaction error", error);
                    const errorResponse = {
                        error: {
                            message: error.message,
                            cause: error.cause
                        }
                    }
                    copyObj(error, errorResponse.error);
                    sendResponse(errorResponse);
                }
            } else if (message.command == "cancelReply") {
                clearTimeout(globalThis.replyingTimeout);
            } else if (message.command == "switchToOauth") {
                await initMisc();
                // filter out accounts that have no token (we're probably never granted access)
                const filteredAccounts = [];
                for (const account of accounts) {
                    const tokenResponse = await oAuthForEmails.findTokenResponse(account.getEmail());
                    if (tokenResponse) {
                        account.setAccountAddingMethod("oauth");
                        filteredAccounts.push(account);
                    }
                }
                console.log("filtered", filteredAccounts);
                accounts = filteredAccounts;
                await serializeAccounts(accounts);
                sendResponse();
            } else if (message.command == "initOauthHybridAccount") {
                await initMisc();

                // only add if it doesn't already exist
                const tokenResponse = message.params.tokenResponse;
                let account = getAccountByEmail(tokenResponse.userEmail);

                try {
                    await account.fetchSendAs();
                } catch (error) {
                    // log but ignore error
                    console.error(error)
                }

                sendResponse();
            } else if (message.command == "addAccountViaOauth") {
                await initMisc();
                await initAllAccounts(); // make sure not to add duplicate accounts

                // only add if it doesn't already exist
                const tokenResponse = message.params.tokenResponse;
                let account = getAccountByEmail(tokenResponse.userEmail);
                if (!account) {
                    console.log("new account");
                    account = new Account();
                    account.init({
                        email: tokenResponse.userEmail,
                    });
                    await resetSettings([account]);
                    accounts.push(account);
                }

                try {
                    await account.fetchSendAs();
                } catch (error) {
                    // log but ignore error
                    console.error(error)
                }
                
                await account.getEmails();
                let syncSignInIdError;
                try {
                    await account.syncSignInId();
                } catch (error) {
                    console.warn("Sign in order error", error);
                    account.setAccountId(accounts.length - 1);
                    syncSignInIdError = error;
                }
                await mailUpdate();

                const poll = await storage.get("poll");
                if (poll == "realtime") {
                    try {
                        await account.enablePushNotifications();
                    } catch (error) {
                        // ignore error
                        console.warn(error);
                    }
                    restartCheckEmailTimer(true);
                }
                sendResponse({syncSignInIdError: syncSignInIdError});
            } else if (message.command == "markAllAsX") {
                await initMisc();

                const account = getAccountById(message.params.account.id);
                await markAllAsX(account, message.params.action, message.params.closeWindow);
                sendResponse();
            } else if (message.command == "sendPageLink") {
                await initMisc();

                const account = getAccountById(message.params.account.id);
                await sendPageLink(null, message.params.tab, account);
                sendResponse();
            } else if (message.command == "resetInitMiscWindowVars") {
                delete globalThis.initMiscPromise;
                sendResponse();
            } else if (message.command == "online-status") {
                console.log("from offscreen online-status", message.status);
                offlineOnlineChanged({
                    type: message.status,
                    source: "offscreen"
                })
                sendResponse();
            } else if (message.command == "firestore-message") {
                onRealtimeMessageReceived(message.data, "firebase");
                sendResponse();
            } else if (message.command == "unread-count-change-gmail-ui") {
                console.log("🔔 Unread count changed in bg:", new Date(), message.unreadCount);
                if (await storage.get("accountAddingMethod") == "autoDetect" && parseInt(await storage.get("poll")) <= 30000) {
                    checkEmails("unread-count-change-gmail-ui");
                }
                sendResponse();
            } else if (typeof globalThis[message.command] == "function") { // map fn string names directly to calling their fn
                console.log("onMessage: " + message.command);
                const response = await globalThis[message.command](message.params);
                sendResponse(response);
            } else {
                console.warn("No matching command for " + message.command + " might be captured in other pages.");
            }
        } catch (error) {
            console.error(error);
            sendResponse({
                error: error.message || error
            });
        }
    })();

    return true;
});

function initContextMenus() {
    if (chrome.contextMenus) {

        chrome.contextMenus.removeAll().then(() => {
            createContextMenu(ContextMenu.OPEN_GMAIL, getMessage("openGmailTab"));
            createContextMenu(ContextMenu.COMPOSE, getMessage("compose"));
            createContextMenu(ContextMenu.REFRESH, getMessage("refresh"));

            initQuickContactContextMenu();

            createContextMenu(ContextMenu.DND_MENU, getMessage("doNotDisturb"));
            createContextMenu(ContextMenu.DND_OFF, getMessage("turnOff"), {parentId:ContextMenu.DND_MENU});
            createContextMenu(`sep: ${getUniqueId()}`, null, {parentId:ContextMenu.DND_MENU, type:"separator"});
            createContextMenu(ContextMenu.DND_30_MIN, getMessage("Xminutes", 30), {parentId:ContextMenu.DND_MENU});
            createContextMenu(ContextMenu.DND_1_HOUR, getMessage("Xhour", 1), {parentId:ContextMenu.DND_MENU});
            createContextMenu(ContextMenu.DND_2_HOURS, getMessage("Xhours", 2), {parentId:ContextMenu.DND_MENU});
            createContextMenu(ContextMenu.DND_4_HOURS, getMessage("Xhours", 4), {parentId:ContextMenu.DND_MENU});
            createContextMenu(ContextMenu.DND_8_HOURS, getMessage("Xhours", 8), {parentId:ContextMenu.DND_MENU});
            createContextMenu(ContextMenu.DND_TODAY, getMessage("today"), {parentId:ContextMenu.DND_MENU});
            createContextMenu(ContextMenu.DND_INDEFINITELY, getMessage("indefinitely"), {parentId:ContextMenu.DND_MENU});
            createContextMenu(`sep: ${getUniqueId()}`, null, {parentId:ContextMenu.DND_MENU, type:"separator"});
            createContextMenu(ContextMenu.DND_OPTIONS, getMessage("options") + "...", {parentId:ContextMenu.DND_MENU});

            try {
                createContextMenu(ContextMenu.MARK_ALL_AS_READ, getMessage("markAllAsRead"), {visible: false});
            } catch (error) {
                console.warn("visible property might not be supported: " + error);
            }
        });
    }
}

function setBadgeEllipsis() {
    chrome.action.setBadgeBackgroundColor({color: BadgeColor.EMOJI});
	if (chrome.action.setBadgeTextColor) {
		chrome.action.setBadgeTextColor({color: BadgeColor.WHITE});
	}
	chrome.action.setBadgeText({ text: "⏳" });
}

async function init(source) {
    console.log("init", source);

    if (initCalled) {
        // happens sometimes on startup and setpopup there is a race condition and init is called twice, once on startup and the other from setpopup with code ... setVia=manifest
        console.log("initCalled so ignore");
        return;
    } else {
        initCalled = true;
    }

	try {
        if (!DetectClient.isFirefox() && !chrome.runtime.getContexts) {
            showWebNotification("You must update your browser", {
                body: "To continue using Checker Plus you must update your browser. Click for more info.",
                icon: Icons.NotificationLogo,
                tag: NotificationTags.UNSTABLE_BROWSER_CHANNEL,
                newNotificationOnClick: async () => {
                    openUnstableWarningPage("no-contexts-api-notif");
                }
            });
        } else {
            let result = await chrome.storage.local.get(["detectedChromeVersion"]);
            const DAYS_TO_WAIT_BEFORE_DETECTING_VERSION_AGAIN = 90;
            if (!result.detectedChromeVersion || result.detectedChromeVersion === true || Math.abs(new Date(result.detectedChromeVersion).diffInDays()) > DAYS_TO_WAIT_BEFORE_DETECTING_VERSION_AGAIN) {
                chrome.storage.local.set({"detectedChromeVersion": new Date().toJSON()});
                result = await DetectClient.getChromeChannel();
                if (result.oldVersion) {
                    showWebNotification("You are using an old browser version", {
                        body: "Click for more info. Bugs might occur, but all issues will be ignored unless you update Chrome.",
                        icon: Icons.NotificationLogo,
                        tag: NotificationTags.UPDATE_BROWSER,
                        newNotificationOnClick: async () => {
                            openUpdateBrowserLink();
                        }
                    });
                } else if (result?.channel != "stable" && result?.channel != "extended") {
                    showWebNotification("You are not using the stable channel of Chrome", {
                        body: "Click for more info. Bugs might occur, but all issues will be ignored unless you update to stable channel of Chrome.",
                        icon: Icons.NotificationLogo,
                        tag: NotificationTags.UNSTABLE_BROWSER_CHANNEL,
                        newNotificationOnClick: async () => {
                            openUnstableWarningPage("notif");
                        }
                    });
                }
            }
        }
	} catch (e) {
		logError("error detecting chrome version: " + e);
	}
	
	if (!chrome.runtime.onMessage || !globalThis.Promise) {
		openUrl("https://jasonsavard.com/wiki/Old_Chrome_version");
		return;
    }
    
    // initialized here to detect disable/enable extension by removing the setVia=manifest
    chrome.action.setPopup({popup: getPopupFile("toolbar")});

	setBadgeEllipsis();
    chrome.action.setTitle({ title: getMessage("loadingSettings") + "..." });
    
	storagePromise.then(async () => {


        detectSleepMode.init();

        // START LEGACY

        if (await storage.get("repeatNotification") === true) {
            await storage.set("repeatNotification", 1);
        }

        // Feb 25th prepare for v3
        if (!await storage.get("detectedChromeVersion") && globalThis.localStorage?.["detectedChromeVersion"]) {
            storage.set("detectedChromeVersion", true);
        }

        // Sept. 25th 2023
        if (await storage.getRaw("showNotificationDuration") == 6) {
            storage.set("showNotificationDuration", 5);
        }

        // Dec 2023
        if (await storage.getRaw("poll") == "15000") {
            await storage.set("poll", "30000");
        }

        // END LAGACY

        await storage.set("unreadCount", 0);
        await initMisc({skipStorageInit: true});

        // begin small Sep 2024
        const rawSoundFile = await storage.getRaw("notificationSound");
        if (rawSoundFile?.includes(".ogg")) {
            await storage.set("notificationSound", rawSoundFile.replace(".ogg", ".mp3"));
        }

        let found = false;
        const emailSettings = deepClone(await storage.get("emailSettings"));
        
        if (emailSettings) {	
            try {
                for (const email in emailSettings) {
                    for (const label in emailSettings[email]?.sounds) {
                        const soundFile = emailSettings[email].sounds[label];
                        if (soundFile?.includes(".ogg")) {
                            found = true;
                            emailSettings[email].sounds[label] = soundFile.replace(".ogg", ".mp3");
                        }
                    }
                }								
            } catch (e) {
                console.error("error converting sounds to mp3", e);
            }
        }
        
        if (found) {
            console.log("converting");
            await storage.set("emailSettings", emailSettings);
        }

        // end small legacy
        

        buttonIcon.setIcon({signedOut: true});
        
        initContextMenus();
        initRealtimeSync();

        // call poll accounts initially then set it as interval below
        pollAccounts({showNotification:true, source:Source.STARTUP, refresh:true}).then(() => {
            // set check email interval here
            startCheckEmailTimer();
        }).catch(error => {
            console.error(error);
            showMessageNotification("Problem starting extension", "Try re-installing the extension.", error);
        });

        chrome.alarms.create(Alarms.EVERY_MINUTE,           { periodInMinutes: 1 });
        chrome.alarms.create(Alarms.EVERY_DAY,              { periodInMinutes: 60 * 24 });
        chrome.alarms.create(Alarms.UPDATE_CONTACTS,        { periodInMinutes: 60 * 4 }); // 4 hours (used to be every 24 hours)
        chrome.alarms.create(Alarms.UPDATE_SKINS,           { periodInMinutes: 60 * 24 * 1, delayInMinutes: generateRandomAlarmDelay() }); // 1 day (used to be every 2 days)
        chrome.alarms.create(Alarms.UPDATE_UNINSTALL_URL,   { periodInMinutes: 60 * 24 * 1, delayInMinutes: generateRandomAlarmDelay() }); // 1 day
        chrome.alarms.create(Alarms.SYNC_SIGN_IN_ORDER,     { periodInMinutes: 60 * 24 * 5, delayInMinutes: generateRandomAlarmDelay() }); // 5 days
        chrome.alarms.create(Alarms.SYNC_FETCH_SEND_AS,     { periodInMinutes: 60 * 24 * 5, delayInMinutes: generateRandomAlarmDelay() }); // 5 days
        chrome.alarms.create(Alarms.CLEAR_SUBJECTS_SPOKEN,  { periodInMinutes: 60 * 24 * 30, delayInMinutes: generateRandomAlarmDelay() }); // 30 days

        initAutomaticRestart();

        const GMAIL_PAGE_HOST = "https://mail.google.com/mail/u/*";
        const GMAIL_PAGE_SCRIPT = ["js/gmail-page.js"];

        chrome.scripting.registerContentScripts([{
            id: 'gmailPageScript',
            matches: [GMAIL_PAGE_HOST],
            js: GMAIL_PAGE_SCRIPT
        }]).catch(error => {
            console.warn("Error registering content script: " + error);
        })

        for (const tab of await chrome.tabs.query({url: GMAIL_PAGE_HOST})) {
            try {
                await chrome.scripting.executeScript({
                    target: {tabId: tab.id},
                    files: GMAIL_PAGE_SCRIPT,
                });
            } catch (error) {
                console.warn("error in executescript: " + error);
            }
        }
	}).catch(error => {
        console.error("init error", error);
		if (!globalThis.settingsError) {
			logError("starting extension: " + error, error);
			showMessageNotification("Problem starting extension", "Try re-installing the extension.", error);
		}
	});



    if (chrome.declarativeNetRequest?.onRuleMatchedDebug) {
        chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(info => {
            console.log("onRuleMatchedDebug", info);
        });
    }
}

function hasDuplicatedAccount(account) {
    // if duplicate email found then let's stop before it repeats
    const allAccounts = accounts.concat(ignoredAccounts);
	for (let a=0; a<allAccounts.length; a++) {
		if (account.getEmail().equalsIgnoreCase(allAccounts[a].getEmail())) {
			console.info("duplicate account " + account.getEmail() + " found so stop finding accounts, total: " + allAccounts.length);
			return true;
		} else {
			console.info("valid account: " + a + " [" + account.getEmail() + "] (" + account.link + ") AND [" + allAccounts[a].getEmail() + "] (" + allAccounts[a].link + ")");
		}
	}
}

async function addAccount(account) {
	if (await account.getSetting("ignore")) {
		console.info("initMailAccount - ignored");
		ignoredAccounts.push(account);
	} else {
		// success
		console.info("Adding account: " + account.getEmail());
		accounts.push(account);
	}
}

function isUnauthorized(error) {
    // test for error.toLowerCase because error could be an Error object (which doesn't have a .toLowerCase)
    return (error && (new String(error).toLowerCase() == "unauthorized" || error.errorCode == ErrorCodes.UNAUTHORIZED));
}

async function initMailAccount(params) {
    const MAX_ACCOUNTS = 20;
    
    if (globalThis.buttonIcon) {
        buttonIcon.stopAnimation();
    }
    
    var tokenResponse = await oAuthForEmails.findTokenResponseByIndex(params.accountNumber);
    let email;
    if (tokenResponse && tokenResponse.userEmail) {
        email = tokenResponse.userEmail;
    }
    
    // when using auto-detect use the accountnumber and eventually the email will get populated with the fetch
    // when using oauth use the email passed in here to fetch the appropriate data
    const account = new Account();
    account.init({
        accountNumber: params.accountNumber,
        email: email
    });

    const safeAmountOfAccountsDetected = params.accountNumber <= MAX_ACCOUNTS && params.isOnline;
    var continueToNextAccount;
    
    try {
        await account.fetchGmailSettings(params);
    } catch (error) {
        // do nothing continue to next then below
        if (!DetectClient.isFirefox()) {
            console.error("Error fetching Gmail settings: " + error);
        }
    }

    try {
        await account.getEmails();
        console.info("Detected account: " + account.getEmail());

        // maximum accounts, if over this we might be offline and just gettings errors for each account
        if (safeAmountOfAccountsDetected) {
            if (!hasDuplicatedAccount(account)) {
                await addAccount(account);
                continueToNextAccount = true;	    			
            }
        } else {
            if (params.isOnline) {
                logError("jmax accounts reached");
            } else {
                console.warn("Not online so not detecting accounts");
            }
        }
    } catch (error) {
        if (safeAmountOfAccountsDetected) {
            if (!hasDuplicatedAccount(account)) {
                // test for error.toLowerCase because error could be an Error object (which doesn't have a .toLowerCase)
                if (isUnauthorized(error)) { // not signed in
                    console.log("Unauthorized");
                    unauthorizedAccounts++;
                    // if offline then watch out because all accounts will return error, but not unauthorized, so must stop from looping too far
                    // if too many unauthorized results than assume they are all signed out and exit loop, else continue looping
                    const maxUnauthorizedAccount = parseInt(await storage.get("maxUnauthorizedAccount"));
                    if (unauthorizedAccounts < maxUnauthorizedAccount) {
                        continueToNextAccount = true;
                    }
                } else if (error.errorCode == JError.GOOGLE_ACCOUNT_WITHOUT_GMAIL || error.errorCode == JError.GMAIL_NOT_ENABLED || error.errorCode == JError.GOOGLE_SERVICE_ACCOUNT) {
                    console.log("Recognized error: " + error.errorCode);
                    await addAccount(account)
                    continueToNextAccount = true;
                } else if (accounts.length && accounts.last().error) {
                    // if consecutive accounts with errors let's quit - trying to avoid the locked account condition
                    console.error("Consecutive accounts with errors so not looking for anymore");
                } else if (account.hasBeenIdentified()) {
                    console.info("Adding error account: " + account.getEmail(), error);
                    account.error = error;
                    await addAccount(account)
                    continueToNextAccount = true;
                } else {
                    // timeout checking 2nd account on Chrome startup: happened on ME's Mac causing unread count issue because that 2nd account was set to be ignored
                    console.info("Error account: " + account.getEmail(), error);
                    continueToNextAccount = true;
                }
            }
        } else {
            // Error on last one most probably they were all errors ie. timeouts or no internet so reset all accounts to 0
            accounts = [];
            console.info("mailaccount - probably they were all errors");
        }
    }

    if (continueToNextAccount) {
        params.accountNumber++;
        await initMailAccount(params);
    }
}

async function pollAccounts(params = {}) {
    await initMisc();
    
    if (pollingAccounts && !params.refresh) {
        console.log("currently polling: quit polling me!")
    } else {
        pollingAccounts = true;
        try {
            console.log("poll accounts...");
            
            if (!params.noEllipsis) { 
                setBadgeEllipsis();
            }	
            chrome.action.setTitle({ title: getMessage("pollingAccounts") + "..." });

            if (await storage.get("accountAddingMethod") == "autoDetect") {
                accounts.forEach(account => {
                    account = null;
                });
                
                accounts = [];
                ignoredAccounts = [];
                unauthorizedAccounts = 0;
                params.accountNumber = 0;
                params.isOnline = await isOnline();

                await initMailAccount(params);
                await serializeAccounts(ignoredAccounts, {storageKey: "ignoredAccounts", source: "polling-accounts"});
                await storage.set("unauthorizedAccounts", unauthorizedAccounts);
            } else { // manual adding
                if (params.source == Source.STARTUP || params.refresh) {
                    const poll = await storage.get("poll");

                    accounts.forEach(account => {
                        console.log("reset account: ", account);
                        account.reset();
                        if (poll == "realtime") {
                            // alarms might have disappeared if they were trigger while Chrome was closed - so re-init them here.
                            account.startWatchAlarm();
                        }
                    });
                }
                await getAllEmails({accounts:accounts, refresh:true});
            }

            const accountsSummary = await getAccountsSummary(accounts);
            
            if (accountsSummary.allSignedOut) {
                setSignedOut({title:accountsSummary.firstNiceError, source: "polling-accounts"});
            } else {
                if (!await storage.get("verifyPaymentRequestSent")) {
                    try {
                        const response = await verifyPayment(accounts);
                        if (response.unlocked || true) { // Force unlock
                            await Controller.processFeatures();
                        }
                        await storage.enable("verifyPaymentRequestSent");
                    } catch (error) {
                        console.warn("ignore verifyPayment error", error);
                    }
                }
                params.pollingAccountsSource = true;
                await mailUpdate(params);
            }
        } finally {
            pollingAccounts = false;
        }
    }
}

async function getSettingValueForLabels(account, settings = {}, labels, defaultObj) {
    const accountAddingMethod = await storage.get("accountAddingMethod");
    const monitoredLabels = await account.getMonitorLabels();

	var customLabel;
	var systemLabel;

	if (labels) {
		for (let a=labels.length-1; a>=0; a--) {
			const label = labels[a];
			const labelId = getJSystemLabelId(label, accountAddingMethod);
			const settingValue = settings[labelId];
			if (typeof settingValue != "undefined" && account.hasMonitoredLabel(labelId, monitoredLabels)) {
				// if system label then save it but keep looking for custom label first!
				if (isSystemLabel(label)) {
					systemLabel = settingValue;
				} else {
					customLabel = settingValue;
					break;
				}
			}
		}
	}
	
	// test for undefined because we could have "" which means Off
	if (customLabel != undefined) {
		return customLabel;
	} else if (systemLabel != undefined) {
		return systemLabel;
	} else {
		return defaultObj;
	}
}

// Called when an account has received a mail update
async function mailUpdate(params = {}) {
    await initMisc();

    let newEmailUpdate;
    let updatedBadge;

    if (globalThis.buttonIcon) {
        buttonIcon.stopAnimation();
    }
	
	updateNotificationTray();

	// if this mailUpdate is called from interval then let's gather newest emails ELSE we might gather later in the code
	var newEmails = [];
	if (params.allEmailsCallbackParams) {
		params.allEmailsCallbackParams.forEach(allEmailsCallback => {
			if (allEmailsCallback.newestMailArray && allEmailsCallback.newestMailArray.length) {
				console.log("allEmailsCallback.newestMailArray:", allEmailsCallback.newestMailArray);
				newEmails = newEmails.concat(allEmailsCallback.newestMailArray);
			}
		});
	}

	var totalUnread = 0;
	var lastMailUpdateAccountWithNewestMail;
	let unsnoozedEmails = [];

	accounts.forEach(account => {
		if (!account.error) {
			if (account.getUnreadCount() > 0) {
				totalUnread += account.getUnreadCount();
			}
			account.lastSuccessfulMailUpdate = new Date();
		}

		if (account.getNewestMail()) {
			if (!lastMailUpdateAccountWithNewestMail || !lastMailUpdateAccountWithNewestMail.getNewestMail() || account.getNewestMail().issued > lastMailUpdateAccountWithNewestMail.getNewestMail().issued) {
				lastMailUpdateAccountWithNewestMail = account;
			}

			if (!params.allEmailsCallbackParams) {
				newEmails = newEmails.concat(account.getAllNewestMail());
			}
		}

		let accountUnSnoozedEmails = account.getUnsnoozedEmails();
		if (accountUnSnoozedEmails.length) {
			unsnoozedEmails = unsnoozedEmails.concat(accountUnSnoozedEmails);
		}
	});
	
	newEmails.sort(function (a, b) {
	   if (a.issued > b.issued)
		   return -1;
	   if (a.issued < b.issued)
		   return 1;
	   return 0;
	});
	
    let accountWithNewestMail;

	if (newEmails.length || unsnoozedEmails.length) {
        const lastNotificationAccountDates = deepClone(await storage.get("_lastNotificationAccountDates"));

		var mostRecentNewEmail = newEmails.first();

		var passedDateCheck = false;
		if (mostRecentNewEmail) {
			accountWithNewestMail = mostRecentNewEmail.account;

			if (await storage.get("showNotificationsForOlderDateEmails")) {
				if (accountWithNewestMail.getMails().length < 20) {
					passedDateCheck = true;
				} else {
					console.warn("more than 20 emails so bypassing check for older dated emails");
					if (mostRecentNewEmail.issued > lastNotificationAccountDates[accountWithNewestMail.id]) {
						passedDateCheck = true;
					}
				}
			} else {
				if (mostRecentNewEmail.issued > lastNotificationAccountDates[accountWithNewestMail.id]) {
					passedDateCheck = true;
				}
			}
            await storage.set("_newestAccountId", accountWithNewestMail.id);
		} else {
			accountWithNewestMail = null;
            await storage.remove("_newestAccountId");
		}
		
		if (unsnoozedEmails.length || !lastNotificationAccountDates[accountWithNewestMail.id] || passedDateCheck) {
			
			if (mostRecentNewEmail) {
                lastNotificationAccountDates[accountWithNewestMail.id] = mostRecentNewEmail.issued;
                storage.set("_lastNotificationAccountDates", lastNotificationAccountDates);
			}

			// new
			const newestMailObj = deepClone(await storage.get("_newestMail"));
			if (unsnoozedEmails.length || newestMailObj[accountWithNewestMail.getEmail()] != mostRecentNewEmail.id) {

				if (params.source != Source.STARTUP || (params.source == Source.STARTUP && await storage.get("showNotificationsOnStartup"))) {

                    await storage.setDate("_lastNewestMailDate");

                    if (!params.instantlyUpdatedCount || await storage.get("resetEmailUnreadIconWhenButtonClicked")) {
                        updateBadge({
                            totalUnread: totalUnread
                        });
                        updatedBadge = true;
                    }

					isDND({animationRelated: true, account: accountWithNewestMail}).then(dndState => {
						if (!dndState) {
							buttonIcon.startAnimation();
						}
					});

                    const notificationSound = await storage.get("notificationSound");
                    let recentEmailSoundSource;
					if (mostRecentNewEmail) {
                        const sounds = await accountWithNewestMail.getSetting("sounds");
						recentEmailSoundSource = await getSettingValueForLabels(accountWithNewestMail, sounds, mostRecentNewEmail.labels, notificationSound);
					} else {
						recentEmailSoundSource = null;
                    }
                    storage.set("_recentEmailSoundSource", recentEmailSoundSource);

                    const notificationSoundSource = await getNotificationSoundSource(recentEmailSoundSource, accountWithNewestMail);

					// show notification, then play sound, then play voice
					if (params.showNotification) {
						// save them here for the next time i call showNotification when returning from idle
						params.totalUnread = totalUnread;
						params.newEmails = newEmails;
                        params.unsnoozedEmails = unsnoozedEmails;
                        params.accountWithNewestMail = accountWithNewestMail;
                        params.soundSource = notificationSoundSource;

						showNotification(params)
							.catch(error => {
								// do nothing but must catch it to continue to next then
								console.error("show notif error", error);
							})
							.then(() => {
								if (notificationSound) {
									playNotificationSound(notificationSoundSource).then(() => {
										playVoiceNotification(accountWithNewestMail);
									});
								} else {
									playVoiceNotification(accountWithNewestMail);
								}
							})
						;
					} else if (notificationSound) {
						playNotificationSound(notificationSoundSource).then(() => {
							playVoiceNotification(accountWithNewestMail);
						});
					} else {
						playVoiceNotification(accountWithNewestMail);
					}

                    if (mostRecentNewEmail) {
                        newestMailObj[accountWithNewestMail.getEmail()] = mostRecentNewEmail.id;
                        await storage.set("_newestMail", newestMailObj);
                        newEmailUpdate = true;
                    }
				}
			}
		}
	}

    if (!updatedBadge) {
        if (globalThis.performingMarkAllAsX) {
            console.log("performingMarkAllAsX");
        } else {
            updateBadge({
                totalUnread: totalUnread
            });
        }
    }

    await storage.set("unreadCount", totalUnread);
	initPopup();
	

    
    await serializeAccounts(accounts, {source: params.pollingAccountsSource ? "polling-accounts" : "mailUpdate"});

    /*
    if (newEmailUpdate && params.source != "popup") {
        chrome.runtime.sendMessage({command: "newEmailUpdate", account: accountWithNewestMail.getEmail(), id: mostRecentNewEmail.id}).catch(error => {
            // ignore the "Could not establish connection"
        });
    }
    */
    if (params.source != "popup") {
        chrome.runtime.sendMessage({command: "mailUpdate"}).catch(error => {
            // ignore the "Could not establish connection"
        });
    }

}

// if any of the mails do not exist anymore than assume one has been read/deleted
function unreadEmailsChanged(mails) {
	if (mails) {
		const allUnreadMail = getAllUnreadMail(accounts);
		let mailsStillUnreadCount = 0;
		for (const mail of mails) {
			for (const unreadMail of allUnreadMail) {
				if (mail && unreadMail && mail.id == unreadMail.id) {
					mailsStillUnreadCount++;
				}
			}
		}
		return mails.length != mailsStillUnreadCount;
	}
}

async function updateNotificationTray() {
    const notifMails = await restoreLastNotifParams(true);
	if (unreadEmailsChanged(notifMails)) {
		clearRichNotification(await storage.get("_richNotifId"));
	}
}

async function setSignedOut(params = {}) {
	console.log("setSignedOut");
	
	buttonIcon.setIcon({signedOut:true});
	chrome.action.setBadgeBackgroundColor({color:BadgeColor.GRAY});
	chrome.action.setBadgeText({ text: "X" });
	if (params.title) {
		chrome.action.setTitle({ title: String(params.title) });
	} else {
		chrome.action.setTitle({ title: getMessage("notSignedIn") });
	}
	if (await storage.get("accountAddingMethod") == "autoDetect") {
		await storage.set("unreadCount", 0);
    }
    storage.remove("_lastShowNotifParams");
    await serializeAccounts(accounts, {source: params.source});
}

async function getNotificationSoundSource(source, accountWithNewestMail) {
    await storage.init();

    if (await storage.get("notificationSound")) {
        const dndState = await isDND({soundRelated: true, account: accountWithNewestMail});
        if (dndState || source == "") {
            return null;
        } else {
            return source;
        }
    }
}

async function playNotificationSound(source) {
    await storage.init();

    try {
        if (source && source != SYSTEM_DEFAULT_SOUND) {
            globalThis.changedSrc = lastNotificationAudioSource != source;
            lastNotificationAudioSource = source;

            let audioSrc;

            // patch for ogg might be crashing extension
            // patch linux refer to mykhi@mykhi.org
            if (DetectClient.isLinux() || changedSrc) {
                if (source.indexOf("custom_") == 0) {
                    const sounds = await storage.get("customSounds");
                    if (sounds) {
                        // custom file selectd
                        sounds.some(sound => {
                            if (source.replace("custom_", "") == sound.name) {
                                console.log("loadin audio src")
                                audioSrc = sound.data;
                                return true;
                            }
                        });
                    }					
                } else {
                    audioSrc = SOUNDS_FOLDER + source;
                }
            }

            await sendToOffscreenDoc("play-sound", {
                changedSrc: changedSrc,
                src: audioSrc,
                volume: await storage.get("notificationSoundVolume") / 100
            });
        }
    } catch (error) {
        console.error("play error", error);
    }
}

async function getVoiceMessageAttachment(mail) {
	var found;
	var promise;
	
    let lastMessage = mail.messages.last();
    
    if (lastMessage) {
        var hasVoiceMessageAttachment;
        if (lastMessage.files?.length && lastMessage.files[0].filename.includes(VOICE_MESSAGE_FILENAME_PREFIX + ".")) {
            hasVoiceMessageAttachment = true;
        }
        
        if ((mail.authorMail?.includes("vonage.")) || (lastMessage.content?.includes(VOICE_MESSAGE_FILENAME_PREFIX + ".")) || hasVoiceMessageAttachment) {
            if (await storage.get("accountAddingMethod") == "autoDetect") {
                const attachmentNode = parseHtml(lastMessage.content).querySelector(".att > tbody > tr");
                if (attachmentNode) {
                    var soundImage = attachmentNode.querySelector("imghidden[src*='sound']");
                    if (soundImage) {
                        fixRelativeLinks(attachmentNode, mail);
                        var soundSrc = soundImage.parentElement.getAttribute("href");
                        // make sure it's from the google or we might be picking up random links that made it all the way to this logic
                        if (soundSrc && soundSrc.includes("google.com")) {
                            found = true;
                            // just returns the souce src;
                            promise = Promise.resolve(soundSrc);
                        }
                    }
                }
            } else {
                if (lastMessage.files?.length) {
                    const file = lastMessage.files.first();
                    if (file.mimeType?.includes("audio/")) {
                        found = true;
                        promise = new Promise(function(resolve, reject) {
                            // create sub promise to return a concatenated sound src to play in audio object ie. data: + mimetype + response.data
                            mail.account.fetchAttachment({messageId:lastMessage.id, attachmentId:file.body.attachmentId, size:file.body.size}).then(function(response) {
                                resolve("data:" + file.mimeType + ";base64," + response.data);
                            }).catch(function(error) {
                                reject(error);
                            });
                        });
                    }
                }
            }
        }
    }
	
	return {found:found, promise:promise}
}

async function playVoiceNotification(accountWithNewestMail) {
	console.log("playVoiceNotification");
	
	// moved this outside of timeout in queueVoice() to try avoiding returning null on newestEmail
	var newestEmail = accountWithNewestMail.getNewestMail();
	
	async function queueVoice() {

		// put a bit of time between chime and voice
		await sleep(seconds(1));
        if (newestEmail) {

            const voices = await accountWithNewestMail.getSetting("voices");
            var voiceHear = await getSettingValueForLabels(accountWithNewestMail, voices, newestEmail.labels, await storage.get("voiceHear"));

            if (voiceHear) {
                
                var hearFrom = voiceHear.includes("from");
                var hearSubject = voiceHear.includes("subject");
                var hearMessage = voiceHear.includes("message");
                
                var fromName = await generateNotificationDisplayName(newestEmail);
                
                // filter for speech
                
                if (newestEmail.authorMail && newestEmail.authorMail.includes("vonage.")) {
                    // put vonage instead because or elee the phone number is spoken like a long number ie. 15141231212 etc...
                    fromName = "Vonage";
                }

                var subject = newestEmail.title;
                subject = cleanEmailSubject(subject);

                var introToSay = "";
                var messageToSay = "";
                
                var voiceMessageAttachmentObj = await getVoiceMessageAttachment(newestEmail);
                
                if (hearFrom) {
                    if (hearSubject || hearMessage) {
                        // from plus something else...
                        if (fromName == "me") {
                            introToSay = getMessage("youSay");
                        } else {
                            introToSay = getMessage("NAME_says", fromName);
                        }
                    } else {
                        // only from
                        introToSay = getMessage("emailFrom_NAME", fromName);
                    }
                } 
                    
                if ((hearSubject || hearMessage) && !voiceMessageAttachmentObj.found) {
                    const subjectsSpoken = deepClone(await storage.get("_subjectsSpoken"));
                    if (hearSubject
                        && !/no subject/i.test(subject)
                        && !/sent you a message/i.test(subject)) {
                        // caveat: if user selected to hear subject and not message then we should play subject regardless if it's been already said
                        if (!hearMessage || !subjectsSpoken[subject]) {
                            subjectsSpoken[subject] = "ALREADY_SAID";
                            storage.set("_subjectsSpoken", subjectsSpoken);

                            messageToSay += await htmlToText(subject);
                        } else {
                            console.log("omit saying the subject line");
                        }
                    } else {
                        console.log("ignore subject: " + subject);
                    }
                    
                    if (hearMessage) {
                        var spokenWordsLimit = await storage.get("spokenWordsLimit");
                        var spokenWordsLimitLength;
                        if (spokenWordsLimit == "summary") {
                            spokenWordsLimitLength = 101;
                        } else if (spokenWordsLimit == "paragraph") {
                            spokenWordsLimitLength = 500;
                        } else {
                            spokenWordsLimitLength = 30000;
                        }
                        
                        const messageText = await newestEmail.getLastMessageText({maxSummaryLetters:spokenWordsLimitLength, htmlToText:true});
                        if (messageText) {
                            messageToSay += `, ${messageText}`;
                        }
                    }
                }
                
                console.log("message to say: " + introToSay + " " + messageToSay);
                if (introToSay) {
                    ChromeTTS.queue(introToSay, {
                        noPause: true,
                        forceLang: await storage.get("language")
                    });
                }
                if (messageToSay) {
                    ChromeTTS.queue(messageToSay).then(() => {
                        if (hearMessage && voiceMessageAttachmentObj.found) {
                            voiceMessageAttachmentObj.promise.then(async response => {
                                return sendToOffscreenDoc("play-sound", {
                                    src: response,
                                    volume: await storage.get("notificationSoundVolume") / 100
                                });
                            }).catch(error => {
                                console.error("error getVoiceMessageAttachment: " + error);
                            });
                        }
                    });						
                }
            } else {
                console.log("voiceHear off for these labels");
            }
        } else {
            console.warn("in playVoiceNotification this returns null?? -> accountWithNewestMail.getNewestMail()");
        }
	}
	
	if (await storage.get("notificationVoice")) {
		isDND({soundRelated: true, account: accountWithNewestMail}).then(async dndState => {
			if (!dndState) {
                const voiceNotificationOnlyIfIdleInterval = await storage.get("voiceNotificationOnlyIfIdleInterval");
				if (voiceNotificationOnlyIfIdleInterval) {
					const state = await chrome.idle.queryState(parseInt(voiceNotificationOnlyIfIdleInterval));
                    // apparently it's state can be locked or idle
                    if (state != "active" && !await detectSleepMode.isWakingFromSleepMode()) {
                        queueVoice();
                    }
				} else {
					queueVoice();
				}
			}
		}).catch(response => {
			// nothing, maybe callback() if neccessary
		});
	}
}

async function preloadProfilePhoto(mail) {
    return new Promise(async (resolve, reject) => {
        var timeoutReached = false;
        if (await storage.get("showContactPhoto")) {
            // let's ensure all tokens first before looping
            await ensureContactsWrapper([mail.account]);

            const loadPhotoPromise = new Promise(async (resolve, reject) => {
                try {
                    const response = await getContactPhoto({mail:mail});

                    // 2024 default photo was just the 1st letter of the name, and usually had a /cm/ in the url so i opted to ignore these for the notifiations, note that I could instead use the .default attribute from the API
                    const isDefaultPhoto = response.photoUrl?.includes("/cm/");

                    if (response.photoUrl && !isDefaultPhoto) {
                        await getImageBitmapFromUrl(response.photoUrl);
                        mail.contactPhotoUrl = response.photoUrl;
                    }
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        
            // wait for https images to load because even if the deferreds completed it seem the contact images woulnd't load at extension startup
            const preloadTimeout = setTimeout(() => {
                timeoutReached = true;
                console.log("preloadphotos timeoutEND");
                resolve();
            }, seconds(3));
            
            await Promise.allSettled([loadPhotoPromise]);
            console.log("preloadphotos always args");
            // cancel timeout
            clearTimeout(preloadTimeout);
            // make sure timeout did not already call the callback before proceeding (don't want to call it twice)
            if (!timeoutReached) {
                console.log("preloadphotos whenEND");
                resolve();
            }
        } else {
            const response = await getContactPhoto({mail:mail});
            if (response.photoUrl) {
                mail.contactPhotoUrl = response.photoUrl;
            }
            resolve();
        }
    });
}

function markAllAsX(account, action, closeWindow) {
	return new Promise((resolve, reject) => {
		const promises = [];
		var delay = 0;
		const totalUnreadMails = getAllUnreadMail(accounts).length;
		const totalMailsInThisAccount = account.getMails().length;

        globalThis.performingMarkAllAsX = true;
		
		account.getMails().forEach((mail, index) => {
			if (index+1 <= MAX_EMAILS_TO_ACTION) {
				const promise = new Promise((resolve, reject) => {
					setTimeout(() => {
						let markAsPromise;
						if (action == "archive") {
							markAsPromise = mail.archive({instantlyUpdatedCount:true});
						} else if (action == "markAsRead") {
							markAsPromise = mail.markAsRead({instantlyUpdatedCount:true});
						} else if (action == "markAsSpam") {
							markAsPromise = mail.markAsSpam({instantlyUpdatedCount:true});
                        }
					
						markAsPromise.then(() => {
							resolve();
						}).catch(response => {
							reject(response);
						});
						
					}, delay);
					
					if (totalMailsInThisAccount > MAX_EMAILS_TO_INSTANTLY_ACTION) {
						delay += 300;
					}
				});
				
				promises.push(promise);
				
			} else {
				return false;
			}
		});
		
		const totalMarkedAsX = promises.length;

        updateBadge({
            totalUnread: 0,
            offset: -totalMarkedAsX
        });
		
		// simulate speed by quickly resetting the badge and close the window - but processing still take place below in .apply
		if (totalUnreadMails - totalMarkedAsX == 0) {
			if (closeWindow) {
                chrome.runtime.sendMessage({command: "closeWindow", params:{source:"markAll:" + action}});
			}
		}
		
		Promise.all(promises).then(promiseAllResponse => {
			resolve();
		}).catch(error => {
			reject(error);
		}).finally(() => {
            globalThis.performingMarkAllAsX = false;
        });
	});
}

async function refreshAccounts(params = {}) {
    console.log("refreshAccounts", params);
    await initMisc();

    if (params.hardRefreshFlag) {
        await pollAccounts({refresh:true});
    } else {
        let accountsWithErrors = 0;
        
        accounts.forEach(account => {
            if (account.error) {
                accountsWithErrors++;
            }
        });			   

        if (accounts.length >= 1 && !accountsWithErrors) {
            await getAllEmails({accounts: accounts, refresh: true});
            await mailUpdate(params);
        } else {
            await pollAccounts({refresh: true});
        }
    }

    if (params.source != "popup" || (params.source == "popup" && params.hardRefreshFlag)) {
        chrome.runtime.sendMessage({command: "refreshPopup"}).catch(error => {
            // ignore the "Could not establish connection"
        });
    }
    
    if (params.source != "sidepanel" || (params.source == "sidepanel" && params.hardRefreshFlag)) { // created this because I could click refresh button from the popup and it would not refresh the sidepanel
        chrome.runtime.sendMessage({command: "refreshSidePanel"}).catch(error => {
            // ignore the "Could not establish connection"
        });
    }
}

async function stopAudio() {
    sendToOffscreenDoc("stop-audio");
}

async function stopAllSounds() {
	stopAudio();
    globalThis.ChromeTTS?.stop?.();
}

function hideMailTriggeredInPopup() {
    closeWebNotifications();
    updateNotificationTray();
}

let lastEventType = "";
let lastEventTime = 0;

async function offlineOnlineChanged(e) {
    console.log("detected: " + e.type + " " + new Date(), "source", e.source);
    updateBadge();
    
    if (e.type == lastEventType && (Date.now() - lastEventTime) < seconds(10)) {
        return;
    }
    
    lastEventType = e.type;
    lastEventTime = Date.now();
    
    if (e.type == "online") {
        console.log("navigator: " + navigator.onLine + " " + new Date());
        await sleep(seconds(3));
        await storage.init(); // seems sometimes the storage is not ready yet: wrappeddb.opened was false
        const accountSummaries = await getAccountsSummary(accounts);
        if (accountSummaries.signedIntoAccounts == 0) {
            console.log("navigator: " + navigator.onLine);
            checkEmails("wentOnline");
        }
    } else { // offline

    }
}

globalThis.addEventListener('offline', offlineOnlineChanged);
globalThis.addEventListener('online', offlineOnlineChanged);