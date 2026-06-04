// State variables
let isActive = false;
let startX = 0,
  startY = 0,
  endX = 0,
  endY = 0;
let overlayEl = null;
let selectionEl = null;
let isDragging = false;
let activeCards = []; // holds all currently visible answer cards

// Handle cycling profiles and toasts
async function handleCycleProfile() {
  try {
    const data = await chrome.storage.local.get([
      "snapsolve_profiles",
      "snapsolve_config",
    ]);
    const profiles = data.snapsolve_profiles || [];
    const config = data.snapsolve_config || {};

    if (!profiles || profiles.length < 2) {
      showProfileToast(
        "No profiles to cycle",
        "Add multiple profiles in settings",
        "warning",
      );
      return;
    }

    // Find current index by matching provider + model
    const currentKey = `${config.provider || ""} - ${config.model || ""}`;
    let currentIndex = profiles.findIndex(
      (p) => `${p.provider} - ${p.model}` === currentKey,
    );
    if (currentIndex === -1) currentIndex = 0;

    const nextIndex = (currentIndex + 1) % profiles.length;
    const nextProfile = profiles[nextIndex];

    // Persist next profile as active config
    await chrome.storage.local.set({ snapsolve_config: nextProfile });

    const title = `Switched to profile ${nextIndex + 1} of ${profiles.length}`;
    const subtitle = `${nextProfile.provider.toUpperCase()} - ${nextProfile.model}`;
    showProfileToast(title, subtitle, "success");
  } catch (err) {
    showProfileToast(
      "Could not cycle profiles",
      err.message || "Unknown error",
      "error",
    );
  }
}

function showProfileToast(title, subtitle, type = "info") {
  // Remove existing toast
  const existing = document.getElementById("snapsolve-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "snapsolve-toast";
  toast.className = `snapsolve-toast snapsolve-toast-${type}`;
  toast.style.pointerEvents = "none";

  const t = document.createElement("div");
  t.className = "snapsolve-toast-title";
  t.textContent = title;
  const s = document.createElement("div");
  s.className = "snapsolve-toast-sub";
  s.textContent = subtitle;

  toast.appendChild(t);
  if (subtitle) toast.appendChild(s);
  document.body.appendChild(toast);

  // Auto-dismiss after 2s
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 400);
  }, 2000);
}

// Listen for activation message from background script
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "activate") {
    // Check if we're in an input field
    const focused = document.activeElement;
    const isInput =
      focused &&
      (focused.tagName === "INPUT" ||
        focused.tagName === "TEXTAREA" ||
        focused.isContentEditable);

    // If in input field, blur it first
    if (isInput) {
      focused.blur();
    }

    // Activate overlay
    if (!isActive) activateOverlay();
    return;
  }

  if (message.action === "cycleProfile") {
    handleCycleProfile();
    return;
  }

  if (message.action === "notificationFailed") {
    const reason = message.reason || "Native notifications unavailable";
    showProfileToast("Notification failed", reason, "warning");
    return;
  }
});

// Activate the screen overlay
function activateOverlay() {
  isActive = true;

  // Create overlay element
  overlayEl = document.createElement("div");
  overlayEl.id = "snapsolve-overlay";
  overlayEl.style.position = "fixed";
  overlayEl.style.top = "0";
  overlayEl.style.left = "0";
  overlayEl.style.width = "100vw";
  overlayEl.style.height = "100vh";
  overlayEl.style.background = "rgba(0,0,0,0.45)";
  overlayEl.style.zIndex = "2147483646";
  overlayEl.style.cursor = "crosshair";
  overlayEl.style.userSelect = "none";
  overlayEl.style.pointerEvents = "auto";
  overlayEl.style.touchAction = "none";
  // Send native notification via background
  try {
    chrome.runtime.sendMessage(
      {
        action: "notifyModelChange",
        title: `Model changed to ${nextProfile.model}`,
        message: subtitle,
      },
      (resp) => {
        // If background reports failure or no response, show fallback toast
        if (!resp || resp.ok === false) {
          const reason =
            (resp && resp.reason) || "Native notifications unavailable";
          showProfileToast("Notification failed", reason, "warning");
        }
      },
    );
  } catch (e) {
    // ignore
  }
  overlayEl.style.overscrollBehavior = "none";

  document.body.appendChild(overlayEl);

  // Add event listeners in capture phase so the overlay always receives them
  document.addEventListener("mousedown", handleMouseDown, true);
  document.addEventListener("mousemove", handleMouseMove, true);
  document.addEventListener("mouseup", handleMouseUp, true);

  // Add escape key listener
  document.addEventListener("keydown", handleKeyDown);
}

// Handle mouse down on overlay
function handleMouseDown(e) {
  if (!isActive || e.button !== 0) return;
  e.preventDefault();
  isDragging = true;

  startX = e.clientX;
  startY = e.clientY;

  // Create selection element
  selectionEl = document.createElement("div");
  selectionEl.id = "snapsolve-selection";
  selectionEl.style.position = "fixed";
  selectionEl.style.border = "2px solid #7c6af7";
  selectionEl.style.background = "rgba(124,106,247,0.12)";
  selectionEl.style.zIndex = "2147483647";
  selectionEl.style.pointerEvents = "none";
  selectionEl.style.left = startX + "px";
  selectionEl.style.top = startY + "px";
  selectionEl.style.width = "0";
  selectionEl.style.height = "0";

  document.body.appendChild(selectionEl);
}

// Handle mouse move on overlay
function handleMouseMove(e) {
  if (!isDragging) return;

  const currentX = e.clientX;
  const currentY = e.clientY;

  const left = Math.min(startX, currentX);
  const top = Math.min(startY, currentY);
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);

  selectionEl.style.left = left + "px";
  selectionEl.style.top = top + "px";
  selectionEl.style.width = width + "px";
  selectionEl.style.height = height + "px";
}

// Handle mouse up on overlay
function handleMouseUp(e) {
  if (!isDragging) return;
  isDragging = false;

  endX = e.clientX;
  endY = e.clientY;

  // Calculate final selection rect
  const rect = {
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  };

  // Check for accidental click (too small)
  if (rect.width < 10 || rect.height < 10) {
    deactivateOverlay();
    return;
  }

  // Deactivate overlay and stop at the stage 4 behavior
  deactivateOverlay();
  captureAndSolve(rect);
}

// Handle escape key press
function handleKeyDown(e) {
  if (e.key === "Escape") {
    deactivateOverlay();
  }
}

// Deactivate the overlay
function deactivateOverlay() {
  isActive = false;

  // Remove overlay element
  if (overlayEl && overlayEl.parentNode) {
    overlayEl.parentNode.removeChild(overlayEl);
  }
  overlayEl = null;

  // Remove selection element
  if (selectionEl && selectionEl.parentNode) {
    selectionEl.parentNode.removeChild(selectionEl);
  }
  selectionEl = null;

  // Remove event listeners
  document.removeEventListener("keydown", handleKeyDown);
  document.removeEventListener("mousedown", handleMouseDown, true);
  document.removeEventListener("mousemove", handleMouseMove, true);
  document.removeEventListener("mouseup", handleMouseUp, true);
}

// Show the answer card
function showAnswerCard(rect, config) {
  // Create card element
  const card = document.createElement("div");
  card.id = "snapsolve-card";

  // Card HTML structure
  card.innerHTML = `
    <div id="snapsolve-card-header">
      <div class="snapsolve-provider-badge">${config && config.provider ? `${config.provider.toUpperCase()} - ${config.model}` : "Not configured — open Settings"}</div>
      <div>
        <span id="snapsolve-loading-dot" class="snapsolve-loading-dot"></span>
        <button id="snapsolve-close">×</button>
      </div>
    </div>
    <div id="snapsolve-card-body">
      <div id="snapsolve-skeleton">
        <div class="skeleton-line long"></div>
        <div class="skeleton-line medium"></div>
        <div class="skeleton-line long"></div>
        <div class="skeleton-line short"></div>
      </div>
      <div id="snapsolve-answer" style="display: none;"></div>
    </div>
  `;

  // Add to document
  document.body.appendChild(card);

  // Register this card in the active cards array
  activeCards.push(card);

  // Add close button event listener
  const closeBtn = card.querySelector("#snapsolve-close");
  closeBtn.addEventListener("click", () => {
    if (card.parentNode) {
      card.parentNode.removeChild(card);
      // Remove from activeCards array
      activeCards = activeCards.filter((c) => c !== card);
      updateCloseAllButton();
    }
  });

  // Add dragging functionality
  const header = card.querySelector("#snapsolve-card-header");
  let isDragging = false;
  let offsetX, offsetY;

  header.addEventListener("mousedown", (e) => {
    if (e.target === closeBtn) return;
    isDragging = true;
    offsetX = e.clientX - card.getBoundingClientRect().left;
    offsetY = e.clientY - card.getBoundingClientRect().top;
    document.body.style.userSelect = "none";
    // Bring dragged card to front while dragging
    card.style.zIndex = String(2147483650);
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const x = e.clientX - offsetX;
    const y = e.clientY - offsetY;

    // Keep card within viewport
    const clampedX = Math.max(
      10,
      Math.min(window.innerWidth - card.offsetWidth - 10, x),
    );
    const clampedY = Math.max(
      10,
      Math.min(window.innerHeight - card.offsetHeight - 10, y),
    );

    card.style.left = clampedX + "px";
    card.style.top = clampedY + "px";
  });

  document.addEventListener("mouseup", () => {
    isDragging = false;
    document.body.style.userSelect = "";
  });

  // After creating and registering the card, compute cascade offset positioning
  try {
    const CASCADE_OFFSET = 24;
    const BASE_RIGHT = 20;
    const BASE_TOP = 20;
    // cardCount BEFORE this card was added is activeCards.length - 1
    const cardCount = Math.max(0, activeCards.length - 1);

    const cardRight = BASE_RIGHT + cardCount * CASCADE_OFFSET;
    const cardTop = BASE_TOP + cardCount * CASCADE_OFFSET;

    const maxRight = Math.max(10, window.innerWidth - 380);
    const maxTop = Math.max(10, window.innerHeight - 120);

    card.style.position = "fixed";
    card.style.right = `${Math.min(cardRight, maxRight)}px`;
    card.style.top = `${Math.min(cardTop, maxTop)}px`;
    card.style.width = "360px";
    card.style.zIndex = String(2147483640 + cardCount);
  } catch (e) {
    // Fallback to previous positioning if anything goes wrong
    const cardRect = calculateCardPosition(rect);
    card.style.left = cardRect.x + "px";
    card.style.top = cardRect.y + "px";
  }

  updateCloseAllButton();

  return card;
}

function updateCloseAllButton() {
  const existing = document.getElementById("snapsolve-close-all");

  // Remove the button if fewer than 2 cards remain
  if (activeCards.length < 2) {
    if (existing) existing.remove();
    return;
  }

  // If button already exists just update the count label
  if (existing) {
    const label = existing.querySelector(".snapsolve-close-all-count");
    if (label) {
      label.textContent = `✕  Close All  (${activeCards.length})`;
    }
    return;
  }

  // Create the Close All pill
  const btn = document.createElement("div");
  btn.id = "snapsolve-close-all";
  btn.innerHTML = `<span class="snapsolve-close-all-count">✕  Close All  (${activeCards.length})</span>`;

  btn.addEventListener("click", () => {
    // Close every card
    activeCards.forEach((c) => c.remove());
    activeCards = [];
    btn.remove();
  });

  document.body.appendChild(btn);
}

// Calculate card position based on selection
function calculateCardPosition(rect) {
  const cardWidth = 360;
  const cardHeight = 200;
  const margin = 10; // tighter margin to keep card clearly inside viewport

  let x, y;

  // Position card to avoid covering selection
  if (rect.x > window.innerWidth / 2) {
    // Selection is on right half, position card on left
    x = Math.max(margin, rect.x - cardWidth - margin);
  } else {
    // Selection is on left half, position card on right
    x = Math.min(
      rect.x + rect.width + margin,
      window.innerWidth - cardWidth - margin,
    );
  }

  // Position vertically centered with selection
  y = rect.y + rect.height / 2 - cardHeight / 2;

  // Keep within viewport bounds (ensure some minimum bottom spacing)
  x = Math.max(margin, Math.min(window.innerWidth - cardWidth - margin, x));
  y = Math.max(margin, Math.min(window.innerHeight - 100, y));

  return { x, y };
}

function humanizeError(raw) {
  const s = (raw || "").toLowerCase();

  if (
    s.includes("404") ||
    s.includes("not found") ||
    s.includes("no endpoint")
  ) {
    return "Model not found or endpoint missing.\n\nThe model you selected may have been retired or renamed by the provider.\n\nOpen SnapSolve Settings and click the Refresh button next to the model dropdown to reload the list and select a working model.";
  }

  if (
    s.includes("decommissioned") ||
    s.includes("deprecated") ||
    s.includes("sunset")
  ) {
    return "This model has been decommissioned by the provider.\n\nOpen SnapSolve Settings and click Refresh to load current models.";
  }

  if (
    s.includes("401") ||
    s.includes("unauthorized") ||
    s.includes("invalid api key") ||
    s.includes("authentication")
  ) {
    return "Invalid API key.\n\nYour API key was rejected by the provider.\n\nOpen SnapSolve Settings and check your API key is correct and hasn't expired.";
  }

  if (
    s.includes("429") ||
    s.includes("rate limit") ||
    s.includes("too many requests")
  ) {
    return "Rate limit reached.\n\nYou've sent too many requests. Wait a moment and try again.\n\nIf this happens often, consider switching to a provider with higher limits.";
  }

  if (
    s.includes("multimodal") ||
    s.includes("vision") ||
    (s.includes("image") && s.includes("not supported"))
  ) {
    return "This model does not support images.\n\nSnapSolve sends a screenshot, so a vision-capable model is required.\n\nOpen Settings and select a model with 'vision', 'vl', or 'llava' in the name.";
  }

  if (s.includes("no provider") || s.includes("not configured")) {
    return "No provider configured.\n\nOpen the SnapSolve extension options and set up your API key and model.";
  }

  if (
    s.includes("quota") ||
    s.includes("billing") ||
    s.includes("insufficient_quota")
  ) {
    return "API quota exceeded.\n\nYour account has run out of credits with this provider.\n\nCheck your billing dashboard, or switch to a different provider.";
  }

  return `API Error\n\n${raw}\n\nOpen Settings and verify your provider, key, and model are correct.`;
}

// Display the answer in the card
function displayAnswer(text, isError, card) {
  // If card not provided, fall back to global selectors (legacy)
  const root = card || document;
  const skeleton =
    root.querySelector("#snapsolve-skeleton") ||
    document.querySelector("#snapsolve-skeleton");
  const answer =
    root.querySelector("#snapsolve-answer") ||
    document.querySelector("#snapsolve-answer");
  const loadingDot =
    root.querySelector("#snapsolve-loading-dot") ||
    document.querySelector("#snapsolve-loading-dot");

  if (!skeleton || !answer) return;

  // Remove loading dot if present
  if (loadingDot && loadingDot.parentNode) {
    loadingDot.parentNode.removeChild(loadingDot);
  }

  // Hide skeleton
  skeleton.style.display = "none";

  // Show answer
  answer.style.display = "block";

  if (isError) {
    // Display error in red
    answer.style.color = "#ff6b6b";
    answer.textContent = humanizeError(text);
  } else {
    // Process and display answer with basic markdown
    answer.style.color = "";
    answer.innerHTML = processMarkdown(text);
  }
}

// Process basic markdown
function processMarkdown(text) {
  // Process strong (**text**)
  text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

  // Process emphasis (*text*)
  text = text.replace(/\*(.*?)\*/g, "<em>$1</em>");

  // Process code (`code`)
  text = text.replace(/`(.*?)`/g, "<code>$1</code>");

  // Process lists (- item)
  const listItems = text.match(/^-\s.*/gm);
  if (listItems) {
    const listHTML =
      "<ul>" +
      listItems.map((item) => `<li>${item.slice(2)}</li>`).join("") +
      "</ul>";
    text = text.replace(/^-\s.*(?:\n-\s.*)*$/gm, listHTML);
  }

  // Process paragraphs (\n\n)
  text = text.replace(/\n\n/g, "</p><p>");
  text = `<p>${text}</p>`;

  return text;
}

// Capture and solve (stage 7 wiring)
async function captureAndSolve(rect) {
  rect.devicePixelRatio = window.devicePixelRatio || 1;

  const configResult = await chrome.storage.local.get("snapsolve_config");
  const config = configResult.snapsolve_config;

  const card = showAnswerCard(rect, config);

  chrome.runtime.sendMessage(
    { action: "captureAndQuery", rect },
    (response) => {
      if (chrome.runtime.lastError) {
        displayAnswer(
          "⚠ Extension error: " + chrome.runtime.lastError.message,
          true,
          card,
        );
        return;
      }

      if (response && response.error) {
        displayAnswer("⚠ " + response.error, true, card);
      } else if (response && response.answer) {
        displayAnswer(response.answer, false, card);
      }
    },
  );
}
