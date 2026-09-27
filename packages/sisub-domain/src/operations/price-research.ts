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
 * Pesquisa avulsa exige `unit:1` (membro do módulo). Quando o registro é LIGADO a um anexo
 * (`quantityEstimateId`/`quantityEstimateItemId`), exige `unit:2` na unidade DONA do anexo — e a unidade sai da linha
 * persistida (`quantity_estimate.unit_id`), nunca do payload: aceitar o escopo do chamador
 * deixaria membro de qualquer unidade carimbar memória de cálculo em anexo alheio.
 *
 * ## Conflitos e numeric
 *
 * - O índice de idempotência é PARCIAL (`where idempotency_key is not null`), então o
 *   `on conflict` precisa repetir o predicado para o Postgres inferir o índice árbitro —
 *   sem o `where`, o planner recusa com 42P10 ("no unique or exclusion constraint matching").
 * - Colunas `numeric` são escritas com `String(...)` (o driver as recebe e devolve como
 *   string); os valores continuam indo com a mesma precisão que o PostgREST enviava.
 */

// Namespace, não named import: o barrel `@iefa/sisub-domain` chega ao bundle do cliente, e no
// dev o Vite resolve `node:crypto` para um stub que LANÇA ao ler qualquer export — o named
// import lia `createHash` na carga do módulo e derrubava a hidratação do app inteiro. Assim o
// acesso só acontece dentro da função, que só roda no servidor.
import * as nodeCrypto from "node:crypto"
import {
	procurementPesquisaPrecoAmostraInProcurement,
	procurementPesquisaPrecoInProcurement,
	procurementPesquisaPrecoItemInProcurement,
	quantityEstimateInProcurement,
	quantityEstimateItemInProcurement,
	type SisubDb,
} from "@iefa/database/drizzle/sisub"
import { asc, eq, isNotNull, sql } from "drizzle-orm"
import { requirePermission, requireUnit } from "../guards/require-permission.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError, NotFoundError } from "../types/errors.ts"
import { insertOneOrFail, runQuery } from "../utils/index.ts"
import {
	justificationsToPersist,
	type OpenResearchFinding,
	openFindingsOf,
	type PriceResearchMethod,
	type ResearchComplianceFacts,
	type ResearchJustifications,
	researchNonComplianceReasons,
	splitOutliersByIqr,
} from "./price-research-compliance.ts"
import { convertSamplePrice, SAMPLE_CONVERSION_REASON_LABELS } from "./price-units.ts"

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
	/** Fornecedor da compra de origem (CNPJ/CPF e nome), quando a fonte informa. */
	niFornecedor?: string | null
	nomeFornecedor?: string | null
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
	method: PriceResearchMethod
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
	/**
	 * Amostras descartadas por não terem conteúdo comparável com a unidade do item
	 * (inconsistentes, art. 6º da IN SEGES/ME 65/2021). Gravadas como `pollution`: a etapa do
	 * funil que descarta amostra que não é do mesmo produto na mesma unidade.
	 */
	inconsistentSamples?: PriceResearchSample[]
	/** Unidade em que os preços foram comparados e o preço estimado vale. */
	measureUnit?: string | null
	/** true quando o item não declara unidade e a pesquisa herdou a predominante das amostras. */
	unitInferred?: boolean
	/**
	 * O que o cliente declara: amostras escolhidas à mão (seleção de linhas ou filtro de coluna) em
	 * vez do descarte automático. O servidor não depende disso para marcar conforme: deriva a
	 * seleção manual também dos números recebidos (`deriveManualSelection`).
	 */
	manualSelection?: boolean
	/** Justificativas da pesquisa; só as que respondem a uma não conformidade dela são gravadas. */
	justifications?: ResearchJustifications
	/** Se fornecidos, linka imediatamente (caso anexo já existente). */
	quantityEstimateId?: string
	quantityEstimateItemId?: string
}

export type PriceResearchAuditIds = { researchId: string; researchItemId: string }

/** Ids gravados e as não conformidades em aberto, como o servidor as calculou e gravou. */
export type PriceResearchAuditResult = PriceResearchAuditIds & { openFindings: OpenResearchFinding[] }

/**
 * Seleção manual derivada do que o servidor recebe, sem confiar no flag do cliente:
 * - amostras sumiram entre a janela e a classificação: a janela tinha `dateFilteredCount` preços, e
 *   válidas + descartadas + inconsistentes somam menos (seleção de linhas, filtro de coluna);
 * - a classificação válida/descartada não é a do IQR automático sobre os mesmos preços, na mesma
 *   unidade (`splitOutliersByIqr`, o critério do modal e do lote).
 * Qualquer um dos dois, ou o flag do cliente, marca a seleção manual (art. 6º, § 3º).
 */
export function deriveManualSelection(input: SavePriceResearchAudit): boolean {
	if (input.manualSelection) return true
	const classified = input.validSamples.length + input.outlierSamples.length + (input.inconsistentSamples?.length ?? 0)
	if (input.dateFilteredCount != null && input.dateFilteredCount > classified) return true
	if (!input.measureUnit) return false
	const unit = input.measureUnit
	const comparable = [...input.validSamples.map((s) => ({ s, valid: true })), ...input.outlierSamples.map((s) => ({ s, valid: false }))].flatMap((c) => {
		const conversion = convertSamplePrice(c.s, unit)
		return conversion.ok ? [{ ...c, price: conversion.price }] : []
	})
	const expectedOutliers = new Set(splitOutliersByIqr(comparable, (c) => c.price).outliers)
	return comparable.some((c) => c.valid === expectedOutliers.has(c))
}

/**
 * Fatos de conformidade da entrada gravada. Amostra válida sem data de referência conta como
 * "sem data no cálculo": a janela a deixa de fora, então ela só chega aqui escolhida pelo usuário.
 */
export function complianceFactsOf(input: SavePriceResearchAudit): ResearchComplianceFacts {
	return {
		validCount: input.validCount,
		referencePrice: input.referencePrice,
		stats: input.stats,
		measureUnit: input.measureUnit,
		unitInferred: input.unitInferred,
		method: input.method,
		periodMonths: input.periodMonths,
		undatedCount: input.validSamples.filter((s) => !(s.dataResultado ?? s.dataCompra)).length,
		manualSelection: deriveManualSelection(input),
		justifications: input.justifications,
	}
}

/**
 * Resolve o anexo alvo e exige `unit:2` na unidade DONA dele.
 *
 * Quando `quantityEstimateItemId` vem junto de `quantityEstimateId`, o item precisa pertencer ao anexo informado — e o anexo
 * efetiva passa a ser a do ITEM, lida do banco. Sem isso, o payload escolheria sozinho a
 * unidade contra a qual a permissão é checada.
 */
async function authorizeQuantityEstimateTarget(
	db: SisubDb,
	ctx: UserContext,
	requestedQuantityEstimateId?: string,
	quantityEstimateItemId?: string
): Promise<void> {
	let quantityEstimateId = requestedQuantityEstimateId ?? null

	if (quantityEstimateItemId) {
		const rows = await runQuery(
			"FETCH_FAILED",
			() =>
				db
					.select({ id: quantityEstimateItemInProcurement.id, quantityEstimateId: quantityEstimateItemInProcurement.quantityEstimateId })
					.from(quantityEstimateItemInProcurement)
					.where(eq(quantityEstimateItemInProcurement.id, quantityEstimateItemId))
					.limit(1),
			{ prefix: "Erro ao validar item do anexo quantitativo" }
		)
		const item = rows[0]
		if (!item || (quantityEstimateId != null && item.quantityEstimateId !== quantityEstimateId)) {
			throw new DomainError("VALIDATION_FAILED", "quantityEstimateItemId não pertence ao anexo quantitativo informado")
		}
		quantityEstimateId = item.quantityEstimateId
	}

	if (quantityEstimateId == null) throw new DomainError("VALIDATION_FAILED", "quantityEstimateItemId não pertence ao anexo quantitativo informado")

	// `const` antes da query: o narrowing de um `let` não sobrevive à captura pelo callback.
	const targetQuantityEstimateId = quantityEstimateId

	const lists = await runQuery(
		"FETCH_FAILED",
		() =>
			db
				.select({ unitId: quantityEstimateInProcurement.unitId })
				.from(quantityEstimateInProcurement)
				.where(eq(quantityEstimateInProcurement.id, targetQuantityEstimateId))
				.limit(1),
		{ prefix: "Erro ao validar anexo quantitativo" }
	)
	const list = lists[0]
	if (!list) throw new NotFoundError("quantity_estimate", targetQuantityEstimateId)

	requireUnit(ctx, 2, list.unitId)
}

/**
 * Chave de idempotência — evita gravar a MESMA memória de cálculo duas vezes (re-clique em
 * "Usar", re-execução do bulk). Escopo: item/CATMAT + método + dia + conjunto exato de
 * amostras. Seleção diferente ⇒ chave diferente ⇒ novo registro (refino legítimo preservado).
 * Dia incluído ⇒ re-pesquisa periódica cria histórico (Lei 14.133/2021, Art. 23).
 */
function idempotencyKeyFor(input: SavePriceResearchAudit, facts: ResearchComplianceFacts): string {
	const sampleFingerprint = nodeCrypto
		.createHash("sha256")
		.update(
			[
				...input.validSamples.map((s) => `v:${s.idCompra}:${s.idItemCompra}`),
				...input.outlierSamples.map((s) => `o:${s.idCompra}:${s.idItemCompra}`),
				...(input.inconsistentSamples ?? []).map((s) => `i:${s.idCompra}:${s.idItemCompra}`),
			]
				.sort()
				.join("|")
		)
		.digest("hex")
		.slice(0, 16)

	// O anexo participa do escopo mesmo sem quantityEstimateItemId: sem isso, dois anexos distintos com o mesmo
	// CATMAT/método/dia/amostras colidiriam na chave e a segunda receberia os IDs de auditoria
	// da primeira — vazando o vínculo entre unidades.
	const scope =
		input.quantityEstimateItemId ??
		(input.quantityEstimateId ? `quantity-estimate-${input.quantityEstimateId}:catmat-${input.catmatCodigo}` : `catmat-${input.catmatCodigo}`)
	// Dia no fuso de Brasília (não UTC) — senão re-execuções entre 21h–24h BRT cairiam em dias
	// UTC distintos e gerariam registros duplicados.
	const day = new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 10)

	// v3: janela, seleção manual e justificativas entram na chave. Justificar no mesmo dia a
	// pesquisa que o lote gravou sem justificativa é OUTRA memória de cálculo; com a chave v2
	// voltava o registro antigo, ainda não conforme, e a justificativa se perdia.
	const justifications = justificationsToPersist(facts)
	const decisionFingerprint = nodeCrypto
		.createHash("sha256")
		.update(JSON.stringify([input.periodMonths ?? null, facts.manualSelection === true, justifications]))
		.digest("hex")
		.slice(0, 12)

	// v2: a unidade e o preço entram na chave. Mesmas amostras em outra unidade (ou gravadas antes
	// da conversão) são OUTRA pesquisa; com a chave v1 voltava o registro antigo com outro preço.
	return `audit:v3:${scope}:${input.method}:${input.measureUnit ?? "-"}:${input.referencePrice.toFixed(4)}:${day}:${sampleFingerprint}:${decisionFingerprint}`
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
		...(input.inconsistentSamples ?? []).map((sample) => ({ sample, type: "pollution" as const })),
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
			ni_fornecedor: sample.niFornecedor ?? null,
			nome_fornecedor: sample.nomeFornecedor ?? null,
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

	// Conversão para a unidade da pesquisa, calculada AQUI (não recebida do cliente) e gravada por
	// item pesquisado: o auditor lê o preço convertido e o fator de cada amostra no relatório.
	const bridge = classified.map(({ sample, type }, i) => {
		const conversion = input.measureUnit ? convertSamplePrice(sample, input.measureUnit) : null
		return {
			researchItemId,
			amostraId: returned[i].id,
			sampleType: type,
			similarity: null,
			convertedPrice: conversion?.ok ? conversion.price : null,
			contentInUnit: conversion?.ok ? conversion.contentInTarget : null,
			conversion: conversion?.ok ? conversion.explanation : conversion ? SAMPLE_CONVERSION_REASON_LABELS[conversion.reason] : null,
		}
	})

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
	// Parâmetro do art. 5º: toda amostra daqui vem do Compras.gov.br (inciso I,
	// `COMPRAS_GOV_ART5_PARAMETER`), que é o default da coluna `art5_parameter`. Fonte nova grava o
	// próprio inciso no `values` acima.
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
export async function savePriceResearchAudit(db: SisubDb, ctx: UserContext, input: SavePriceResearchAudit): Promise<PriceResearchAuditResult> {
	// WRITE numa trilha de auditoria de preço. Sessão sozinha deixava qualquer autenticado
	// forjar memória de cálculo; guard sem escopo ainda deixava membro de qualquer unidade
	// gravar/ligar auditoria em anexo alheio.
	requirePermission(ctx, "unit", 1)
	if (input.quantityEstimateId || input.quantityEstimateItemId) {
		await authorizeQuantityEstimateTarget(db, ctx, input.quantityEstimateId, input.quantityEstimateItemId)
	}

	const facts = complianceFactsOf(input)
	const idempotencyKey = idempotencyKeyFor(input, facts)
	// Não conformidade não trava a gravação: fica registrada no item, e a justificativa a resolve.
	// Devolvida ao chamador como o servidor a calculou: a chave cobre todos os fatos, então a
	// pesquisa idempotente tem as mesmas.
	const nonComplianceReasons = researchNonComplianceReasons(facts)
	const openFindings = openFindingsOf(facts)

	// `runQuery` por FORA da transação também: o erro de BEGIN/COMMIT ou de aquisição de
	// conexão não passa pelos `runQuery` internos, e cru ele chega como o SQL despejado, com
	// a causa real escondida em `.cause`. `runQuery` repassa `DomainError` intacto.
	return runQuery("TRANSACTION_FAILED", () =>
		db.transaction(async (tx) => {
			const inserted = await runQuery(
				"INSERT_FAILED",
				() =>
					tx
						.insert(procurementPesquisaPrecoInProcurement)
						.values({
							quantityEstimateId: input.quantityEstimateId ?? null,
							referenceMethod: input.method,
							periodMonths: input.periodMonths ?? null,
							totalItems: 1,
							itemsWithPrice: input.validCount > 0 ? 1 : 0,
							itemsWithoutCatmat: 0,
							nonCompliantItems: nonComplianceReasons.length > 0 ? 1 : 0,
							idempotencyKey,
							// Agente responsável pela pesquisa (IN SEGES/ME 65/2021, art. 3º, II): a sessão.
							createdBy: ctx.userId,
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
			if (!research) return { ...(await loadIdempotentResearch(tx, idempotencyKey)), openFindings }

			const dateFiltered = input.dateFilteredCount ?? input.rawCount
			const justifications = justificationsToPersist(facts)
			const researchItem = await insertOneOrFail(
				"INSERT_FAILED",
				"Erro ao salvar item da pesquisa: no row returned",
				() =>
					tx
						.insert(procurementPesquisaPrecoItemInProcurement)
						.values({
							researchId: research.id,
							quantityEstimateItemId: input.quantityEstimateItemId ?? null,
							catmatCodigo: input.catmatCodigo,
							catmatDescricao: input.catmatDescricao ?? null,
							productName: input.catmatDescricao ?? String(input.catmatCodigo),
							totalRaw: input.rawCount,
							totalAfterDateFilter: dateFiltered,
							// Poluição = amostra que não é comparável com o item na unidade dele.
							totalAfterPollutionFilter: dateFiltered - (input.inconsistentSamples?.length ?? 0),
							totalAfterOutlier: input.validCount,
							priceMin: input.stats.min,
							priceMax: input.stats.max,
							priceMean: input.stats.mean,
							priceMedian: input.stats.median,
							stdDev: input.stats.stdDev,
							cvPct: input.stats.cv,
							uniqueSources: input.stats.uniqueSources,
							referencePrice: input.referencePrice,
							referenceMethod: input.method,
							measureUnit: input.measureUnit ?? null,
							isCompliant: nonComplianceReasons.length === 0,
							nonComplianceReasons,
							// Seleção manual (derivada no servidor) e as justificativas do item. Sem
							// justificativa, os valores são os defaults das colunas.
							manualSelection: facts.manualSelection === true,
							justificationLowSample: justifications.lowSample,
							justificationMethod: justifications.method,
							justificationOutlierCriteria: justifications.outlierCriteria,
							justificationOutOfPeriod: justifications.outOfPeriod,
						})
						.returning({ id: procurementPesquisaPrecoItemInProcurement.id }),
				{ prefix: "Erro ao salvar item da pesquisa" }
			)

			await persistSamples(tx, researchItem.id, input)

			return { researchId: research.id, researchItemId: researchItem.id, openFindings }
		})
	)
}
