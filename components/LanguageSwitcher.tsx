'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { locales, type Locale } from '@/i18n';

export function LanguageSwitcher() {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('language');

  const switchLocale = (newLocale: Locale) => {
    // Remove current locale from pathname if it exists
    const pathWithoutLocale = pathname.replace(`/${locale}`, '') || '/';
    // Navigate to new locale
    router.push(`/${newLocale}${pathWithoutLocale}`);
    router.refresh();
  };

  return (
    <div className="flex items-center gap-1 rounded-md border border-zinc-700 dark:border-zinc-700 bg-zinc-100/60 dark:bg-zinc-900/60 p-1">
      {locales.map((loc) => (
        <button
          key={loc}
          onClick={() => switchLocale(loc)}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            locale === loc
              ? 'bg-emerald-500 text-white'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-200'
          }`}
          title={t(loc)}
        >
          {loc.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

