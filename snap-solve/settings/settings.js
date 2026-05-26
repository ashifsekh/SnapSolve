// Provider presets
const PROVIDER_PRESETS = {
  openai:     { baseUrl: "https://api.openai.com/v1",                    needsKey: true,  modelHint: "gpt-4o" },
  anthropic:  { baseUrl: "https://api.anthropic.com/v1",                 needsKey: true,  modelHint: "claude-sonnet-4-5" },
  google:     { baseUrl: "https://generativelanguage.googleapis.com",     needsKey: true,  modelHint: "gemini-1.5-flash" },
  nvidia:     { baseUrl: "https://integrate.api.nvidia.com/v1",           needsKey: true,  modelHint: "nvidia/llama-3.2-90b-vision-instruct" },
  ollama:     { baseUrl: "http://localhost:11434/v1",                     needsKey: false, modelHint: "llava" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1",                  needsKey: true,  modelHint: "openai/gpt-4o" },
  groq:       { baseUrl: "https://api.groq.com/openai/v1",               needsKey: true,  modelHint: "llama-3.2-90b-vision-preview" },
  custom:     { baseUrl: "",                                               needsKey: true,  modelHint: "" }
};

// DOM elements
const providerSelect = document.getElementById('provider-select');
const fieldBaseurl = document.getElementById('field-baseurl');
const fieldApikey = document.getElementById('field-apikey');
const fieldModel = document.getElementById('field-model');
const fieldOllamaNotice = document.getElementById('field-ollama-notice');
const inputBaseurl = document.getElementById('input-baseurl');
const inputApikey = document.getElementById('input-apikey');
const inputModel = document.getElementById('input-model');
const btnSave = document.getElementById('btn-save');
const statusMsg = document.getElementById('status-msg');

// Event listeners
providerSelect.addEventListener('change', handleProviderChange);
btnSave.addEventListener('click', saveConfiguration);

// Load saved configuration on page load
document.addEventListener('DOMContentLoaded', loadConfiguration);

function handleProviderChange() {
  const selectedProvider = providerSelect.value;
  
  // Hide all fields initially
  fieldBaseurl.style.display = 'none';
  fieldApikey.style.display = 'none';
  fieldModel.style.display = 'none';
  fieldOllamaNotice.style.display = 'none';
  
  if (!selectedProvider) return;
  
  const preset = PROVIDER_PRESETS[selectedProvider];
  
  // Show base URL field and populate
  fieldBaseurl.style.display = 'block';
  inputBaseurl.value = preset.baseUrl;
  
  // Show API key field or notice based on needsKey
  if (preset.needsKey) {
    fieldApikey.style.display = 'block';
    fieldOllamaNotice.style.display = 'none';
  } else {
    fieldApikey.style.display = 'none';
    fieldOllamaNotice.style.display = 'block';
  }
  
  // Show model field and set placeholder
  fieldModel.style.display = 'block';
  inputModel.placeholder = `e.g. ${preset.modelHint}`;
  
  // Make base URL editable for custom provider
  if (selectedProvider === 'custom') {
    inputBaseurl.value = '';
  }
}

function saveConfiguration() {
  const provider = providerSelect.value;
  const baseUrl = inputBaseurl.value;
  const apiKey = inputApikey.value;
  const model = inputModel.value;
  
  // Validation
  if (!provider) {
    showStatus('Please select a provider', 'error');
    return;
  }
  
  const preset = PROVIDER_PRESETS[provider];
  if (preset.needsKey && !apiKey) {
    showStatus('API key is required for this provider', 'error');
    return;
  }
  
  if (!model) {
    showStatus('Please enter a model name', 'error');
    return;
  }
  
  // Save to chrome storage
  const config = {
    provider,
    baseUrl,
    apiKey,
    model
  };
  
  chrome.storage.local.set({ snapsolve_config: config }, () => {
    showStatus('✓ Configuration saved!', 'success');
    setTimeout(() => {
      statusMsg.style.display = 'none';
    }, 3000);
  });
}

function loadConfiguration() {
  chrome.storage.local.get('snapsolve_config', (result) => {
    if (result.snapsolve_config) {
      const config = result.snapsolve_config;
      
      // Set provider dropdown
      providerSelect.value = config.provider;
      
      // Trigger change event to show fields
      providerSelect.dispatchEvent(new Event('change'));
      
      // Populate fields with saved values
      inputBaseurl.value = config.baseUrl;
      inputApikey.value = config.apiKey;
      inputModel.value = config.model;
    }
  });
}

function showStatus(message, type) {
  statusMsg.textContent = message;
  statusMsg.style.display = 'block';
  
  if (type === 'error') {
    statusMsg.style.backgroundColor = 'rgba(255, 107, 107, 0.15)';
    statusMsg.style.borderColor = 'rgba(255, 107, 107, 0.3)';
    statusMsg.style.color = '#ff6b6b';
  } else {
    statusMsg.style.backgroundColor = 'rgba(124, 106, 247, 0.15)';
    statusMsg.style.borderColor = 'rgba(124, 106, 247, 0.3)';
    statusMsg.style.color = '#7c6af7';
  }
}