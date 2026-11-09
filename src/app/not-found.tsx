import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div>
        <h1 className="text-2xl font-semibold">Страница не найдена</h1>
        <p className="mt-2 text-muted">Проверьте адрес или вернитесь на дашборд.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-accent-strong hover:underline">Открыть дашборд</Link>
      </div>
    </main>
  );
}
