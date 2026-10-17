import { createFileRoute } from "@tanstack/react-router"
import { BookOpen, Check, Copy, FileText, LayoutDashboard, MessageSquare, RefreshCw, Search } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import * as XLSX from "xlsx"
import { requireToolAccess } from "#/auth/pbac"
import { AnalysisGuide } from "#/components/analysis-guide"
import { AnalysisStart } from "#/components/analysis-start"
import { ManagerialPanel } from "#/components/compatibilidade/managerial-panel"
import { OperationalFilters } from "#/components/compatibilidade/operational-filters"
import { UgReportCard } from "#/components/compatibilidade/ug-report-card"
import { HubLayout } from "#/components/hub-layout"
import { RacReference } from "#/components/rac-reference"
import { TesouroGerencialPath } from "#/components/tesouro-gerencial-path"
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert"
import { Button } from "#/components/ui/button"
import { FileDropzone, SPREADSHEET_ACCEPT } from "#/components/ui/file-dropzone"
import { SectionHeader } from "#/components/ui/section-header"
import { SegmentedControl } from "#/components/ui/segmented-control"
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip"
import { useCopyFeedback } from "#/hooks/use-copy-feedback"
import { useMessageDrafts } from "#/hooks/use-editable-message"
import { describeReportFilter } from "#/lib/compatibilidade/filters"
import { formatCurrency } from "#/lib/compatibilidade/format"
import { buildManagerialData } from "#/lib/compatibilidade/managerial"
import { generateMessageText as buildMessageText, type MessageType } from "#/lib/compatibilidade/message"
import { PAIRS, processData, type SheetRow, type UGReport } from "#/lib/compatibilidade/parser"

/**
 * O que a ferramenta faz com a planilha. Último bloco da tela inicial: é a
 * única parte que se pode ler depois de já ter enviado o arquivo.
 */
const ANALYSIS_NOTES = [
	{
		icon: Search,
		title: "O que é analisado",
		text: "Conformidade entre saldos de contas de controle e das contas patrimoniais correspondentes, por UG e por competência.",
	},
	{
		icon: MessageSquare,
		title: "O que é gerado",
		text: "Mensagem padronizada de cobrança e orientação por UG, pronta para envio via SAU, com prazo e número editáveis.",
	},
	{
		icon: BookOpen,
		title: "Como o resultado é lido",
		text: "As divergências são agrupadas por par de contas e distribuídas entre os conferentes; cada um filtra as suas.",
	},
] as const

/** Chaves do "Copiado" dos botões que copiam várias mensagens de uma vez. */
const COPY_ALL_KEY = "all"
const COPY_RAC_SUMMARY_KEY = "rac-summary"

export const Route = createFileRoute("/analista-compatibilidade")({
	// A divisão exigida sai do catálogo (`sucontTools`), pelo `internalPath`.
	beforeLoad: (opts) => requireToolAccess(opts, "/analista-compatibilidade"),
	component: AnalistaCompatibilidade,
})

/**
 * Conferentes da seção, e o nome como ele aparece na coluna da planilha.
 *
 * Um só lugar: a lista de abas e o filtro liam a mesma informação de dois pontos
 * diferentes — a lista de botões trazia os primeiros nomes, e uma cadeia de
 * `else if` trazia as matrículas. Incluir alguém exigia lembrar dos dois.
 */
const CONFERENTE_NA_PLANILHA: Record<string, string> = {
	Jefferson: "1T JEFFERSON LUÍS",
	Érika: "1T ÉRIKA VICENTE",
	Eliana: "1S ELIANA",
	Pâmela: "2S PÂMELA",
}

const CONFERENTES = Object.keys(CONFERENTE_NA_PLANILHA)

// ─── Component ────────────────────────────────────────────────────────────────

function AnalistaCompatibilidade() {
	const [activeTab, setActiveTab] = useState<"operacional" | "gerencial">("operacional")
	const [reports, setReports] = useState<UGReport[]>([])
	const [isProcessing, setIsProcessing] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [prazos, setPrazos] = useState<Record<string, string>>({})
	const [messageTypes, setMessageTypes] = useState<Record<string, MessageType>>({})
	const [msgNumbers, setMsgNumbers] = useState<Record<string, string>>({})
	const [msgDates, setMsgDates] = useState<Record<string, string>>({})
	const [msgSubjects, setMsgSubjects] = useState<Record<string, string>>({})
	const drafts = useMessageDrafts()
	const [userProfile, setUserProfile] = useState<string | null>(null)
	const [conferenteFilter, setConferenteFilter] = useState<string>("all")
	const [racFilter, setRacFilter] = useState<string>("all")

	// ── handleFileUpload ───────────────────────────────────────────────────────

	const handleFiles = (files: File[]) => {
		const file = files[0]
		if (!file) return

		setIsProcessing(true)
		setError(null)
		setReports([])
		setPrazos({})
		setMessageTypes({})
		setMsgNumbers({})
		setMsgDates({})
		setMsgSubjects({})
		drafts.resetAll()

		const reader = new FileReader()
		reader.onload = (evt) => {
			try {
				const ab = evt.target?.result
				const wb = XLSX.read(ab, { type: "array" })
				const wsname = wb.SheetNames[0]
				const ws = wb.Sheets[wsname]
				const data = XLSX.utils.sheet_to_json(ws, { header: 1 })
				const newReports = processData(data as SheetRow[])
				setReports(newReports)
				if (newReports.length === 0) {
					setError("Nenhuma divergência encontrada na planilha processada.")
				}
			} catch (err) {
				const message = err instanceof Error ? err.message : "Erro ao processar o arquivo. Certifique-se de que é uma planilha Excel válida."
				setError(message)
			} finally {
				setIsProcessing(false)
			}
		}
		reader.onerror = () => {
			setError("Erro ao ler o arquivo.")
			setIsProcessing(false)
		}
		reader.readAsArrayBuffer(file)
	}

	// ── handleReset ────────────────────────────────────────────────────────────

	const handleReset = () => {
		setReports([])
		setError(null)
		setPrazos({})
		setMessageTypes({})
		setMsgNumbers({})
		setMsgDates({})
		setMsgSubjects({})
		drafts.resetAll()
	}

	// ── generateMessageText ────────────────────────────────────────────────────

	const generateMessageText = useCallback(
		(report: UGReport, type: MessageType, prazoDias: string, msgNum: string, msgDateStr: string, customSubject: string) =>
			buildMessageText(report, type, prazoDias, msgNum, msgDateStr, customSubject),
		[]
	)

	// ── copyToClipboard / copyAll / copyRacSummary ─────────────────────────────

	// Cópia com confirmação honesta: "Copiado" só depois de a escrita resolver; falha vira
	// aviso de erro. Antes o `writeText` não era aguardado e a falha passava calada.
	const { copiedKey, copy } = useCopyFeedback()

	const copyAll = () => {
		const allText = filteredReports
			.map(
				(r) =>
					drafts.of(
						r.ug,
						generateMessageText(r, messageTypes[r.ug] || "com_prazo", prazos[r.ug] || "", msgNumbers[r.ug] || "", msgDates[r.ug] || "", msgSubjects[r.ug] || "")
					).text
			)
			.join("\n\n-------------------------------------------------------\n\n")
		void copy(allText, COPY_ALL_KEY)
	}

	const copyRacSummary = () => {
		if (racFilter === "all") return

		const pair = PAIRS.find((p) => p.question.includes(racFilter))
		if (!pair) return

		const header = `${racFilter} — ${pair.nameA} × ${pair.nameB}\n\n`
		const body = filteredReports
			.map((r) => {
				const ugDisplay = r.ug.includes(" - ") ? `${r.ug.split(" - ")[1]} (UG ${r.ug.split(" - ")[0]})` : `UG ${r.ug}`

				const pairDetail = r.pairs.find((p) => p.question.includes(racFilter))
				const diffStr = pairDetail ? `Diferença apurada: ${formatCurrency(pairDetail.diff)}` : ""

				return `${ugDisplay} — Conferente: ${r.conferente}\nInconsistência identificada: ${pair.question.split(" do ")[0]}.\n${diffStr}`
			})
			.join("\n\n")

		void copy(header + body, COPY_RAC_SUMMARY_KEY)
	}

	// ── Memos ──────────────────────────────────────────────────────────────────

	const managerialData = useMemo(() => buildManagerialData(reports), [reports])

	const filteredReports = useMemo(() => {
		let targetConferente = conferenteFilter

		if (conferenteFilter === "minhas" && userProfile) {
			targetConferente = CONFERENTE_NA_PLANILHA[userProfile] ?? targetConferente
		}

		let result = reports
		if (targetConferente !== "all") {
			result = result.filter((r) => r.conferente === targetConferente)
		}

		if (racFilter !== "all") {
			result = result
				.filter((r) => r.pairs.some((p) => p.question.includes(racFilter)))
				.map((r) => {
					const filteredPairs = r.pairs.filter((p) => p.question.includes(racFilter))
					const filteredChartData = r.chartData.filter((d) => d.question.includes(racFilter))
					const filteredDivergencias = r.divergencias.filter((d) => {
						return filteredPairs.some((p) => d.includes(p.a) && d.includes(p.b))
					})

					return {
						...r,
						pairs: filteredPairs,
						chartData: filteredChartData,
						divergencias: filteredDivergencias,
						totalDiff: filteredPairs.reduce((acc, p) => acc + Math.abs(p.diff), 0),
					}
				})
		}

		return result
	}, [reports, conferenteFilter, userProfile, racFilter])

	const conferentesList = useMemo(() => {
		const list = Array.from(new Set(reports.map((r) => r.conferente)))
		return list.sort()
	}, [reports])

	const racQuestionsList = useMemo(() => {
		const list = PAIRS.map((p) => {
			const match = p.question.match(/Questão \d+/)
			return match ? match[0] : p.question
		})
		return Array.from(new Set(list))
	}, [])

	const racFilterItems = useMemo(
		() => [{ value: "all", label: "Todas as questões" }, ...racQuestionsList.map((q) => ({ value: q, label: q }))],
		[racQuestionsList]
	)

	// ── Render ─────────────────────────────────────────────────────────────────

	const guide = (
		<AnalysisGuide
			source={<TesouroGerencialPath />}
			reference={
				<RacReference
					objective="Confrontar os saldos de contas de controle com os das contas patrimoniais correspondentes — cauções, almoxarifado e bens móveis em trânsito, entre outras."
					risk="Saldos incompatíveis entre a conta de controle e a patrimonial indicam registro pela metade: um dos lados do fato foi lançado e o outro não."
					importance="A conciliação entre os pares de contas sustenta a fidedignidade do balanço patrimonial da UG e da consolidação do COMAER."
				/>
			}
			notes={ANALYSIS_NOTES}
		/>
	)

	return (
		<HubLayout
			guide={guide}
			actions={
				reports.length > 0 && (
					<Button type="button" variant="outline" size="sm" onClick={handleReset}>
						<RefreshCw className="w-3.5 h-3.5" />
						Nova análise
					</Button>
				)
			}
		>
			{/*
			 * "Identificar-se" é filtro da tela, não navegação: fica no corpo, com
			 * rótulo, e não no cabeçalho fixo. Antes era um bloco de `<button>`
			 * nativos sem `role="tab"` — não dava para trocar de conferente pelo
			 * teclado.
			 */}
			<div className="mb-8 flex flex-col gap-2">
				<span className="text-label text-muted-foreground">Identificar-se</span>
				<SegmentedControl
					label="Identificar-se"
					value={userProfile ?? "all"}
					onValueChange={(value) => {
						const next = value === "all" ? null : value
						setUserProfile(next)
						setConferenteFilter(next ? "minhas" : "all")
					}}
					options={[{ value: "all", label: "Todos" }, ...CONFERENTES.map((name) => ({ value: name, label: name }))]}
				/>
			</div>

			{/* ── Upload section ─────────────────────────────────────────────────── */}
			{reports.length === 0 && (
				<AnalysisStart
					dropzone={
						<FileDropzone
							accept={SPREADSHEET_ACCEPT}
							onFiles={handleFiles}
							hint="Excel do Tesouro Gerencial (.xlsx, .xls) ou CSV"
							columns={["UG", "Conta Contábil", "Saldo"]}
							isLoading={isProcessing}
						/>
					}
					error={error}
				/>
			)}

			{/* ── Results section ────────────────────────────────────────────────── */}
			{reports.length > 0 && (
				<div className="space-y-6">
					<SegmentedControl
						label="Seção"
						size="lg"
						value={activeTab}
						onValueChange={setActiveTab}
						options={[
							{
								value: "operacional",
								label: (
									<>
										<FileText /> Operacional (UGs)
									</>
								),
							},
							{
								value: "gerencial",
								label: (
									<>
										<LayoutDashboard /> Painel gerencial (RAC)
									</>
								),
							},
						]}
					/>

					{/* ── Operacional tab ─────────────────────────────────────────────── */}
					{activeTab === "operacional" && (
						<>
							<SectionHeader
								title={`${filteredReports.length} ${filteredReports.length === 1 ? "unidade com divergência" : "unidades com divergências"}`}
								description={describeReportFilter(conferenteFilter, racFilter, userProfile)}
								actions={
									<>
										{racFilter !== "all" && (
											<Tooltip>
												<TooltipTrigger
													render={
														<Button type="button" variant={copiedKey === COPY_RAC_SUMMARY_KEY ? "success" : "outline"} size="sm" onClick={copyRacSummary}>
															{copiedKey === COPY_RAC_SUMMARY_KEY ? <Check /> : <Copy />}
															{copiedKey === COPY_RAC_SUMMARY_KEY ? "Copiado" : `Copiar resumo ${racFilter}`}
														</Button>
													}
												/>
												<TooltipContent>Copiar resumo simplificado para esta questão</TooltipContent>
											</Tooltip>
										)}
										<Button type="button" size="sm" variant={copiedKey === COPY_ALL_KEY ? "success" : "default"} onClick={copyAll}>
											{copiedKey === COPY_ALL_KEY ? <Check /> : <Copy />}
											{copiedKey === COPY_ALL_KEY ? "Copiado" : "Copiar mensagens filtradas"}
										</Button>
									</>
								}
							/>

							{/* Filtro no corpo, com rótulo. Eram dois grupos de botões pintados de
							    `tech-blue` com um `Select` sem borda colado ao lado. */}
							<OperationalFilters
								racFilter={racFilter}
								onRacFilterChange={setRacFilter}
								racFilterItems={racFilterItems}
								conferenteFilter={conferenteFilter}
								onConferenteFilterChange={setConferenteFilter}
								userProfile={userProfile}
								conferentesList={conferentesList}
							/>

							{/* UG cards */}
							<div className="space-y-8">
								{racFilter !== "all" && filteredReports.length > 0 && (
									<Alert variant="info">
										<BookOpen />
										<AlertTitle>{racFilter}</AlertTitle>
										<AlertDescription>
											{PAIRS.find((p) => p.question.includes(racFilter))?.question.split(" do ")[0]} —{" "}
											{PAIRS.find((p) => p.question.includes(racFilter))?.nameA} × {PAIRS.find((p) => p.question.includes(racFilter))?.nameB}
										</AlertDescription>
									</Alert>
								)}

								{filteredReports.map((report, idx) => {
									const msgType = messageTypes[report.ug] || "com_prazo"
									const currentPrazo = prazos[report.ug] || ""
									const currentMsgNum = msgNumbers[report.ug] || ""
									const currentMsgDate = msgDates[report.ug] || ""
									const currentSubject = msgSubjects[report.ug] || ""
									const msgText = generateMessageText(report, msgType, currentPrazo, currentMsgNum, currentMsgDate, currentSubject)
									const draft = drafts.of(report.ug, msgText)

									return (
										<UgReportCard
											key={idx}
											idx={idx}
											report={report}
											msgType={msgType}
											currentPrazo={currentPrazo}
											currentMsgNum={currentMsgNum}
											currentMsgDate={currentMsgDate}
											currentSubject={currentSubject}
											draft={draft}
											setMsgNumbers={setMsgNumbers}
											setMsgDates={setMsgDates}
											setMsgSubjects={setMsgSubjects}
											setMessageTypes={setMessageTypes}
											setPrazos={setPrazos}
											onCopy={(text) => copy(text, `ug:${report.ug}`)}
											isCopied={copiedKey === `ug:${report.ug}`}
										/>
									)
								})}
							</div>
						</>
					)}

					{/* ── Gerencial tab ───────────────────────────────────────────────── */}
					{activeTab === "gerencial" && managerialData && <ManagerialPanel managerialData={managerialData} reportsCount={reports.length} />}
				</div>
			)}
		</HubLayout>
	)
}
