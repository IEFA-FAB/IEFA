import { useMutation } from "@tanstack/react-query"
import { AlertTriangle, Check, Copy, Download, FileText, Loader2, Sparkles } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import {
	buildGroupRows,
	buildInterOmRows,
	buildOffenderRows,
	buildPreviewRows,
	buildSummaryRows,
	buildTrendRows,
	describeTimeFilter,
	SCOPE_LABEL,
} from "#/auditor/services/analytic-note-view"
import type { ReportDataset } from "#/auditor/services/report"
import { generateAnalyticNote } from "#/auditor/services/report-client"
import { NOTE_TITLE } from "#/auditor/services/report-markdown"
import { toAnalyticNoteRequest } from "#/auditor/services/report-request"
import type { AnalyticNote } from "#/auditor/services/report-schema"
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert"
import { Button } from "#/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "#/components/ui/dialog"
import { SectionHeader } from "#/components/ui/section-header"
import { toast } from "#/components/ui/toast"

interface AnalyticNoteModalProps {
	isOpen: boolean
	onClose: () => void
	/** Recorte da competência em análise. `null` enquanto a tela não tem série. */
	dataset: ReportDataset | null
}

// `GROUP_LABEL`, `SCOPE_LABEL`, `groupLabel` e `percent` foram para
// services/analytic-note-view.ts, junto com as linhas das tabelas que os usam.

function NoteTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
	return (
		<div className="overflow-x-auto rounded-lg border border-border">
			<table className="w-full border-collapse">
				<thead className="bg-muted/50">
					<tr>
						{head.map((label) => (
							<th key={label} className="whitespace-nowrap px-3 py-2 text-left text-label text-muted-foreground">
								{label}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((cells, rowIndex) => (
						// As linhas não têm identificador estável (o par UG × grupo pode repetir
						// entre escopos), então o índice é a chave honesta aqui: a tabela é
						// estática e nunca reordena depois de montada.
						<tr key={rowIndex} className="border-border border-t">
							{cells.map((cell, cellIndex) => (
								<td key={cellIndex} className="whitespace-nowrap px-3 py-2 text-body text-foreground">
									{cell}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}

/** Parágrafos do modelo. Markdown simples: o que chega é texto com quebras. */
function Prose({ text }: { text: string }) {
	const paragraphs = text
		.split(/\n{2,}/)
		.map((p) => p.trim())
		.filter(Boolean)

	if (paragraphs.length === 0) {
		return <p className="text-body text-muted-foreground">O modelo não produziu texto para esta seção.</p>
	}

	return (
		<div className="space-y-3">
			{/* Chave posicional: o texto é do modelo e dois parágrafos podem abrir igual
			    ("Cabe registrar que…"), o que colapsaria os dois num só. */}
			{paragraphs.map((paragraph, index) => (
				<p key={index} className="text-body text-foreground leading-relaxed">
					{paragraph}
				</p>
			))}
		</div>
	)
}

/** Recorte que o cabeçalho descreve: competência · escopo · hierarquia. */
function NoteScopeLine({ source }: { source: ReportDataset }) {
	return (
		<p className="mt-1 text-caption text-muted-foreground">
			{source.competenceLabel} · {describeTimeFilter(source.timeFilter)} · {source.scopeLabel}
		</p>
	)
}

/** Copiar e baixar o Markdown da nota gerada. */
function ResultActions({ copied, onCopy, onDownload }: { copied: boolean; onCopy: () => void; onDownload: () => void }) {
	return (
		<>
			<Button variant="outline" size="sm" onClick={onCopy}>
				{copied ? <Check className="size-4" /> : <Copy className="size-4" />}
				{copied ? "Copiado" : "Copiar Markdown"}
			</Button>
			<Button variant="outline" size="sm" onClick={onDownload}>
				<Download className="size-4" />
				Baixar .md
			</Button>
		</>
	)
}

interface NotePreviewProps {
	dataset: ReportDataset
	isPending: boolean
	isError: boolean
	error: Error | null
	onInterrupt: () => void
	onGenerate: () => void
}

/** Resumo do que vai ao modelo e o botão que dispara a geração. */
function NotePreview({ dataset, isPending, isError, error, onInterrupt, onGenerate }: NotePreviewProps) {
	return (
		<div className="mx-auto max-w-2xl space-y-5">
			<SectionHeader
				title="O que será analisado"
				description="A nota é redigida por modelo de linguagem sobre este recorte. Os valores e as tabelas são calculados pelo sistema."
			/>

			<NoteTable head={["Item", "Valor"]} rows={buildPreviewRows(dataset)} />

			<Alert variant="info">
				<Sparkles />
				<AlertTitle>Texto gerado por IA — revisão obrigatória</AlertTitle>
				<AlertDescription>
					O modelo interpreta os números; ele não os produz. Ainda assim, a nota sai assinada pela SUCONT-4 e precisa ser lida antes de qualquer encaminhamento.
				</AlertDescription>
			</Alert>

			<div className="flex justify-end gap-2">
				{isPending ? (
					<Button variant="outline" onClick={onInterrupt}>
						Interromper
					</Button>
				) : null}
				<Button onClick={onGenerate} disabled={isPending}>
					{isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
					{isPending ? "Redigindo a nota…" : "Gerar nota analítica"}
				</Button>
			</div>

			{isError && !(error instanceof DOMException) && (
				<Alert variant="destructive">
					<AlertTriangle />
					<AlertTitle>A nota não foi gerada</AlertTitle>
					<AlertDescription>{error instanceof Error ? error.message : "Erro desconhecido"}</AlertDescription>
				</Alert>
			)}
		</div>
	)
}

/** A nota gerada: tabelas do sistema intercaladas com a prosa do modelo. */
function NoteArticle({ snapshot, note }: { snapshot: ReportDataset; note: AnalyticNote }) {
	return (
		<article className="space-y-8">
			<section className="space-y-3">
				<SectionHeader title="1. Sumário executivo e diagnóstico" />
				<NoteTable head={["Indicador", "Valor"]} rows={buildSummaryRows(snapshot)} />
				<Prose text={note.sumarioExecutivo} />
			</section>

			<section className="space-y-3">
				<SectionHeader title={`2. Unidades críticas — as ${snapshot.topOffenders.length} maiores divergências`} />
				<NoteTable head={["UG", "Cód.", "Grupo", "Divergência", "SIAFI", "SILOMS", "Situação", "Risco"]} rows={buildOffenderRows(snapshot.topOffenders)} />
				<Prose text={note.leituraUnidadesCriticas} />
			</section>

			<section className="space-y-3">
				<SectionHeader title="3. Destaques de alerta" />
				{note.destaquesDeAlerta.length === 0 ? (
					<p className="text-body text-muted-foreground">O modelo não produziu destaques para esta competência.</p>
				) : (
					<div className="grid gap-3">
						{note.destaquesDeAlerta.map((highlight, index) => (
							// Chave posicional: o título vem do modelo e pode repetir.
							<div key={index} className="rounded-lg border border-border bg-card p-4">
								<h3 className="text-subheading text-foreground">
									3.{index + 1} {highlight.titulo}
									{highlight.unidade && <span className="text-muted-foreground"> — {highlight.unidade}</span>}
								</h3>
								<p className="mt-2 text-body text-foreground leading-relaxed">{highlight.analise}</p>
								<p className="mt-2 text-body text-foreground">
									<span className="text-label text-muted-foreground">Ação recomendada </span>
									{highlight.acaoRecomendada}
								</p>
							</div>
						))}
					</div>
				)}
			</section>

			{snapshot.interOm.length > 0 && (
				<section className="space-y-3">
					<SectionHeader title="3-A. Possíveis transferências entre OMs sem contrapartida no SILOMS" />
					<NoteTable head={["Unidade A", "Unidade B", "Grupo", "Valor do movimento", "Resíduo do casamento"]} rows={buildInterOmRows(snapshot.interOm)} />
					<Alert variant="warning">
						<AlertTriangle />
						<AlertTitle>Hipótese para conferência, não constatação</AlertTitle>
						<AlertDescription>
							As unidades acima tiveram movimento de SIAFI em sentidos opostos e magnitude equivalente na competência, com o SILOMS praticamente parado nas
							duas. Duas movimentações independentes de valor próximo produzem o mesmo padrão — confirme pelas Notas de Lançamento antes de cobrar.
						</AlertDescription>
					</Alert>
				</section>
			)}

			<section className="space-y-4">
				<SectionHeader title="4. Dinâmica de tendências e evolução" />
				<Prose text={note.leituraTendencias} />
				{snapshot.trends.map((scope) => (
					<div key={scope.scope} className="space-y-3">
						<h3 className="text-subheading text-foreground">{SCOPE_LABEL[scope.scope] ?? scope.scope}</h3>
						<p className="text-label text-muted-foreground">Agravamento</p>
						{scope.worsening.length === 0 ? (
							<p className="text-body text-muted-foreground">Nenhuma unidade aumentou a divergência neste escopo.</p>
						) : (
							<NoteTable head={["UG", "Cód.", "Grupo", "Variação", "%", "Atual", "Anterior"]} rows={buildTrendRows(scope.worsening)} />
						)}
						<p className="text-label text-muted-foreground">Melhoria</p>
						{scope.improving.length === 0 ? (
							<p className="text-body text-muted-foreground">Nenhuma unidade reduziu a divergência neste escopo.</p>
						) : (
							<NoteTable head={["UG", "Cód.", "Grupo", "Variação", "%", "Atual", "Anterior"]} rows={buildTrendRows(scope.improving)} />
						)}
					</div>
				))}
			</section>

			<section className="space-y-3">
				<SectionHeader title="5. Gargalos por natureza de bem" />
				<NoteTable head={["Grupo", "Divergência", "SIAFI", "SILOMS", "UGs"]} rows={buildGroupRows(snapshot.groups)} />
				<Prose text={note.leituraGrupos} />
			</section>

			<section className="space-y-3">
				<SectionHeader title="6. Plano de ação e recomendações estratégicas" />
				{note.planoDeAcao.length === 0 ? (
					<p className="text-body text-muted-foreground">O modelo não produziu recomendações para esta competência.</p>
				) : (
					<ol className="ml-5 list-decimal space-y-2">
						{note.planoDeAcao.map((item, index) => (
							// Chave posicional: a recomendação vem do modelo e pode repetir.
							<li key={index} className="text-body text-foreground leading-relaxed">
								{item}
							</li>
						))}
					</ol>
				)}
			</section>

			<section className="space-y-3">
				<SectionHeader title="7. Conclusão" />
				<Prose text={note.conclusao} />
			</section>

			<Alert variant="info">
				<Sparkles />
				<AlertTitle>Texto gerado por IA — revisão obrigatória</AlertTitle>
				<AlertDescription>
					Os valores e as tabelas acima são calculados pelo sistema. O texto analítico é do modelo e exige revisão antes de qualquer encaminhamento.
				</AlertDescription>
			</Alert>
		</article>
	)
}

/**
 * Nota Analítica Estratégica da competência.
 *
 * Abre num resumo do que será analisado e só chama o modelo quando o operador
 * confirma: a geração custa uma chamada ao Bedrock e conta no teto do usuário, e
 * um modal que dispara sozinho ao abrir gasta isso por engano de clique.
 *
 * As tabelas abaixo são desenhadas a partir do `dataset` — o MESMO recorte que foi
 * ao modelo e que o servidor imprimiu no Markdown. O modelo só preenche a prosa
 * entre elas; nenhum valor exibido aqui passou por ele.
 */
export function AnalyticNoteModal({ isOpen, onClose, dataset }: AnalyticNoteModalProps) {
	const [copied, setCopied] = useState(false)
	const abortRef = useRef<AbortController | null>(null)

	const mutation = useMutation({
		mutationFn: async (input: ReportDataset) => {
			abortRef.current?.abort()
			const controller = new AbortController()
			abortRef.current = controller
			const generated = await generateAnalyticNote(toAnalyticNoteRequest(input), controller.signal)
			// O recorte volta JUNTO com a nota, e é dele que as tabelas abaixo são
			// desenhadas. A prop `dataset` é viva: a série é `useQuery`, e um refetch
			// em segundo plano moveria os números da tela para longe da prosa que os
			// interpreta — e para longe do Markdown que o operador acabou de baixar.
			return { ...generated, dataset: input }
		},
		onError: (error) => {
			// Cancelamento é ato do operador (fechou o modal, mandou interromper), não
			// falha: anunciá-lo como erro ensinaria a desconfiar do aviso que importa.
			if (error instanceof DOMException && error.name === "AbortError") return
			toast.error(error instanceof Error ? error.message : "Falha ao gerar a nota analítica")
		},
	})

	const { reset } = mutation

	// Fechar o modal aborta a geração em curso. Sem isto o modelo termina a nota
	// inteira do lado do servidor e o consumo entra no teto por um documento que
	// ninguém vai ler.
	useEffect(() => {
		if (isOpen) return
		abortRef.current?.abort()
		abortRef.current = null
		reset()
		setCopied(false)
	}, [isOpen, reset])

	// Sair da rota com a nota em geração é a mesma coisa que fechar o modal, e o
	// efeito acima não alcança esse caso: ele só roda quando `isOpen` muda, e sair
	// da tela desmonta a árvore inteira sem passar por lá. Sem esta limpeza o
	// servidor levava a run de 8 mil tokens até o fim, no teto do usuário.
	useEffect(() => () => abortRef.current?.abort(), [])

	const result = mutation.data ?? null
	const note: AnalyticNote | null = result?.note ?? null
	/** Recorte congelado no momento da geração. Ver o comentário do `mutationFn`. */
	const snapshot = result?.dataset ?? null
	const headerSource = snapshot ?? dataset

	const handleCopy = async () => {
		if (!result) return
		try {
			await navigator.clipboard.writeText(result.markdown)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch {
			toast.error("Não foi possível copiar — selecione o texto e copie manualmente")
		}
	}

	const handleDownload = () => {
		if (!result || !snapshot) return
		const blob = new Blob([result.markdown], { type: "text/markdown;charset=utf-8" })
		const url = URL.createObjectURL(blob)
		const anchor = document.createElement("a")
		anchor.href = url
		anchor.download = `nota-analitica-siafi-siloms-${snapshot.competence}.md`
		// Anexada ao documento e revogada no tique seguinte: revogar o blob na mesma
		// volta do laço de eventos corre com a leitura do arquivo pelo navegador, e a
		// nota — que passa de 30 KB — falha ao baixar sem erro nenhum.
		anchor.style.display = "none"
		document.body.appendChild(anchor)
		anchor.click()
		setTimeout(() => {
			anchor.remove()
			URL.revokeObjectURL(url)
		}, 0)
	}

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="flex h-[88vh] w-[calc(100%-2rem)] max-w-5xl flex-col gap-0 p-0">
				<div className="flex items-center justify-between gap-4 border-border border-b bg-muted/50 px-5 py-4">
					<div className="min-w-0">
						<DialogTitle className="flex items-center gap-2 text-heading text-foreground">
							<FileText className="size-5 shrink-0 text-action" />
							<span className="truncate">{NOTE_TITLE}</span>
						</DialogTitle>
						{/* Depois de gerada, o cabeçalho descreve o recorte que a produziu — não o que a tela tem agora. */}
						{headerSource && <NoteScopeLine source={headerSource} />}
					</div>
					<div className="flex shrink-0 items-center gap-2">
						{result && <ResultActions copied={copied} onCopy={handleCopy} onDownload={handleDownload} />}
						<Button variant="ghost" size="sm" onClick={onClose}>
							Fechar
						</Button>
					</div>
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
					{!dataset && (
						<Alert variant="warning">
							<AlertTriangle />
							<AlertTitle>Nenhuma competência selecionada</AlertTitle>
							<AlertDescription>Escolha uma competência com saldos carregados para gerar a nota.</AlertDescription>
						</Alert>
					)}

					{dataset && !result && (
						<NotePreview
							dataset={dataset}
							isPending={mutation.isPending}
							isError={mutation.isError}
							error={mutation.error}
							onInterrupt={() => {
								abortRef.current?.abort()
								mutation.reset()
							}}
							onGenerate={() => dataset && mutation.mutate(dataset)}
						/>
					)}

					{snapshot && result && note && <NoteArticle snapshot={snapshot} note={note} />}
				</div>
			</DialogContent>
		</Dialog>
	)
}
