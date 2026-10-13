import { createFileRoute } from "@tanstack/react-router"
import { CheckCircle2, FileText, LayoutDashboard, Search, TrendingUp } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useState } from "react"
import { requireToolAccess } from "#/auth/pbac"
import { AnalysisGuide } from "#/components/analysis-guide"
import { AnalysisStart } from "#/components/analysis-start"
import { HubLayout } from "#/components/hub-layout"
import { RacReference } from "#/components/rac-reference"
import { TesouroGerencialPath } from "#/components/tesouro-gerencial-path"
import { Button } from "#/components/ui/button"
import { EXCEL_ACCEPT, FileDropzone } from "#/components/ui/file-dropzone"
import { SectionHeader } from "#/components/ui/section-header"
import { SegmentedControl } from "#/components/ui/segmented-control"
import { StatTile } from "#/components/ui/stat-tile"
import { useMessageDrafts } from "#/hooks/use-editable-message"
import { formatCurrency } from "#/lib/analista/types"
import { todayInBrasilia } from "#/lib/brasilia"
import { AIAssistant } from "#/subitens/components/AIAssistant"
import { ConferenteFilter } from "#/subitens/components/ConferenteFilter"
import { OperationalDashboard } from "#/subitens/components/OperationalDashboard"
import { RacMessageCard } from "#/subitens/components/RacMessageCard"
import { ReportMetadataCard } from "#/subitens/components/ReportMetadataCard"
import { ResultsFooter } from "#/subitens/components/ResultsFooter"
import { SituationalTable } from "#/subitens/components/SituationalTable"
import { StrategicDashboard } from "#/subitens/components/StrategicDashboard"
import { TacticalDashboard } from "#/subitens/components/TacticalDashboard"
import { UgMessageCard } from "#/subitens/components/UgMessageCard"
import { CONFERENTES_MAPPING } from "#/subitens/constants"
import {
	buildParetoData,
	countOccurrencesByConta,
	findCriticalLevels,
	groupOccurrencesByRac,
	summarizeByConferente,
	summarizeByOdsOrgaoAndRac,
	summarizePareto,
} from "#/subitens/dashboard"
import { CONSOLIDATED_TEMPLATE, defaultDeadline, formatDeadlineText, formatMsgDate, INSTITUTIONAL_TEMPLATE } from "#/subitens/message"
import { parseWorkbook } from "#/subitens/parser"
import type { MessageConfig, UgGroup } from "#/subitens/types"
import { formatUgName, getConferente } from "#/subitens/ug"

/**
 * O que a ferramenta faz com a planilha. Último bloco da tela inicial: é a
 * única parte que se pode ler depois de já ter enviado o arquivo.
 */
const ANALYSIS_NOTES = [
	{
		icon: Search,
		title: "O que é analisado",
		text: "O relatório do Tesouro Gerencial é varrido em busca de subitens genéricos (99, 999, P99, /99) e de outras falhas de classificação previstas no RAC.",
	},
	{
		icon: CheckCircle2,
		title: "O que é gerado",
		text: "Para cada UG identificada, uma mensagem institucional formatada, pronta para envio via SAU, com o fundamento normativo já embutido.",
	},
	{
		icon: TrendingUp,
		title: "Como o resultado é lido",
		text: "As ocorrências são agregadas por UG, ODS e órgão superior, com curva de Pareto para mostrar onde está a concentração.",
	},
] as const

export const Route = createFileRoute("/subitens-genericos")({
	// A divisão exigida sai do catálogo (`sucontTools`), pelo `internalPath`.
	beforeLoad: (opts) => requireToolAccess(opts, "/subitens-genericos"),
	component: SubitensGenericos,
})

// Tipos, regras de UG, parser da planilha, agregações do painel e textos das mensagens
// moram em `#/subitens/*`; os blocos de tela, em `#/subitens/components/*`.

// ── Main Component ───────────────────────────────────────────
// Fora do componente: usada no cálculo de `topContas`, antes do ponto em que a declaração
// dentro do corpo ficava. Ali, o `.map` lançava ReferenceError com qualquer ocorrência carregada.
const COLORS = ["#00205B", "#003DA5", "#D4AF37", "#4A90E2", "#87CEEB", "#B0C4DE", "#4682B4"]

function SubitensGenericos() {
	const [data, setData] = useState<UgGroup[]>([])
	const [error, setError] = useState<string | null>(null)
	const [isProcessing, setIsProcessing] = useState(false)
	const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
	const drafts = useMessageDrafts()
	const [activeTab, setActiveTab] = useState<"messages" | "dashboard">("messages")

	const [reportDate, setReportDate] = useState<string>(todayInBrasilia())
	const [msgNumber, setMsgNumber] = useState<string>("___")
	const [msgDate, setMsgDate] = useState<string>(todayInBrasilia())

	const [ugConfigs, setUgConfigs] = useState<Record<string, MessageConfig>>({})
	const [racConfigs, setRacConfigs] = useState<Record<string, MessageConfig>>({})
	const [messageMode, setMessageMode] = useState<"individual" | "consolidated">("individual")
	const [selectedConferente, setSelectedConferente] = useState<string>("all")
	const [dashboardTab, setDashboardTab] = useState<"operacional" | "tatico" | "estrategico">("operacional")

	const formattedReportDate = new Intl.DateTimeFormat("pt-BR").format(new Date(`${reportDate}T12:00:00`))

	const resetAnalysis = () => {
		setData([])
		setError(null)
		setActiveTab("messages")
		setUgConfigs({})
		setRacConfigs({})
		setMessageMode("individual")
		setSelectedConferente("all")
		setDashboardTab("operacional")
		drafts.resetAll()
	}

	const updateUgConfig = (ug: string, field: string, value: string) => {
		setUgConfigs((prev) => ({
			...prev,
			[ug]: {
				...(prev[ug] || {
					messageType: "sem_prazo",
					deadlineDate: defaultDeadline(),
					msgNumber,
					msgDate,
				}),
				[field]: value,
			},
		}))
	}

	const updateRacConfig = (racId: string, field: string, value: string) => {
		setRacConfigs((prev) => ({
			...prev,
			[racId]: {
				...(prev[racId] || {
					messageType: "sem_prazo",
					deadlineDate: defaultDeadline(),
					msgNumber,
					msgDate,
				}),
				[field]: value,
			},
		}))
	}

	const getDeadlineText = (ug: string) => formatDeadlineText(ugConfigs[ug])

	const getRacDeadlineText = (racId: string) => formatDeadlineText(racConfigs[racId])

	const processFile = useCallback((file: File) => {
		setIsProcessing(true)
		setError(null)

		const reader = new FileReader()
		reader.onload = (e) => {
			try {
				const result = parseWorkbook(e.target?.result)
				if (result.length === 0) {
					setError("Nenhum subitem genérico (99/999) identificado nos dados fornecidos.")
				} else {
					setData(result)
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : "Erro ao processar o arquivo.")
			} finally {
				setIsProcessing(false)
			}
		}
		reader.onerror = () => {
			setError("Erro na leitura do arquivo.")
			setIsProcessing(false)
		}
		reader.readAsArrayBuffer(file)
	}, [])

	const handleFiles = (files: File[]) => {
		const file = files[0]
		if (file) processFile(file)
	}

	const copyToClipboard = (text: string, index: number) => {
		navigator.clipboard.writeText(text)
		setCopiedIndex(index)
		setTimeout(() => setCopiedIndex(null), 2000)
	}

	// ── Filtering ─────────────────────────────────────────────
	const allConferentes = Array.from(new Set(Object.values(CONFERENTES_MAPPING))).sort()

	const filteredData = data.filter((group) => {
		const matchesConferente = selectedConferente === "all" || getConferente(group.ug) === selectedConferente
		return matchesConferente && group.occurrences.length > 0
	})

	// ── Dashboard data ────────────────────────────────────────
	const topUgsBySaldo = [...filteredData]
		.sort((a, b) => b.totalSaldo - a.totalSaldo)
		.slice(0, 5)
		.map((ug) => ({ name: formatUgName(ug.ug), saldo: ug.totalSaldo }))

	const contasCount = countOccurrencesByConta(filteredData)
	const topContas = Object.entries(contasCount)
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => b.count - a.count)
		.slice(0, 5)
		// `fill` na linha: o recharts pinta o setor por ele e monta legenda e marcador do
		// tooltip a partir dele. Cor só no `shape` deixaria os dois no cinza padrão.
		.map((conta, index) => ({ ...conta, fill: COLORS[index % COLORS.length] }))

	const conferentesList = summarizeByConferente(filteredData)

	const totalInconsistencias = filteredData.reduce((acc, curr) => acc + curr.occurrences.length, 0)
	const totalVolume = filteredData.reduce((acc, curr) => acc + curr.totalSaldo, 0)

	const { odsList, orgaoSuperiorList, racList } = summarizeByOdsOrgaoAndRac(filteredData)

	const topUgsByInconsistencias = [...filteredData].sort((a, b) => b.occurrences.length - a.occurrences.length)

	const totalUgsCount = filteredData.length
	const paretoData = buildParetoData(topUgsByInconsistencias, totalInconsistencias, totalUgsCount)

	const paretoSummary = summarizePareto(paretoData)

	const criticalLevels = findCriticalLevels(odsList, orgaoSuperiorList, topUgsByInconsistencias, filteredData)

	const occurrencesByRac = groupOccurrencesByRac(filteredData)

	// ── Render ────────────────────────────────────────────────
	const guide = (
		<AnalysisGuide
			source={<TesouroGerencialPath />}
			reference={
				<RacReference
					statement="As Unidades Gestoras utilizam contas contábeis e subitens genéricos (99, 999, P99, /99) no registro de suas transações?"
					objective="Identificar a utilização indevida de contas contábeis e subitens genéricos nos registros das Unidades Gestoras."
					risk="O uso de subitens genéricos oculta a real natureza da transação, prejudicando a transparência, a precisão da informação e a evidenciação contábil."
					importance="A regularização preserva a qualidade das demonstrações contábeis e apoia a tomada de decisão da alta administração do COMAER."
				/>
			}
			notes={ANALYSIS_NOTES}
		/>
	)

	return (
		<HubLayout
			guide={guide}
			actions={
				// Só com dados: sem análise carregada, "Nova análise" não desfaz nada.
				data.length > 0 && (
					<Button onClick={resetAnalysis} type="button" variant="outline" size="sm">
						Nova análise
					</Button>
				)
			}
		>
			<div>
				<AnimatePresence mode="wait">
					{data.length === 0 ? (
						<motion.div key="upload" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}>
							{/*
							 * Ordem e superfícies vêm do `AnalysisStart` — as mesmas das outras
							 * seis ferramentas que começam por uma planilha.
							 *
							 * Aqui havia uma capa institucional: avião num disco de 96px com anel
							 * dourado, "Análise de SUBITENS Genéricos" com a palavra do meio em
							 * ouro, e o lema "Defender, Controlar e Integrar" entre duas bússolas.
							 * Nada disso é a tarefa — a tarefa é enviar uma planilha —, e o que a
							 * capa dizia de útil já está na descrição sob a trilha.
							 */}
							<AnalysisStart
								dropzone={
									<FileDropzone
										accept={EXCEL_ACCEPT}
										onFiles={handleFiles}
										hint="Excel do Tesouro Gerencial (.xlsx, .xls)"
										columns={["UG Executora", "Conta Contábil", "Conta Corrente", "Saldo"]}
										isLoading={isProcessing}
									/>
								}
								error={error}
							/>
						</motion.div>
					) : (
						<motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-12">
							{/*
							 * Metadados da mensagem — só aqui, no ramo COM dados.
							 *
							 * Moravam num cabeçalho institucional próprio (gradiente azul-e-ouro,
							 * faixa dourada de 4px, aviões de marca-d'água, título em serifada
							 * itálica), acima do estado vazio: pediam o número da mensagem antes
							 * de existir qualquer análise para mensagem nenhuma, e ficavam numa
							 * largura diferente do resto da tela.
							 */}
							<ReportMetadataCard
								reportDate={reportDate}
								msgNumber={msgNumber}
								msgDate={msgDate}
								onReportDateChange={setReportDate}
								onMsgNumberChange={setMsgNumber}
								onMsgDateChange={setMsgDate}
							/>

							{/* Era: dois cards de `p-8` com barra decorativa de `tech-blue` a 30% e
							    um terceiro azul-sólido com o valor em amarelo — três KPIs, dois desenhos. */}
							<div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
								<StatTile label="Unidades Gestoras" value={filteredData.length} hint="afetadas" />
								<StatTile
									label="Total de ocorrências"
									value={filteredData.reduce((acc, curr) => acc + curr.occurrences.length, 0)}
									hint="registros"
									status="action"
								/>
								<StatTile label="Volume financeiro" value={formatCurrency(totalVolume)} hint="em subitens genéricos" status="warning" />
							</div>

							{/* Filtro no corpo, com rótulo. Era um card de `p-8` com disco de ícone,
							    pílula "Filtro Ativo" em `animate-pulse` e um botão "Modo Geral" pintado
							    de `tech-blue`. */}
							<ConferenteFilter allConferentes={allConferentes} selectedConferente={selectedConferente} onSelectedConferenteChange={setSelectedConferente} />

							<SegmentedControl
								label="Seção"
								size="lg"
								className="mb-8"
								value={activeTab}
								onValueChange={setActiveTab}
								options={[
									{
										value: "messages",
										label: (
											<>
												<FileText /> Mensagens institucionais
											</>
										),
									},
									{
										value: "dashboard",
										label: (
											<>
												<LayoutDashboard /> Painel gerencial
											</>
										),
									},
								]}
							/>

							{activeTab === "messages" ? (
								<>
									{/* Tabela Situacional */}
									<SituationalTable filteredData={filteredData} />

									{/* Mensagens */}
									<section>
										<SectionHeader
											icon={<FileText />}
											title="Expedição de cobranças"
											description="Comunicações oficiais geradas"
											className="mb-6"
											actions={
												<SegmentedControl
													label="Modo de mensagem"
													value={messageMode}
													onValueChange={setMessageMode}
													options={[
														{ value: "individual", label: "Por Unidade Gestora" },
														{ value: "consolidated", label: "Consolidada por questão" },
													]}
												/>
											}
										/>

										{messageMode === "individual" ? (
											<div className="grid grid-cols-1 gap-8">
												{filteredData.map((group, idx) => {
													const ugConfig: MessageConfig = ugConfigs[group.ug] || { messageType: "sem_prazo", deadlineDate: "", msgNumber, msgDate }
													const currentMsgNumber = ugConfig.msgNumber || msgNumber
													const currentMsgDate = ugConfig.msgDate || msgDate
													const message = INSTITUTIONAL_TEMPLATE(
														group.ug,
														group.occurrences,
														formattedReportDate,
														formatMsgDate(currentMsgDate),
														ugConfig.messageType,
														getDeadlineText(group.ug),
														currentMsgNumber,
														"all"
													)
													const draft = drafts.of(`ug:${group.ug}`, message)

													return (
														<UgMessageCard
															key={group.ug}
															group={group}
															idx={idx}
															ugConfig={ugConfig}
															draft={draft}
															isCopied={copiedIndex === idx}
															onCopy={copyToClipboard}
															onConfigChange={(field, value) => updateUgConfig(group.ug, field, value)}
														/>
													)
												})}
											</div>
										) : (
											<div className="grid grid-cols-1 gap-8">
												{Object.keys(occurrencesByRac).map((racId, idx) => {
													const occurrences = occurrencesByRac[racId]
													const racConfig: MessageConfig = racConfigs[racId] || { messageType: "sem_prazo", deadlineDate: "", msgNumber, msgDate }
													const currentMsgNumber = racConfig.msgNumber || msgNumber
													const currentMsgDate = racConfig.msgDate || msgDate
													const message = CONSOLIDATED_TEMPLATE(
														racId,
														occurrences,
														formattedReportDate,
														formatMsgDate(currentMsgDate),
														racConfig.messageType,
														getRacDeadlineText(racId),
														currentMsgNumber
													)
													const draft = drafts.of(`rac:${racId}`, message)
													const totalSaldo = occurrences.reduce((sum, occ) => sum + occ.saldo, 0)
													const uniqueUgs = new Set(occurrences.map((o) => o.ug)).size

													return (
														<RacMessageCard
															key={racId}
															racId={racId}
															idx={idx}
															racConfig={racConfig}
															draft={draft}
															occurrencesCount={occurrences.length}
															totalSaldo={totalSaldo}
															uniqueUgs={uniqueUgs}
															isCopied={copiedIndex === idx}
															onCopy={copyToClipboard}
															onConfigChange={(field, value) => updateRacConfig(racId, field, value)}
														/>
													)
												})}
											</div>
										)}
									</section>
								</>
							) : (
								/* Dashboard */
								<section className="mb-16 space-y-8">
									<SectionHeader
										icon={<TrendingUp />}
										title="Painel estratégico de acompanhamento"
										description="Visão operacional, tática e estratégica"
										actions={
											<SegmentedControl
												label="Nível do painel"
												value={dashboardTab}
												onValueChange={setDashboardTab}
												options={[
													{ value: "operacional", label: "Operacional" },
													{ value: "tatico", label: "Tático" },
													{ value: "estrategico", label: "Estratégico" },
												]}
											/>
										}
									/>

									{dashboardTab === "operacional" && (
										<OperationalDashboard
											filteredData={filteredData}
											totalVolume={totalVolume}
											contasCount={contasCount}
											topUgsBySaldo={topUgsBySaldo}
											topContas={topContas}
											conferentesList={conferentesList}
										/>
									)}

									{dashboardTab === "tatico" && (
										<TacticalDashboard odsList={odsList} orgaoSuperiorList={orgaoSuperiorList} topUgsByInconsistencias={topUgsByInconsistencias} />
									)}

									{dashboardTab === "estrategico" && (
										<StrategicDashboard
											filteredData={filteredData}
											totalInconsistencias={totalInconsistencias}
											totalVolume={totalVolume}
											odsList={odsList}
											orgaoSuperiorList={orgaoSuperiorList}
											paretoSummary={paretoSummary}
											topUgsByInconsistencias={topUgsByInconsistencias}
										/>
									)}
								</section>
							)}

							<ResultsFooter />
						</motion.div>
					)}
				</AnimatePresence>
			</div>

			{data.length > 0 && (
				<AIAssistant
					dataContext={{
						totalInconsistencias,
						totalVolume,
						odsList,
						orgaoSuperiorList,
						topUgsByInconsistencias,
						racList,
						conferentesList,
						paretoSummary,
						criticalLevels,
					}}
				/>
			)}
		</HubLayout>
	)
}
