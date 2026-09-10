import { createFileRoute } from "@tanstack/react-router"
import { FileSearch, MessageSquare, RefreshCw, Scale } from "lucide-react"
import { useState } from "react"
import { AnalysisGuide } from "#/components/analysis-guide"
import { AnalysisStart } from "#/components/analysis-start"
import { Report } from "#/components/cruzamento/Report"
import { HubLayout } from "#/components/hub-layout"
import { RacReference } from "#/components/rac-reference"
import { TesouroGerencialPath } from "#/components/tesouro-gerencial-path"
import { Button } from "#/components/ui/button"
import { FileDropzone, SPREADSHEET_ACCEPT } from "#/components/ui/file-dropzone"
import type { ReportData } from "#/lib/cruzamento/analyzer"
import { analyzeData, parseFile } from "#/lib/cruzamento/analyzer"

export const Route = createFileRoute("/cruzamento-contas")({
	component: CruzamentoContas,
})

function CruzamentoContas() {
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [reportData, setReportData] = useState<ReportData | null>(null)

	const handleFiles = async (files: File[]) => {
		const file = files[0]
		if (!file) return

		setIsLoading(true)
		setError(null)
		try {
			const records = await parseFile(file)
			if (records.length === 0) {
				throw new Error("Nenhum registro válido encontrado na planilha. Verifique o formato das colunas.")
			}
			setReportData(analyzeData(records))
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

	const guide = (
		<AnalysisGuide
			source={<TesouroGerencialPath />}
			reference={
				<RacReference
					statement="Os saldos da conta EM COBRANÇA - A RECEBER (8.9.7.1.1.03.00), registrados na UG, são compatíveis com os saldos registrados na conta EM COBRANÇA (8.9.7.2.1.03.00) registrados na SDPP-País?"
					objective="Verificar o espelhamento entre as contas 897210300 e 897110300, garantindo que os registros representem de forma fidedigna os fatos administrativos e a situação patrimonial do COMAER."
					risk="A divergência entre os saldos de controle de cobrança indica possível omissão de registros, falha na conciliação ou descompasso temporal, e pode ocultar passivos ou ativos reais da União."
					importance="A regularização preserva a qualidade da informação contábil, orienta a atuação da Setorial Contábil e dá base confiável à decisão da alta administração."
				>
					<AccountFunctions />
				</RacReference>
			}
			notes={ANALYSIS_NOTES}
		/>
	)

	return (
		<HubLayout
			guide={guide}
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
			    diz "Catálogo › Analisar › Cruzamento de Contas" com o escopo Q22 ao
			    lado. Repetir aqui dava dois títulos para a mesma tela. */}
			{!reportData ? (
				<AnalysisStart
					dropzone={
						<FileDropzone
							accept={SPREADSHEET_ACCEPT}
							onFiles={handleFiles}
							hint="Excel do Tesouro Gerencial (.xlsx, .xls) ou CSV"
							columns={["UG", "Conta Contábil", "Conta Corrente", "Saldo - R$"]}
							isLoading={isLoading}
						/>
					}
					error={error}
				/>
			) : (
				<Report data={reportData} />
			)}
		</HubLayout>
	)
}

/**
 * O que a ferramenta faz com a planilha. Último bloco da tela inicial: é a
 * única parte que se pode ler depois de já ter enviado o arquivo.
 */
const ANALYSIS_NOTES = [
	{
		icon: Scale,
		title: "O que é analisado",
		text: "Apenas a UG 120052 deve ter saldo na conta 897210300. Qualquer outra UG com saldo nessa conta é apontada como inconsistência.",
	},
	{
		icon: FileSearch,
		title: "O que é descartado",
		text: "Linhas em branco ou sem as colunas obrigatórias são ignoradas na leitura, e não entram na contagem do relatório.",
	},
	{
		icon: MessageSquare,
		title: "O que sai da análise",
		text: "O relatório separa as UGs conformes das divergentes e reúne, por UG, os valores que sustentam o apontamento.",
	},
] as const

/**
 * Função contábil das duas contas confrontadas.
 *
 * Fechado por padrão: quem opera a ferramenta toda competência já sabe: é para
 * quem chega pela primeira vez. Fica dentro do referencial do RAC porque é isso
 * que é — antes ocupava um acordeão próprio, com cabeçalho próprio, acima da
 * zona de envio.
 */
function AccountFunctions() {
	return (
		<details className="group rounded-lg border border-border bg-muted/50">
			<summary className="cursor-pointer list-none px-4 py-3 text-subheading text-foreground marker:content-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
				Função contábil das contas confrontadas
				<span className="ml-2 text-caption text-muted-foreground group-open:hidden">mostrar</span>
				<span className="ml-2 text-caption text-muted-foreground hidden group-open:inline">ocultar</span>
			</summary>
			<div className="space-y-6 border-t border-border px-4 py-4 text-body text-foreground leading-relaxed">
				<AccountFunction
					code="897210300"
					name="EM COBRANÇA"
					purpose="Registra o montante da responsabilidade da Unidade Gestora com terceiros por valores, títulos e bens em fase de cobrança pelos beneficiados."
					debited="Pela apropriação da baixa com responsabilidade ou pelo encerramento do exercício."
					credited="Pela apropriação da responsabilidade com terceiros ou pelos estornos efetuados com a negativação parcial ou total dos valores."
				/>
				<AccountFunction
					code="897110300"
					name="EM COBRANÇA - A RECEBER"
					purpose="Registra o montante da responsabilidade de terceiros por valores, títulos e bens em fase de cobrança pela Unidade Gestora."
					debited="Pela apropriação da baixa da responsabilidade ou pelo encerramento do exercício."
					credited="Pela apropriação da responsabilidade de terceiros ou pelos estornos efetuados com a negativação parcial ou total dos valores."
				/>
			</div>
		</details>
	)
}

function AccountFunction({ code, name, purpose, debited, credited }: { code: string; name: string; purpose: string; debited: string; credited: string }) {
	return (
		<div>
			<h4 className="mb-2 flex items-center gap-2 text-subheading text-foreground">
				<span className="rounded border border-border bg-card px-2 py-0.5 font-mono text-caption text-muted-foreground">{code}</span>
				{name}
			</h4>
			<p className="mb-2 text-caption text-muted-foreground">{purpose}</p>
			<ul className="list-disc space-y-1 pl-5 text-caption text-muted-foreground">
				<li>
					<strong className="text-foreground">Debitada:</strong> {debited}
				</li>
				<li>
					<strong className="text-foreground">Creditada:</strong> {credited}
				</li>
			</ul>
		</div>
	)
}
