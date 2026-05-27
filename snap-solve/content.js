// State variables
let isActive = false;
let startX = 0,
  startY = 0,
  endX = 0,
  endY = 0;
let overlayEl = null;
let selectionEl = null;
let isDragging = false;
let activeCard = null;

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
  // Close previous card if exists
  if (activeCard && activeCard.parentNode) {
    activeCard.parentNode.removeChild(activeCard);
  }

  // Create card element
  const card = document.createElement("div");
  card.id = "snapsolve-card";

  // Set card position
  const cardRect = calculateCardPosition(rect);
  card.style.left = cardRect.x + "px";
  card.style.top = cardRect.y + "px";

  // Card HTML structure
  card.innerHTML = `
    <div id="snapsolve-card-header">
      <div class="snapsolve-provider-badge">${config && config.provider ? `● ${config.provider.toUpperCase()} · ${config.model}` : "● Not configured — open Settings"}</div>
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
  activeCard = card;

  // Add close button event listener
  const closeBtn = card.querySelector("#snapsolve-close");
  closeBtn.addEventListener("click", () => {
    if (card.parentNode) {
      card.parentNode.removeChild(card);
      activeCard = null;
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

  return card;
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
    return "⚠ Model not found or endpoint missing.\n\nThe model you selected may have been retired or renamed by the provider.\n\n→ Open SnapSolve Settings → click 🔄 next to the model dropdown to refresh the list and select a working model.";
  }

  if (
    s.includes("decommissioned") ||
    s.includes("deprecated") ||
    s.includes("sunset")
  ) {
    return "⚠ This model has been decommissioned by the provider.\n\n→ Open SnapSolve Settings → click 🔄 to load current models.";
  }

  if (
    s.includes("401") ||
    s.includes("unauthorized") ||
    s.includes("invalid api key") ||
    s.includes("authentication")
  ) {
    return "⚠ Invalid API key.\n\nYour API key was rejected by the provider.\n\n→ Open SnapSolve Settings → check your API key is correct and hasn't expired.";
  }

  if (
    s.includes("429") ||
    s.includes("rate limit") ||
    s.includes("too many requests")
  ) {
    return "⚠ Rate limit reached.\n\nYou've sent too many requests. Wait a moment and try again.\n\nIf this happens often, consider switching to a provider with higher limits.";
  }

  if (
    s.includes("multimodal") ||
    s.includes("vision") ||
    (s.includes("image") && s.includes("not supported"))
  ) {
    return "⚠ This model does not support images.\n\nSnapSolve sends a screenshot, so a vision-capable model is required.\n\n→ Open Settings → select a model with 'vision', 'vl', or 'llava' in the name.";
  }

  if (s.includes("no provider") || s.includes("not configured")) {
    return "⚠ No provider configured.\n\n→ Click the SnapSolve extension icon → Options → set up your API key and model.";
  }

  if (
    s.includes("quota") ||
    s.includes("billing") ||
    s.includes("insufficient_quota")
  ) {
    return "⚠ API quota exceeded.\n\nYour account has run out of credits with this provider.\n\n→ Check your billing dashboard, or switch to a free-tier provider like Groq.";
  }

  return `⚠ API Error\n\n${raw}\n\n→ Open Settings and verify your provider, key, and model are correct.`;
}

// Display the answer in the card
function displayAnswer(text, isError) {
  const skeleton = document.querySelector("#snapsolve-skeleton");
  const answer = document.querySelector("#snapsolve-answer");
  const loadingDot = document.querySelector("#snapsolve-loading-dot");

  if (!skeleton || !answer || !loadingDot) return;

  // Remove loading dot
  if (loadingDot.parentNode) {
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

  showAnswerCard(rect, config);

  chrome.runtime.sendMessage(
    { action: "captureAndQuery", rect },
    (response) => {
      if (chrome.runtime.lastError) {
        displayAnswer(
          "⚠ Extension error: " + chrome.runtime.lastError.message,
          true,
        );
        return;
      }

      if (response && response.error) {
        displayAnswer("⚠ " + response.error, true);
      } else if (response && response.answer) {
        displayAnswer(response.answer, false);
      }
    },
  );
}
