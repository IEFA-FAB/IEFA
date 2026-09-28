/**
 * Identificador do build que está rodando, o mesmo no bundle do navegador e no servidor.
 *
 * No deploy rolante as tasks velhas e novas do ECS atendem juntas por alguns minutos, e a
 * aba aberta antes do deploy segue com o bundle antigo depois dele. O servidor devolve este
 * id em toda resposta (`nitro-build-id.ts`) e o `fetch` das server functions compara com o
 * da aba (`server-fn-fetch.ts`): servidor mais novo que a aba = aba desatualizada.
 *
 * É o instante do build em ms (`vite.config.ts`), para dar ordem: dá para saber quem é o
 * mais novo, e não só que são diferentes. Fora do build (vitest) vale `"dev"`.
 */
declare const __SISUB_BUILD_ID__: string | undefined

export const BUILD_ID: string = typeof __SISUB_BUILD_ID__ === "string" ? __SISUB_BUILD_ID__ : "dev"

export const BUILD_ID_HEADER = "x-sisub-build"

/**
 * Ordem entre dois builds: negativo se `a` é mais antigo, positivo se mais novo, 0 se é o
 * mesmo. `null` quando não dá para comparar (ausente, `"dev"`, formato desconhecido).
 */
export function compareBuildIds(a: string | null | undefined, b: string | null | undefined): number | null {
	if (!a || !b) return null
	if (a === b) return 0
	const left = Number(a)
	const right = Number(b)
	if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) return null
	return Math.sign(left - right)
}
