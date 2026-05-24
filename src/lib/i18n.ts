import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';
import { detectLanguageByIP } from './geoLanguageDetector';

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: ['en', 'vi', 'ko', 'zh', 'ja'],
    ns: ['common', 'home', 'lessons', 'booking', 'blog', 'admin', 'teachers'],
    defaultNS: 'common',
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    detection: {
      order: ['querystring', 'localStorage', 'navigator'],
      lookupQuerystring: 'lang',
      lookupLocalStorage: 'havitalk-lang',
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
  })
  .then(() => {
    detectLanguageByIP().then((lang) => {
      if (lang && lang !== i18n.language) {
        i18n.changeLanguage(lang);
      }
    });
  });

export default i18n;
