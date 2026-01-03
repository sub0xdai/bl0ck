import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translation resources directly (bundled, no HTTP backend)
import enCommon from '../locales/en/common.json';
import enLogin from '../locales/en/login.json';
import enChat from '../locales/en/chat.json';
import enSidebar from '../locales/en/sidebar.json';
import enModals from '../locales/en/modals.json';

import zhCNCommon from '../locales/zh-CN/common.json';
import zhCNLogin from '../locales/zh-CN/login.json';
import zhCNChat from '../locales/zh-CN/chat.json';
import zhCNSidebar from '../locales/zh-CN/sidebar.json';
import zhCNModals from '../locales/zh-CN/modals.json';

export const resources = {
  en: {
    common: enCommon,
    login: enLogin,
    chat: enChat,
    sidebar: enSidebar,
    modals: enModals,
  },
  'zh-CN': {
    common: zhCNCommon,
    login: zhCNLogin,
    chat: zhCNChat,
    sidebar: zhCNSidebar,
    modals: zhCNModals,
  },
} as const;

export const supportedLanguages = ['en', 'zh-CN'] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: ['common', 'login', 'chat', 'sidebar', 'modals'],

    interpolation: {
      escapeValue: false, // React already escapes
    },

    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'lina-language',
      caches: ['localStorage'],
    },

    react: {
      useSuspense: false, // Disable suspense for simpler integration
    },

    debug: import.meta.env.DEV,
  });

export default i18n;
