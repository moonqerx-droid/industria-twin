import { z } from "zod";
import { STATION_IDS } from "@/domain/model/demoData";
import { ENGINE_LIMITS } from "@/domain/simulation/types";
import { MAX_REPLICATIONS } from "@/domain/simulation/replications";

/** Серверные схемы проверки входных данных. Ограничения согласованы с ENGINE_LIMITS. */

const minutes = (max: number) => z.number().finite().min(0, "Не может быть отрицательным").max(max);

export const durationSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("fixed"), value: minutes(1440) }),
    z.object({ kind: z.literal("exponential"), mean: minutes(1440).refine((v) => v > 0, "Среднее должно быть > 0") }),
    z.object({ kind: z.literal("uniform"), min: minutes(1440), max: minutes(1440) }),
    z.object({ kind: z.literal("triangular"), min: minutes(1440), mode: minutes(1440), max: minutes(1440) }),
    z.object({ kind: z.literal("normal"), mean: minutes(1440), sd: minutes(720), min: minutes(1440) }),
  ])
  .superRefine((d, ctx) => {
    if (d.kind === "uniform" && d.max < d.min) ctx.addIssue({ code: "custom", message: "max должно быть ≥ min" });
    if (d.kind === "triangular" && !(d.min <= d.mode && d.mode <= d.max))
      ctx.addIssue({ code: "custom", message: "Должно выполняться min ≤ mode ≤ max" });
  });

export const stationParametersSchema = z.object({
  capacity: z.number().int("Целое число").min(1).max(ENGINE_LIMITS.maxCapacity),
  processTime: durationSchema,
  hourlyCostRub: z.number().finite().min(0).max(1_000_000),
  consumablesPerOperationRub: z.number().finite().min(0).max(10_000_000),
  failure: z
    .object({
      mtbfMin: z.number().finite().min(10, "MTBF не менее 10 мин").max(1_000_000),
      mttrMin: z.number().finite().min(0.5, "MTTR не менее 0,5 мин").max(ENGINE_LIMITS.maxHorizonMin),
    })
    .nullable()
    .optional(),
});

const stationsShape = Object.fromEntries(STATION_IDS.map((id) => [id, stationParametersSchema])) as Record<
  (typeof STATION_IDS)[number],
  typeof stationParametersSchema
>;

export const scenarioParametersSchema = z
  .object({
    horizonMin: z.number().finite().min(60, "Не менее 60 мин").max(ENGINE_LIMITS.maxHorizonMin),
    releaseWindowMin: z.number().finite().min(0).max(ENGINE_LIMITS.maxHorizonMin),
    arrivalKind: z.enum(["poisson", "deterministic"]),
    arrivalRatePerHour: z.number().finite().min(0).max(ENGINE_LIMITS.maxArrivalRatePerHour),
    defectProbability: z.number().finite().min(0).max(1),
    retestDefectProbability: z.number().finite().min(0).max(1),
    maxReworkCycles: z.number().int().min(0).max(ENGINE_LIMITS.maxReworkCycles),
    materialCostPerUnitRub: z.number().finite().min(0).max(100_000_000),
    fixedCostRub: z.number().finite().min(0).max(1_000_000_000),
    seed: z.number().int().min(0).max(2_147_483_647),
    replications: z.number().int().min(1).max(MAX_REPLICATIONS),
    stations: z.object(stationsShape).strict(),
  })
  .superRefine((p, ctx) => {
    if (p.releaseWindowMin > p.horizonMin)
      ctx.addIssue({ code: "custom", path: ["releaseWindowMin"], message: "Окно запуска не может превышать горизонт" });
    // Защита от чрезмерно тяжёлых прогонов: ожидаемое число заданий × репликации.
    const expectedJobs = (p.arrivalRatePerHour * p.releaseWindowMin) / 60;
    if (expectedJobs * p.replications > 150_000)
      ctx.addIssue({
        code: "custom",
        path: ["replications"],
        message: "Слишком тяжёлый прогон: уменьшите горизонт, интенсивность или число репликаций",
      });
  });

export const scenarioCreateSchema = z.object({
  name: z.string().trim().min(3, "Не менее 3 символов").max(120),
  description: z.string().trim().max(1000).default(""),
  parameters: scenarioParametersSchema,
});

export const scenarioUpdateSchema = z.object({
  name: z.string().trim().min(3).max(120).optional(),
  description: z.string().trim().max(1000).optional(),
  parameters: scenarioParametersSchema.optional(),
});

export const scenarioCopySchema = z.object({ name: z.string().trim().min(3).max(120).optional() });

export const loginSchema = z.object({
  login: z.string().trim().min(1, "Введите логин").max(64),
  password: z.string().min(1, "Введите пароль").max(256),
});

export const idSchema = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, "Некорректный идентификатор");

export const compareQuerySchema = z.object({
  baseline: idSchema,
  runs: z
    .string()
    .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(idSchema).min(1, "Выберите хотя бы один альтернативный прогон").max(3, "Не более трёх альтернатив")),
});

/** Пароль: не короче 10 символов, буквы и цифры. */
const passwordSchema = z
  .string()
  .min(10, "Пароль не короче 10 символов")
  .max(128)
  .refine((v) => /\p{L}/u.test(v) && /\d/.test(v), "Пароль должен содержать буквы и цифры");

const roleSchema = z.enum(["admin", "engineer", "viewer"]);

export const userCreateSchema = z.object({
  login: z.string().trim().min(3, "Логин не короче 3 символов").max(40).regex(/^[a-z0-9._-]+$/, "Логин: латинские строчные буквы, цифры, точка, дефис, подчёркивание"),
  displayName: z.string().trim().min(2).max(60),
  role: roleSchema,
  password: passwordSchema,
});

export const userUpdateSchema = z
  .object({
    displayName: z.string().trim().min(2).max(60).optional(),
    role: roleSchema.optional(),
    isActive: z.boolean().optional(),
    password: passwordSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Нет изменений");

export const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  action: z.string().trim().max(40).regex(/^[a-z.]*$/).optional(),
});

export type ScenarioCreateInput = z.infer<typeof scenarioCreateSchema>;
export type ScenarioUpdateInput = z.infer<typeof scenarioUpdateSchema>;
