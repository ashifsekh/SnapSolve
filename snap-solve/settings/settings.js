// Provider presets
const PROVIDER_PRESETS = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    needsKey: true,
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
  },
  anthropic: {
    baseUrl: "https://api.anthropic.com/v1",
    needsKey: true,
    models: ["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-4-5"],
  },
  google: {
    baseUrl: "https://generativelanguage.googleapis.com",
    needsKey: true,
    models: ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"],
  },
  nvidia: {
    baseUrl: "https://integrate.api.nvidia.com/v1",
    needsKey: true,
    models: [
      "meta/llama-3.2-90b-vision-instruct",
      "meta/llama-3.2-11b-vision-instruct",
      "microsoft/phi-3.5-vision-instruct",
      "nvidia/llama-3.1-nemotron-70b-instruct",
    ],
  },
  ollama: {
    baseUrl: "http://localhost:11434/v1",
    needsKey: false,
    models: ["llava", "llava:13b", "llava:34b", "llama3.2-vision", "gemma3"],
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    needsKey: true,
    models: [
      "openai/gpt-4o",
      "anthropic/claude-sonnet-4-5",
      "google/gemini-flash-1.5",
      "meta-llama/llama-3.2-90b-vision-instruct",
    ],
  },
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    needsKey: true,
    models: ["meta-llama/llama-4-scout-17b-16e-instruct"],
  },
  custom: {
    baseUrl: "",
    needsKey: true,
    models: [],
  },
};

// DOM elements
const providerSelect = document.getElementById("provider-select");
const fieldBaseurl = document.getElementById("field-baseurl");
const fieldApikey = document.getElementById("field-apikey");
const fieldModel = document.getElementById("field-model");
const fieldOllamaNotice = document.getElementById("field-ollama-notice");
const inputBaseurl = document.getElementById("input-baseurl");
const inputApikey = document.getElementById("input-apikey");
const selectModel = document.getElementById("select-model");
const inputModelCustom = document.getElementById("input-model-custom");
const btnSave = document.getElementById("btn-save");
const statusMsg = document.getElementById("status-msg");

// Event listeners
providerSelect.addEventListener("change", handleProviderChange);
btnSave.addEventListener("click", saveConfiguration);

// Load saved configuration on page load
document.addEventListener("DOMContentLoaded", loadConfiguration);

function handleProviderChange() {
  const selectedProvider = providerSelect.value;

  // Hide all fields initially
  fieldBaseurl.style.display = "none";
  fieldApikey.style.display = "none";
  fieldModel.style.display = "none";
  fieldOllamaNotice.style.display = "none";
  selectModel.style.display = "block";
  inputModelCustom.style.display = "none";

  if (!selectedProvider) return;

  const preset = PROVIDER_PRESETS[selectedProvider];

  // Show base URL field and populate
  fieldBaseurl.style.display = "block";
  inputBaseurl.value = preset.baseUrl;

  // Show API key field or notice based on needsKey
  if (preset.needsKey) {
    fieldApikey.style.display = "block";
    fieldOllamaNotice.style.display = "none";
  } else {
    fieldApikey.style.display = "none";
    fieldOllamaNotice.style.display = "block";
  }

  // Show model field and set placeholder
  fieldModel.style.display = "block";
  populateModelDropdown(selectedProvider);

  // Make base URL editable for custom provider
  if (selectedProvider === "custom") {
    inputBaseurl.value = "";
  }
}

function populateModelDropdown(provider) {
  const select = document.getElementById("select-model");
  const customInput = document.getElementById("input-model-custom");
  const preset = PROVIDER_PRESETS[provider];

  select.innerHTML = ""; // clear old options

  if (!preset || preset.models.length === 0) {
    // Custom provider - hide dropdown, show text input
    select.style.display = "none";
    customInput.style.display = "block";
    return;
  }

  select.style.display = "block";
  customInput.style.display = "none";

  // Add all model options
  preset.models.forEach((m, i) => {
    const opt = document.createElement("option");
    opt.value = m;
    // First model gets a ★ to signal it's recommended
    opt.textContent = i === 0 ? `★ ${m} (recommended)` : m;
    select.appendChild(opt);
  });

  // Always add an "Other" escape hatch at the bottom
  const otherOpt = document.createElement("option");
  otherOpt.value = "__other__";
  otherOpt.textContent = "Other (type manually)...";
  select.appendChild(otherOpt);

  // When user picks "Other", show the text input
  select.onchange = () => {
    if (select.value === "__other__") {
      customInput.style.display = "block";
      customInput.focus();
    } else {
      customInput.style.display = "none";
    }
  };
}

function getSelectedModel() {
  const select = document.getElementById("select-model");
  const customInput = document.getElementById("input-model-custom");
  if (select.style.display === "none" || select.value === "__other__") {
    return customInput.value.trim();
  }
  return select.value;
}

function saveConfiguration() {
  const provider = providerSelect.value;
  const baseUrl = inputBaseurl.value;
  const apiKey = inputApikey.value;
  const model = getSelectedModel();

  // Validation
  if (!provider) {
    showStatus("Please select a provider", "error");
    return;
  }

  const preset = PROVIDER_PRESETS[provider];
  if (preset.needsKey && !apiKey) {
    showStatus("API key is required for this provider", "error");
    return;
  }

  if (!model) {
    showStatus("Please enter a model name", "error");
    return;
  }

  // Save to chrome storage
  const config = {
    provider,
    baseUrl,
    apiKey,
    model,
  };

  chrome.storage.local.set({ snapsolve_config: config }, () => {
    showStatus("✓ Configuration saved!", "success");
    setTimeout(() => {
      statusMsg.style.display = "none";
    }, 3000);
  });
}

function loadConfiguration() {
  chrome.storage.local.get("snapsolve_config", (result) => {
    if (result.snapsolve_config) {
      const config = result.snapsolve_config;

      // Set provider dropdown
      providerSelect.value = config.provider;

      // Trigger change event to show fields
      providerSelect.dispatchEvent(new Event("change"));

      // Populate fields with saved values
      inputBaseurl.value = config.baseUrl;
      inputApikey.value = config.apiKey;
      const select = document.getElementById("select-model");
      const options = Array.from(select.options).map((o) => o.value);

      if (options.includes(config.model)) {
        select.value = config.model;
      } else {
        // It's a custom model not in the list
        select.value = "__other__";
        document.getElementById("input-model-custom").style.display = "block";
        document.getElementById("input-model-custom").value = config.model;
      }
    }
  });
}

function showStatus(message, type) {
  statusMsg.textContent = message;
  statusMsg.style.display = "block";

  if (type === "error") {
    statusMsg.style.backgroundColor = "rgba(255, 107, 107, 0.15)";
    statusMsg.style.borderColor = "rgba(255, 107, 107, 0.3)";
    statusMsg.style.color = "#ff6b6b";
  } else {
    statusMsg.style.backgroundColor = "rgba(124, 106, 247, 0.15)";
    statusMsg.style.borderColor = "rgba(124, 106, 247, 0.3)";
    statusMsg.style.color = "#7c6af7";
  }
}
