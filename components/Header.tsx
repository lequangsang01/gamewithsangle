'use client';

import { ThemeSwitcher } from './ThemeSwitcher';
import { LanguageSwitcher } from './LanguageSwitcher';

export function Header() {
  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
      <LanguageSwitcher />
      <ThemeSwitcher />
    </div>
  );
}

