import Link from "next/link";
import { getTranslations } from 'next-intl/server';
import { getLocale } from 'next-intl/server';

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations('home');

  const games = [
    {
      id: "chess",
      name: t('games.chess.name'),
      description: t('games.chess.description'),
      href: `/${locale}/chess`,
      status: "available" as const,
    },
    {
      id: "xo",
      name: t('games.xo.name'),
      description: t('games.xo.description'),
      href: `/${locale}/xo`,
      status: "available" as const,
    },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-950 dark:text-zinc-50 flex items-center justify-center px-4">
      <main className="w-full max-w-3xl py-12">
        <header className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            {t('title')}
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400 text-sm">
            {t('description')}
          </p>
        </header>

        <section className="space-y-4">
          {games.map((game) => (
            <Link
              key={game.id}
              href={`/${game.id}`}
              className="block rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100/60 dark:bg-zinc-900/60 hover:bg-zinc-200/80 dark:hover:bg-zinc-800/80 transition-colors p-5"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold mb-1">{game.name}</h2>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">{game.description}</p>
                </div>
                <span className="text-xs rounded-full border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 px-3 py-1">
                  <TranslatedAvailable />
                </span>
              </div>
            </Link>
          ))}
        </section>
      </main>
    </div>
  );
}

async function TranslatedAvailable() {
  const t = await getTranslations('common');
  return <>{t('available')}</>;
}

