// Setup global log interception for Debug Console tab
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

function writeToDebugConsole(message, type) {
  const container = document.getElementById('debug-console-logs');
  if (container) {
    const line = document.createElement('div');
    line.classList.add('console-line', type);
    const time = new Date().toLocaleTimeString();
    line.textContent = `[${time}] ${message}`;
    container.appendChild(line);
    container.scrollTop = container.scrollHeight;
  }
}

console.log = function(...args) {
  originalLog.apply(console, args);
  writeToDebugConsole(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '), 'system');
};

console.error = function(...args) {
  originalError.apply(console, args);
  const formatted = args.map(a => {
    if (a instanceof Error) {
      return `${a.name}: ${a.message}\n${a.stack}`;
    }
    return typeof a === 'object' ? JSON.stringify(a) : a;
  });
  writeToDebugConsole(formatted.join(' '), 'error');
};

console.warn = function(...args) {
  originalWarn.apply(console, args);
  writeToDebugConsole(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '), 'ai');
};

// Check if running in Tauri and establish compatibility bridge
if (window.__TAURI__) {
  const invoke = window.__TAURI__.core.invoke;
  window.api = {
    getSetting: (key) => invoke('get_setting', { key }),
    setSetting: (key, value) => invoke('set_setting', { key, value }),
    listVocab: () => invoke('list_vocab'),
    dueVocab: () => invoke('due_vocab'),
    saveVocab: (vocab) => invoke('save_vocab', { vocab }),
    deleteVocab: (id) => invoke('delete_vocab', { id }),
    updateReview: (id, interval, easeFactor, repetitions, nextReview) => 
      invoke('update_review', { id, interval, easeFactor, repetitions, nextReview }),
    callGroq: ({ apiKey, model, messages, responseFormat }) => 
      invoke('call_groq', { apiKey, model, messages, responseFormat }),
    getGroqModels: (apiKey) => invoke('get_groq_models', { apiKey }),
    getDbPath: () => invoke('get_db_path')
  };
}

// Global Application State
let currentTab = 'dashboard';

let dueCount = 0;
let totalCount = 0;
let activeReviewQueue = [];
let currentReviewIndex = 0;
let sessionStats = {
  reviewed: 0,
  spellingCorrect: 0,
  aiGradings: 0
};
let isEvaluatingAI = false;

// Audio Configuration
let audioSettings = {
  voiceURI: '',
  rate: 1.0,
  pitch: 1.0
};
let availableVoices = [];

// DOM Elements
const elements = {
  // Navigation
  navButtons: document.querySelectorAll('.nav-btn'),
  tabPanels: document.querySelectorAll('.tab-panel'),
  pageTitle: document.getElementById('page-title'),
  reviewBadge: document.getElementById('review-badge'),
  apiStatusText: document.getElementById('api-status-text'),
  apiStatusDot: document.getElementById('api-status-indicator'),
  
  // Dashboard
  statTotal: document.getElementById('stat-total'),
  statDue: document.getElementById('stat-due'),
  statMastered: document.getElementById('stat-mastered'),
  statStreak: document.getElementById('stat-streak'),
  dashboardStartReview: document.getElementById('dashboard-start-review'),
  recentVocabList: document.getElementById('recent-vocab-list'),
  btnDashViewLibrary: document.getElementById('dash-view-library'),
  
  // Add Word Form
  addVocabForm: document.getElementById('add-vocab-form'),
  vocabId: document.getElementById('vocab-id'),
  vocabMainWord: document.getElementById('vocab-main-word'),
  vocabRelatedWords: document.getElementById('vocab-related-words'),
  vocabIpa: document.getElementById('vocab-ipa'),
  vocabTranslation: document.getElementById('vocab-translation'),
  vocabSentenceVi: document.getElementById('vocab-sentence-vi'),
  vocabSentenceEn: document.getElementById('vocab-sentence-en'),
  vocabLevel: document.getElementById('vocab-level'),
  btnAiGenerate: document.getElementById('btn-ai-generate'),
  btnClearForm: document.getElementById('btn-clear-form'),
  aiAssistantOutput: document.getElementById('ai-assistant-output'),
  previewIpa: document.getElementById('preview-ipa'),
  previewMainWord: document.getElementById('preview-main-word'),
  previewTranslation: document.getElementById('preview-translation'),
  previewSentenceEn: document.getElementById('preview-sentence-en'),
  previewSentenceVi: document.getElementById('preview-sentence-vi'),
  
  // Library
  librarySearch: document.getElementById('library-search-input'),
  librarySort: document.getElementById('library-sort-select'),
  libraryVocabList: document.getElementById('library-vocab-list'),
  libraryTableView: document.getElementById('library-table-view'),
  libraryCardGrid: document.getElementById('library-card-grid'),
  btnLibraryViewTable: document.getElementById('btn-library-view-table'),
  btnLibraryViewGrid: document.getElementById('btn-library-view-grid'),
  
  // Review Panel
  reviewStartState: document.getElementById('review-start-state'),
  reviewActiveState: document.getElementById('review-active-state'),
  reviewFinishedState: document.getElementById('review-finished-state'),
  reviewDueCountBadge: document.getElementById('review-due-count-badge'),
  btnStartReviewSession: document.getElementById('btn-start-review-session'),
  reviewAutoAudio: document.getElementById('review-auto-audio'),
  
  reviewCurrentIndex: document.getElementById('review-current-index'),
  reviewTotalCount: document.getElementById('review-total-count'),
  reviewCardStageName: document.getElementById('review-card-stage-name'),
  reviewSegmentTrack: document.getElementById('review-segment-track'),
  
  reviewStage1: document.getElementById('review-stage-1'),
  reviewStage2: document.getElementById('review-stage-2'),
  reviewStage3: document.getElementById('review-stage-3'),
  
  // S1 Spelling
  reviewIpaPrompt: document.getElementById('review-ipa-prompt'),
  reviewTranslationPrompt: document.getElementById('review-translation-prompt'),
  reviewS1Input: document.getElementById('review-s1-input'),
  reviewS1Feedback: document.getElementById('review-s1-feedback'),
  btnS1Submit: document.getElementById('btn-s1-submit'),
  btnS1Next: document.getElementById('btn-s1-next'),
  btnAudioS1: document.getElementById('review-audio-btn-s1'),
  
  // S2 Related
  btnAudioS2: document.getElementById('review-audio-btn-s2'),
  reviewS2Ipa: document.getElementById('review-s2-ipa'),
  reviewS2Translation: document.getElementById('review-s2-translation'),
  reviewS2Input: document.getElementById('review-s2-input'),
  reviewS2Feedback: document.getElementById('review-s2-feedback'),
  btnS2Submit: document.getElementById('btn-s2-submit'),
  btnS2Next: document.getElementById('btn-s2-next'),
  
  // S3 Sentence
  reviewS3MainWord: document.getElementById('review-s3-main-word'),
  reviewS3RelatedBadges: document.getElementById('review-s3-related-words-badges'),
  reviewS3SentenceVi: document.getElementById('review-s3-sentence-vi'),
  reviewS3Input: document.getElementById('review-s3-input'),
  reviewS3Feedback: document.getElementById('review-s3-feedback'),
  btnS3Submit: document.getElementById('btn-s3-submit'),
  btnS3Finish: document.getElementById('btn-s3-finish'),
  reviewLogsBox: document.getElementById('review-logs-box'),
  
  // Finished Review Stats
  summaryTotalReviewed: document.getElementById('summary-total-reviewed'),
  summaryCorrectFirst: document.getElementById('summary-correct-first'),
  summaryAiEvals: document.getElementById('summary-ai-evals'),
  btnReviewCompleteDashboard: document.getElementById('btn-review-complete-dashboard'),
  
  // Settings
  settingsGroqKey: document.getElementById('settings-groq-key'),
  settingsGroqModel: document.getElementById('settings-groq-model'),
  btnToggleKeyVisibility: document.getElementById('btn-toggle-key-visibility'),
  btnSaveAiSettings: document.getElementById('btn-save-ai-settings'),
  settingsAudioVoice: document.getElementById('settings-audio-voice'),
  settingsAudioRate: document.getElementById('settings-audio-rate'),
  settingsAudioPitch: document.getElementById('settings-audio-pitch'),
  valAudioRate: document.getElementById('val-audio-rate'),
  valAudioPitch: document.getElementById('val-audio-pitch'),
  btnTestSpeech: document.getElementById('btn-test-speech'),
  btnSaveAudioSettings: document.getElementById('btn-save-audio-settings'),
  btnExportDb: document.getElementById('btn-export-db'),
  btnImportDbTrigger: document.getElementById('btn-import-db-trigger'),
  settingsDbImportFile: document.getElementById('settings-db-import-file'),
  
  // Debug Console
  debugDbPath: document.getElementById('debug-db-path'),
  debugSettingsList: document.getElementById('debug-settings-list'),
  debugConsoleLogs: document.getElementById('debug-console-logs'),
  btnClearDebugLogs: document.getElementById('btn-clear-debug-logs')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  try {
    setupThemeToggle();
    console.log("Initialization: Theme toggle setup complete.");

    setupNavigation();
    console.log("Initialization: Navigation setup complete.");
    
    await loadSettings();
    console.log("Initialization: Settings loaded successfully.");
    
    setupAudioEngine();
    console.log("Initialization: Audio engine setup complete.");
    
    setupFormHandlers();
    console.log("Initialization: Form handlers setup complete.");
    
    setupLibraryHandlers();
    console.log("Initialization: Library handlers setup complete.");
    
    setupReviewHandlers();
    console.log("Initialization: Review handlers setup complete.");
    
    setupBackupHandlers();
    console.log("Initialization: Backup and settings handlers setup complete.");
    
    setupDebugHandlers();
    console.log("Initialization: Debug handlers setup complete.");
    
    setupGoalHandlers();
    loadDailyGoal();
    console.log("Initialization: Daily goal ring setup complete.");
    
    // Initial load of statistics
    await updateAppStats();
    await loadRecentVocab();
    console.log("Initialization: App stats and recent vocab loaded successfully.");
  } catch (err) {
    console.error("CRITICAL Initialization Error:", err);
  }
});

// --- HELPER LOGGERS ---
function logToConsole(element, message, type = 'system') {
  const line = document.createElement('div');
  line.classList.add('console-line', type);
  const time = new Date().toLocaleTimeString();
  line.textContent = `[${time}] ${message}`;
  element.appendChild(line);
  element.scrollTop = element.scrollHeight;
}

// --- LIGHT / DARK THEME TOGGLE ---
const SUN_ICON_PATH = 'M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z';
const MOON_ICON_PATH = 'M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z';

function setupThemeToggle() {
  const btn = document.getElementById('btn-theme-toggle');
  if (!btn) return;
  const iconPath = btn.querySelector('path');

  const applyTheme = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    if (iconPath) iconPath.setAttribute('d', theme === 'light' ? MOON_ICON_PATH : SUN_ICON_PATH);
    localStorage.setItem('ui-theme', theme);
  };

  applyTheme(document.documentElement.getAttribute('data-theme') || 'dark');

  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    applyTheme(current === 'light' ? 'dark' : 'light');
  });
}

// --- TOAST NOTIFICATION SYSTEM ---
const TOAST_ICONS = {
  success: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>`,
  error:   `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>`,
  info:    `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`,
  warning: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>`
};

const TOAST_TITLES = { success: 'Success', error: 'Error', info: 'Info', warning: 'Warning' };

function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-icon">${TOAST_ICONS[type] || TOAST_ICONS.info}</div>
    <div class="toast-body">
      <div class="toast-title">${TOAST_TITLES[type] || 'Notification'}</div>
      <div class="toast-msg">${escapeHtml(message)}</div>
    </div>
    <button class="toast-close" aria-label="Dismiss">&times;</button>
  `;

  const dismiss = () => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 320);
  };

  toast.querySelector('.toast-close').addEventListener('click', dismiss);
  container.appendChild(toast);

  if (duration > 0) setTimeout(dismiss, duration);
  return toast;
}

// --- DAILY GOAL RING ---
const CIRCUMFERENCE = 2 * Math.PI * 45; // r=45 → ~283

function loadDailyGoal() {
  const goalTarget = parseInt(localStorage.getItem('daily-goal-target') || '10');
  const goalInput = document.getElementById('goal-target-input');
  if (goalInput) goalInput.value = goalTarget;
  updateGoalRing();
}

function updateGoalRing() {
  const circle = document.getElementById('goal-ring-circle');
  const percentEl = document.getElementById('goal-ring-percent');
  const subEl = document.getElementById('goal-text-sub');
  if (!circle || !percentEl) return;

  const goalTarget = parseInt(localStorage.getItem('daily-goal-target') || '10');
  const reviewed = parseInt(localStorage.getItem('daily-reviewed-today') || '0');
  const lastDate = localStorage.getItem('daily-reviewed-date');
  const today = new Date().toDateString();

  // Reset daily counter if new day
  const todayReviewed = (lastDate === today) ? reviewed : 0;
  if (lastDate !== today) {
    localStorage.setItem('daily-reviewed-today', '0');
    localStorage.setItem('daily-reviewed-date', today);
  }

  const percent = Math.min(100, Math.round((todayReviewed / Math.max(1, goalTarget)) * 100));
  const offset = CIRCUMFERENCE - (percent / 100) * CIRCUMFERENCE;

  circle.style.strokeDashoffset = offset;
  percentEl.textContent = `${percent}%`;

  if (subEl) {
    if (todayReviewed >= goalTarget) {
      subEl.textContent = `🎉 Goal reached! ${todayReviewed} reviewed`;
    } else {
      subEl.textContent = `${todayReviewed} / ${goalTarget} words reviewed`;
    }
  }
}

function setupGoalHandlers() {
  const btnSetGoal = document.getElementById('btn-set-goal');
  const goalInput = document.getElementById('goal-target-input');
  if (btnSetGoal && goalInput) {
    btnSetGoal.addEventListener('click', () => {
      const val = parseInt(goalInput.value);
      if (isNaN(val) || val < 1) {
        showToast('Please enter a valid goal (minimum 1 word).', 'warning');
        return;
      }
      localStorage.setItem('daily-goal-target', val.toString());
      updateGoalRing();
      showToast(`Daily goal set to ${val} words!`, 'success', 3000);
    });
  }
}

// --- CONFIGURATION & SETTINGS SERVICE ---
const FALLBACK_GROQ_MODELS = [
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile (Recommended)' },
  { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant' },
  { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B' },
  { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B' },
  { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout 17B (Preview)' },
  { id: 'qwen/qwen3-32b', name: 'Qwen3 32B (Preview)' },
  { id: 'qwen/qwen3.6-27b', name: 'Qwen3.6 27B (Preview)' }
];

async function populateGroqModels(apiKey, selectedModel) {
  const selectEl = elements.settingsGroqModel;
  if (!selectEl) return;

  let models = [...FALLBACK_GROQ_MODELS];

  if (apiKey && apiKey.trim() && window.api && window.api.getGroqModels) {
    try {
      const response = await window.api.getGroqModels(apiKey);
      if (response && response.data) {
        // Exclude audio / whisper models or guardrail models
        const apiModels = response.data
          .filter(m => !m.id.includes('whisper') && !m.id.includes('guard'))
          .map(m => {
            let label = m.id;
            if (label.startsWith('meta-llama/')) {
              label = label.replace('meta-llama/', 'Meta-Llama: ');
            } else if (label.startsWith('openai/')) {
              label = label.replace('openai/', 'OpenAI: ');
            } else if (label.startsWith('qwen/')) {
              label = label.replace('qwen/', 'Qwen: ');
            } else {
              label = label.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            }
            return { id: m.id, name: label };
          });
        
        if (apiModels.length > 0) {
          apiModels.sort((a, b) => a.name.localeCompare(b.name));
          models = apiModels;
        }
      }
    } catch (err) {
      console.warn("Failed to fetch Groq models, using fallback list:", err);
    }
  }

  // Clear and update select options
  selectEl.innerHTML = '';
  models.forEach(model => {
    const opt = document.createElement('option');
    opt.value = model.id;
    opt.textContent = model.name;
    if (model.id === selectedModel) {
      opt.selected = true;
    }
    selectEl.appendChild(opt);
  });

  // If selected model is not in the models list, append it as option
  if (selectedModel && !models.some(m => m.id === selectedModel)) {
    const opt = document.createElement('option');
    opt.value = selectedModel;
    opt.textContent = `${selectedModel} (Saved)`;
    opt.selected = true;
    selectEl.appendChild(opt);
  }
}

async function loadSettings() {
  // API Key Settings
  const apiKey = (window.api && await window.api.getSetting('groq-key')) || '';
  const model = (window.api && await window.api.getSetting('groq-model')) || 'llama-3.3-70b-versatile';
  
  elements.settingsGroqKey.value = apiKey;
  await populateGroqModels(apiKey, model);
  
  updateGroqStatus(apiKey);

  // Audio Settings
  if (window.api) {
    audioSettings.voiceURI = await window.api.getSetting('audio-voice-uri') || '';
    audioSettings.rate = parseFloat(await window.api.getSetting('audio-rate') || '1.0');
    audioSettings.pitch = parseFloat(await window.api.getSetting('audio-pitch') || '1.0');
  } else {
    audioSettings.voiceURI = '';
    audioSettings.rate = 1.0;
    audioSettings.pitch = 1.0;
  }
  
  elements.settingsAudioRate.value = audioSettings.rate;
  elements.valAudioRate.textContent = audioSettings.rate.toFixed(1);
  elements.settingsAudioPitch.value = audioSettings.pitch;
  elements.valAudioPitch.textContent = audioSettings.pitch.toFixed(1);
}

function updateGroqStatus(apiKey) {
  if (apiKey.trim()) {
    elements.apiStatusDot.classList.add('online');
    elements.apiStatusText.textContent = 'Groq AI Active';
  } else {
    elements.apiStatusDot.classList.remove('online');
    elements.apiStatusText.textContent = 'Groq AI Offline';
  }
}

// --- TEXT-TO-SPEECH AUDIO ENGINE ---
function setupAudioEngine() {
  if (typeof window.speechSynthesis === 'undefined') {
    console.warn('Speech synthesis is not supported on this platform.');
    if (elements.settingsAudioVoice) {
      elements.settingsAudioVoice.innerHTML = '<option value="">Not supported on this platform</option>';
    }
    // Still bind rate/pitch/test handlers so they don't throw errors
    elements.settingsAudioRate.addEventListener('input', (e) => {
      elements.valAudioRate.textContent = parseFloat(e.target.value).toFixed(1);
    });
    elements.settingsAudioPitch.addEventListener('input', (e) => {
      elements.valAudioPitch.textContent = parseFloat(e.target.value).toFixed(1);
    });
    return;
  }

  const populateVoices = () => {
    try {
      availableVoices = window.speechSynthesis.getVoices();
      elements.settingsAudioVoice.innerHTML = '';
      
      // Prioritize English voices
      const sortedVoices = [...availableVoices].sort((a, b) => {
        const aIsEn = a.lang.startsWith('en');
        const bIsEn = b.lang.startsWith('en');
        if (aIsEn && !bIsEn) return -1;
        if (!aIsEn && bIsEn) return 1;
        return a.name.localeCompare(b.name);
      });

      sortedVoices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.voiceURI;
        option.textContent = `${voice.name} (${voice.lang})${voice.localService ? ' - Local' : ''}`;
        if (voice.voiceURI === audioSettings.voiceURI) {
          option.selected = true;
        }
        elements.settingsAudioVoice.appendChild(option);
      });
    } catch (err) {
      console.warn("Failed to populate voices:", err);
    }
  };

  populateVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = populateVoices;
  }

  // Rate/Pitch sliders
  elements.settingsAudioRate.addEventListener('input', (e) => {
    elements.valAudioRate.textContent = parseFloat(e.target.value).toFixed(1);
  });
  elements.settingsAudioPitch.addEventListener('input', (e) => {
    elements.valAudioPitch.textContent = parseFloat(e.target.value).toFixed(1);
  });

  // Test Speech button
  elements.btnTestSpeech.addEventListener('click', () => {
    try {
      const tempUtterance = new SpeechSynthesisUtterance('Meticulous. Meticulous translation evaluation works.');
      const selectedVoiceURI = elements.settingsAudioVoice.value;
      const voice = availableVoices.find(v => v.voiceURI === selectedVoiceURI);
      if (voice) tempUtterance.voice = voice;
      tempUtterance.rate = parseFloat(elements.settingsAudioRate.value);
      tempUtterance.pitch = parseFloat(elements.settingsAudioPitch.value);
      window.speechSynthesis.speak(tempUtterance);
    } catch (err) {
      console.warn("Speech test failed:", err);
    }
  });

  // Save Audio button
  elements.btnSaveAudioSettings.addEventListener('click', async () => {
    if (window.api) {
      audioSettings.voiceURI = elements.settingsAudioVoice.value;
      audioSettings.rate = parseFloat(elements.settingsAudioRate.value);
      audioSettings.pitch = parseFloat(elements.settingsAudioPitch.value);
      
      await window.api.setSetting('audio-voice-uri', audioSettings.voiceURI);
      await window.api.setSetting('audio-rate', audioSettings.rate.toString());
      await window.api.setSetting('audio-pitch', audioSettings.pitch.toString());
      
      showToast('Audio settings saved successfully!', 'success');
    }
  });
}

function speak(text) {
  if (!text || typeof window.speechSynthesis === 'undefined') return;
  try {
    // Cancel current speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = availableVoices.find(v => v.voiceURI === audioSettings.voiceURI);
    if (voice) {
      utterance.voice = voice;
    } else {
      // Fallback to first available English voice
      const enVoice = availableVoices.find(v => v.lang.startsWith('en'));
      if (enVoice) utterance.voice = enVoice;
    }
    utterance.rate = audioSettings.rate;
    utterance.pitch = audioSettings.pitch;
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn("Speech synthesis speak failed:", err);
  }
}

// --- TABS & NAVIGATION ---
function setupNavigation() {
  elements.navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      if (tabName === 'add-word' && elements.vocabId.value) {
        resetForm();
      }
      switchTab(tabName);
    });
  });

  elements.btnDashViewLibrary.addEventListener('click', () => switchTab('library'));
  elements.btnReviewCompleteDashboard.addEventListener('click', () => switchTab('dashboard'));
}

async function switchTab(tabName) {
  // Update state
  currentTab = tabName;
  
  // Visual states
  elements.navButtons.forEach(b => b.classList.remove('active'));
  elements.tabPanels.forEach(p => p.classList.remove('active'));
  
  const activeBtn = document.querySelector(`.nav-btn[data-tab="${tabName}"]`);
  const activePanel = document.getElementById(`${tabName}-tab`);
  
  if (activeBtn) activeBtn.classList.add('active');
  if (activePanel) activePanel.classList.add('active');
  
  // Format title header
  const tabTitles = {
    'dashboard': 'Dashboard',
    'add-word': 'Add Word',
    'library': 'Library',
    'review': 'Review Arena',
    'settings': 'Settings',
    'debug': 'Debug Console'
  };
  elements.pageTitle.textContent = tabTitles[tabName] || 'Dashboard';
  
  // Tab-specific lifecycle hooks
  if (tabName === 'dashboard') {
    await updateAppStats();
    await loadRecentVocab();
  } else if (tabName === 'library') {
    await loadLibraryVocab();
  } else if (tabName === 'review') {
    await initializeReviewTab();
  } else if (tabName === 'settings') {
    await loadSettings();
  } else if (tabName === 'debug') {
    await initializeDebugTab();
  }
}

// --- APP STATISTICS & DASHBOARD ---
async function updateAppStats() {
  if (!window.api) return;
  const vocabList = await window.api.listVocab();
  const dueVocab = await window.api.dueVocab();
  
  let totalRelatedCount = 0;
  let masteredRelatedCount = 0;
  vocabList.forEach(v => {
    if (v.related_details && v.related_details.length > 0) {
      totalRelatedCount += v.related_details.length;
      masteredRelatedCount += v.related_details.filter(rd => rd.interval >= 21).length;
    } else {
      totalRelatedCount += 1;
      if (v.interval >= 21) {
        masteredRelatedCount++;
      }
    }
  });

  totalCount = totalRelatedCount;
  dueCount = dueVocab.length;
  
  elements.statTotal.textContent = totalCount;
  elements.statDue.textContent = dueCount;
  elements.statMastered.textContent = masteredRelatedCount;
  
  // Update badges
  if (dueCount > 0) {
    elements.reviewBadge.classList.remove('hide');
    elements.reviewBadge.textContent = dueCount;
    document.querySelectorAll('.due-count').forEach(el => el.textContent = dueCount);
  } else {
    elements.reviewBadge.classList.add('hide');
    document.querySelectorAll('.due-count').forEach(el => el.textContent = '0');
  }

  // Calculate Streak based on study activity / settings
  const streak = await calculateStreak(vocabList);
  elements.statStreak.textContent = `${streak} day${streak !== 1 ? 's' : ''}`;

  renderActivityHeatmap();
  renderDueForecast(vocabList);
}

// --- ACTIVITY HEATMAP (last 5 weeks, GitHub-style) ---
function getReviewHistory() {
  try {
    return JSON.parse(localStorage.getItem('daily-review-history') || '{}');
  } catch (err) {
    return {};
  }
}

function recordReviewActivity(count) {
  const history = getReviewHistory();
  const todayKey = new Date().toISOString().slice(0, 10);
  history[todayKey] = (history[todayKey] || 0) + count;
  localStorage.setItem('daily-review-history', JSON.stringify(history));
}

function renderActivityHeatmap() {
  const container = document.getElementById('activity-heatmap');
  if (!container) return;

  const history = getReviewHistory();
  const today = new Date();
  // Pad back to the most recent Sunday so weeks align into clean columns.
  const daysBack = 34 + today.getDay();
  const start = new Date(today);
  start.setDate(start.getDate() - daysBack);

  container.innerHTML = '';
  for (let i = 0; i <= daysBack; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const count = history[key] || 0;

    let level = 0;
    if (count >= 10) level = 4;
    else if (count >= 6) level = 3;
    else if (count >= 3) level = 2;
    else if (count >= 1) level = 1;

    const cell = document.createElement('div');
    cell.className = `heatmap-cell level-${level}`;
    cell.title = `${d.toLocaleDateString()}: ${count} review${count !== 1 ? 's' : ''}`;
    container.appendChild(cell);
  }
}

// --- UPCOMING REVIEW FORECAST (next 7 days) ---
function computeDueForecast(vocabList) {
  const buckets = new Array(7).fill(0);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  vocabList.forEach(v => {
    const items = (v.related_details && v.related_details.length > 0)
      ? v.related_details
      : [{ next_review: v.next_review }];

    items.forEach(rd => {
      if (!rd.next_review) return;
      const d = new Date(rd.next_review);
      if (isNaN(d.getTime())) return;
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const dayDiff = Math.round((dayStart - startOfToday) / 86400000);

      if (dayDiff <= 0) buckets[0]++;
      else if (dayDiff <= 6) buckets[dayDiff]++;
    });
  });

  return buckets;
}

function renderDueForecast(vocabList) {
  const container = document.getElementById('due-forecast-list');
  if (!container) return;

  const buckets = computeDueForecast(vocabList);
  const maxVal = Math.max(1, ...buckets);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = new Date();

  container.innerHTML = '';
  buckets.forEach((count, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    let label = dayNames[d.getDay()];
    if (i === 0) label = 'Today';
    else if (i === 1) label = 'Tomorrow';

    const percent = Math.round((count / maxVal) * 100);

    const row = document.createElement('div');
    row.className = `forecast-row${i === 0 ? ' today' : ''}`;
    row.innerHTML = `
      <span class="forecast-day-label">${label}</span>
      <div class="forecast-bar-track"><div class="forecast-bar-fill" style="width:${percent}%"></div></div>
      <span class="forecast-count">${count}</span>
    `;
    container.appendChild(row);
  });
}

async function calculateStreak() {
  // Look at created_at/next_review history to determine consecutive study days (simplified to 0 or 1 for demo, or mock)
  // Let's implement a simple streak algorithm by checking local storage for daily active timestamps
  const streakKey = 'study-streak-count';
  const lastActiveKey = 'study-streak-last-active';
  
  const streak = localStorage.getItem(streakKey) || '0';
  const lastActive = localStorage.getItem(lastActiveKey);
  
  if (!lastActive) return 0;
  
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  
  if (lastActive === today) {
    return parseInt(streak);
  } else if (lastActive === yesterday) {
    return parseInt(streak);
  } else {
    // Streak broken
    localStorage.setItem(streakKey, '0');
    return 0;
  }
}

function updateActiveStreak() {
  const streakKey = 'study-streak-count';
  const lastActiveKey = 'study-streak-last-active';
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  
  const lastActive = localStorage.getItem(lastActiveKey);
  let streak = parseInt(localStorage.getItem(streakKey) || '0');
  
  if (lastActive !== today) {
    if (lastActive === yesterday) {
      streak += 1;
    } else {
      streak = 1; // start new streak
    }
    localStorage.setItem(streakKey, streak.toString());
    localStorage.setItem(lastActiveKey, today);
  }
}

async function loadRecentVocab() {
  if (!window.api) return;
  const vocabList = await window.api.listVocab();
  // Get first 5
  const recent = vocabList.slice(0, 5);
  
  elements.recentVocabList.innerHTML = '';
  if (recent.length === 0) {
    elements.recentVocabList.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="empty-state-enhanced">
            <div class="empty-icon">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>
            </div>
            <h4>No vocabulary yet</h4>
            <p>Go to <strong>Add Word</strong> to start building your vocabulary!</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  recent.forEach(v => {
    const row = document.createElement('tr');
    
    // Highlight if due (check all related details)
    let groupIsDue = false;
    let earliestNextReview = null;
    let minInterval = 0;
    
    if (v.related_details && v.related_details.length > 0) {
      v.related_details.forEach(rd => {
        if (new Date(rd.next_review) <= new Date()) {
          groupIsDue = true;
        }
        const rdDate = new Date(rd.next_review);
        if (!earliestNextReview || rdDate < earliestNextReview) {
          earliestNextReview = rdDate;
        }
        if (minInterval === 0 || rd.interval < minInterval) {
          minInterval = rd.interval;
        }
      });
    } else {
      earliestNextReview = new Date(v.next_review || 0);
      minInterval = v.interval || 1;
      groupIsDue = earliestNextReview <= new Date();
    }
    
    const isDue = groupIsDue;
    if (isDue) {
      row.classList.add('vocab-row-due');
    }
    
    const formattedDate = earliestNextReview ? earliestNextReview.toLocaleDateString() : 'Never';
    
    row.innerHTML = `
      <td class="word-cell">${escapeHtml(v.main_word)}</td>
      <td class="ipa-cell">${escapeHtml(v.ipa || '')}</td>
      <td>${escapeHtml(v.translation)}</td>
      <td>
        ${(v.related_words || []).map(rw => `<span class="tag">${escapeHtml(rw)}</span>`).join('')}
      </td>
      <td>
        <span class="stats-badge">
          ${isDue ? '<span class="due">Due Now</span>' : formattedDate}
          <span class="interval">${minInterval}d</span>
        </span>
      </td>
    `;
    elements.recentVocabList.appendChild(row);
  });
}

// --- LIVE FLASHCARD PREVIEW (Add Word tab) ---
function setPreviewText(el, value, placeholder) {
  const trimmed = (value || '').trim();
  el.textContent = trimmed || placeholder;
  el.classList.toggle('is-placeholder', !trimmed);
}

function updateLivePreview() {
  if (!elements.previewMainWord) return;

  const mainWord = elements.vocabMainWord.value.trim();
  const related = elements.vocabRelatedWords.value.trim();
  const combinedWord = related ? `${mainWord} & ${related}` : mainWord;

  setPreviewText(elements.previewMainWord, combinedWord, 'Your word');
  setPreviewText(elements.previewIpa, elements.vocabIpa.value, '/ipa/');
  setPreviewText(elements.previewTranslation, elements.vocabTranslation.value, 'Vietnamese meaning');
  setPreviewText(elements.previewSentenceEn, elements.vocabSentenceEn.value, 'English example sentence appears here...');
  setPreviewText(elements.previewSentenceVi, elements.vocabSentenceVi.value, 'Câu ví dụ tiếng Việt sẽ hiện ở đây...');
}

// --- FORM HANDLERS (ADD/EDIT VOCABULARY) ---
function setupFormHandlers() {
  // Live preview updates
  [elements.vocabMainWord, elements.vocabRelatedWords, elements.vocabIpa, elements.vocabTranslation, elements.vocabSentenceEn, elements.vocabSentenceVi]
    .forEach(el => el.addEventListener('input', updateLivePreview));
  updateLivePreview();

  // Clear button
  elements.btnClearForm.addEventListener('click', () => {
    resetForm();
    logToConsole(elements.aiAssistantOutput, 'Form reset.', 'system');
  });

  // Groq AI Details Generation
  elements.btnAiGenerate.addEventListener('click', async () => {
    const mainWord = elements.vocabMainWord.value.trim();
    const relatedWordsStr = elements.vocabRelatedWords.value.trim();
    
    if (!mainWord) {
      showToast('Please enter a Main Word first.', 'warning');
      elements.vocabMainWord.focus();
      return;
    }

    const apiKey = elements.settingsGroqKey.value.trim();
    const model = elements.settingsGroqModel.value;

    if (!apiKey) {
      showToast('Groq API Key is missing. Go to Settings tab and enter your key first.', 'warning', 5000);
      switchTab('settings');
      return;
    }

    // Disable generate button and spin icon
    elements.btnAiGenerate.disabled = true;
    const icon = elements.btnAiGenerate.querySelector('.rotate-spin');
    if (icon) icon.classList.add('spinning');

    // Show skeleton shimmer on the fields that are about to be filled
    const aiFields = [elements.vocabIpa, elements.vocabTranslation, elements.vocabSentenceVi, elements.vocabSentenceEn];
    aiFields.forEach(f => { f.disabled = true; f.classList.add('field-loading'); });

    logToConsole(elements.aiAssistantOutput, `Generating details for "${mainWord}" using Groq (${model})...`, 'system');

    const relatedArr = relatedWordsStr ? relatedWordsStr.split(',').map(s => s.trim()).filter(s => s.length > 0) : [];
    
    const systemPrompt = `You are a helpful and precise English vocabulary builder. You generate structured dictionary details.`;
    const level = elements.vocabLevel ? elements.vocabLevel.value : 'B1';
    const userPrompt = `
Generate details for combining the English words: "${mainWord}" and "${relatedArr.length > 0 ? relatedArr.join(', ') : 'none'}".
Provide:
1. IPA (International Phonetic Alphabet) pronunciation for both words separated by & (e.g. /word1/ & /word2/).
2. Individual Vietnamese meanings for the words separated by & (e.g. meaning1 & meaning2). IMPORTANT: Do NOT include the English words themselves in the translation text.
3. A creative, natural English sentence demonstrating the use of BOTH words in the same context. The sentence MUST be targeted at CEFR level ${level}.
4. A pure Vietnamese translation of that English sentence. IMPORTANT: Do NOT mix or inject the English words into the Vietnamese sentence.

You MUST respond strictly with a valid JSON object in this format:
{
  "ipa": "/.../ & /.../",
  "translation": "meaning of word 1 & meaning of word 2",
  "example_sentence_vi": "Pure Vietnamese translation of the example sentence",
  "example_sentence_en": "English sentence containing both words"
}

Do not write markdown wrappers (e.g. do NOT include \`\`\`json or \`\`\`). Output only the raw JSON.
`;

    try {
      const response = await window.api.callGroq({
        apiKey,
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        responseFormat: { type: 'json_object' }
      });

      if (response.error) {
        throw new Error(response.error);
      }

      // Extract JSON content
      const contentText = response.choices[0].message.content;
      console.log('AI Response:', contentText);
      
      const firstBrace = contentText.indexOf('{');
      const lastBrace = contentText.lastIndexOf('}');
      if (firstBrace === -1 || lastBrace === -1) {
        throw new Error("Could not find JSON object in AI response");
      }
      const cleanJson = contentText.substring(firstBrace, lastBrace + 1);
      const parsedData = JSON.parse(cleanJson);

      elements.vocabIpa.value = parsedData.ipa || '';
      elements.vocabTranslation.value = parsedData.translation || '';
      elements.vocabSentenceVi.value = parsedData.example_sentence_vi || '';
      elements.vocabSentenceEn.value = parsedData.example_sentence_en || '';
      updateLivePreview();

      logToConsole(elements.aiAssistantOutput, `Successfully generated details for "${mainWord}"!`, 'success');
      logToConsole(elements.aiAssistantOutput, `IPA: ${parsedData.ipa}`, 'ai');
      logToConsole(elements.aiAssistantOutput, `Meanings: ${parsedData.translation}`, 'ai');
      logToConsole(elements.aiAssistantOutput, `Example Sentence (VI): ${parsedData.example_sentence_vi}`, 'ai');
    } catch (err) {
      console.error(err);
      logToConsole(elements.aiAssistantOutput, `Error: ${err.message}`, 'error');
      showToast(`AI generation failed: ${err.message}`, 'error', 5000);
    } finally {
      elements.btnAiGenerate.disabled = false;
      if (icon) icon.classList.remove('spinning');
      aiFields.forEach(f => { f.disabled = false; f.classList.remove('field-loading'); });
    }
  });

  // Form Submission (Save)
  elements.addVocabForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = elements.vocabId.value ? parseInt(elements.vocabId.value) : null;
    const main_word_input = elements.vocabMainWord.value.trim();
    const relatedWordsStr = elements.vocabRelatedWords.value.trim();
    const ipa = elements.vocabIpa.value.trim();
    const translation = elements.vocabTranslation.value.trim();
    const example_sentence_vi = elements.vocabSentenceVi.value.trim();
    const example_sentence_en = elements.vocabSentenceEn.value.trim();

    if (!main_word_input || !translation) {
      showToast('Word 1 and Vietnamese Translation are required.', 'warning');
      return;
    }

    let related_words = relatedWordsStr 
      ? relatedWordsStr.split(',').map(s => s.trim()).filter(s => s.length > 0)
      : [];
      
    let main_word = main_word_input;
    if (related_words.length > 0) {
      main_word = `${main_word_input} & ${related_words.join(' & ')}`;
    }

    const vocab = {
      id,
      main_word,
      ipa,
      translation,
      example_sentence_vi,
      example_sentence_en,
      related_words: [main_word] // Store as 1 card
    };

    try {
      const result = await window.api.saveVocab(vocab);
      
      if (result && result.success) {
        logToConsole(document.getElementById('ai-assistant-output'), 'Vocabulary saved successfully!', 'success');
        showToast('Vocabulary saved successfully!', 'success');
        resetForm();
        await updateAppStats();
        await loadRecentVocab();
      } else {
        showToast(`Failed to save: ${result?.error || 'Duplicate word error'}`, 'error');
      }
    } catch (err) {
      console.error(err);
      showToast(`Failed to save: ${err.message || 'Duplicate word error'}`, 'error');
    }
  });
}

function resetForm() {
  elements.vocabId.value = '';
  elements.vocabMainWord.value = '';
  elements.vocabRelatedWords.value = '';
  elements.vocabIpa.value = '';
  elements.vocabTranslation.value = '';
  elements.vocabSentenceVi.value = '';
  elements.vocabSentenceEn.value = '';
  elements.addVocabForm.querySelector('button[type="submit"]').innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="btn-icon">
      <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
    Save Vocabulary
  `;
  updateLivePreview();
}

// --- LIBRARY HANDLERS ---
let libraryViewMode = localStorage.getItem('library-view-mode') || 'table';
let libraryLastList = [];

function setupLibraryHandlers() {
  elements.librarySearch.addEventListener('input', loadLibraryVocab);
  elements.librarySort.addEventListener('change', loadLibraryVocab);

  elements.btnLibraryViewTable.addEventListener('click', () => setLibraryViewMode('table'));
  elements.btnLibraryViewGrid.addEventListener('click', () => setLibraryViewMode('grid'));

  applyLibraryViewMode();
}

function setLibraryViewMode(mode) {
  libraryViewMode = mode;
  localStorage.setItem('library-view-mode', mode);
  applyLibraryViewMode();
  renderActiveLibraryView();
}

function applyLibraryViewMode() {
  const isGrid = libraryViewMode === 'grid';
  elements.btnLibraryViewTable.classList.toggle('active', !isGrid);
  elements.btnLibraryViewGrid.classList.toggle('active', isGrid);
  elements.libraryTableView.classList.toggle('hide', isGrid);
  elements.libraryCardGrid.classList.toggle('hide', !isGrid);
}

function renderActiveLibraryView() {
  if (libraryViewMode === 'grid') {
    renderLibraryGrid(libraryLastList);
  } else {
    renderLibraryTable(libraryLastList);
  }
}

async function loadLibraryVocab() {
  if (!window.api) return;
  let list = await window.api.listVocab();
  const searchVal = elements.librarySearch.value.toLowerCase().trim();
  const sortBy = elements.librarySort.value;

  // Filter
  if (searchVal) {
    list = list.filter(v => 
      v.main_word.toLowerCase().includes(searchVal) ||
      (v.translation && v.translation.toLowerCase().includes(searchVal)) ||
      (v.example_sentence_vi && v.example_sentence_vi.toLowerCase().includes(searchVal)) ||
      (v.example_sentence_en && v.example_sentence_en.toLowerCase().includes(searchVal)) ||
      (v.related_words || []).some(rw => rw.toLowerCase().includes(searchVal))
    );
  }

  // Sort
  if (sortBy === 'alphabetical') {
    list.sort((a, b) => a.main_word.localeCompare(b.main_word));
  } else if (sortBy === 'due') {
    list.sort((a, b) => {
      const getEarliestReview = (item) => {
        if (!item.related_details || item.related_details.length === 0) {
          return new Date(item.next_review || 0);
        }
        return new Date(Math.min(...item.related_details.map(rd => new Date(rd.next_review))));
      };
      return getEarliestReview(a) - getEarliestReview(b);
    });
  } else if (sortBy === 'mastery') {
    list.sort((a, b) => {
      const getAverageInterval = (item) => {
        if (!item.related_details || item.related_details.length === 0) {
          return item.interval || 0;
        }
        const sum = item.related_details.reduce((acc, rd) => acc + (rd.interval || 0), 0);
        return sum / item.related_details.length;
      };
      return getAverageInterval(b) - getAverageInterval(a);
    });
  } else {
    // 'recent' -> sorted by ID/created_at descending by default from IPC
  }

  libraryLastList = list;
  renderActiveLibraryView();
}

function renderLibraryTable(list) {
  elements.libraryVocabList.innerHTML = '';
  if (list.length === 0) {
    elements.libraryVocabList.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state-enhanced">
            <div class="empty-icon">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.602 10.602z" /></svg>
            </div>
            <h4>No results found</h4>
            <p>Try a different search term or add new vocabulary.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  list.forEach(v => {
    const row = document.createElement('tr');
    
    // Determine due status and earliest review from related details
    let groupIsDue = false;
    let earliestNextReview = null;
    let relatedWordsHtml = '';
    
    if (v.related_details && v.related_details.length > 0) {
      relatedWordsHtml = v.related_details.map(rd => {
        const wordIsDue = new Date(rd.next_review) <= new Date();
        if (wordIsDue) groupIsDue = true;
        
        const rdDate = new Date(rd.next_review);
        if (!earliestNextReview || rdDate < earliestNextReview) {
          earliestNextReview = rdDate;
        }
        
        const tagClass = wordIsDue ? 'tag due-tag' : 'tag';
        const titleText = `${rd.word} (Interval: ${rd.interval}d, Reps: ${rd.repetitions}, Next: ${rd.next_review})`;
        return `<span class="${tagClass}" title="${escapeHtml(titleText)}">${escapeHtml(rd.word)}</span>`;
      }).join('');
    } else {
      relatedWordsHtml = (v.related_words || []).map(rw => `<span class="tag">${escapeHtml(rw)}</span>`).join('');
    }

    const isDue = groupIsDue;
    if (isDue) {
      row.classList.add('vocab-row-due');
    }

    const formattedDate = earliestNextReview ? earliestNextReview.toLocaleDateString() : 'Never';
    
    let statsHtml = '';
    if (v.related_details && v.related_details.length > 0) {
      const dueDetailsCount = v.related_details.filter(rd => new Date(rd.next_review) <= new Date()).length;
      statsHtml = `
        <div class="stats-badge">
          ${isDue ? `<span class="due">${dueDetailsCount} Due</span>` : `<span class="text-muted">${formattedDate}</span>`}
          <div class="mt-2 text-muted" style="font-size:11px; line-height:1.4;">
            Total words: <strong>${v.related_details.length}</strong>
          </div>
        </div>
      `;
    } else {
      statsHtml = `
        <div class="stats-badge">
          ${isDue ? '<span class="due">Due Now</span>' : formattedDate}
        </div>
      `;
    }

    row.innerHTML = `
      <td>
        <div class="word-cell">${escapeHtml(v.main_word)}</div>
        <div class="ipa-cell">${escapeHtml(v.ipa || '')}</div>
      </td>
      <td>${escapeHtml(v.translation)}</td>
      <td>
        <div style="display:flex; flex-wrap:wrap; gap:4px;">
          ${relatedWordsHtml}
        </div>
      </td>
      <td>
        <div class="sentence-en">${escapeHtml(v.example_sentence_en || '')}</div>
        <div class="sentence-vi">${escapeHtml(v.example_sentence_vi || '')}</div>
      </td>
      <td>
        ${statsHtml}
      </td>
      <td>
        <div class="row-action-buttons">
          <button class="btn secondary p-2 btn-edit" data-id="${v.id}" title="Edit">
            Edit
          </button>
          <button class="btn danger-text p-2 btn-delete" data-id="${v.id}" title="Delete">
            Delete
          </button>
        </div>
      </td>
    `;

    // Hook buttons
    row.querySelector('.btn-edit').addEventListener('click', () => editVocab(v));
    row.querySelector('.btn-delete').addEventListener('click', () => deleteVocab(v.id));

    elements.libraryVocabList.appendChild(row);
  });
}

// Words are considered "mastered" once their SM-2 interval reaches 21 days (same threshold used in dashboard stats).
const MASTERY_INTERVAL_DAYS = 21;

function renderLibraryGrid(list) {
  const grid = elements.libraryCardGrid;
  grid.innerHTML = '';

  if (list.length === 0) {
    grid.innerHTML = `
      <div class="empty-state-enhanced" style="grid-column: 1 / -1;">
        <div class="empty-icon">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.602 10.602z" /></svg>
        </div>
        <h4>No results found</h4>
        <p>Try a different search term or add new vocabulary.</p>
      </div>
    `;
    return;
  }

  list.forEach(v => {
    const card = document.createElement('div');
    card.className = 'vocab-card';

    const items = (v.related_details && v.related_details.length > 0) ? v.related_details : [{ interval: v.interval || 0, next_review: v.next_review }];
    const isDue = items.some(rd => new Date(rd.next_review) <= new Date());
    if (isDue) card.classList.add('vocab-row-due');

    const avgInterval = items.reduce((sum, rd) => sum + (rd.interval || 0), 0) / items.length;
    const masteryPercent = Math.min(100, Math.round((avgInterval / MASTERY_INTERVAL_DAYS) * 100));

    const tagsHtml = (v.related_words || []).map(rw => `<span class="tag">${escapeHtml(rw)}</span>`).join('');

    card.innerHTML = `
      <div class="vocab-card-header">
        <span class="vocab-card-word">${escapeHtml(v.main_word)}</span>
        <span class="vocab-card-ipa">${escapeHtml(v.ipa || '')}</span>
      </div>
      <div class="vocab-card-translation">${escapeHtml(v.translation)}</div>
      ${v.example_sentence_en ? `<div class="vocab-card-sentence">${escapeHtml(v.example_sentence_en)}</div>` : ''}
      ${tagsHtml ? `<div class="vocab-card-tags">${tagsHtml}</div>` : ''}
      <div class="vocab-card-mastery">
        <div class="vocab-card-mastery-label"><span>Mastery</span><span>${masteryPercent}%</span></div>
        <div class="vocab-card-mastery-track"><div class="vocab-card-mastery-fill" style="width:${masteryPercent}%"></div></div>
      </div>
      <div class="vocab-card-footer">
        ${isDue ? '<span class="vocab-card-due-tag">Due now</span>' : '<span class="text-muted" style="font-size:11px;">Not due</span>'}
        <div class="row-action-buttons">
          <button class="btn secondary p-2 btn-edit" data-id="${v.id}" title="Edit">Edit</button>
          <button class="btn danger-text p-2 btn-delete" data-id="${v.id}" title="Delete">Delete</button>
        </div>
      </div>
    `;

    card.querySelector('.btn-edit').addEventListener('click', () => editVocab(v));
    card.querySelector('.btn-delete').addEventListener('click', () => deleteVocab(v.id));

    grid.appendChild(card);
  });
}

function editVocab(v) {
  elements.vocabId.value = v.id;

  // main_word được lưu dạng "word1 & word2", cần tách lại để hiển thị đúng
  const mainWordParts = (v.main_word || '').split('&').map(s => s.trim());
  elements.vocabMainWord.value = mainWordParts[0] || v.main_word;
  elements.vocabRelatedWords.value = mainWordParts.slice(1).join(', ');

  elements.vocabIpa.value = v.ipa || '';
  elements.vocabTranslation.value = v.translation;
  elements.vocabSentenceVi.value = v.example_sentence_vi || '';
  elements.vocabSentenceEn.value = v.example_sentence_en || '';
  
  elements.addVocabForm.querySelector('button[type="submit"]').innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="btn-icon">
      <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    </svg>
    Update Vocabulary
  `;
  updateLivePreview();

  switchTab('add-word');
}

async function deleteVocab(id) {
  // Use a custom confirm-style toast instead of native confirm
  const confirmed = await new Promise(resolve => {
    const t = showToast('Delete this vocabulary item? Click again to confirm.', 'warning', 5000);
    if (!t) { resolve(false); return; }
    t.style.cursor = 'pointer';
    t.addEventListener('click', () => { resolve(true); t.remove(); }, { once: true });
    setTimeout(() => resolve(false), 5100);
  });
  if (!confirmed) return;
  const success = await window.api.deleteVocab(id);
  if (success) {
    showToast('Vocabulary deleted.', 'info');
    await updateAppStats();
    await loadLibraryVocab();
  } else {
    showToast('Delete failed. Please try again.', 'error');
  }
}

// --- REVIEW SESSION ENGINE ---
async function initializeReviewTab() {
  const due = await window.api.dueVocab();
  dueCount = due.length;
  elements.reviewDueCountBadge.textContent = dueCount;
  
  // Show start state
  elements.reviewStartState.classList.remove('hide');
  elements.reviewActiveState.classList.add('hide');
  elements.reviewFinishedState.classList.add('hide');
}

function setupReviewHandlers() {
  elements.dashboardStartReview.addEventListener('click', () => switchTab('review'));
  elements.btnStartReviewSession.addEventListener('click', startReviewSession);
  
  // Audio button - Review Stage 1: phát từ 1
  elements.btnAudioS1.addEventListener('click', () => {
    const activeWord = activeReviewQueue[currentReviewIndex];
    if (activeWord) {
      const parts = activeWord.word.split('&').map(s => s.trim());
      speak(parts[0]);
    }
  });

  // Audio button - Review Stage 2: phát từ 2
  elements.btnAudioS2.addEventListener('click', () => {
    const activeWord = activeReviewQueue[currentReviewIndex];
    if (activeWord) {
      const parts = activeWord.word.split('&').map(s => s.trim());
      const word2 = parts.length > 1 ? parts[1] : '';
      if (word2) speak(word2);
    }
  });

  // Stage 1 checking
  elements.btnS1Submit.addEventListener('click', checkSpellingStage);
  elements.reviewS1Input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') checkSpellingStage();
  });
  elements.btnS1Next.addEventListener('click', () => transitionToStage(2));

  // Stage 2 checking
  elements.btnS2Submit.addEventListener('click', checkRelatedStage);
  elements.reviewS2Input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') checkRelatedStage();
  });
  elements.btnS2Next.addEventListener('click', () => transitionToStage(3));

  // Stage 3 checking
  elements.btnS3Submit.addEventListener('click', checkTranslationStage);
  elements.btnS3Finish.addEventListener('click', finishActiveCard);
}

async function startReviewSession() {
  activeReviewQueue = await window.api.dueVocab();
  if (activeReviewQueue.length === 0) {
    showToast('No due vocabulary items to review! Come back later.', 'info');
    return;
  }
  
  // Reset session metrics
  currentReviewIndex = 0;
  sessionStats = {
    reviewed: activeReviewQueue.length,
    spellingCorrect: 0,
    aiGradings: 0
  };
  
  elements.reviewStartState.classList.add('hide');
  elements.reviewActiveState.classList.remove('hide');

  elements.reviewLogsBox.innerHTML = '';
  logToConsole(elements.reviewLogsBox, `Reviewing ${activeReviewQueue.length} due items.`, 'system');

  buildSegmentTrack();
  loadActiveCard();
}

function buildSegmentTrack() {
  const track = elements.reviewSegmentTrack;
  if (!track) return;
  track.innerHTML = '';
  activeReviewQueue.forEach((_, i) => {
    const seg = document.createElement('div');
    seg.className = 'segment';
    seg.id = `review-segment-${i}`;
    track.appendChild(seg);
  });
}

function updateSegmentTrack() {
  activeReviewQueue.forEach((_, i) => {
    const seg = document.getElementById(`review-segment-${i}`);
    if (!seg) return;
    seg.classList.remove('done', 'current');
    if (i < currentReviewIndex) seg.classList.add('done');
    else if (i === currentReviewIndex) seg.classList.add('current');
  });
}

function loadActiveCard() {
  const vocab = activeReviewQueue[currentReviewIndex];

  // Update overall progress info
  elements.reviewCurrentIndex.textContent = currentReviewIndex + 1;
  elements.reviewTotalCount.textContent = activeReviewQueue.length;
  updateSegmentTrack();

  logToConsole(elements.reviewLogsBox, `Loading card: "${vocab.word.charAt(0)}..."`, 'system');

  // Trigger S1 elements
  transitionToStage(1);
}

function transitionToStage(stageNum) {
  // Hide all panels
  elements.reviewStage1.classList.remove('active');
  elements.reviewStage1.classList.add('hide');
  elements.reviewStage2.classList.remove('active');
  elements.reviewStage2.classList.add('hide');
  elements.reviewStage3.classList.remove('active');
  elements.reviewStage3.classList.add('hide');
  
  const vocab = activeReviewQueue[currentReviewIndex];

  if (stageNum === 1) {
    elements.reviewCardStageName.textContent = 'Step 1: Write Word';
    elements.reviewStage1.classList.add('active');
    elements.reviewStage1.classList.remove('hide');
    
    // Clear inputs & feedback
    elements.reviewS1Input.value = '';
    elements.reviewS1Input.disabled = false;
    elements.reviewS1Feedback.classList.add('hide');
    elements.reviewS1Feedback.innerHTML = '';
    elements.btnS1Submit.classList.remove('hide');
    elements.btnS1Next.classList.add('hide');
    
    // Load prompt
    const ipaParts = (vocab.ipa || '').split('&').map(s => s.trim());
    const transParts = (vocab.translation || '').split('&').map(s => s.trim());
    
    elements.reviewIpaPrompt.textContent = ipaParts[0] || vocab.ipa || '[No IPA]';
    elements.reviewTranslationPrompt.textContent = transParts[0] || vocab.translation;
    
    const parts = vocab.word.split('&').map(s => s.trim());
    const word1 = parts[0];

    // Focus
    setTimeout(() => {
      elements.reviewS1Input.focus();
      // Auto-play audio if checked
      if (elements.reviewAutoAudio.checked) {
        speak(word1);
      }
    }, 100);
    
  } else if (stageNum === 2) {
    elements.reviewCardStageName.textContent = 'Step 2: Related Words';
    elements.reviewStage2.classList.add('active');
    elements.reviewStage2.classList.remove('hide');
    
    // Clear inputs & feedback
    elements.reviewS2Input.value = '';
    elements.reviewS2Input.disabled = false;
    elements.reviewS2Feedback.classList.add('hide');
    elements.reviewS2Feedback.innerHTML = '';
    elements.btnS2Submit.classList.remove('hide');
    elements.btnS2Next.classList.add('hide');
    
    // Load prompt
    const ipaParts = (vocab.ipa || '').split('&').map(s => s.trim());
    const transParts = (vocab.translation || '').split('&').map(s => s.trim());
    
    elements.reviewS2Ipa.textContent = ipaParts.length > 1 ? ipaParts.slice(1).join(' & ') : vocab.ipa || '[No IPA]';
    elements.reviewS2Translation.textContent = transParts.length > 1 ? transParts.slice(1).join(' & ') : vocab.translation;
    
    setTimeout(() => {
      elements.reviewS2Input.focus();
      // Auto-play từ 2 nếu bật auto-audio
      if (elements.reviewAutoAudio.checked) {
        const parts = vocab.word.split('&').map(s => s.trim());
        const word2 = parts.length > 1 ? parts[1] : '';
        if (word2) speak(word2);
      }
    }, 100);
    
  } else if (stageNum === 3) {
    elements.reviewCardStageName.textContent = 'Step 3: Translate Sentence';
    elements.reviewStage3.classList.add('active');
    elements.reviewStage3.classList.remove('hide');
    
    // Clear inputs & feedback
    elements.reviewS3Input.value = '';
    elements.reviewS3Input.disabled = false;
    elements.reviewS3Feedback.classList.add('hide');
    elements.reviewS3Feedback.innerHTML = '';
    elements.btnS3Submit.disabled = false;
    elements.btnS3Submit.classList.remove('hide');
    elements.btnS3Finish.classList.add('hide');
    
    // Load prompt
    elements.reviewS3MainWord.textContent = vocab.main_word;
    
    elements.reviewS3RelatedBadges.innerHTML = '';
    
    // Exclude the active review word from display in the related words tags in Step 3
    const displayRelated = (vocab.related_words || []).filter(w => w.trim().toLowerCase() !== vocab.word.trim().toLowerCase());
    if (displayRelated.length > 0) {
      displayRelated.forEach(rw => {
        const span = document.createElement('span');
        span.className = 'tag';
        span.textContent = rw;
        elements.reviewS3RelatedBadges.appendChild(span);
      });
    } else {
      elements.reviewS3RelatedBadges.textContent = 'none';
    }
    
    elements.reviewS3SentenceVi.textContent = vocab.example_sentence_vi || '[No Vietnamese example sentence entered]';
    
    setTimeout(() => elements.reviewS3Input.focus(), 100);
  }
}

// Check Stage 1 Spelling
function checkSpellingStage() {
  const vocab = activeReviewQueue[currentReviewIndex];
  const userTyped = elements.reviewS1Input.value.trim().toLowerCase();
  const parts = vocab.word.split('&').map(s => s.trim().toLowerCase());
  const correct = parts[0];
  
  if (!userTyped) return;
  
  elements.reviewS1Input.disabled = true;
  elements.btnS1Submit.classList.add('hide');
  elements.btnS1Next.classList.remove('hide');
  
  const feedbackDiv = elements.reviewS1Feedback;
  feedbackDiv.classList.remove('hide');
  feedbackDiv.classList.remove('correct-anim', 'incorrect-anim');

  // Voice confirmation
  speak(correct);

  if (userTyped === correct) {
    feedbackDiv.classList.add('correct-anim');
    sessionStats.spellingCorrect++;
    logToConsole(elements.reviewLogsBox, `Spelling correct: "${correct}"`, 'success');
    feedbackDiv.innerHTML = `
      <div class="feedback-status correct">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
        Correct!
      </div>
      <div class="feedback-answer-comparison">
        <p>You spelled the word perfectly: <strong>${escapeHtml(vocab.word)}</strong></p>
      </div>
    `;
    // Attach marker to temporary array
    vocab.spellingFailed = false;
  } else {
    feedbackDiv.classList.add('incorrect-anim');
    logToConsole(elements.reviewLogsBox, `Spelling incorrect for "${vocab.word}" (Typed: "${userTyped}")`, 'error');
    feedbackDiv.innerHTML = `
      <div class="feedback-status incorrect">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        Incorrect
      </div>
      <div class="feedback-answer-comparison">
        <p>Correct spelling: <strong class="diff-correct">${escapeHtml(vocab.word)}</strong></p>
        <p>Your input: <span class="diff-wrong">${escapeHtml(elements.reviewS1Input.value)}</span></p>
      </div>
    `;
    vocab.spellingFailed = true;
  }
  elements.btnS1Next.focus();
}

// Check Stage 2 Related Words
function checkRelatedStage() {
  const vocab = activeReviewQueue[currentReviewIndex];
  const userTyped = elements.reviewS2Input.value.trim().toLowerCase();
  
  elements.reviewS2Input.disabled = true;
  elements.btnS2Submit.classList.add('hide');
  elements.btnS2Next.classList.remove('hide');
  
  const feedbackDiv = elements.reviewS2Feedback;
  feedbackDiv.classList.remove('hide');
  feedbackDiv.classList.remove('correct-anim', 'incorrect-anim');

  const parts = vocab.word.split('&').map(s => s.trim().toLowerCase());
  const word2 = parts.length > 1 ? parts.slice(1).join(' & ') : '';

  if (!word2) {
    feedbackDiv.innerHTML = `
      <div class="feedback-status correct">No Word 2 stored for this card.</div>
    `;
    vocab.relatedCountCorrect = 1;
    vocab.relatedTotal = 1;
    elements.btnS2Next.focus();
    return;
  }

  const isCorrect = userTyped === word2;
  vocab.relatedCountCorrect = isCorrect ? 1 : 0;
  vocab.relatedTotal = 1;
  feedbackDiv.classList.add(isCorrect ? 'correct-anim' : 'incorrect-anim');

  if (isCorrect) {
    logToConsole(elements.reviewLogsBox, `Word 2 recalled: "${word2}"`, 'success');
    feedbackDiv.innerHTML = `
      <div class="feedback-status correct">Perfect Recall!</div>
      <div class="feedback-answer-comparison">
        <p>You correctly remembered: <strong class="diff-correct">${escapeHtml(word2)}</strong></p>
      </div>
    `;
  } else {
    logToConsole(elements.reviewLogsBox, `Word 2 incorrect (Expected: "${word2}", Typed: "${userTyped}")`, 'error');
    feedbackDiv.innerHTML = `
      <div class="feedback-status incorrect">Study Needed</div>
      <div class="feedback-answer-comparison">
        <p>Correct Word 2: <strong class="diff-correct">${escapeHtml(word2)}</strong></p>
        <p>Your input: <span class="diff-wrong">${escapeHtml(elements.reviewS2Input.value)}</span></p>
      </div>
    `;
  }
  elements.btnS2Next.focus();
}

// Check Stage 3 AI Translation
async function checkTranslationStage() {
  const vocab = activeReviewQueue[currentReviewIndex];
  const userTranslation = elements.reviewS3Input.value.trim();
  
  if (!userTranslation) return;
  
  elements.reviewS3Input.disabled = true;
  elements.btnS3Submit.disabled = true;
  
  const feedbackDiv = elements.reviewS3Feedback;
  feedbackDiv.classList.remove('hide');
  feedbackDiv.innerHTML = `
    <div class="ai-loading-box">
      <svg class="spinner" viewBox="0 0 50 50">
        <circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle>
      </svg>
      <span>Groq AI is evaluating your translation...</span>
    </div>
  `;
  
  const apiKey = await window.api.getSetting('groq-key');
  const model = await window.api.getSetting('groq-model') || 'llama-3.3-70b-versatile';

  let evaluationResult = { is_correct: false, feedback: '' };

  if (apiKey && apiKey.trim() && vocab.example_sentence_en) {
    // We have AI key: evaluate semantically
    logToConsole(elements.reviewLogsBox, 'Submitting translation to Groq for evaluation...', 'system');
    
    const systemPrompt = `You are a strict but fair English language evaluator. Evaluate if the user's sentence has the same meaning as the target English sentence.`;
    const userPrompt = `
Vietnamese Context: "${vocab.example_sentence_vi}"
Target English Sentence: "${vocab.example_sentence_en}"
User's Translation: "${userTranslation}"

Evaluate if the user's translation is semantically correct, natural, and accurately translates the Vietnamese context. 
Accept minor variations, alternate synonyms, and punctuation differences, but reject incorrect grammar, tense mismatch, or wrong vocabulary selection.

You MUST respond strictly with a valid JSON object in this format:
{
  "is_correct": true,
  "feedback": "A short 1-2 sentence constructive comment in Vietnamese highlighting mistakes, vocabulary alternatives, or grammatical notes. If correct, praise the translation and point out any tiny improvements."
}

Do not write markdown wrappers (e.g. do NOT include \`\`\`json or \`\`\`). Output only the raw JSON.
`;

    try {
      const response = await window.api.callGroq({
        apiKey,
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        responseFormat: { type: 'json_object' }
      });

      if (response.error) throw new Error(response.error);

      const contentText = response.choices[0].message.content;
      console.log('AI Evaluation Response:', contentText);
      
      const cleanJson = contentText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsedData = JSON.parse(cleanJson);
      
      evaluationResult.is_correct = !!parsedData.is_correct;
      evaluationResult.feedback = parsedData.feedback || '';
      sessionStats.aiGradings++;
      
    } catch (err) {
      console.error(err);
      logToConsole(elements.reviewLogsBox, `AI Evaluation failed: ${err.message}. Falling back to self-grading.`, 'error');
      setupSelfGradingFallback(vocab, userTranslation);
      return;
    }
  } else {
    // No API key or no target sentence: fallback to visual diff self-grading
    logToConsole(elements.reviewLogsBox, 'No API key or correct sentence stored. Using self-evaluation fallback.', 'system');
    setupSelfGradingFallback(vocab, userTranslation);
    return;
  }

  // Display AI Results
  renderAIResults(vocab, userTranslation, evaluationResult);
}

function renderAIResults(vocab, userTranslation, result) {
  elements.btnS3Submit.classList.add('hide');
  elements.btnS3Finish.classList.remove('hide');
  
  const feedbackDiv = elements.reviewS3Feedback;
  feedbackDiv.innerHTML = '';
  feedbackDiv.classList.remove('correct-anim', 'incorrect-anim');
  feedbackDiv.classList.add(result.is_correct ? 'correct-anim' : 'incorrect-anim');

  const statusClass = result.is_correct ? 'correct' : 'incorrect';
  const statusIcon = result.is_correct 
    ? `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>`
    : `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>`;
  const statusText = result.is_correct ? 'AI Verdict: Correct' : 'AI Verdict: Needs Practice';
  
  logToConsole(elements.reviewLogsBox, `AI Verdict: ${result.is_correct ? 'PASSED' : 'FAILED'}`, result.is_correct ? 'success' : 'error');

  feedbackDiv.innerHTML = `
    <div class="feedback-status ${statusClass}">
      ${statusIcon}
      ${statusText}
    </div>
    <div class="feedback-answer-comparison">
      <p class="text-muted">Target Sentence:</p>
      <p class="mb-2"><strong class="diff-correct" style="background:none; border: 1px solid rgba(20, 184, 166, 0.3); font-weight:normal;">${escapeHtml(vocab.example_sentence_en)}</strong></p>
      <p class="text-muted">Your Input:</p>
      <p class="mb-3"><span class="${result.is_correct ? 'diff-correct' : 'diff-wrong'}" style="text-decoration:none;">${escapeHtml(userTranslation)}</span></p>
      
      <div class="feedback-text-comment">
        <p><strong>AI Comments:</strong></p>
        <p>${escapeHtml(result.feedback)}</p>
      </div>
    </div>
  `;
  
  // Save active evaluation
  vocab.translationFailed = !result.is_correct;
  
  elements.btnS3Finish.disabled = false;
  elements.btnS3Finish.focus();
}

function setupSelfGradingFallback(vocab, userTranslation) {
  elements.btnS3Submit.classList.add('hide');
  
  const feedbackDiv = elements.reviewS3Feedback;
  feedbackDiv.innerHTML = `
    <div class="feedback-status" style="color:#f59e0b;">
      Self Evaluation
    </div>
    <div class="feedback-answer-comparison">
      <p class="text-muted">Target English Sentence:</p>
      <p class="mb-2"><strong>${escapeHtml(vocab.example_sentence_en || '[None]')}</strong></p>
      <p class="text-muted">Your Translation:</p>
      <p class="mb-4">${escapeHtml(userTranslation)}</p>
      
      <div class="self-evaluate-buttons mt-4" style="display:flex; gap:12px; justify-content:center;">
        <button id="btn-self-correct" class="btn primary-glowing" style="background-color:#10b981; border-color:#10b981;">I got it right</button>
        <button id="btn-self-wrong" class="btn secondary" style="color:#ef4444; border-color:rgba(239, 68, 68, 0.3);">I was wrong</button>
      </div>
    </div>
  `;
  
  document.getElementById('btn-self-correct').addEventListener('click', () => {
    vocab.translationFailed = false;
    finishFallbackGrading(true);
  });
  
  document.getElementById('btn-self-wrong').addEventListener('click', () => {
    vocab.translationFailed = true;
    finishFallbackGrading(false);
  });
}

function finishFallbackGrading(wasCorrect) {
  logToConsole(elements.reviewLogsBox, `Self Evaluation: ${wasCorrect ? 'PASSED' : 'FAILED'}`, wasCorrect ? 'success' : 'error');
  elements.reviewS3Feedback.classList.remove('correct-anim', 'incorrect-anim');
  elements.reviewS3Feedback.classList.add(wasCorrect ? 'correct-anim' : 'incorrect-anim');
  elements.reviewS3Feedback.innerHTML = `
    <div class="feedback-status ${wasCorrect ? 'correct' : 'incorrect'}">
      Graded: ${wasCorrect ? 'Correct' : 'Incorrect'}
    </div>
    <p class="text-muted">Moving to next card...</p>
  `;
  
  finishActiveCard();
}

async function finishActiveCard() {
  const vocab = activeReviewQueue[currentReviewIndex];
  
  // Calculate Quality Score (0 to 5)
  // spellingFailed (T/F), related (count/total), translationFailed (T/F)
  let quality = 3; // Acceptable by default
  
  const spellingOK = !vocab.spellingFailed;
  const translationOK = !vocab.translationFailed;
  
  // Calculate relative accuracy of related words
  let relatedAccuracy = 1.0;
  if (vocab.relatedTotal > 0) {
    relatedAccuracy = vocab.relatedCountCorrect / vocab.relatedTotal;
  }
  
  if (spellingOK && translationOK) {
    if (relatedAccuracy === 1.0) quality = 5; // Perfect
    else if (relatedAccuracy >= 0.5) quality = 4; // Good
    else quality = 3;
  } else if (spellingOK && !translationOK) {
    quality = 2; // Hard
  } else if (!spellingOK && translationOK) {
    quality = 3; // Spelled wrong but translation is correct
  } else {
    // Both failed
    quality = 1; // Very hard
  }
  
  // Standard SM-2 Spaced Repetition Algorithm
  let interval = vocab.interval || 1;
  let easeFactor = vocab.ease_factor || 2.5;
  let repetitions = vocab.repetitions || 0;
  
  if (quality < 3) {
    // Reset repetitions & interval
    repetitions = 0;
    interval = 1;
  } else {
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.ceil(interval * easeFactor);
    }
    repetitions = repetitions + 1;
  }
  
  // Ease factor adjuster formula
  easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  easeFactor = Math.max(1.3, easeFactor); // Keep minimum ease factor
  
  // Calculate next review timestamp (Local Time ISO)
  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + interval);
  
  // SQLite format: YYYY-MM-DD HH:MM:SS
  const pad = (num) => String(num).padStart(2, '0');
  const nextReviewIso = `${nextReviewDate.getFullYear()}-${pad(nextReviewDate.getMonth()+1)}-${pad(nextReviewDate.getDate())} ${pad(nextReviewDate.getHours())}:${pad(nextReviewDate.getMinutes())}:${pad(nextReviewDate.getSeconds())}`;
  
  // Update in SQLite database
  await window.api.updateReview(vocab.id, interval, easeFactor, repetitions, nextReviewIso);
  
  logToConsole(elements.reviewLogsBox, `Updated SM-2: Interval ${interval}d, Ease: ${easeFactor.toFixed(2)}, Next: ${nextReviewIso}`, 'system');

  // Move forward
  if (currentReviewIndex + 1 < activeReviewQueue.length) {
    currentReviewIndex++;
    loadActiveCard();
  } else {
    // Completed Session
    showReviewComplete();
  }
}

function showReviewComplete() {
  elements.reviewActiveState.classList.add('hide');
  elements.reviewFinishedState.classList.remove('hide');
  
  elements.summaryTotalReviewed.textContent = sessionStats.reviewed;
  elements.summaryCorrectFirst.textContent = sessionStats.spellingCorrect;
  elements.summaryAiEvals.textContent = sessionStats.aiGradings;
  
  // Update study streak daily trigger
  updateActiveStreak();
  recordReviewActivity(sessionStats.reviewed);

  // Update daily goal progress
  const today = new Date().toDateString();
  const prevDate = localStorage.getItem('daily-reviewed-date');
  let dailyCount = (prevDate === today) ? parseInt(localStorage.getItem('daily-reviewed-today') || '0') : 0;
  dailyCount += sessionStats.reviewed;
  localStorage.setItem('daily-reviewed-today', dailyCount.toString());
  localStorage.setItem('daily-reviewed-date', today);
  
  const goalTarget = parseInt(localStorage.getItem('daily-goal-target') || '10');
  if (dailyCount >= goalTarget) {
    showToast(`🎉 Daily goal reached! ${dailyCount}/${goalTarget} words reviewed today.`, 'success', 5000);
  } else {
    showToast(`Session done! ${dailyCount}/${goalTarget} daily goal progress.`, 'info', 4000);
  }
  updateGoalRing();
}

// --- BACKUP & EXPORT/IMPORT SERVICES ---
function setupBackupHandlers() {
  elements.btnExportDb.addEventListener('click', async () => {
    try {
      const vocabList = await window.api.listVocab();
      const groqKey = await window.api.getSetting('groq-key');
      const groqModel = await window.api.getSetting('groq-model');
      
      const backupData = {
        exportedAt: new Date().toISOString(),
        settings: {
          'groq-key': groqKey || '',
          'groq-model': groqModel || 'llama-3.3-70b-versatile'
        },
        vocabularies: vocabList
      };

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `english_vocab_backup_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      
      showToast('Database exported successfully as JSON file.', 'success');
    } catch (error) {
      showToast(`Export failed: ${error.message}`, 'error');
    }
  });

  elements.btnImportDbTrigger.addEventListener('click', () => {
    elements.settingsDbImportFile.click();
  });

  elements.settingsDbImportFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const importData = JSON.parse(event.target.result);
        
        if (!importData.vocabularies || !Array.isArray(importData.vocabularies)) {
          throw new Error('Invalid backup file format.');
        }

        // Restore settings
        if (importData.settings && window.api) {
          for (const [key, value] of Object.entries(importData.settings)) {
            await window.api.setSetting(key, value);
          }
        }

        // Restore Vocabs
        let successCount = 0;
        if (window.api) {
          for (const vocab of importData.vocabularies) {
            // Reset ID to let SQLite generate fresh auto-increment IDs and avoid conflicts, 
            // or retain if overwriting. Let's strip the ID to safely append items.
            const cleanVocab = {
              main_word: vocab.main_word,
              ipa: vocab.ipa,
              translation: vocab.translation,
              example_sentence_vi: vocab.example_sentence_vi,
              example_sentence_en: vocab.example_sentence_en,
              related_words: vocab.related_words || []
            };
            const result = await window.api.saveVocab(cleanVocab);
            if (result.success) successCount++;
          }
        }

        showToast(`Import completed! ${successCount} words imported successfully.`, 'success', 5000);
        await loadSettings();
        await updateAppStats();
      } catch (error) {
        showToast(`Import failed: ${error.message}`, 'error');
      }
    };
    reader.readAsText(file);
  });

  // Save AI Settings
  elements.btnSaveAiSettings.addEventListener('click', async () => {
    const apiKey = elements.settingsGroqKey.value.trim();
    const model = elements.settingsGroqModel.value;

    try {
      if (window.api) {
        await window.api.setSetting('groq-key', apiKey);
        await window.api.setSetting('groq-model', model);
        console.log("Saved settings to database. Key length:", apiKey.length);
      } else {
        console.warn("window.api is not available; settings saved only in memory.");
      }
      
      // Refresh models list dynamically based on the newly saved API Key
      await populateGroqModels(apiKey, model);
      
      updateGroqStatus(apiKey);
      showToast('AI integration settings saved successfully!', 'success');
    } catch (err) {
      console.error("Failed to save AI settings to database:", err);
      showToast(`Failed to save settings: ${err.message}`, 'error');
    }
  });

  // Toggle Key Visibility
  elements.btnToggleKeyVisibility.addEventListener('click', () => {
    const input = elements.settingsGroqKey;
    if (input.type === 'password') {
      input.type = 'text';
      elements.btnToggleKeyVisibility.textContent = 'Hide';
    } else {
      input.type = 'password';
      elements.btnToggleKeyVisibility.textContent = 'Show';
    }
  });
}

// --- UTILITY FUNCTIONS ---
function escapeHtml(unsafe) {
  if (unsafe === undefined || unsafe === null) return '';
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// --- DEBUG TAB SERVICES ---
function setupDebugHandlers() {
  if (elements.btnClearDebugLogs) {
    elements.btnClearDebugLogs.addEventListener('click', () => {
      if (elements.debugConsoleLogs) {
        elements.debugConsoleLogs.innerHTML = '<div class="console-line system">Logs cleared.</div>';
      }
    });
  }
}

async function initializeDebugTab() {
  // 1. Get database path from backend
  if (window.api && window.api.getDbPath) {
    try {
      const dbPath = await window.api.getDbPath();
      elements.debugDbPath.textContent = dbPath || "Database path empty";
      console.log("Database absolute path loaded:", dbPath);
    } catch (err) {
      elements.debugDbPath.textContent = `Error getting path: ${err.message}`;
      console.error("Failed to get DB path:", err);
    }
  } else {
    elements.debugDbPath.textContent = "window.api.getDbPath is not available (Browser mode?)";
  }

  // 2. Fetch settings table from SQLite database to list available keys
  if (window.api && window.api.getSetting) {
    try {
      const keysToTest = ['groq-key', 'groq-model', 'audio-voice-uri', 'audio-rate', 'audio-pitch'];
      elements.debugSettingsList.innerHTML = '';
      
      for (const key of keysToTest) {
        const val = await window.api.getSetting(key);
        const row = document.createElement('tr');
        
        let displayVal = '<span class="text-muted">empty / not set</span>';
        if (val !== null && val !== undefined) {
          if (key === 'groq-key') {
            // Mask API key: e.g. "gsk_...xyz"
            const trimmed = val.trim();
            if (trimmed.length > 8) {
              displayVal = `<code>${trimmed.substring(0, 6)}...${trimmed.substring(trimmed.length - 4)}</code> (length: ${trimmed.length})`;
            } else {
              displayVal = `<code>Present (length: ${trimmed.length})</code>`;
            }
          } else {
            displayVal = `<code>${escapeHtml(val)}</code>`;
          }
        }
        
        row.innerHTML = `
          <td style="font-family:monospace; font-weight:600; color:#a5b4fc;">${key}</td>
          <td>${displayVal}</td>
        `;
        elements.debugSettingsList.appendChild(row);
      }
    } catch (err) {
      console.error("Failed to retrieve settings metadata:", err);
      elements.debugSettingsList.innerHTML = `<tr><td colspan="2" class="console-line error">Error: ${escapeHtml(err.message)}</td></tr>`;
    }
  } else {
    elements.debugSettingsList.innerHTML = `<tr><td colspan="2" class="console-line error">SQLite settings access is not available</td></tr>`;
  }
}
