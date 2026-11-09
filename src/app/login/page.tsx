import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Вход" };

const FLOW = [
  { code: "A1", name: "Склад" },
  { code: "B1", name: "Мехобработка" },
  { code: "C1", name: "Сборка" },
  { code: "D1", name: "Испытания" },
  { code: "E1", name: "Отгрузка" },
];

/** Схема потока изделия: пять участков основного маршрута и возврат на доработку D2. */
function FlowSchematic() {
  const w = 104;
  return (
    <svg viewBox="0 0 560 190" className="w-full max-w-xl" role="img" aria-label="Маршрут изделия: склад, мехобработка, сборка, испытания, отгрузка; возврат с испытаний на доработку">
      <defs>
        <marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0 8 4 0 8Z" fill="#5d9cf0" />
        </marker>
      </defs>
      {FLOW.map((s, i) => {
        const x = 4 + i * (w + 10);
        return (
          <g key={s.code}>
            <rect x={x} y={40} width={w} height={58} rx={7} fill="#ffffff0d" stroke="#ffffff2e" />
            <text x={x + 12} y={63} fill="#8fbaf3" fontSize="13" fontWeight="600" fontFamily="var(--font-plex-mono)">{s.code}</text>
            <text x={x + 12} y={84} fill="#e8eef5" fontSize="13">{s.name}</text>
            {i < FLOW.length - 1 && <line x1={x + w + 1} y1={69} x2={x + w + 9} y2={69} stroke="#5d9cf0" strokeWidth="1.6" markerEnd="url(#arr)" />}
          </g>
        );
      })}
      {/* Доработка под испытаниями */}
      <rect x={4 + 2 * (w + 10) + 40} y={140} width={w + 20} height={44} rx={7} fill="none" stroke="#ffffff2e" strokeDasharray="4 4" />
      <text x={4 + 2 * (w + 10) + 52} y={167} fill="#c7d3e0" fontSize="13"><tspan fill="#8fbaf3" fontWeight="600" fontFamily="var(--font-plex-mono)">D2</tspan>  Доработка</text>
      <path d={`M ${4 + 3 * (w + 10) + 30} 98 V 162 H ${4 + 2 * (w + 10) + 40 + w + 22}`} fill="none" stroke="#5d9cf0" strokeWidth="1.4" strokeDasharray="4 4" markerEnd="url(#arr)" />
      <text x={4 + 3 * (w + 10) + 38} y={124} fill="#93a4b8" fontSize="11">брак</text>
    </svg>
  );
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await getCurrentUser();
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  if (user) redirect(safeNext);
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.15fr_1fr]">
      <section className="blueprint-grid relative hidden min-h-dvh flex-col justify-between bg-[#0d1a28] p-12 text-white lg:flex xl:p-16">
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 32 32" className="h-9 w-9" aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="#1f66c9" />
            <circle cx="17.5" cy="16" r="6.5" fill="none" stroke="#fff" strokeWidth="2.2" />
            <circle cx="17.5" cy="16" r="2" fill="#fff" />
            <path d="M17.5 9.5h6v3.2" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M6.5 16h4.5" stroke="#9cc3f5" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          <span className="text-[16px] font-semibold tracking-[0.04em]">INDUSTRIA TWIN</span>
        </div>
        <div className="my-14 max-w-xl">
          <h1 className="text-[40px] font-semibold leading-[1.12] tracking-[-0.025em] xl:text-[46px]">
            Цех сборки насосов, который можно проверить до изменений
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-[#b4c2d2]">
            Дискретно-событийная модель шести участков, сравнение сценариев и 3D-тур по тем же станциям.
          </p>
          <div className="mt-12"><FlowSchematic /></div>
        </div>
        <div className="flex justify-between border-t border-white/10 pt-5 text-[12px] text-[#93a4b8]">
          <span>Условное предприятие, синтетические данные</span>
          <span>Демонстрационная версия</span>
        </div>
      </section>
      <section className="flex items-center justify-center bg-white px-6 py-12 sm:px-12">
        <div className="w-full max-w-sm">
          <h2 className="page-heading text-[30px]">Вход в систему</h2>
          <p className="mt-1.5 text-sm text-muted">Используйте демонстрационную учётную запись из README.</p>
          <LoginForm next={safeNext} />
          <p className="mt-8 text-xs leading-relaxed text-faint">
            Система хранит только логин и псевдоним пользователя; пароль — в виде хеша. Сессия хранится в
            защищённом cookie и истекает через 8 часов.
          </p>
        </div>
      </section>
    </main>
  );
}
