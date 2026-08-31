import { createFileRoute, Link } from "@tanstack/react-router"
import { AlertCircle, ArrowLeft, BarChart3, FileText, HelpCircle, History, Layout, Loader2, Plus, Printer, Settings, Shield, Sparkles } from "lucide-react"
import { useEffect, useState } from "react"
import { DataAnalysisReport } from "#/components/plataforma-doc/data-analysis-report"
import { FabDocument } from "#/components/plataforma-doc/fab-document"
import type { DataAnalysisData, DocumentType, FabDocumentData } from "#/server/document-ai.fn"
import { adaptDraftFn } from "#/server/document-ai.fn"

export const Route = createFileRoute("/documentacao")({ component: PlataformaDoc })

function PlataformaDoc() {
	const [docType, setDocType] = useState<DocumentType>("FAB_OFFICE")
	const [draft, setDraft] = useState("")
	const [isGenerating, setIsGenerating] = useState(false)
	const [loadingTime, setLoadingTime] = useState(0)
	const [docData, setDocData] = useState<FabDocumentData | DataAnalysisData | null>(null)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		let interval: ReturnType<typeof setInterval> | undefined
		if (isGenerating) {
			setLoadingTime(0)
			interval = setInterval(() => setLoadingTime((prev) => prev + 1), 1000)
		}
		return () => clearInterval(interval)
	}, [isGenerating])

	const handleGenerate = async () => {
		if (!draft.trim()) return
		setIsGenerating(true)
		setError(null)
		try {
			const result = await adaptDraftFn({ data: { draft, type: docType } })
			setDocData(result)
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "Falha ao gerar o documento. Verifique sua conexão ou tente novamente."
			setError(msg)
		} finally {
			setIsGenerating(false)
		}
	}

	const handleReset = () => {
		setDocData(null)
		setDraft("")
		setError(null)
	}

	const handlePrint = () => {
		window.print()
	}

	return (
		<div className="min-h-screen flex flex-col bg-muted/50">
			{/* Header */}
			<header className="no-print bg-card border-b border-border px-8 py-3 flex items-center justify-between sticky top-0 z-50 shadow-sm">
				<div className="flex items-center gap-4">
					{/* Botão voltar ao hub */}
					<Link to="/" className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors" title="Voltar ao Hub">
						<ArrowLeft className="w-4 h-4" />
					</Link>

					<div className="w-px h-6 bg-muted" />

					<div className="bg-[#1B365D] p-2 rounded-lg shadow-lg shadow-blue-900/20">
						<Shield className="w-5 h-5 text-white" />
					</div>
					<div>
						<h1 className="text-lg font-bold text-foreground leading-none">Plataforma de Documentação</h1>
						<p className="text-[10px] text-muted-foreground mt-1 font-bold uppercase tracking-[0.15em]">Divisão de Contabilidade Patrimonial</p>
					</div>
				</div>

				<div className="flex items-center gap-4">
					{/* Seletor de tipo */}
					<div className="flex bg-muted p-1 rounded-xl border border-border">
						<button
							type="button"
							onClick={() => setDocType("FAB_OFFICE")}
							className={`px-4 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-2 ${
								docType === "FAB_OFFICE" ? "bg-card text-[#1B365D] shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground"
							}`}
						>
							<FileText className="w-3.5 h-3.5" />
							OFÍCIO FAB
						</button>
						<button
							type="button"
							onClick={() => setDocType("DATA_ANALYSIS")}
							className={`px-4 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-2 ${
								docType === "DATA_ANALYSIS" ? "bg-card text-[#1B365D] shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground"
							}`}
						>
							<BarChart3 className="w-3.5 h-3.5" />
							RELATÓRIO DE DADOS
						</button>
					</div>

					{docData && (
						<div className="flex items-center gap-2 ml-4 pl-4 border-l border-border">
							<button
								type="button"
								onClick={handleReset}
								className="flex items-center gap-2 py-1.5 px-3 text-xs font-bold border border-border text-foreground hover:bg-muted/50 rounded-xl transition-colors"
							>
								<Plus className="w-3.5 h-3.5" /> Novo
							</button>
							<button
								type="button"
								onClick={handlePrint}
								className="flex items-center gap-2 py-1.5 px-3 text-xs font-bold bg-[#1B365D] hover:bg-[#0056B3] text-white rounded-xl transition-colors"
							>
								<Printer className="w-3.5 h-3.5" /> Imprimir
							</button>
						</div>
					)}
				</div>
			</header>

			{/* Workspace */}
			<main className="flex-1 flex overflow-hidden">
				{/* Sidebar */}
				<aside className="no-print w-16 bg-card border-r border-border flex flex-col items-center py-6 gap-8">
					<button type="button" className="p-2 text-blue-600 bg-blue-50 rounded-xl">
						<Layout className="w-5 h-5" />
					</button>
					<button type="button" className="p-2 text-muted-foreground hover:text-foreground transition-colors">
						<History className="w-5 h-5" />
					</button>
					<button type="button" className="p-2 text-muted-foreground hover:text-foreground transition-colors">
						<Settings className="w-5 h-5" />
					</button>
					<div className="mt-auto">
						<button type="button" className="p-2 text-muted-foreground hover:text-foreground transition-colors">
							<HelpCircle className="w-5 h-5" />
						</button>
					</div>
				</aside>

				<div className="flex-1 overflow-hidden relative">
					{!docData ? (
						/* ── Área de rascunho ── */
						<div className="flex-1 p-12 flex flex-col items-center justify-center bg-card h-full overflow-y-auto">
							<div className="w-full max-w-2xl">
								<div className="mb-10 text-center">
									<div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4">
										<Sparkles className="w-3 h-3" /> Inteligência Documental
									</div>
									<h2 className="text-4xl font-bold text-foreground mb-4">
										{docType === "FAB_OFFICE" ? "Redigir Ofício Militar" : "Análise de Dados Patrimoniais"}
									</h2>
									<p className="text-lg text-muted-foreground leading-relaxed max-w-lg mx-auto">
										{docType === "FAB_OFFICE"
											? "Insira os fatos ou um rascunho informal. Nossa IA adaptará para o padrão oficial da FAB com fundamentação técnica."
											: "Cole os dados brutos ou a mensagem de regularização. Geraremos um relatório executivo com tabelas e métricas."}
									</p>
								</div>

								<div className="relative group">
									<textarea
										value={draft}
										onChange={(e) => setDraft(e.target.value)}
										placeholder={docType === "FAB_OFFICE" ? "Ex: Baixa de parafuso de US$ 208 mil por erro de 2010..." : "Cole aqui os dados da mensagem..."}
										className="w-full border border-border rounded-xl p-4 text-foreground focus:outline-none focus:ring-2 focus-visible:ring-ring font-sans bg-card min-h-[350px] text-lg resize-none shadow-sm focus:border-blue-500 transition-all"
									/>
									<div className="absolute bottom-4 right-4 flex items-center gap-2">
										<span className="text-[10px] text-muted-foreground font-mono font-bold uppercase tracking-wider">{draft.length} caracteres</span>
									</div>
								</div>

								{error && (
									<div className="mt-4 p-4 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-3 text-rose-700 text-sm">
										<AlertCircle className="w-5 h-5 shrink-0" />
										{error}
									</div>
								)}

								<button
									type="button"
									onClick={handleGenerate}
									disabled={isGenerating || !draft.trim()}
									className="mt-8 w-full py-5 text-lg flex items-center justify-center gap-3 bg-[#1B365D] hover:bg-[#0056B3] text-white font-bold rounded-xl shadow-xl shadow-blue-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
								>
									{isGenerating ? (
										<div className="flex flex-col items-center">
											<div className="flex items-center gap-3">
												<Loader2 className="w-6 h-6 animate-spin" />
												<span>Processando Inteligência...</span>
											</div>
											{loadingTime > 10 && (
												<span className="text-[10px] mt-1 opacity-70 animate-pulse">
													{loadingTime > 25 ? "Quase lá, finalizando estrutura..." : "Analisando dados complexos..."}
												</span>
											)}
										</div>
									) : (
										<>
											<Sparkles className="w-6 h-6" />
											Gerar Documento Profissional
										</>
									)}
								</button>
							</div>
						</div>
					) : (
						/* ── Área de preview ── */
						<div className="flex-1 bg-muted/50 overflow-y-auto p-12 flex justify-center h-full">
							<div className="relative flex gap-8">
								<div className="shadow-2xl rounded-sm overflow-hidden bg-card">
									{docType === "FAB_OFFICE" && docData && "paragraphs" in docData ? (
										<FabDocument data={docData as FabDocumentData} onChange={setDocData} />
									) : docType === "DATA_ANALYSIS" && docData && "tableData" in docData ? (
										<DataAnalysisReport data={docData as DataAnalysisData} />
									) : (
										<div className="p-20 text-center bg-card min-h-[600px] flex flex-col items-center justify-center">
											<div className="bg-destructive/10 p-4 rounded-full mb-6">
												<AlertCircle className="w-12 h-12 text-destructive" />
											</div>
											<h3 className="text-xl font-bold text-foreground mb-2">Erro na Estrutura do Documento</h3>
											<p className="text-muted-foreground max-w-md mx-auto mb-8">
												Ocorreu um problema ao processar os dados gerados pela IA. Por favor, tente reformular seu rascunho.
											</p>
											<button
												type="button"
												onClick={() => setDocData(null)}
												className="bg-[#1B365D] hover:bg-[#0056B3] text-white font-bold px-6 py-3 rounded-xl transition-colors"
											>
												Voltar ao Início
											</button>
										</div>
									)}
								</div>

								{/* Painel lateral de ações */}
								<div className="no-print w-64 shrink-0">
									<div className="sticky top-0 space-y-4">
										<div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
											<h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-4">Ações do Documento</h4>
											<div className="space-y-2">
												<button
													type="button"
													onClick={handlePrint}
													className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted/50 rounded-xl transition-colors"
												>
													<Printer className="w-4 h-4 text-muted-foreground" /> PDF / Imprimir
												</button>
												<button
													type="button"
													onClick={handleReset}
													className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted/50 rounded-xl transition-colors"
												>
													<Plus className="w-4 h-4 text-muted-foreground" /> Novo Rascunho
												</button>
											</div>
										</div>

										<div className="bg-blue-600 p-6 rounded-2xl shadow-lg shadow-blue-900/20 text-white">
											<h4 className="text-[10px] font-bold text-blue-200 uppercase tracking-widest mb-2">Dica de UX</h4>
											<p className="text-xs leading-relaxed opacity-90">
												{docType === "FAB_OFFICE"
													? "Você pode clicar em qualquer campo do ofício para fazer ajustes manuais antes de imprimir."
													: "O relatório foi gerado com base em auditoria de dados. Verifique as tabelas comparativas."}
											</p>
										</div>
									</div>
								</div>
							</div>
						</div>
					)}
				</div>
			</main>

			{/* Footer */}
			<footer className="no-print bg-card border-t border-border px-8 py-3 flex items-center justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
				<div className="flex items-center gap-2">
					<div className="w-2 h-2 bg-success rounded-full animate-pulse" />
					<span>Sistema de Apoio à Gestão Patrimonial</span>
				</div>
				<div className="flex items-center gap-4">
					<span>v2.4.0-PRO</span>
					<span className="w-1 h-1 bg-slate-300 rounded-full" />
					<span>Status: Operacional</span>
				</div>
			</footer>
		</div>
	)
}
