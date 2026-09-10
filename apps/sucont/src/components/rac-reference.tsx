import { useRouterState } from "@tanstack/react-router"
import { BookOpen } from "lucide-react"
import type React from "react"
import { Badge } from "#/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card"
import { sucontTools } from "#/lib/data"
import { formatRacQuestions } from "#/lib/rac"
import { findToolByPath } from "#/lib/tool-nav"

/**
 * Referencial normativo da ferramenta: a questão do RAC que ela responde e o
 * porquê contábil da verificação.
 *
 * Três telas explicavam isso, e nenhuma do mesmo jeito: uma como painel tintado
 * de azul com o enunciado inteiro em destaque, outra como card de 8 de padding
 * com ícone de escudo e três sub-cartões, a terceira diluído em cartões soltos
 * ao lado de "o que a ferramenta faz". O texto dos três blocos (objetivo, risco
 * e importância) era quase o mesmo em duas delas, reescrito.
 *
 * A questão NÃO é digitada aqui: sai do catálogo, pela rota, que é a mesma
 * fonte da pílula ao lado da trilha. Enquanto era texto na tela, a ferramenta de
 * cruzamento anunciava "Questão 22" num lugar e o card do catálogo dizia outra
 * coisa sem que nada acusasse.
 */
interface RacReferenceProps {
	/** Enunciado da questão. Só cabe quando a ferramenta responde a uma. */
	statement?: string
	/** O que a análise procura. */
	objective: string
	/** O que a inconsistência esconde ou provoca. */
	risk: string
	/** O que a regularização preserva. */
	importance: string
	/** Questões cobertas. Padrão: as do catálogo. Passar só fora de rota de ferramenta. */
	questions?: readonly number[]
	/**
	 * Detalhe normativo extra, depois dos três blocos — a função contábil das
	 * contas analisadas, por exemplo. Fica aqui, e não num painel à parte, porque
	 * é referência: a tela não ganha nada abrindo uma seção nova para ela.
	 */
	children?: React.ReactNode
}

export function RacReference({ statement, objective, risk, importance, questions, children }: RacReferenceProps) {
	const pathname = useRouterState({ select: (s) => s.location.pathname })
	const tool = findToolByPath(sucontTools, pathname)
	const scope = formatRacQuestions(questions ?? tool?.racQuestions)

	const blocks = [
		{ title: "Objetivo da análise", text: objective },
		{ title: "Risco contábil", text: risk },
		{ title: "Importância", text: importance },
	]

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<BookOpen className="h-4 w-4 text-muted-foreground" />
					Referencial metodológico (RAC)
					{scope && <Badge variant="action">{scope}</Badge>}
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{/* Sem prefixo de questão: a pílula do cabeçalho já a nomeia, e a trilha
				    do `HubLayout` também — prefixar o enunciado seria a terceira vez na
				    mesma dobra. */}
				{statement && <p className="text-body text-foreground leading-relaxed">{statement}</p>}
				<div className="grid gap-4 md:grid-cols-3">
					{blocks.map((block) => (
						<div key={block.title} className="rounded-lg border border-border bg-muted/50 p-4">
							<h3 className="mb-2 text-label text-foreground">{block.title}</h3>
							<p className="text-caption text-muted-foreground leading-relaxed">{block.text}</p>
						</div>
					))}
				</div>
				{children}
			</CardContent>
		</Card>
	)
}
