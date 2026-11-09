import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

/** Правила Next.js (Core Web Vitals) и TypeScript; строгость типов обеспечивает tsc --noEmit (strict). */
const config = [
  { ignores: [".next/**", "node_modules/**", "test-results/**", "playwright-report/**", "next-env.d.ts", "prisma/*.db"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" }],
    },
  },
];

export default config;
