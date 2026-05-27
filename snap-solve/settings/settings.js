const VISION_KEYWORDS = [
  "vision",
  "vl",
  "llava",
  "pixtral",
  "llama-3.2",
  "llama-4",
  "scout",
  "maverick",
  "kimi",
  "ministral",
  "mistral-large",
  "nemotron",
  "gemini",
  "claude",
  "gpt-4",
  "gpt-5",
  "phi-3.5-vision",
  "qwen-vl",
  "internvl",
  "cogvlm",
  "moondream",
  "bakllava",
  "deepseek-vl",
  "minicpm-v",
  "idefics",
];

function isVisionCapable(modelId) {
  if (!modelId) return false;
  const id = modelId.toLowerCase();
  return VISION_KEYWORDS.some((keyword) => id.includes(keyword));
}

const PROVIDER_PRESETS = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    needsKey: true,
    fetchStyle: "openai",
    fallbackModels: ["gpt-4.1", "gpt-4.1-mini", "gpt-4o"],
  },
  anthropic: {
    baseUrl: "https://api.anthropic.com/v1",
    needsKey: true,
    fetchStyle: "anthropic",
    fallbackModels: [
      "claude-opus-4-7",
      "claude-opus-4-6",
      "claude-sonnet-4-6",
      "claude-haiku-4-5",
    ],
  },
  google: {
    baseUrl: "https://generativelanguage.googleapis.com",
    needsKey: true,
    fetchStyle: "google",
    fallbackModels: [
      "gemini-3.5-flash",
      "gemini-3.1-pro-preview",
      "gemini-2.5-flash",
    ],
  },
  nvidia: {
    baseUrl: "https://integrate.api.nvidia.com/v1",
    needsKey: true,
    fetchStyle: "openai",
    fallbackModels: [
      "meta/llama-4-maverick-17b-128e-instruct",
      "moonshotai/kimi-k2.6",
      "mistralai/ministral-14b-instruct-2512",
      "mistralai/mistral-large-3-675b-instruct-2512",
      "nvidia/nemotron-nano-12b-v2-vl",
    ],
  },
  ollama: {
    baseUrl: "http://localhost:11434",
    needsKey: false,
    fetchStyle: "ollama",
    fallbackModels: ["llava", "llava:13b", "llama3.2-vision", "gemma3"],
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    needsKey: true,
    fetchStyle: "openrouter",
    fallbackModels: [
      "openai/gpt-4.1",
      "anthropic/claude-sonnet-4-6",
      "meta-llama/llama-3.2-90b-vision-instruct",
    ],
  },
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    needsKey: true,
    fetchStyle: "openai",
    fallbackModels: ["meta-llama/llama-4-scout-17b-16e-instruct"],
  },
  custom: {
    baseUrl: "",
    needsKey: true,
    fetchStyle: "openai",
    fallbackModels: [],
  },
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function fetchModels_openai(baseUrl, apiKey) {
  const res = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.data || [])
    .map((model) => model.id)
    .filter(isVisionCapable)
    .sort();
}

async function fetchModels_anthropic(baseUrl, apiKey) {
  const res = await fetch(`${baseUrl}/models`, {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.data || [])
    .map((model) => model.id)
    .filter(isVisionCapable)
    .sort();
}

async function fetchModels_google(baseUrl, apiKey) {
  const res = await fetch(`${baseUrl}/v1beta/models?key=${apiKey}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.models || [])
    .filter(
      (model) =>
        model.supportedGenerationMethods &&
        model.supportedGenerationMethods.includes("generateContent"),
    )
    .map((model) => model.name.replace("models/", ""))
    .filter(isVisionCapable)
    .sort();
}

async function fetchModels_ollama(baseUrl) {
  const res = await fetch(`${baseUrl}/api/tags`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.models || []).map((model) => model.name).sort();
}

async function fetchModels_openrouter(baseUrl, apiKey) {
  const headers = {};
  if (apiKey && apiKey.trim()) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const res = await fetch(`${baseUrl}/models`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.data || [])
    .filter((model) => {
      const modality = model?.architecture?.modality || "";
      return modality.includes("image") || isVisionCapable(model.id);
    })
    .map((model) => model.id)
    .sort();
}

async function fetchModelsForProvider(provider, baseUrl, apiKey) {
  const preset = PROVIDER_PRESETS[provider];
  if (!preset) throw new Error("Unknown provider");

  switch (preset.fetchStyle) {
    case "openai":
      return await fetchModels_openai(baseUrl, apiKey);
    case "anthropic":
      return await fetchModels_anthropic(baseUrl, apiKey);
    case "google":
      return await fetchModels_google(baseUrl, apiKey);
    case "ollama":
      return await fetchModels_ollama(baseUrl);
    case "openrouter":
      return await fetchModels_openrouter(baseUrl, apiKey);
    default:
      return await fetchModels_openai(baseUrl, apiKey);
  }
}

async function getCachedModels(provider, baseUrl, apiKey) {
  const key = `snapsolve_modelcache_${provider}`;
  try {
    const result = await chrome.storage.local.get(key);
    const entry = result[key];
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) return null;
    if (entry.baseUrl && entry.baseUrl !== baseUrl) return null;
    if (entry.source === "fallback" && apiKey && apiKey.trim()) return null;
    return entry;
  } catch {
    return null;
  }
}

async function setCachedModels(provider, models, source, baseUrl) {
  const key = `snapsolve_modelcache_${provider}`;
  await chrome.storage.local.set({
    [key]: { models, timestamp: Date.now(), source, baseUrl },
  });
}

async function bustModelCache(provider) {
  const key = `snapsolve_modelcache_${provider}`;
  await chrome.storage.local.remove(key);
}

async function getModelsWithCache(provider, baseUrl, apiKey) {
  const cached = await getCachedModels(provider, baseUrl, apiKey);
  if (cached) return { models: cached.models, source: cached.source };

  try {
    const models = await fetchModelsForProvider(provider, baseUrl, apiKey);
    if (models.length > 0) {
      await setCachedModels(provider, models, "live", baseUrl);
      return { models, source: "live" };
    }
  } catch (err) {
    console.warn(`SnapSolve: model fetch failed for ${provider}:`, err.message);
  }

  const fallback = PROVIDER_PRESETS[provider]?.fallbackModels || [];
  await setCachedModels(provider, fallback, "fallback", baseUrl);
  return { models: fallback, source: "fallback" };
}

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
const btnLoadModels = document.getElementById("btn-load-models");
const modelLoading = document.getElementById("model-loading");
const btnRefreshModels = document.getElementById("btn-refresh-models");
const modelSourceBadge = document.getElementById("model-source-badge");
const profileList = document.getElementById("profile-list");
const btnSave = document.getElementById("btn-save");
const statusMsg = document.getElementById("status-msg");

// Event listeners
providerSelect.addEventListener("change", handleProviderChange);
btnSave.addEventListener("click", saveConfiguration);
btnLoadModels.addEventListener("click", () => {
  const provider = providerSelect.value;
  if (provider) populateModelDropdown(provider, false);
});
btnRefreshModels.addEventListener("click", () => {
  const provider = providerSelect.value;
  if (provider) populateModelDropdown(provider, true);
});
inputApikey.addEventListener("blur", () => {
  const provider = providerSelect.value;
  const key = inputApikey.value.trim();
  if (provider && key) populateModelDropdown(provider, false);
});

// Load saved configuration on page load
document.addEventListener("DOMContentLoaded", loadConfiguration);
document.addEventListener("DOMContentLoaded", renderProfileList);

// ── PROFILE HELPERS ──────────────────────────────

async function loadProfiles() {
  const result = await chrome.storage.local.get("snapsolve_profiles");
  return result.snapsolve_profiles || [];
}

async function saveProfiles(profiles) {
  await chrome.storage.local.set({ snapsolve_profiles: profiles });
}

async function renderProfileList() {
  const profiles = await loadProfiles();
  profileList.innerHTML = "";

  if (profiles.length === 0) {
    profileList.innerHTML = `
      <div class="profile-empty">
        No saved profiles yet. Save a configuration on the left, and it will appear here as a reusable card.
      </div>
    `;
    return;
  }

  profiles.forEach((profile, index) => {
    const row = document.createElement("article");
    row.className = "profile-card";

    row.innerHTML = `
      <div class="profile-card-top">
        <div>
          <div class="profile-title">${profile.provider.toUpperCase()} - ${profile.model}</div>
          <p class="profile-meta">Auto-saved as ${profile.name}</p>
        </div>
        <div class="profile-pill">Saved profile</div>
      </div>
      <div class="profile-actions">
        <button class="btn-load-profile" data-index="${index}">Load</button>
        <button class="btn-delete-profile" data-index="${index}">Delete</button>
      </div>
    `;
    profileList.appendChild(row);
  });

  profileList.querySelectorAll(".btn-load-profile").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const profiles = await loadProfiles();
      const p = profiles[btn.dataset.index];

      document.getElementById("provider-select").value = p.provider;
      document.getElementById("input-apikey").value = p.apiKey;
      await handleProviderChange({ baseUrl: p.baseUrl, apiKey: p.apiKey });

      const sel = document.getElementById("select-model");
      const customInput = document.getElementById("input-model-custom");
      if ([...sel.options].some((o) => o.value === p.model)) {
        sel.value = p.model;
        customInput.style.display = "none";
      } else {
        sel.value = "__other__";
        customInput.style.display = "block";
        customInput.value = p.model;
      }

      showStatus(`Loaded profile: ${p.name}`, "green");
    });
  });

  profileList.querySelectorAll(".btn-delete-profile").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const profiles = await loadProfiles();
      profiles.splice(btn.dataset.index, 1);
      await saveProfiles(profiles);
      renderProfileList();
    });
  });
}

async function handleProviderChange(restoreConfig = null) {
  const selectedProvider = providerSelect.value;
  const preset = PROVIDER_PRESETS[selectedProvider];

  // Hide all fields initially
  fieldBaseurl.style.display = "none";
  fieldApikey.style.display = "none";
  fieldModel.style.display = "none";
  fieldOllamaNotice.style.display = "none";
  btnLoadModels.style.display = "none";
  modelLoading.style.display = "none";
  btnRefreshModels.style.display = "none";
  modelSourceBadge.style.display = "none";
  selectModel.style.display = "none";
  inputModelCustom.style.display = "none";

  if (!selectedProvider || !preset) {
    selectModel.innerHTML = "";
    return;
  }

  // Show base URL field and populate
  fieldBaseurl.style.display = "block";
  if (restoreConfig && typeof restoreConfig.baseUrl === "string") {
    inputBaseurl.value = restoreConfig.baseUrl;
  } else {
    inputBaseurl.value = preset.baseUrl;
    if (selectedProvider === "custom") {
      inputBaseurl.value = "";
    }
  }

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
  await populateModelDropdown(selectedProvider, false);
}

async function populateModelDropdown(provider, forceRefresh = false) {
  const preset = PROVIDER_PRESETS[provider];
  if (!preset) return;

  if (provider === "custom") {
    btnLoadModels.style.display = "none";
    modelLoading.style.display = "none";
    selectModel.style.display = "none";
    btnRefreshModels.style.display = "none";
    modelSourceBadge.style.display = "none";
    inputModelCustom.style.display = "block";
    inputModelCustom.placeholder =
      "Type exact model name (e.g. my-custom-model-v2)";
    return;
  }

  const baseUrl = inputBaseurl.value.trim() || preset.baseUrl;
  const apiKey = inputApikey.value.trim();

  if (provider !== "ollama" && preset.needsKey && !apiKey) {
    btnLoadModels.style.display = "block";
    selectModel.style.display = "none";
    inputModelCustom.style.display = "none";
    btnRefreshModels.style.display = "none";
    modelLoading.style.display = "none";
    modelSourceBadge.style.display = "none";
    return;
  }

  if (forceRefresh) {
    await bustModelCache(provider);
  }

  btnLoadModels.style.display = "none";
  modelLoading.style.display = "block";
  selectModel.style.display = "none";
  btnRefreshModels.style.display = "none";
  modelSourceBadge.style.display = "none";
  inputModelCustom.style.display = "none";

  const { models, source } = await getModelsWithCache(
    provider,
    baseUrl,
    apiKey,
  );

  modelLoading.style.display = "none";

  if (provider === "custom" || models.length === 0) {
    selectModel.style.display = "none";
    inputModelCustom.style.display = "block";
    btnRefreshModels.style.display = "none";
    return;
  }

  selectModel.innerHTML = "";

  models.forEach((modelName, index) => {
    const opt = document.createElement("option");
    opt.value = modelName;
    opt.textContent = index === 0 ? `★ ${modelName}` : modelName;
    selectModel.appendChild(opt);
  });

  const otherOpt = document.createElement("option");
  otherOpt.value = "__other__";
  otherOpt.textContent = "Other (type manually)...";
  selectModel.appendChild(otherOpt);

  selectModel.style.display = "block";
  btnRefreshModels.style.display = "inline-block";
  inputModelCustom.style.display = "none";

  modelSourceBadge.style.display = "inline-flex";
  if (source === "live") {
    modelSourceBadge.textContent = "Live";
    modelSourceBadge.style.background = "rgba(74,222,128,0.15)";
    modelSourceBadge.style.color = "#4ade80";
  } else {
    modelSourceBadge.textContent = "⚠ Offline list";
    modelSourceBadge.style.background = "rgba(251,191,36,0.15)";
    modelSourceBadge.style.color = "#fbbf24";
  }

  selectModel.onchange = () => {
    if (selectModel.value === "__other__") {
      inputModelCustom.style.display = "block";
      inputModelCustom.focus();
    } else {
      inputModelCustom.style.display = "none";
    }
  };
}

function getSelectedModel() {
  if (
    selectModel.style.display === "none" ||
    selectModel.value === "__other__"
  ) {
    return inputModelCustom.value.trim();
  }
  return selectModel.value;
}

function saveConfiguration() {
  const provider = providerSelect.value;
  const baseUrl = inputBaseurl.value;
  const apiKey = inputApikey.value;
  const model = getSelectedModel();
  const name = `${provider.toUpperCase()} - ${model}`;

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

  chrome.storage.local.set({ snapsolve_config: config }, async () => {
    const profiles = await loadProfiles();
    const entry = { name, provider, baseUrl, apiKey, model };
    const exists = profiles.findIndex((p) => p.name === name);
    if (exists >= 0) profiles[exists] = entry;
    else profiles.push(entry);

    await saveProfiles(profiles);
    renderProfileList();
    showStatus(`Saved & activated: ${name}`, "green");
  });
}

function loadConfiguration() {
  chrome.storage.local.get("snapsolve_config", async (result) => {
    if (result.snapsolve_config) {
      const config = result.snapsolve_config;

      // Set provider dropdown
      providerSelect.value = config.provider;

      // Trigger change flow to show fields and hydrate models
      inputApikey.value = config.apiKey;
      await handleProviderChange(config);

      const options = Array.from(selectModel.options).map(
        (option) => option.value,
      );

      if (options.includes(config.model)) {
        selectModel.value = config.model;
        inputModelCustom.style.display = "none";
      } else {
        selectModel.value = "__other__";
        inputModelCustom.style.display = "block";
        inputModelCustom.value = config.model;
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
  } else if (type === "green") {
    statusMsg.style.backgroundColor = "rgba(74, 222, 128, 0.15)";
    statusMsg.style.borderColor = "rgba(74, 222, 128, 0.3)";
    statusMsg.style.color = "#4ade80";
  } else {
    statusMsg.style.backgroundColor = "rgba(124, 106, 247, 0.15)";
    statusMsg.style.borderColor = "rgba(124, 106, 247, 0.3)";
    statusMsg.style.color = "#7c6af7";
  }

  setTimeout(() => {
    statusMsg.style.display = "none";
  }, 3000);
}
