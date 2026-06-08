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
    options.duration ??= 30000;
    showToast(message, options);
}

function showToast(message, params = {}) {
    params.duration ??= 3000;
    params.align ??= 'start';

    let $toastContainer = document.querySelector('.j-toast-container');
    if (!$toastContainer) {
        $toastContainer = document.createElement('div');
        /*
        if (params.align === 'end') {
            $toastContainer.style.alignItems = 'end';
        }
        */
        document.body.appendChild($toastContainer);
    }

    $toastContainer.classList.add('j-toast-container', 'apply-dark-theme');
    $toastContainer.setAttribute("position", params.position || "bottom");

    const toast = document.createElement('div');
    toast.id = params.id ?? "";
    toast.className = 'j-toast';

    const $msg = document.createElement('span');
    $msg.className = "j-toast-message";
    $msg.textContent = message;
    toast.appendChild($msg);

    const controller = new AbortController();
    const signal = controller.signal;

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
            toast.appendChild(toastAction);

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
    
    toast.appendChild(close);

    $toastContainer.appendChild(toast);

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
function showLoading(params = {}) {
    document.body.classList.add('j-loading');
    document.body.classList.toggle('j-loading-modal', params.modal !== false);
    showSpinner();
}

function hideLoading() {
    document.body.classList.remove('j-loading');
    hideSpinner();
}

function generateSpinnerElement(id) {
    const spinner = document.createElement("div");
    if (id) {
        spinner.id = id;
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
    return spinner;
}

function showSpinner(targetNode) {
    hideSpinner();
    let spinner = byId("spinner");
    if (spinner) {
        show(spinner);
    } else {
        spinner = generateSpinnerElement("spinner");
    }

    if (targetNode) {
        spinner.classList.add('j-spinner-inline');
    } else {
        spinner.classList.remove('j-spinner-inline');
        const modalDialog = document.querySelector('dialog[open]');
        if (modalDialog) {
            targetNode = modalDialog;
        } else {
            targetNode = document.body;
        }
    }
    // Position parent as relative if not already
    //if (getComputedStyle(targetNode).position === "static") {
        //targetNode.style.position = "relative";
    //}

    targetNode.appendChild(spinner);
}

function hideSpinner() {
    hide("#spinner");
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

        replaceEventListeners(popover, 'toggle', (event) => {
            if (event.newState == "open") {
                requestAnimationFrame(() => {
                    constrainPopoverHeight(popover);
                });
            }
        });
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

        dialog.className = 'native-dialog';

        if (params.modal === false) {
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
                dialog.close();
                resolve("close");
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

            if (message.id && message.id.startsWith(CONTAINER_FOR_TEMPLATE_PREFIX)) {
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
                dialog.close();
                resolve("cancel");
            }, { signal });
            menu.appendChild(cancelBtn);
        }

        let primaryAdded = false;
        // Add custom buttons if params.buttons exists
        if (Array.isArray(params.buttons)) {
            params.buttons.forEach(btn => {
                const b = document.createElement('j-button');
                b.type = 'button';

                if (btn.icon) {
                    b.setAttribute('icon', btn.icon);
                }

                if (btn.src) {
                    b.setAttribute('src', btn.src);
                }

                if ((btn.icon || btn.src) && btn.label) {
                    b.classList.add('filled');
                }

                if (btn.label) {
                    b.appendChild(document.createTextNode(btn.label));
                }

                if (btn.primary) {
                    b.classList.add("colored");
                    primaryAdded = true;
                }

                if (btn.classList) {
                    btn.classList.forEach(cls => b.classList.add(cls));
                }

                if (btn.style) {
                    b.style.cssText = btn.style;
                }

                if (btn.title) {
                    b.title = btn.title;
                }

                if (btn.onClick) {
                    b.setAttribute('data-onclick-set-opendialog', 'true');
                    b.addEventListener('click', () => {
                        btn.onClick(dialog);
                        resolve(btn.label);
                    }, { signal });
                }

                menu.appendChild(b);
            });
        }

        if (params.ok !== false && !primaryAdded) {
            const okBtn = document.createElement('j-button');
            okBtn.value = 'ok';
            okBtn.textContent = getMessage("ok");
            okBtn.classList.add("colored");
            okBtn.addEventListener('click', async () => {
                if (dialog.querySelector("form").checkValidity()) {
                    dialog.close();
                    resolve("ok");
                } else {
                    dialog.querySelector("form").reportValidity();
                }
            }, { signal });
            menu.appendChild(okBtn);
        }

        if (params.modal === false) {
            dialog.show();
        } else {
            dialog.showModal();
        }

        // ensure styles applied, then trigger the transition
        dialog.classList.remove('opening');
        // next frame -> start animation
        requestAnimationFrame(() => requestAnimationFrame(() => dialog.classList.add('opening')));

        setTimeout(() => {
            dialog.querySelectorAll('j-button').forEach(btn => btn.blur());
        }, 0);

        dialog.addEventListener('close', function onClose() {
            console.log("cleaning up dialog listeners");
            controller.abort(); // Clean up all listeners
            
            if (params.modal === false) {
                dialog.closest(".non-modal-dialog-wrapper").remove();
            } else {
                dialog.remove();
            }
        }, { once: true});
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
    static get observedAttributes() { return ['icon', 'src', 'disabled', 'icon-only']; }

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
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
                button {
                    padding: var(--button-padding, 10px 14px);
                }
            }
            :host([disabled]) {
                pointer-events: none;
                button {
                    opacity: 0.5;
                    cursor: default;
                }
            }

            :host(:hover) {
                background-color: color-mix(in srgb, var(--button), var(--bg-color) 90%);
            }

            :host(:active),
            :host(.active-state) {
                background-color: color-mix(in srgb, var(--button), var(--bg-color) 80%);
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
                box-shadow: 0 3px 1px -2px rgba(0,0,0,0.2),0 2px 2px 0 rgba(0,0,0,0.14),0 1px 5px 0 rgba(0,0,0,0.12);
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

            :host([icon]) {
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

            :host([icon-only]:hover) {
                background-color: var(--button-icon-only-hover);
                box-shadow: none;
            }

            :host([icon-only]:active),
            :host([icon-only].active-state) {
                background-color: color-mix(in srgb, var(--button-primary), transparent 80%);
            }

            :host([invert-icon]) .icon {
                filter: var(--icon-invert, none);
            }

            button {
                display: inline-flex;
                border: none;
                font: inherit;
                cursor: inherit;
                padding: 0;
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
        const slotEl = this.shadowRoot.querySelector('slot');
        if (slotEl) {
            const updateEmpty = () => {
                if (isSlotEmpty(slotEl) && !this.hasAttribute('button-look')) this.setAttribute('icon-only', '');
                else this.removeAttribute('icon-only');
            };
            updateEmpty();
            slotEl.addEventListener('slotchange', updateEmpty, { signal });
        }

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
                this._rootBtn.click();
            }
        }, { signal });

        // initial state
        this._updateDisabled();
        this._updateIcon();
        // hide icon container if no icon
        this._syncIconVisibility();

        addPopoverListener(this);
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) return;
        if (name === 'icon' || name === 'src' || name === 'icon-only') {
            this._updateIcon();
            this._syncIconVisibility();
        } else if (name === 'disabled') {
            this._updateDisabled();
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
                anchorName = `--${forId || forClass || 'anchor-' + Math.random().toString(36).substring(2, 9)}`;
            }

            if (anchorElement.style.anchorName) {
                //console.log('already anchored', anchorElement, tooltip, tooltip.style.positionAnchor);
            } else {
                anchorElement.style.anchorName = anchorName;
                tooltip.style.positionAnchor = anchorName;
            }

            anchorElement.addEventListener('mouseenter', () => {
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

                input, textarea {
                    width: 100%;
                    box-sizing: border-box;
                    padding: var(--input-padding, 12px); /* v1: 14px 12px 10px 12px */
                    font-size: 16px;
                    border: 1px solid #d1d5db;
                    border-radius: 8px;
                    background-color: var(--input-bg-color);
                    color: var(--text-color);
                    outline: none;
                    transition: border-color 0.2s, box-shadow 0.2s;
                    text-align: inherit;
                }

                :host(:not([no-outline])) input:focus,
                :host(:not([no-outline])) textarea:focus {
                    border-color: var(--input-focus-color);
                    box-shadow: var(--input-focus-shadow, 0 0 0 4px rgba(37,99,235,0.08));
                }

                input::placeholder,
                textarea::placeholder {
                    color: transparent;
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
                    transform: translateY(-144%) scale(0.85);
                    color: var(--input-focus-color);
                    background-color: var(--input-bg-color);
                    border-radius: 5px;
                    pointer-events: auto;
                }

                textarea {
                    min-height: 80px;
                    padding-top: 18px;
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
            if (e.key === 'Enter') {
                console.log("input keydown", e.key, document.activeElement);

                //e.preventDefault();
                //getFormRelativeToElement(this.input)?.requestSubmit();

                const dialog = this.closest(".native-dialog");
                if (dialog) {
                    const primaryButton = getPrimaryDialogButton(dialog);
                    if (primaryButton) {
                        e.preventDefault(); /* Do this to prevent key event from bubbling up and outside of the dialog and hitting the initial action that opened the dialog (loop) */
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
                    cursor: pointer;
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
    const nodeName = document.activeElement.nodeName;
    return nodeName == "SELECT" ||
        nodeName == "TEXTAREA" ||
        nodeName == "INPUT" ||
        nodeName == "J-INPUT" ||
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
document.head.appendChild(fontLink);

docReady(() => {

    initSelects(document);

    // patch to select last div without hidden attribute
    const groups = document.querySelectorAll('.button-group');
    groups.forEach(group => {
        initButtonGroup(group);
    });
    
});