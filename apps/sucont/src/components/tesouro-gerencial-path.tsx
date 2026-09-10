import { ChevronRight, Map as MapIcon } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card"

/**
 * Caminho do relatório de acompanhamento contábil no Tesouro Gerencial.
 *
 * A mesma trilha, com as mesmas dez etapas, estava escrita à mão em quatro
 * telas: uma como `<span>` separados por `>` literal, outra com `ChevronRight`
 * entre pílulas, outra como bloco `font-mono` dentro de um acordeão e a quarta
 * como fita horizontal com rolagem e a última etapa pintada de azul sólido.
 * Quatro fontes para a mesma decisão, livres para divergir sem ninguém notar —
 * e uma delas já divergia (parava em "SUCONT-3 - ACOMPANHAMENTO").
 */
const TESOURO_GERENCIAL_PATH = [
	"TESOURO GERENCIAL",
	"Relatórios Compartilhados",
	"Consultas Gerenciais",
	"Relatórios de Bancada dos Órgãos Superiores",
	"52000 - Ministério da Defesa",
	"52111 - Comando da Aeronáutica",
	"SEFA",
	"DIREF",
	"SUCONT-3 - ACOMPANHAMENTO",
	"ACOMPANHAMENTO CONTÁBIL - SUCONT-3.1",
] as const

interface TesouroGerencialPathProps {
	/** Uma linha antes da trilha, quando a extração tem alguma condição. */
	note?: string
}

export function TesouroGerencialPath({ note }: TesouroGerencialPathProps) {
	const steps = TESOURO_GERENCIAL_PATH
	const lastIndex = steps.length - 1

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<MapIcon className="h-4 w-4 text-muted-foreground" />
					Onde extrair o relatório
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3">
				{note && <p className="text-caption text-muted-foreground">{note}</p>}
				<ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
					{steps.map((step, index) => (
						<li key={step} className="flex items-center gap-1.5">
							<span
								className={
									index === lastIndex
										? "rounded-md border border-action/30 bg-action/10 px-2 py-1 text-caption font-semibold text-action"
										: "rounded-md border border-border bg-muted/50 px-2 py-1 text-caption text-muted-foreground"
								}
							>
								{step}
							</span>
							{index < lastIndex && <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />}
						</li>
					))}
				</ol>
			</CardContent>
		</Card>
	)
}
