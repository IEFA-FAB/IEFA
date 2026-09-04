import { createFileRoute } from "@tanstack/react-router"
import { AlertCircle, BookOpen, ChevronDown, ChevronUp, Map as MapIcon, RefreshCw } from "lucide-react"
import { useState } from "react"
import { FileUpload } from "#/components/cruzamento/FileUpload"
import { Report } from "#/components/cruzamento/Report"
import { HubLayout } from "#/components/hub-layout"
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert"
import { Button } from "#/components/ui/button"
import type { ReportData } from "#/lib/cruzamento/analyzer"
import { analyzeData, parseFile } from "#/lib/cruzamento/analyzer"

export const Route = createFileRoute("/cruzamento-contas")({
	component: CruzamentoContas,
})

function CruzamentoContas() {
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [reportData, setReportData] = useState<ReportData | null>(null)
	const [showContext, setShowContext] = useState(false)
	const [showPath, setShowPath] = useState(false)

	const handleFileSelect = async (file: File) => {
		setIsLoading(true)
		setError(null)
		try {
			const records = await parseFile(file)
			if (records.length === 0) {
				throw new Error("Nenhum registro válido encontrado na planilha. Verifique o formato das colunas.")
			}
			const result = analyzeData(records)
			setReportData(result)
		} catch (err) {
			setError(err instanceof Error ? err.message : "Erro ao processar o arquivo. Verifique se o formato está correto.")
		} finally {
			setIsLoading(false)
		}
	}

	const handleReset = () => {
		setReportData(null)
		setError(null)
	}

	return (
		<HubLayout
			actions={
				reportData && (
					<Button type="button" variant="outline" size="sm" onClick={handleReset}>
						<RefreshCw className="w-3.5 h-3.5" />
						Nova análise
					</Button>
				)
			}
		>
			{/* Título, trilha e volta ao hub são do `HubLayout`: o cabeçalho fixo já
			    diz "Catálogo › Analisar › Cruzamento de Contas Correntes" com o
			    escopo Q43 ao lado. Repetir aqui dava dois títulos para a mesma tela. */}
			{error && (
				<Alert variant="destructive" className="mb-8">
					<AlertCircle />
					<AlertTitle>Não foi possível processar</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			{!reportData ? (
				<div className="flex flex-col items-center justify-center">
					<div className="text-center mb-8 max-w-2xl">
						<h2 className="text-heading text-foreground mb-4">Confronto Cruzado de Contas</h2>
						<p className="text-body text-muted-foreground leading-relaxed">
							Ferramenta automatizada para análise de espelhamento entre as contas <strong>897210300</strong> e <strong>897110300</strong>.
						</p>
					</div>

					<div className="w-full max-w-2xl mb-10 space-y-4">
						{/* QUESTÃO 43 */}
						<div className="bg-action/10 border border-action/30 p-5 rounded-xl shadow-sm text-left">
							<h3 className="text-label text-action mb-2">Roteiro de Acompanhamento Contábil (SUCONT-3)</h3>
							<p className="text-subheading text-action leading-relaxed">
								<span className="font-bold">Questão 43</span> - Os saldos da conta EM COBRANÇA - A RECEBER (8.9.7.1.1.03.00), registrados na UG, são compatíveis
								com os saldos registrados na conta EM COBRANÇA (8.9.7.2.1.03.00) registrados na SDPP-País?
							</p>
						</div>

						{/* CAMINHO NO TESOURO GERENCIAL */}
						<div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
							<Button
								type="button"
								variant="ghost"
								onClick={() => setShowPath(!showPath)}
								className="w-full px-6 py-4 flex items-center justify-between bg-muted/50 hover:bg-muted/80 transition-colors text-left"
							>
								<div className="flex items-center gap-3">
									<MapIcon className="w-5 h-5 text-warning" />
									<span className="font-bold text-foreground">Como extrair o relatório no Tesouro Gerencial?</span>
								</div>
								{showPath ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
							</Button>

							{showPath && (
								<div className="p-6 border-t border-border bg-warning/10">
									<p className="text-body text-foreground mb-4">
										Para gerar a planilha compatível com este analisador, acesse o Tesouro Gerencial e siga o caminho abaixo:
									</p>
									<div className="bg-card border border-border rounded-lg p-4 font-mono text-caption text-muted-foreground leading-relaxed shadow-inner">
										<span className="font-bold text-action">TESOURO GERENCIAL</span>
										<span className="mx-2 text-muted-foreground">{">"}</span>
										<span>Relatórios Compartilhados</span>
										<span className="mx-2 text-muted-foreground">{">"}</span>
										<span>Consultas Gerenciais</span>
										<span className="mx-2 text-muted-foreground">{">"}</span>
										<span>Relatórios de Bancada dos Órgãos Superiores</span>
										<span className="mx-2 text-muted-foreground">{">"}</span>
										<span>52000 - Ministério da Defesa</span>
										<span className="mx-2 text-muted-foreground">{">"}</span>
										<span>52111 - Comando da Aeronáutica</span>
										<span className="mx-2 text-muted-foreground">{">"}</span>
										<span>SEFA</span>
										<span className="mx-2 text-muted-foreground">{">"}</span>
										<span>DIREF</span>
										<span className="mx-2 text-muted-foreground">{">"}</span>
										<span>SUCONT-3 - ACOMPANHAMENTO</span>
										<span className="mx-2 text-muted-foreground">{">"}</span>
										<span className="font-bold text-success">ACOMPANHAMENTO CONTÁBIL - SUCONT-3.1</span>
									</div>
								</div>
							)}
						</div>

						{/* CONTEXTO CONTÁBIL */}
						<div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
							<Button
								type="button"
								variant="ghost"
								onClick={() => setShowContext(!showContext)}
								className="w-full px-6 py-4 flex items-center justify-between bg-muted/50 hover:bg-muted/80 transition-colors text-left"
							>
								<div className="flex items-center gap-3">
									<BookOpen className="w-5 h-5 text-action" />
									<span className="font-bold text-foreground">Contexto Contábil das Contas Analisadas</span>
								</div>
								{showContext ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
							</Button>

							{showContext && (
								<div className="p-6 border-t border-border space-y-6 text-body text-foreground leading-relaxed">
									<div className="bg-muted/50 p-4 rounded-lg border border-border space-y-4 mb-6">
										<div>
											<h4 className="text-action mb-1 text-label">Objetivo da Análise</h4>
											<p className="text-muted-foreground">
												Verificar a conformidade e o espelhamento entre contas contábeis correlatas, garantindo que os registros representem de forma fidedigna
												os fatos administrativos e a situação patrimonial do COMAER.
											</p>
										</div>
										<div>
											<h4 className="text-warning mb-1 text-label">Risco Contábil Associado</h4>
											<p className="text-muted-foreground">
												A divergência entre os saldos de controle de cobrança indica possível omissão de registros, falha na conciliação ou descompasso
												temporal. Isso compromete a integridade das demonstrações contábeis e pode ocultar passivos ou ativos reais da União.
											</p>
										</div>
										<div>
											<h4 className="text-success mb-1 text-label">Importância da Verificação</h4>
											<p className="text-muted-foreground">
												A regularização imediata preserva a qualidade da informação contábil, orienta a atuação da Setorial Contábil e fornece subsídios
												confiáveis para a tomada de decisão da alta administração.
											</p>
										</div>
									</div>

									<div>
										<h4 className="font-bold text-foreground mb-2 flex items-center gap-2">
											<span className="bg-action/15 text-action px-2 py-0.5 rounded text-caption font-mono">897210300</span>
											EM COBRANÇA
										</h4>
										<p className="mb-2">
											<strong>Função:</strong> Registra o montante da responsabilidade da Unidade Gestora com terceiros por valores, títulos e bens em fase de
											cobrança pelos beneficiados.
										</p>
										<ul className="list-disc pl-5 space-y-1 text-muted-foreground">
											<li>
												<strong className="text-foreground">Debitada:</strong> Pela apropriação da baixa com responsabilidade ou pelo encerramento do exercício.
											</li>
											<li>
												<strong className="text-foreground">Creditada:</strong> Pela apropriação da responsabilidade com terceiros ou pelos estornos efetuados
												com a negativação parcial ou total dos valores.
											</li>
										</ul>
									</div>

									<div className="h-px bg-border w-full" />

									<div>
										<h4 className="font-bold text-foreground mb-2 flex items-center gap-2">
											<span className="bg-success/15 text-success px-2 py-0.5 rounded text-caption font-mono">897110300</span>
											EM COBRANÇA - A RECEBER
										</h4>
										<p className="mb-2">
											<strong>Função:</strong> Registra o montante da responsabilidade de terceiros por valores, títulos e bens em fase de cobrança pela Unidade
											Gestora.
										</p>
										<ul className="list-disc pl-5 space-y-1 text-muted-foreground">
											<li>
												<strong className="text-foreground">Debitada:</strong> Pela apropriação da baixa da responsabilidade ou pelo encerramento do exercício.
											</li>
											<li>
												<strong className="text-foreground">Creditada:</strong> Pela apropriação da responsabilidade de terceiros ou pelos estornos efetuados
												com a negativação parcial ou total dos valores.
											</li>
										</ul>
									</div>
								</div>
							)}
						</div>
					</div>

					<FileUpload onFileSelect={handleFileSelect} isLoading={isLoading} />
				</div>
			) : (
				<div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
					<Report data={reportData} />
				</div>
			)}
		</HubLayout>
	)
}
