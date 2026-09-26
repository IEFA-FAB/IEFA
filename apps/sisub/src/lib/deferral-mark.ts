/**
 * A marca "efetivado com a consulta da NF-e pendente" só pode ficar num recebimento que foi
 * efetivado com ela. Ela é gravada ANTES da efetivação (gravada depois, uma falha deixaria o
 * estoque dentro sem o registro); então qualquer falha do que vem depois — preencher o custo,
 * a efetivação em si — tem de apagá-la. Sem isso, a próxima efetivação, já com a consulta em
 * dia, herdaria o motivo da tentativa anterior.
 */
export async function withDeferralRollback<T>(deferred: boolean, run: () => Promise<T>, clear: () => Promise<void>): Promise<T> {
	try {
		return await run()
	} catch (error) {
		if (!deferred) throw error
		try {
			await clear()
		} catch (clearError) {
			const reason = error instanceof Error ? error.message : String(error)
			const detail = clearError instanceof Error ? clearError.message : String(clearError)
			throw new Error(`${reason} — e a marca de consulta adiada não pôde ser desfeita (${detail}); efetive de novo para corrigi-la`)
		}
		throw error
	}
}
