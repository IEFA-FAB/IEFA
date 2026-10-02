import { parseEnv } from "./env-schema.ts"

/** Ambiente do serviço, validado na carga (schema e defaults em `env-schema.ts`). */
export const env = parseEnv(process.env)
