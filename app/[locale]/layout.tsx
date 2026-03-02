import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locales } from '@/i18n';
import { ThemeProvider } from '@/components/ThemeProvider';
import { Header } from '@/components/Header';

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  
  if (!locales.includes(locale as any)) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.setAttribute('lang', '${locale}');`,
        }}
      />
      <NextIntlClientProvider messages={messages}>
        <ThemeProvider>
          <Header />
          {children}
        </ThemeProvider>
      </NextIntlClientProvider>
    </>
  );
}
