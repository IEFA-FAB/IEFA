import { createFileRoute } from "@tanstack/react-router"
import { BookOpen, Landmark, MessageSquare, RefreshCw, Search } from "lucide-react"
import { useState } from "react"
import { requireToolAccess } from "#/auth/pbac"
import { AnalysisGuide } from "#/components/analysis-guide"
import { AnalysisStart } from "#/components/analysis-start"
import type { MessageControlsProps } from "#/components/conta-generica/message-controls"
import { OdsRiskMapCard } from "#/components/conta-generica/ods-risk-map"
import { ConferenteFilterControl, OperationalHeader, SingleMessagePanel, UgMessageCard } from "#/components/conta-generica/operational-view"
import { type ChatMessage, OracleChat } from "#/components/conta-generica/oracle-chat"
import { NoInconsistencyAlert, PanelViewControl, RiskStatTiles, SummaryTiles } from "#/components/conta-generica/overview"
import { StrategicView } from "#/components/conta-generica/strategic-view"
import { TacticalView } from "#/components/conta-generica/tactical-view"
import { HubLayout } from "#/components/hub-layout"
import { RacReference } from "#/components/rac-reference"
import { TesouroGerencialPath } from "#/components/tesouro-gerencial-path"
import { Button } from "#/components/ui/button"
import { EXCEL_ACCEPT, FileDropzone } from "#/components/ui/file-dropzone"
import { SectionHeader } from "#/components/ui/section-header"
import { CONSOLIDATED_DRAFT_KEY, useMessageDrafts } from "#/hooks/use-editable-message"
import { type CriticalSummary, type OdsRisk, type ParetoData, type PriorityItem, performAdvancedAnalysis } from "#/lib/conta-generica/advanced-analysis"
import { computeDerivedStats } from "#/lib/conta-generica/derived-stats"
import { type GroupedData, getConferente } from "#/lib/conta-generica/helpers"
import { buildOracleContext, generateMessage, generateSingleMessage, type MessageSettings } from "#/lib/conta-generica/messages"
import { processData, readWorkbookRows } from "#/lib/conta-generica/process-data"
import { oracleContaGenericaFn } from "#/server/conta-generica.fn"

// Mapas, formatadores, parsing da planilha, análise e texto das mensagens vivem em
// `lib/conta-generica/`; os blocos de tela, em `components/conta-generica/`.

// ── Route ────────────────────────────────────────────────────────────────────

/**
 * O que a ferramenta faz com a planilha. Último bloco da tela inicial: é a
 * única parte que se pode ler depois de já ter enviado o arquivo.
 */
const ANALYSIS_NOTES = [
	{
		icon: Search,
		title: "O que é analisado",
		text: 'Uso indevido de contas contábeis genéricas (terminadas em "99") pelas Unidades Gestoras do COMAER.',
	},
	{
		icon: MessageSquare,
		title: "O que é gerado",
		text: "Texto padronizado por UG, pronto para envio via SIAFI, com a fundamentação normativa já embutida.",
	},
	{
		icon: BookOpen,
		title: "Como o resultado é lido",
		text: "Três visões do mesmo dado — estratégica, tática e operacional —, além do oráculo de IA sobre o conjunto carregado.",
	},
] as const

export const Route = createFileRoute("/conta-generica")({
	// A divisão exigida sai do catálogo (`sucontTools`), pelo `internalPath`.
	beforeLoad: (opts) => requireToolAccess(opts, "/conta-generica"),
	component: ContaGenerica,
})

function ContaGenerica() {
	const [error, setError] = useState<string | null>(null)
	const [isProcessing, setIsProcessing] = useState(false)
	const [result, setResult] = useState<GroupedData | null>(null)
	const [foundAny, setFoundAny] = useState(false)
	const [copiedUg, setCopiedUg] = useState<string | null>(null)
	const drafts = useMessageDrafts()
	const [messageMode, setMessageMode] = useState<"individual" | "unica">("individual")
	const [deadline, setDeadline] = useState("")
	const [messageType, setMessageType] = useState<"prazo" | "sem_prazo" | "alerta">("sem_prazo")
	const [msgNumber, setMsgNumber] = useState("")
	const [msgDate, setMsgDate] = useState(new Date().toISOString().split("T")[0])
	const [conferenteFilter, setConferenteFilter] = useState<string | null>(null)
	const [activeView, setActiveView] = useState<"operacional" | "tatica" | "estrategica">("estrategica")

	// Advanced analysis
	const [paretoData, setParetoData] = useState<ParetoData | null>(null)
	const [priorityList, setPriorityList] = useState<PriorityItem[]>([])
	const [criticalSummary, setCriticalSummary] = useState<CriticalSummary | null>(null)
	const [odsRiskMap, setOdsRiskMap] = useState<OdsRisk[]>([])
	const [totalFinancialImpact, setTotalFinancialImpact] = useState(0)

	// Oracle chat
	const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
	const [isAskingOracle, setIsAskingOracle] = useState(false)
	const [oracleInput, setOracleInput] = useState("")

	// ── File handling ───────────────────────────────────────────────────────────

	const handleFiles = (files: File[]) => {
		const f = files[0]
		if (f) processFile(f)
	}

	const resetApp = () => {
		setResult(null)
		setFoundAny(false)
		setError(null)
		setConferenteFilter(null)
		setParetoData(null)
		setPriorityList([])
		setCriticalSummary(null)
		setOdsRiskMap([])
		setTotalFinancialImpact(0)
		setChatMessages([])
		setOracleInput("")
		setActiveView("estrategica")
		setMessageMode("individual")
		setMessageType("sem_prazo")
		setDeadline("")
		drafts.resetAll()
	}

	// ── Data processing ─────────────────────────────────────────────────────────

	const processFile = (f: File) => {
		setIsProcessing(true)
		setError(null)
		setResult(null)
		setFoundAny(false)
		const reader = new FileReader()
		reader.onload = (evt) => {
			try {
				const data = readWorkbookRows(evt.target?.result)
				loadRows(data)
			} catch {
				setError("Erro ao processar o arquivo. Certifique-se de que é um arquivo Excel válido (.xlsx).")
				setIsProcessing(false)
			}
		}
		reader.onerror = () => {
			setError("Erro ao ler o arquivo.")
			setIsProcessing(false)
		}
		reader.readAsArrayBuffer(f)
	}

	/** Aplica à tela o resultado de `processData` e, havendo achado, a análise avançada. */
	const loadRows = (data: unknown[][]) => {
		const parsed = processData(data)
		if ("error" in parsed) {
			setError(parsed.error)
			setIsProcessing(false)
			return
		}

		setResult(parsed.grouped)
		setFoundAny(parsed.hasGeneric)
		if (parsed.hasGeneric) applyAdvancedAnalysis(parsed.grouped)
		setIsProcessing(false)
	}

	const applyAdvancedAnalysis = (grouped: GroupedData) => {
		const analysis = performAdvancedAnalysis(grouped)
		setParetoData(analysis.paretoData)
		setOdsRiskMap(analysis.odsRiskMap)
		setCriticalSummary(analysis.criticalSummary)
		setPriorityList(analysis.priorityList)
		setTotalFinancialImpact(analysis.totalFinancialImpact)
	}

	// ── Oracle ──────────────────────────────────────────────────────────────────

	const askOracle = async (question?: string) => {
		const query = question || oracleInput
		if (!query.trim()) return
		setChatMessages((prev) => [...prev, { role: "user", text: query }])
		setOracleInput("")
		setIsAskingOracle(true)

		try {
			const context = buildOracleContext({ totalFinancialImpact, odsRiskMap, criticalSummary, paretoData, priorityList })

			const text = await oracleContaGenericaFn({ data: { query, context } })
			setChatMessages((prev) => [...prev, { role: "model", text }])
		} catch (_err) {
			setChatMessages((prev) => [...prev, { role: "model", text: "Erro ao conectar com o Oráculo. Verifique sua conexão." }])
		} finally {
			setIsAskingOracle(false)
		}
	}

	// ── Message generation ──────────────────────────────────────────────────────

	const messageSettings: MessageSettings = { messageType, deadline, msgNumber, msgDate }
	const messageControls: MessageControlsProps = {
		msgNumber,
		setMsgNumber,
		msgDate,
		setMsgDate,
		messageType,
		setMessageType,
		deadline,
		setDeadline,
	}

	// A mensagem única concatena todas as UGs do resultado; só é montada no modo em
	// que ela aparece, senão sai refeita a cada tecla digitada nas mensagens por UG.
	const singleMessage = messageMode === "unica" ? drafts.of(CONSOLIDATED_DRAFT_KEY, generateSingleMessage(result, conferenteFilter, messageSettings)) : null

	const copyToClipboard = (text: string, key: string) => {
		navigator.clipboard.writeText(text)
		setCopiedUg(key)
		setTimeout(() => setCopiedUg(null), 2000)
	}

	// ── Derived stats ────────────────────────────────────────────────────────────

	const {
		totalUGs,
		totalContas,
		totalSaldoGeral,
		totalInconsistencias,
		conferenteStats,
		racStatsMap,
		topContasByFreq,
		topUgsByCount,
		topOdsByCount,
		topOsByCount,
	} = computeDerivedStats(result)

	// ── Render ───────────────────────────────────────────────────────────────────

	const guide = (
		<AnalysisGuide
			source={<TesouroGerencialPath />}
			reference={
				<RacReference
					statement="As Unidades Gestoras utilizam contas contábeis genéricas no registro de suas transações?"
					objective='Identificar o uso indevido de contas contábeis genéricas (terminadas em "99") pelas Unidades Gestoras do COMAER.'
					risk="A conta genérica esconde a natureza real do registro, impede a conciliação por natureza de despesa e distorce a leitura das demonstrações."
					importance="A reclassificação preserva a fidedignidade dos registros e sustenta a atuação da Setorial Contábil junto à UG."
				/>
			}
			notes={ANALYSIS_NOTES}
		/>
	)

	return (
		<HubLayout
			guide={guide}
			actions={
				result && (
					<Button variant="outline" size="sm" onClick={resetApp}>
						<RefreshCw className="w-3.5 h-3.5" />
						Nova análise
					</Button>
				)
			}
		>
			{/*
			 * Capa removida: um escudo de 96px com anel dourado, o título "ANALISTA
			 * SUCONT" entre dois filetes de ouro, blobs decorativos em quarto-de-
			 * círculo, um avião de marca-d'água e uma pílula repetindo a Questão 29 —
			 * que já é a pílula ao lado da trilha. Nada disso é a tarefa.
			 *
			 * O carregamento também deixou de ser uma tela própria: era um bloco de
			 * `py-20` com anel girando que SUBSTITUÍA a zona de envio, então o campo
			 * sumia da página enquanto lia. Agora o estado vive na própria zona, como
			 * nas outras seis ferramentas.
			 */}
			{!result && (
				<AnalysisStart
					dropzone={
						<FileDropzone
							accept={EXCEL_ACCEPT}
							onFiles={handleFiles}
							hint='Excel do Tesouro Gerencial — contas com final "99" são identificadas automaticamente'
							columns={["UG", "Conta Contábil", "Mês", "Saldo - R$"]}
							isLoading={isProcessing}
						/>
					}
					error={error}
				/>
			)}

			{/* RESULTS */}
			{result && !isProcessing && (
				<div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
					{/*
					 * O banner "Controle Interno SUCONT-3 — Questão 29" e o card "Referencial
					 * Metodológico" que ficavam aqui repetiam, DEPOIS do resultado, o que a
					 * trilha (pílula Q29) e a tela inicial (`RacReference`) já disseram.
					 */}
					<PanelViewControl activeView={activeView} onActiveViewChange={setActiveView} />

					<SummaryTiles totalUGs={totalUGs} totalContas={totalContas} totalSaldoGeral={totalSaldoGeral} />

					{/* RISK PANEL (estratégica + tática) */}
					{foundAny && (activeView === "estrategica" || activeView === "tatica") && (
						<div className="space-y-6">
							<SectionHeader icon={<Landmark />} title="Painel de risco contábil do COMAER" description="Análise estratégica e tática — SUCONT / DIREF" />

							<RiskStatTiles totalInconsistencias={totalInconsistencias} totalSaldoGeral={totalSaldoGeral} totalUGs={totalUGs} />

							{/* Estratégica view */}
							{activeView === "estrategica" && (
								<StrategicView
									topOdsByCount={topOdsByCount}
									topOsByCount={topOsByCount}
									totalInconsistencias={totalInconsistencias}
									totalFinancialImpact={totalFinancialImpact}
									criticalSummary={criticalSummary}
								/>
							)}

							{/* Tática view */}
							{activeView === "tatica" && (
								<TacticalView
									topUgsByCount={topUgsByCount}
									topContasByFreq={topContasByFreq}
									paretoData={paretoData}
									priorityList={priorityList}
									conferenteStats={conferenteStats}
									racStatsMap={racStatsMap}
									onSelectConferente={setConferenteFilter}
								/>
							)}

							{/* ODS Risk Map (both views) */}
							<OdsRiskMapCard odsRiskMap={odsRiskMap} />

							{/* Oracle Chat */}
							<OracleChat
								chatMessages={chatMessages}
								isAskingOracle={isAskingOracle}
								oracleInput={oracleInput}
								onOracleInputChange={setOracleInput}
								onAsk={askOracle}
								onClear={() => setChatMessages([])}
							/>
						</div>
					)}

					{/* OPERACIONAL + no found */}
					{!foundAny ? (
						<NoInconsistencyAlert />
					) : (
						activeView === "operacional" && (
							<div className="space-y-10">
								<OperationalHeader messageMode={messageMode} onMessageModeChange={setMessageMode} />

								<ConferenteFilterControl conferenteFilter={conferenteFilter} onConferenteFilterChange={setConferenteFilter} />

								{/* Única message */}
								{messageMode === "unica" && singleMessage ? (
									<SingleMessagePanel message={singleMessage} copiedUg={copiedUg} onCopy={copyToClipboard} controls={messageControls} />
								) : (
									/* Individual messages */
									Object.keys(result)
										.filter((ug) => !conferenteFilter || getConferente(ug) === conferenteFilter)
										.sort()
										.map((ug) => {
											const contas = result[ug]
											const message = drafts.of(ug, generateMessage(ug, contas, messageSettings))
											return (
												<UgMessageCard
													key={ug}
													ug={ug}
													contas={contas}
													message={message}
													copiedUg={copiedUg}
													onCopy={copyToClipboard}
													controls={messageControls}
												/>
											)
										})
								)}
							</div>
						)
					)}
				</div>
			)}
		</HubLayout>
	)
}
