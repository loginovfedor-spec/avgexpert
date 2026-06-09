export const state = {
  lang: localStorage.getItem('gemma_lang') || 'ru',
  chatHistory: [],
  attachedDocs: [],
  isGenerating: false,
  abortCtrl: null,
  contextSize: 4096,
  maxDocsAllowed: 3,
  currentUser: null,
  authToken: localStorage.getItem('avgexpert_token'),
  currentSessionId: null,
  adminStatsInterval: null,
  healthInterval: null,
  inactivityTimeout: null,
  activityListenersBound: false,
  categories: {},
  welcomeHintsTimeout: null,
};

export const settings = {
  system_prompt: localStorage.getItem('gemma_system_prompt') || '',
  temperature: parseFloat(localStorage.getItem('gemma_temperature') || '0.7'),
  top_p: parseFloat(localStorage.getItem('gemma_top_p') || '0.9'),
  top_k: parseInt(localStorage.getItem('gemma_top_k') || '40'),
  min_p: parseFloat(localStorage.getItem('gemma_min_p') || '0.05'),
  repeat_penalty: parseFloat(localStorage.getItem('gemma_repeat_penalty') || '1.1'),
  n_predict: parseInt(localStorage.getItem('gemma_n_predict') || '1024'),
  n_ctx: parseInt(localStorage.getItem('gemma_n_ctx') || '4096'),
  api_key: localStorage.getItem('gemma_api_key') || ''
};
