import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';

// Các ngôn ngữ được hỗ trợ
export const locales = ['vi', 'en'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'vi';

export default getRequestConfig(async ({ requestLocale }) => {
  const locale = await requestLocale;
  // Validate that the incoming `locale` parameter is valid
  if (!locale || !locales.includes(locale as Locale)) {
    notFound();
  }

  return {
    locale: locale as Locale,
    messages: (await import(`./messages/${locale}.json`)).default
  };
});
