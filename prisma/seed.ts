/**
 * Заполнение демонстрационной базы. Запуск: npm run db:seed
 * Все данные синтетические; результаты моделирования рассчитываются движком при заполнении.
 */
import { prisma } from "../src/server/db";
import { seedDatabase } from "../src/server/services/seedService";
import { runScenarioSimulation } from "../src/server/services/simulationService";

async function main() {
  const t0 = Date.now();
  await seedDatabase(prisma, { runSimulations: (id) => runScenarioSimulation(id, null) });
  const [users, scenarios, runs] = await Promise.all([prisma.user.count(), prisma.scenario.count(), prisma.simulationRun.count()]);
  console.log(`Seed завершён за ${Date.now() - t0} мс: пользователей ${users}, сценариев ${scenarios}, прогонов ${runs}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
