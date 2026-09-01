import { createFileRoute } from "@tanstack/react-router"
import { AlertCircle, BarChart3, FileText, Lightbulb, Loader2, Plus, Printer, Sparkles } from "lucide-react"
import { useEffect, useState } from "react"
import { HubLayout } from "#/components/hub-layout"
import { InstitutionalCredits } from "#/components/institutional-credits"
import { DataAnalysisReport } from "#/components/plataforma-doc/data-analysis-report"
import { FabDocument } from "#/components/plataforma-doc/fab-document"
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert"
import { Button } from "#/components/ui/button"
import { SegmentedControl } from "#/components/ui/segmented-control"
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
		<HubLayout
			width="wide"
			actions={
				docData && (
					<>
						<Button type="button" variant="outline" size="sm" onClick={handleReset}>
							<Plus className="w-3.5 h-3.5" /> Novo
						</Button>
						<Button type="button" size="sm" onClick={handlePrint}>
							<Printer className="w-3.5 h-3.5" /> Imprimir
						</Button>
					</>
				)
			}
		>
			{/*
			 * O tipo de documento é escolha da tela, não navegação: abas no corpo.
			 * Antes eram dois `<button>` num segmento próprio, dentro de um cabeçalho
			 * próprio, ao lado de uma coluna de ícones em que três dos quatro botões
			 * não tinham `onClick` nenhum — decoração que prometia histórico,
			 * configurações e ajuda inexistentes.
			 */}
			<SegmentedControl
				label="Tipo de documento"
				value={docType}
				onValueChange={setDocType}
				className="mb-8"
				options={[
					{
						value: "FAB_OFFICE",
						label: (
							<>
								<FileText />
								Ofício FAB
							</>
						),
					},
					{
						value: "DATA_ANALYSIS",
						label: (
							<>
								<BarChart3 />
								Relatório de dados
							</>
						),
					},
				]}
			/>

			<div>
				{!docData ? (
					/* ── Área de rascunho ── */
					<div className="flex flex-col items-center">
						<div className="w-full max-w-2xl">
							<div className="mb-10 text-center">
								<div className="inline-flex items-center gap-2 px-3 py-1 bg-action/10 text-action rounded-full text-label mb-4">
									<Sparkles className="w-3 h-3" /> Inteligência Documental
								</div>
								<h2 className="text-heading text-foreground mb-4">{docType === "FAB_OFFICE" ? "Redigir Ofício Militar" : "Análise de Dados Patrimoniais"}</h2>
								<p className="text-heading text-muted-foreground leading-relaxed max-w-lg mx-auto">
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
									className="w-full border border-border rounded-xl p-4 text-foreground focus:outline-none focus:ring-2 focus-visible:ring-ring font-sans bg-card min-h-[350px] text-heading resize-none shadow-sm focus:border-action transition-all"
								/>
								<div className="absolute bottom-4 right-4 flex items-center gap-2">
									<span className="text-muted-foreground font-mono text-label">{draft.length} caracteres</span>
								</div>
							</div>

							{error && (
								<Alert variant="destructive" className="mt-4">
									<AlertCircle />
									<AlertTitle>Não foi possível gerar o documento</AlertTitle>
									<AlertDescription>{error}</AlertDescription>
								</Alert>
							)}

							<Button type="button" onClick={handleGenerate} disabled={isGenerating || !draft.trim()} size="lg" className="mt-8 w-full">
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
					<div className="flex justify-center">
						<div className="relative flex gap-8">
							<div className="overflow-hidden rounded-lg border border-border bg-card">
								{docType === "FAB_OFFICE" && docData && "paragraphs" in docData ? (
									<FabDocument data={docData as FabDocumentData} onChange={setDocData} />
								) : docType === "DATA_ANALYSIS" && docData && "tableData" in docData ? (
									<DataAnalysisReport data={docData as DataAnalysisData} />
								) : (
									<div className="p-20 text-center bg-card min-h-[600px] flex flex-col items-center justify-center">
										<div className="bg-destructive/10 p-4 rounded-full mb-6">
											<AlertCircle className="w-12 h-12 text-destructive" />
										</div>
										<h3 className="text-heading text-foreground mb-2">Erro na Estrutura do Documento</h3>
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

							{/* Imprimir e Novo saíram daqui: viraram as `actions` do cabeçalho, onde
							    toda ferramenta do hub põe a ação da tela. Ter os dois nos dois
							    lugares é a mesma ação com duas aparências. */}
							<div className="no-print w-64 shrink-0">
								<Alert variant="info" className="sticky top-20">
									<Lightbulb />
									<AlertTitle>Como ajustar</AlertTitle>
									<AlertDescription>
										{docType === "FAB_OFFICE"
											? "Clique em qualquer campo do ofício para editar antes de imprimir."
											: "O relatório vem da análise dos dados enviados. Confira as tabelas comparativas."}
									</AlertDescription>
								</Alert>
							</div>
						</div>
					</div>
				)}
			</div>

			{/* Único lugar dos créditos institucionais: eles repetiam em seis rotas de
			    trabalho, onde ninguém os consulta. */}
			<InstitutionalCredits className="no-print mt-10" />
		</HubLayout>
	)
}
