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
    getGroqModels: (apiKey) => invoke('get_groq_models', { apiKey })
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
  btnDashStartReview: document.getElementById('dashboard-start-review'),
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
  btnAiGenerate: document.getElementById('btn-ai-generate'),
  btnClearForm: document.getElementById('btn-clear-form'),
  aiAssistantOutput: document.getElementById('ai-assistant-output'),
  
  // Library
  librarySearch: document.getElementById('library-search-input'),
  librarySort: document.getElementById('library-sort-select'),
  libraryVocabList: document.getElementById('library-vocab-list'),
  
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
  reviewProgressBar: document.getElementById('review-session-progress-bar'),
  
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
  reviewS2MainWord: document.getElementById('review-s2-main-word'),
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
  settingsDbImportFile: document.getElementById('settings-db-import-file')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  await loadSettings();
  setupAudioEngine();
  setupFormHandlers();
  setupLibraryHandlers();
  setupReviewHandlers();
  setupBackupHandlers();
  
  // Initial load of statistics
  await updateAppStats();
  await loadRecentVocab();
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
  audioSettings.voiceURI = await window.api.getSetting('audio-voice-uri') || '';
  audioSettings.rate = parseFloat(await window.api.getSetting('audio-rate') || '1.0');
  audioSettings.pitch = parseFloat(await window.api.getSetting('audio-pitch') || '1.0');
  
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
  const populateVoices = () => {
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
    const tempUtterance = new SpeechSynthesisUtterance('Meticulous. Meticulous translation evaluation works.');
    const selectedVoiceURI = elements.settingsAudioVoice.value;
    const voice = availableVoices.find(v => v.voiceURI === selectedVoiceURI);
    if (voice) tempUtterance.voice = voice;
    tempUtterance.rate = parseFloat(elements.settingsAudioRate.value);
    tempUtterance.pitch = parseFloat(elements.settingsAudioPitch.value);
    window.speechSynthesis.speak(tempUtterance);
  });

  // Save Audio button
  elements.btnSaveAudioSettings.addEventListener('click', async () => {
    audioSettings.voiceURI = elements.settingsAudioVoice.value;
    audioSettings.rate = parseFloat(elements.settingsAudioRate.value);
    audioSettings.pitch = parseFloat(elements.settingsAudioPitch.value);
    
    await window.api.setSetting('audio-voice-uri', audioSettings.voiceURI);
    await window.api.setSetting('audio-rate', audioSettings.rate.toString());
    await window.api.setSetting('audio-pitch', audioSettings.pitch.toString());
    
    alert('Audio settings saved successfully.');
  });
}

function speak(text) {
  if (!text) return;
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
}

// --- TABS & NAVIGATION ---
function setupNavigation() {
  elements.navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
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
  elements.pageTitle.textContent = activeBtn ? activeBtn.textContent.trim() : 'Dashboard';
  
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
  }
}

// --- APP STATISTICS & DASHBOARD ---
async function updateAppStats() {
  const vocabList = await window.api.listVocab();
  const dueVocab = await window.api.dueVocab();
  
  totalCount = vocabList.length;
  dueCount = dueVocab.length;
  
  // Calculation of Mastered words: interval >= 21 days (a common metric for durable memory)
  const masteredCount = vocabList.filter(v => v.interval >= 21).length;
  
  elements.statTotal.textContent = totalCount;
  elements.statDue.textContent = dueCount;
  elements.statMastered.textContent = masteredCount;
  
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
}

async function calculateStreak(vocabList) {
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
  const vocabList = await window.api.listVocab();
  // Get first 5
  const recent = vocabList.slice(0, 5);
  
  elements.recentVocabList.innerHTML = '';
  if (recent.length === 0) {
    elements.recentVocabList.innerHTML = `
      <tr class="empty-state">
        <td colspan="5">No vocabulary added yet. Go to "Add Word" to start!</td>
      </tr>
    `;
    return;
  }

  recent.forEach(v => {
    const row = document.createElement('tr');
    
    // Highlight if due
    const isDue = new Date(v.next_review) <= new Date();
    if (isDue) {
      row.classList.add('vocab-row-due');
    }
    
    const formattedDate = new Date(v.next_review).toLocaleDateString();
    
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
          <span class="interval">${v.interval}d</span>
        </span>
      </td>
    `;
    elements.recentVocabList.appendChild(row);
  });
}

// --- FORM HANDLERS (ADD/EDIT VOCABULARY) ---
function setupFormHandlers() {
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
      alert('Please enter a Main Word first.');
      elements.vocabMainWord.focus();
      return;
    }

    const apiKey = elements.settingsGroqKey.value.trim();
    const model = elements.settingsGroqModel.value;

    if (!apiKey) {
      alert('AI API Key is missing. Please go to the "Settings" tab and enter your Groq API Key first.');
      switchTab('settings');
      return;
    }

    // Disable generate button and spin icon
    elements.btnAiGenerate.disabled = true;
    const icon = elements.btnAiGenerate.querySelector('.rotate-spin');
    if (icon) icon.classList.add('spinning');
    
    logToConsole(elements.aiAssistantOutput, `Generating details for "${mainWord}" using Groq (${model})...`, 'system');

    const relatedArr = relatedWordsStr ? relatedWordsStr.split(',').map(s => s.trim()).filter(s => s.length > 0) : [];
    
    const systemPrompt = `You are a helpful and precise English vocabulary builder. You generate structured dictionary details.`;
    const userPrompt = `
Generate details for English word "${mainWord}" and its related/derivative words: ${relatedArr.length > 0 ? relatedArr.join(', ') : 'none'}.
Provide:
1. IPA (International Phonetic Alphabet) pronunciation for "${mainWord}".
2. Vietnamese translation for "${mainWord}".
3. A natural, contextual Vietnamese sentence demonstrating the use of "${mainWord}" (and related words if natural).
4. The English translation of that sentence.

You MUST respond strictly with a valid JSON object in this format:
{
  "ipa": "/.../",
  "translation": "Vietnamese meaning",
  "example_sentence_vi": "Vietnamese example sentence",
  "example_sentence_en": "English translation of the example sentence"
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
      
      // Sanitization in case of backticks
      const cleanJson = contentText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsedData = JSON.parse(cleanJson);

      elements.vocabIpa.value = parsedData.ipa || '';
      elements.vocabTranslation.value = parsedData.translation || '';
      elements.vocabSentenceVi.value = parsedData.example_sentence_vi || '';
      elements.vocabSentenceEn.value = parsedData.example_sentence_en || '';

      logToConsole(elements.aiAssistantOutput, `Successfully generated details for "${mainWord}"!`, 'success');
      logToConsole(elements.aiAssistantOutput, `IPA: ${parsedData.ipa}`, 'ai');
      logToConsole(elements.aiAssistantOutput, `Meanings: ${parsedData.translation}`, 'ai');
      logToConsole(elements.aiAssistantOutput, `Example Sentence (VI): ${parsedData.example_sentence_vi}`, 'ai');
    } catch (err) {
      console.error(err);
      logToConsole(elements.aiAssistantOutput, `Error: ${err.message}`, 'error');
      alert(`AI generation failed: ${err.message}`);
    } finally {
      elements.btnAiGenerate.disabled = false;
      if (icon) icon.classList.remove('spinning');
    }
  });

  // Form Submission (Save)
  elements.addVocabForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = elements.vocabId.value ? parseInt(elements.vocabId.value) : null;
    const main_word = elements.vocabMainWord.value.trim();
    const relatedWordsStr = elements.vocabRelatedWords.value.trim();
    const ipa = elements.vocabIpa.value.trim();
    const translation = elements.vocabTranslation.value.trim();
    const example_sentence_vi = elements.vocabSentenceVi.value.trim();
    const example_sentence_en = elements.vocabSentenceEn.value.trim();

    if (!main_word || !translation) {
      alert('Main Word and Vietnamese Translation are required.');
      return;
    }

    const related_words = relatedWordsStr 
      ? relatedWordsStr.split(',').map(s => s.trim()).filter(s => s.length > 0)
      : [];

    const vocab = {
      id,
      main_word,
      ipa,
      translation,
      example_sentence_vi,
      example_sentence_en,
      related_words
    };

    const result = await window.api.saveVocab(vocab);
    
    if (result.success) {
      alert('Vocabulary saved successfully!');
      resetForm();
      await updateAppStats();
      await loadRecentVocab();
      switchTab('library');
    } else {
      alert(`Failed to save vocabulary: ${result.error || 'Duplicate word error'}`);
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
}

// --- LIBRARY HANDLERS ---
function setupLibraryHandlers() {
  elements.librarySearch.addEventListener('input', loadLibraryVocab);
  elements.librarySort.addEventListener('change', loadLibraryVocab);
}

async function loadLibraryVocab() {
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
    list.sort((a, b) => new Date(a.next_review) - new Date(b.next_review));
  } else if (sortBy === 'mastery') {
    list.sort((a, b) => b.interval - a.interval);
  } else {
    // 'recent' -> sorted by ID/created_at descending by default from IPC
  }

  // Render Table
  elements.libraryVocabList.innerHTML = '';
  if (list.length === 0) {
    elements.libraryVocabList.innerHTML = `
      <tr class="empty-state">
        <td colspan="6">No vocabulary items found.</td>
      </tr>
    `;
    return;
  }

  list.forEach(v => {
    const row = document.createElement('tr');
    
    // Styling row boundaries
    const isDue = new Date(v.next_review) <= new Date();
    if (isDue) {
      row.classList.add('vocab-row-due');
    }

    const formattedDate = new Date(v.next_review).toLocaleDateString();
    
    row.innerHTML = `
      <td>
        <div class="word-cell">${escapeHtml(v.main_word)}</div>
        <div class="ipa-cell">${escapeHtml(v.ipa || '')}</div>
      </td>
      <td>${escapeHtml(v.translation)}</td>
      <td>
        ${(v.related_words || []).map(rw => `<span class="tag">${escapeHtml(rw)}</span>`).join('')}
      </td>
      <td>
        <div class="sentence-en">${escapeHtml(v.example_sentence_en || '')}</div>
        <div class="sentence-vi">${escapeHtml(v.example_sentence_vi || '')}</div>
      </td>
      <td>
        <div class="stats-badge">
          ${isDue ? '<span class="due">Due Now</span>' : formattedDate}
          <div class="mt-2 text-muted" style="font-size:11px;">
            Interval: <strong>${v.interval}d</strong><br>
            Repetitions: <strong>${v.repetitions}</strong>
          </div>
        </div>
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

function editVocab(v) {
  elements.vocabId.value = v.id;
  elements.vocabMainWord.value = v.main_word;
  elements.vocabRelatedWords.value = (v.related_words || []).join(', ');
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

  switchTab('add-word');
}

async function deleteVocab(id) {
  if (confirm('Are you sure you want to delete this vocabulary item?')) {
    const success = await window.api.deleteVocab(id);
    if (success) {
      await updateAppStats();
      await loadLibraryVocab();
    } else {
      alert('Delete failed.');
    }
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
  
  // Audio testing inside Review Stage 1
  elements.btnAudioS1.addEventListener('click', () => {
    const activeWord = activeReviewQueue[currentReviewIndex];
    if (activeWord) speak(activeWord.main_word);
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
    alert('No due vocabulary items to review!');
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

  loadActiveCard();
}

function loadActiveCard() {
  const vocab = activeReviewQueue[currentReviewIndex];
  
  // Update overall progress bar
  elements.reviewCurrentIndex.textContent = currentReviewIndex + 1;
  elements.reviewTotalCount.textContent = activeReviewQueue.length;
  
  const progressPercent = ((currentReviewIndex) / activeReviewQueue.length) * 100;
  elements.reviewProgressBar.style.width = `${progressPercent}%`;

  logToConsole(elements.reviewLogsBox, `Loading card: "${vocab.main_word.charAt(0)}..."`, 'system');

  // Trigger S1 elements
  transitionToStage(1);
}

function transitionToStage(stageNum) {
  // Hide all panels
  elements.reviewStage1.classList.remove('active');
  elements.reviewStage2.classList.remove('active');
  elements.reviewStage3.classList.remove('active');
  
  const vocab = activeReviewQueue[currentReviewIndex];

  if (stageNum === 1) {
    elements.reviewCardStageName.textContent = 'Step 1: Write Word';
    elements.reviewStage1.classList.add('active');
    
    // Clear inputs & feedback
    elements.reviewS1Input.value = '';
    elements.reviewS1Input.disabled = false;
    elements.reviewS1Feedback.classList.add('hide');
    elements.reviewS1Feedback.innerHTML = '';
    elements.btnS1Submit.classList.remove('hide');
    elements.btnS1Next.classList.add('hide');
    
    // Load prompt
    elements.reviewIpaPrompt.textContent = vocab.ipa || '[No IPA]';
    elements.reviewTranslationPrompt.textContent = vocab.translation;
    
    // Focus
    setTimeout(() => {
      elements.reviewS1Input.focus();
      // Auto-play audio if checked
      if (elements.reviewAutoAudio.checked) {
        speak(vocab.main_word);
      }
    }, 100);
    
  } else if (stageNum === 2) {
    elements.reviewCardStageName.textContent = 'Step 2: Related Words';
    elements.reviewStage2.classList.add('active');
    
    // Clear inputs & feedback
    elements.reviewS2Input.value = '';
    elements.reviewS2Input.disabled = false;
    elements.reviewS2Feedback.classList.add('hide');
    elements.reviewS2Feedback.innerHTML = '';
    elements.btnS2Submit.classList.remove('hide');
    elements.btnS2Next.classList.add('hide');
    
    // Load prompt
    elements.reviewS2MainWord.textContent = vocab.main_word;
    elements.reviewS2Translation.textContent = vocab.translation;
    
    setTimeout(() => elements.reviewS2Input.focus(), 100);
    
  } else if (stageNum === 3) {
    elements.reviewCardStageName.textContent = 'Step 3: Translate Sentence';
    elements.reviewStage3.classList.add('active');
    
    // Clear inputs & feedback
    elements.reviewS3Input.value = '';
    elements.reviewS3Input.disabled = false;
    elements.reviewS3Feedback.classList.add('hide');
    elements.reviewS3Feedback.innerHTML = '';
    elements.btnS3Submit.classList.remove('hide');
    elements.btnS3Finish.classList.add('hide');
    
    // Load prompt
    elements.reviewS3MainWord.textContent = vocab.main_word;
    
    elements.reviewS3RelatedBadges.innerHTML = '';
    if (vocab.related_words && vocab.related_words.length > 0) {
      vocab.related_words.forEach(rw => {
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
  const correct = vocab.main_word.trim().toLowerCase();
  
  if (!userTyped) return;
  
  elements.reviewS1Input.disabled = true;
  elements.btnS1Submit.classList.add('hide');
  elements.btnS1Next.classList.remove('hide');
  
  const feedbackDiv = elements.reviewS1Feedback;
  feedbackDiv.classList.remove('hide');
  
  // Voice confirmation
  speak(vocab.main_word);
  
  if (userTyped === correct) {
    sessionStats.spellingCorrect++;
    logToConsole(elements.reviewLogsBox, `Spelling correct: "${vocab.main_word}"`, 'success');
    feedbackDiv.innerHTML = `
      <div class="feedback-status correct">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
        Correct!
      </div>
      <div class="feedback-answer-comparison">
        <p>You spelled the word perfectly: <strong>${escapeHtml(vocab.main_word)}</strong></p>
      </div>
    `;
    // Attach marker to temporary array
    vocab.spellingFailed = false;
  } else {
    logToConsole(elements.reviewLogsBox, `Spelling incorrect for "${vocab.main_word}" (Typed: "${userTyped}")`, 'error');
    feedbackDiv.innerHTML = `
      <div class="feedback-status incorrect">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        Incorrect
      </div>
      <div class="feedback-answer-comparison">
        <p>Correct spelling: <strong class="diff-correct">${escapeHtml(vocab.main_word)}</strong></p>
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
  
  const userWords = userTyped ? userTyped.split(',').map(s => s.trim().toLowerCase()).filter(s => s.length > 0) : [];
  const correctWords = (vocab.related_words || []).map(w => w.trim().toLowerCase());
  
  if (correctWords.length === 0) {
    // If no related words were stored
    feedbackDiv.innerHTML = `
      <div class="feedback-status correct">No related words were stored for this word.</div>
    `;
    vocab.relatedCountCorrect = 0;
    vocab.relatedTotal = 0;
    elements.btnS2Next.focus();
    return;
  }
  
  const matched = [];
  const unmatched = [];
  
  correctWords.forEach(cw => {
    if (userWords.includes(cw)) {
      matched.push(cw);
    } else {
      unmatched.push(cw);
    }
  });
  
  vocab.relatedCountCorrect = matched.length;
  vocab.relatedTotal = correctWords.length;
  
  let scoreClass = 'correct';
  let scoreText = 'Perfect Recall!';
  
  if (matched.length === 0) {
    scoreClass = 'incorrect';
    scoreText = 'Study Needed';
  } else if (matched.length < correctWords.length) {
    scoreClass = 'incorrect'; // technically partial, but flag it
    scoreText = 'Partial Recall';
  }
  
  logToConsole(elements.reviewLogsBox, `Related words recalled: ${matched.length}/${correctWords.length}`, matched.length === correctWords.length ? 'success' : 'system');

  feedbackDiv.innerHTML = `
    <div class="feedback-status ${scoreClass}">
      ${scoreText} (${matched.length} of ${correctWords.length} matched)
    </div>
    <div class="feedback-answer-comparison">
      <p>Matched: ${matched.map(w => `<span class="diff-correct">${escapeHtml(w)}</span>`).join(', ') || '<span class="text-muted">none</span>'}</p>
      ${unmatched.length > 0 ? `<p class="mt-2">Missing: ${unmatched.map(w => `<span class="diff-wrong" style="text-decoration:none;">${escapeHtml(w)}</span>`).join(', ')}</p>` : ''}
    </div>
  `;
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
}

// --- BACKUP & EXPORT/IMPORT SERVICES ---
function setupBackupHandlers() {
  elements.btnExportDb.addEventListener('click', async () => {
    try {
      const vocabList = await window.api.listVocab();
      const settings = [];
      
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
      
      alert('Database exported successfully as JSON file.');
    } catch (error) {
      alert(`Export failed: ${error.message}`);
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
        if (importData.settings) {
          for (const [key, value] of Object.entries(importData.settings)) {
            await window.api.setSetting(key, value);
          }
        }

        // Restore Vocabs
        let successCount = 0;
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

        alert(`Database import completed! Successfully imported/updated ${successCount} words.`);
        await loadSettings();
        await updateAppStats();
      } catch (error) {
        alert(`Import failed: ${error.message}`);
      }
    };
    reader.readAsText(file);
  });

  // Save AI Settings
  elements.btnSaveAiSettings.addEventListener('click', async () => {
    const apiKey = elements.settingsGroqKey.value.trim();
    const model = elements.settingsGroqModel.value;

    await window.api.setSetting('groq-key', apiKey);
    await window.api.setSetting('groq-model', model);
    
    // Refresh models list dynamically based on the newly saved API Key
    await populateGroqModels(apiKey, model);
    
    updateGroqStatus(apiKey);
    alert('AI integration settings saved.');
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
