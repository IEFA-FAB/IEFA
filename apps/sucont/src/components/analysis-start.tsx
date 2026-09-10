import { AlertCircle, type LucideIcon } from "lucide-react"
import type React from "react"
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert"
import { Card, CardContent } from "#/components/ui/card"
import { cn } from "#/lib/utils"

export interface AnalysisNote {
	icon: LucideIcon
	title: string
	text: string
}

/**
 * Tela inicial de uma ferramenta de análise: a ordem, uma vez só.
 *
 * As sete ferramentas que começam por enviar uma planilha abriam em sete ordens
 * diferentes. O cruzamento punha título, enunciado do RAC e dois acordeões ANTES
 * da zona de envio — quem já sabia o que ia fazer rolava três dobras para achar
 * o campo. A compatibilidade abria por três cartões explicativos e escondia o
 * envio dentro de um card no fim. O subitens começava pelo envio, o monitoramento
 * também, mas com o resto em outra sequência. Nenhuma dessas ordens estava
 * errada por si; o que estava errado era haver sete.
 *
 * A ordem daqui em diante, e o motivo de cada degrau:
 *
 * 1. **A tarefa** — a zona de envio. Quem chega já sabe o que veio fazer; o
 *    campo é a primeira coisa na tela, sem rolagem.
 * 2. **A falha** — imediatamente sob o campo, porque é sobre o campo que ela
 *    fala. Erro no rodapé faz o operador reenviar o mesmo arquivo sem saber.
 * 3. **Onde consigo o arquivo** — o único obstáculo real de quem NÃO pode
 *    seguir: não tem a planilha. Vem antes da teoria porque desbloqueia.
 * 4. **Por que a norma pede** — o referencial do RAC. Justifica o trabalho, não
 *    o destrava; quem já sabe passa por cima.
 * 5. **O que a ferramenta faz com o arquivo** — os cartões de apoio, por último.
 *    É a única parte que o usuário pode ler DEPOIS de já ter enviado.
 *
 * A largura é fixa e menor que a do conteúdo, inclusive nas telas `wide`: o
 * resultado é tabela e precisa da folha inteira, mas o formulário de entrada de
 * um campo, não.
 */
interface AnalysisStartProps {
	/** A zona de envio. Normalmente `<FileDropzone />`. */
	dropzone: React.ReactNode
	/** Mensagem de falha da leitura. `null` quando não houve. */
	error?: string | null
	errorTitle?: string
	/** Onde obter o arquivo. Normalmente `<TesouroGerencialPath />`. */
	source?: React.ReactNode
	/** Referencial normativo. Normalmente `<RacReference />`. */
	reference?: React.ReactNode
	/** Cartões de apoio: o que é analisado, o que é gerado. */
	notes?: readonly AnalysisNote[]
	/**
	 * Conteúdo entre a zona de envio e a fonte do arquivo — lista de arquivos
	 * escolhidos, botão de carregar. Só o que pertence ao ato de enviar.
	 */
	children?: React.ReactNode
}

export function AnalysisStart({ dropzone, error, errorTitle = "Não foi possível ler o arquivo", source, reference, notes, children }: AnalysisStartProps) {
	return (
		<div className="mx-auto w-full max-w-4xl space-y-6">
			{dropzone}

			{error && (
				<Alert variant="destructive">
					<AlertCircle />
					<AlertTitle>{errorTitle}</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			{children}

			{source}

			{reference}

			{notes && notes.length > 0 && (
				<div className={cn("grid gap-4", notes.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3")}>
					{notes.map(({ icon: Icon, title, text }) => (
						<Card key={title}>
							<CardContent className="space-y-3">
								{/*
								 * Uma superfície só para os três ícones. Antes cada cartão
								 * escolhia a sua — `bg-action/15`, `bg-success/10`,
								 * `bg-action/10` — e a cor não distinguia nada: os três
								 * cartões são do mesmo tipo. Cor que não separa só faz a
								 * grade parecer três produtos.
								 */}
								<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
									<Icon className="h-5 w-5" />
								</div>
								<h3 className="text-heading text-foreground">{title}</h3>
								<p className="text-caption text-muted-foreground leading-relaxed">{text}</p>
							</CardContent>
						</Card>
					))}
				</div>
			)}
		</div>
	)
}
