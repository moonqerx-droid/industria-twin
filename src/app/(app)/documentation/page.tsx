import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { StationTag } from "@/components/ui/Status";
import { STATUS_THRESHOLDS } from "@/domain/analysis/bottleneck";
import { BASELINE_PARAMETERS, DEMO_SCENARIOS, STATIONS } from "@/domain/model/demoData";
import { AGGREGATE_METRICS, STATION_METRICS } from "@/domain/model/metrics";
import { DISTRIBUTION_LABELS, distributionMean } from "@/domain/simulation/distributions";
import { ENGINE_LIMITS, ENGINE_VERSION } from "@/domain/simulation/types";
import { fmtNumber, fmtRub } from "@/lib/format";

export const metadata: Metadata = { title: "Документация" };

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-5 font-semibold first:mt-0">{children}</h3>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 max-w-[75ch] text-sm leading-relaxed text-muted">{children}</p>;
}

export default function DocumentationPage() {
  const b = BASELINE_PARAMETERS;
  return (
    <>
      <PageHeader
        title="Документация модели"
        description="Как устроена модель, какие данные используются, как считаются показатели и где проходят границы применимости. Таблицы ниже формируются из тех же модулей, что использует симулятор."
      />
      <div className="grid gap-5 xl:grid-cols-[220px_1fr]">
        <nav aria-label="Разделы" className="hidden xl:block">
          <ul className="sticky top-6 space-y-1.5 text-sm text-muted">
            {[
              ["model", "Модель процесса"],
              ["engine", "Симуляционный движок"],
              ["data", "Демонстрационные данные"],
              ["metrics", "Показатели"],
              ["analysis", "Узкие места и сравнение"],
              ["tour", "3D-тур"],
              ["privacy", "Персональные данные"],
              ["limits", "Ограничения"],
            ].map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="hover:text-ink">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 space-y-5">
          <Panel id="model" title="Модель процесса">
            <P>
              Условное предприятие собирает центробежные насосы. Каждое производственное задание (один насос) проходит
              последовательно склад комплектации, механообработку, сборку и испытания. После испытаний выполняется контроль
              качества: годное изделие идёт на упаковку и отгрузку, изделие с дефектом — на участок доработки и затем на повторные
              испытания. После {b.maxReworkCycles} циклов доработки (параметр сценария) повторно бракованное изделие списывается.
            </P>
            <div className="mt-4 flex flex-wrap gap-2">
              {STATIONS.map((s) => (
                <span key={s.id} className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-line px-2.5 py-1.5 text-sm">
                  <StationTag code={s.code} /> {s.name} <code className="text-xs text-faint">{s.id}</code>
                </span>
              ))}
            </div>
            <P>
              Идентификаторы участков (stationId) стабильны и используются одновременно в графе процесса, параметрах сценариев,
              метриках прогонов, точках интереса и объектах 3D-сцены.
            </P>
          </Panel>

          <Panel id="engine" title={`Симуляционный движок (версия ${ENGINE_VERSION})`}>
            <P>
              Дискретно-событийная модель с календарём событий (двоичная куча; порядок: время, приоритет типа, порядковый номер).
              Будущие события: ARRIVAL (поступление), PROCESS_FINISH (окончание операции), HORIZON_END. Мгновенные события, фиксируемые в
              журнале: QUEUE_ENTER, PROCESS_START, QUALITY_CHECK, REWORK, SCRAP, DEPARTURE. Очереди — FIFO, каждый участок имеет
              ограниченное число параллельных единиц ресурса.
            </P>
            <P>
              Случайные величины генерирует воспроизводимый генератор sfc32 с инициализацией splitmix32. Одинаковые параметры и seed
              дают идентичный журнал событий. Репликация №1 использует базовый seed, остальные — производные seed.
            </P>
            <P>
              В момент окончания горизонта изделия в очередях и в обработке фиксируются как незавершённое производство (НЗП). Загрузка
              считается по точным интервалам занятости: интеграл числа занятых единиц по времени, делённый на (вместимость × горизонт).
              Ограничения безопасности: горизонт до {ENGINE_LIMITS.maxHorizonMin} мин, до {ENGINE_LIMITS.maxCapacity} единиц ресурса,
              не более {ENGINE_LIMITS.maxReworkCycles} циклов доработки, не более {fmtNumber(ENGINE_LIMITS.maxEvents, 0)} событий на прогон.
            </P>
          </Panel>

          <Panel id="data" title="Демонстрационные данные (синтетические)">
            <P>
              Все значения придуманы для демонстрации и не являются реальными показателями какого-либо предприятия. Базовый сценарий:
              горизонт {b.horizonMin} мин (две смены), пуассоновский поток {fmtNumber(b.arrivalRatePerHour)} задания/ч, брак при первичных
              испытаниях {fmtNumber(b.defectProbability * 100)}%, при повторных — {fmtNumber(b.retestDefectProbability * 100)}%, компоненты{" "}
              {fmtRub(b.materialCostPerUnitRub)} на задание, постоянные расходы {fmtRub(b.fixedCostRub)} за горизонт, {b.replications} репликаций.
            </P>
            <div className="-mx-4 mt-4 overflow-x-auto sm:mx-0">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="py-2 pr-2 font-normal">Участок</th>
                    <th className="px-2 py-2 text-right font-normal">Ресурс, ед.</th>
                    <th className="px-2 py-2 font-normal">Время операции, мин</th>
                    <th className="px-2 py-2 text-right font-normal">Ставка, ₽/ч</th>
                    <th className="py-2 pl-2 text-right font-normal">Расходники, ₽/оп.</th>
                  </tr>
                </thead>
                <tbody>
                  {STATIONS.map((s) => {
                    const p = b.stations[s.id];
                    const t = p.processTime;
                    const desc = t.kind === "triangular" ? `мин ${t.min}, мода ${t.mode}, макс ${t.max}` : DISTRIBUTION_LABELS[t.kind];
                    return (
                      <tr key={s.id} className="border-b border-line/70 last:border-0">
                        <td className="py-2 pr-2">
                          {s.code} {s.name}
                        </td>
                        <td className="px-2 py-2 text-right">{p.capacity}</td>
                        <td className="px-2 py-2">
                          {DISTRIBUTION_LABELS[t.kind]}: {desc}; среднее {fmtNumber(distributionMean(t))}
                        </td>
                        <td className="px-2 py-2 text-right">{fmtNumber(p.hourlyCostRub, 0)}</td>
                        <td className="py-2 pl-2 text-right">{fmtNumber(p.consumablesPerOperationRub, 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <H>Демонстрационные сценарии</H>
            <ul className="mt-2 space-y-1.5 text-sm">
              {DEMO_SCENARIOS.map((s) => (
                <li key={s.id}>
                  <span className="font-medium">{s.name}</span> <span className="text-muted">— {s.description}</span>
                </li>
              ))}
            </ul>
            <P>Результаты этих сценариев не заданы заранее: они рассчитываются симулятором при заполнении базы и при каждом запуске.</P>
          </Panel>

          <Panel id="metrics" title="Показатели и формулы">
            <div className="-mx-4 overflow-x-auto sm:mx-0">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="py-2 pr-2 font-normal">Показатель</th>
                    <th className="px-2 py-2 font-normal">Единица</th>
                    <th className="py-2 pl-2 font-normal">Определение</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(AGGREGATE_METRICS).map((m) => (
                    <tr key={m.key} className="border-b border-line/70 align-top last:border-0">
                      <td className="py-2 pr-2">{m.label}</td>
                      <td className="px-2 py-2 text-muted">{m.unit}</td>
                      <td className="py-2 pl-2 text-muted">{m.description}</td>
                    </tr>
                  ))}
                  {Object.values(STATION_METRICS).map((m) => (
                    <tr key={`st-${m.key}`} className="border-b border-line/70 align-top last:border-0">
                      <td className="py-2 pr-2">Участок: {m.label.toLowerCase()}</td>
                      <td className="px-2 py-2 text-muted">{m.unit}</td>
                      <td className="py-2 pl-2 text-muted">{m.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <H>Модель стоимости</H>
            <P>
              Полная стоимость = Σ(вместимость × горизонт, ч × ставка часа доступности ресурса) + Σ(начатые операции × расходные
              материалы) + запущенные задания × комплект компонентов + постоянные расходы. Ресурсы оплачиваются за доступность, а не за
              занятость: так добавление поста увеличивает затраты даже при его простое. Стоимость единицы = полная стоимость / выпуск и не
              определена при нулевом выпуске. Других расходов модель не содержит.
            </P>
          </Panel>

          <Panel id="analysis" title="Узкие места и сравнение сценариев">
            <P>
              Состояние участка: «норма» при загрузке ниже {STATUS_THRESHOLDS.high * 100}%, «высокая загрузка» — от {STATUS_THRESHOLDS.high * 100}%,
              «перегрузка» — от {STATUS_THRESHOLDS.critical * 100}% или если очередь на конец горизонта не меньше {STATUS_THRESHOLDS.queueGrowthPerCapacity}{" "}
              × вместимость (и не меньше 3). Узкое место — участок с наивысшим статусом, затем с наибольшей загрузкой и ожиданием.
            </P>
            <P>
              Сравнение использует средние по репликациям. Изменение считается статистически различимым, если 95% доверительный
              интервал разности средних (приближение Уэлча) не содержит ноль; при одной репликации различимость не оценивается.
              Сравнение показывает, как ведёт себя модель при изменённых параметрах, и не доказывает причинно-следственных связей на
              реальном производстве.
            </P>
          </Panel>

          <Panel id="tour" title="3D-тур">
            <P>
              Сцена строится процедурно (без внешних файлов): участки, станки с ЧПУ, сборочные посты, испытательные стенды, стеллажи,
              конвейеры и паллеты. Число единиц оборудования на участке берётся из параметров выбранного прогона. Режим «Экскурсия»
              показывает средние показатели прогона, режим «Воспроизведение» — кадры состояния с шагом 5 минут, полученные из журнала
              событий репликации №1. Анимации вращения шпинделя и стрелок приборов декоративны и включаются только для занятого оборудования
              в соответствии с данными. При отсутствии WebGL показывается план цеха с теми же точками интереса и показателями.
            </P>
          </Panel>

          <Panel id="privacy" title="Персональные данные (152-ФЗ)">
            <P>
              Система хранит минимально необходимые данные учётной записи: логин, псевдоним и bcrypt-хеш пароля. ФИО, e-mail, телефоны и
              иные персональные данные не собираются; демонстрационные учётные записи не относятся к реальным людям. Сессии хранятся на
              сервере и истекают через 8 часов; просроченные сессии удаляются. Это технические меры минимизации данных, а не заключение о
              полном соответствии требованиям закона: для промышленной эксплуатации нужны организационные меры оператора (политика
              обработки, согласия, модель угроз, размещение данных).
            </P>
          </Panel>

          <Panel id="limits" title="Ограничения модели">
            <ul className="mt-1 list-disc space-y-1.5 pl-5 text-sm text-muted">
              <li>Нет переналадок, поломок оборудования, графика смен, перерывов и транспортного времени между участками.</li>
              <li>Все изделия однотипны; приоритеты заказов и партии не моделируются; дисциплина очередей — FIFO.</li>
              <li>Система начинается пустой: в начале горизонта есть период разгона, который не исключается из статистики.</li>
              <li>Параметры синтетические; перед применением к реальному цеху модель требует калибровки по фактическим данным.</li>
              <li>Ограничитель частоты запусков хранится в памяти одного процесса.</li>
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
