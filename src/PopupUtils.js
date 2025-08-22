/**
 * WORDPRESS-PROOF POPUP UTILITY FROM HELL
 *
 * This exists because apparently making a simple popup work in WordPress
 * is harder than rocket science and I've wasted 6 hours of my life on this.
 *
 * USE THIS TEMPLATE OR SUFFER.
 *
 * Why this exists:
 * - CSS frameworks are lies
 * - WordPress hates developers
 * - Game loops eat DOM changes
 * - Browsers throttle navigation because they hate you
 * - Inline onclick is satan
 * - Everything breaks in incomprehensible ways
 *
 * @author Someone who has lost all faith in web development
 */

/**
 * Creates a WordPress-proof popup that actually fucking works
 *
 * CRITICAL RULES (learned through pain):
 * 1. ALWAYS append to document.body (NOT game container, that's cursed)
 * 2. ALWAYS use inline styles (external CSS gets overridden by WordPress themes)
 * 3. ALWAYS add flood protection (browsers will spam your events)
 * 4. ALWAYS use proper event listeners (inline onclick is Satan)
 * 5. ALWAYS use high z-index (999999 or WordPress will hide your popup)
 *
 * @param {Object} options - Configuration because I'm not psychic
 * @param {string} options.title - Popup title (keep it short, CSS is broken)
 * @param {string} options.message - Main message (HTML allowed but good luck)
 * @param {string} options.buttonText - Button text (will be UPPERCASE because terminal vibes)
 * @param {string} options.onConfirm - What happens when button clicked (URL or function)
 * @param {string} options.theme - Color theme: 'error', 'success', 'terminal' (default: 'terminal')
 * @returns {Function} Cleanup function (call this or memory leak hell awaits)
 */
export function createWordPressProofPopup(options = {}) {
  //Prevent the infinite loop nightmare that destroyed my sanity
  //This guard exists because game loops are evil and will call this every frame
  if (window.__popupActiveGuard) {
    console.warn("Popup already active, preventing duplicate (you're welcome)");
    return () => {}; //Return dummy cleanup
  }
  window.__popupActiveGuard = true;

  //Default options because I'm tired of null reference errors
  const config = {
    title: options.title || "SYSTEM ERROR",
    message: options.message || "Something went wrong (as usual)",
    buttonText: options.buttonText || "CONTINUE",
    onConfirm: options.onConfirm || "../index.html",
    theme: options.theme || "terminal",
    ...options,
  };

  //Theme colors because I'm sick of magic numbers everywhere
  const themes = {
    terminal: {
      bg: "#000",
      border: "#ecde60",
      text: "#20b2db",
      headerBg: "#000",
      headerText: "#ecde60",
    },
    error: {
      bg: "#000",
      border: "#ff0000",
      text: "#ff4444",
      headerBg: "#ff0000",
      headerText: "#000",
    },
    success: {
      bg: "#000",
      border: "#00ff00",
      text: "#00ff00",
      headerBg: "#00ff00",
      headerText: "#000",
    },
  };

  const colors = themes[config.theme] || themes.terminal;

  //Create the popup container
  //Using document.body because that's literally the ONLY thing that works
  //Don't even think about putting this in the game container, I tried, it's cursed
  const popup = document.createElement("div");

  //Inline styles because external CSS gets murdered by WordPress themes
  //Yes it's ugly, no I don't care, it WORKS and that's all that matters
  popup.style.position = "fixed"; //Fixed because absolute is broken in iframes
  popup.style.top = "0";
  popup.style.left = "0";
  popup.style.width = "100vw";
  popup.style.height = "100vh";
  popup.style.background = "rgba(0, 0, 0, 0.95)"; //Dark overlay so you know shit is serious
  popup.style.display = "flex";
  popup.style.alignItems = "center";
  popup.style.justifyContent = "center";
  popup.style.zIndex = "999999";
  popup.style.fontFamily = '"Courier New", monospace'; //Because terminal aesthetic
  popup.style.opacity = "0"; //Start invisible for smooth fade-in
  popup.style.transition = "opacity 0.5s ease-in"; //Smooth like my soul isn't
  popup.style.pointerEvents = "auto"; //Just in case some CSS tries to disable it

  //Create the actual popup content
  //This HTML structure took 3 hours to get right, don't touch it
  popup.innerHTML = `
    <div style="
      background: ${colors.bg};
      border: 3px solid ${colors.border};
      color: ${colors.text};
      width: 600px;
      max-width: 90vw;
      box-shadow: 0 0 20px ${colors.border};
      font-family: 'Courier New', monospace;
    ">
      <div style="
        background: ${colors.headerBg};
        color: ${colors.headerText};
        padding: 8px 15px;
        display: flex;
        justify-content: space-between;
        font-weight: bold;
        font-size: 12px;
        border-bottom: 1px solid ${colors.border};
      ">
        <span style="color: ${colors.headerText};">${config.title}</span>
        <span style="background: #ff0000; padding: 2px 8px; border-radius: 2px; font-size: 10px;">ERROR</span>
      </div>
      <div style="padding: 20px; min-height: 120px;">
        <div style="margin-bottom: 20px; line-height: 1.4;">
          ${config.message}
        </div>
        <div style="text-align: center; margin-top: 20px;">
          <button id="popupConfirmBtn" style="
            background: ${colors.bg};
            border: 2px solid ${colors.border};
            color: ${colors.text};
            padding: 12px 24px;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
            text-transform: uppercase;
            letter-spacing: 1px;
            transition: all 0.2s ease;
          ">${config.buttonText}</button>
        </div>
      </div>
    </div>
  `;

  //Append to document.body because it's the only goddamn thing that works
  //I tried everything else, this is the ONE TRUE PATH
  document.body.appendChild(popup);

  //Add flood-protected button handler because browsers are malicious
  //This prevents the "throttling navigation" error that made me question my life choices (I could also be wrong and this is unnecessary but better safe than sorry)
  const confirmBtn = popup.querySelector("#popupConfirmBtn");
  let buttonClicked = false; //The most important variable in this entire codebase

  if (confirmBtn) {
    //Add hover effect because why not make it pretty while we suffer
    confirmBtn.addEventListener("mouseenter", () => {
      confirmBtn.style.background = colors.border;
      confirmBtn.style.color = colors.bg;
    });
    confirmBtn.addEventListener("mouseleave", () => {
      confirmBtn.style.background = colors.bg;
      confirmBtn.style.color = colors.text;
    });

    //The actual click handler with flood protection
    //This took 4 hours to get right because web development is pain
    confirmBtn.addEventListener("click", (e) => {
      e.preventDefault(); //Stop the browser from doing dumb shit
      e.stopPropagation(); //STOP. JUST STOP.

      if (buttonClicked) {
        console.warn("Button click ignored (flood protection saved your ass)");
        return; //NOPE. ONE CLICK ONLY.
      }

      buttonClicked = true; //Mark as clicked so it can't happen again
      confirmBtn.style.opacity = "0.5"; //Visual feedback that we heard you
      confirmBtn.style.cursor = "not-allowed"; //Don't click me again, I'm dead

      //Small delay to let animations finish and prevent browser freakouts
      setTimeout(() => {
        if (typeof config.onConfirm === "function") {
          config.onConfirm(); //Call the function
        } else {
          window.location.href = config.onConfirm; //Navigate to URL
        }
      }, 100); //100ms delay prevents browser navigation throttling
    });
  }

  //Trigger the fade-in animation
  //Small delay prevents weird rendering artifacts (because browsers are garbage)
  setTimeout(() => {
    popup.style.opacity = "1";
  }, 50);

  //Return cleanup function because memory leaks are the final boss
  //ALWAYS call this when you're done or your browser will hate you
  return function cleanup() {
    try {
      if (popup && popup.parentNode) {
        popup.parentNode.removeChild(popup); //Old school removal because modern methods break
      }
      window.__popupActiveGuard = false; //Reset the guard for next time
    } catch (error) {
      console.error("Cleanup failed but whatever, at least we tried:", error);
    }
  };
}

/**
 * Shortcut for terminal-style error popups (most common use case)
 * Because I'm tired of typing the same config over and over
 *
 * @param {string} message - Error message
 * @param {string} returnUrl - Where to go when clicked (default: back to menu)
 * @returns {Function} Cleanup function
 */
export function showTerminalError(message, returnUrl = "../index.html") {
  return createWordPressProofPopup({
    title: "NODIC CONNECTION STATUS",
    message: `
      <div style="font-size: 14px; margin: 8px 0;">></div>
      <div style="font-size: 14px; margin: 8px 0;">> CRITICAL SYSTEM FAILURE</div>
      <div style="font-size: 14px; margin: 8px 0;">></div>
      <div style="font-size: 16px; margin: 8px 0; color: #ecde60; font-weight: bold;">> ${message}</div>
      <div style="font-size: 14px; margin: 8px 0;">></div>
      <div style="font-size: 16px; margin: 8px 0;">> RETURN TO PRONODE TERMINAL?</div>
    `,
    buttonText: "RETURN TO PRONODE TERMINAL",
    onConfirm: returnUrl,
    theme: "terminal",
  });
}

//Usage examples for future me when I forget how this works:
//
//Basic popup:
//const cleanup = showTerminalError("SOUL DISCONNECTED FROM THE NODE");
//
//Custom popup:
//const cleanup = createWordPressProofPopup({
//  title: "WHATEVER",
//  message: "Something broke again",
//  buttonText: "FIX IT",
//  onConfirm: () => { console.log("At least something works"); }
//});
//
//Always call cleanup when done :D
//cleanup();
