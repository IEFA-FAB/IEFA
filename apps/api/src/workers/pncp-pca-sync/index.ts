import { parsePcaCsv } from "@iefa/sisub-domain/pncp-pca"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { env } from "../../env.ts"
import { beatSync, claimSync, finishSync, SYNC_SOURCES } from "../../lib/sync-log.ts"
import { fetchPcaCsv } from "./client.ts"
import { dedupeAnos } from "./index-pure.ts"
import { checkSnapshotSanity, contentHash, planReconciliation } from "./reconcile.ts"

/**
 * @module pncp-pca-sync
 * Ingestão do Plano de Contratações Anual do PNCP.
 *
 * É o único endpoint de lote do PNCP: uma requisição traz o plano inteiro de um órgão num ano
 * — 21.392 itens e 35 UASGs no caso da FAB. Por isso não há fila, token bucket, disjuntor nem
 * coalescência aqui: não existe fan-out para racionar.
 *
 * A tabela é o cache. A UI lê só dela; nenhuma requisição de usuário toca a origem.
 */

/** CNPJ raiz do Comando da Aeronáutica — cobre as 200 unidades do órgão. */
export const COMAER_CNPJ = "00394429000100"

/** Devolvido por `runPcaSync` quando já havia ingestão viva — não é id de sync. */
export const SYNC_ALREADY_RUNNING = -1

const CHUNK = 500

export interface RunPcaSyncOptions {
	triggeredBy: "cron" | "manual"
	cnpj?: string
	/** Anos a coletar. Padrão: exercício corrente e o seguinte (2027 já está publicado). */
	anos?: number[]
}

export interface PcaSyncYearResult {
	ano: number
	status: "applied" | "unchanged" | "absent" | "refused" | "error"
	detail?: string
	inserted?: number
	removed?: number
	restored?: number
}

function getClient(): SupabaseClient<any, any> {
	return createClient(env.API_SUPABASE_URL, env.API_SUPABASE_SERVICE_ROLE_KEY, {
		db: { schema: "compras_gov_integration" },
		auth: { persistSession: false },
	})
}

/**
 * Ingere um par órgão/ano. Devolve o que aconteceu, sem lançar em falha esperada.
 *
 * `beat` é chamado ao longo do trabalho porque UM ano já dura mais que os 90 s de
 * `HEARTBEAT_TIMEOUT_MS`: são até 35 s só de download, ~43 páginas de leitura e ~43 lotes de
 * upsert para 21 mil linhas. Sem batida no meio, um disparo concorrente enxerga a execução viva
 * como morta, `recoverStaleSyncs` a marca `instance_died` e uma segunda ingestão do mesmo
 * órgão/ano começa por cima.
 */
export async function syncPcaYear(
	supabase: SupabaseClient<any, any>,
	cnpj: string,
	ano: number,
	beat: () => Promise<void> = async () => {}
): Promise<PcaSyncYearResult> {
	// Bate antes do download: a escada de retentativa do cliente pode passar dos 90 s do
	// timeout de heartbeat sozinha, e aí um `claimSync` concorrente ceifaria esta execução viva.
	await beat()
	const res = await fetchPcaCsv(cnpj, ano)
	await beat()

	// 204: o órgão não publicou plano nesse ano. Ausência, não erro.
	if (res.content === null) {
		return { ano, status: "absent", detail: "origem respondeu 204 (sem plano publicado)" }
	}

	const hash = await contentHash(res.content)

	const { data: snapshot } = await supabase.from("pncp_pca_snapshot").select("content_hash").eq("cnpj_orgao", cnpj).eq("ano_pca", ano).maybeSingle()

	// Invalidação por conteúdo: medimos o CSV voltar byte a byte idêntico entre coletas, e
	// reaplicar custaria 21 mil escritas sem nenhuma mudança de estado.
	if (snapshot?.content_hash === hash) {
		return { ano, status: "unchanged", detail: "conteúdo idêntico ao último aplicado" }
	}

	await beat()

	const { items, skipped } = parsePcaCsv(res.content)

	// PAGINADO de propósito: o PostgREST corta em 1000 linhas por padrão e o acervo tem ~21 mil
	// por órgão/ano. Um `known` truncado quebraria as duas coisas que dependem dele — a guarda de
	// completude (comparando contra 1000 em vez do total real) e a própria reconciliação, que
	// deixaria vivo para sempre tudo o que estivesse além da primeira página.
	const known: Array<{ idItemPca: string; removed: boolean }> = []
	for (let from = 0; ; from += CHUNK) {
		const { data: page, error: knownErr } = await supabase
			.from("pncp_pca_item")
			.select("id_item_pca, removed_at")
			.eq("cnpj_orgao", cnpj)
			.eq("ano_pca", ano)
			.order("id_item_pca")
			.range(from, from + CHUNK - 1)

		if (knownErr) throw new Error(`Falha ao ler o acervo do PCA ${cnpj}/${ano}: ${knownErr.message}`)
		if (!page?.length) break

		for (const r of page as Array<{ id_item_pca: string; removed_at: string | null }>) {
			known.push({ idItemPca: r.id_item_pca, removed: r.removed_at !== null })
		}
		if (page.length < CHUNK) break
		await beat()
	}

	// Guarda de completude: a origem responde `Content-Length: None` (chunked), então arquivo
	// truncado é indistinguível de arquivo curto. Sem isso, uma conexão cortada marcaria o
	// plano inteiro como removido.
	const sanity = checkSnapshotSanity({
		incomingRows: items.length,
		knownRows: known.filter((k) => !k.removed).length,
	})
	if (!sanity.ok) {
		return { ano, status: "refused", detail: sanity.reason }
	}

	const plan = planReconciliation({ incoming: items, known })
	const now = new Date().toISOString()

	const rows = items.map((it) => ({
		cnpj_orgao: cnpj,
		ano_pca: ano,
		id_item_pca: it.idItemPca,
		uasg: it.uasg,
		nome_unidade: it.nomeUnidade,
		categoria_item: it.categoriaItem,
		identificador_contratacao: it.identificadorContratacao,
		nome_contratacao: it.nomeContratacao,
		catalogo: it.catalogo,
		classificacao_catalogo: it.classificacaoCatalogo,
		codigo_classe: it.codigoClasse,
		nome_classe: it.nomeClasse,
		codigo_pdm: it.codigoPdm,
		nome_pdm: it.nomePdm,
		codigo_item: it.codigoItem,
		descricao_item: it.descricaoItem,
		unidade_fornecimento: it.unidadeFornecimento,
		quantidade_estimada: it.quantidadeEstimada,
		valor_unitario_estimado: it.valorUnitarioEstimado,
		valor_total_estimado: it.valorTotalEstimado,
		valor_orcamentario: it.valorOrcamentario,
		data_desejada: it.dataDesejada,
		collected_at: now,
		// Item que voltou ao plano perde a marca de removido no próprio upsert.
		removed_at: null,
	}))

	// Deduplicado por chave natural: um `id_item_pca` repetido no mesmo lote faz o upsert falhar
	// com 21000 ("ON CONFLICT não pode afetar a linha duas vezes") de forma determinística — o
	// ano inteiro nunca entraria.
	const uniqueRows = [...new Map(rows.map((r) => [r.id_item_pca, r])).values()]

	for (let i = 0; i < uniqueRows.length; i += CHUNK) {
		const { error } = await supabase.from("pncp_pca_item").upsert(uniqueRows.slice(i, i + CHUNK), { onConflict: "cnpj_orgao,ano_pca,id_item_pca" })
		if (error) throw new Error(`Falha ao gravar itens do PCA ${cnpj}/${ano}: ${error.message}`)
		await beat()
	}

	for (let i = 0; i < plan.removeIds.length; i += CHUNK) {
		const { error } = await supabase
			.from("pncp_pca_item")
			.update({ removed_at: now })
			.eq("cnpj_orgao", cnpj)
			.eq("ano_pca", ano)
			.in("id_item_pca", plan.removeIds.slice(i, i + CHUNK))
		if (error) throw new Error(`Falha ao marcar itens removidos do PCA ${cnpj}/${ano}: ${error.message}`)
	}

	const { error: snapErr } = await supabase.from("pncp_pca_snapshot").upsert(
		{
			cnpj_orgao: cnpj,
			ano_pca: ano,
			content_hash: hash,
			row_count: items.length,
			byte_size: res.byteSize,
			applied_at: now,
		},
		{ onConflict: "cnpj_orgao,ano_pca" }
	)
	if (snapErr) throw new Error(`Falha ao gravar snapshot do PCA ${cnpj}/${ano}: ${snapErr.message}`)

	return {
		ano,
		status: "applied",
		inserted: items.length,
		removed: plan.removeIds.length,
		restored: plan.restoreIds.length,
		detail: skipped > 0 ? `${skipped} linha(s) sem id/UASG ignorada(s)` : undefined,
	}
}

/** Roda a ingestão para um órgão e os anos pedidos, registrando em `compras_sync_log`. */
export async function runPcaSync(opts: RunPcaSyncOptions): Promise<number> {
	const supabase = getClient()
	const cnpj = opts.cnpj ?? COMAER_CNPJ
	const currentYear = new Date().getFullYear()
	const anos = dedupeAnos(opts.anos ?? [currentYear, currentYear + 1])

	// Trava de concorrência garantida pelo banco: `claimSync` recupera as execuções mortas
	// desta origem e disputa o índice parcial único — a perdedora recebe 23505.
	const claim = await claimSync(supabase, {
		source: SYNC_SOURCES.pncpPca,
		triggeredBy: opts.triggeredBy,
		totalSteps: anos.length,
	})

	if (!claim.claimed) {
		console.log("[pncp-pca] Ingestão já em andamento. Saindo silenciosamente.")
		return SYNC_ALREADY_RUNNING
	}

	const syncId = claim.syncId

	const { error: stepsErr } = await supabase
		.from("integration_sync_step")
		.insert(anos.map((ano) => ({ sync_id: syncId, step_name: `pca.${ano}`, status: "pending" })))
	if (stepsErr) {
		// Sair de `running` é o que libera a vaga no índice único. Sem isto, a origem fica
		// bloqueada até a recuperação por heartbeat e o painel reporta execução fantasma.
		await finishSync(supabase, syncId, { status: "error", errorMessage: `Falha ao criar os steps do PCA: ${stepsErr.message}` })
		throw new Error(`Falha ao criar os steps do PCA: ${stepsErr.message}`)
	}

	const heartbeat = () => beatSync(supabase, syncId)

	let failed = 0
	let upserted = 0

	for (const ano of anos) {
		const stepName = `pca.${ano}`
		await supabase
			.from("integration_sync_step")
			.update({ status: "running", started_at: new Date().toISOString() })
			.eq("sync_id", syncId)
			.eq("step_name", stepName)

		try {
			const r = await syncPcaYear(supabase, cnpj, ano, heartbeat)
			const isFailure = r.status === "error" || r.status === "refused"
			if (isFailure) failed++
			upserted += r.inserted ?? 0

			await supabase
				.from("integration_sync_step")
				.update({
					status: isFailure ? "error" : "success",
					records_upserted: r.inserted ?? 0,
					records_deactivated: r.removed ?? 0,
					error_message: isFailure ? r.detail : null,
					finished_at: new Date().toISOString(),
				})
				.eq("sync_id", syncId)
				.eq("step_name", stepName)

			console.log(`[pncp-pca] ${cnpj}/${ano}: ${r.status}${r.detail ? ` — ${r.detail}` : ""}`)
		} catch (err) {
			failed++
			console.error(`[pncp-pca] ${cnpj}/${ano} falhou:`, err)
			await supabase
				.from("integration_sync_step")
				.update({ status: "error", error_message: String(err), finished_at: new Date().toISOString() })
				.eq("sync_id", syncId)
				.eq("step_name", stepName)
		}

		await beatSync(supabase, syncId)
	}

	await finishSync(supabase, syncId, {
		status: failed > 0 ? "error" : "success",
		completedSteps: anos.length,
		successfulSteps: anos.length - failed,
		failedSteps: failed,
		totalUpserted: upserted,
	})

	return syncId
}
