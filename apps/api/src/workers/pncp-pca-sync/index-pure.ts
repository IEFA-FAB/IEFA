/**
 * @module pncp-pca-sync/index-pure
 * Regras do orquestrador que não dependem de env nem de banco — separadas para o teste
 * unitário não puxar `env.ts`, que valida credencial na carga do módulo.
 */

/**
 * Anos a coletar, sem repetição e em ordem. O parâmetro vem do corpo da rota admin, e
 * `[2026, 2026]` violaria `UNIQUE (sync_id, step_name)` — o lote inteiro de steps falharia e a
 * ingestão rodaria sem step algum, com o log ainda reportando sucesso.
 */
export function dedupeAnos(anos: readonly number[]): number[] {
	return [...new Set(anos)].sort((a, b) => a - b)
}
