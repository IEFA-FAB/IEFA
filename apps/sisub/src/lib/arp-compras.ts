/**
 * Regras do contrato do módulo ARP do Compras.gov.br.
 *
 * Ficam fora de `arp.fn.ts` porque teste unitário não pode importar
 * `@/server/*` — o módulo valida credencial na carga e a suíte quebra no CI.
 */

import { COMPRAS_MAX_DATE_WINDOW_DAYS } from "@iefa/compras-api"

const MS_PER_DAY = 86_400_000

/** Normaliza "DD/MM/YYYY" (formato de alguns campos da API) para ISO 8601. */
export function parseBrDate(value: string | null | undefined): string | null {
	if (!value) return null
	const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
	if (match) return `${match[3]}-${match[2]}-${match[1]}`
	if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.substring(0, 10)
	return null
}

/**
 * `numeroAtaRegistroPreco` é casado por igualdade exata, no formato NNNNN/AAAA:
 * "2/2025" e "00002" não retornam nada, só "00002/2025".
 */
export function formatNumeroAta(numero: string, ano: string): string {
	const digits = numero.replace(/\D/g, "")
	return `${digits.padStart(5, "0")}/${ano}`
}

/** Extrai o ano de "00002/2025". */
export function anoFromNumeroAta(numeroAta: string): string | null {
	return numeroAta.split("/")[1] ?? null
}

/**
 * A janela de `dataVigenciaInicial` é obrigatória em `1_consultarARP` e
 * `2_consultarARPItem`, e acima de 365 dias a API responde
 * 400 "Período inicial e final maior que 365 dias.". 365 exatos passam.
 *
 * @throws {Error} com mensagem para o usuário quando a janela é inválida.
 */
export function assertVigenciaWindow(min: string, max: string): void {
	const from = Date.parse(`${min}T00:00:00Z`)
	const to = Date.parse(`${max}T00:00:00Z`)
	if (Number.isNaN(from) || Number.isNaN(to)) throw new Error("Período de vigência inválido")
	if (to < from) throw new Error("A data final da vigência é anterior à inicial")
	const days = (to - from) / MS_PER_DAY
	if (days > COMPRAS_MAX_DATE_WINDOW_DAYS) {
		throw new Error(`O Compras.gov.br aceita no máximo ${COMPRAS_MAX_DATE_WINDOW_DAYS} dias entre as datas de vigência (pedido: ${Math.round(days)})`)
	}
}

/** Janela padrão de busca: os últimos 365 dias de vigência inicial. */
export function defaultVigenciaWindow(now: Date = new Date()): { min: string; max: string } {
	const toIso = (d: Date) => d.toISOString().slice(0, 10)
	return { min: toIso(new Date(now.getTime() - COMPRAS_MAX_DATE_WINDOW_DAYS * MS_PER_DAY)), max: toIso(now) }
}

/** `numeroItem` vem como string zero-padded ("00017"); a coluna local é inteira. */
export function parseNumeroItem(value: string | null | undefined): number | null {
	if (value == null) return null
	const n = Number(value)
	return Number.isFinite(n) ? n : null
}

// ─── Saldo de empenho (modulo-arp/4_consultarEmpenhosSaldoItem) ───────────────

/** Saldo de um item, já resolvido a partir da linha do endpoint 4. */
export interface ArpSaldo {
	quantidadeEmpenhada: number
	/** `null` só quando a API não deu saldo E não deu como derivá-lo. */
	saldoEmpenho: number | null
}

type SaldoRow = {
	numeroItem?: string | null
	tipo?: string | null
	quantidadeRegistrada?: number | null
	quantidadeEmpenhada?: number | null
	saldoEmpenho?: number | null
}

/**
 * Indexa as linhas de saldo por `numero_item`.
 *
 * Duas regras que não são óbvias na resposta:
 * - a ata pode trazer linha de participante além da gerenciadora, e é a da
 *   GERENCIADORA que corresponde ao saldo que a unidade administra;
 * - `saldoEmpenho` ausente NÃO é saldo cheio — a linha existe justamente porque
 *   há empenho. Deriva de `quantidadeRegistrada - quantidadeEmpenhada` quando dá.
 *
 * Item sem empenho não aparece na resposta; quem trata a ausência é o chamador,
 * porque só ele conhece a quantidade homologada.
 */
export function resolveArpSaldos(rows: SaldoRow[]): Map<number, ArpSaldo> {
	const byItem = new Map<number, ArpSaldo>()
	const fromGerenciadora = new Set<number>()

	for (const row of rows) {
		const numero = parseNumeroItem(row.numeroItem)
		if (numero == null) continue

		const isGerenciadora = row.tipo === "GERENCIADORA"
		if (byItem.has(numero) && (fromGerenciadora.has(numero) || !isGerenciadora)) continue
		if (isGerenciadora) fromGerenciadora.add(numero)

		const empenhada = row.quantidadeEmpenhada ?? 0
		const saldo = row.saldoEmpenho ?? (row.quantidadeRegistrada != null ? row.quantidadeRegistrada - empenhada : null)
		byItem.set(numero, { quantidadeEmpenhada: empenhada, saldoEmpenho: saldo })
	}

	return byItem
}
