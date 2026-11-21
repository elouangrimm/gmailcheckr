// Copyright Jason Savard
"use strict";

class Mail {
    constructor() {
        var that = this;
        this.allFiles = [];
        this.queueFile = function (messageId, file) {
            var queuedFile = { filename: file.filename, size: file.body.size };
            queuedFile.fetchPromise = that.account.fetchAttachment({ messageId: messageId, attachmentId: file.body.attachmentId, size: file.body.size });
            that.allFiles.push(queuedFile);
            return queuedFile;
        };
        this.getName = function (parsedAddress) {
            var name;
            var email;
            // if message is passed used the 
            if (parsedAddress) {
                name = parsedAddress.name;
                email = parsedAddress.email;
            }
            else {
                name = that.authorName;
                email = that.authorMail;
            }
            if (name == null || name.length < 1) {
                if (email) {
                    name = email.split("@")[0];
                }
                else {
                    name = email;
                }
                return name;
            }
            else {
                if (name) {
                    return name.trim();
                }
            }
        };
        this.getShortName = function () {
            var name = that.getName();
            if (name) {
                name = name.split(" ")[0];
            }
            return name;
        };
        this.getDate = function () {
            return that.issued.displayDate({ relativeDays: true });
        };
        this.open = function (params = {}) {
            params.mail = that;
            that.account._openMailInBrowser(params);
        };
        this.getUrl = function () {
            return that.account.getMailUrl({ mail: that, useGmailUI: true });
        };
        this.getPrintUrl = function () {
            return that.account.getPrintUrl(that);
        };
        // parses the RFC 8058 "List-Unsubscribe" header, ie. <mailto:x@y.com?subject=unsubscribe>, <https://y.com/unsub?id=1>
        this.getUnsubscribeUrls = function () {
            const urls = (that.listUnsubscribe?.match(/<([^>]+)>/g) || []).map(match => match.slice(1, -1));
            return {
                mailto: urls.find(url => url.startsWith("mailto:")),
                https: urls.find(url => url.startsWith("http"))
            };
        };
        this.isOneClickUnsubscribe = function () {
            const urls = that.getUnsubscribeUrls();
            return !!(urls.https && that.listUnsubscribePost?.toLowerCase().includes("one-click"));
        };
        this.canUnsubscribe = function () {
            if (that.account.getAccountAddingMethod() != "oauth") {
                return false;
            }
            const urls = that.getUnsubscribeUrls();
            return !!(urls.mailto || urls.https);
        };
        this.unsubscribe = async function () {
            const urls = that.getUnsubscribeUrls();
            if (that.isOneClickUnsubscribe()) {
                // RFC 8058 one-click unsubscribe, fire-and-forget POST (no-cors because the 3rd party domain isn't in our host permissions)
                await fetch(urls.https, {
                    method: "POST",
                    mode: "no-cors",
                    headers: {"Content-Type": "application/x-www-form-urlencoded"},
                    body: "List-Unsubscribe=One-Click"
                });
                return {method: "oneClick"};
            } else if (urls.https) {
                openUrl(urls.https);
                return {method: "url"};
            } else if (urls.mailto) {
                const mailtoUrl = new URL(urls.mailto);
                that.account.openCompose({
                    to: {email: mailtoUrl.pathname},
                    subject: mailtoUrl.searchParams.get("subject") || "unsubscribe"
                });
                return {method: "mailto"};
            } else {
                throw new Error("No unsubscribe method found for this email");
            }
        };
        this.markAsRead = function (params = {}) {
            const executeMailActionParams = shallowClone(params);
            executeMailActionParams.mail = that;
            executeMailActionParams.action = MailAction.MARK_AS_READ;
            return that.account.executeMailAction(executeMailActionParams);
        };
        this.markAsUnread = function () {
            return that.account.executeMailAction({ mail: that, action: MailAction.MARK_AS_UNREAD });
        };
        this.deleteEmail = async (params = {}) => {
            // must clone it because i stuck in a loop below because params was modified in .markAsRead and it in turn modified executeMailActionParams later
            const executeMailActionParams = shallowClone(params);
            executeMailActionParams.mail = that;
            executeMailActionParams.action = MailAction.DELETE;
            if (await storage.get("deletingMarksAsRead")) {
                await that.markAsRead(params);
                // 2 scenarios: instantlyUpdatedCount was already executed before this method was called or markasread above should have updated the count so let's not update it again with the that.account.executeMailAction
                executeMailActionParams.instantlyUpdatedCount = true;
            }
            return that.account.executeMailAction(executeMailActionParams);
        };
        this.archive = async (params = {}) => {
            const executeMailActionParams = shallowClone(params);
            executeMailActionParams.mail = that;
            executeMailActionParams.action = MailAction.ARCHIVE;
            if (await storage.get("archive_read") && !params.ignoreMarkAsRead) {
                await that.markAsRead(params);
                // 2 scenarios: instantlyUpdatedCount was already executed before this method was called or markasread above should have updated the count so let's note update it again with the executeMailAction
                executeMailActionParams.instantlyUpdatedCount = true;
            }
            return that.account.executeMailAction(executeMailActionParams);
        };
        this.markAsSpam = (params = {}) => {
            const executeMailActionParams = shallowClone(params);
            executeMailActionParams.mail = that;
            executeMailActionParams.action = MailAction.MARK_AS_SPAM;
            return that.account.executeMailAction(executeMailActionParams);
        };
        this.markAsNotSpam = (params = {}) => {
            const executeMailActionParams = shallowClone(params);
            executeMailActionParams.mail = that;
            executeMailActionParams.action = MailAction.MARK_AS_NOT_SPAM;
            return that.account.executeMailAction(executeMailActionParams);
        };
        this.moveLabel = async (params) => {
            console.log("move label", that.labels);
            if (that.labels.length) {
                // find "possibly" inbox label: archive it first and then label it										   
                let emailMightBeInInbox = that.labels.some(label => {
                    console.log("label: ", label);
                    if (isSystemLabel(label)) { // possibly inbox email
                        console.log("system label: ", label);
                        return true;
                    }
                });

                if (emailMightBeInInbox) {
                    await that.archive({ignoreMarkAsRead: true});
                } else if (that.labels.length == 1) { // if only 1 label (and not possibly in inbox) then remove it and apply new label
                    await that.removeLabel(that.labels.first());
                }
                await that.applyLabel(params.newLabel);
                
                if (await storage.get("movingMarksAsRead")) {
                    await that.markAsRead(params);
                }
            } else {
                const error = "no labels for email";
                logError(error);
                throw error;
            }
        };
        this.untrash = async function (params = {}) {
            console.log("untrash");
            const executeMailActionParams = shallowClone(params);
            executeMailActionParams.mail = that;
            executeMailActionParams.action = MailAction.UNTRASH;
            if (await storage.get("deletingMarksAsRead")) {
                await that.markAsUnread();
            }
            return that.account.executeMailAction(executeMailActionParams);
        };
        this.undoArchive = async function (params = {}) {
            console.log("undoArchive");
            await that.markAsUnread();
            const executeMailActionParams = shallowClone(params);
            executeMailActionParams.mail = that;
            executeMailActionParams.action = MailAction.UNDO_ARCHIVE;
            return that.account.executeMailAction(executeMailActionParams);
        };
        this.applyLabel = function (label) {
            const mail = that;
            if (mail.account.getAccountAddingMethod() == "oauth") {
                label = getGmailAPILabelId(label);
            }
            return that.account.executeMailAction({ mail: mail, action: MailAction.APPLY_LABEL, label: label });
        };
        this.removeLabel = function (label) {
            console.log("remove label");
            return that.account.executeMailAction({ mail: that, action: MailAction.REMOVE_LABEL, label: label });
        };
        this.star = async function () {
            const executeMailActionParams = {};
            executeMailActionParams.mail = that;
            executeMailActionParams.action = MailAction.STAR;
            if (await storage.get("starringAppliesInboxLabel") && that.account.getAccountAddingMethod() == "oauth" && !await that.hasLabel(SYSTEM_INBOX)) {
                await that.applyLabel(SYSTEM_INBOX);
                // 2 scenarios: instantlyUpdatedCount was already executed before this method was called or markasread above should have updated the count so let's note update it again with the executeMailAction
                executeMailActionParams.instantlyUpdatedCount = true;
            }
            if (await storage.get("starringMarksAsRead")) {
                await that.markAsRead();
            }
            return that.account.executeMailAction(executeMailActionParams);
        };
        this.removeStar = function () {
            return that.account.executeMailAction({ mail: that, action: MailAction.REMOVE_STAR });
        };
        this.starAndArchive = async () => {
            await that.star();
            return that.archive();
        };
        this.postReply = async function (params) {
            return new Promise((resolve, reject) => {
                globalThis.replyingTimeout = setTimeout(async () => {
                    try {
                        if (params.markAsRead) {
                            that.account.executeMailAction({ mail: that, action: MailAction.MARK_AS_READ });
                        }
            
                        const response = await that.account.executeMailAction({
                            mail: that,
                            action: MailAction.REPLY,
                            message: params.message,
                            replyAllFlag: params.replyAllFlag
                        });
                        if (params.sendAndArchive) {
                            executeMailAction(that, "archive");
                        } else if (params.sendAndDelete) {
                            executeMailAction(that, "deleteEmail");
                        }
                        resolve(response);
                    } catch (error) {
                        reject(error);
                    }
                }, seconds(params.delay))
            });
        };
        this.generateReplyObject = async function (params = {}) {
            let replyObj = { replyAction: true };
            let quotedContent;
            console.log("generatereplyobj:", that.title, that);
            let lastMessage = that.messages.last();
            if (lastMessage) { // added the check for that.messages because of this bug when using manual add https://jasonsavard.com/forum/discussion/4476/uncaught-typeerror-cannot-read-property-alreadyrepliedto-of-undefined-js-mailaccount-js-3988
                // user might be doing a 2nd immediate reply so use the previous/original message to build the reply
                if (lastMessage.alreadyRepliedTo && that.messages.length >= 2) {
                    lastMessage = that.messages[that.messages.length - 2];
                }

                let lastMessageToEmails = lastMessage.to?.map(to => to.email);
                if (lastMessageToEmails?.length) {
                    for (const email of lastMessageToEmails) {
                        if (email) {
                            const sendAs = await that.account.getSendAs(email);
                            if (sendAs) {
                                replyObj.from = addressparser(sendAs.sendAsEmail).first();
                                replyObj.from.name = sendAs.displayName;
                                break; // stop searching
                            }
                        }
                    }
                }

                if (!replyObj.from && that.deliveredTo?.length) {
                    replyObj.from = addressparser(that.deliveredTo.last()).first();
                    // let's override the alias if it's same email as manually added then let's use the alias, else assume it's a different "send mail as"
                    if (that.account.getEmail().equalsIgnoreCase(replyObj.from.email)) {
                        const sendAs = await that.account.getSendAs(replyObj.from.email);

                        if (sendAs?.displayName) {
                            replyObj.from.name = sendAs.displayName;
                        } else {
                            const profileInfo = await that.account.getSetting("profileInfo");
                            if (profileInfo?.displayName) {
                                replyObj.from.name = profileInfo.displayName;
                            }
                        }
                    } else {
                        // let's try to use the name/email from the sender's to field
                        function findMatchingAddress(ary, email) {
                            for (var a = 0; ary && a < ary.length; a++) {
                                if (ary[a].email?.equalsIgnoreCase(email)) {
                                    return ary[a];
                                }
                            }
                        }
                        let matchingAddress = findMatchingAddress(lastMessage.to, replyObj.from.email);
                        if (!matchingAddress) {
                            matchingAddress = findMatchingAddress(lastMessage.cc, replyObj.from.email);
                        }
                        if (!matchingAddress) {
                            matchingAddress = findMatchingAddress(lastMessage.bcc, replyObj.from.email);
                        }
                        if (matchingAddress) {
                            replyObj.from.name = matchingAddress.name;
                        }
                    }
                }
                
                // always use the name from the from field, but will try to identify the email from either the reply-to or the from field
                let fromObj = {
                    name: lastMessage.from.name,
                    email: lastMessage.from.email
                };
                // if alternate reply-to email then override the from email
                if (that.replyTo) {
                    fromObj = addressparser(that.replyTo).first();
                }
                replyObj.tos = [fromObj];
                // save replyall object for possible use later when choosing reply or reply all
                replyObj.replyAll = {};
                replyObj.replyAll.tos = replyObj.tos.concat(removeSelf(lastMessage.to, replyObj.from?.email));
                replyObj.replyAll.ccs = removeSelf(lastMessage.cc, replyObj.from?.email);

                function removeSelf(ary, fromEmail) {
                    if (ary) {
                        // must clone it
                        ary = ary.concat();
                        for (var a = 0; a < ary.length; a++) {
                            // testing for fromEmail also because we want aliases to be removed
                            if (ary[a].email?.equalsIgnoreCase(that.account.getEmail()) || ary[a].email?.equalsIgnoreCase(fromEmail)) {
                                ary.splice(a, 1);
                                break;
                            }
                        }
                    } else {
                        ary = [];
                    }
                    return ary;
                }

                console.log("replyallobj:", replyObj.replyAll);
                if (params.replyAllFlag) {
                    replyObj.tos = replyObj.replyAll.tos;
                    replyObj.ccs = replyObj.replyAll.ccs;
                }
                // used to group replies by converstion in Gmail etc.
                const inReplyTo = lastMessage["message-id"];
                if (inReplyTo) {
                    replyObj.inReplyTo = inReplyTo;
                }
                quotedContent = lastMessage.content;
            }
            else {
                console.log("no messages to reply to, using author info");
                const toObj = {};
                toObj.email = that.authorMail;
                toObj.name = that.getName();
                replyObj.tos = [toObj];
                quotedContent = that.summary;
            }
            if (params.type == "text") {
                // text
                let subject = that.title;
                if (subject) {
                    subject = await htmlToText(subject);
                }
                else {
                    subject = "";
                }
                subject = (subject.search(/^Re: /i) > -1) ? subject : "Re: " + subject; // Add 'Re: ' if not already there
                replyObj.subject = subject;
                // warning: $.trim removes \r\n (and this trim was is used in the .summarize
                replyObj.message = "\r\n\r\n" + that.issued.toString() + " <" + that.authorMail + ">:\r\n" + (await htmlToText(await that.getLastMessageText())).summarize(600); // summarize body because or else we get a 414 or 413 too long url parameters etc.;
            }
            else {
                // html
                replyObj.subject = that.title;

                // Commented cause this is not being used, I generate this quoted when generating the reply message for the Gmail API
                /*
                replyObj.message = "";
                if (params.message) {
                    replyObj.message += params.message;
                }
                replyObj.message += "<blockquote type='cite' style='border-left:1px solid #ccc;margin-top:20px;margin-bottom:10px;margin-left:50px;padding-left:9px'>" + quotedContent + "</blockquote>";
                */
            }
            return replyObj;
        };
        this.reply = async function () {
            const replyObject = await that.generateReplyObject({ type: "text" });
            console.log("reply:", replyObject);
            that.account.openCompose(replyObject);
            if (await storage.get("replyingMarksAsRead")) {
                that.markAsRead();
            }
        };
        this.getThread = async function (params = {}) {
            let mail = that;
            // for auto-detect - if already fetched thread/messages
            // for oauth - should have aleady been fetched so just return it
            const hasMessages = mail.messages.length;
            if (hasMessages || mail.account.getAccountAddingMethod() == "oauth") {
                if (!hasMessages) {
                    const message = {
                        id: mail.id // changed from mail.threadId;
                    }
                    const mailObjects = await mail.account.getMailObjectsForMessageIds([message]);
                    mail = mailObjects.first();
                }
            } else {
                // refresh thread
                console.log("getThread: " + mail.title);

                // th opens all thread msg only the last message i think,  dsqt=1 expand the text and removes quoted hidden text ... [Texte des messages précédents masqué]
                let searchValue = "all";
                if (mail.monitoredLabel == SYSTEM_SPAM) {
                    searchValue = "spam";
                } else if (mail.monitoredLabel == SYSTEM_TRASH) {
                    searchValue = "trash";
                }
                let data = await fetchText(mail.account.getMailUrl({urlParams: `ui=2&view=pt&search=${searchValue}&th=${mail.id}`}))

                // patch 101 to not load any images because apparently $("<img src='abc.gif'");  will load the image even if not displayed
                if (!params.forceDisplayImages) {
                    // just remove img altogether
                    if (data) {
                        data = data.replace(/<img/g, IMAGE_REPLACED_OPENER);
                        data = data.replace(/\/img>/g, IMAGE_REPLACED_CLOSER);
                    }
                }
                // need to add wrapper so that this jquery call workes "> table" ???
                // patch for error "Code generation from strings disallowed for this context"
                // the error would occur if I use jQuery's .append but not!!! if I initially set the content with $()
                // now using safe parseHtmlToJQuery
                const responseWrapper = await sendToOffscreenDoc("parse-thread", data);
                //const responseWrapper = parseHtml(data);

                if (responseWrapper.messages) {
                    responseWrapper.messages.forEach(thisMessage => {
                        const message = {};
                        message.to = [];
                        message.cc = [];
                        message.bcc = [];
                        // get from via by parsing this string:  John Poon <blah@hotmail.com>
                        if (thisMessage.fromText) {
                            message.from = addressparser(thisMessage.fromText).first();
                        } else {
                            console.warn("Couldn't parse from node");
                        }
                        // get date from first line ex. Chloe De Smet Allègre via LinkedIn <member@linkedin.com>	 Sun, Jan 8, 2012 at 12:14 PM
                        const tds = thisMessage.tds;
                        if (tds.length) {
                            message.dateStr = tds[tds.length - 1].trim();
                            if (message.dateStr) {
                                message.date = parseGoogleDate(message.dateStr); // "Thu, Mar 8, 2012 at 12:58 AM";
                            }
                        }
                        // get to/CC
                        thisMessage.emails.forEach((email, i) => {
                            // if 2 divs the first line is usually the reply-to line so ignore it
                            if (i == 0 && thisMessage.emails.length >= 2 && !thisMessage.emails[1].toLowerCase().includes("cc:")) {
                                return;
                            }
                            // remove to:, cc: etc...
                            var emails = email;
                            emails = emails.replace(/.*:/, "");
                            if (email.toLowerCase().includes("bcc:")) {
                                message.bcc = addressparser(emails);
                            }
                            else if (email.toLowerCase().includes("to:")) {
                                message.to = addressparser(emails);
                            }
                            else if (email.toLowerCase().includes("cc:")) {
                                message.cc = addressparser(emails);
                            }
                            else {
                                // could not detect to or cc, could be in another language like chinese "收件者："
                                message.to = addressparser(emails);
                            }
                        });

                        message.content = thisMessage.content;
                        message.textContent = thisMessage.textContent;

                        if (message.textContent) {
                            // cut the summary to lines before the [Quoted text hidden] (in any language)
                            const quotedTextHiddenArray = ["Quoted text hidden", "Texte des messages précédents masqué"];
                            for (var a = 0; a < quotedTextHiddenArray.length; a++) {
                                const idx = message.textContent.indexOf("[" + quotedTextHiddenArray[a] + "]");
                                if (idx != -1) {
                                    message.textContent = message.textContent.substring(0, idx);
                                    break;
                                }
                            }
                        }

                        message.textContent = mail.account.filterEmailBody({
                            subject: mail.title,
                            body: message.textContent
                        });

                        mail.messages.push(message);
                    });
                } else {
                    const message = {};
                    console.warn("Could not parse body from print page: ", responseWrapper);
                    message.from = { name: mail.getName(), email: mail.authorMail };
                    message.content = responseWrapper.content;
                    // remove script tags to bypass content_security_policy
                    message.content = message.content.replaceAll("<script", "<div style='display:none'");
                    message.content = message.content.replaceAll("</script>", "</div>");
                    message.textContent = responseWrapper.textContent;
                    mail.messages.push(message);
                }
            }

            return mail;
        };
        this.getMessageById = function (id) {
            for (var a = 0; a < that.messages.length; a++) {
                if (that.messages[a].id == id) {
                    return that.messages[a];
                }
            }
        };
        this.removeMessageById = function (id) {
            for (var a = 0; a < that.messages.length; a++) {
                if (that.messages[a].id == id) {
                    that.messages.splice(a, 1);
                    return true;
                }
            }
        };
        // params... {maxSummaryLetters:170, htmlToText:true, EOM_Message:" [" + getMessage("EOM") + "]"}
        this.getLastMessageText = async function (params = {}) {
            var appendEOM;
            var lastMessageText;
            // if we are getting the summary from whole message than we can use the EOM, else if we use the brief summary from the atom feed we don't know for sure if it's cut off etc.
            if (that.messages.length) {
                if (params.doNotPreprocessToTextContent === true) {
                    lastMessageText = that.messages.last().innerHTML;
                } else {
                    lastMessageText = that.messages.last().textContent;
                }
                if (lastMessageText) {
                    if (params.htmlToText) {
                        lastMessageText = await htmlToText(lastMessageText);
                    }
                    if (params.maxSummaryLetters) {
                        if (params.targetNode) {
                            // append EOM to node at the end only
                            if (that.account.showEOM && params.EOM_Message && lastMessageText.length <= params.maxSummaryLetters) {
                                appendEOM = true;
                            }
                            lastMessageText = lastMessageText.summarize(params.maxSummaryLetters);
                        }
                        else {
                            lastMessageText = lastMessageText.summarize(params.maxSummaryLetters, that.account.showEOM ? params.EOM_Message : null);
                        }
                    }
                }
            }
            // can happen when could not parse body from print page
            if (!lastMessageText) {
                lastMessageText = that.summary;
                if (lastMessageText) {
                    if (params.htmlToText) {
                        lastMessageText = await htmlToText(lastMessageText);
                    }
                    if (lastMessageText && params.maxSummaryLetters) {
                        // seems like ... doesn't always exist in atom feed? so cant be sure there more text
                        lastMessageText = lastMessageText.summarize(params.maxSummaryLetters);
                    }
                }
            }

            lastMessageText ||= "";
            
            if (params.targetNode) {
                params.targetNode.textContent = lastMessageText;
                if (appendEOM) {
                    params.targetNode.append(params.EOM_Message);
                }
                return params.targetNode;
            }
            else {
                return lastMessageText;
            }
        };

        this.getOTPCode = async function () {
            that.otpCodeUsesFullContent = false;
            try {
                const subject = that.title;
                const lastMessage = that.messages?.last();
                const emailContent = await that.getLastMessageText({htmlToText:true});
    
                const keywords = [
                    // add english first since emails might be in english, then the translated versions
                    "code",
                    "passcode",
                    "password",
                    "verify",
                    "authentification",
                    "identity confirmation",
                    "recovery email",
                    getMessage("code"),
                    getMessage("passcode"),
                    getMessage("otpPasswordKeywordPattern") || getMessage("password"), // otpPasswordKeywordPattern is used to match password or password in other languages like in hebrew it's סיסמ(?:ה|ת) to match סיסמה or סיסמת    
                    getMessage("verify"),
                    getMessage("authentification")
                ];

                const keywordsUpperCase = [
                    "PIN"
                ]

                const isHebrew = /[\u0590-\u05FF]/.test(subject);
                const wordBreak = isHebrew ? "" : "\\b";
                const localizedOtpPhrasePattern = getMessage("otpCodeKeywordPattern");
                const localizedOtpPhraseRegex = localizedOtpPhrasePattern ? new RegExp(localizedOtpPhrasePattern, "i") : null;

                const subjectRegex = new RegExp(`${wordBreak}(${keywords.join("|")})${wordBreak}`, "i");
                const subjectRegexUpperCase = new RegExp(`${wordBreak}(${keywordsUpperCase.join("|")})${wordBreak}`);
                const emailContentRegex = new RegExp(`${wordBreak}security code|${getMessage("securityCode")}|one(\\-|\\s)time (code|passcode|password)|confirmation code|verification code|login code|${getMessage("confirmationCode")}${wordBreak}`, "i");

                const subjectMatchesKeyword = subject?.match(subjectRegex) || subject?.match(subjectRegexUpperCase) || localizedOtpPhraseRegex?.test(subject || "");

                // some services (ie. Slack) put the code directly in the subject, ie. "Slack confirmation code: 6SP-837"
                if (subjectMatchesKeyword) {
                    // Some services (ie. Patreon) include the code after "login code is" in the subject.
                    const labeledSubjectCodeMatch = subject.match(/\b(?:login|verification|security|confirmation)\s+(?:code|passcode)\s*(?:is\s*)?[:#-]?\s*([A-Z0-9-]{4,10})\b/i);
                    if (labeledSubjectCodeMatch && /\d/.test(labeledSubjectCodeMatch[1])) {
                        return labeledSubjectCodeMatch[1];
                    }

                    // modified to have at least digit or else it was matching the word "one-time": *\d
                    const subjectCodeMatch = subject.match(/\b(?=[0-9A-Z]*\d)[0-9A-Z]{2,5}-[0-9A-Z]{2,5}\b/i);
                    if (subjectCodeMatch) {
                        return subjectCodeMatch[0];
                    }
                }

                const matchesOtpKeyword = content => subjectMatchesKeyword || content?.match(emailContentRegex) || localizedOtpPhraseRegex?.test(content || "");
                const numberWithSpacePattern = "[0-9]{3}\\s?[0-9]{3}";
                const findNumericCode = content => {
                    if (!matchesOtpKeyword(content)) {
                        return;
                    }
                    const smallerMinimumNumbers = /airbnb/i.test(content);
                    const numberPattern = smallerMinimumNumbers ? "[0-9]{4,9}" : "[0-9]{5,9}";
                    // don't match numberCharacterPattern on text (emailContent) only html because there is no line breaks and so "1234The beginning of next line" is not a code match
                    const regex = new RegExp(`\\b(?:${numberPattern}|${numberWithSpacePattern})\\b`, "g");
                    return content.match(regex)?.[0];
                };

                if (subjectMatchesKeyword) {
                    const subjectCode = findNumericCode(subject);
                    if (subjectCode) {
                        return subjectCode;
                    }
                }

                const otpCode = findNumericCode(emailContent);
                if (otpCode) {
                    return otpCode;
                }
                const alphaNumericCodePattern = "(?=[A-Z0-9]{6,9}\\b)(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\\d)[A-Z0-9]{6,9}";
                const alphaNumericCodeRegex = new RegExp(`\\b${alphaNumericCodePattern}\\b`, "i");
                if (matchesOtpKeyword(emailContent)) {
                    const alphaNumericCode = emailContent.match(alphaNumericCodeRegex);
                    if (alphaNumericCode) {
                        return alphaNumericCode[0];
                    }
                }
                if (matchesOtpKeyword(emailContent) && lastMessage) {
                    const regex = new RegExp(`\\b(?:${alphaNumericCodePattern}|[0-9]{5,9}|${numberWithSpacePattern})\\b`, "gi");
                    // If the code is not in the text, try to find it in the HTML content
                    const htmlCode = await sendToOffscreenDoc("find-otp-code-in-html", {
                        html: lastMessage.content,
                        serializedRegex: {
                            pattern: regex.source,
                            flags: regex.flags
                        }
                    });
                    if (htmlCode) {
                        return htmlCode;
                    }
                }

                // Local fallback includes forwarded content that the display-body filter removes.
                if (inLocalExtension && lastMessage?.content) {
                    const fullContentCode = findNumericCode(await htmlToText(lastMessage.content));
                    if (fullContentCode) {
                        that.otpCodeUsesFullContent = true;
                        return fullContentCode;
                    }
                }
            } catch (error) {
                console.warn("Error while trying to get OTP code from email", error);
            }
        };

        this.hasAttachments = function () {
            if (that.messages.length) {
                if (that.account.getAccountAddingMethod() == "oauth") {
                    if (that.messages.last().files?.length) {
                        return true;
                    }
                } else { // auto-detect
                    // ISSUE, see we don't preload content of email in auto-detect we can't detect attachments, and might not want to preload for optimization
                    return that.messages.last().content?.includes("table class=\"att\"");
                }
            }
        };
        this.sortMessages = function () {
            that.messages.sort(function (message1, message2) {
                var date1 = message1.date;
                var date2 = message2.date;
                if (date1.getTime() == date2.getTime()) {
                    return 0;
                }
                else {
                    return date1.getTime() < date2.getTime() ? -1 : 1;
                }
            });
        };
        this.generateAuthorsNode = function () {
            const $node = document.createElement("span");
            if (that.account.getAccountAddingMethod() == "autoDetect") {
                const useMessages = that.messages.length;

                // happens if permission removed for mail.google.com
                if (!that.entryXML) {
                    return;
                }

                const entry = JSON.parse(that.entryXML);
                const contributors = entry.contributors;
                if (contributors.length) {
                    // the feed does not put the original author as first contributor if they have replied in the thread (ie. last author) so make sure they're first if so
                    var name = "someone";
                    var nextContributorIndex = 0;
                    if (useMessages) {
                        const lastContributor = contributors[contributors.length - 1];
                        if (that.messages.first().from?.email?.equalsIgnoreCase(lastContributor.email)) {
                            //console.log("last contr is valid original author: " + that.messages.first().from.email);
                            name = lastContributor.name.split(" ")[0];
                            nextContributorIndex = 0;
                        }
                        else {
                            name = that.getName(that.messages.first().from).getFirstName();
                            nextContributorIndex = 1;
                        }
                    }
                    else {
                        name = contributors[0].name.getFirstName();
                    }
                    $node.append(name);
                    // if more conversations than contributors (happens when several exchanges are done from the original author)
                    if (useMessages && that.messages.length > contributors.length + 1) {
                        $node.append(" .. ");
                    }
                    else {
                        if (useMessages) {
                            if (contributors.length == 2) {
                                const span = document.createElement("span");
                                span.textContent = contributors[nextContributorIndex].name.split(" ")[0];
                                $node.append(", ", span);
                            }
                            else if (contributors.length >= 3) {
                                const span = document.createElement("span");
                                span.textContent = contributors[0].name.split(" ")[0];
                                $node.append(" .. ", span);
                            }
                            $node.append(", ");
                        }
                        else {
                            if (contributors.length == 2) {
                                $node.append(", ");
                            }
                            else {
                                $node.append(" .. ");
                            }
                        }
                    }
                    const span = document.createElement("span");
                    span.classList.add("unread");
                    span.textContent = that.getShortName();
                    $node.append(span);
                    if (useMessages) {
                        const threadCountSpan = document.createElement("span");
                        threadCountSpan.classList.add("thread-count");
                        threadCountSpan.textContent = that.messages.length;
                        $node.append(" ");
                        $node.append(threadCountSpan);
                    }
                }
                else {
                    $node.classList.add("unread");
                    $node.textContent = that.getName();
                    $node.title = that.authorMail;
                }
            }
            else {
                // using <= because seems .messages might have been zero length
                if (that.messages.length <= 1) {
                    $node.classList.add("unread");
                    $node.textContent = that.getName();
                    $node.title = that.authorMail;
                }
                else {
                    var separator;
                    if (that.messages.length == 2) {
                        separator = ", ";
                    }
                    else {
                        separator = " .. ";
                    }
                    var firstSender;
                    var lastSender;
                    try {
                        firstSender = that.getName(that.messages.first().from).getFirstName();
                        lastSender = that.getName(that.messages.last().from).getFirstName();
                        
                        const span = document.createElement("span");
                        span.classList.add("unread");
                        span.textContent = firstSender;

                        const span2 = document.createElement("span");
                        span2.classList.add("unread");
                        span2.textContent = lastSender;

                        $node.append(span, separator, span2);
                    }
                    catch (e) {
                        const span = document.createElement("span");
                        span.classList.add("unread");
                        span.textContent = that.getName();
                        $node.append(span);
                        console.warn("problem parsing author name: " + e);
                    }
                    $node.append(" (" + (that.messages.length) + ")");
                }
            }
            return $node;
        };
        // pass in system_ label
        this.hasLabel = async function (labelId) {
            for (var a = 0; a < that.labels.length; a++) {
                if (getJSystemLabelId(that.labels[a], that.account.getAccountAddingMethod()) == labelId) {
                    return true;
                }
            }
        };

        // check if mail has any of the supplied label ids
        this.hasAnyLabel = async function (labelIds) {
            for (var a = 0; a < that.labels.length; a++) {
                if (labelIds.includes(that.labels[a]) || labelIds.includes(getJSystemLabelId(that.labels[a], that.account.getAccountAddingMethod()))) {
                    return true;
                }
            }
            return false;
        };
        this.getDisplayLabels = function (excludeInbox, excludeHidden) {
            const labels = [];
            that.labels.forEach(labelId => {
                if (excludeHidden && !that.account.isLabelVisibleInMessageList(labelId)) {
                    return;
                }

                const labelObj = { id: labelId };
                const systemLabelId = getJSystemLabelId(labelId);
                if (systemLabelId == SYSTEM_INBOX) {
                    if (excludeInbox) {
                        return;
                    }
                    else {
                        labelObj.name = getMessage("inbox");
                    }
                }
                else if (systemLabelId == SYSTEM_PRIMARY || systemLabelId == SYSTEM_ALL_MAIL || systemLabelId == SYSTEM_IMPORTANT || systemLabelId == SYSTEM_IMPORTANT_IN_INBOX || systemLabelId == SYSTEM_STARRED) {
                    // don't add this, continue loop
                    return;
                }
                else if (systemLabelId == SYSTEM_PURCHASES) {
                    labelObj.name = getMessage("purchases");
                }
                else if (systemLabelId == SYSTEM_FINANCE) {
                    labelObj.name = getMessage("finance");
                }
                else if (systemLabelId == SYSTEM_SOCIAL) {
                    labelObj.name = getMessage("social");
                }
                else if (systemLabelId == SYSTEM_PROMOTIONS) {
                    labelObj.name = getMessage("promotions");
                }
                else if (systemLabelId == SYSTEM_UPDATES) {
                    labelObj.name = getMessage("updates");
                }
                else if (systemLabelId == SYSTEM_FORUMS) {
                    labelObj.name = getMessage("forums");
                }
                else if (systemLabelId == SYSTEM_SPAM) {
                    labelObj.name = getMessage("spam");
                }
                else if (systemLabelId == SYSTEM_TRASH) {
                    labelObj.name = getMessage("trash");
                }
                else if (labelId == GmailAPI.labels.SENT || labelId == GmailAPI.labels.UNREAD || labelId == GmailAPI.labels.IMPORTANT) {
                    // Note using labeId here instead of systemLabelId
                    // don't add this, continue loop
                    return;
                }
                else {
                    labelObj.name = that.account.getLabelName(labelId);
                }

                if (!labelObj.name || labelObj.name == STAR_VARIANT_FLAG) {
                    console.log("probably colored star so ignore it:", labelId);
                } else {
                    labelObj.color = that.account.getLabelColor(labelId);
                    labels.push(labelObj);
                }
            });
            labels.sort(function (a, b) {
                if (a.name && b.name) {
                    if (a.name.toLowerCase() < b.name.toLowerCase())
                        return -1;
                    if (a.name.toLowerCase() > b.name.toLowerCase())
                        return 1;
                }
                return 0;
            });
            return labels;
        };
    }
}
;