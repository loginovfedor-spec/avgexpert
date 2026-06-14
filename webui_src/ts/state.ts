import type { AppSettings, AppState, Lang } from './types';

export const state: AppState = {
  lang: (localStorage.getItem('gemma_lang') as Lang) || 'ru',
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

export const settings: AppSettings = {
  system_prompt: localStorage.getItem('gemma_system_prompt') || '',
  temperature: parseFloat(localStorage.getItem('gemma_temperature') || '0.7'),
  top_p: parseFloat(localStorage.getItem('gemma_top_p') || '0.9'),
  top_k: parseInt(localStorage.getItem('gemma_top_k') || '40', 10),
  min_p: parseFloat(localStorage.getItem('gemma_min_p') || '0.05'),
  repeat_penalty: parseFloat(localStorage.getItem('gemma_repeat_penalty') || '1.1'),
  n_predict: parseInt(localStorage.getItem('gemma_n_predict') || '1024', 10),
  api_key: localStorage.getItem('gemma_api_key') || '',
};
