import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { SimulationConfigError } from "@/domain/simulation/engine";

/** Ошибка прикладного уровня с HTTP-статусом и машиночитаемым кодом. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const notFound = (what: string) => new ApiError(404, "NOT_FOUND", `${what} не найден(а)`);
export const forbidden = () => new ApiError(403, "FORBIDDEN", "Недостаточно прав для операции");
export const unauthorized = () => new ApiError(401, "UNAUTHORIZED", "Требуется вход в систему");

export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details ?? null } },
      { status: err.status },
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Некорректные входные данные",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      { status: 400 },
    );
  }
  if (err instanceof SimulationConfigError) {
    return NextResponse.json(
      { error: { code: "INVALID_SCENARIO", message: err.message, details: err.issues } },
      { status: 422 },
    );
  }
  console.error("[api] необработанная ошибка", err);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Внутренняя ошибка сервера", details: null } },
    { status: 500 },
  );
}

/** Оборачивает обработчик маршрута единообразной обработкой ошибок. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function parseJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Тело запроса должно быть корректным JSON");
  }
  return schema.parse(body);
}
