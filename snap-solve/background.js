// Listen for the keyboard shortcut
chrome.commands.onCommand.addListener((command) => {
  if (command === "activate-snapper") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        sendActivateMessage(tabs[0].id);
      }
    });
  }
});

async function sendActivateMessage(tabId) {
  chrome.tabs.sendMessage(tabId, { action: "activate" }, async () => {
    if (chrome.runtime.lastError) {
      const lastErrorMessage = chrome.runtime.lastError.message || "";
      if (lastErrorMessage.includes("Receiving end does not exist")) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ["content.js"],
          });

          chrome.tabs.sendMessage(tabId, { action: "activate" }, () => {
            if (chrome.runtime.lastError) {
              console.warn(
                "SnapSolve activate retry failed:",
                chrome.runtime.lastError.message,
              );
            }
          });
        } catch (err) {
          console.warn("SnapSolve could not inject content script:", err);
        }
      }
    }
  });
}

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "captureAndQuery") {
    // Handle the capture and query action in the background script
    handleCaptureAndQuery(message.rect, sender.tab.id, sendResponse);
    return true; // Keep the message channel open for sendResponse
  }
});

// Function to handle capture and query
async function handleCaptureAndQuery(rect, tabId, sendResponse) {
  try {
    // Capture the full visible tab as a data URL
    const screenshotDataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: "png",
    });

    // Crop to the selection rect using OffscreenCanvas
    const croppedBase64 = await cropImage(screenshotDataUrl, rect);

    // Load config from storage
    const result = await chrome.storage.local.get("snapsolve_config");
    const config = result.snapsolve_config;

    if (!config || !config.provider) {
      sendResponse({
        error: "No provider configured. Please open SnapSolve settings.",
      });
      return;
    }

    // Call the correct API based on provider
    const answer = await callAI(config, croppedBase64);
    sendResponse({ answer });
  } catch (err) {
    sendResponse({ error: err.message || "An unknown error occurred." });
  }
}

// Function to crop image using OffscreenCanvas
async function cropImage(dataUrl, rect) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const imageBitmap = await createImageBitmap(blob);

  // Account for device pixel ratio
  const canvas = new OffscreenCanvas(
    Math.round(rect.width * rect.devicePixelRatio),
    Math.round(rect.height * rect.devicePixelRatio),
  );
  const ctx = canvas.getContext("2d");
  ctx.drawImage(
    imageBitmap,
    Math.round(rect.x * rect.devicePixelRatio),
    Math.round(rect.y * rect.devicePixelRatio),
    Math.round(rect.width * rect.devicePixelRatio),
    Math.round(rect.height * rect.devicePixelRatio),
    0,
    0,
    Math.round(rect.width * rect.devicePixelRatio),
    Math.round(rect.height * rect.devicePixelRatio),
  );

  const outputBlob = await canvas.convertToBlob({ type: "image/png" });
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]); // base64 only
    reader.readAsDataURL(outputBlob);
  });
}

// Call AI function based on provider
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

// Call OpenAI-compatible API
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
            image_url: { url: `data:image/png;base64,${base64Image}` },
          },
          {
            type: "text",
            text: `You are a quiz solver. Look at the question in the image and respond in this exact format:

ANSWER: [option letter + full option text, or direct answer]
WHY: [one sentence explanation only]

Put a blank line between ANSWER and WHY.

No steps. No lists. No extra text. Two lines maximum.`,
          },
        ],
      },
    ],
  };

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API Error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// Call Anthropic API
async function callAnthropic(baseUrl, apiKey, model, base64Image) {
  const url = `${baseUrl}/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
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
                data: base64Image,
              },
            },
            {
              type: "text",
              text: `You are a quiz solver. Look at the question in the image and respond in this exact format:

ANSWER: [option letter + full option text, or direct answer]
WHY: [one sentence explanation only]

Put a blank line between ANSWER and WHY.

No steps. No lists. No extra text. Two lines maximum.`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API Error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

// Call Google API
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
                data: base64Image,
              },
            },
            {
              text: `You are a quiz solver. Look at the question in the image and respond in this exact format:

ANSWER: [option letter + full option text, or direct answer]
WHY: [one sentence explanation only]

Put a blank line between ANSWER and WHY.

No steps. No lists. No extra text. Two lines maximum.`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google API Error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}
