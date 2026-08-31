import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { AlertTriangle, Database, FileSearch, Layers, RefreshCw, StopCircle } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSucontAccess } from "#/auth/pbac"
import { HubLayout } from "#/components/hub-layout"
import { Button } from "#/components/ui/button"
import { analyzeUg } from "#/sacdgc/client"
import { DgcReport } from "#/sacdgc/components/DgcReport"
import { DgcRunHistory } from "#/sacdgc/components/DgcRunHistory"
import { DgcUgTable, type UgState } from "#/sacdgc/components/DgcUgTable"
import { DgcUpload } from "#/sacdgc/components/DgcUpload"
import { readAllPanelSources } from "#/sacdgc/files"
import { buildGroupContext, parseDgcBase } from "#/sacdgc/parser"
import { toAnalysisRequest } from "#/sacdgc/request"
import type { DgcBase, UgDataset } from "#/sacdgc/types"
import { GROUP_ORDER, identifyGroup, ugDisplayName } from "#/sacdgc/ugs"
import { listDgcRunsFn, loadDgcRunFn, saveDgcAnalysisFn, startDgcRunFn } from "#/server/sacdgc.fn"

export const Route = createFileRoute("/sac-dgc")({
	component: SacDgcPage,
})

/**
 * Histórico de rodadas gravadas. Em React Query, e não em `useState` + `.catch`,
 * porque os três estados precisam chegar separados na tela: carregando, falhou e
 * vazio. Colapsá-los em `[]` fazia uma consulta morta parecer competência nova.
 */
const dgcRunsQueryOptions = () => ({
	queryKey: ["sucont", "dgc", "runs"] as const,
	queryFn: () => listDgcRunsFn(),
})

function SacDgcPage() {
	const [base, setBase] = useState<DgcBase | null>(null)
	const [readError, setReadError] = useState<string | null>(null)
	const [isReading, setIsReading] = useState(false)
	const [states, setStates] = useState<Record<string, UgState>>({})
	const [selectedGroup, setSelectedGroup] = useState<string>("")
	const [openUgCode, setOpenUgCode] = useState<string | null>(null)
	const [isRunning, setIsRunning] = useState(false)
	const [runId, setRunId] = useState<string | null>(null)
	const [loadingRunId, setLoadingRunId] = useState<string | null>(null)
	const [persistError, setPersistError] = useState<string | null>(null)
	// Rodada aberta do banco: as planilhas não voltam, então os avisos de carga
	// (painel faltando, linha descartada) não valem — não houve carga.
	const [isStoredView, setIsStoredView] = useState(false)

	const { canEdit } = useSucontAccess()
	const queryClient = useQueryClient()
	const abortRef = useRef<AbortController | null>(null)
	const runningRef = useRef(false)
	// O id da rodada é criado no meio do lote e lido no mesmo tick pela UG seguinte —
	// o state do React só valeria no próximo render.
	const runIdRef = useRef<string | null>(null)

	// Sair da tela com uma análise em curso deixaria o fetch pendurado.
	useEffect(() => () => abortRef.current?.abort(), [])

	// Rodadas gravadas: sem elas, reabrir uma competência custa ~69 chamadas ao modelo.
	const runsQuery = useQuery(dgcRunsQueryOptions())
	const runs = runsQuery.data ?? []
	const runsError = runsQuery.isError ? (runsQuery.error instanceof Error ? runsQuery.error.message : "Falha ao consultar o banco.") : null

	const handleProcess = useCallback(async (files: File[]) => {
		setIsReading(true)
		setReadError(null)
		try {
			const sources = await readAllPanelSources(files)
			const parsed = parseDgcBase(sources)
			if (parsed.datasets.length === 0) {
				throw new Error(
					"Nenhuma Unidade Gestora foi identificada. Confira se os arquivos são os painéis do DGC exportados do Tesouro Gerencial, com a linha de cabeçalho preservada."
				)
			}
			setBase(parsed)
			setIsStoredView(false)
			setStates({})
			setOpenUgCode(null)
			setSelectedGroup(GROUP_ORDER.find((group) => parsed.datasets.some((d) => d.group === group)) ?? "")
		} catch (error) {
			setReadError(error instanceof Error ? error.message : "Não foi possível ler as planilhas enviadas.")
		} finally {
			setIsReading(false)
		}
	}, [])

	const handleAnalyze = useCallback(
		async (ugCodes: string[]) => {
			if (!base || runningRef.current || ugCodes.length === 0) return

			runningRef.current = true
			setIsRunning(true)
			const controller = new AbortController()
			abortRef.current = controller

			setStates((prev) => {
				const next = { ...prev }
				for (const code of ugCodes) next[code] = { status: "na-fila" }
				return next
			})

			const byCode = new Map(base.datasets.map((d) => [d.ugCode, d]))

			try {
				// A rodada é criada na PRIMEIRA análise, não na carga: base que o operador
				// abre e fecha sem analisar nada não vira linha no banco.
				if (canEdit && !runIdRef.current) {
					try {
						const started = await startDgcRunFn({
							data: {
								competence: base.competence,
								filenames: base.filenames,
								ugCount: base.datasets.length,
								panelsFound: base.panelsFound,
							},
						})
						runIdRef.current = started.runId
						setRunId(started.runId)
						queryClient.invalidateQueries({ queryKey: dgcRunsQueryOptions().queryKey })
					} catch (error) {
						// Falha ao abrir a rodada não impede analisar — só não grava.
						setPersistError(error instanceof Error ? error.message : "Não foi possível abrir a rodada no banco.")
					}
				}

				// Uma UG por vez: o teto de consumo da IA é por usuário, e disparar 12
				// análises em paralelo consome a janela inteira em segundos e derruba
				// todas com 429 em vez de concluir as primeiras.
				for (const ugCode of ugCodes) {
					if (controller.signal.aborted) break
					const dataset = byCode.get(ugCode)
					if (!dataset) continue

					setStates((prev) => ({ ...prev, [ugCode]: { status: "analisando" } }))
					try {
						const request = toAnalysisRequest(dataset, base, buildGroupContext(dataset, base.datasets))
						const analysis = await analyzeUg(request, controller.signal)
						setStates((prev) => ({ ...prev, [ugCode]: { status: "concluida", analysis } }))

						// A gravação é best-effort e vem DEPOIS de a análise estar na tela: a
						// chamada ao modelo é o que custa caro, e perdê-la por um erro de banco
						// obrigaria a rodada inteira de novo.
						if (runIdRef.current) {
							try {
								await saveDgcAnalysisFn({
									data: {
										runId: runIdRef.current,
										ugCodigo: dataset.ugCode,
										ugNome: dataset.ugName,
										ugGrupo: dataset.group,
										competence: base.competence,
										analysis,
									},
								})
							} catch (error) {
								setPersistError(error instanceof Error ? error.message : "Análise gerada, mas não gravada no banco.")
							}
						}
					} catch (error) {
						if (controller.signal.aborted) break
						setStates((prev) => ({ ...prev, [ugCode]: { status: "erro", message: error instanceof Error ? error.message : "Falha na análise." } }))
					}
				}
			} finally {
				// UG que ficou "na fila" quando o lote foi interrompido volta a ser
				// analisável — senão o botão fica travado esperando algo que não vem.
				setStates((prev) => {
					const next = { ...prev }
					for (const [code, state] of Object.entries(next)) {
						if (state.status === "na-fila" || state.status === "analisando") next[code] = { status: "pendente" }
					}
					return next
				})
				runningRef.current = false
				abortRef.current = null
				setIsRunning(false)
			}
		},
		[base, canEdit, queryClient]
	)

	const handleReset = useCallback(() => {
		abortRef.current?.abort()
		setBase(null)
		setStates({})
		setOpenUgCode(null)
		setSelectedGroup("")
		setReadError(null)
		setPersistError(null)
		setRunId(null)
		runIdRef.current = null
		setIsStoredView(false)
	}, [])

	/**
	 * Reabre uma rodada gravada. Reconstrói `base` a partir das linhas do banco —
	 * as planilhas não são armazenadas, então o recorte não volta: dá para LER as
	 * análises, não para reanalisar sem subir a base de novo.
	 */
	const handleOpenRun = useCallback(async (id: string) => {
		setLoadingRunId(id)
		setReadError(null)
		try {
			const stored = await loadDgcRunFn({ data: { runId: id } })
			if (stored.length === 0) {
				setReadError("Esta rodada não tem análise gravada.")
				return
			}
			const datasets: UgDataset[] = stored.map((row) => ({
				ugCode: row.ugCodigo,
				ugName: row.ugNome ?? ugDisplayName(row.ugCodigo),
				group: row.ugGrupo ?? identifyGroup(row.ugCodigo),
				rowCount: { 1: 0, 2: 0, 3: 0, 4: 0 },
				consolidated: "",
				truncated: false,
			}))
			setBase({ competence: stored[0].competence, filenames: [], datasets, panelsFound: [], skippedRows: 0 })
			setStates(Object.fromEntries(stored.map((row) => [row.ugCodigo, { status: "concluida" as const, analysis: row.analysis }])))
			setSelectedGroup(GROUP_ORDER.find((group) => datasets.some((d) => d.group === group)) ?? "")
			setOpenUgCode(null)
			setRunId(id)
			runIdRef.current = id
			setIsStoredView(true)
		} catch (error) {
			setReadError(error instanceof Error ? error.message : "Não foi possível abrir a rodada.")
		} finally {
			setLoadingRunId(null)
		}
	}, [])

	const openAnalysis = useMemo(() => {
		if (!openUgCode) return null
		const state = states[openUgCode]
		return state?.status === "concluida" ? state.analysis : null
	}, [openUgCode, states])

	const summary = useMemo(() => {
		if (!base) return null
		const done = Object.values(states).filter((s) => s.status === "concluida").length
		return { ugs: base.datasets.length, done }
	}, [base, states])

	return (
		<HubLayout>
			<div className="flex flex-wrap items-center justify-between gap-4 mb-8">
				<div className="flex items-center gap-4">
					<FileSearch className="text-tech-cyan w-5 h-5" />
					<h1 className="text-foreground font-bold uppercase tracking-widest text-sm">SAC-DGC — Análise Crítica do Demonstrativo Gerencial de Custos</h1>
				</div>

				<div className="flex items-center gap-3">
					{isRunning && (
						<Button
							variant="outline"
							onClick={() => abortRef.current?.abort()}
							className="text-label text-muted-foreground hover:border-destructive/30 hover:text-destructive"
						>
							<StopCircle className="w-3.5 h-3.5" />
							Interromper
						</Button>
					)}
					{base && (
						<Button variant="outline" onClick={handleReset} className="text-label text-muted-foreground hover:border-tech-cyan hover:text-tech-cyan">
							<RefreshCw className="w-3.5 h-3.5" />
							Nova base
						</Button>
					)}
				</div>
			</div>

			{!base && (
				<div className="space-y-8">
					<div className="max-w-3xl mx-auto text-center">
						<p className="text-muted-foreground leading-relaxed">
							Envie os quatro painéis do DGC da competência. A base é lida no seu navegador e recortada por Unidade Gestora; ao pedir a análise, apenas o
							recorte da UG selecionada é enviado ao modelo.
						</p>
					</div>
					<DgcUpload onProcess={handleProcess} isLoading={isReading} error={readError} />

					<div className="max-w-3xl mx-auto">
						<DgcRunHistory
							runs={runs}
							activeRunId={runId}
							loadingRunId={loadingRunId}
							onOpen={handleOpenRun}
							isLoading={runsQuery.isPending}
							error={runsError}
							onRetry={() => runsQuery.refetch()}
						/>
					</div>
				</div>
			)}

			{base && !openAnalysis && (
				<div className="space-y-6">
					<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
						<StatTile icon={<Database className="w-4 h-4" />} label="Competência" value={base.competence || "não identificada"} testId="dgc-competence" />
						<StatTile
							icon={<Layers className="w-4 h-4" />}
							label={isStoredView ? "Origem" : "Painéis carregados"}
							value={isStoredView ? "rodada gravada" : base.panelsFound.length > 0 ? base.panelsFound.join(", ") : "nenhum"}
							testId="dgc-panels"
						/>
						<StatTile icon={<FileSearch className="w-4 h-4" />} label="Unidades na base" value={String(summary?.ugs ?? 0)} testId="dgc-ug-count" />
						<StatTile icon={<FileSearch className="w-4 h-4" />} label="Análises concluídas" value={String(summary?.done ?? 0)} testId="dgc-done-count" />
					</div>

					{!canEdit && !isStoredView && (
						<p
							className="flex items-start gap-3 text-sm text-muted-foreground bg-muted border border-border rounded-xl px-5 py-4"
							data-testid="dgc-readonly-notice"
						>
							<AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
							<span>Sua conta tem acesso de leitura ao SUCONT. As análises serão geradas e exibidas, mas não ficam gravadas para a seção.</span>
						</p>
					)}

					{persistError && (
						<p
							className="flex items-start gap-3 text-sm text-warning bg-warning/10 border border-warning/30 rounded-xl px-5 py-4"
							data-testid="dgc-persist-error"
						>
							<AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
							<span>{persistError} A análise continua na tela, mas recarregar a página a perde.</span>
						</p>
					)}

					{!isStoredView && base.panelsFound.length < 4 && (
						<p className="flex items-start gap-3 text-sm text-warning bg-warning/10 border border-warning/30 rounded-xl px-5 py-4">
							<AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
							<span>
								Só {base.panelsFound.length} de 4 painéis foram reconhecidos. A análise segue possível, e a ausência é declarada ao modelo — mas os apontamentos
								dos painéis faltantes não serão gerados.
							</span>
						</p>
					)}

					{!isStoredView && base.skippedRows > 0 && (
						<p className="flex items-start gap-3 text-sm text-muted-foreground bg-muted border border-border rounded-xl px-5 py-4">
							<AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
							<span>{base.skippedRows} linha(s) foram ignoradas por não trazerem um código de UG reconhecível.</span>
						</p>
					)}

					<DgcUgTable
						datasets={base.datasets}
						states={states}
						selectedGroup={selectedGroup}
						onSelectGroup={setSelectedGroup}
						onAnalyze={handleAnalyze}
						onOpen={setOpenUgCode}
						busy={isRunning}
					/>
				</div>
			)}

			{openAnalysis && <DgcReport data={openAnalysis} onBack={() => setOpenUgCode(null)} />}
		</HubLayout>
	)
}

function StatTile({ icon, label, value, testId }: { icon: React.ReactNode; label: string; value: string; testId: string }) {
	return (
		<div className="bg-card border border-border rounded-xl p-5">
			<div className="flex items-center gap-2 text-muted-foreground mb-2">
				{icon}
				<span className="text-[11px] font-bold uppercase tracking-wider">{label}</span>
			</div>
			<p className="text-sm font-bold text-foreground truncate" title={value} data-testid={testId}>
				{value}
			</p>
		</div>
	)
}
