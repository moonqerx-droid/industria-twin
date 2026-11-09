# INDUSTRIA TWIN

Демонстрационный прототип для хакатона «Цифровой двойник предприятия и 3D-туры по производству»: дискретно-событийная модель условного цеха сборки насосов, студия сценариев, сравнение «до/после», дашборды и интерактивный 3D-тур, связанные одним набором идентификаторов участков.

> Все производственные данные синтетические и служат только для демонстрации.

## Требования

* Node.js ≥ 20.9 (проверено на 26.13), npm ≥ 10
* Доступ в интернет при первой установке зависимостей и сборке (шрифт Golos Text скачивается next/font)

## Запуск

```bash
npm install
```

```bash
cp .env.example .env
```

Задайте в `.env` значение `SESSION_SECRET` (не короче 32 символов), например результатом `openssl rand -hex 32`.

```bash
npm run setup
```

```bash
npm run build && npm start
```

Приложение: <http://localhost:3000>. Режим разработки: `npm run dev`.

`npm run setup` применяет миграции (`prisma migrate deploy`) к `prisma/dev.db` и заполняет базу (`prisma/seed.ts`); seed запускает симулятор для пяти демонстрационных сценариев. Повторный `npm run db:seed` очищает и заново заполняет демонстрационные данные.

> Примечание по e2e: если `playwright install` зависает на распаковке, браузер можно поставить в каталог проекта: `PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium-headless-shell` и запускать тесты с той же переменной (`PLAYWRIGHT_BROWSERS_PATH=0 npm run test:e2e`).

## Демонстрационные учётные записи

| Логин | Пароль | Роль | Права |
|---|---|---|---|
| `admin` | `Admin#Twin2026` | Администратор | всё, удаление прогонов, пользователи |
| `engineer` | `Engineer#Twin2026` | Инженер-технолог | сценарии, запуск моделирования |
| `viewer` | `Viewer#Twin2026` | Наблюдатель | только просмотр |

Пароли только для локальной демонстрации; переопределяются переменными `DEMO_ADMIN_PASSWORD`, `DEMO_ENGINEER_PASSWORD`, `DEMO_VIEWER_PASSWORD` перед `npm run db:seed`. В БД хранятся bcrypt-хеши.

## Команды

| Команда | Назначение |
|---|---|
| `npm run typecheck` | Проверка TypeScript (strict) |
| `npm test` | Модульные и интеграционные тесты (Vitest, отдельная БД `prisma/test.db`) |
| `npm run test:e2e` | Playwright smoke и адаптивность (нужны `npm run build` и `npx playwright install chromium-headless-shell`; БД `prisma/e2e.db`, порт 3100) |
| `npm run report:scenarios` | Таблица результатов демонстрационных сценариев из движка |
| `npm run verify` | typecheck + тесты + сборка |

## Разделы приложения

| Путь | Содержание |
|---|---|
| `/dashboard` | KPI, узкое место, состояние участков, графики загрузки, очередей, НЗП и выпуска, структура стоимости |
| `/process` | Интерактивная мнемосхема с метриками узлов и переходом в 3D |
| `/scenarios` | Студия сценариев: создание, копирование, редактирование, запуск |
| `/compare` | Сравнение базового и альтернативных прогонов |
| `/factory` | 3D-тур: экскурсия, точки интереса, воспроизведение прогона, план 2D |
| `/documentation` | Модель, данные, формулы, ограничения |
| `/admin` | Пользователи, права, прогоны (только администратор) |

## Документация

* [Техническое задание](docs/TZ.md) и [диаграммы](docs/diagrams/README.md) (BPMN, UML, ER)
* [Архитектура](docs/ARCHITECTURE.md), [решения](docs/DECISIONS.md), [данные и допущения](docs/DATA_ASSUMPTIONS.md)
* [Контракт 3D-сцены](docs/3d/SCENE_CONTRACT.md), [манифест ассетов](docs/3d/ASSET_MANIFEST.md)
* [План тестирования](docs/TEST_PLAN.md), [критерии приёмки](docs/ACCEPTANCE_CRITERIA.md), [трассируемость требований](docs/REQUIREMENTS_TRACEABILITY.md)
* [Сценарий демонстрации](docs/DEMO_SCRIPT.md), [план проекта](docs/PROJECT_PLAN.md), [итоговый отчёт](FINAL_REPORT.md)

## Стек

Next.js 15.5 (App Router), React 19, TypeScript strict, Tailwind CSS 4, Three.js 0.180 + React Three Fiber 9 + drei 10, Zustand, Recharts 3, Prisma 6 + SQLite, Zod 4, jose, bcryptjs, Vitest 3, Playwright.
