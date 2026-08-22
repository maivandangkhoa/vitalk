import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';
import { detectLanguageByIP } from './geoLanguageDetector';
import { langFromPath } from './localeRoutes';

/**
 * Đường dẫn đứng trên mọi thứ khác: `/ko/blog/<slug>` là bản tiếng Hàn của bài
 * viết, không phải "bài viết đó, hiển thị theo sở thích đã lưu của máy này".
 * Đọc ngay lúc khởi tạo nên trang không chớp qua ngôn ngữ cũ rồi mới đổi.
 *
 * Dò theo mã hợp lệ chứ không lấy bừa đoạn đầu: `/teachers` không phải ngôn ngữ.
 */
const detector = new LanguageDetector();
detector.addDetector({
  name: 'path',
  lookup: () => langFromPath(window.location.pathname) ?? undefined,
});

i18n
  .use(HttpBackend)
  .use(detector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: ['en', 'vi', 'ko', 'zh', 'ja'],
    ns: ['common', 'home', 'lessons', 'booking', 'blog', 'admin', 'teachers', 'call'],
    defaultNS: 'common',
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    detection: {
      order: ['path', 'querystring', 'localStorage', 'navigator'],
      lookupQuerystring: 'lang',
      lookupLocalStorage: 'havitalk-lang',
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
  })
  .then(() => {
    // URL đã nói rõ ngôn ngữ thì IP không có quyền lật lại: bấm vào link tiếng
    // Hàn phải ra tiếng Hàn dù đang ngồi ở đâu. Đây cũng là chỗ từng biến cả
    // năm bản dịch thành một: Googlebot render từ IP Mỹ, mọi URL cùng ra tiếng
    // Anh, Google thấy năm trang trùng nhau rồi gộp lại còn một.
    if (langFromPath(window.location.pathname)) return;

    detectLanguageByIP().then((lang) => {
      if (lang && lang !== i18n.language) {
        i18n.changeLanguage(lang);
      }
    });
  });

export default i18n;
