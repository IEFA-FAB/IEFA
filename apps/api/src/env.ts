import { envSchema } from "./env-schema.ts"

/** Ambiente validado na carga (schema em `env-schema.ts`). */
export const env = envSchema.parse(process.env)
