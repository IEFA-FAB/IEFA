import { createFileRoute, Link } from "@tanstack/react-router"
import { AlertCircle, ArrowLeft, BarChart3, FileText, HelpCircle, History, Layout, Loader2, Plus, Printer, Settings, Shield, Sparkles } from "lucide-react"
import { useEffect, useState } from "react"
import { InstitutionalCredits } from "#/components/institutional-credits"
import { LegalFooter } from "#/components/legal-footer"
import { DataAnalysisReport } from "#/components/plataforma-doc/data-analysis-report"
import { FabDocument } from "#/components/plataforma-doc/fab-document"
import { Button } from "#/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip"
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
					<Tooltip>
						<TooltipTrigger
							render={
								<Link to="/" aria-label="Voltar ao Hub" className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
									<ArrowLeft className="w-4 h-4" />
								</Link>
							}
						/>
						<TooltipContent>Voltar ao Hub</TooltipContent>
					</Tooltip>

					<div className="w-px h-6 bg-muted" />

					<div className="bg-fab-blue p-2 rounded-lg shadow-lg">
						<Shield className="w-5 h-5 text-white" />
					</div>
					<div>
						<h1 className="text-lg font-bold text-foreground leading-none">Plataforma de Documentação</h1>
						<p className="text-label text-muted-foreground mt-1">Divisão de Contabilidade Patrimonial</p>
					</div>
				</div>

				<div className="flex items-center gap-4">
					{/* Seletor de tipo */}
					<div className="flex bg-muted p-1 rounded-xl border border-border">
						<Button
							type="button"
							variant="ghost"
							onClick={() => setDocType("FAB_OFFICE")}
							className={`px-4 py-1.5 rounded-lg text-hint font-bold transition-all gap-2 ${
								docType === "FAB_OFFICE" ? "bg-card text-fab-blue shadow-sm ring-1 ring-border hover:bg-card" : "text-muted-foreground hover:text-foreground"
							}`}
						>
							<FileText className="w-3.5 h-3.5" />
							OFÍCIO FAB
						</Button>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setDocType("DATA_ANALYSIS")}
							className={`px-4 py-1.5 rounded-lg text-hint font-bold transition-all gap-2 ${
								docType === "DATA_ANALYSIS" ? "bg-card text-fab-blue shadow-sm ring-1 ring-border hover:bg-card" : "text-muted-foreground hover:text-foreground"
							}`}
						>
							<BarChart3 className="w-3.5 h-3.5" />
							RELATÓRIO DE DADOS
						</Button>
					</div>

					{docData && (
						<div className="flex items-center gap-2 ml-4 pl-4 border-l border-border">
							<Button type="button" variant="outline" onClick={handleReset} className="gap-2 py-1.5 px-3 rounded-xl">
								<Plus className="w-3.5 h-3.5" /> Novo
							</Button>
							<Button type="button" onClick={handlePrint} className="gap-2 py-1.5 px-3 rounded-xl bg-fab-blue hover:bg-action text-surface-inverted-foreground">
								<Printer className="w-3.5 h-3.5" /> Imprimir
							</Button>
						</div>
					)}
				</div>
			</header>

			{/* Workspace */}
			<main className="flex-1 flex overflow-hidden">
				{/* Sidebar */}
				<aside className="no-print w-16 bg-card border-r border-border flex flex-col items-center py-6 gap-8">
					<Button type="button" variant="ghost" size="icon" aria-label="Documentos" className="text-action bg-action/10 hover:bg-action/10 rounded-xl">
						<Layout className="w-5 h-5" />
					</Button>
					<Button type="button" variant="ghost" size="icon" aria-label="Histórico" className="text-muted-foreground hover:text-foreground transition-colors">
						<History className="w-5 h-5" />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label="Configurações"
						className="text-muted-foreground hover:text-foreground transition-colors"
					>
						<Settings className="w-5 h-5" />
					</Button>
					<div className="mt-auto">
						<Button type="button" variant="ghost" size="icon" aria-label="Ajuda" className="text-muted-foreground hover:text-foreground transition-colors">
							<HelpCircle className="w-5 h-5" />
						</Button>
					</div>
				</aside>

				<div className="flex-1 overflow-hidden relative">
					{!docData ? (
						/* ── Área de rascunho ── */
						<div className="flex-1 p-12 flex flex-col items-center justify-center bg-card h-full overflow-y-auto">
							<div className="w-full max-w-2xl">
								<div className="mb-10 text-center">
									<div className="inline-flex items-center gap-2 px-3 py-1 bg-action/10 text-action rounded-full text-label mb-4">
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
										className="w-full border border-border rounded-xl p-4 text-foreground focus:outline-none focus:ring-2 focus-visible:ring-ring font-sans bg-card min-h-[350px] text-lg resize-none shadow-sm focus:border-action transition-all"
									/>
									<div className="absolute bottom-4 right-4 flex items-center gap-2">
										<span className="text-muted-foreground font-mono text-label">{draft.length} caracteres</span>
									</div>
								</div>

								{error && (
									<div className="mt-4 p-4 bg-destructive/10 border border-destructive/30 rounded-xl flex items-center gap-3 text-destructive text-sm">
										<AlertCircle className="w-5 h-5 shrink-0" />
										{error}
									</div>
								)}

								<Button
									type="button"
									onClick={handleGenerate}
									disabled={isGenerating || !draft.trim()}
									className="mt-8 w-full py-5 text-lg gap-3 bg-fab-blue hover:bg-action text-surface-inverted-foreground rounded-xl shadow-xl"
								>
									{isGenerating ? (
										<div className="flex flex-col items-center">
											<div className="flex items-center gap-3">
												<Loader2 className="w-6 h-6 animate-spin" />
												<span>Processando Inteligência...</span>
											</div>
											{loadingTime > 10 && (
												<span className="text-hint mt-1 opacity-70 animate-pulse">
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
								</Button>
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
											<Button
												type="button"
												onClick={() => setDocData(null)}
												className="bg-fab-blue hover:bg-action text-surface-inverted-foreground px-6 py-3 rounded-xl"
											>
												Voltar ao Início
											</Button>
										</div>
									)}
								</div>

								{/* Painel lateral de ações */}
								<div className="no-print w-64 shrink-0">
									<div className="sticky top-0 space-y-4">
										<div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
											<h4 className="text-label text-muted-foreground mb-4">Ações do Documento</h4>
											<div className="space-y-2">
												<Button type="button" variant="ghost" onClick={handlePrint} className="w-full justify-start gap-3 px-4 py-2.5 rounded-xl">
													<Printer className="w-4 h-4 text-muted-foreground" /> PDF / Imprimir
												</Button>
												<Button type="button" variant="ghost" onClick={handleReset} className="w-full justify-start gap-3 px-4 py-2.5 rounded-xl">
													<Plus className="w-4 h-4 text-muted-foreground" /> Novo Rascunho
												</Button>
											</div>
										</div>

										<div className="bg-action p-6 rounded-2xl shadow-lg text-action-foreground">
											<h4 className="text-label text-action-foreground mb-2">Dica de UX</h4>
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
			<footer className="no-print bg-card border-t border-border px-8 py-3 flex items-center justify-between text-label text-muted-foreground">
				<div className="flex items-center gap-2">
					<div className="w-2 h-2 bg-success rounded-full animate-pulse" />
					<span>Documentação</span>
				</div>
			</footer>

			{/* Único lugar dos créditos institucionais: eles repetiam em seis rotas de
			    trabalho, onde ninguém os consulta. */}
			<InstitutionalCredits className="px-8 pb-10" />

			{/* Rota fora do HubLayout: o link para os documentos legais precisa vir
			    daqui — o LGPD.md exige o rodapé em toda tela do app. */}
			<LegalFooter />
		</div>
	)
}
