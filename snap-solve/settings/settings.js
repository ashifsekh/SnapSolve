// Provider presets
const PROVIDER_PRESETS = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    needsKey: true,
    models: ["gpt-4.1", "gpt-4.1-mini", "gpt-4o"],
  },
  anthropic: {
    baseUrl: "https://api.anthropic.com/v1",
    needsKey: true,
    models: [
      "claude-opus-4-7",
      "claude-opus-4-6",
      "claude-sonnet-4-6",
      "claude-haiku-4-5",
    ],
  },
  google: {
    baseUrl: "https://generativelanguage.googleapis.com",
    needsKey: true,
    models: ["gemini-3.5-flash", "gemini-3.1-pro-preview", "gemini-2.5-flash"],
  },
  nvidia: {
    baseUrl: "https://integrate.api.nvidia.com/v1",
    needsKey: true,
    models: [
      "meta/llama-3.2-90b-vision-instruct",
      "meta/llama-3.2-11b-vision-instruct",
      "microsoft/phi-3.5-vision-instruct",
    ],
  },
  ollama: {
    baseUrl: "http://localhost:11434/v1",
    needsKey: false,
    models: ["llava", "llava:13b", "llama3.2-vision", "gemma3"],
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    needsKey: true,
    models: [
      "openai/gpt-4.1",
      "anthropic/claude-sonnet-4-6",
      "google/gemini-flash-2.5",
      "meta-llama/llama-3.2-90b-vision-instruct",
    ],
  },
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    needsKey: true,
    models: ["meta-llama/llama-4-scout-17b-16e-instruct"],
  },
  custom: { baseUrl: "", needsKey: true, models: [] },
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
const profileList = document.getElementById("profile-list");
const inputProfileName = document.getElementById("input-profile-name");
const btnSave = document.getElementById("btn-save");
const statusMsg = document.getElementById("status-msg");

// Event listeners
providerSelect.addEventListener("change", handleProviderChange);
btnSave.addEventListener("click", saveConfiguration);

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
    profileList.innerHTML =
      '<p style="color:#888;font-size:12px;margin:6px 0">No saved profiles yet. Fill in settings and click Save Profile.</p>';
    return;
  }

  profiles.forEach((profile, index) => {
    const row = document.createElement("div");
    row.style.cssText = `display:flex; align-items:center; gap:8px;
      padding:8px 10px; background:#22222f; border-radius:8px; margin-bottom:6px;`;

    row.innerHTML = `
      <div style="flex:1">
        <div style="font-size:13px;color:#e8e8f0;font-weight:500">${profile.name}</div>
        <div style="font-size:11px;color:#888">${profile.provider.toUpperCase()} · ${profile.model}</div>
      </div>
      <button class="btn-load-profile" data-index="${index}"
        style="background:#7c6af7;border:none;color:white;padding:4px 10px;
        border-radius:6px;cursor:pointer;font-size:12px">Load</button>
      <button class="btn-delete-profile" data-index="${index}"
        style="background:#3a1a1a;border:none;color:#ff6b6b;padding:4px 8px;
        border-radius:6px;cursor:pointer;font-size:12px">✕</button>
    `;
    profileList.appendChild(row);
  });

  profileList.querySelectorAll(".btn-load-profile").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const profiles = await loadProfiles();
      const p = profiles[btn.dataset.index];

      document.getElementById("provider-select").value = p.provider;
      document
        .getElementById("provider-select")
        .dispatchEvent(new Event("change"));

      setTimeout(() => {
        document.getElementById("input-baseurl").value = p.baseUrl;
        document.getElementById("input-apikey").value = p.apiKey;

        const sel = document.getElementById("select-model");
        if ([...sel.options].some((o) => o.value === p.model)) {
          sel.value = p.model;
          document.getElementById("input-model-custom").style.display = "none";
        } else {
          sel.value = "__other__";
          document.getElementById("input-model-custom").style.display = "block";
          document.getElementById("input-model-custom").value = p.model;
        }

        showStatus(`✓ Loaded profile: ${p.name}`, "green");
      }, 50);
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
  const name = inputProfileName.value.trim() || `${provider} · ${model}`;

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
    showStatus(`✓ Saved & activated: ${name}`, "green");
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
