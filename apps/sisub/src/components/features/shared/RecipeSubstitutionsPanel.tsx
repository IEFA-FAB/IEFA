import { ArrowLeftRight, ChevronRight } from "lucide-react"
import { useMemo, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item"
import { cn } from "@/lib/cn"
import { SubstitutionsManager } from "./SubstitutionsManager"

/** O que o painel precisa de uma linha da ficha técnica. */
export interface RecipeSubstitutionTarget {
	ingredientId: string | null
	name: string
	measureUnit: string
	/** Pasta do insumo — universo dos candidatos a substituto. */
	folderId: string | null
}

interface RecipeSubstitutionsPanelProps {
	ingredients: readonly RecipeSubstitutionTarget[]
}

/**
 * Substituições dentro da PREPARAÇÃO — a aba que o SISUBWEB tinha e que o SISUB havia
 * movido para o cadastro do insumo.
 *
 * Quem decide que "arroz parboilizado entra no lugar de arroz branco" está montando uma
 * ficha técnica, não editando o cadastro de um insumo; procurar essa lista em
 * `/global/ingredients/:id` obrigava a sair da receita, achar o insumo e voltar.
 *
 * O DADO não mudou de lugar: continua em `kitchen.ingredient_substitution`, direcional,
 * insumo → substituto. Ou seja, o que se define aqui vale para o insumo em TODAS as
 * preparações que o usam — o aviso no topo diz isso, porque a tela é por preparação e a
 * gravação não é. Uma substituição por linha de receita exigiria a tabela por linha que
 * a migração de 2026-07 aposentou (`recipe_ingredient_alternatives`).
 */
export function RecipeSubstitutionsPanel({ ingredients }: RecipeSubstitutionsPanelProps) {
	// Memoizado: a lista entra na dependência do efeito abaixo, e recriá-la a cada render
	// faria o efeito rodar em todo ciclo de digitação do formulário.
	const selectable = useMemo(() => ingredients.filter((i): i is RecipeSubstitutionTarget & { ingredientId: string } => !!i.ingredientId), [ingredients])
	const [selectedId, setSelectedId] = useState<string | null>(null)

	// Derivado, não sincronizado por efeito: remover o insumo da ficha faz o `find` falhar
	// e o painel de baixo some no MESMO render. Um `useEffect` que zerasse `selectedId`
	// deixaria um quadro com o insumo que já não está na preparação.
	const selected = selectable.find((i) => i.ingredientId === selectedId) ?? null

	if (selectable.length === 0) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Substituições</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border py-12 text-muted-foreground">
						<ArrowLeftRight className="size-10 opacity-30" />
						<p className="text-body">Nenhum ingrediente na ficha técnica</p>
						<p className="text-caption">Adicione ingredientes na aba Ingredientes para definir substituições.</p>
					</div>
				</CardContent>
			</Card>
		)
	}

	return (
		<div className="space-y-4">
			<Alert>
				<ArrowLeftRight className="size-4" />
				<AlertTitle>A substituição vale para o insumo, não só para esta preparação</AlertTitle>
				<AlertDescription>
					A lista é gravada no insumo (<code>ingredient_substitution</code>) e salva sozinha. Habilitar um substituto aqui o habilita em toda preparação que use
					o mesmo insumo.
				</AlertDescription>
			</Alert>

			<Card>
				<CardHeader>
					<CardTitle>Ingrediente</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2">
					{selectable.map((item) => {
						const isSelected = item.ingredientId === selectedId
						return (
							<Item
								key={item.ingredientId}
								variant="outline"
								className={cn("cursor-pointer transition-colors", isSelected ? "border-primary/40 bg-primary/5" : "hover:bg-muted/40")}
								onClick={() => setSelectedId(isSelected ? null : item.ingredientId)}
							>
								<ItemContent>
									<ItemTitle>{item.name}</ItemTitle>
									{item.measureUnit && <ItemDescription>{item.measureUnit}</ItemDescription>}
								</ItemContent>
								<ItemActions>
									{isSelected ? <Badge variant="secondary">Selecionado</Badge> : <ChevronRight className="size-4 text-muted-foreground" />}
								</ItemActions>
							</Item>
						)
					})}
				</CardContent>
			</Card>

			{selected && (
				<Card>
					<CardContent className="pt-6">
						{/* `key` no insumo: trocar de linha descarta as edições pendentes do fator em
						    vez de carregá-las para o insumo seguinte. */}
						<SubstitutionsManager key={selected.ingredientId} ingredientId={selected.ingredientId} folderId={selected.folderId} />
					</CardContent>
				</Card>
			)}
		</div>
	)
}
