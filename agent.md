# SnapSolve — Agent Build Instructions
> **For:** OpenCode AI Coding Agent (NVIDIA NIM · Qwen 3 Coder 480B)
> **Rate Limit:** 40 API calls/min — each stage is scoped to stay well within this
> **Rule:** Complete one full stage, then STOP and wait for human confirmation before starting the next

---

## What We Are Building

A Chromium browser extension called **SnapSolve** that:
- Activates on `Ctrl+Shift+E` and turns the cursor into a crosshair
- Lets the user drag a selection box over any on-screen question
- Captures that screen region as a base64 image
- Sends it to any AI vision model via a universal API connector
- Displays the answer inside a draggable, styled floating card with a YouTube-style skeleton loading animation

It is a **Bring Your Own Key (BYOK)** tool. Users configure their own provider (OpenAI, Anthropic, Google Gemini, NVIDIA NIM, Ollama, or any custom OpenAI-compatible endpoint) from a settings page.

**No build tools. No npm. No bundler. Pure HTML, CSS, and vanilla JavaScript only.**

---

## Exact Folder Structure to Create

```
snap-solve/
├── manifest.json
├── background.js
├── content.js
├── content.css
├── settings/
│   ├── settings.html
│   └── settings.js
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

> **Icon note:** For icons, create simple 16×16, 48×48, and 128×128 plain colored PNG placeholders using a canvas script OR instruct the human to drop any PNG into the icons/ folder and rename it. Do NOT attempt to fetch icons from the internet.

---

## Provider Reference Table

The extension must support these providers. Study this table before writing any API code.

| Provider Name | Base URL | Auth Header | API Format | Vision Support |
|---|---|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `Authorization: Bearer {key}` | OpenAI Chat | ✅ gpt-4o |
| NVIDIA NIM | `https://integrate.api.nvidia.com/v1` | `Authorization: Bearer {key}` | OpenAI Chat | ✅ nvidia/llama-3.2-90b-vision |
| Ollama (local) | `http://localhost:11434/v1` | None required | OpenAI Chat | ✅ llava, gemma3 |
| OpenRouter | `https://openrouter.ai/api/v1` | `Authorization: Bearer {key}` | OpenAI Chat | ✅ |
| Groq | `https://api.groq.com/openai/v1` | `Authorization: Bearer {key}` | OpenAI Chat | ✅ |
| Anthropic | `https://api.anthropic.com/v1` | `x-api-key: {key}` + `anthropic-version: 2023-06-01` | **Custom** | ✅ claude-sonnet-4-5 |
| Google Gemini | `https://generativelanguage.googleapis.com` | `?key={key}` in URL | **Custom** | ✅ gemini-1.5-flash |
| Custom | User-defined | `Authorization: Bearer {key}` | OpenAI Chat | Depends on model |

**Critical implementation note:**
- All providers EXCEPT Anthropic and Google use the **identical** OpenAI Chat Completions format
- Anthropic uses `/v1/messages` with `content` as an array and a different auth header
- Google uses `/v1beta/models/{model}:generateContent` with key as a URL query param
- The code must route to the correct formatter based on the selected provider name

---

## Stage 1 — Project Scaffold & Manifest

### 📋 What This Stage Does (For Human)
This stage creates the folder skeleton and the `manifest.json` file which is the "ID card" of the extension. It tells Chrome what the extension is named, what pages it can run on, what permissions it needs, and which files do what. Nothing visual will appear yet.

### 🤖 Agent Instructions

Create the folder `snap-solve/` and all sub-folders. Then create `manifest.json` with EXACTLY this specification:

**`manifest.json` must include:**
- `manifest_version`: 3
- `name`: "SnapSolve"
- `version`: "1.0.0"
- `description`: "Instantly solve on-screen questions using your own AI API key"
- `permissions`: `["storage", "activeTab", "scripting", "tabs"]`
- `host_permissions`: `["<all_urls>", "http://localhost/*", "http://127.0.0.1/*"]`
  - The localhost entries are MANDATORY for Ollama support
- `background`: service worker pointing to `background.js`
- `content_scripts`: array with one entry:
  - `matches`: `["<all_urls>"]`
  - `js`: `["content.js"]`
  - `css`: `["content.css"]`
  - `run_at`: `"document_idle"`
- `action`: popup set to `null` (no popup — we use a settings page instead)
- `options_page`: `"settings/settings.html"`
- `commands`: one command named `"activate-snapper"`:
  - `suggested_key`: `{ "default": "Ctrl+Shift+E", "mac": "Command+Shift+E" }`
  - `description`: "Activate SnapSolve region selector"
- `icons`: pointing to all three icon sizes in `icons/`
- `web_accessible_resources`: empty array (placeholder for future use)

Create placeholder icon files. Generate a minimal valid 1×1 transparent PNG as a placeholder for all three icon files using a base64 data URI written directly to file via a small Node.js or Python snippet — OR clearly comment in the file that the human must add PNG files manually.

### ✅ Stage 1 Test

**Human action:** Go to `chrome://extensions`, enable Developer Mode (top right toggle), click "Load Unpacked", select the `snap-solve/` folder.

**Expected result:**
- Extension appears in the list with name "SnapSolve"
- No red error banners appear
- A small puzzle/placeholder icon appears in the Chrome toolbar
- Clicking the SnapSolve icon in the extensions list → "Details" should show permissions: Read and change all your data on all websites

**If errors appear:** Most likely cause is a typo in `manifest.json`. Validate JSON at jsonlint.com.

---

## Stage 2 — Settings Page UI (HTML + CSS only)

### 📋 What This Stage Does (For Human)
This stage builds the settings page where users configure their AI provider. Right-click the extension icon → "Options" will open this page. No JavaScript logic yet — just the visual layout and form fields.

### 🤖 Agent Instructions

Create `settings/settings.html` as a complete self-contained HTML file with inline `<style>` CSS (no external CSS file for settings). Do NOT link to settings.js yet in this stage.

**Visual layout must include:**

**Header section:**
- SnapSolve logo text + subtitle "Configure your AI provider"
- Dark theme: background `#0f0f13`, card background `#1a1a24`, text `#e8e8f0`
- Accent color: `#7c6af7` (purple)

**Provider selector section:**
A styled `<select>` dropdown with these exact option values and labels:
```
value=""           → label: "— Select a Provider —"  (disabled, selected by default)
value="openai"     → label: "OpenAI"
value="anthropic"  → label: "Anthropic"
value="google"     → label: "Google Gemini"
value="nvidia"     → label: "NVIDIA NIM"
value="ollama"     → label: "Ollama (Local)"
value="openrouter" → label: "OpenRouter"
value="groq"       → label: "Groq"
value="custom"     → label: "Custom / Other"
```

**Dynamic fields section** (all hidden by default via `display:none`, will be shown by JS later):
- `#field-baseurl` — div containing label "Base URL" + text input `id="input-baseurl"` with placeholder `"https://api.example.com/v1"`
- `#field-apikey` — div containing label "API Key" + password input `id="input-apikey"` with placeholder `"Paste your API key here"`
- `#field-model` — div containing label "Model Name" + text input `id="input-model"` with placeholder `"e.g. gpt-4o, llama-3.2, gemini-1.5-flash"`
- `#field-ollama-notice` — a styled info box (blue tint) with text: "Ollama runs locally. Make sure Ollama Desktop is open. No API key is required."

**Save button:**
- `id="btn-save"`, text "Save Configuration", full width, purple background

**Status message:**
- `id="status-msg"`, hidden by default, shows confirmation or error text

**Keyboard shortcut reminder:**
- A small info card at the bottom: "After saving, press **Ctrl+Shift+E** on any page to activate SnapSolve"

**CSS requirements:**
- Smooth `transition: all 0.2s ease` on all inputs and buttons
- Input focus ring: `outline: 2px solid #7c6af7`
- Button hover: slightly lighter purple, subtle `transform: translateY(-1px)`
- Page max-width: 480px, centered
- Font: system-ui, -apple-system, sans-serif

### ✅ Stage 2 Test

**Human action:** Right-click the SnapSolve icon in Chrome toolbar → "Options". (If no icon, go to `chrome://extensions` → SnapSolve → "Extension options")

**Expected result:**
- Dark-themed settings page opens in a new tab
- Provider dropdown is visible and shows placeholder text
- All input fields are hidden (only the dropdown is visible)
- Save button is visible but nothing happens when clicked (JS not added yet)
- Page looks clean, no layout overflow

---

## Stage 3 — Settings Page Logic (JavaScript)

### 📋 What This Stage Does (For Human)
This stage adds the JavaScript brain to the settings page. It handles: showing/hiding the correct fields based on which provider is selected, auto-filling known provider URLs, saving the configuration to Chrome's local storage, and loading saved config when the page reopens.

### 🤖 Agent Instructions

Create `settings/settings.js` and link it to `settings.html` with `<script src="settings.js"></script>` before `</body>`.

**The JS file must implement all of the following:**

**1. Provider presets object:**
```javascript
const PROVIDER_PRESETS = {
  openai:     { baseUrl: "https://api.openai.com/v1",                    needsKey: true,  modelHint: "gpt-4o" },
  anthropic:  { baseUrl: "https://api.anthropic.com/v1",                 needsKey: true,  modelHint: "claude-sonnet-4-5" },
  google:     { baseUrl: "https://generativelanguage.googleapis.com",     needsKey: true,  modelHint: "gemini-1.5-flash" },
  nvidia:     { baseUrl: "https://integrate.api.nvidia.com/v1",           needsKey: true,  modelHint: "nvidia/llama-3.2-90b-vision-instruct" },
  ollama:     { baseUrl: "http://localhost:11434/v1",                     needsKey: false, modelHint: "llava" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1",                  needsKey: true,  modelHint: "openai/gpt-4o" },
  groq:       { baseUrl: "https://api.groq.com/openai/v1",               needsKey: true,  modelHint: "llama-3.2-90b-vision-preview" },
  custom:     { baseUrl: "",                                               needsKey: true,  modelHint: "" }
}
```

**2. On provider dropdown change:**
- Read selected value
- If value is empty string: hide all fields, return
- Look up preset for the selected provider
- Show `#field-baseurl`: set `input-baseurl` value to `preset.baseUrl`
- If `preset.needsKey === true`: show `#field-apikey`, hide `#field-ollama-notice`
- If `preset.needsKey === false` (Ollama): hide `#field-apikey`, show `#field-ollama-notice`
- Show `#field-model`: set `input-model` placeholder to `"e.g. " + preset.modelHint`
- If provider is `"custom"`: make `input-baseurl` editable and clear it

**3. Save button click handler:**
- Validate: if no provider selected → show error in `#status-msg`: "Please select a provider"
- Validate: if provider requires key and key is empty → show error: "API key is required for this provider"
- Validate: if model name is empty → show error: "Please enter a model name"
- If all valid: call `chrome.storage.local.set()` with object:
  ```javascript
  {
    snapsolve_config: {
      provider: <selected provider value>,
      baseUrl: <input-baseurl value>,
      apiKey: <input-apikey value>,
      model: <input-model value>
    }
  }
  ```
- On success callback: set `#status-msg` text to "✓ Configuration saved!" in green, visible for 3 seconds then hide

**4. On page load (`DOMContentLoaded`):**
- Call `chrome.storage.local.get("snapsolve_config")`
- If config exists:
  - Set dropdown to `config.provider`
  - Manually trigger the change event to show/populate fields
  - Set `input-baseurl` to `config.baseUrl`
  - Set `input-apikey` to `config.apiKey`
  - Set `input-model` to `config.model`

### ✅ Stage 3 Test

**Human action:** Open settings page (right-click extension icon → Options).

**Test A — Field visibility:**
- Select "OpenAI" from dropdown
- Expected: Base URL auto-fills to `https://api.openai.com/v1`, API Key field appears, Model field appears with hint text

**Test B — Ollama special case:**
- Select "Ollama (Local)"
- Expected: Base URL fills to `http://localhost:11434/v1`, API Key field is HIDDEN, blue notice box appears, Model field shows

**Test C — Save and reload:**
- Select "NVIDIA NIM", enter a fake key `test-key-123`, enter model `nvidia/llama-3.2-90b-vision-instruct`, click Save
- Expected: Green "✓ Configuration saved!" message appears
- Refresh the settings page
- Expected: All fields are re-populated with the saved values automatically

**Test D — Validation:**
- Select "OpenAI", leave API key empty, click Save
- Expected: Error message "API key is required for this provider" appears, nothing saved

---

## Stage 4 — Content Script: Keyboard Trigger & Screen Overlay

### 📋 What This Stage Does (For Human)
This is the core interaction layer. When you press `Ctrl+Shift+E` on any webpage, this script activates. It darkens the entire page and turns your cursor into a crosshair, ready for you to drag a selection box. This stage only handles the overlay and selection rectangle — no screenshot or card yet.

### 🤖 Agent Instructions

Create `content.js`. This script is injected into every page the user visits.

**State variables at the top:**
```javascript
let isActive = false;
let startX = 0, startY = 0, endX = 0, endY = 0;
let overlayEl = null;
let selectionEl = null;
let isDragging = false;
```

**1. Listen for the keyboard command from background:**
```javascript
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "activate") {
    if (!isActive) activateOverlay();
  }
});
```

**2. `activateOverlay()` function:**
- Set `isActive = true`
- Create a `div` element, assign id `snapsolve-overlay`
- Set styles directly on the element (NOT via class, to avoid site CSS conflicts):
  - `position: fixed`, `top: 0`, `left: 0`, `width: 100vw`, `height: 100vh`
  - `background: rgba(0,0,0,0.45)`
  - `z-index: 2147483646` (near max z-index)
  - `cursor: crosshair`
  - `user-select: none`
- Append to `document.body`
- Store reference in `overlayEl`
- Add event listeners to `overlayEl`: `mousedown`, `mousemove`, `mouseup`
- Add `keydown` listener to `document` for Escape key → calls `deactivateOverlay()`

**3. `mousedown` handler on overlay:**
- Prevent default
- Set `isDragging = true`
- Record `startX = e.clientX`, `startY = e.clientY`
- Create a `div` for the selection box, id `snapsolve-selection`
- Styles: `position: fixed`, `border: 2px solid #7c6af7`, `background: rgba(124,106,247,0.12)`, `z-index: 2147483647`, `pointer-events: none`
- Set initial position: `left: startX px`, `top: startY px`, `width: 0`, `height: 0`
- Append to `document.body`, store in `selectionEl`

**4. `mousemove` handler on overlay:**
- If not `isDragging`, return
- Calculate `currentX = e.clientX`, `currentY = e.clientY`
- Calculate box: `left = Math.min(startX, currentX)`, `top = Math.min(startY, currentY)`
- Calculate `width = Math.abs(currentX - startX)`, `height = Math.abs(currentY - startY)`
- Update `selectionEl` styles with new left/top/width/height

**5. `mouseup` handler on overlay:**
- If not `isDragging`, return
- Set `isDragging = false`
- Record `endX = e.clientX`, `endY = e.clientY`
- Calculate final selection rect:
  ```javascript
  const rect = {
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY)
  };
  ```
- If `rect.width < 10 || rect.height < 10`: call `deactivateOverlay()` and return (accidental click)
- Call `deactivateOverlay()` (remove overlay)
- Call `captureAndSolve(rect)` (defined in Stage 6)

**6. `deactivateOverlay()` function:**
- Set `isActive = false`
- Remove `overlayEl` from DOM if it exists, set to null
- Remove `selectionEl` from DOM if it exists, set to null
- Remove the Escape key listener from document

### ✅ Stage 4 Test

**Human action:** Reload the extension at `chrome://extensions` (click the refresh icon on the SnapSolve card). Open any webpage (e.g., google.com). Press `Ctrl+Shift+E`.

> **Note:** The keyboard shortcut will NOT work yet because the background.js command listener hasn't been built. For this stage only, temporarily add this code directly at the top of content.js for testing, then REMOVE it after testing:
> ```javascript
> // TEMP TEST ONLY - REMOVE AFTER STAGE 4 TEST
> document.addEventListener('keydown', (e) => {
>   if (e.ctrlKey && e.shiftKey && e.key === 'E') activateOverlay();
> });
> ```

**Expected result:**
- Page darkens with semi-transparent overlay
- Cursor becomes a crosshair
- Clicking and dragging shows a purple selection rectangle
- Releasing mouse removes the overlay (nothing else happens yet — no card, no API call)
- Pressing Escape while overlay is active dismisses it cleanly
- Small drag (under 10px) dismisses without doing anything

**Remove the temporary keydown listener before proceeding to Stage 5.**

---

## Stage 5 — Answer Card UI (Skeleton + Result Display)

### 📋 What This Stage Does (For Human)
This stage builds the floating answer card that appears after you make a selection. It first shows a skeleton loading animation (pulsing placeholder lines, like YouTube's loading state), then transitions to displaying the actual AI answer. The card is draggable anywhere on the screen.

### 🤖 Agent Instructions

**Part A: Add card creation to `content.js`**

Add a function `showAnswerCard(rect)` that creates and injects the card immediately when called (before the API responds):

**Card HTML structure to build programmatically:**
```
div#snapsolve-card
  div#snapsolve-card-header
    div.snapsolve-provider-badge  ← shows "● ProviderName · ModelName"
    button#snapsolve-close        ← "✕" close button
  div#snapsolve-card-body
    div#snapsolve-skeleton         ← visible initially
      div.skeleton-line.long
      div.skeleton-line.medium
      div.skeleton-line.long
      div.skeleton-line.short
    div#snapsolve-answer           ← hidden initially, shown when answer arrives
```

**Card positioning logic:**
- Default position: 20px from right edge of viewport, 20px from top
- If the selection box `rect` is in the right half of screen: position card on the LEFT side
- If the selection box is in the left half: position card on the RIGHT side
- This prevents the card from covering the question the user just selected
- Card width: 360px, max-height: 500px, overflow-y: auto

**Dragging logic on the card:**
- Attach `mousedown` on `#snapsolve-card-header` only
- Track `mousemove` and `mouseup` on `document` while dragging
- Update card `left` and `top` CSS values
- Set `user-select: none` on body while dragging, restore after

**Add function `displayAnswer(text)` to `content.js`:**
- Hide `#snapsolve-skeleton` (set display none)
- Show `#snapsolve-answer` (set display block)
- Render the text with basic markdown processing:
  - Replace `**text**` → `<strong>text</strong>`
  - Replace `*text*` → `<em>text</em>`
  - Replace lines starting with `- ` → wrap in `<ul><li>` structure
  - Replace `` `code` `` → `<code>code</code>`
  - Replace `\n\n` with `</p><p>` and wrap whole content in `<p>` tags
- Set the processed HTML as `innerHTML` of `#snapsolve-answer`

**Add a placeholder `captureAndSolve(rect)` function for now:**
```javascript
async function captureAndSolve(rect) {
  showAnswerCard(rect);
  // API logic will be added in Stage 6
}
```

**Part B: Add all styles to `content.css`**

Write the complete CSS for both the overlay and the card. Use CSS custom properties at the top:

```css
:root {
  --ss-bg: #1a1a24;
  --ss-surface: #22222f;
  --ss-border: #2e2e3f;
  --ss-text: #e8e8f0;
  --ss-text-muted: #888899;
  --ss-accent: #7c6af7;
  --ss-radius: 12px;
  --ss-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3);
}
```

**Card CSS requirements:**
- `#snapsolve-card`: fixed position, width 360px, background `var(--ss-bg)`, border `1px solid var(--ss-border)`, border-radius `var(--ss-radius)`, box-shadow `var(--ss-shadow)`, z-index `2147483647`, font-family `system-ui, -apple-system, sans-serif`, font-size `14px`, color `var(--ss-text)`, entrance animation (see below)
- `#snapsolve-card-header`: display flex, justify-content space-between, align-items center, padding `10px 14px`, background `var(--ss-surface)`, border-bottom `1px solid var(--ss-border)`, border-radius `var(--ss-radius) var(--ss-radius) 0 0`, cursor grab
- `.snapsolve-provider-badge`: font-size 11px, color `var(--ss-text-muted)`, letter-spacing 0.3px
- `#snapsolve-close`: background none, border none, color `var(--ss-text-muted)`, cursor pointer, font-size 16px, padding `2px 6px`, border-radius 4px — on hover: color white, background `rgba(255,255,255,0.1)`
- `#snapsolve-card-body`: padding 16px, min-height 80px, max-height 440px, overflow-y auto
- `#snapsolve-answer`: line-height 1.65, color `var(--ss-text)` — `p` margins, `strong` color white, `code` background `var(--ss-surface)` with 4px border-radius and padding `2px 5px`, `ul` left padding

**Skeleton CSS requirements:**
```css
.skeleton-line {
  height: 12px;
  background: linear-gradient(90deg, var(--ss-surface) 25%, #2e2e45 50%, var(--ss-surface) 75%);
  background-size: 200% 100%;
  animation: snapsolve-shimmer 1.5s infinite;
  border-radius: 6px;
  margin-bottom: 10px;
}
.skeleton-line.long   { width: 92%; }
.skeleton-line.medium { width: 68%; }
.skeleton-line.short  { width: 45%; }

@keyframes snapsolve-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

**Entrance animation:**
```css
@keyframes snapsolve-enter {
  from { opacity: 0; transform: translateY(10px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
#snapsolve-card {
  animation: snapsolve-enter 0.2s ease-out forwards;
}
```

**Scrollbar in card body:**
```css
#snapsolve-card-body::-webkit-scrollbar { width: 5px; }
#snapsolve-card-body::-webkit-scrollbar-track { background: transparent; }
#snapsolve-card-body::-webkit-scrollbar-thumb { background: var(--ss-border); border-radius: 3px; }
```

**Prefix ALL selectors with `#snapsolve-card` or use `snapsolve-` prefix on all class names** to avoid conflicts with host page styles. Never use generic class names like `.card`, `.header`, `.body`.

### ✅ Stage 5 Test

**Human action:** Reload extension. Open any webpage. Temporarily add the test keydown listener again (from Stage 4 temp code), activate overlay, make a selection.

**Expected result:**
- Card slides in from bottom-right with smooth animation
- Provider badge shows placeholder text (e.g., "● Not configured")
- Skeleton shows 4 pulsing lines with left-to-right shimmer animation identical to YouTube loading cards
- Dragging the card header moves the card freely around the screen
- Clicking ✕ removes the card from the DOM
- Card does NOT appear over the selection area (it positions itself to the opposite side)

**Remove the temporary keydown listener after testing.**

---

## Stage 6 — Background Service Worker & API Integration

### 📋 What This Stage Does (For Human)
This is the engine. The background script does two things: (1) listens for the keyboard shortcut and tells the content script to activate, and (2) takes a screenshot of the tab, crops it to the selection area, and sends it to the AI API. All actual API calls happen here (not in content.js) because only the background script has permission to make cross-origin requests in Manifest V3.

### 🤖 Agent Instructions

Create `background.js`.

**Part 1: Keyboard shortcut listener**
```javascript
chrome.commands.onCommand.addListener((command) => {
  if (command === "activate-snapper") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "activate" });
      }
    });
  }
});
```

**Part 2: Message listener for capture + API call**

Listen for messages from content.js:
```javascript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "captureAndQuery") {
    handleCaptureAndQuery(message.rect, sender.tab.id, sendResponse);
    return true; // keeps message channel open for async response
  }
});
```

**Part 3: `handleCaptureAndQuery(rect, tabId, sendResponse)` function**

```javascript
async function handleCaptureAndQuery(rect, tabId, sendResponse) {
  try {
    // Step 1: Capture the full visible tab as a data URL
    const screenshotDataUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });
    
    // Step 2: Crop to the selection rect using OffscreenCanvas
    const croppedBase64 = await cropImage(screenshotDataUrl, rect);
    
    // Step 3: Load config from storage
    const result = await chrome.storage.local.get("snapsolve_config");
    const config = result.snapsolve_config;
    
    if (!config || !config.provider) {
      sendResponse({ error: "No provider configured. Please open SnapSolve settings." });
      return;
    }
    
    // Step 4: Call correct API based on provider
    const answer = await callAI(config, croppedBase64);
    sendResponse({ answer });
    
  } catch (err) {
    sendResponse({ error: err.message || "An unknown error occurred." });
  }
}
```

**Part 4: `cropImage(dataUrl, rect)` function**

Use `OffscreenCanvas` (available in service workers in Chrome 86+):
```javascript
async function cropImage(dataUrl, rect) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const imageBitmap = await createImageBitmap(blob);
  
  // Account for device pixel ratio by checking image vs rect dimensions
  const scaleX = imageBitmap.width / window.screen.width;
  const scaleY = imageBitmap.height / window.screen.height;
  // Note: In service worker, window.screen is unavailable. Use a fixed scale of 1 for now.
  // The actual pixel ratio will be handled by passing it from content.js (see below)
  
  const canvas = new OffscreenCanvas(
    Math.round(rect.width * rect.devicePixelRatio),
    Math.round(rect.height * rect.devicePixelRatio)
  );
  const ctx = canvas.getContext("2d");
  ctx.drawImage(
    imageBitmap,
    Math.round(rect.x * rect.devicePixelRatio),
    Math.round(rect.y * rect.devicePixelRatio),
    Math.round(rect.width * rect.devicePixelRatio),
    Math.round(rect.height * rect.devicePixelRatio),
    0, 0,
    Math.round(rect.width * rect.devicePixelRatio),
    Math.round(rect.height * rect.devicePixelRatio)
  );
  
  const outputBlob = await canvas.convertToBlob({ type: "image/png" });
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]); // base64 only
    reader.readAsDataURL(outputBlob);
  });
}
```

> **Important:** Update `content.js` to include `devicePixelRatio` in the rect object sent to background:
> In the `captureAndSolve(rect)` function, when sending the message, add `rect.devicePixelRatio = window.devicePixelRatio || 1`

**Part 5: `callAI(config, base64Image)` function**

Implement provider routing:

```javascript
async function callAI(config, base64Image) {
  const { provider, baseUrl, apiKey, model } = config;
  
  if (provider === "anthropic") {
    return await callAnthropic(baseUrl, apiKey, model, base64Image);
  } else if (provider === "google") {
    return await callGoogle(baseUrl, apiKey, model, base64Image);
  } else {
    // All other providers: OpenAI-compatible format
    return await callOpenAICompatible(baseUrl, apiKey, model, base64Image);
  }
}
```

**Part 6: `callOpenAICompatible(baseUrl, apiKey, model, base64Image)` function**

```javascript
async function callOpenAICompatible(baseUrl, apiKey, model, base64Image) {
  const url = `${baseUrl}/chat/completions`;
  const headers = { "Content-Type": "application/json" };
  if (apiKey && apiKey.trim() !== "") {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  
  const body = {
    model: model,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:image/png;base64,${base64Image}` }
          },
          {
            type: "text",
            text: "Look at this image carefully. It contains a question or problem. Please provide the correct answer clearly and concisely. If it is multiple choice, state the correct option letter and explain why briefly."
          }
        ]
      }
    ]
  };
  
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API Error ${response.status}: ${errText}`);
  }
  
  const data = await response.json();
  return data.choices[0].message.content;
}
```

**Part 7: `callAnthropic(baseUrl, apiKey, model, base64Image)` function**

```javascript
async function callAnthropic(baseUrl, apiKey, model, base64Image) {
  const url = `${baseUrl}/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: base64Image
              }
            },
            {
              type: "text",
              text: "Look at this image carefully. It contains a question or problem. Please provide the correct answer clearly and concisely. If it is multiple choice, state the correct option letter and explain why briefly."
            }
          ]
        }
      ]
    })
  });
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API Error ${response.status}: ${errText}`);
  }
  
  const data = await response.json();
  return data.content[0].text;
}
```

**Part 8: `callGoogle(baseUrl, apiKey, model, base64Image)` function**

```javascript
async function callGoogle(baseUrl, apiKey, model, base64Image) {
  const url = `${baseUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              inline_data: {
                mime_type: "image/png",
                data: base64Image
              }
            },
            {
              text: "Look at this image carefully. It contains a question or problem. Please provide the correct answer clearly and concisely. If it is multiple choice, state the correct option letter and explain why briefly."
            }
          ]
        }
      ]
    })
  });
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google API Error ${response.status}: ${errText}`);
  }
  
  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}
```

### ✅ Stage 6 Test

**Human action:** Reload extension. Open settings, configure with a real API key and provider. Then open any page with visible text/questions.

**Test A — Shortcut works:**
- Press `Ctrl+Shift+E`
- Expected: Overlay appears (dark screen + crosshair)

**Test B — End-to-end flow:**
- Draw a selection around a visible question or any text on screen
- Expected sequence:
  1. Overlay disappears immediately
  2. Card slides in with skeleton animation (within ~0.5 seconds)
  3. Within 3-10 seconds, skeleton is replaced by the AI's actual answer text
  4. Provider badge shows the configured provider name and model

**Test C — Error handling:**
- Temporarily set an invalid API key in settings
- Draw a selection
- Expected: Card appears with skeleton, then shows an error message in red text instead of an answer (e.g., "API Error 401: Unauthorized")

**Test D — Ollama (if installed):**
- Set provider to Ollama, model to `llava`, open `http://localhost:11434` in browser first to confirm it's running
- Draw a selection
- Expected: Works without an API key

---

## Stage 7 — Content Script: Wire Up `captureAndSolve`

### 📋 What This Stage Does (For Human)
This short stage connects the content script to the background script, completing the full pipeline. It also updates the provider badge on the card with real data, and handles error display in the card.

### 🤖 Agent Instructions

Update `content.js`:

**1. Replace the placeholder `captureAndSolve(rect)` function with:**

```javascript
async function captureAndSolve(rect) {
  // Add device pixel ratio to the rect
  rect.devicePixelRatio = window.devicePixelRatio || 1;
  
  // Load config to show provider badge immediately
  const configResult = await chrome.storage.local.get("snapsolve_config");
  const config = configResult.snapsolve_config;
  
  // Show the card with skeleton
  const card = showAnswerCard(rect, config);
  
  // Send to background for screenshot + API call
  chrome.runtime.sendMessage(
    { action: "captureAndQuery", rect: rect },
    (response) => {
      if (chrome.runtime.lastError) {
        displayAnswer("⚠ Extension error: " + chrome.runtime.lastError.message, true);
        return;
      }
      if (response.error) {
        displayAnswer("⚠ " + response.error, true);
      } else {
        displayAnswer(response.answer, false);
      }
    }
  );
}
```

**2. Update `showAnswerCard(rect, config)` signature** to accept config and populate the badge:
- If config exists: badge text = `"● ${config.provider.toUpperCase()} · ${config.model}"`
- If no config: badge text = `"● Not configured — open Settings"`

**3. Update `displayAnswer(text, isError)` signature** to handle the `isError` flag:
- If `isError === true`: set `#snapsolve-answer` text color to `#ff6b6b` (red), do not process markdown, set as `textContent` not `innerHTML`
- If `isError === false`: normal markdown rendering as described in Stage 5

### ✅ Stage 7 Test (Full End-to-End)

This is the final integration test. Run all of these:

**Test 1 — Happy Path (most important):**
- Reload extension
- Go to any webpage with a question (a Google Form quiz, a trivia site, etc.)
- Press `Ctrl+Shift+E`
- Draw a box around the question
- **Expected:** Card appears → skeleton pulses → answer replaces skeleton → badge shows provider + model name

**Test 2 — No Config:**
- Clear settings (open settings, change to blank, don't save)
- Try to capture something
- **Expected:** Card appears with red error text "No provider configured. Please open SnapSolve settings."

**Test 3 — Card stays on top:**
- Scroll the page after capturing
- **Expected:** Card stays fixed in position (it is `position: fixed`)

**Test 4 — Multiple captures:**
- Make a capture, get an answer, then press `Ctrl+Shift+E` again
- **Expected:** New selection works, a second card or the first card is replaced (decide: either close previous card before showing new one, OR allow multiple cards — implement the simpler option: always close the previous card before creating a new one)

---

## Stage 8 — Polish & Edge Cases

### 📋 What This Stage Does (For Human)
Final cleanup: handles edge cases that would frustrate real users, and adds small quality-of-life details.

### 🤖 Agent Instructions

Implement these specific improvements:

**1. Close previous card on new activation (in content.js):**
```javascript
// At top of content.js add:
let activeCard = null;

// In showAnswerCard(), before creating a new card:
if (activeCard && activeCard.parentNode) {
  activeCard.parentNode.removeChild(activeCard);
}
// After creating card, set: activeCard = cardElement
```

**2. Prevent extension from activating inside input fields:**
In the `activate` message listener, before calling `activateOverlay()`:
```javascript
const focused = document.activeElement;
const isInput = focused && (
  focused.tagName === "INPUT" ||
  focused.tagName === "TEXTAREA" ||
  focused.isContentEditable
);
if (isInput) focused.blur(); // unfocus first, then activate
```

**3. Add a loading indicator to the card header while skeleton is showing:**
In the header, add a small pulsing dot next to the provider badge while loading:
- Add a `span#snapsolve-loading-dot` with CSS `animation: pulse 1s infinite` next to the badge
- Remove the dot when `displayAnswer()` is called

**4. Handle very small selections gracefully:**
Already handled in Stage 4 (minimum 10×10px check). Confirm this check exists.

**5. Ensure the card is always fully on-screen:**
After calculating card position, clamp it:
- `left` must be between `10` and `window.innerWidth - 380`
- `top` must be between `10` and `window.innerHeight - 100`

**6. Add a keyboard shortcut hint to the card header:**
Below the close button in settings.html, the reminder is already there (from Stage 2). Confirm it says `Ctrl+Shift+E` or `Cmd+Shift+E` on Mac.

### ✅ Stage 8 Test

**Test 1 — Multiple cards:**
- Make 3 rapid captures in a row
- Expected: Only 1 card visible at a time (previous card closes when new selection starts)

**Test 2 — Card boundary:**
- On a page, scroll to the very bottom-right and make a selection in the corner
- Expected: Card never goes off-screen — it stays within the viewport

**Test 3 — Input field focus:**
- Click inside a search bar on any site, then press `Ctrl+Shift+E`
- Expected: The bar loses focus but the overlay still activates normally (does not type into the search bar)

---

## Final Checklist Before Delivery

The agent must verify each of these is true before declaring the project complete:

- [ ] Extension loads in Chrome with zero errors in `chrome://extensions`
- [ ] No errors appear in background script console (`chrome://extensions` → SnapSolve → "Service Worker" inspect link)
- [ ] No errors appear in page console (F12) after activation
- [ ] `Ctrl+Shift+E` activates overlay on any `http://` and `https://` page
- [ ] Overlay does NOT activate on `chrome://` pages (this is a Chrome security restriction, expected behavior)
- [ ] Skeleton animation matches the visual style described (shimmer, left-to-right)
- [ ] Card is draggable by its header
- [ ] Card closes cleanly with ✕ button
- [ ] Provider badge updates correctly with saved config
- [ ] Error messages display in red, answers in normal color
- [ ] Settings page saves and reloads correctly
- [ ] Ollama field hides API key input and shows the notice box
- [ ] All provider presets auto-fill the base URL

---

## Rate Limit Guidance for Agent

> With NVIDIA NIM at 40 calls/minute, follow these rules:
> - Each stage is designed to be completable in **5–8 generation calls** at most
> - After generating a large file (like `background.js`), PAUSE before immediately generating another large file
> - If you hit a rate limit error, wait 60 seconds and resume from where you stopped
> - Do NOT regenerate files that were already created correctly — only create or edit what the current stage requires
> - If you are unsure about a small detail, make a reasonable decision and add an inline comment rather than making another API call to ask

---

## Technology Stack Summary

| Concern | Technology |
|---|---|
| Extension platform | Chrome Manifest V3 |
| Languages | Vanilla JS, HTML5, CSS3 — NO frameworks, NO bundlers |
| Screenshot capture | `chrome.tabs.captureVisibleTab()` (built-in Chrome API) |
| Image cropping | `OffscreenCanvas` + `createImageBitmap()` (built-in) |
| Storage | `chrome.storage.local` (built-in, persists across sessions) |
| API calls | Native `fetch()` in background.js |
| Markdown rendering | Custom regex-based mini-renderer (no external library) |
| Styling isolation | All classes prefixed with `snapsolve-` to prevent host-page CSS conflicts |
