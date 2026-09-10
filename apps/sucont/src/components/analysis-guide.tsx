import { CircleHelp, type LucideIcon } from "lucide-react"
import type React from "react"
import { Button } from "#/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "#/components/ui/sheet"

export interface AnalysisNote {
	icon: LucideIcon
	title: string
	text: string
}

/**
 * Orientações da ferramenta — onde extrair o relatório, o referencial do RAC e
 * o que a ferramenta faz com o arquivo — numa gaveta à direita, aberta por um
 * botão no cabeçalho da página.
 *
 * Ficavam na tela inicial, abaixo da zona de envio, em três cards. Padronizadas,
 * passaram a ser as MESMAS três cards em sete telas, e quem usa a ferramenta
 * toda competência rolava por elas todo dia para chegar a lugar nenhum: a
 * informação é de primeira visita. Na gaveta, ela está a um clique — inclusive
 * DEPOIS de carregar a planilha, que é quando "onde extraio isto?" costuma
 * surgir de novo.
 *
 * Fechada por padrão, sempre, e sem lembrar nada: um estado "já vi" precisaria
 * de chave de `localStorage`, e chave nova sem inventário na Política de Cookies
 * derruba a `main` (foi o caso do `sucont:saram-dismissed`). O botão fica
 * sempre no mesmo lugar; quem precisa abre.
 */
interface AnalysisGuideProps {
	/** Onde obter o arquivo. Normalmente `<TesouroGerencialPath />`. */
	source?: React.ReactNode
	/** Referencial normativo. Normalmente `<RacReference />`. */
	reference?: React.ReactNode
	/** O que é analisado, o que é gerado, como se lê. */
	notes?: readonly AnalysisNote[]
}

export function AnalysisGuide({ source, reference, notes }: AnalysisGuideProps) {
	return (
		<Sheet>
			<SheetTrigger render={<Button type="button" variant="outline" size="sm" />}>
				<CircleHelp />
				Orientações
			</SheetTrigger>
			<SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
				<SheetHeader>
					<SheetTitle>Orientações da ferramenta</SheetTitle>
					<SheetDescription>O que a ferramenta recebe, o que a norma pede e o que sai da análise.</SheetDescription>
				</SheetHeader>
				<div className="flex flex-col gap-4 px-4 pb-6">
					{source}
					{reference}
					{notes && notes.length > 0 && (
						<ul className="flex flex-col gap-3">
							{notes.map(({ icon: Icon, title, text }) => (
								<li key={title} className="flex gap-3 rounded-xl border border-border bg-card p-4">
									<div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
										<Icon className="size-4" />
									</div>
									<div className="min-w-0">
										<h3 className="text-subheading text-foreground">{title}</h3>
										<p className="mt-1 text-caption leading-relaxed text-muted-foreground">{text}</p>
									</div>
								</li>
							))}
						</ul>
					)}
				</div>
			</SheetContent>
		</Sheet>
	)
}
