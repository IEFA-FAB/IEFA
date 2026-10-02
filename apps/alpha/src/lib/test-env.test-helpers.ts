/**
 * `env` completo para os testes de rota, com os defaults reais do schema.
 *
 * O `mock.module("../env.ts")` do bun vale para o PROCESSO (#384): um mock parcial deixa
 * `undefined` em toda chave que ele esqueceu, para todo arquivo de teste que rodar depois.
 * Partir do schema garante que nenhuma chave falte.
 */

import { type AlphaEnv, parseEnv } from "../env-schema.ts"

export function testEnv(overrides: Partial<AlphaEnv> = {}): AlphaEnv {
	return {
		...parseEnv({
			SUPABASE_URL: "http://localhost:54321",
			SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
			ALPHA_AI_MODEL: "test-model",
			DATABASE_URL: "postgres://localhost/test",
			ALPHA_CHAT_PURGE_ENABLED: "false",
		}),
		...overrides,
	}
}
