# Диаграммы INDUSTRIA TWIN

Все диаграммы используют идентификаторы, совпадающие с кодом (`stationId`, `processNodeId`, `poiId`, имена моделей Prisma и маршрутов API).

| Файл | Нотация | Содержание |
|------|---------|-----------|
| [process.bpmn](process.bpmn) | BPMN 2.0 XML (открывается в bpmn.io / Camunda Modeler) | Исходный процесс изготовления насоса |
| [use-case.md](use-case.md) | UML use case (средствами Mermaid flowchart) | Акторы и варианты использования |
| [activity.md](activity.md) | UML activity (Mermaid flowchart) | Запуск моделирования; поток изделия |
| [state.md](state.md) | UML state (Mermaid stateDiagram-v2) | Жизненный цикл изделия, сценария и прогона |
| [sequence.md](sequence.md) | UML sequence (Mermaid sequenceDiagram) | Запуск моделирования; синхронизация выбора участка |
| [er.md](er.md) | ER (Mermaid erDiagram) | Модель данных (prisma/schema.prisma) |
| [architecture.md](architecture.md) | Mermaid flowchart | Слои системы и модули |
| [entity-interaction.md](entity-interaction.md) | Mermaid flowchart | Связи сущностей через `stationId` |
| [mnemonic.md](mnemonic.md) | Mermaid flowchart | Мнемосхема процесса (A1…E1) |
| [poi-map.md](poi-map.md) | Таблица + Mermaid | Карта точек интереса 3D-тура |

Просмотр Mermaid: GitHub/GitLab рендерят блоки ```mermaid автоматически; локально — https://mermaid.live или расширение редактора.
