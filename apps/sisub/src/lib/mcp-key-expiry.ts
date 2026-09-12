/**
 * @module mcp-key-expiry
 * Estado de vencimento de uma chave de API do MCP, para a tela.
 *
 * Mora em `src/lib/` e é PURA — sem `Date.now()` implícito no caminho testado — porque a
 * regra tem duas bordas que só aparecem em teste: o dia exato do vencimento e a fronteira da
 * janela de aviso. Deixá-la dentro do componente significaria ou não testá-la, ou montar a
 * árvore inteira para conferir uma conta de dias.
 *
 * Quem decide se a chave AINDA AUTENTICA é `resolveApiKey` (`apps/sisub-mcp/src/auth.ts`),
 * contra o relógio do servidor. Isto aqui é a leitura que o dono vê, e nada mais.
 *
 * @domain app
 */

/**
 * Antecedência com que a tela começa a avisar, em dias.
 *
 * A mesma janela do `mcp-keys:notify-expiry`: os dois avisos falam do mesmo prazo, e não de
 * dois. Trinta dias é tempo de gerar outra chave e trocar a configuração do cliente sem
 * pressa — e curto o bastante para o aviso não virar paisagem.
 */
export const MCP_KEY_EXPIRY_WARNING_DAYS = 30

export type McpKeyExpiry = {
	at: Date
	/** Dias corridos que faltam, arredondados PARA CIMA. Zero ou negativo = vencida. */
	days: number
	isExpired: boolean
	/** Vence dentro da janela de aviso — e ainda não venceu. */
	isNear: boolean
}

/**
 * @param expiresAt - `timestamptz` como veio do banco.
 * @param now       - Instante de referência, em milissegundos. Parâmetro para que o teste não
 *                    dependa de quando roda.
 */
export function mcpKeyExpiry(expiresAt: string, now: number = Date.now()): McpKeyExpiry {
	const at = new Date(expiresAt)
	// Arredonda para cima: com truncamento, a chave que vence daqui a 20 horas mostraria
	// "vence em 0 dias" — que lê como "já era" numa chave que ainda funciona.
	const days = Math.ceil((at.getTime() - now) / (24 * 60 * 60 * 1000))
	return { at, days, isExpired: days <= 0, isNear: days > 0 && days <= MCP_KEY_EXPIRY_WARNING_DAYS }
}

/** Data no formato que a tela mostra. */
export function formatExpiryDate(at: Date): string {
	return at.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
}
