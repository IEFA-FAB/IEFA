/**
 * Pesquisa de preço — memória de cálculo persistida para auditoria (Lei 14.133/2021, Art. 23).
 * Drizzle query layer (migração PostgREST→Drizzle, fase 3).
 *
 * A consulta ao Compras.gov.br continua no app (`price-research.fn.ts`): é HTTP externo, não
 * banco. Aqui mora só a persistência — cabeçalho da pesquisa, item consultado, e a
 * classificação das amostras (válida/outlier) contra o catálogo deduplicado `compras_amostra`.
 *
 * ## Autorização
 *
 * Pesquisa avulsa exige `unit:1` (membro do módulo). Quando o registro é LIGADO a uma ATA
 * (`ataId`/`ataItemId`), exige `unit:2` na unidade DONA da ata — e a unidade sai da linha
 * persistida (`procurement_list.unit_id`), nunca do payload: aceitar o escopo do chamador
 * deixaria membro de qualquer unidade carimbar memória de cálculo em ATA alheia.
 *
 * ## Conflitos e numeric
 *
 * - O índice de idempotência é PARCIAL (`where idempotency_key is not null`), então o
 *   `on conflict` precisa repetir o predicado para o Postgres inferir o índice árbitro —
 *   sem o `where`, o planner recusa com 42P10 ("no unique or exclusion constraint matching").
 * - Colunas `numeric` são escritas com `String(...)` (o driver as recebe e devolve como
 *   string); os valores continuam indo com a mesma precisão que o PostgREST enviava.
 */

import { createHash } from "node:crypto"
import {
	procurementListInProcurement,
	procurementListItemInProcurement,
	procurementPesquisaPrecoAmostraInProcurement,
	procurementPesquisaPrecoInProcurement,
	procurementPesquisaPrecoItemInProcurement,
	type SisubDb,
} from "@iefa/database/drizzle/sisub"
import { asc, eq, isNotNull, sql } from "drizzle-orm"
import { requirePermission, requireUnit } from "../guards/require-permission.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError, NotFoundError } from "../types/errors.ts"
import { insertOneOrFail, runQuery } from "../utils/index.ts"

type PriceResearchTx = Parameters<Parameters<SisubDb["transaction"]>[0]>[0]

/**
 * Amostra crua do Compras.gov.br, já normalizada pelo fn (`idCompra` vira string).
 * Os nomes são os da API federal — traduzi-los quebraria a rastreabilidade até a fonte.
 */
export type PriceResearchSample = {
	idCompra: string
	idItemCompra: number
	descricaoItem?: string | null
	precoUnitario?: number | null
	capacidadeUnidadeFornecimento?: number | null
	siglaUnidadeFornecimento?: string | null
	siglaUnidadeMedida?: string | null
	quantidade?: number | null
	codigoUasg?: string | null
	nomeUasg?: string | null
	municipio?: string | null
	estado?: string | null
	marca?: string | null
	dataCompra?: string | null
	dataResultado?: string | null
}

export type PriceResearchStats = {
	mean: number
	median: number
	stdDev: number
	cv: number
	min: number
	max: number
	uniqueSources: number
}

/**
 * Entrada da memória de cálculo. O validador do fn ainda carrega `outlierCount` (contrato de
 * wire com o cliente), mas a persistência conta os descartes pelo próprio `outlierSamples` —
 * o número e a lista não podem divergir se só a lista for gravada.
 */
export type SavePriceResearchAudit = {
	catmatCodigo: number
	catmatDescricao?: string | null
	method: "mean" | "median"
	referencePrice: number
	stats: PriceResearchStats
	rawCount: number
	/** Amostras restantes após a janela de recência (Art. 5º da IN SEGES 65/2021). */
	dateFilteredCount?: number
	/** Janela de recência em meses; null/ausente quando a pesquisa considerou todo o histórico. */
	periodMonths?: number | null
	validCount: number
	validSamples: PriceResearchSample[]
	outlierSamples: PriceResearchSample[]
	/** Se fornecidos, linka imediatamente (caso ATA já existente). */
	ataId?: string
	ataItemId?: string
}

export type PriceResearchAuditIds = { researchId: string; researchItemId: string }

/** Amostra mínima de conformidade da IN SEGES 65/2021: 3 preços de 3 UASGs distintas. */
const MIN_COMPLIANT_SAMPLES = 3

/**
 * Resolve a ATA alvo e exige `unit:2` na unidade DONA dela.
 *
 * Quando `ataItemId` vem junto de `ataId`, o item precisa pertencer à ata informada — e a ata
 * efetiva passa a ser a do ITEM, lida do banco. Sem isso, o payload escolheria sozinho a
 * unidade contra a qual a permissão é checada.
 */
async function authorizeAtaTarget(db: SisubDb, ctx: UserContext, ataId?: string, ataItemId?: string): Promise<void> {
	let listId = ataId ?? null

	if (ataItemId) {
		const rows = await runQuery(
			"FETCH_FAILED",
			() =>
				db
					.select({ id: procurementListItemInProcurement.id, listId: procurementListItemInProcurement.listId })
					.from(procurementListItemInProcurement)
					.where(eq(procurementListItemInProcurement.id, ataItemId))
					.limit(1),
			{ prefix: "Erro ao validar item da ATA" }
		)
		const item = rows[0]
		if (!item || (listId != null && item.listId !== listId)) {
			throw new DomainError("VALIDATION_FAILED", "ataItemId não pertence à ATA informada")
		}
		listId = item.listId
	}

	if (listId == null) throw new DomainError("VALIDATION_FAILED", "ataItemId não pertence à ATA informada")

	// `const` antes da query: o narrowing de um `let` não sobrevive à captura pelo callback.
	const targetListId = listId

	const lists = await runQuery(
		"FETCH_FAILED",
		() =>
			db
				.select({ unitId: procurementListInProcurement.unitId })
				.from(procurementListInProcurement)
				.where(eq(procurementListInProcurement.id, targetListId))
				.limit(1),
		{ prefix: "Erro ao validar ATA" }
	)
	const list = lists[0]
	if (!list) throw new NotFoundError("ata", targetListId)

	requireUnit(ctx, 2, list.unitId)
}

/**
 * Chave de idempotência — evita gravar a MESMA memória de cálculo duas vezes (re-clique em
 * "Usar", re-execução do bulk). Escopo: item/CATMAT + método + dia + conjunto exato de
 * amostras. Seleção diferente ⇒ chave diferente ⇒ novo registro (refino legítimo preservado).
 * Dia incluído ⇒ re-pesquisa periódica cria histórico (Lei 14.133/2021, Art. 23).
 */
function idempotencyKeyFor(input: SavePriceResearchAudit): string {
	const sampleFingerprint = createHash("sha256")
		.update(
			[...input.validSamples.map((s) => `v:${s.idCompra}:${s.idItemCompra}`), ...input.outlierSamples.map((s) => `o:${s.idCompra}:${s.idItemCompra}`)]
				.sort()
				.join("|")
		)
		.digest("hex")
		.slice(0, 16)

	// A ATA participa do escopo mesmo sem ataItemId: sem isso, duas ATAs distintas com o mesmo
	// CATMAT/método/dia/amostras colidiriam na chave e a segunda receberia os IDs de auditoria
	// da primeira — vazando o vínculo entre unidades.
	const scope = input.ataItemId ?? (input.ataId ? `ata-${input.ataId}:catmat-${input.catmatCodigo}` : `catmat-${input.catmatCodigo}`)
	// Dia no fuso de Brasília (não UTC) — senão re-execuções entre 21h–24h BRT cairiam em dias
	// UTC distintos e gerariam registros duplicados.
	const day = new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 10)

	return `audit:v1:${scope}:${input.method}:${day}:${sampleFingerprint}`
}

/**
 * Recupera os ids da pesquisa que já existe sob a mesma chave de idempotência.
 * Só é chamada quando o `on conflict do nothing` não devolveu linha.
 */
async function loadIdempotentResearch(tx: PriceResearchTx, idempotencyKey: string): Promise<PriceResearchAuditIds> {
	const headers = await runQuery(
		"FETCH_FAILED",
		() =>
			tx
				.select({ id: procurementPesquisaPrecoInProcurement.id })
				.from(procurementPesquisaPrecoInProcurement)
				.where(eq(procurementPesquisaPrecoInProcurement.idempotencyKey, idempotencyKey))
				.limit(1),
		{ prefix: "Erro ao recuperar pesquisa idempotente" }
	)
	const researchId = headers[0]?.id
	if (!researchId) throw new DomainError("FETCH_FAILED", "Erro ao recuperar pesquisa idempotente: nenhuma linha encontrada")

	// A pesquisa avulsa tem exatamente um item; a ordem fixa por `created_at` só torna
	// determinístico o desempate caso um dia passe a ter mais de um.
	const items = await runQuery(
		"FETCH_FAILED",
		() =>
			tx
				.select({ id: procurementPesquisaPrecoItemInProcurement.id })
				.from(procurementPesquisaPrecoItemInProcurement)
				.where(eq(procurementPesquisaPrecoItemInProcurement.researchId, researchId))
				.orderBy(asc(procurementPesquisaPrecoItemInProcurement.createdAt))
				.limit(1),
		{ prefix: "Erro ao recuperar pesquisa idempotente" }
	)
	const researchItemId = items[0]?.id
	if (!researchItemId) throw new DomainError("FETCH_FAILED", "Pesquisa idempotente sem item associado")

	return { researchId, researchItemId }
}

/**
 * Grava as amostras classificadas do item: FATO (catálogo deduplicado `compras_amostra`,
 * via RPC idempotente por fingerprint de conteúdo) e PARTICIPAÇÃO (ponte por-pesquisa, que
 * guarda só a classificação).
 *
 * O upsert do catálogo continua na função `procurement.upsert_compras_amostras`: ela insere
 * linha a linha para conseguir `RETURNING` também na pré-existente, e um `insert ... on
 * conflict` em lote não daria conta (duplicata DENTRO do mesmo lote aborta o comando).
 */
async function persistSamples(tx: PriceResearchTx, researchItemId: string, input: SavePriceResearchAudit): Promise<void> {
	const classified = [
		...input.validSamples.map((sample) => ({ sample, type: "valid" as const })),
		...input.outlierSamples.map((sample) => ({ sample, type: "outlier" as const })),
	]
	if (classified.length === 0) return

	const factRows = classified.map(({ sample }) => {
		const cap = sample.capacidadeUnidadeFornecimento ?? 1
		const preco = sample.precoUnitario ?? null
		return {
			id_compra: sample.idCompra,
			id_item_compra: sample.idItemCompra,
			descricao_item: sample.descricaoItem ?? null,
			preco_unitario: preco,
			capacidade_unidade_fornecimento: sample.capacidadeUnidadeFornecimento ?? null,
			sigla_unidade_fornecimento: sample.siglaUnidadeFornecimento ?? null,
			sigla_unidade_medida: sample.siglaUnidadeMedida ?? null,
			quantidade: sample.quantidade ?? null,
			codigo_uasg: sample.codigoUasg ?? null,
			nome_uasg: sample.nomeUasg ?? null,
			municipio: sample.municipio ?? null,
			estado: sample.estado ?? null,
			esfera: null,
			marca: sample.marca ?? null,
			normalized_price: preco !== null && cap > 0 ? preco / cap : preco,
			reference_date: sample.dataResultado ?? sample.dataCompra ?? null,
		}
	})

	// `setof uuid` devolvido na ordem do array de entrada (RETURN NEXT dentro do loop),
	// que é o que alinha cada id à classificação correspondente.
	const returned = (await runQuery(
		"INSERT_FAILED",
		() => tx.execute(sql`select t.id from procurement.upsert_compras_amostras(${JSON.stringify(factRows)}::jsonb) as t(id)`),
		{ prefix: "Erro ao salvar observações de compra" }
	)) as unknown as { id: string }[]

	if (!Array.isArray(returned) || returned.length !== classified.length) {
		throw new DomainError("INSERT_FAILED", "Catálogo de amostras retornou contagem inesperada")
	}

	const bridge = classified.map(({ type }, i) => ({
		researchItemId,
		amostraId: returned[i].id,
		sampleType: type,
		similarity: null,
	}))

	await runQuery(
		"INSERT_FAILED",
		() =>
			tx
				.insert(procurementPesquisaPrecoAmostraInProcurement)
				.values(bridge)
				.onConflictDoNothing({
					target: [procurementPesquisaPrecoAmostraInProcurement.researchItemId, procurementPesquisaPrecoAmostraInProcurement.amostraId],
				}),
		{ prefix: "Erro ao salvar amostras" }
	)
}

/**
 * Persiste a memória de cálculo de UM item pesquisado e devolve os ids (cabeçalho + item).
 *
 * Idempotente por dia/CATMAT/método/conjunto de amostras: uma segunda chamada idêntica
 * devolve os ids da primeira em vez de duplicar a trilha de auditoria.
 *
 * Tudo roda em uma transação — a versão PostgREST gravava cabeçalho, item e amostras em
 * comandos soltos, e uma falha no meio deixava cabeçalho órfão SEGURANDO a chave de
 * idempotência: a re-tentativa achava a pesquisa sem item e falhava para sempre naquele dia.
 */
export async function savePriceResearchAudit(db: SisubDb, ctx: UserContext, input: SavePriceResearchAudit): Promise<PriceResearchAuditIds> {
	// WRITE numa trilha de auditoria de preço. Sessão sozinha deixava qualquer autenticado
	// forjar memória de cálculo; guard sem escopo ainda deixava membro de qualquer unidade
	// gravar/ligar auditoria em ATA alheia.
	requirePermission(ctx, "unit", 1)
	if (input.ataId || input.ataItemId) {
		await authorizeAtaTarget(db, ctx, input.ataId, input.ataItemId)
	}

	const idempotencyKey = idempotencyKeyFor(input)

	return db.transaction(async (tx) => {
		const inserted = await runQuery(
			"INSERT_FAILED",
			() =>
				tx
					.insert(procurementPesquisaPrecoInProcurement)
					.values({
						ataId: input.ataId ?? null,
						referenceMethod: input.method,
						periodMonths: input.periodMonths ?? null,
						totalItems: 1,
						itemsWithPrice: input.validCount > 0 ? 1 : 0,
						itemsWithoutCatmat: 0,
						nonCompliantItems: 0,
						idempotencyKey,
					})
					// O `where` repete o predicado do índice parcial — sem ele o Postgres não
					// infere o árbitro e recusa o comando inteiro (42P10).
					.onConflictDoNothing({
						target: procurementPesquisaPrecoInProcurement.idempotencyKey,
						where: isNotNull(procurementPesquisaPrecoInProcurement.idempotencyKey),
					})
					.returning({ id: procurementPesquisaPrecoInProcurement.id }),
			{ prefix: "Erro ao salvar pesquisa" }
		)

		// Conflito: pesquisa idêntica já existe hoje — devolve a existente sem duplicar.
		const research = inserted[0]
		if (!research) return loadIdempotentResearch(tx, idempotencyKey)

		const dateFiltered = input.dateFilteredCount ?? input.rawCount
		const researchItem = await insertOneOrFail(
			"INSERT_FAILED",
			"Erro ao salvar item da pesquisa: no row returned",
			() =>
				tx
					.insert(procurementPesquisaPrecoItemInProcurement)
					.values({
						researchId: research.id,
						ataItemId: input.ataItemId ?? null,
						catmatCodigo: input.catmatCodigo,
						catmatDescricao: input.catmatDescricao ?? null,
						productName: input.catmatDescricao ?? String(input.catmatCodigo),
						totalRaw: input.rawCount,
						totalAfterDateFilter: dateFiltered,
						// Não há filtro de similaridade/poluição CATMAT nesta pesquisa — a etapa é
						// registrada como passa-tudo (nenhuma amostra descartada por poluição).
						totalAfterPollutionFilter: dateFiltered,
						totalAfterOutlier: input.validCount,
						priceMin: String(input.stats.min),
						priceMax: String(input.stats.max),
						priceMean: String(input.stats.mean),
						priceMedian: String(input.stats.median),
						stdDev: String(input.stats.stdDev),
						cvPct: String(input.stats.cv),
						uniqueSources: input.stats.uniqueSources,
						referencePrice: String(input.referencePrice),
						referenceMethod: input.method,
						isCompliant: input.validCount >= MIN_COMPLIANT_SAMPLES && input.stats.uniqueSources >= MIN_COMPLIANT_SAMPLES,
						nonComplianceReasons: [
							...(input.validCount < MIN_COMPLIANT_SAMPLES ? ["Menos de 3 amostras válidas"] : []),
							...(input.stats.uniqueSources < MIN_COMPLIANT_SAMPLES ? ["Menos de 3 UASGs distintas"] : []),
						],
					})
					.returning({ id: procurementPesquisaPrecoItemInProcurement.id }),
			{ prefix: "Erro ao salvar item da pesquisa" }
		)

		await persistSamples(tx, researchItem.id, input)

		return { researchId: research.id, researchItemId: researchItem.id }
	})
}
