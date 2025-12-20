// Copyright Jason Savard

function onLoad() {
    var popupWindowPort;

    function isCtrlPressed(e) {
        return e.ctrlKey || e.metaKey;
    }

    // works like jquery .on
    function delegate(el, evt, sel, handler) {
        el.addEventListener(evt, function (event) {
            var t = event.target;
            while (t && t !== this) {
                if (t.matches(sel)) {
                    handler.call(t, event);
                }
                t = t.parentNode;
            }
        });
    }

    delegate(document, "click", "a", function (event) {
        if (isCtrlPressed(event) || event.button == 1) {
            chrome.runtime.sendMessage({ command: "openTabInBackground", url: event.target.href });
            event.preventDefault();
        }
    });

    var MOBILE_URL_PREFIX = "#tl/";
    var MOBILE_URL_PRIORITY = "priority/";

    var MOBILE_URL_INBOX = MOBILE_URL_PREFIX + encodeURIComponent("^i");
    var MOBILE_URL_IMPORTANT = MOBILE_URL_PREFIX + encodeURIComponent("^io_im");
    var MOBILE_URL_ALL_MAIL = MOBILE_URL_PREFIX + encodeURIComponent("^all");
    var MOBILE_URL_PRIMARY = MOBILE_URL_PREFIX + MOBILE_URL_PRIORITY + encodeURIComponent("^smartlabel_personal");
    var MOBILE_URL_PURCHASES = MOBILE_URL_PREFIX + MOBILE_URL_PRIORITY + encodeURIComponent("^smartlabel_receipt");
    var MOBILE_URL_FINANCE = MOBILE_URL_PREFIX + MOBILE_URL_PRIORITY + encodeURIComponent("^smartlabel_finance");
    var MOBILE_URL_SOCIAL = MOBILE_URL_PREFIX + MOBILE_URL_PRIORITY + encodeURIComponent("^smartlabel_social");
    var MOBILE_URL_PROMOTIONS = MOBILE_URL_PREFIX + MOBILE_URL_PRIORITY + encodeURIComponent("^smartlabel_promo");
    var MOBILE_URL_UPDATES = MOBILE_URL_PREFIX + MOBILE_URL_PRIORITY + encodeURIComponent("^smartlabel_notification");
    var MOBILE_URL_FORUMS = MOBILE_URL_PREFIX + MOBILE_URL_PRIORITY + encodeURIComponent("^smartlabel_group");

    function addStyle(css){
        var s = document.createElement('style');
        s.setAttribute('id', 'checkerPlusForGmail');
        s.setAttribute('type', 'text/css');
        s.appendChild(document.createTextNode(css));
        return (document.getElementsByTagName('head')[0] || document.documentElement).appendChild(s);
    }

    function getCookie(c_name) {
        if (document.cookie.length > 0) {
            c_start = document.cookie.indexOf(c_name + "=");
            if (c_start != -1) {
                c_start = c_start + c_name.length + 1;
                c_end = document.cookie.indexOf(";", c_start);
                if (c_end == -1) c_end = document.cookie.length;
                return decodeURIComponent(document.cookie.substring(c_start, c_end));
            }
        }
        return "";
    }
    
    function syncCurrentEmail() {
        popupWindowPort.postMessage({action: "getCurrentEmail", email:getCookie("GAUSR")});
    }
    
    console.log("onload: " + location.href);
    
    // position search button
    setTimeout(function() {
        const menuButton = document.querySelector("[aria-label=\"Menu\"], [onclick=\"_e(event, 'qa')\"]");
        if (menuButton?.nextSibling) {
            var searchButton = document.createElement("div");
            searchButton.id = "gmailPopupSearch";
            searchButton.style.display = "inline-block";
            searchButton.style.marginLeft = "8px";
            
            var searchImage = document.createElement("img");
            searchImage.setAttribute("src", "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' version='1.1' id='Capa_1' x='0px' y='0px' viewBox='0 0 600 600' style='enable-background:new 0 0 487.95 487.95;' xml:space='preserve'%3E%3Cg%3E%3Cg%3E%3Cpath d='M481.8,453l-140-140.1c27.6-33.1,44.2-75.4,44.2-121.6C386,85.9,299.5,0.2,193.1,0.2S0,86,0,191.4s86.5,191.1,192.9,191.1 c45.2,0,86.8-15.5,119.8-41.4l140.5,140.5c8.2,8.2,20.4,8.2,28.6,0C490,473.4,490,461.2,481.8,453z M41,191.4 c0-82.8,68.2-150.1,151.9-150.1s151.9,67.3,151.9,150.1s-68.2,150.1-151.9,150.1S41,274.1,41,191.4z'/%3E%3C/g%3E%3C/g%3E%3Cg%3E%3C/g%3E%3Cg%3E%3C/g%3E%3Cg%3E%3C/g%3E%3Cg%3E%3C/g%3E%3Cg%3E%3C/g%3E%3Cg%3E%3C/g%3E%3Cg%3E%3C/g%3E%3Cg%3E%3C/g%3E%3Cg%3E%3C/g%3E%3Cg%3E%3C/g%3E%3Cg%3E%3C/g%3E%3Cg%3E%3C/g%3E%3Cg%3E%3C/g%3E%3Cg%3E%3C/g%3E%3Cg%3E%3C/g%3E%3C/svg%3E");
            searchButton.appendChild(searchImage);
            
            searchButton.addEventListener('click', function() {
                // must use /Inbox because the back to inbox buttons were not working anymore
                location.href = "#";

                // need to give time for inbox to load before opening search
                setTimeout(function() {
                    var searchForm = document.querySelector("form[role='search']");
                    if (searchForm) {
                        searchForm.style.display = "table";
                    }
                    
                    var searchInput = document.querySelector("#tl_ form input");
                    if (searchInput) {
                        searchInput.focus();
                    }
                }, 300);
            });

            menuButton.parentNode.insertBefore(searchButton, menuButton.nextSibling);
        }
    }, 100);
    
    popupWindowPort = chrome.runtime.connect({ name: "popupWindowAndTabletFrameChannel" });
    popupWindowPort.onMessage.addListener(function(message) {
        if (message.action == "reloadTabletView") {
            const refreshButton = document.querySelector("[aria-label=\"Refresh\"], [onclick=\"_e(event, 'j')\"]");
            if (refreshButton) {
                refreshButton.click();
            } else {
                location.reload();
            }
        } else if (message.action == "goToLabel") {
            if (message.label == "tabInbox") {
                location.href = MOBILE_URL_INBOX;
            } else if (message.label == "tabImportant") {
                location.href = MOBILE_URL_IMPORTANT;
            } else if (message.label == "tabAllMail") {
                location.href = MOBILE_URL_ALL_MAIL;
            } else if (message.label == "tabPrimary") {
                location.href = MOBILE_URL_PRIMARY;
            } else if (message.label == "tabPurchases") {
                location.href = MOBILE_URL_PURCHASES;
            } else if (message.label == "tabFinance") {
                location.href = MOBILE_URL_FINANCE;
            } else if (message.label == "tabSocial") {
                location.href = MOBILE_URL_SOCIAL;
            } else if (message.label == "tabPromotions") {
                location.href = MOBILE_URL_PROMOTIONS;
            } else if (message.label == "tabUpdates") {
                location.href = MOBILE_URL_UPDATES;
            } else if (message.label == "tabForums") {
                location.href = MOBILE_URL_FORUMS;
            } else if (message.label.indexOf("label_") == 0) {
                var label = message.label.substring(6);
                label = label.toLowerCase();
                label = label.replace(/ /g, '-');
                label = encodeURIComponent(label);
                // replace almost all non-ascii characters with dashes
                //label = label.replace(/[^A-Za-z0-9']/g, '-');
                location.href = "#tl/" + label;
            }
        } else if (message.action == "invert") {
            addStyle(" body img {filter:invert(100%)} ");
        }
    });
    
    var s = document.createElement('link');
    s.setAttribute("href", chrome.runtime.getURL("css/tabletView.css"));
    s.setAttribute("rel", "stylesheet");
    s.setAttribute("type", "text/css");
    document.head.appendChild(s);
    
    // do this once here on load because sometimes the onpopstate is not called because there are no redirects
    // but then also call it on the onpopstate to check for any updates signout/sign etc
    syncCurrentEmail();

    window.onpopstate = function(event) {
        console.log("onpopstate: " + document.location + ", state: " + JSON.stringify(event.state));
        popupWindowPort.postMessage({action: "tabletViewUrlChanged", url:location.href});
        syncCurrentEmail();
    };

    //window.addEventListener("hashchange", function() {
    //	console.log("hashchange: " + location.href);
    //});

    var tooLateForShortcut = false;
    setInterval(function() {tooLateForShortcut=true}, 200);
    window.addEventListener('keydown', function(e) {
        console.log("in tablet view keydown: ", e)
        
        if (!tooLateForShortcut && isCtrlPressed(e)) {
            tooLateForShortcut = true;
            console.log("ctrl held");
            popupWindowPort.postMessage({action: "reversePopupView"});
            return;
        }
    
        if (e.key == "Escape") {
            parent.close();
        }
    });
}

window.addEventListener("load", onLoad);