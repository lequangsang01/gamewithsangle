'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const t = useTranslations('theme');

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="w-10 h-10 rounded-md border border-zinc-700 bg-zinc-800 animate-pulse" />
    );
  }

  return (
    <div className="flex items-center gap-1 rounded-md border border-zinc-700 dark:border-zinc-700 bg-zinc-100/60 dark:bg-zinc-900/60 p-1">
      <button
        onClick={() => setTheme('light')}
        className={`px-2 py-1 text-xs rounded transition-colors ${
          theme === 'light'
            ? 'bg-emerald-500 text-white'
            : 'text-zinc-400 hover:text-zinc-200'
        }`}
        title={t('light')}
      >
        ☀️
      </button>
      <button
        onClick={() => setTheme('dark')}
        className={`px-2 py-1 text-xs rounded transition-colors ${
          theme === 'dark'
            ? 'bg-emerald-500 text-white'
            : 'text-zinc-400 hover:text-zinc-200'
        }`}
        title={t('dark')}
      >
        🌙
      </button>
      <button
        onClick={() => setTheme('system')}
        className={`px-2 py-1 text-xs rounded transition-colors ${
          theme === 'system'
            ? 'bg-emerald-500 text-white'
            : 'text-zinc-400 hover:text-zinc-200'
        }`}
        title={t('system')}
      >
        💻
      </button>
    </div>
  );
}

