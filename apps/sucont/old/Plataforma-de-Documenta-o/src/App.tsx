import { AlertCircle, BarChart3, FileText, HelpCircle, History, Layout, Loader2, Plus, Printer, Settings, Shield, Sparkles } from "lucide-react"
import React, { useEffect, useState } from "react"
import { DataAnalysisReport } from "./components/DataAnalysisReport"
import { FabDocument } from "./components/FabDocument"
import { adaptDraft, type DataAnalysisData, type DocumentType, type FabDocumentData } from "./services/gemini"

class ErrorBoundary extends React.Component<any, any> {
	state: any = { hasError: false, error: null }

	static getDerivedStateFromError(error: Error) {
		return { hasError: true, error }
	}

	componentDidCatch(_error: Error, _errorInfo: React.ErrorInfo) {}

	render() {
		const { children } = (this as any).props
		if (this.state.hasError) {
			return (
				<div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
					<div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl border border-slate-200 text-center">
						<div className="bg-red-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
							<AlertCircle className="w-8 h-8 text-red-600" />
						</div>
						<h2 className="text-2xl font-bold text-slate-900 mb-4">Ops! Algo deu errado</h2>
						<p className="text-slate-600 mb-6">Ocorreu um erro inesperado na aplicação. Tente recarregar a página ou clique no botão abaixo.</p>
						<div className="bg-slate-50 p-4 rounded-lg text-left mb-6 overflow-auto max-h-32">
							<code className="text-xs text-red-600">{this.state.error?.message}</code>
						</div>
						<button onClick={() => window.location.reload()} className="btn-primary w-full">
							Recarregar Aplicação
						</button>
					</div>
				</div>
			)
		}

		return children
	}
}

export default function App() {
	return (
		<ErrorBoundary>
			<AppContent />
		</ErrorBoundary>
	)
}

function AppContent() {
	const [docType, setDocType] = useState<DocumentType>("FAB_OFFICE")
	const [draft, setDraft] = useState("")
	const [isGenerating, setIsGenerating] = useState(false)
	const [loadingTime, setLoadingTime] = useState(0)
	const [docData, setDocData] = useState<any>(null)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		let interval: any
		if (isGenerating) {
			setLoadingTime(0)
			interval = setInterval(() => {
				setLoadingTime((prev) => prev + 1)
			}, 1000)
		} else {
			clearInterval(interval)
		}
		return () => clearInterval(interval)
	}, [isGenerating])

	const handleGenerate = async () => {
		if (!draft.trim()) return
		setIsGenerating(true)
		setError(null)
		try {
			const result = await adaptDraft(draft, docType)
			setDocData(result)
		} catch (err: any) {
			let errorMessage = "Falha ao gerar o documento. Verifique sua conexão ou tente novamente."

			if (err instanceof Error) {
				errorMessage = err.message
			} else if (typeof err === "string") {
				errorMessage = err
			} else if (err?.message) {
				errorMessage = err.message
			}

			setError(errorMessage)
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
		<div className="min-h-screen flex flex-col bg-[var(--color-surface-bg)]">
			{/* Header - Hidden on Print */}
			<header className="no-print bg-white border-b border-slate-200 px-8 py-3 flex items-center justify-between sticky top-0 z-50 shadow-sm">
				<div className="flex items-center gap-4">
					<div className="bg-[var(--color-brand-primary)] p-2 rounded-lg shadow-lg shadow-blue-900/20">
						<Shield className="w-5 h-5 text-white" />
					</div>
					<div>
						<h1 className="text-lg font-bold text-slate-900 leading-none font-display">Plataforma de Documentação</h1>
						<p className="text-[10px] text-slate-400 mt-1 font-bold uppercase tracking-[0.15em]">Divisão de Contabilidade Patrimonial</p>
					</div>
				</div>

				<div className="flex items-center gap-4">
					<div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
						<button
							onClick={() => setDocType("FAB_OFFICE")}
							className={`px-4 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-2 ${
								docType === "FAB_OFFICE" ? "bg-white text-[var(--color-brand-primary)] shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-700"
							}`}
						>
							<FileText className="w-3.5 h-3.5" />
							OFÍCIO FAB
						</button>
						<button
							onClick={() => setDocType("DATA_ANALYSIS")}
							className={`px-4 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-2 ${
								docType === "DATA_ANALYSIS"
									? "bg-white text-[var(--color-brand-primary)] shadow-sm ring-1 ring-slate-200"
									: "text-slate-500 hover:text-slate-700"
							}`}
						>
							<BarChart3 className="w-3.5 h-3.5" />
							RELATÓRIO DE DADOS
						</button>
					</div>

					{docData && (
						<div className="flex items-center gap-2 ml-4 pl-4 border-l border-slate-200">
							<button onClick={handleReset} className="btn-secondary flex items-center gap-2 py-1.5 text-xs">
								<Plus className="w-3.5 h-3.5" /> Novo
							</button>
							<button onClick={handlePrint} className="btn-primary flex items-center gap-2 py-1.5 text-xs">
								<Printer className="w-3.5 h-3.5" /> Imprimir
							</button>
						</div>
					)}
				</div>
			</header>

			{/* Main Workspace */}
			<main className="flex-1 flex overflow-hidden">
				{/* Sidebar - Hidden on Print */}
				<aside className="no-print w-16 bg-white border-r border-slate-200 flex flex-col items-center py-6 gap-8">
					<button className="p-2 text-blue-600 bg-blue-50 rounded-xl">
						<Layout className="w-5 h-5" />
					</button>
					<button className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
						<History className="w-5 h-5" />
					</button>
					<button className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
						<Settings className="w-5 h-5" />
					</button>
					<div className="mt-auto">
						<button className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
							<HelpCircle className="w-5 h-5" />
						</button>
					</div>
				</aside>

				<div className="flex-1 overflow-hidden relative">
					{!docData ? (
						<div className="flex-1 p-12 flex flex-col items-center justify-center bg-white h-full overflow-y-auto">
							<div className="w-full max-w-2xl">
								<div className="mb-10 text-center">
									<div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4">
										<Sparkles className="w-3 h-3" /> Inteligência Documental
									</div>
									<h2 className="text-4xl font-bold text-slate-900 mb-4 font-display">
										{docType === "FAB_OFFICE" ? "Redigir Ofício Militar" : "Análise de Dados Patrimoniais"}
									</h2>
									<p className="text-lg text-slate-500 leading-relaxed max-w-lg mx-auto">
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
										className="input-field min-h-[350px] text-lg resize-none shadow-sm border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all"
									/>
									<div className="absolute bottom-4 right-4 flex items-center gap-2">
										<span className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider">{draft.length} caracteres</span>
									</div>
								</div>

								{error && (
									<div className="mt-4 p-4 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-3 text-rose-700 text-sm">
										<AlertCircle className="w-5 h-5 shrink-0" />
										{error}
									</div>
								)}

								<button
									onClick={handleGenerate}
									disabled={isGenerating || !draft.trim()}
									className="btn-primary mt-8 w-full py-5 text-lg flex items-center justify-center gap-3 shadow-xl shadow-blue-900/20"
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
						<div className="flex-1 bg-slate-50 overflow-y-auto p-12 flex justify-center h-full">
							<div className="relative flex gap-8">
								<div className="shadow-2xl rounded-sm overflow-hidden bg-white">
									{docType === "FAB_OFFICE" && docData && "paragraphs" in docData ? (
										<FabDocument data={docData as FabDocumentData} onChange={setDocData} />
									) : docType === "DATA_ANALYSIS" && docData && "tableData" in docData ? (
										<DataAnalysisReport data={docData as DataAnalysisData} />
									) : (
										<div className="p-20 text-center bg-white min-h-[600px] flex flex-col items-center justify-center">
											<div className="bg-red-50 p-4 rounded-full mb-6">
												<AlertCircle className="w-12 h-12 text-red-500" />
											</div>
											<h3 className="text-xl font-bold text-slate-900 mb-2">Erro na Estrutura do Documento</h3>
											<p className="text-slate-500 max-w-md mx-auto mb-8">
												Ocorreu um problema ao processar os dados gerados pela IA. Por favor, tente reformular seu rascunho.
											</p>
											<button onClick={() => setDocData(null)} className="btn-primary">
												Voltar ao Início
											</button>
										</div>
									)}
								</div>

								<div className="no-print w-64 shrink-0">
									<div className="sticky top-0 space-y-4">
										<div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
											<h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Ações do Documento</h4>
											<div className="space-y-2">
												<button
													onClick={handlePrint}
													className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 rounded-xl transition-colors"
												>
													<Printer className="w-4 h-4 text-slate-400" /> PDF / Imprimir
												</button>
												<button
													onClick={handleReset}
													className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 rounded-xl transition-colors"
												>
													<Plus className="w-4 h-4 text-slate-400" /> Novo Rascunho
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

			{/* Footer - Hidden on Print */}
			<footer className="no-print bg-white border-t border-slate-200 px-8 py-3 flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
				<div className="flex items-center gap-2">
					<div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
					<span>Sistema de Apoio à Gestão Patrimonial</span>
				</div>
				<div className="flex items-center gap-4">
					<span>v2.4.0-PRO</span>
					<span className="w-1 h-1 bg-slate-300 rounded-full"></span>
					<span>Status: Operacional</span>
				</div>
			</footer>
		</div>
	)
}
