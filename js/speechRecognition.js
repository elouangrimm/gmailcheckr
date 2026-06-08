// Copyright Jason Savard

if (globalThis.thisScriptLoaded) {
    // do nothing
} else {
    globalThis.thisScriptLoaded = true;

    function docReady(fn) {
        return new Promise((resolve, reject) => {
            fn ||= resolve;
            if (document.readyState === "interactive" || document.readyState === "complete") {
                fn();
            } else {
                document.addEventListener("DOMContentLoaded", () => {
                    fn();
                });
            }
        });
    }
    
    function emptyNode(target) {
        parseTarget(target, el => {
            while(el.firstChild) el.removeChild(el.firstChild);
        });
    }
    
    function selectorAll(targets) {
        if (typeof targets === "string") {
            targets = document.querySelectorAll(targets);
        }
    
        if (!targets.forEach) {
            targets = [targets];
        }
    
        return targets;
    }
    
    function parseTarget(target, handleElement) {
        if (!target) {
            return [];
        }
    
        target = selectorAll(target);
    
        target.forEach(e => {
            handleElement(e);
        });
    }
    
    function show(target) {
        parseTarget(target, element => {
            if (element.hidden) {
                element.hidden = false;
            }
    
            if (getComputedStyle(element).display === "none") {
                element.style.display = "block";
            }
        });
    }
    
    function hide(target) {
        parseTarget(target, element => {
            element.hidden = true;
    
            if (getComputedStyle(element).display !== "none") {
                element.style.display = "none";
            }
        });
    }
    
    function isVisible(target) {
        if (typeof target === "string") {
            target = document.querySelector(target);
        }
    
        return (target.offsetParent !== null)
    }
    
    function addEventListeners(target, type, fn, namespace, listenerOptions) {
        parseTarget(target, el => {
               let thisListenerOptions = false;
            if (namespace) {
                const abortControllerFnName = `_myAbortController_${namespace}_${type}`;
                if (el[abortControllerFnName]) {
                      console.log("abort")
                      el[abortControllerFnName].abort();
                }
                el[abortControllerFnName] = new AbortController();
              
                if (listenerOptions === true) {
                    thisListenerOptions = {
                        capture: true,
                        signal: el[abortControllerFnName].signal
                    }
                } else if (typeof listenerOptions === 'object') {
                    thisListenerOptions = Object.assign({}, listenerOptions);
                    thisListenerOptions.signal = el[abortControllerFnName].signal;
                } else {
                      thisListenerOptions = {
                        signal: el[abortControllerFnName].signal
                    }
                }
            } else if (listenerOptions) {
                thisListenerOptions = listenerOptions;
            }
            el.addEventListener(type, fn, thisListenerOptions);
        });
    };
    
    function replaceEventListeners(target, type, fn, namespace = "default", listenerOptions) {
        addEventListeners(target, type, fn, namespace, listenerOptions);
    }
    
    function onClick(target, fn, fnName, listenerOptions = false) {
        addEventListeners(target, "click", fn, fnName, listenerOptions);
    }
    
    function onClickReplace(target, fn, namespace = "default", listenerOptions = false) {
        onClick(target, fn, namespace, listenerOptions);
    }
    
    
    /* SLIDE DOWN */
    let slideDown = (targets, duration=500) => {
        if (duration == "fast") {
            duration = 200;
        } else if (duration == "slow") {
            duration = 600;
        }
        parseTarget(targets, target => {
            const currentHeight = target.clientHeight;
            target.style.removeProperty('display');
            let display = window.getComputedStyle(target).display;
            if (display === 'none') display = 'block';
            target.style.display = display;
            target.hidden = false;
    
            if (!currentHeight) {
    
                const prevOverflow = target.style.overflow;
                target.style.overflow = 'hidden';
    
                target.style.height = "auto"
                let height = target.clientHeight + "px";
                target.style.height = 0;
    
                //target.style.paddingTop = 0;
                //target.style.paddingBottom = 0;
                //target.style.marginTop = 0;
                //target.style.marginBottom = 0;
    
                target.offsetHeight;
    
                const prevBoxsizing = target.style.boxSizing;
                target.style.boxSizing = 'border-box';
    
                target.style.transitionProperty = "height";
                target.style.transitionDuration = duration + 'ms';
            
                /** Do this after the 0px has applied. */
                /** It's like a delay or something. MAGIC! */
                setTimeout(() => {
                    target.style.height = height
                }, 0) 
            
                //target.style.removeProperty('padding-top');
                //target.style.removeProperty('padding-bottom');
                //target.style.removeProperty('margin-top');
                //target.style.removeProperty('margin-bottom');
                window.setTimeout( () => {
                    target.style.removeProperty('height');
    
                    target.style.overflow = prevOverflow;
                    target.style.boxSizing = prevBoxsizing;
    
                    target.style.removeProperty('transition-duration');
                    target.style.removeProperty('transition-property');
                }, duration);
            }
    
        });
    }
    
    let fadeOut = (targets, duration=500) => {
        parseTarget(targets, target => {
            if (isVisible(target) || window.getComputedStyle(target).opacity == "1") {
                //target.style.transitionProperty = "opacity";
                target.style.transitionDuration = duration + 'ms';
    
                /** Do this after the 0px has applied. */
                /** It's like a delay or something. MAGIC! */
                setTimeout(() => {
                    target.style.opacity = "0";
                }, 0);
    
                setTimeout(() => {
                    hide(target);
                }, duration);
            
                window.setTimeout( () => {
                    target.style.removeProperty('transition-duration');
                    target.style.removeProperty('transition-property');
                }, duration);
            }
        });
    }
    
    console.log('speechRecognition.js: ' + location.href);
    // use $( document.activeElement ) instead :focus and others like it to optiimize
    
    var HEADER_AND_MESSAGE_AND_FOOTER_AREA_SELECTOR = ".M9";
    var MESSAGE_AND_FOOTER_AREA_SELECTOR = ".iN";
    var SUBJECT_FIELD_SELECTOR = ".aoD.az6 input";
    var COMPOSE_AREA_SELECTOR = ".Am.Al.editable.LW-avf";
    var BOTTOM_AREA_SELECTOR = ".HE"; // Send button, mic etc.
    var SEND_BUTTON_SELECTOR = ".T-I.J-J5-Ji.aoO.T-I-atl.L3";
    
    var SpeechRecognition = window.SpeechRecognition || webkitSpeechRecognition;
    var recognition = new SpeechRecognition();	
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 7;
    
    var $listeningNode;
    var listeningNodeField;
    var $newMessageBox;
    var $interimNode;
    var $talkButton;
    var $lastFocusedNode;
    var listening;
    var listeningNodeBlurredTimer;
    var lastSelection;
    var lastSelectionBeforeDropDown;
    var starts = 0;
    var lastResultEvent;
    var resultIndexToIgnore;
    var speechDialogFadeOutTimer;
    var interimWordsSpoken = false;
    var lengthOfCurrentNodeBeforeInsertingInterimNode;
    var prependText = "";
    var appendText = "";
    // must set to null because it seems to still exist upon re-injecting js
    var $dropdown = null;
    var hoveringOverPhrase = false;
    var hoveringOverDropDown = false;
    var viPhraseEnterTimeout;
    var viPhraseLeaveTimeout;
    var viDropDownLeaveTimeout;
    var lastMousePosition;
    var voiceInputSettings;
    var lastRecognitionError;
    var lastRecognitionErrorCount = 0;
    
    var COMMAND_MESSAGE = "message";
    var COMMAND_SEND_EMAIL = "send email";
    var COMMAND_ERASE = "erase";
    var COMMAND_ERASE_WORD = "erase word";
    var COMMAND_ERASE_WORD_ALT1 = "erase work";
    var COMMAND_ERASE_WORD_ALT2 = "race word";
    var COMMAND_ERASE_ALL = "erase all";
    var COMMAND_STOP_RECORDING = "stop recording";
    var COMMAND_WHOS_YOUR_DADDY = "who's your daddy";
    var voiceInputSuggestions;
    
    String.prototype.startsWith = function(str) {
        return this.indexOf(str) == 0;
    };
    
    String.prototype.endsWith = function(suffix) {
        var indexOfSearchStr = this.indexOf(suffix, this.length - suffix.length); 
        return indexOfSearchStr != -1 && indexOfSearchStr == this.length - suffix.length;
    };
    
    String.prototype.ltrim = function() {
        return this.replace(/^\s+/,"");
    }
    String.prototype.rtrim = function() {
        return this.replace(/\s+$/,"");
    }
    
    String.prototype.capitalize = function() {
        for (var a=0; a<this.length; a++) {
            if (this.charAt(a) != " ") {
                return this.substring(0, a+1).toUpperCase() + this.slice(a+1);
            }
        }
        return this;
    }
    
    String.prototype.endsWith = function(suffix) {
        var indexOfSearchStr = this.indexOf(suffix, this.length - suffix.length); 
        return indexOfSearchStr != -1 && indexOfSearchStr == this.length - suffix.length;
    };
    
    String.prototype.sentenceEnd = function() {
        var str = this.trim();
        if (str.endsWith("\n") || str.endsWith(".") || str.endsWith("<br>")) {
            return true;
        }
    }
    
    String.prototype.replaceWord = function(word, replacementWord) {
        var regex = new RegExp("\\b" + word + "\\b", "g");
        var str = this.replace(regex, replacementWord);
        return str;
    }
    
    function isMac() {
        return navigator.userAgent.match("/mac/i") != null;
    }
    
    function removeLastWord(text) {
        if (text) {
            var lastSpace = text.lastIndexOf(" ");
            return text.substring(0, lastSpace);
        }
    }
    
    function removeInterim($node) {
        if (listeningNodeField == "subject") {
            $node.classList.remove("interim");
            console.log("setinterim: " + $node.value)
            $node._withoutInterim = $node.value;
        } else {
            // compose area
            if ($interimNode) {
                $interimNode.remove();
                $interimNode = null;
            }
        }
    }
    
    function initWarningDialog(message) {
        
        // save last focuses because we'll place the focus on the continue button
        saveLastFocusedNode();
        saveLastSelection();
        
        var $nodeToInsertDialogIn = $listeningNode.closest(HEADER_AND_MESSAGE_AND_FOOTER_AREA_SELECTOR);
        var $speechDialog = $nodeToInsertDialogIn.querySelector(".speechWarningDialog");
        if ($speechDialog) {
            $speechDialog.querySelector(".dialogMessage").innerHTML = message;
            showWarningDialog($speechDialog);
        } else {
            // took the markup from the error dialog box when clicking send email that has no recipients
            $speechDialog = document.createElement("div");
            $speechDialog.classList.add("speechWarningDialog", "Kj-JD");
            $speechDialog.setAttribute("tabindex", "0");
            $speechDialog.setAttribute("role", "alertdialog");
            $speechDialog.style.cssText = "opacity: 1";
    
    
            const $messageWrapper = document.createElement("div");
            $messageWrapper.classList.add("Kj-JD-K7", "Kj-JD-K7-GIHV4");
    
            const $message = document.createElement("span");
            $message.classList.add("Kj-JD-K7-K0");
            $message.textContent = message;
    
            const $link = document.createElement("a");
            $link.style.cssText = "font-size:11px";
            $link.target = "_blank";
            $link.href = "https://jasonsavard.com/wiki/Voice_input#Speech_recognition_stopped";
            $link.textContent = "Why?";
    
            $messageWrapper.append($message, " ", $link);
    
    
            const $buttonsWrapper = document.createElement("div");
            $buttonsWrapper.classList.add("Kj-JD-Jl");
    
            const $speechWarningDialogContinue = document.createElement("button");
            $speechWarningDialogContinue.setAttribute("data-tooltip", "(Enter)");
            $speechWarningDialogContinue.setAttribute("name", "ok");
            $speechWarningDialogContinue.classList.add("speechWarningDialogContinue", "J-at1-auR");
            $speechWarningDialogContinue.textContent = "Continue";
    
            const $speechWarningDialogStop = document.createElement("button");
            $speechWarningDialogStop.setAttribute("data-tooltip", "(Esc)");
            $speechWarningDialogStop.setAttribute("name", "cancel");
            $speechWarningDialogStop.classList.add("speechWarningDialogStop", "J-at1-auR");
            $speechWarningDialogStop.textContent = "Cancel";
    
            $buttonsWrapper.append($speechWarningDialogContinue, " ", $speechWarningDialogStop);
    
            $speechDialog.append($messageWrapper, $buttonsWrapper);
            
            onClickReplace($speechWarningDialogStop, function() {
                chrome.runtime.sendMessage({command: "chromeTTS", stop:true});
                hide($speechDialog);
            });
            
            $nodeToInsertDialogIn.append($speechDialog);
            show($speechDialog);
    
            // *** need to add tabindex attribute to div or else setting focus doesn't work
            showWarningDialog($speechDialog);
    
            replaceEventListeners($speechWarningDialogContinue, "keydown", function(event) {
                if (event.key == "Escape") {
                    chrome.runtime.sendMessage({command: "chromeTTS", stop:true});
                    hide($speechDialog);
                    event.stopPropagation();
                    event.preventDefault();
                } else if (event.key == "Enter" && !event.isComposing) {
                    event.target.click();
                    event.stopPropagation();
                    event.preventDefault();
                }
            });
    
            onClickReplace($speechWarningDialogContinue, function(event) {
                chrome.runtime.sendMessage({command: "chromeTTS", stop:true});
                hide($speechDialog);
                $talkButton.click();
            });
        }
        
        replaceEventListeners($speechDialog, "mousemove", function() {
            if (!hoveringOverDropDown) {			
                clearTimeout(speechDialogFadeOutTimer);			
            }
        });
    
        replaceEventListeners($speechDialog, "mouseenter", function() {
            if (!$speechDialog.classList.contains("hoveringOverDropDown")) {
                //$speechDialog.stop()
                $speechDialog.style.opacity = "1";
            }
        });
    
        if (document.hasFocus()) {
            if (hoveringOverDropDown) {			
                delayBeforFadeOut = 500;
                fadeOutDuration = 1000;			
            } else {
                delayBeforFadeOut = 6000;
                fadeOutDuration = 3000;
            }
            speechDialogFadeOutTimer = setTimeout(function() {
                fadeOut($speechDialog, fadeOutDuration);
            }, delayBeforFadeOut);
        }
    
    }
    
    function showWarningDialog($speechDialog) {
        show($speechDialog);
        
        if (!hoveringOverDropDown) {
            $speechDialog.querySelector(".speechWarningDialogContinue").focus();
        }
    }
    
    function commandEquals(str, command) {
        if (str) {
            if (str.trim().toLowerCase() == command) {
                return true;
            }
        }
    }
    
    function placeCursorBefore($node) {
        var sel = window.getSelection();
        if (sel.rangeCount) {
            var range = sel.getRangeAt(0);
            range.setStartBefore($node);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        }
    }
    
    function placeCursorAfter($node) {
        var sel = window.getSelection();
        if (sel.rangeCount) {
            var range = sel.getRangeAt(0);
            range.setStartAfter($node);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        }
    }
    
    function cleanPhrases(str) {
        if (voiceInputSettings.voiceInputDialect.includes("en-")) {
            str = str.replaceWord("1", "one");
            str = str.replaceWord("THIS", "this");
        }
        return str;
    }
    
    // starts
    recognition.onstart = function() {
        console.log("onstart");
    };
    recognition.onaudiostart = function() {
        console.log("audiostart");
        listening = true;
        
        if (listeningNodeField == "composeArea") {
            // if there's already text in the area than let's append a space
            if ($listeningNode.textContent != "") {
                console.log("prepend space");
                prependText = " ";
            }
        } else {
            $listeningNode._withoutInterim = $listeningNode.value;
            // if there's already text in the area than let's append a space
            if ($listeningNode.value != "") {
                prependText = " ";
            }
        }
    
        // delay because recognition is accepting first words spoken
        $talkButton.classList.add("counting");
        $countdown = $talkButton.querySelector(".countdown");
        $countdown.textContent = "3";
        setTimeout(function() {
            $countdown.textContent = "2";
            setTimeout(function() {
                $countdown.textContent = "1";
                setTimeout(function() {
                    $talkButton.classList.remove("counting");
                    $talkButton.classList.add("listening");
                }, 100)
            }, 100);
        }, 100);
    }
    recognition.onsoundstart = function() {
        console.log("soundstart");
    }
    recognition.onspeechstart = function() {
        console.log("speechstart");
    }
    
    // ends
    recognition.onspeechend = function() {
        console.log("speechend");
    }
    recognition.onsoundend = function() {
        console.log("soundend");
    }
    recognition.onaudioend = function() {
        console.log("audioend");
    }
    recognition.onend = function() {
        console.log("onend");
        resultIndexToIgnore = -1;
        listening = false;
        interimWordsSpoken = false;
        
        if ($talkButton) {
            $talkButton.classList.remove("listening");
        }
    
        // interimittent error (atleast on Mac) apparently just have to retry again and it works
        if (lastRecognitionErrorCount == 0 && lastRecognitionError?.error == "audio-capture") {
            console.log("Try again to start recognition")
            lastRecognitionErrorCount++;		
            startRecognition();
        }
    
    };
    recognition.onstop = function() {
        console.log("onstop");
    };
    
    recognition.onnomatch = function() {
        console.log("onnomatch!");
    }
    
    recognition.onerror = function(e) {
        console.log("error", e);
        removeInterim($listeningNode);
    
        if (e.error == "network" || e.error == "aborted") {
            initWarningDialog("Speech recognition stopped!");
            chrome.runtime.sendMessage({command: "chromeTTS", text:"Speech recognition stopped"}, function(response) {});
        } else if (e.error == "no-speech") {
            initWarningDialog("No speech was detected. <div style='font-size:11px'>You may need to adjust your <a href='https://support.google.com/chrome/bin/answer.py?answer=1407892' target='_blank'>microphone settings</a>.</div>");
            chrome.runtime.sendMessage({command: "chromeTTS", text:"No speech detected"}, function(response) {});
        }
        
        lastRecognitionError = e;
        lastRecognitionErrorCount++;
    };
    
    
    recognition.onresult = function (event) {
        console.log("onresult");
        lastResultEvent = event;
        
        if (!interimWordsSpoken) {
            // get any highlighted words
            var sel = window.getSelection();
            var range;
            if (sel.rangeCount) {		
                range = sel.getRangeAt(0);
                // if selected word
                if (!sel.isCollapsed) {
                    var highlightedText = range.startContainer.nodeValue.substring(range.startOffset, range.endOffset);
                    console.log("hightext: XX" + highlightedText + "YY");
                    if (highlightedText.startsWith(" ")) {
                        prependText = " ";
                    }
                    if (highlightedText.endsWith(" ")) {
                        appendText = " ";
                    }
                }
            }
        }
        
        interimWordsSpoken = true;
        
        if (event.resultIndex == resultIndexToIgnore) {
            console.log("ignore this result index: " + resultIndexToIgnore);
            interimWordsSpoken = false;
        } else {
            //var $focusedNode = $(document.activeElement);
            var listeningNodeIsInputTag = $listeningNode?.tagName == "INPUT";
        
            var phrase = "";
            var finalDetected = false;
            
            console.group("onresult");
            console.log("event:", event);
            for (var i = event.resultIndex; i < event.results.length; ++i) {
                console.log("res:", event.results[i]);
                if (event.results[i].isFinal) {
                    phrase = event.results[i][0].transcript;
                    finalDetected = true;
                    console.log("final: " + phrase);
                } else {
                    phrase += event.results[i][0].transcript;
                }
            }
            
            phrase = cleanPhrases(phrase);
            
            if (finalDetected) {
                console.log("finalized");
                interimWordsSpoken = false;			
            }
          
            console.groupEnd();
        
            if (!finalDetected) {
                insertTextAtCursor({$node:$listeningNode, prependText:prependText, appendText:appendText, text:phrase, onResultEvent:event, interimFlag:true});
            }
            
            if (finalDetected && commandEquals(phrase, COMMAND_ERASE)) {
                console.log("erase word only detected")
                if (listeningNodeIsInputTag) {
                    $listeningNode._withoutInterim = "";
                    $listeningNode.value = "";
                } else {
                    console.log("erase");
                    var sel = window.getSelection();
                    removeInterim($listeningNode);
                    
                    var $lastPhrase = sel.focusNode.closest(".viPhrase")
                    // must place cursor "before" and then delete to save correct cursor position
                    placeCursorBefore($lastPhrase);
                    $lastPhrase.remove();
                    //newNode.parentNode.removeChild(newNode);
                }
            } else if (finalDetected && commandEquals(phrase, COMMAND_SEND_EMAIL)) {
                console.log("send email detected");
                stopRecognition();
                $listeningNode.closest(HEADER_AND_MESSAGE_AND_FOOTER_AREA_SELECTOR).querySelector(SEND_BUTTON_SELECTOR).click();
            } else if (finalDetected && commandEquals(phrase, COMMAND_WHOS_YOUR_DADDY)) {
                console.log("daddy");
                removeInterim($listeningNode);
                chrome.runtime.sendMessage({command: "chromeTTS", text:"Jason of course"}, function(response) {});
            } else if (finalDetected && commandEquals(phrase, COMMAND_STOP_RECORDING)) {
                console.log("stop recording detected");
                stopRecognition(true);
            } else if (finalDetected && phrase.endsWith(" " + COMMAND_ERASE) && phrase.length > COMMAND_ERASE.length) {
                console.log("erase word found at end detected")
                removeInterim($listeningNode);
                //resultIndexToIgnore = lastResultEvent.resultIndex;
                // do nothing
            } else if (finalDetected && commandEquals(phrase, COMMAND_ERASE_ALL)) {
                console.log("erase all");
                if (listeningNodeIsInputTag) {
                    $listeningNode._withoutInterim = "";
                    $listeningNode.value = "";
                } else {
                    removeInterim($listeningNode);
                    $listeningNode.innerHTML = "";
                }			
            } else if ((finalDetected && commandEquals(phrase, COMMAND_ERASE_WORD)) || (finalDetected && commandEquals(phrase, COMMAND_ERASE_WORD_ALT1)) || (finalDetected && commandEquals(phrase, COMMAND_ERASE_WORD_ALT2))) {
                if (listeningNodeIsInputTag) {
                    $listeningNode.value = removeLastWord($listeningNode._withoutInterim);
                } else {
                    console.log("erase word detected");
                    
                    var sel = window.getSelection();
                    removeInterim($listeningNode);
                    const $viPhrases = sel.focusNode.querySelectorAll(".viPhrase");
                    var $viPhrase = $viPhrases[$viPhrases.length - 1];
                    if ($viPhrase) {
                        $viPhrase.textContent = removeLastWord($viPhrase.textContent);
                        placeCursorAfter($viPhrase);
                    }
                    
                    /*
                    var sel = window.getSelection();
                    
                    // text node
                    if (sel.focusNode.nodeType == Node.TEXT_NODE) {
                        console.log("in text node");
                        // if something before text
                        console.log("sel", sel);
                        if (sel.focusOffset >= 1) {
                            // if nothing before look for parent
                            if ($.trim(sel.focusNode.nodeValue.substring(0, sel.focusOffset)) == "") {
                                // nothing before so look at previous sibling
                                console.log("nothing before so look at previous sibling");
                                var previousSibling = sel.focusNode.previousSibling;
                                if (previousSibling) {
                                    console.log("previous sibling")
                                    previousSibling.nodeValue = removeLastWord(previousSibling.nodeValue);
                                }
                            } else {
                                console.log("in or around node");
                                sel.focusNode.nodeValue = removeLastWord(sel.focusNode.nodeValue);
                                
                                console.log("set cursor to where the word was deleted")
                                var range = sel.getRangeAt(0);
                                range.setStart(sel.focusNode, sel.focusNode.nodeValue.length);
                                range.collapse(true);
                                sel.removeAllRanges();
                                sel.addRange(range);
                            }
                        } else {
                            // nothing before so look at previous sibling
                            var previousSibling = sel.focusNode.previousSibling;
                            if (previousSibling) {
                                console.log("previous sibling2")
                                previousSibling.nodeValue = removeLastWord(previousSibling.nodeValue);
                            }
                        }
                    } else {
                        console.log("in or around node");
                        sel.focusNode = removeLastWord(sel.focusNode);
                    }
                    */
                }			
            } else if (listeningNodeField == "subject" && finalDetected && commandEquals(phrase, COMMAND_MESSAGE)) {
                console.log("message command");
                $listeningNode.value = $listeningNode._withoutInterim;
                // had to call blur before calling focus, because it seems the onfocus event occurs before the blur event when setting it programmatically???
                $listeningNode.dispatchEvent(new Event("blur"));
                $listeningNode.closest(HEADER_AND_MESSAGE_AND_FOOTER_AREA_SELECTOR).querySelector(COMPOSE_AREA_SELECTOR).focus();
            } else {
                if (finalDetected && phrase) {
                    insertTextAtCursor({$node:$listeningNode, prependText:prependText, appendText:appendText, text:phrase, onResultEvent:event});
                }
            }
            
            if (finalDetected && phrase) {
                // reset this
                prependText = "";
                appendText = "";
            }
        }
    }
    
    async function startRecognition() {
        const response = await chrome.runtime.sendMessage({command: "getVoiceInputSettings"});
        console.log("get settings", response);
        
        voiceInputSuggestions = response.voiceInputSuggestions;
        
        voiceInputSettings = response;
        recognition.lang = response.voiceInputDialect;
        lastRecognitionError = null;
        lastRecognitionErrorCount = 0;
        recognition.start();
    }
    
    function stopRecognition(returnToLastFocus) {
        clearTimeout(listeningNodeBlurredTimer);
        recognition.stop();
        removeInterim($listeningNode);
    
        if (returnToLastFocus) {
            // return focus after probably losing focus from pushing stop button
            // must place focus before setting lastselection (or else it would be default to start of node)
            $listeningNode.focus();
            var sel = window.getSelection(); 
            sel.removeAllRanges();
            sel.addRange(lastSelection);
        }
    }
    
    function saveLastFocusedNode() {
        $lastFocusedNode = window.getSelection().focusNode?.parentElement;
    }
    
    function saveLastSelection() {
        var selection = window.getSelection();
        if (selection.rangeCount) {
            lastSelection = selection.getRangeAt(0);
            //console.log("save last selection", lastSelection);
        }
    }
    
    function attachFocusEvents($node, listeningNodeField) {
        //console.log("attach: " + listeningNodeField + " " + $node.length);
    
        replaceEventListeners($node, "mousemove", function(e) {
            lastMousePosition = e;
        });
    
        replaceEventListeners($node, "mousedown", function(e) {
            console.log("listening node mousedown");
            if ($listeningNode) {
                $listeningNode.querySelector(".selected")?.classList.remove("selected");
                if ($dropdown) {
                    hide($dropdown);
                }
            }
        });
    
        replaceEventListeners($node, "focusin", function(event) {
            console.log(listeningNodeField + " onfocus");
            clearTimeout(listeningNodeBlurredTimer);
            
            // already listening to change this to current listening node
            if (listening) {
                $listeningNode = event.target;
                window.listeningNodeField = listeningNodeField;
            }
        });
    
        replaceEventListeners($node, "focusout", function(event) {
            console.log(listeningNodeField + " blur");
            listeningNodeBlurredTimer = setTimeout(function() {
                if (listening) {
                    console.log("ABORT !!");
                    recognition.abort();
                }
            }, 400);
            
            // remove interim/gray
            if (listening) {
                if (listeningNodeField == "subject") {
                    // only ignore next results if interim words were spoken before finalized
                    if (interimWordsSpoken && lastResultEvent) {
                        console.log("set resultIndexToIgnore: " + lastResultEvent.resultIndex);
                        resultIndexToIgnore = lastResultEvent.resultIndex;
                    }
                    removeInterim($node);
                }
            }
        });
        return $node;
    }
    
    function addTalkButtons() {
        var $messageAndFooterAreas = document.querySelectorAll(HEADER_AND_MESSAGE_AND_FOOTER_AREA_SELECTOR);
        
        if ($messageAndFooterAreas.length) {
            $messageAndFooterAreas.forEach($messageAndFooterArea => {
                
                var $bottomArea = $messageAndFooterArea.querySelector(BOTTOM_AREA_SELECTOR); // bottom left area
                
                // make sure not already added
                if (!$bottomArea?.querySelector(".talkButton")) {
                
                    attachFocusEvents($messageAndFooterArea.querySelector(SUBJECT_FIELD_SELECTOR), "subject");
                    
                    // try once and then retry at intervals again because it seems that in compose popup window the compose area dom takes a while to be created
                    var nodeFound = attachFocusEvents($messageAndFooterArea.querySelector(COMPOSE_AREA_SELECTOR), "composeArea");					
                    var attachFocusEventsToComposeAreaInterval = setInterval(function() {
                        if (nodeFound) {
                            clearInterval(attachFocusEventsToComposeAreaInterval);
                        } else {
                            nodeFound = attachFocusEvents($messageAndFooterArea.querySelector(COMPOSE_AREA_SELECTOR), "composeArea");
                        }
                    }, 500);
                    
                    // hook key combos
                    replaceEventListeners($messageAndFooterArea, "keydown", function(e) {
                        //console.log("key:", e);
                        // key combo: Ctrl+Shift+.(period)
                        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key == ".") {
                            saveLastSelection();
                            $talkButton.click();
                        }
                    });
                    
                    // find Send button
                    onClickReplace($messageAndFooterArea.querySelector(".T-I.J-J5-Ji.aoO.T-I-atl.L3"), function() {
                        stopRecognition();
                    });
                    
                    
                    var shortcutText = isMac() ? "⌘-Shift-." : "Ctrl+Shift+.";
                    $talkButton = document.createElement("td");
                    $talkButton.classList.add("talkButton", "oc", "gU");
    
                    const $speechRecognition = document.createElement("div");
                    $speechRecognition.setAttribute("data-tooltip", `Speech recognition (${shortcutText})`);
                    $speechRecognition.setAttribute("aria-label", "Speech recognition");
    
                    const $outerDiv = document.createElement("div");
                    $outerDiv.classList.add("J-Z-I", "J-J5-Ji");
                    $outerDiv.setAttribute("aria-selected", "false");
                    $outerDiv.setAttribute("role", "button");
                    $outerDiv.setAttribute("style", "-webkit-user-select: none;");
    
                    const $outerDiv2 = document.createElement("div");
                    $outerDiv2.classList.add("J-J5-Ji", "J-Z-I-Kv-H");
    
                    const $outerDiv3 = document.createElement("div");
                    $outerDiv3.classList.add("J-J5-Ji", "J-Z-I-J6-H");
    
                    const $countdown = document.createElement("div");
                    $countdown.classList.add("countdown");
                    $countdown.textContent = "3";
    
                    const $speechImage = document.createElement("div");
                    $speechImage.classList.add("dv", "speechImage");
    
                    $outerDiv3.append($countdown, $speechImage);
                    $outerDiv2.append($outerDiv3);
                    $outerDiv.append($outerDiv2);
    
                    $talkButton.append($outerDiv);
                    
                    replaceEventListeners($talkButton, "mousemove", function() {
                        //console.log("last selection")
                        if (listeningNodeField == "composeArea") {
                            if (document.activeElement.querySelector(COMPOSE_AREA_SELECTOR)) {
                                saveLastSelection();
                            }
                        }
                    });
    
                    replaceEventListeners($talkButton, "mousedown", function() {
                        saveLastFocusedNode();
                    });
    
                    replaceEventListeners($talkButton, "click", function(event) {
                        if (listening) {
                            stopRecognition(true);
                        } else {
                            // jason todo remove
                            console.log("who had focus:", $lastFocusedNode);
                            console.log("who had focus:", typeof $lastFocusedNode);
                            //console.log("who", $lastFocusedNode?.parentNode);
                            //console.log("who", $lastFocusedNode?.parentElement);
    
                            $newMessageBox = $bottomArea.closest(HEADER_AND_MESSAGE_AND_FOOTER_AREA_SELECTOR);
                            var $composeArea = $lastFocusedNode?.closest(COMPOSE_AREA_SELECTOR);
    
                            clearTimeout(listeningNodeBlurredTimer);
                            
                            // if subject field
                            if ($lastFocusedNode?.querySelector(SUBJECT_FIELD_SELECTOR) || $lastFocusedNode?.parentElement.querySelector(SUBJECT_FIELD_SELECTOR)) {
                                console.log("regain focus to input:", $lastFocusedNode);
                                // the input field is actually one descendant down
                                $listeningNode = $lastFocusedNode.querySelector("input");
                                listeningNodeField = "subject";
                            } else if ($composeArea) {
                                $listeningNode = $composeArea;
                                listeningNodeField = "composeArea";
                            } else {
                                console.log("no input field recognized defaulting...");
                                var $subjectField = $newMessageBox.querySelector(SUBJECT_FIELD_SELECTOR);
                                
                                if (isVisible($subjectField)) {
                                    if ($subjectField.value == "") { // never intialized so assume we go here
                                        console.log("to subject:", $listeningNode);
                                        $listeningNode = $subjectField;
                                        listeningNodeField = "subject";
                                    } else { // subject already filled so assume we want to continue in the compose area...
                                        console.log("subject already filled so focus compose area instead...", $listeningNode);
                                        $listeningNode = event.target.closest(HEADER_AND_MESSAGE_AND_FOOTER_AREA_SELECTOR).querySelector(COMPOSE_AREA_SELECTOR);
                                        console.log("listeningnode: ", $listeningNode);
                                        listeningNodeField = "composeArea";
                                        lastSelection = null;
                                    }
                                } else {
                                    console.log("subject not visible so focus compose area");
                                    $listeningNode = event.target.closest(HEADER_AND_MESSAGE_AND_FOOTER_AREA_SELECTOR).querySelector(COMPOSE_AREA_SELECTOR);
                                    listeningNodeField = "composeArea";
                                    lastSelection = null;
                                }
                            }
    
                            // must do this after attaching onfocus evens
                            console.log("set focus");
                            $listeningNode.focus();
    
                            if (listeningNodeField == "composeArea") {
                                // patch: seems that calling focus() doesn't place the cursor to the last selection spot (unless the user manually placed the cursor vs programmatically placing the cursor)
                                // make sure the last selection was within a compose area
                                if (lastSelection?.startContainer.closest(COMPOSE_AREA_SELECTOR)) {
                                    console.log("last selection: ", lastSelection);
                                    window.getSelection().removeAllRanges();
                                    window.getSelection().addRange(lastSelection);
                                }
                            }
                            startRecognition();
                        }
                    });
    
                    $bottomArea.querySelector(".oc.gU").after($talkButton);
                }
            });
        }
    }
    
    function showDropDown($viPhrase, params) {
        
        clearTimeout(viPhraseEnterTimeout);
        
        viPhraseEnterTimeout = setTimeout(function() {
    
            console.log("show dropdown: " + $viPhrase.textContent);
            // make sure user hasn't selected or is not selecting any text (because it's annoying to see the dropdowns while doing that)
            if (getSelection().isCollapsed) { //!$viPhrase.hasClass("selected") 
                console.log("iscollapsed")
                var selection = window.getSelection();
                if (selection.rangeCount) {
                    lastSelectionBeforeDropDown = selection.getRangeAt(0);
                    //console.log("save selection before dd:", lastSelectionBeforeDropDown)
                }
                
                console.log("dropdown", $dropdown);
                if (!$dropdown) {
                    console.log("create dropdown");
                    $dropdown = document.createElement("div");
                    $dropdown.id = "viDropDown";
                    $dropdown.style["font-size"] = $listeningNode.style["font-size"];
    
                    replaceEventListeners($dropdown, "mouseenter", function() {
                        console.log("dropdown enter");
                        clearTimeout(viPhraseLeaveTimeout);
                    });
    
                    replaceEventListeners($dropdown, "mouseleave", function() {
                        console.log("dropdown leave");
                        hoveringOverDropDown = false;
                        viDropDownLeaveTimeout = setTimeout(function() {
                            console.log("dropdown timeout");
                            var $viPhrase = $dropdown._viPhrase;
                            if ($viPhrase) {
                                $viPhrase.classList.remove("selected");
                            }
                            //$dropdown.stop(true, true).hide();
                            hide($dropdown);
                        }, 20);
                    });
    
                    replaceEventListeners($dropdown, "mousemove", function() {
                        hoveringOverDropDown = true;
                    });
                }
                //$dropdown.stop(true, true).hide();
                hide($dropdown);
                
                var alts = $viPhrase._alternatives;
                emptyNode($dropdown);
                $dropdown._viPhrase = $viPhrase;
                if (alts) {
                    console.log("alts", alts);
                    Array.from(alts).forEach((alt, index) => {
                        // ignore first one, it should already be the default one
                        if (index != 0) {
                            var $alt = document.createElement("div");
                            $alt.classList.add("viDropDownItem");
                            
                            var text = params.prependText + alt.transcript + params.appendText;
                            text = cleanPhrases(text);
                            if ($viPhrase._capitalize) {
                                text = text.capitalize();
                            }
                            
                            $alt._text = text;
                            $alt.textContent = text; // .replace(" ", "&nbsp;")
                            
                            replaceEventListeners($alt, "mousedown", function(e) {													
                                $viPhrase.textContent = e.target._text;
                                
                                // common code
                                $viPhrase.classList.remove("selected");
                                //$dropdown.stop(true, true).hide();												
                                hide($dropdown);
        
                                placeCursorAfter($viPhrase);
        
                                e.preventDefault();
                                e.stopPropagation();
                            });
                            $dropdown.append($alt);
                        }
                    });
                }
    
                var $alt = document.createElement("div");
                $alt.classList.add("viDropDownItem", "erase");
                $alt.textContent = "Erase";
                replaceEventListeners($alt, "mousedown", function(event) {
                    console.log("alt click")
                    placeCursorBefore($viPhrase);
                    $viPhrase.remove();										
                    
                    // common code
                    //$dropdown.stop(true, true).hide();	
                    hide($dropdown);
                    event.preventDefault();
                    event.stopPropagation();
                });
                $dropdown.append($alt);
    
                //var $area = $viPhrase.closest(COMPOSE_AREA_SELECTOR);
                var $area = $newMessageBox;
                
                // if has aO9 then we are in the reply area (vs the compose new message area) so place dropdown there because the reply area is smaller
                var inReplyArea;
                if ($area.classList.contains("aO9")) {
                    inReplyArea = true;
                    //$area = $newMessageBox;
                    buffer = 30;
                } else {
                    //buffer = 10;
                    buffer = 30;
                }
                
                $area.append($dropdown);										
                var ddHeight = $dropdown.clientHeight;
                //$dropdown.stop(true, true).hide();
                hide($dropdown);
                
                /*
                console.log("compose height: ", $area.height() + " " + ddHeight);
                console.log("offset:", $viPhrase.offset())
                console.log("position:", $viPhrase.position())
                console.log("rects:", $viPhrase[0].getClientRects());
                */
                
                // place the dropdown below selected phrase
                var MARGIN_LEFT_WIDTH = 2;
                var top;
                if ($viPhrase.getClientRects().length == 1) { // 1 box = not wrapped so place it just at the bottom of this text
                    top = $viPhrase.getClientRects()[0].bottom;
                    left = $viPhrase.getClientRects()[0].left;
                    console.log("left1: ", left);
                } else { // 2+ means it is wrapped so place it "before" the last rectangle
                    //top = $viPhrase[0].getClientRects()[$viPhrase[0].getClientRects().length-2].bottom;
                    top = lastMousePosition.clientY + 7; // + $viPhrase[0].getClientRects()[0].height;
                    left = lastMousePosition.clientX - ($dropdown.clientWidth / 2);
    
                    console.log("left2: ", left);
                    
                    // if off screen to right
                    if (left+$dropdown.clientWidth > document.body.clientWidth) {
                        left = document.body.clientWidth - $dropdown.clientWidth - 10;
                        console.log("left3: ", left);
                    }
                    // if off screen to left
                    if (left < 0) {
                        left = 10;
                        console.log("left4: ", left);
                    }
                }
                console.log("mouseY: " + lastMousePosition.clientY);
                console.log("top", top);
                
                var offsetTop;
                if ($viPhrase.getBoundingClientRect().top < document.body.clientHeight - ddHeight - buffer) {
                    console.log("here")
                    //slideDown($dropdown);
                    show($dropdown);
                    //offsetTop = top + $viPhrase.height()
                } else {
                    console.log("there")
                    show($dropdown);
                    top -= ddHeight;
                }
    
                function setOffset(elem, options) {
                    var curPosition, curLeft, curCSSTop, curTop, curOffset, curCSSLeft, calculatePosition,
                        position = getComputedStyle( elem )["position"],
                        props = {};
            
                    // Set position first, in-case top/left are set even on static elem
                    if ( position === "static" ) {
                        elem.style.position = "relative";
                    }
            
                    curOffset = elem.getBoundingClientRect()
                    console.log("el", elem)
                    curCSSTop = getComputedStyle(elem)["top"];
                    curCSSLeft = getComputedStyle(elem)["left"];
                    calculatePosition = ( position === "absolute" || position === "fixed" ) &&
                        ( curCSSTop + curCSSLeft ).indexOf( "auto" ) > -1;
            
                    // Need to be able to calculate position if either
                    // top or left is auto and position is either absolute or fixed
                    if ( calculatePosition ) {
                        curTop = elem.offsetTop;
                        curLeft = elem.element.offsetLeft;
                    } else {
                        curTop = parseFloat( curCSSTop ) || 0;
                        curLeft = parseFloat( curCSSLeft ) || 0;
                    }
            
                    if ( options.top != null ) {
                        props.top = ( options.top - curOffset.top ) + curTop;
                    }
                    if ( options.left != null ) {
                        props.left = ( options.left - curOffset.left ) + curLeft;
                    }
            
                    elem.style.top = props.top + "px";
                    elem.style.left = props.left + "px";
                }
                
                console.log("top left", top, left);
                console.log($dropdown.style.top, $dropdown.style.left);
                console.log("dd bounding", $dropdown.getBoundingClientRect())
                //$($dropdown).offset({top:top, left:left - MARGIN_LEFT_WIDTH});
                setOffset($dropdown, {top:top, left:left - MARGIN_LEFT_WIDTH});
                console.log($dropdown.style.top, $dropdown.style.left);
                // 139px 270.578px
                //$dropdown.style.top = "139" + "px";
                //$dropdown.style.left = ("270" - MARGIN_LEFT_WIDTH) + "px";
                console.log("top2: ", (top - 0))
                console.log("left2: ", (left - $dropdown.getBoundingClientRect().left - MARGIN_LEFT_WIDTH))
                //$dropdown.style.top = (top - 0) + "px";
                //$dropdown.style.left = (left - $dropdown.getBoundingClientRect().left - MARGIN_LEFT_WIDTH) + "px";
                
                /*
                if (inReplyArea) {
                    if ($viPhrase.offset().top < $(document).height() - ddHeight - buffer) {
                        $dropdown.slideDown();
                        offsetTop = $viPhrase.offset().top + $viPhrase.height()
                    } else {
                        $dropdown.show();
                        offsetTop = $viPhrase.offset().top - ddHeight;
                    }
                } else { // new message area
                    if ($viPhrase.position().top < $area.height() - ddHeight - buffer) {
                        $dropdown.slideDown();
                        offsetTop = $viPhrase.offset().top + $viPhrase.height();
                    } else {
                        $dropdown.show();
                        offsetTop = $viPhrase.offset().top - ddHeight;
                    }
                }
                //$dropdown.offset({top:offsetTop, left:$viPhrase.offset().left});
                $dropdown.offset({top:offsetTop, left:$viPhrase[0].getClientRects()[0].left});
                */
            }
        
        }, 100);
    }
    
    function shouldCapitalize(range, text) {
        // detect if should capitalize
        // if focued node is the contented editable than it's probably empty so let's capitalize
        var capitalize = false;
        
        // Sep. 28, 2016 - I was getting capitization (again) after pauses - weird cause I had just fixed this much earlier in time in v19.2.4 on May 13
        if (false) { // range.startContainer.hasAttribute && range.startContainer.hasAttribute("contenteditable")
            capitalize = true;
            console.log("capitalize: " + text);
        } else if (range.startContainer.nodeType == Node.TEXT_NODE) {
            if (range.startOffset <= 1) {
                if (range.startContainer.previousSibling == null) {
                    console.log("range:", range);
                    capitalize = true;
                    console.log("capitalize2: " + text);
                } else {
                    if (range.startContainer.previousSibling.nodeType == Node.TEXT_NODE) {
                        if (range.startContainer.previousSibling.nodeValue.sentenceEnd()) {
                            console.log("range:", range);
                            capitalize = true;
                            console.log("capitalize4: " + text);
                        } else {
                            console.log("nocap2");
                        }
                    } else if (range.startContainer.previousSibling.innerText.sentenceEnd()) {
                        console.log("range:", range);
                        capitalize = true;
                        console.log("capitalize6: " + text);							
                    } else {
                        console.log("nocap3");
                    }
                }
            } else if (range.startContainer.nodeValue.substring(0, range.startOffset).sentenceEnd()) {
                console.log("range:", range);
                capitalize = true;
                console.log("capitalize5: " + text);
            } else {
                console.log("nocap21", range)
                console.log("nocap21" + text);
            }
        } else { // DOM node				
            var previousNode;
            var $previousPhrase = range.startContainer.querySelectorAll(".viPhrase");
            if ($previousPhrase.length) {
                previousNode = $previousPhrase[$previousPhrase.length - 1];
            } else {
                // might be old code, it was always returning null and so it was capitalizing words when pausing refer to https://jasonsavard.com/forum/discussion/comment/9884#Comment_9884
                previousNode = range.startContainer.previousSibling;
            }
            
            if (previousNode == null) {
                capitalize = true;
                console.log("capitalize3: " + text);
            } else if (previousNode.nodeType == Node.TEXT_NODE) {
                if (previousNode.nodeValue.sentenceEnd()) {
                    capitalize = true;
                    console.log("capitalize7: " + text);
                } else {
                    console.log("range:", range);
                    console.log("nocap5");
                }
            } else {
                if (previousNode.innerText == "" || previousNode.innerHTML.sentenceEnd()) {
                    capitalize = true;
                    console.log("capitalize8: " + text);
                } else {
                    console.log("html: " + previousNode.innerHTML);
                    console.log("text: " + previousNode.innerText);
                    console.log("range:", range);
                    console.log("nocap4");
                }
            }
        }
        return capitalize;
    }
    
    function insertTextAtCursor(params) {
        
        var sel = window.getSelection();
        var range;
        if (sel.rangeCount) {
            range = sel.getRangeAt(0);
        }
        
        var text = params.prependText + params.text + params.appendText;
        var $node = params.$node;
        if ($node?.tagName == "INPUT") {
            console.log("flag: " + params.interimFlag + " _ " + text);
            if (text && params.interimFlag) {
                $node.classList.add("interim");
                var withoutInterim = $node._withoutInterim;
                console.log("write input:" + withoutInterim);
                
                var oldtext = withoutInterim;
                var curposS = $node.selectionStart;
                var curposF = $node.selectionEnd;
                if (oldtext) {
                    pretext = oldtext.substring(0,curposS);
                    posttest = oldtext.substring(curposF,oldtext.length);
                } else {
                    pretext = "";
                    posttest = "";
                }
                console.log("pretext: " + pretext + "_old tex: "+ posttest);
                $node.value = ((pretext + text).ltrim()).capitalize() + posttest;
                $node.selectionStart=curposS+text.length;
                $node.selectionEnd=curposS+text.length;
            } else if (!params.interimFlag) {
                removeInterim($node);
            }
        } else {
            if (sel.rangeCount) {
                
                range.deleteContents();
    
                if ($interimNode?._capitalize) {
                    text = text.capitalize();
                }
    
                //if (text.includes("\n")) {
                    //text = text.replace(/\n/g, "<br>");
                //}
                
                if (params.interimFlag) {
                    console.log("interim", $interimNode);
                    if ($interimNode) {
                        $interimNode.textContent = text;
                    } else {
                        // save spot to see if we inserted interim text in the middle of a text node
                        //lengthOfCurrentNodeBeforeInsertingInterimNode = sel.focusNode.length; 
                        
                        $interimNode = document.createElement("span");
                        $interimNode.classList.add("viPhrase", "interimText");
                        
                        //console.log("selfocusnode: ", sel.focusNode);
                        
                        var capitalize = shouldCapitalize(range, text);
                        if (capitalize) {
                            text = text.capitalize();
                            $interimNode._capitalize = capitalize;
                        }
                        
                        $interimNode.textContent = text;
    
                        if ($interimNode.innerHTML.trim() == "") {
                            console.log("empty span", $interimNode);
                        } else {
                            // patch: length of current text still the same as before interting any interim node - so assume we are at the end of a node and want to insert another span after the current
                            //console.log("focus: " + sel.focusOffset + "_" + sel.focusNode.length)
                            if (sel.focusNode.nodeType == Node.TEXT_NODE && sel.focusOffset == sel.focusNode.length) {
                                console.log("at end so parent.after")
                                console.log("sel", sel.focusNode.nodeType + " "+ sel.focusOffset + " len: "+ sel.focusNode.length);						
                                
                                var $parent = sel.focusNode.parentElement;
                                // make sure the parent is not the compose area
                                if ($parent.querySelectorAll(COMPOSE_AREA_SELECTOR).length) {
                                    console.log("in compose")
                                    //sel.focusNode.after($interimNode);
                                    sel.focusNode.insertBefore($interimNode, sel.focusNode.nextSibling)
                                } else if ($parent.tagName == "DIV") { // this happens without starting mic and we enter text on several lines and contenteditable area wraps lines with DIVs
                                    console.log("in div")
                                    range.insertNode( $interimNode );
                                } else {
                                    console.log("insert after")
                                    $parent.after($interimNode);
                                }
                            } else {
                                range.insertNode( $interimNode );
                            }
                            
                            if (params.onResultEvent && voiceInputSuggestions) {
    
                                replaceEventListeners($interimNode, "mouseenter", function(event) {
                                    const $node = event.target;
    
                                    $node._mouseEntered = "true";
                                    console.log("phrase enter: " + $node.textContent)
                                    hoveringOverPhrase = true;
                                    clearTimeout(viDropDownLeaveTimeout);
                                    
                                    var alreadySelected = $node.classList.contains("selected");
                                    if (!$node.classList.contains("selected") && getSelection().isCollapsed) {
                                        $node.closest(COMPOSE_AREA_SELECTOR).querySelector(".selected")?.classList.remove("selected");
                                        $node.classList.add("selected");
                                    }
                                    if (!alreadySelected && !$node.classList.contains("interimText")) {
                                        showDropDown($node, params);
                                    }
                                });
    
                                replaceEventListeners($interimNode, "mousemove", function(event) {
                                    const $node = event.target;
                                    console.log("phrase move")
                                    if ((!$dropdown || (!isVisible($dropdown)) && $node.classList.contains("selected"))) {
                                        if (!$node.classList.contains("interimText")) {
                                            showDropDown($node, params);
                                        }
                                    }
                                });
    
                                replaceEventListeners($interimNode, "mouseleave", function(event) {
                                    const $node = event.target;
                                    $node._mouseEntered = null;
                                    clearTimeout(viPhraseEnterTimeout);
                                    clearTimeout(viPhraseLeaveTimeout);
                                    
                                    hoveringOverPhrase = false;
                                    var $viPhrase = $node;
                                    console.log("phrase leave: ", $viPhrase.textContent);
                                    
                                    viPhraseLeaveTimeout = setTimeout(function() {
                                        console.log("phrase leavetimeout: " + $viPhrase.textContent);
                                        $viPhrase.classList.remove("selected");
                                        
                                        if ($dropdown) {
                                            hide($dropdown);
                                            
                                            if (!hoveringOverPhrase) {
                                                //$dropdown.stop(true, true).slideUp();
                                                hide($dropdown);
                                            }
                                        }
                                    }, 20);
                                });
                            }
                        }
                    }
    
                    range.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(range);
    
                } else {
                    console.log("final insert: " + text);
    
                    emptyNode($interimNode);
                    var textNodes = text.split("\n");
                    textNodes.forEach((textNode, index) => {
                        $interimNode.append(textNode);
                        if (index+1 < textNodes.length) {
                            $interimNode.append(document.createElement("br"));
                        }
                    });
                    //$interimNode.text(text);
                    placeCursorAfter($interimNode);
                    $interimNode.classList.remove("interimText");
                    if (params.onResultEvent) {
                        $interimNode._alternatives = params.onResultEvent.results[params.onResultEvent.resultIndex];
                    }
                    
                    // if already hovering over than popup out the dropdown
                    if ($interimNode._mouseEntered) {
                        $interimNode.dispatchEvent(new Event("mousemove"));
                    }
                    
                    $interimNode = null;
                    
                    //removeInterim();
                }
            }
        }
    }
    
    // commented doc ready because due to endless spinning Gmail webpage tab icon
    //docReady(() => {
        window.addEventListener("blur", function() {
            //console.log("window blur: " + new Date());
            // cancel the abort because we want user to be able to keeping talking from another window!
            clearTimeout(listeningNodeBlurredTimer);
        });
    
        window.addEventListener("focus", function() {
            //console.log("window focus: " + new Date());
        });
    
        setInterval(function() {
            addTalkButtons();
        }, 1000);
    //});
}