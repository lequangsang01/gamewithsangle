import Link from "next/link";

const games = [
  {
    id: "chess",
    name: "Cờ vua",
    description: "Chơi cờ vua online 1vs1, tạo phòng hoặc nhập mã phòng để vào chơi.",
    href: "/chess",
    status: "available" as const,
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex items-center justify-center px-4">
      <main className="w-full max-w-3xl py-12">
        <header className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            Game With Sangle
          </h1>
          <p className="text-zinc-400 text-sm">
            Danh sách game nhiều người chơi. Bắt đầu với cờ vua.
          </p>
        </header>

        <section className="space-y-4">
          {games.map((game) => (
            <Link
              key={game.id}
              href={game.href}
              className="block rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/80 transition-colors p-5"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold mb-1">{game.name}</h2>
                  <p className="text-sm text-zinc-400">{game.description}</p>
                </div>
                <span className="text-xs rounded-full border border-emerald-500/40 text-emerald-400 px-3 py-1">
                  Đang mở
                </span>
              </div>
            </Link>
          ))}
        </section>
      </main>
    </div>
  );
}
