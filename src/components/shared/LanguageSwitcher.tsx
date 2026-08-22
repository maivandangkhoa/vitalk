import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SUPPORTED_LANGUAGES } from '@/lib/constants';
import { withLang } from '@/lib/localeRoutes';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const currentFlag = SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language)?.flag || '🌐';

  /*
   * Trang blog có URL riêng cho từng ngôn ngữ, nên đổi ngôn ngữ ở đó là đổi
   * trang chứ không chỉ đổi chữ — nếu không, người đọc đang ở `/ko/blog/x` bấm
   * sang tiếng Việt sẽ thấy bài tiếng Việt dưới một URL nói rằng đây là bản Hàn,
   * và link họ chia sẻ tiếp sẽ mang sai ngôn ngữ. Trang khác thì URL giữ nguyên.
   */
  const selectLanguage = (code: (typeof SUPPORTED_LANGUAGES)[number]['code']) => {
    const next = withLang(pathname, code);
    if (next !== pathname) navigate(`${next}${search}`, { replace: true });
    i18n.changeLanguage(code);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-lg" />}>
        <span className="text-lg leading-none">{currentFlag}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {SUPPORTED_LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => selectLanguage(lang.code)}
            className={i18n.language === lang.code ? 'bg-accent' : ''}
          >
            <span className="mr-2">{lang.flag}</span>
            {lang.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
