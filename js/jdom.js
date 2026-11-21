"use strict";

if (typeof escapeHTMLPolicy === 'undefined') {
    globalThis.escapeHTMLPolicy = {
        createHTML: string => string,
        createScriptURL: string => string,
    }
}

function html(strings, ...values) {
    const template = document.createElement('template');
    // Simple interpolation
    template.innerHTML = escapeHTMLPolicy.createHTML(String.raw(strings, ...values));
    return template;
}

function showError(message, options = {}) {
    console.error("showError", message, options);
    options.duration ??= 30000;
    showToast(message, options);
}

function showToast(message, params = {}) {
    params.duration ??= 3000;
    params.align ??= 'start';

    const topDialog = getTopmostDialog();

    let $toastContainer = document.querySelector('.j-toast-container');
    if (!$toastContainer) {
        $toastContainer = document.createElement('div');
        $toastContainer.setAttribute("popover", "manual");
        $toastContainer.setAttribute("unanchored", "");
        $toastContainer.setAttribute("aria-live", "assertive");
    }

    // hack so that can intract with toasts when modal dialog present
    if (topDialog && topDialog.matches(':modal')) {
        topDialog.appendChild($toastContainer);
    } else {
        document.body.appendChild($toastContainer);
    }

    $toastContainer.classList.add('j-toast-container');

    const rootStyles = window.getComputedStyle(document.documentElement);
    const activeScheme = rootStyles.colorScheme;
    if (activeScheme == "dark") {
        $toastContainer.classList.add('apply-light-theme');
    } else {
        $toastContainer.classList.add('apply-dark-theme');
    }

    $toastContainer.setAttribute("position", params.position || "bottom");

    if (params.id) {
        hideToast(params.id);
    }

    const toast = document.createElement('div');
    toast.id = params.id ?? "";
    toast.className = 'j-toast';

    const $msg = document.createElement('span');
    $msg.className = "j-toast-message";
    $msg.append(message);
    toast.appendChild($msg);

    const controller = new AbortController();
    const signal = controller.signal;

    const $toastButtons = document.createElement('div');
    $toastButtons.className = "j-toast-buttons";

    let buttons = [];
    if (params.buttons) {
        buttons = params.buttons;
    } else if (params.text) {
        buttons = [{
            text: params.text,
            onClick: params.onClick
        }];
    }

    buttons.forEach(btnParams => {
        if (btnParams.text) {
            const toastAction = document.createElement('j-button');
            toastAction.classList.add('j-toast-action');
            toastAction.textContent = btnParams.text;
            $toastButtons.appendChild(toastAction);

            if (btnParams.onClick) {
                toastAction.addEventListener('click', () => {
                    btnParams.onClick();
                    _removeToastAndListeners(toast, controller);
                }, { signal });
            }
        }
    });

    const close = document.createElement('j-button');
    close.className = "j-toast-close";
    close.setAttribute("icon", "close");

    close.addEventListener('click', () => {
        toast.classList.remove('visible');
    }, { signal });

    toast.addEventListener('transitionend', (e) => {
        if (e.propertyName === 'opacity' && !toast.classList.contains('visible')) {
            _removeToastAndListeners(toast, controller);
        }
    }, { signal });
    
    $toastButtons.appendChild(close);
    toast.appendChild($toastButtons);

    $toastContainer.appendChild(toast);

    $toastContainer.showPopover();

    toast.classList.add('visible');
    if (params.duration > 0) {
        setTimeout(() => close.click(), params.duration);
    }
}

function _removeToastAndListeners(toast, controller) {
    console.log("Removing toast and aborting listeners");
    controller.abort(); // Clean up all listeners
    toast.remove();
}

function hideToast(id) {
    if (id) {
        byId(id)?.remove();
    } else {
        document.querySelectorAll('.j-toast').forEach(toast => {
            toast.remove();
        });
    }
}
function showLoading() {
    const spinner = showSpinner();
    spinner.classList.add('modal');
    document.body.setAttribute('inert', '');
}

function hideLoading() {
    hideSpinner();
    hideProgress();
    document.body.removeAttribute('inert');
}

function getTopmostDialog() {
    const dialogs = document.querySelectorAll('dialog[open]');
    return dialogs.length > 0 ? dialogs[dialogs.length - 1] : null;
}

function showSpinner(targetNode) {
    let spinner = byId("spinner");
    if (spinner) {
        console.log("alreday shown the spinner");
        return spinner;
    }

    spinner = document.createElement("div");
    spinner.id = "spinner";

    if (!targetNode) {
        spinner.setAttribute("popover", "manual");
        spinner.setAttribute("unanchored", "");
        spinner.setAttribute("aria-live", "assertive");
    }
    spinner.innerHTML = escapeHTMLPolicy.createHTML(`
        <style>
            /* keep styles scoped to the spinner element */
            #spinner { width: 48px; height: 48px; pointer-events: none; }
            #spinner svg { width:100%; height:100%; display:block; }
            .j-spinner-svg {
                transform-box: fill-box; /* ensure transform origin is inside SVG */
                transform-origin: 50% 50%;
                animation: j-spin 1s linear infinite;
                will-change: transform;
            }
            @keyframes j-spin { to { transform: rotate(360deg); } }
        </style>
        <svg viewBox="0 0 50 50" class="j-spinner-svg" aria-hidden="true">
            <circle cx="25" cy="25" r="20" fill="none" stroke="#888" stroke-width="5" stroke-linecap="round" stroke-dasharray="31.4 31.4" transform="rotate(-90 25 25)"></circle>
        </svg>
    `);

    if (targetNode) {
        targetNode.appendChild(spinner);
    } else {
        document.body.appendChild(spinner);
    }

    if (!targetNode) {
        spinner.showPopover();
    }

    return spinner;
}

function hideSpinner() {
    const spinner = byId("spinner");
    if (!spinner) return;

    if (spinner.hasAttribute("popover")) {
        spinner.hidePopover();
    }
    spinner.remove();
}

function showProgress() {
    hideProgress();
    let progress = document.createElement("div");
    progress.className = "j-progressbar";
    document.body.appendChild(progress);
}

function hideProgress() {
    const progress = document.querySelector(".j-progressbar");
    if (progress) {
        progress.remove();
    }
}

// will look outside of shadow DOM to find a form
function getFormRelativeToElement(element) {
    // javascript
    let node = element;
    let form = node.closest('form');

    while (!form) {
        const root = node.getRootNode();
        if (!(root instanceof ShadowRoot) || !root.host) break;
        node = root.host;                 // step out to the host element
        form = node.closest('form');      // search again in the light DOM
    }

    return form;
}

function togglePopoverPatched(source, popover) {
    addPopoverListener(source, popover);
    if (!isPopoverRecentlyClicked(source)) {
        popover.togglePopover({source: source});
    }
}

function isPopoverRecentlyClicked(source) {
    return source.lastClosedTime + 300 > Date.now();
}

/**
 * Adds popover listener functionality to a source element that can trigger a popover.
 * The popover can be specified either through a 'popovertarget-id' attribute on the source element
 * or by directly passing a popover element as the second parameter.
 * 
 * @param {HTMLElement} source - The source element that will trigger the popover (e.g., button, link)
 * @param {HTMLElement} [popoverWithSourceParameter] - Optional popover element to use directly.
 *                                                      If provided, bypasses the 'popovertarget-id' attribute lookup.
 *                                                      Useful when dynamically setting popover with source parameter.
 * 
 * @description
 * This function sets up click event listeners on the source element to toggle the associated popover.
 * It includes a time-based patch to prevent rapid close/reopen cycles when clicking on custom elements.
 * The popover target is determined by:
 * 1. Using the provided popoverWithSourceParameter if available
 * 2. Otherwise, looking up the element by the 'popovertarget-id' attribute value
 * 
 * The function also sets up a 'beforetoggle' event listener on the popover to track when it closes
 * for the timing mechanism.
 */
function addPopoverListener(source, popoverWithSourceParameter) {
    let popover;
    let targetId;

    if (popoverWithSourceParameter) {
        popover = popoverWithSourceParameter;
    } else {
        // using custom attribute with -id to avoid conflicts with other popover implementations
        targetId = source.getAttribute('popovertarget-id');

        if (targetId) { // had to test this for because or else ALL buttons would listen for this click!
            // time patch to toggle popover because when clicking on custom element it would quickly close and then reopen the popover
            replaceEventListeners(source, 'click', (e) => {
                console.log("click", source, isPopoverRecentlyClicked(source));
                // retrieve target each time in case it was dynamically changed
                const targetPopoverId = source.getAttribute('popovertarget-id');
                if (!source.style.anchorName) {
                    source.style.anchorName = `--${targetPopoverId}`;
                }

                const dropdown = document.querySelector(`[popover][id="${targetPopoverId}"]`);
                if (dropdown && !dropdown.style.positionAnchor) {
                    dropdown.style.positionAnchor = `--${targetPopoverId}`;
                }

                if (popover && !isPopoverRecentlyClicked(source)) {
                    console.log("popover toggle from listener", popover);
                    popover.togglePopover();
                }
            });
        }
    }

    docReady(() => {
        if (targetId) {
            popover = document.getElementById(targetId);
        }
        if (!popover) return;

        replaceEventListeners(popover, 'beforetoggle', (event) => {
            if (event.newState == "closed") {
                source.lastClosedTime = Date.now();
            }
        });

        if (popover.id != "side-rail-menu") {
            replaceEventListeners(popover, 'toggle', (event) => {
                if (event.newState == "open") {
                    requestAnimationFrame(() => {
                        constrainPopoverHeight(popover);
                    });
                }
            });
        }
    });
}

function constrainPopoverHeight(popover) {
    // Get the popover's current position
    const rect = popover.getBoundingClientRect();
    
    // Calculate available space below and above
    const spaceBelow = window.innerHeight - rect.top;
    // commented cause spaceAbove not working with fallback i think
    //const spaceAbove = rect.top;
    
    // Use the larger available space, minus some margin
    const margin = 20; // pixels from viewport edge
    //const maxHeight = Math.max(spaceBelow, spaceAbove) - margin;
    const maxHeight = spaceBelow - margin;
    //alert(`spaceBelow: ${spaceBelow}, spaceAbove: ${spaceAbove}, maxHeight: ${maxHeight}`);
    
    // Apply the calculated max-height
    popover.style.maxHeight = `${maxHeight}px`;
    
    // If there's more space above, you might want to reposition
    if (rect.height > spaceBelow) {
        // Optionally trigger position-try or manual repositioning
        console.log('More space above, consider repositioning');
    }
}

function openContextMenu(menuElement, event) {
    menuElement.style.position = "fixed";
    menuElement.style.inset = "auto auto auto auto";
    menuElement.style.left = `${event.clientX}px`;
    menuElement.style.top = `${event.clientY}px`;
    menuElement.showPopover();

    const rect = menuElement.getBoundingClientRect();
    const margin = 8;
    const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);

    const left = Math.min(Math.max(margin, event.clientX), maxLeft);
    const top = Math.min(Math.max(margin, event.clientY), maxTop);

    menuElement.style.left = `${left}px`;
    menuElement.style.top = `${top}px`;
}
        

function getPrimaryDialogButton(dialog) {
    return Array.from(dialog.querySelectorAll('#native-dialog-menu j-button')).pop();
}

function openDialog(message, params = {}) {
    return new Promise((resolve, reject) => {
        const controller = new AbortController();
        const signal = controller.signal;

        let dialog = document.createElement('dialog');
        if (params.id) {
            dialog.id = params.id;
        }

        dialog.classList.add('native-dialog');

        if (params.maximizeHeight) {
            dialog.classList.add('maximize-height');
        }

        if (params.modal === false && params.closeByOutsideClick !== false) {
            dialog.setAttribute("closedby", "any");
        }

        if (params.closeButton === true) {
            const closeContainer = document.createElement('div');
            closeContainer.className = 'dialog-close-button-container';
            dialog.appendChild(closeContainer);

            const closeBtn = document.createElement('j-button');
            closeBtn.setAttribute('icon', 'close');
            closeBtn.className = 'dialog-close-button';
            closeBtn.type = 'button';
            closeBtn.setAttribute('aria-label', 'Close dialog');
            closeBtn.addEventListener('click', () => {
                resolve("close");
                dialog.close();
            }, { signal });
            closeContainer.appendChild(closeBtn);
            dialog.appendChild(closeContainer);
        }

        if (params.title) {
            const titleElem = document.createElement('h2');
            titleElem.textContent = params.title;
            dialog.appendChild(titleElem);
        }

        let form = document.createElement('form');
        form.setAttribute("method", "dialog");

        if (message) {
            let nativeDialogMessage = document.createElement('div');
            nativeDialogMessage.id = "native-dialog-message";

            if (typeof message === "string") {
                // Preserve \n and \r\n as visible line breaks safely
                nativeDialogMessage.style.whiteSpace = "pre-wrap";
                nativeDialogMessage.textContent = message;
            } else if (message.id && message.id.startsWith(CONTAINER_FOR_TEMPLATE_PREFIX)) {
                while (message.firstChild) {
                    nativeDialogMessage.appendChild(message.firstChild);
                }
            } else {
                nativeDialogMessage.append(message);
            }

            const topBorder = document.createElement('div');
            topBorder.id = "native-dialog-message-top-border";

            const bottomBorder = document.createElement('div');
            bottomBorder.id = "native-dialog-message-bottom-border";

            nativeDialogMessage.addEventListener('scroll', () => {
                if (nativeDialogMessage.scrollTop > 10) {
                    dialog.classList.add('scrolled');
                } else {
                    dialog.classList.remove('scrolled');
                }
            }, { signal });

            const nativeDialogMessageWrapper = document.createElement('div');
            nativeDialogMessageWrapper.id = "native-dialog-message-wrapper";
            nativeDialogMessageWrapper.appendChild(nativeDialogMessage);
            form.appendChild(nativeDialogMessageWrapper);

            nativeDialogMessage.before(topBorder);
            nativeDialogMessage.after(bottomBorder);
        }

        let nativeDialogMenu = document.createElement('menu');
        nativeDialogMenu.id = "native-dialog-menu";
        form.appendChild(nativeDialogMenu);

        dialog.appendChild(form);

        if (params.modal === false) {
            const dialogWrapper = document.createElement('div');
            dialogWrapper.className = 'non-modal-dialog-wrapper';
            dialogWrapper.appendChild(dialog);
            document.body.appendChild(dialogWrapper);
        } else {
            document.body.appendChild(dialog);
        }


        // Clear previous buttons
        const menu = dialog.querySelector('#native-dialog-menu');
        
        if (params.cancel) {
            const cancelBtn = document.createElement('j-button');
            cancelBtn.value = 'cancel';
            cancelBtn.textContent = getMessage("cancel");
            cancelBtn.addEventListener('click', () => {
                resolve("cancel");
                dialog.close();
            }, { signal });
            menu.appendChild(cancelBtn);
        }

        let primaryAdded = false;
        // Add custom buttons if params.buttons exists
        if (Array.isArray(params.buttons)) {
            params.buttons.forEach(btn => {
                const b = document.createElement('j-button');
                b.type = 'button';

                if (btn.id) {
                    b.id = btn.id;
                }

                if (btn.icon) {
                    b.setAttribute('icon', btn.icon);
                }

                if (btn.src) {
                    b.setAttribute('src', btn.src);
                }

                if ((btn.icon || btn.src) && btn.label) {
                    b.classList.add('filled');
                }

                if (btn.label || btn.text) {
                    b.appendChild(document.createTextNode(btn.label || btn.text));
                }

                if (btn.primary) {
                    b.classList.add("colored");
                    primaryAdded = true;
                }

                if (btn.focusOnOpen) {
                    b.setAttribute('data-focus-on-open', 'true');
                }

                if (btn.classList) {
                    btn.classList.forEach(cls => b.classList.add(cls));
                }

                if (btn.style) {
                    b.style.cssText = btn.style;
                }

                if (btn.onClick) {
                    b.setAttribute('data-onclick-set-opendialog', 'true');
                    b.addEventListener('click', () => {
                        resolve(btn.label);
                        btn.onClick(dialog);
                    }, { signal });
                }

                menu.appendChild(b);

                if (btn.title) {
                    const tooltip = document.createElement('j-tooltip');
                    tooltip.textContent = btn.title;
                    menu.appendChild(tooltip);
                }
                
            });
        }

        if (params.ok !== false && !primaryAdded) {
            const okBtn = document.createElement('j-button');
            okBtn.value = 'ok';
            okBtn.textContent = getMessage("ok");
            okBtn.classList.add("colored");
            okBtn.addEventListener('click', async () => {
                if (dialog.querySelector("form").checkValidity()) {
                    resolve("ok");
                    dialog.close();
                } else {
                    dialog.querySelector("form").reportValidity();
                }
            }, { signal });
            menu.appendChild(okBtn);
        }

        dialog.addEventListener('toggle', function(event) {
            const $toastContainer = document.querySelector('.j-toast-container');

            if (event.newState == "open") {

                if (params.modal !== false) {
                    // Move toast container into modal dialog if it exists
                    if ($toastContainer && $toastContainer.matches(':popover-open')) {
                        dialog.appendChild($toastContainer);
                        // had to recall this showpopover
                        $toastContainer.showPopover();
                    }
                }

                if (params.noAutoFocus) {
                    //document.activeElement?.blur();
                    dialog.focus();
                }
            } else if (event.newState == "closed") {
                if (params.onClose) {
                    params.onClose();
                }

                console.log("cleaning up dialog listeners");
                controller.abort(); // Clean up all listeners
                
                if (params.modal === false) {
                    dialog.closest(".non-modal-dialog-wrapper").remove();
                } else {
                    // Move toast container back to body if it exists
                    if ($toastContainer && $toastContainer.matches(':popover-open')) {
                        document.body.appendChild($toastContainer);
                    }

                    dialog.remove();
                }

                // let's capture any outside call to dialog.close("escape")
                if (dialog.returnValue == "escape-key") {
                    resolve("cancel");
                }
            }
        }, { signal });

        if (params.modal === false) {
            dialog.show();
        } else {
            dialog.showModal();
        }

        // ensure styles applied, then trigger the transition
        dialog.classList.remove('opening');
        // next frame -> start animation
        requestAnimationFrame(() => requestAnimationFrame(() => dialog.classList.add('opening')));

        if (params.noAutoFocus) {
            // do nothing
        } else {
            const focusTarget = dialog.querySelector('[data-focus-on-open="true"]');
            if (focusTarget) {
                focusTarget.focus();
            } else {
                setTimeout(() => {
                    dialog.querySelectorAll('j-button').forEach(btn => btn.blur());
                }, 0);
            }
        }
    });
}

function niceAlert(message) {
    return openDialog(message);
}

function isSlotEmpty(slot) {
  const nodes = slot.assignedNodes({ flatten: true });
  for (const n of nodes) {
    if (n.nodeType === Node.ELEMENT_NODE) return false;
    if (n.nodeType === Node.TEXT_NODE && n.textContent.trim() !== '') return false;
  }
  return true;
}

class JButton extends HTMLElement {
    static formAssociated = true;
    static get observedAttributes() { return ['aria-label', 'icon', 'src', 'disabled']; }

    constructor() {
        super();
        this.attachShadow({ mode: 'open', delegatesFocus: true });
        this.internals = this.attachInternals();
        this._controller = new AbortController();
    }

    set src(value) {
        this.setAttribute("src", value);
    }

    connectedCallback() {
        if (this._controller.signal.aborted) this._controller = new AbortController();
        const signal = this._controller.signal;

        this.shadowRoot.innerHTML = escapeHTMLPolicy.createHTML(`
        <style>
            :host {
                -webkit-tap-highlight-color: transparent;
                display: inline-flex;
                font-size: 17px;
                margin: 0 2px;
                border: none;
                border-radius: 20px;
                cursor: pointer;
                vertical-align: middle;
                transition: background-color 0.15s, transform 0.1s, box-shadow 0.15s;
            }
            :host([disabled]) {
                pointer-events: none;
                button {
                    opacity: 0.5;
                    cursor: default;
                }
            }

            :host(:hover) {
                background-color: var(--bg-light-color-hover);
            }

            :host(:active),
            :host(.active-state) {
                background-color: color-mix(in srgb, var(--bg-light-color-hover), transparent 30%);
                box-shadow: none;
            }

            :focus-visible {
                outline: 2px solid var(--focus-visible-color);
            }

            :host(.filled) {
                background-color: color-mix(in srgb, var(--button), transparent 85%);

                button {
                    color: var(--text-color);
                }
            }

            :host(.filled:hover) {
                background-color: color-mix(in srgb, var(--button), transparent 75%);
            }
            
            :host(.filled:active),
            :host(.filled.active-state) {
                background-color: color-mix(in srgb, var(--button), transparent 60%);
            }

            :host(.raised) {
                background-color: light-dark(transparent, #1a1a1a);
                box-shadow: 0 3px 1px -2px rgba(0,0,0,0.2),0 2px 2px 0 rgba(0,0,0,0.14),0 1px 5px 0 rgba(0,0,0,0.12);
            }

            :host(.raised:hover) {
                background-color: color-mix(in srgb, var(--bg-light-color-hover), transparent 30%);
            }

            :host(.raised:active),
            :host(.raised.active-state) {
                background-color: color-mix(in srgb, var(--bg-light-color-hover), transparent 40%);
            }

            :host(.outline) {
                box-shadow: 0 0 0 1px light-dark(rgb(0 0 0 / 10%), rgb(255 255 255 / 18%)), 0 0 0 0 light-dark(rgba(0, 0, 0, 0.14), rgba(255, 255, 255, 0.10)), 0 1px 5px 0 light-dark(rgba(0, 0, 0, 0.12), rgba(0, 0, 0, 0.45));
            }

            :host(.colored) {
                background-color: var(--button-primary);

                button {
                    color: white;
                }

                j-icon {
                    fill: white;
                }
            }

            :host(.colored:hover) {
                background-color: color-mix(in srgb, var(--button-primary), white 10%);
            }

            :host(.colored:active),
            :host(.colored.active-state) {
                background-color: color-mix(in srgb, var(--button-primary), white 20%);
            }

            :host(.small) {
                font-size: 14px;
                --icon-size: 18px;
                button {
                    padding: var(--button-padding, 6px 12px);
                }
            }

            :host([icon]),
            :host([src]) {
                button {
                    padding: var(--button-padding, 8px 14px);
                }
            }

            :host([icon-only]) {
                border-radius: 50%;
                xxbackground-color: initial; /* gmail change: commented so .filled would work on play button */
                vertical-align: middle;

                .label {
                    display: none;
                }

                button {
                    padding: var(--icon-only-padding, 8px);
                }
            }
            
            :host([button-look]) .label {
                display: none;
            }

            :host([icon]) .label,
            :host([src]) .label {
                text-align: start; /* uncommented for drive quick access short file names */
            }

            :host(:not([icon]):not([src]):not([icon-only])) .label {
                min-width: 40px;
            }

            :host([invert-icon]) .icon {
                filter: var(--icon-invert, none);
            }

            button {
                display: inline-flex;
                border: none;
                font: inherit;
                cursor: inherit;
                padding: var(--button-padding, 10px 14px);
                color: var(--button-text-color);
                background-color: transparent;
                gap: 0 6px;
                align-items: center;
                justify-content: center;
                user-select: none;
                border-radius: inherit;

                .icon {
                    display: inline-flex;
                    img {
                        width: var(--icon-size, 24px);
                        height: var(--icon-size, 24px);
                    }
                }

                j-icon {
                    vertical-align: middle;
                    padding: 0;
                }
            }
        </style>
        <button role="button" part="button">
            <span class="icon" part="icon"></span>
            <span class="label" part="label"><slot></slot></span>
        </button>
        `);

        /*
        this.addEventListener('click', function(e) {
            const btn = e.currentTarget;
            //console.log("papermenubutton click", e, e.target);

            const dropdown = document.querySelector(`j-listbox[dropdown="${btn.id}"]`);
            if (dropdown) {
                console.log("found dropdown", dropdown);
                if (!dropdown.classList.contains('open')) {
                    console.log("open dropdown");
                    e.stopPropagation(); // prevent immediate close by document click listener

                    dropdown.style.left = '';
                    dropdown.style.right = '';

                    dropdown.classList.add('open');
                    const rect = dropdown.getBoundingClientRect();
                    console.log("dropdown rect", rect);

                    dropdown.style.top = (btn.offsetTop + btn.offsetHeight) + 'px';

                    if (rect.right > window.innerWidth) {
                        console.log("position right", btn.offsetLeft);
                        dropdown.style.left = 'auto';
                        dropdown.style.right = '2px';
                    } else if (rect.left < 0) {
                        console.log("position left", btn.offsetLeft);
                        dropdown.style.left = '2px';
                        dropdown.style.right = 'auto';
                    } else {
                        console.log("position dropdown", btn.offsetLeft);
                        dropdown.style.left = (btn.offsetLeft + btn.offsetWidth - (dropdown.offsetWidth / 2)) + 'px';
                        dropdown.style.right = 'auto';
                    }
                }
            }
        });
        */

        // detect empty slot initially and on changes
        this._slotEl = this.shadowRoot.querySelector('slot');
        this._rootBtn = this.shadowRoot.querySelector('button');
        this._iconContainer = this.shadowRoot.querySelector('.icon');

        // forward click from internal element to host
        this._rootBtn.addEventListener('click', (e) => {
            //console.log("rootbtn click", e.detail);
            if (this.getAttribute("type") == "submit" && !this.hasAttribute('data-onclick-set-opendialog')) {
                this.internals.form.requestSubmit();
            }
        }, { signal });

        // keyboard activation
        this._rootBtn.addEventListener('keydown', (e) => {
            if (this.hasAttribute('disabled')) return;
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                this._rootBtn.click();
            }
        }, { signal });

        this._slotEl.addEventListener('slotchange', this._updateEmpty.bind(this), { signal });

        // initial state
        this._updateDisabled();
        this._updateIcon();
        // hide icon container if no icon
        this._syncIconVisibility();
        this._updateEmpty();
        // sync aria-label to shadow DOM button
        if (this.hasAttribute('aria-label')) {
            this._rootBtn.setAttribute('aria-label', this.getAttribute('aria-label'));
        }

        addPopoverListener(this);
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) return;
        if (name === 'icon' || name === 'src') {
            this._updateIcon();
            this._syncIconVisibility();
            this._updateEmpty();
        } else if (name === 'disabled') {
            this._updateDisabled();
        } else if (name === 'aria-label') {
            if (this._rootBtn) {
                if (newValue) {
                    this._rootBtn.setAttribute('aria-label', newValue);
                } else {
                    this._rootBtn.removeAttribute('aria-label');
                }
            }
        }
    }

    _updateDisabled() {
        if (this._rootBtn) {
            if (this.hasAttribute('disabled')) {
                this._rootBtn.setAttribute('aria-disabled', 'true');
                this._rootBtn.setAttribute('tabindex', '-1');
            } else {
                this._rootBtn.removeAttribute('aria-disabled');
                this._rootBtn.setAttribute('tabindex', '0');
            }
        }
    }

    _updateEmpty() {
        if (this._slotEl) { // might not be added to dom yet, createElement etc..
            if (isSlotEmpty(this._slotEl) && !this.hasAttribute('button-look')) this.setAttribute('icon-only', '');
            else this.removeAttribute('icon-only');
        }
    };

    _syncIconVisibility() {
        if (this._iconContainer) {
            if (!this.getAttribute('icon') && !this.getAttribute('src')) {
                this._iconContainer.style.display = 'none';
                if (this.hasAttribute('icon-only')) {
                    this.removeAttribute('icon-only');
                }
            } else {
                this._iconContainer.style.display = '';
            }
        }
    }

    _updateIcon() {
        // clear container without touching slot/label
        //console.log("updateicon: ", this, this.innerHTML);
        if (this._iconContainer) {
            this._iconContainer.innerHTML = escapeHTMLPolicy.createHTML(``);
            const icon = this.getAttribute('icon');
            const src = this.getAttribute('src');

            if (icon) {
                // use existing j-icon custom element if available
                const jicon = document.createElement('j-icon');
                jicon.setAttribute('icon', icon);
                this._iconContainer.appendChild(jicon);
            } else if (src) {
                const img = document.createElement('img');
                img.src = src;
                img.alt = '';
                this._iconContainer.appendChild(img);
            }
        }
    }

    disconnectedCallback() {
        //console.log("JButton disconnected, aborting listeners", this);
        this._controller.abort();
    }
}

customElements.define('j-button', JButton);



class PaperTooltip extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({mode: 'open'});
        this._controller = new AbortController();
    }

    connectedCallback() {
        // recreate controller if it was previously aborted (element re-used)
        if (this._controller.signal.aborted) this._controller = new AbortController();
        const signal = this._controller.signal;

        const DEFAULT_DELAY = 500; // ms
        let animationDelay = `${(this.getAttribute("animation-delay") || DEFAULT_DELAY) / 1000}s`;

        const tooltip = this;

        const forId = this.getAttribute('for');
        const forClass = this.getAttribute('for-class');

        this.shadowRoot.innerHTML = escapeHTMLPolicy.createHTML(`
            <style>
                :host {
                    /* couldn't put anchor stuff here because of barrier between light dom and shadow dom */
                }
            </style>
            <slot></slot>
        `);

        this.setAttribute("popover", "hint");

        let anchors = [];
        if (forId) {
            const target = document.getElementById(forId);
            if (target) {
                anchors.push(target);
            }
        } else if (forClass) {
            console.log("j-tooltip missing for attribute");
            const targets = document.querySelectorAll(`.${forClass}`);
            targets.forEach(target => {
                anchors.push(target);
            });
        } else {
            const target = this.previousElementSibling;
            if (target instanceof HTMLElement) {
                anchors.push(target);
            }
        }

        anchors.forEach(anchorElement => {

            let anchorName;

            const existingPopoverId = anchorElement.getAttribute("popovertarget-id");
            if (existingPopoverId) {
                anchorName = `--${existingPopoverId}`;
            } else {
                anchorName = `--${forId || 'anchor-' + Math.random().toString(36).substring(2, 9)}`;
            }

            if (anchorElement.style.anchorName) {
                //console.log('already anchored', anchorElement, tooltip, tooltip.style.positionAnchor);
            } else {
                anchorElement.style.anchorName = anchorName;
                tooltip.style.positionAnchor = anchorName;
            }

            anchorElement.addEventListener('mouseenter', () => {
                if (forClass) {
                    // bind tooltip to the hovered element, not the last one
                    tooltip.style.positionAnchor = anchorElement.style.anchorName;
                }

                if (!tooltip.hasAttribute("manual-mode")) {
                    tooltip.showPopover();
                }
            }, { signal });
            anchorElement.addEventListener('mouseleave', () => {
                if (!tooltip.hasAttribute("manual-mode")) {
                    tooltip.hidePopover();
                }
            }, { signal });

            /*
            target.addEventListener('mouseenter', () => {
                this.classList.add('visible');
                const rect = target.getBoundingClientRect();
                requestAnimationFrame(() => {
                    const tooltipRect = this.getBoundingClientRect();
                    let left;
                    let top;
                    let transform;
                    const PADDING = 8;

                    if (position == "start") {
                        if (getComputedStyle(document.body).direction === 'rtl') {
                            left = rect.left - tooltipRect.width - PADDING;
                        } else {
                            console.log(rect)
                            left = rect.left + rect.width + PADDING;
                        }
                        top = rect.top + rect.height / 2;
                        transform = 'translateY(-50%)';
                    } else if (position == "end") {
                        if (getComputedStyle(document.body).direction === 'rtl') {
                            left = rect.left + rect.width + PADDING;
                        } else {
                            left = rect.left - tooltipRect.width - PADDING;
                        }
                        top = rect.top + rect.height / 2;
                        transform = 'translateY(-50%)';
                    } else {
                        left = rect.left + rect.width / 2;
                        top = rect.bottom + PADDING;
                        console.log("tooltip", rect, top);
                        transform = 'translateX(-50%)';
                    }

                    // If tooltip would overflow right edge, align to right
                    if (left + tooltipRect.width / 2 > window.innerWidth) {
                        left = window.innerWidth - 2;
                        transform = 'translateX(-100%)';
                    } else if (left - tooltipRect.width / 2 < 0) {
                        left = 2 + tooltipRect.width / 2;
                        transform = 'translateX(-50%)';
                    }

                    // If tooltip would overflow bottom edge, show above element
                    if (top + tooltipRect.height > window.innerHeight) {
                        top = rect.top - PADDING;
                        transform += ' translateY(-100%)';
                    } else if (top - tooltipRect.height < 0) {
                        top = rect.bottom + PADDING;
                        transform += ' translateY(100%)';
                    }

                    this.style.left = left + 'px';
                    this.style.top = top + 'px';
                    this.style.transform = transform;
                });
            }, { signal: this._controller.signal });

            target.addEventListener('mouseleave', () => {
                this.classList.remove('visible');
            }, { signal: this._controller.signal });
            */
        });
    }

    disconnectedCallback() {
        //console.log("PaperTooltip disconnected, aborting listeners", this);
        this._controller.abort();
    }
}
customElements.define('j-tooltip', PaperTooltip);

class PaperListbox extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.shadowRoot.innerHTML = escapeHTMLPolicy.createHTML(`
        <style>
            :host {
                display: block;
                xxbackground-color: var(--bg-light-color); /* commented for listboxes in dialog */
                overflow: hidden; /* patch to prevent :hover items from not respecting parent border-radius, actually needed in contribute page for licenseOptions */
            }

            :host([popover]) {
                ::slotted(j-icon-item) {
                    --icon-padding: 0;
                    --icon-size: 20px;
                }
            }

            :host(:popover-open) {
                
            }
        </style>
        <slot></slot>
        `);
    }
}
customElements.define('j-listbox', PaperListbox);

class FloatingInput extends HTMLElement {
    static formAssociated = true;

    constructor() {
        super();
        //this.attachShadow({ mode: 'open' });
        this.internals = this.attachInternals();

        // Initialize properties to store attribute values
        this.initialAttributes = {};

        this._controller = new AbortController();
    }

    // make the custom element behave like a real input
    get value() {
        return this.input.value;
    }
    set value(val) {
        this.input.value = val;
    }
    set min(val) {
        this.setAttribute('min', val);
    }
    set max(val) {
        this.setAttribute('max', val);
    }
    set step(val) {
        this.setAttribute('step', val);
    }

    static get observedAttributes() {
        return [
            'label','name','value','type','placeholder',
            'required','disabled','min','max','step','autocomplete',
            'inputmode','pattern','readonly','no-spin-button', 'autofocus'
        ];
    }

    _updateInputAttributes(input, name, value) {
        const boolAttrs = new Set(['disabled','required','readonly','no-spin-button', 'autofocus'])
        if (boolAttrs.has(name)) {
            if (name === "no-spin-button") {
                // handle special case: toggle the no-spin style
                const existing = this.shadowRoot.querySelector('style[data-no-spin]');
                if (this.hasAttribute('no-spin-button')) {
                    if (!existing) {
                        const style = document.createElement('style');
                        style.dataset['noSpin'] = '1';
                        style.textContent = `
                            input[type=number]::-webkit-inner-spin-button,
                            input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
                        `;
                        this.shadowRoot.appendChild(style);
                    }
                } else if (existing) {
                    existing.remove();
                }
                return;
            } else {
                input.toggleAttribute(name, value !== null);
            }
        } else if (name === "label") {
            const labelEl = this.shadowRoot && this.shadowRoot.querySelector('.label-text');
            if (labelEl) {
                labelEl.textContent = value || '';
                labelEl.title = value || '';
            }
        } else {
            input.setAttribute(name, value);
        }
    }

    attributeChangedCallback(name, oldValue, newValue) {
        // Check if the Shadow DOM has been created yet
        if (this.shadowRoot) {
            // If it exists, update the input directly
            const input = this.shadowRoot.querySelector('input');
            if (input) {
                this._updateInputAttributes(input, name, newValue);
            }
        } else {
            // If Shadow DOM is not ready, store the attribute for later
            this.initialAttributes[name] = newValue;
        }
    }

    connectedCallback() {

        if (this._controller.signal.aborted) this._controller = new AbortController();
        const signal = this._controller.signal;

        // Check to prevent running twice if the element is moved
        if (this.shadowRoot) {
            console.warn("j - FloatingInput already connected - so just adding listeners again");
        } else {
            const type = this.getAttribute('type') || 'text';
            const labelText = this.getAttribute('label') || '';
            const name = this.getAttribute('name') || '';
            const multiline = this.hasAttribute('multiline');

            const shadowRoot = this.attachShadow({ mode: 'open' });

            shadowRoot.innerHTML = escapeHTMLPolicy.createHTML(`
            <style>
                :host {
                    display: inline-block;
                    font-family: system-ui, -apple-system, "Segoe UI", "Roboto Flex", sans-serif;
                    width: 100%;
                    xxmax-width: 320px;
                }

                label {
                    position: relative;
                    display: inline-block;
                    width: 100%;
                }

                label:has(input:not(:focus) + .label-text) {
                    clip-path: border-box;
                }

                label:has(input:not(:placeholder-shown) + .label-text) {
                    clip-path: none;
                }

                input, textarea {
                    width: 100%;
                    box-sizing: border-box;
                    padding: var(--input-padding, 6px 12px); /* v2: 12px, v1: 14px 12px 10px 12px */
                    font-size: var(--input-font-size);
                    border: 1px solid var(--border-color);
                    border-radius: var(--input-border-radius);
                    background-color: var(--input-bg-color);
                    color: var(--text-color);
                    outline: none;
                    transition: border-color 0.2s, box-shadow 0.2s;
                    text-align: inherit;
                }

                :host(:not([no-outline])) input:focus,
                :host(:not([no-outline])) textarea:focus {
                    border-color: transparent;
                    outline: 2px solid var(--focus-visible-color);
                }

                input::placeholder,
                textarea::placeholder {
                    xxcolor: transparent; /* commented this for calendar */
                }

                .label-text {
                    position: absolute;
                    top: 48%;
                    left: 8px;
                    transform: translateY(-50%);
                    transform-origin: left top;
                    transition: transform 0.2s ease, color 0.2s ease;
                    pointer-events: none;
                    background-color: var(--input-bg-color);
                    color: #6b7280;
                    font-size: 16px;
                    padding: 0 4px;
                    white-space: nowrap;
                    max-width: 100%;
                    text-overflow: ellipsis;
                    overflow: hidden;
                }

                input:focus + .label-text,
                textarea:focus + .label-text,
                input:not(:placeholder-shown) + .label-text,
                textarea:not(:placeholder-shown) + .label-text {
                    transform: translateY(-125%) scale(0.85);
                    color: var(--input-focus-color);
                    background-color: var(--input-bg-color);
                    border-radius: 5px;
                    pointer-events: auto;
                }

                textarea {
                    min-height: 80px;
                    padding-top: 18px;
                }

                input[type=number]::-webkit-inner-spin-button,
                input[type=number]::-webkit-outer-spin-button {
                    filter: var(--inverted-spin-button-filter, none);
                }
            </style>

            <label>
                ${multiline
                ? `<textarea placeholder=" " name="${name}" part="textarea"></textarea>`
                : `<input placeholder=" " type="${type}" name="${name}" part="input">`}
                <span class="label-text" part="label">${labelText}</span>
            </label>
            `);
        }
        
        this.input = this.shadowRoot.querySelector('input, textarea');

        for (const [name, value] of Object.entries(this.initialAttributes)) {
            if (value !== null) {
                this._updateInputAttributes(this.input, name, value);
            }
        }

        // Clear the storage object after initial setup
        this.initialAttributes = {};

        this.validate(); // Initial validation check

        // forward change as composed so it crosses the shadow boundary
        // seems the change events needs to be forwared, but NOT the input (it's already does it)
        this.input.addEventListener('change', (e) => {
            this.validate();
            this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        }, { signal });

        this.input.addEventListener('input', () => this.validate(), { signal });

        this.input.addEventListener('keydown', (e) => {
            const jInputHost = e.target.getRootNode().host;
            if (e.key === 'Enter' && !jInputHost.hasAttribute('disable-auto-submit')) {
                console.log("input keydown", e.key, document.activeElement);

                //e.preventDefault();
                //getFormRelativeToElement(this.input)?.requestSubmit();

                const dialog = this.closest(".native-dialog");
                if (dialog) {
                    const primaryButton = getPrimaryDialogButton(dialog);
                    if (primaryButton) {
                        e.preventDefault(); /* Do this to prevent key event from bubbling up and outside of the dialog and hitting the initial action that opened the dialog (loop) */
                        e.stopPropagation(); // v2
                        primaryButton?.click();
                    } else {
                        dialog.close();
                    }
                } else {
                    this.internals.form?.requestSubmit();
                }
            }
        }, { signal });
    }

    validate() {
        const isValid = this.input.checkValidity();

        if (isValid) {
            // If valid, clear any internal validation message
            this.internals.setValidity({});
        } else {
            // If invalid, set the validity state based on the internal input's state
            this.internals.setValidity(
                { customError: true }, // The flag for the error state
                this.input.validationMessage, // The default error message (e.g., "Please fill out this field")
                this.input // The anchor element for the error message
            );
        }
        
        // This is necessary if you want the custom element to hold a value
        this.internals.setFormValue(this.input.value);
    }

    // Optional: Expose the validity methods directly
    checkValidity() {
        return this.internals.checkValidity();
    }

    // The implementation for reportValidity()
    reportValidity() {
        // This triggers validation, updates the state, and shows the browser pop-up.
        return this.internals.reportValidity();
    }

    // Proxy setCustomValidity() from the host element to the internal input.
    setCustomValidity(message) {
        this.input.setCustomValidity(message);
        // Force a re-validation on the host element to show the new state
        this.validate();
    }

    select() {
        this.input.select();
    }

    focus() {
        this.input.focus();
    }

    disconnectedCallback() {
        console.log("j-input disconnected, aborting listeners", this);
        this._controller.abort();
    }
}

customElements.define('j-input', FloatingInput);

class JSwitch extends HTMLElement {
    static formAssociated = true;
    static get observedAttributes() {
        return ['checked', 'disabled', 'required', 'name', 'value', 'icons'];
    }

    constructor() {
        super();
        this.attachShadow({ mode: 'open', delegatesFocus: true });
        this.internals = this.attachInternals();
        this._controller = new AbortController();
        this._checkedDirty = false;
        this._defaultChecked = this.hasAttribute('checked');
        this._formDisabled = false;
    }

    get checked() {
        return this.hasAttribute('checked');
    }

    set checked(value) {
        this.toggleAttribute('checked', Boolean(value));
    }

    get disabled() {
        return this.hasAttribute('disabled');
    }

    set disabled(value) {
        this.toggleAttribute('disabled', Boolean(value));
    }

    get value() {
        return this.getAttribute('value') ?? 'on';
    }

    set value(val) {
        this.setAttribute('value', val ?? 'on');
    }

    connectedCallback() {
        if (this._controller.signal.aborted) this._controller = new AbortController();
        const signal = this._controller.signal;

        if (!this.shadowRoot.innerHTML) {
            this.shadowRoot.innerHTML = escapeHTMLPolicy.createHTML(`
            <style>
                :host {
                    --j-switch-track-width: 52px;
                    --j-switch-track-height: 32px;
                    --j-switch-track-radius: 999px;
                    --j-switch-track-color: color-mix(in srgb, var(--text-color), transparent 90%);
                    --j-switch-track-border: color-mix(in srgb, var(--text-color), transparent 65%);
                    --j-switch-selected-track-color: color-mix(in srgb, var(--button-primary, #6750A4), white 8%);
                    --j-switch-handle-color: light-dark(#5f6368, #d6d7db);
                    --j-switch-selected-handle-color: #ffffff;
                    --j-switch-icon-color: #f6f7f9;
                    --j-switch-selected-icon-color: var(--j-switch-selected-track-color);

                    display: inline-flex;
                    align-items: center;
                    vertical-align: middle;
                    -webkit-tap-highlight-color: transparent;
                    cursor: pointer;
                }

                :host([disabled]) {
                    cursor: default;
                    pointer-events: none;
                    opacity: 0.5;
                }

                button {
                    all: unset;
                    box-sizing: border-box;
                    width: var(--j-switch-track-width);
                    height: var(--j-switch-track-height);
                    border-radius: var(--j-switch-track-radius);
                    position: relative;
                    display: inline-flex;
                    align-items: center;
                    cursor: inherit;
                }

                .track {
                    position: absolute;
                    inset: 0;
                    border-radius: inherit;
                    background-color: var(--j-switch-track-color);
                    border: 2px solid var(--j-switch-track-border);
                    transition: background-color 150ms ease, border-color 150ms ease;
                }

                .handle {
                    position: absolute;
                    top: 50%;
                    left: 7px;
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    transform: translate(0, -50%);
                    background: var(--j-switch-handle-color);
                    color: var(--j-switch-icon-color);
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    transition: transform 180ms cubic-bezier(.2,.0,0,1), width 180ms cubic-bezier(.2,.0,0,1), height 180ms cubic-bezier(.2,.0,0,1), background-color 150ms ease, color 150ms ease;
                    overflow: hidden;
                }

                .handle-icon {
                    width: 14px;
                    height: 14px;
                    opacity: 0;
                    transform: scale(0.75);
                    transition: opacity 120ms ease, transform 180ms cubic-bezier(.2,.0,0,1);
                    pointer-events: none;
                }

                .handle-icon path {
                    fill: currentColor;
                }

                :host([icons]) .handle-icon {
                    opacity: 1;
                }

                :host([checked]) .track {
                    background-color: var(--j-switch-selected-track-color);
                    border-color: var(--j-switch-selected-track-color);
                }

                :host([checked]) .handle {
                    width: 24px;
                    height: 24px;
                    transform: translate(20px, -50%);
                    background-color: var(--j-switch-selected-handle-color);
                    color: var(--j-switch-selected-icon-color);
                }

                :host([checked]) .icon-off {
                    opacity: 0;
                    transform: scale(0.75);
                }

                :host([checked]) .icon-on {
                    opacity: 1;
                    transform: scale(1) translateX(7px);
                }

                :host(:not([checked])) .icon-on {
                    opacity: 0;
                    transform: scale(0.75);
                }

                :host(:not([checked])) .icon-off {
                    opacity: 1;
                    transform: scale(1);
                }

                button:focus-visible {
                    outline: 3px solid color-mix(in srgb, var(--focus-visible-color), transparent 20%);
                    outline-offset: 3px;
                }
            </style>
            <button type="button" part="button" role="switch" aria-checked="false">
                <span class="track" part="track"></span>
                <span class="handle" part="handle">
                    <svg class="handle-icon icon-on" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 20.6 7.4 19.2 6z"></path>
                    </svg>
                    <svg class="handle-icon icon-off" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"></path>
                    </svg>
                </span>
            </button>
            `);
        }

        this._button = this.shadowRoot.querySelector('button');

        this._button.addEventListener('click', () => this._toggleFromUser(), { signal });

        this._button.addEventListener('keydown', (e) => {
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                this._toggleFromUser();
            }
        }, { signal });

        this._syncFromAttributes();
    }

    attributeChangedCallback() {
        if (this.isConnected) {
            this._syncFromAttributes();
        }
    }

    formDisabledCallback(disabled) {
        this._formDisabled = disabled;
        this._syncFromAttributes();
    }

    formResetCallback() {
        this.checked = this._defaultChecked;
        this._checkedDirty = false;
        this._syncFromAttributes();
    }

    checkValidity() {
        return this.internals.checkValidity();
    }

    reportValidity() {
        return this.internals.reportValidity();
    }

    setCustomValidity(message) {
        this.internals.setValidity(message ? { customError: true } : {}, message || '', this._button);
    }

    _toggleFromUser() {
        if (this.disabled || this._formDisabled) return;
        this._checkedDirty = true;
        this.checked = !this.checked;

        this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    }

    _syncFromAttributes() {
        if (!this._button) return;

        const isDisabled = this.disabled || this._formDisabled;
        const isChecked = this.checked;

        this._button.setAttribute('aria-checked', String(isChecked));
        this._button.toggleAttribute('disabled', isDisabled);

        if (isDisabled) {
            this._button.setAttribute('aria-disabled', 'true');
            this._button.setAttribute('tabindex', '-1');
        } else {
            this._button.removeAttribute('aria-disabled');
            this._button.setAttribute('tabindex', '0');
        }

        this.internals.setFormValue(isChecked ? this.value : null);

        if (this.hasAttribute('required') && !isChecked) {
            this.internals.setValidity(
                { valueMissing: true },
                this.getAttribute('validation-message') || 'Please turn this switch on.',
                this
            );
        } else {
            this.internals.setValidity({});
        }
    }

    disconnectedCallback() {
        this._controller.abort();
    }
}

customElements.define('j-switch', JSwitch);

class IronIcon extends HTMLElement {
    static get observedAttributes() { return ['icon', 'src']; }

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    set src(value) {
        this.setAttribute("src", value);
    }

    get src() {
        return this.getAttribute("src");
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if ((name === 'icon' || name === 'src') && oldValue !== newValue) {
            this.updateIcon(newValue);
        }
    }

    connectedCallback() {
        //this.updateIcon();
    }

    updateIcon() {
        const svgIconName = this.getAttribute('icon');

        let shadowContent = `
            <style>
                :host {
                    border-radius: 50%;
                    padding: var(--icon-padding, 6px);
                    width: var(--icon-size, 24px);
                    height: var(--icon-size, 24px);
                    position: relative;
                    display: inline-block;
                    align-items: center;
                    justify-content: center;
                    border: none;
                    xxcursor: pointer; /* commented in cal for fieldIcon */
                    fill: var(--icon-color);
                }

                :host([invert-icon]) {
                    filter: var(--icon-invert, none);
                }

                img {
                    border-radius: var(--j-icon-img-border-radius);
                }
            </style>
        `;

        if (svgIconName) {
            let icon = document.querySelector(`svg defs g[name="${svgIconName}"]`);
            if (!icon) {
                if (svgIconName == "close") {
                    icon = document.createElementNS("http://www.w3.org/2000/svg", "path");
                    icon.setAttribute("d", "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z");
                } else {
                    throw new Error(`Icon not found: ${svgIconName}`);
                }
            }

            let viewBox = icon.getAttribute("viewBox");
            if (!viewBox) {
                viewBox = "0 0 24 24";
            }

            shadowContent += `
                <svg viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">
                    ${icon.outerHTML}
                </svg>
            `;
        } else if (this.getAttribute('src')) {
            shadowContent += `
                <img src="${this.getAttribute('src')}" style="width:100%;height:100%;object-fit:contain"/>
            `;
        }

        const shadow = this.shadowRoot;
        shadow.innerHTML = escapeHTMLPolicy.createHTML(shadowContent);
    }
}
customElements.define('j-icon', IronIcon);

class PaperItem extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({mode: 'open'});
    }

    connectedCallback() {
        this.shadowRoot.innerHTML = escapeHTMLPolicy.createHTML(`
            <style>
            :host {
                position: relative;
                display: flex;
                align-items: center;
                padding: var(--j-item-padding, 10px 12px);
                cursor: pointer;
                font-size: 16px;
            }
            :host(:hover),
            :host(.selected) {
                background-color: var(--bg-light-color-hover) !important;
            }
            ::slotted(j-icon) {
                margin-inline-end: 12px;
            }
            :host(.separator) {
                margin: inherit !important;
                padding: 1px 0 0;
            }
            </style>
            <slot></slot>
        `);
    }
}
customElements.define('j-item', PaperItem);

class PaperIconItem extends PaperItem {}
customElements.define('j-icon-item', PaperIconItem);

class PaperItemBody extends HTMLElement {
    connectedCallback() {
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.innerHTML = escapeHTMLPolicy.createHTML(`
            <style>
                :host {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    padding-bottom: 2px;
                }
            </style>
            <slot></slot>
            <j-ripple></j-ripple>
        `);
    }
}
customElements.define('j-item-body', PaperItemBody);

class PaperRipple extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._controller = new AbortController();
    }

    connectedCallback() {
        if (this._controller.signal.aborted) this._controller = new AbortController();
        const signal = this._controller.signal;

        this.shadowRoot.innerHTML = escapeHTMLPolicy.createHTML(`
        <style>
            :host {
                position: absolute;
                top: 0; left: 0; right: 0; bottom: 0;
                overflow: hidden;
                pointer-events: none;
                border-radius: inherit;
            }
            .ripple {
                position: absolute;
                border-radius: 50%;
                transform: scale(0);
                animation: ripple 0.6s linear;
                background-color: rgba(0,0,0,0.2);
                pointer-events: none;
            }
            @keyframes ripple {
                to {
                    transform: scale(2.5);
                    opacity: 0;
                }
            }
        </style>
        `);

        // Only trigger ripple when this element is clicked
        this.style.pointerEvents = 'auto';
        this.addEventListener('mousedown', (e) => this.showRipple(e, signal), { signal });
  }
  showRipple(e, signal) {
        const ripple = document.createElement('span');
        ripple.className = 'ripple';
        const rect = this.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = (e.clientX - rect.left - size/2) + 'px';
        ripple.style.top = (e.clientY - rect.top - size/2) + 'px';
        this.shadowRoot.appendChild(ripple);
        ripple.addEventListener('animationend', () => ripple.remove(), { once: true, signal });
    }

    disconnectedCallback() {
        console.log("PaperRipple disconnected, aborting listeners");
        this._controller.abort();
    }
}
customElements.define('j-ripple', PaperRipple);

function isFocusOnInputElement() {
    const activeElement = document.activeElement;
    const nodeName = activeElement.nodeName;
    const isInsideSelect = activeElement.closest('select') !== null;
    
    return nodeName == "SELECT" ||
        isInsideSelect ||
        nodeName == "TEXTAREA" ||
        nodeName == "INPUT" ||
        nodeName == "J-INPUT" ||
        nodeName == "J-SWITCH" ||
        nodeName == "OVERLAY-HOST" ||
        document.activeElement.getAttribute("contenteditable")
    ;
}

const CONTAINER_FOR_TEMPLATE_PREFIX = "container-for-";

function initTemplate(idOrObject, replaceNode) {
	var $template;
	var isId;
	
	if (typeof idOrObject === "string") {
		$template = byId(idOrObject);
		isId = true;

        if (!$template) {
            // try finding by data-template-id attribute
            return document.querySelector(`[data-template-id="${idOrObject}"]`);
        }
	} else {
		$template = idOrObject;
	}

    if (!$template) {
        throw new Error("Element is not a template: " + idOrObject);
    }

    const importFragment = document.importNode($template.content, true);

    // Get the actual element you want to work with.
    let newElement;

    // if has multiple children then wrap then in a div
    if (importFragment.children.length > 1) {
        const wrapperDiv = document.createElement('div');
        while (importFragment.firstChild) {
            wrapperDiv.appendChild(importFragment.firstChild);
        }
        importFragment.appendChild(wrapperDiv);
        newElement = wrapperDiv;
    } else {
        newElement = importFragment.firstElementChild;
    }

    if (replaceNode) {
        $template.replaceWith(importFragment);
        if (isId) {
            newElement.setAttribute('data-template-id', idOrObject);
        }
    }

    if (typeof initMessages !== 'undefined') {
        initSelects(newElement);
        initMessages(newElement);
    }

    if (replaceNode) {
        return newElement;
    } else {
        let container;
        if (isId) {
            container = byId(CONTAINER_FOR_TEMPLATE_PREFIX + idOrObject);
        }

        if (container) {
            emptyNode(container);
        } else {
            container = document.createElement('div');
            container.id = `${CONTAINER_FOR_TEMPLATE_PREFIX}${(isId ? idOrObject : Math.random().toString(36).substring(2, 9))}`;
            container.setAttribute("hidden", "");
            document.body.appendChild(container);
        }

        container.appendChild(importFragment);
        
        return container;
    }
}

function getSelectedRadioValue(name) {
    const radios = document.querySelectorAll(`input[type="radio"][name="${name}"]`);
    for (const radio of radios) {
        if (radio.checked) {
            return radio.value;
        }
    }
    return null;
}

function setSelectedRadioValue(name, value) {
    const radios = document.querySelectorAll(`input[type="radio"][name="${name}"]`);
    for (const radio of radios) {
        if (radio.value === value) {
            radio.checked = true;
            return;
        }
    }
}

async function getColorSchemeSetting() {
    if (globalThis.storage) {
        if (storage.init) {
            await storage.init("getColorSchemeSetting");
        }
        const darkMode = await storage.getRaw("darkMode"); // calling getRaw to avoid DEFAULT_SETTINGS issue not being declared yet
        if (darkMode === true || darkMode === "dark") {
            return "dark";
        } else if (darkMode === false || darkMode === "light") {
            return "light";
        } else if (darkMode === "system") {
            return "system";
        } else {
            // default to light
            return "light";
        }
    } else if (localStorage["color-scheme"] === "dark") {
        return "dark";
    } else if (localStorage["color-scheme"] === "light" || localStorage["color-scheme"] === "white") {
        return "light";
    } else {
        if (matchMedia('(prefers-color-scheme: dark)').matches) {
            return "dark";
        } else {
            return "light";
        }
    }
}

async function isDarkMode() {
    const scheme = await getColorSchemeSetting();
    if (scheme === "system") {
        return matchMedia('(prefers-color-scheme: dark)').matches;
    } else {
        return scheme === "dark";
    }
}

async function initColorScheme() {
    let scheme = await isDarkMode() ? "dark" : "light";
    document.documentElement.setAttribute("color-scheme", scheme);
}

function initButtonGroup(groupElement) {
    const divs = groupElement.querySelectorAll(':scope > j-button');
    const visibleDivs = Array.from(divs).filter(div => {
        const style = getComputedStyle(div);
        return style.display !== 'none' && style.visibility !== 'hidden';
    });
    if (visibleDivs.length > 0) {
        const lastVisibleDiv = visibleDivs[visibleDivs.length - 1];
        lastVisibleDiv.classList.add('last-visible');
    }
}

function initSelects(node) {
    // patch to add button around selectedcontent in selects
    const button = document.createElement('button');
    const selectedContent = document.createElement('selectedcontent');
    button.appendChild(selectedContent);

    const targetNodes = node.querySelectorAll('select');
    targetNodes.forEach(target => {
        // Skip if already has selectedcontent to avoid duplicates
        if (target.querySelector('selectedcontent')) return;
        
        const buttonClone = button.cloneNode(true);
        target.prepend(buttonClone);

        // patch: for duplicate display of initial select value when dynamically inserting button > selectedcontent, another easier solution could be to hard code the button > selectedcontent in the html but this way is more automatic
        target.classList.add('selectedcontent-added');
    });
}

function openColorChooser() {
    return new Promise((resolve, reject) => {
        const colorListbox = document.createElement("j-listbox");
        colorListbox.id = "color-listbox";

        const style = document.createElement("style");
        style.textContent = `
            #color-listbox {
                padding: 0;
            }

            #color-listbox-items {
                display: flex;
                flex-direction: column;
                flex-wrap: wrap;
            }

            .color {
                box-sizing: border-box;
                width: 20px;
                height: 20px;
                min-height: 20px;
                display: inline-block;
                padding: 0;
                margin: 0;
                cursor: pointer;
                font-size: 0;
                position: relative;
            }
        `;
        colorListbox.appendChild(style);

        const items = document.createElement("div");
        items.id = "color-listbox-items";
        items.style.cssText = "height:200px; width:360px;";

        const fragment = document.createDocumentFragment();
        const colors = ['#ffebee', '#ffcdd2', '#ef9a9a', '#e57373', '#ef5350', '#f44336', '#e53935', '#d32f2f', '#c62828', '#b71c1c', '#fce4ec', '#f8bbd0', '#f48fb1', '#f06292', '#ec407a', '#e91e63', '#d81b60', '#c2185b', '#ad1457', '#880e4f', '#f3e5f5', '#e1bee7', '#ce93d8', '#ba68c8', '#ab47bc', '#9c27b0', '#8e24aa', '#7b1fa2', '#6a1b9a', '#4a148c', '#ede7f6', '#d1c4e9', '#b39ddb', '#9575cd', '#7e57c2', '#673ab7', '#5e35b1', '#512da8', '#4527a0', '#311b92', '#e8eaf6', '#c5cae9', '#9fa8da', '#7986cb', '#5c6bc0', '#3f51b5', '#3949ab', '#303f9f', '#283593', '#1a237e', '#e3f2fd', '#bbdefb', '#90caf9', '#64b5f6', '#42a5f5', '#2196f3', '#1e88e5', '#1976d2', '#1565c0', '#0d47a1', '#e1f5fe', '#b3e5fc', '#81d4fa', '#4fc3f7', '#29b6f6', '#03a9f4', '#039be5', '#0288d1', '#0277bd', '#01579b', '#e0f7fa', '#b2ebf2', '#80deea', '#4dd0e1', '#26c6da', '#00bcd4', '#00acc1', '#0097a7', '#00838f', '#006064', '#e0f2f1', '#b2dfdb', '#80cbc4', '#4db6ac', '#26a69a', '#009688', '#00897b', '#00796b', '#00695c', '#004d40', '#e8f5e9', '#c8e6c9', '#a5d6a7', '#81c784', '#66bb6a', '#4caf50', '#43a047', '#388e3c', '#2e7d32', '#1b5e20', '#f1f8e9', '#dcedc8', '#c5e1a5', '#aed581', '#9ccc65', '#8bc34a', '#7cb342', '#689f38', '#558b2f', '#33691e', '#f9fbe7', '#f0f4c3', '#e6ee9c', '#dce775', '#d4e157', '#cddc39', '#c0ca33', '#afb42b', '#9e9d24', '#827717', '#fffde7', '#fff9c4', '#fff59d', '#fff176', '#ffee58', '#ffeb3b', '#fdd835', '#fbc02d', '#f9a825', '#f57f17', '#fff8e1', '#ffecb3', '#ffe082', '#ffd54f', '#ffca28', '#ffc107', '#ffb300', '#ffa000', '#ff8f00', '#ff6f00', '#fff3e0', '#ffe0b2', '#ffcc80', '#ffb74d', '#ffa726', '#ff9800', '#fb8c00', '#f57c00', '#ef6c00', '#e65100', '#fbe9e7', '#ffccbc', '#ffab91', '#ff8a65', '#ff7043', '#ff5722', '#f4511e', '#e64a19', '#d84315', '#bf360c', '#efebe9', '#d7ccc8', '#bcaaa4', '#a1887f', '#8d6e63', '#795548', '#6d4c41', '#5d4037', '#4e342e', '#3e2723', '#fafafa', '#f5f5f5', '#eeeeee', '#e0e0e0', '#bdbdbd', '#9e9e9e', '#757575', '#616161', '#424242', '#212121']
        colors.forEach(color => {
            const $listItem = document.createElement("span");
            $listItem.setAttribute("class", "color");
            $listItem.setAttribute("color", color);
            $listItem.setAttribute("style", `background-color: ${color}`);
            onClick($listItem, function() {
                resolve(this.getAttribute("color"));
                byId("color-chooser-dialog")?.close();
            });
            fragment.appendChild($listItem);
        });

        items.appendChild(fragment);
        colorListbox.append(items);

        openDialog(colorListbox, {
            id: "color-chooser-dialog",
            modal: false,
            closeButton: true,
            ok: false
        });
    });
}

function testJdom() {
    // Create a comprehensive test container
    const testContainer = document.createElement('div');
    testContainer.style.cssText = 'max-width: 800px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; padding: 10px';

    // dark/light
    const darkLightSection = document.createElement('j-button');
    darkLightSection.id = 'toggle-dark-light';
    darkLightSection.textContent = 'Toggle Dark/Light Mode';
    darkLightSection.addEventListener('click', async () => {
        const currentScheme = document.documentElement.getAttribute('color-scheme');
        let newScheme;
        if (currentScheme === 'dark') {
            newScheme = 'light';
        } else {
            newScheme = 'dark';
        }
        document.documentElement.setAttribute('color-scheme', newScheme);
    });
    testContainer.appendChild(darkLightSection);

    // Test j-button variations
    const buttonSection = document.createElement('div');
    buttonSection.innerHTML = escapeHTMLPolicy.createHTML(`
        <h3>j-button examples</h3>
        <j-button>Basic Button</j-button>
        <j-button icon="close">With Icon</j-button>
        <j-button src="https://jasonsavard.com/images/logo.webp">With Image</j-button>
        <j-button icon="close"></j-button>
        <j-button icon="close" class="filled"></j-button>
        <j-button icon="close" class="colored"></j-button>
        <j-button>Text only</j-button>
        <j-button class="filled">Filled</j-button>
        <j-button class="outline">Outline</j-button>
        <j-button class="raised">Raised</j-button>
        <j-button class="colored">Colored</j-button>
        <j-button disabled>Disabled</j-button>
        <j-button icon="close" disabled>Disabled with Icon</j-button>
        <br>
        <j-button popovertarget-id="test-popover">Open Popover</j-button>
        <j-button popovertarget-id="test-popover2">Open Popover position="start"</j-button>
        <j-button popovertarget-id="test-popover-end">Open Popover position="end"</j-button>
        <j-button popovertarget-id="test-popover3">Open Popover position="center-start"</j-button>
    `);
    testContainer.appendChild(buttonSection);

    // Test dialog, spinner, and loading
    const dialogTestSection = document.createElement('div');
    dialogTestSection.innerHTML = escapeHTMLPolicy.createHTML(`
        <h3>Dialog, Spinner & Loading examples</h3>
        <j-button id="test-dialog-btn">Open Test Dialog</j-button>
        <j-button id="test-modal-dialog-btn">Open Modal Dialog</j-button>
        <j-button id="test-spinner-btn">Show Spinner</j-button>
        <j-button id="test-spinner-with-target-btn">Show Spinner with Target</j-button>
        <j-button id="test-loading-btn">Show Loading</j-button>
        <j-button id="test-toast-btn">Show Toast</j-button>
    `);
    testContainer.appendChild(dialogTestSection);

    dialogTestSection.querySelector('#test-dialog-btn')?.addEventListener('click', async () => {
        const result = await openDialog('This is a test dialog', {
            title: 'Test Dialog',
            cancel: true,
            modal: false,
            buttons: [
                { label: 'show toast', onClick: () => showToast("blah", { duration: 999999}) }
            ]
        });
        console.log('Dialog result:', result);
    });

    dialogTestSection.querySelector('#test-modal-dialog-btn')?.addEventListener('click', async () => {
        const result = await openDialog('This is a modal test dialog', {
            title: 'Modal Test Dialog',
            modal: true,
            cancel: true,
            buttons: [
                { label: 'show toast', onClick: () => showToast("blah", { duration: 999999}) }
            ]
        });
        console.log('Modal Dialog result:', result);
    });

    dialogTestSection.querySelector('#test-spinner-btn')?.addEventListener('click', () => {
        showSpinner();
        setTimeout(() => hideSpinner(), 2000);
    });

    dialogTestSection.querySelector('#test-spinner-with-target-btn')?.addEventListener('click', () => {
        showSpinner(byId("test-spinner-with-target-btn"));
        setTimeout(() => hideSpinner(), 2000);
    });

    dialogTestSection.querySelector('#test-loading-btn')?.addEventListener('click', () => {
        showLoading();
        //setTimeout(() => hideLoading(), 2000);
    });

    dialogTestSection.querySelector('#test-toast-btn')?.addEventListener('click', () => {
        showToast('This is a test toast message!', { duration: 999999});
    });

    // Side rail menu

    const sideRailButton = document.createElement('j-button');
    sideRailButton.textContent = "Open Side Rail Menu";
    sideRailButton.setAttribute("popovertarget-id", "side-rail-menu");
    testContainer.appendChild(sideRailButton);

    const sideRailSection = document.createElement('div');
    sideRailSection.innerHTML = escapeHTMLPolicy.createHTML(`
        <div id="side-rail-menu" popover>
            <j-listbox>
                <j-icon-item>
                    <j-icon icon="close"></j-icon>
                    Close
                </j-icon-item>
                <j-icon-item>
                    <j-icon icon="close"></j-icon>
                    Close
                </j-icon-item>
                <j-icon-item>
                    <j-icon icon="close"></j-icon>
                    Close
                </j-icon-item>
            </j-listbox>
        </div>
    `);
    testContainer.appendChild(sideRailSection);


    // Test popover
    const popoverSection = document.createElement('div');
    popoverSection.innerHTML = escapeHTMLPolicy.createHTML(`
        <div id="test-popover" popover>
            <p>This is popover content</p>
            <j-button>Action</j-button>
        </div>

        <div id="test-popover2" popover position="start">
            <p>This is popover content</p>
            <j-button>Action</j-button>
        </div>

         <div id="test-popover-end" popover position="end">
            <p>This is popover content</p>
            <j-button>Action</j-button>
        </div>

        <div id="test-popover3" popover position="center-start">
            <p>This is popover content</p>
            <j-button>Action</j-button>
        </div>
    `);
    testContainer.appendChild(popoverSection);    

    // Test j-tooltip
    const tooltipSection = document.createElement('div');
    tooltipSection.innerHTML = escapeHTMLPolicy.createHTML(`
        <h3>j-tooltip examples</h3>

        <div class="layout vertical center">
        
            <j-button id="tooltip-target">Hover with for no position</j-button>
            <j-tooltip for="tooltip-target">This is a tooltipl skjflsjk dflsjdf lsjdf lsjef lsejkf slkefjslkef</j-tooltip>

            <j-button>Hover no position</j-button>
            <j-tooltip>This is a tooltipl skjflsjk dflsjdf lsjdf lsjef lsejkf slkefjslkef</j-tooltip>

            <j-button>Hover position="start"</j-button>
            <j-tooltip position="start">This is a tooltipl skjflsjk dflsjdf lsjdf lsjef lsejkf slkefjslkef</j-tooltip>

            <j-button>Hover position="end"</j-button>
            <j-tooltip position="end">This is a tooltipl skjflsjk dflsjdf lsjdf lsjef lsejkf slkefjslkef</j-tooltip>

            <br><br>
            <div style="display:inline; width: 100%">
                <j-button xxid="test-slibling-tooltip">Previous sibling tooltip</j-button>
                <j-tooltip xxfor="test-slibling-tooltip">This is a tooltipl skjflsjk dflsjdf lsjdf lsjef lsejkf slkefjslkef</j-tooltip>
            
                <j-button xxid="share-icon-button" xxclass="share-button" xxicon="share" xxpopovertarget-id="share-menu">blah</j-button>
                <j-tooltip>This is a tooltipl skjflsjk dflsjdf lsjdf lsjef lsejkf slkefjslkef</j-tooltip>
            </div>

        </div>
    `);
    testContainer.appendChild(tooltipSection);    

    // Test j-input variations
    const inputSection = document.createElement('div');
    inputSection.style.cssText = 'display: flex; flex-direction: column; gap: 12px; align-self: center;';
    inputSection.innerHTML = escapeHTMLPolicy.createHTML(`
        <h3>j-input examples</h3>

        <label>
            <span class="label-text">Without Floating Label</span>
            <select>
                <option value="1">Option 1</option>
                <option value="2">Option 2</option>
                <option value="3">Option 3</option>
            </select>
        </label>

        <j-input label="j-input" type="text" name="test-text"></j-input>
        <input placeholder="native input" type="text" name="test-text">
        <j-input label="Email" type="email" name="test-email" required></j-input>
        <j-input label="Number" type="number" min="0" max="100" step="5" name="test-number"></j-input>
        <j-input label="Password" type="password" name="test-password"></j-input>
        <j-input label="Disabled" disabled value="Disabled value"></j-input>
        <j-input label="Readonly" readonly value="Readonly value"></j-input>
        <j-input label="No Spin" type="number" no-spin-button name="test-no-spin"></j-input>
        <j-input label="Multiline" multiline name="test-textarea"></j-input>
        <j-input label="With Placeholder" placeholder="Enter text here"></j-input>
        <j-input label="Pattern" pattern="[A-Za-z]{3}" title="Three letters"></j-input>
    `);
    testContainer.appendChild(inputSection);

    // Test j-switch variations
    const switchSection = document.createElement('div');
    switchSection.style.cssText = 'display: flex; flex-direction: column; gap: 10px;';
    switchSection.innerHTML = escapeHTMLPolicy.createHTML(`
        <h3>j-switch examples</h3>
        <label><span style="min-width: 170px">Default</span><j-switch name="switch-default"></j-switch></label>
        <label><span style="min-width: 170px">Checked</span><j-switch name="switch-checked" checked></j-switch></label>
        <label><span style="min-width: 170px">With Icons</span><j-switch name="switch-icons" checked icons></j-switch></label>
        <label><span style="min-width: 170px">Disabled</span><j-switch disabled></j-switch></label>
        <label><span style="min-width: 170px">Required</span><j-switch required name="switch-required"></j-switch></label>
    `);
    testContainer.appendChild(switchSection);

    // Test j-icon variations
    const iconSection = document.createElement('div');
    iconSection.innerHTML = escapeHTMLPolicy.createHTML(`
        <h3>j-icon examples</h3>
        <j-icon icon="close"></j-icon>
        <j-icon src="https://jasonsavard.com/images/logo.webp"></j-icon>
        <j-icon icon="close" invert-icon></j-icon>
        <j-icon icon="close" style="--icon-size: 32px; --icon-color: red;"></j-icon>
    `);
    testContainer.appendChild(iconSection);

    // Test j-listbox and items
    const listboxSection = document.createElement('div');
    listboxSection.innerHTML = escapeHTMLPolicy.createHTML(`
        <h3>j-listbox examples</h3>
        <j-listbox>
            <j-item>Simple Item</j-item>
            <j-item class="selected">Selected Item</j-item>
            <j-icon-item>
                <j-icon icon="close"></j-icon>
                Icon Item
            </j-icon-item>
            <j-item>
                <j-item-body>
                    <div>Item with Body</div>
                    <small style="color: #666;">Secondary text</small>
                </j-item-body>
            </j-item>
            <j-item class="separator"></j-item>
            <j-item>After Separator</j-item>
        </j-listbox>
    `);
    testContainer.appendChild(listboxSection);

    // Test toast
    const toastSection = document.createElement('div');
    toastSection.innerHTML = escapeHTMLPolicy.createHTML(`
        <h3>Toast examples</h3>
        <j-button id="show-toast-btn">Show Toast</j-button>
        <j-button id="show-toast-long-btn">Show Toast Long message</j-button>
        <j-button id="show-error-btn">Show Error</j-button>
        <j-button id="show-long-error-btn">Show Long Error</j-button>
    `);
    testContainer.appendChild(toastSection);

    document.body.prepend(testContainer);

    // Add toast event listeners
    byId('show-toast-btn')?.addEventListener('click', () => {
        showToast('This is a toast message', {
            text: 'Action',
            onClick: () => console.log('Toast action clicked')
        });
    });

    byId('show-toast-long-btn')?.addEventListener('click', () => {
        showToast('This is a longer toast message that should wrap onto https://groups.google.com/d/msgid/sc-apc-ndg/CAK69kXuJDr67Hc6wGEtBfv5feMnBS41PtnS%2B%3Da3HrJThKkDS%2BA%40mail.gmail.com to test the display of long toast messages in the toast notification system.', {
            text: 'Action',
            onClick: () => console.log('Toast action clicked')
        });
    });

    byId('show-error-btn')?.addEventListener('click', () => {
        showError('This is an error message');
    });

    byId('show-long-error-btn')?.addEventListener('click', () => {
        showError('This is a longer error message that should wrap onto https://groups.google.com/d/msgid/sc-apc-ndg/CAK69kXuJDr67Hc6wGEtBfv5feMnBS41PtnS%2B%3Da3HrJThKkDS%2BA%40mail.gmail.com. lines to test the display of long error messages in the toast notification system.');
    });

    // Test dialog
    setTimeout(() => {
        const dialogBtn = document.createElement('j-button');
        dialogBtn.textContent = 'Open Dialog';
        dialogBtn.addEventListener('click', () => {
            openDialog('This is a dialog message', {
                title: 'Test Dialog',
                cancel: true,
                buttons: [
                    { label: 'Custom Action', onClick: () => console.log('Custom clicked') },
                    { label: 'Primary', primary: true, onClick: () => console.log('Primary clicked') }
                ]
            });
        });
        testContainer.appendChild(dialogBtn);
    }, 100);
}

initColorScheme();

const linkPreconnect = document.createElement('link');
linkPreconnect.rel = 'preconnect';
linkPreconnect.href = 'https://fonts.googleapis.com';
document.head.appendChild(linkPreconnect);

const linkPreconnect2 = document.createElement('link');
linkPreconnect2.rel = 'preconnect';
linkPreconnect2.href = 'https://fonts.gstatic.com';
document.head.appendChild(linkPreconnect2);

const fontLink = document.createElement('link');
fontLink.rel = 'stylesheet';
fontLink.type = 'text/css';
fontLink.crossOrigin = 'anonymous';
fontLink.href = 'https://fonts.googleapis.com/css2?family=Roboto+Flex:opsz,wght@8..144,100..1000&display=swap';
fontLink.media = 'print'; // Load asynchronously to avoid blocking render when offline
fontLink.onload = function() { this.media = 'all'; }; // Switch to all media once loaded
document.head.appendChild(fontLink);

docReady(() => {

    //testJdom();

    initSelects(document);

    // patch to select last div without hidden attribute
    const groups = document.querySelectorAll('.button-group');
    groups.forEach(group => {
        initButtonGroup(group);
    });

});