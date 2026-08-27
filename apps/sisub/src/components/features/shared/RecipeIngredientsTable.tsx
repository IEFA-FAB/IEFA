import { ArrowLeftRight, ChevronDown, ChevronRight, Circle, CircleCheck, Plus, Trash2 } from "lucide-react"
import { Fragment, useId, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Toggle } from "@/components/ui/toggle"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/cn"
import {
	correctionFactorFromGross,
	formatSheetNumber,
	fromStoredQuantity,
	portionYieldOrOne,
	type QuantityBasis,
	rehydrationIndexFromRehydrated,
	roundSheetQuantity,
	technicalSheetLine,
	technicalSheetTotals,
	toStoredQuantity,
} from "@/lib/technical-sheet"
import type { RecipeAlternativeFormRow } from "@/types/domain/recipes"
import { IngredientSelector } from "./IngredientSelector"

/** Linha da ficha como o formulário a mantém. Espelha `IngredientFormItem` do `RecipeForm`. */
export interface RecipeIngredientRow {
	ingredient_id: string | null
	ingredient_name: string
	measure_unit: string
	folder_id: string | null
	net_quantity: number | null
	is_optional: boolean
	priority_order: number
	correction_factor: number | null
	rehydration_index: number | null
	/** Substitutos desta linha, cadastrados na expansão dela. */
	alternatives: RecipeAlternativeFormRow[]
}

interface RecipeIngredientsTableProps {
	ingredients: RecipeIngredientRow[]
	/** Rendimento em porções — divisor do per capita. */
	portionYield: number
	/**
	 * Em qual das duas colunas de peso líquido o usuário digita. O que é GRAVADO é sempre
	 * o total (ver `toStoredQuantity`); a base só decide qual célula é o campo e qual é o
	 * número derivado.
	 */
	quantityBasis: QuantityBasis
	onQuantityBasisChange: (basis: QuantityBasis) => void
	onChange: (next: RecipeIngredientRow[]) => void
	onAdd: () => void
	/** Erros do campo `ingredients` como um todo (ex.: lista vazia). */
	errors: Array<{ message?: string }>
	/** Erro por linha/campo, calculado pelo formulário contra o schema do submit. */
	rowErrors?: (row: RecipeIngredientRow) => Partial<Record<keyof RecipeIngredientRow, string>>
}

/** Colunas do corpo da tabela — a linha expandida ocupa todas com um `colSpan`. */
const COLUMN_COUNT = 10

/**
 * Um candidato a ocupar a linha: o insumo principal (índice 0) ou um dos substitutos.
 * A ficha executa UM deles, nunca a soma — daí a linha exibir um por vez.
 */
interface Candidate {
	name: string
	unit: string
	quantity: number | null
	/** `true` no principal; os demais são substitutos e podem ser removidos. */
	isPrimary: boolean
}

function candidatesOf(row: RecipeIngredientRow): Candidate[] {
	return [
		{ name: row.ingredient_name, unit: row.measure_unit, quantity: row.net_quantity, isPrimary: true },
		...row.alternatives.map((alt) => ({ name: alt.ingredient_name, unit: alt.measure_unit, quantity: alt.net_quantity, isPrimary: false })),
	]
}

/**
 * PARTE 02 da Ficha Técnica de Preparação, no formato do modelo oficial da SIA
 * (`docs/examples/Modelo_FTP_SIA.pdf`): uma TABELA com `Ingrediente | Unidade` e a faixa
 * `PER CAPITA` cobrindo `PB | FC | PL | IR | Peso reidratado`, fechada por uma linha TOTAL.
 *
 * Antes era uma lista de cartões: cada insumo ocupava três alturas de linha, os fatores
 * ficavam num rodapé recuado e o peso bruto aparecia como frase solta. Não dava para
 * comparar dois insumos sem rolar, e nada na tela correspondia ao papel que a Seção
 * preenche. Numa tabela os números ficam alinhados na coluna e a conferência é vertical.
 *
 * O que o banco guarda são três valores por linha — peso líquido TOTAL da preparação, FC
 * e IR. `PB` e `Peso reidratado` SAEM de uma conta (`lib/technical-sheet.ts`), e a coluna
 * de total fica separada da faixa per capita: misturar as duas escalas na mesma linha foi
 * o erro de leitura que o formulário em papel evita ao dizer PER CAPITA no topo.
 *
 * ── Toda coluna é digitável ──
 * A ficha de papel não chega sempre pelas mesmas colunas: a Seção pesa o bruto e o líquido
 * e o FC é o que sobra; outra vem com o total já somado; outra, só com a gramatura por
 * porção. Deixar as derivadas em leitura obrigava a fazer a conta de cabeça para entrar
 * pela coluna "certa" — e é aí que nasce o erro de digitação que ninguém confere.
 *
 * Então as cinco colunas aceitam digitação, e a conta tem VOLTA: PB ajusta o FC (FC = PB ÷
 * PL), Peso reidratado ajusta o IR, e as duas colunas de PL escrevem o mesmo `net_quantity`
 * em escalas diferentes. O PL nunca é mexido por um campo derivado — é dele que saem
 * compra, custo e escala de produção.
 *
 * Campo derivado se anuncia: borda tracejada e um hover que diz a fórmula, os números que
 * entraram nela e o que a digitação vai alterar. Sem isso, digitar no PB pareceria uma
 * edição perdida — a tecla entra, o número volta diferente e nada explica por quê.
 *
 * ── Base de digitação ──
 * A ficha de papel que a Seção digitaliza vem em dois padrões: a que traz a gramatura POR
 * PORÇÃO e a que traz o total do rendimento ("para 100"). O banco guarda SEMPRE o total —
 * é dele que saem o custo, a lista de compras e a escala da produção —, então digitar por
 * porção exigia multiplicar de cabeça a cada linha, que é exatamente onde nasce o erro de
 * duas ordens de grandeza.
 *
 * O seletor do cabeçalho não muda o dado: muda QUAL das duas colunas de peso líquido é o
 * campo. A outra vira o número derivado, ao lado, e serve de conferência do fator. A
 * conversão mora em `lib/technical-sheet.ts` (`toStoredQuantity`/`fromStoredQuantity`).
 *
 * ── Substitutos ──
 * Ficam na EXPANSÃO da linha, não numa aba, e a linha mostra UM candidato por vez.
 *
 * A preparação nunca leva o insumo E o substituto: leva um ou outro. Listá-los como itens
 * paralelos leria como soma, e um TOTAL somando os dois seria um peso que a cozinha nunca
 * produz. Então a expansão é um SELETOR (rádio) do que está em execução, e a linha inteira
 * — unidade, quantidade, PB/PL/peso reidratado e a participação no TOTAL — passa a falar
 * pelo escolhido. Trocar o rádio é ler a mesma ficha com a troca aplicada.
 *
 * Como aba própria isto era impossível: a comparação ("2 kg de champagne viram quantos de
 * amanteigado?") exige os dois números no mesmo campo de visão, e a aba obrigava a
 * reconstruir esta lista só para o usuário reescolher a linha.
 *
 * A ESCOLHA não é persistida: `kitchen.recipe_ingredients` não tem coluna para "candidato
 * em uso", e a ficha técnica é o padrão — quem registra a troca de uma semana é o cardápio,
 * não a ficha. O que persiste são as quantidades, do principal e de cada substituto.
 */
export function RecipeIngredientsTable({
	ingredients,
	portionYield,
	quantityBasis,
	onQuantityBasisChange,
	onChange,
	onAdd,
	errors,
	rowErrors,
}: RecipeIngredientsTableProps) {
	// Índices expandidos. A ficha aceita o mesmo insumo duas vezes, então a identidade da
	// linha é a posição — a mesma que `patch` e `remove` usam.
	const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set())
	// Linha → candidato em exibição (0 = principal). Ausente ⇒ principal.
	const [selected, setSelected] = useState<ReadonlyMap<number, number>>(new Map())
	// Linha para a qual o seletor de substituto está aberto (`null` = fechado).
	const [substituteFor, setSubstituteFor] = useState<number | null>(null)
	const radioName = useId()

	const yieldSafe = portionYieldOrOne(portionYield)

	const patch = (index: number, changes: Partial<RecipeIngredientRow>) => {
		onChange(ingredients.map((row, i) => (i === index ? { ...row, ...changes } : row)))
	}

	/** Índice do candidato em exibição, já preso ao intervalo existente. */
	const selectedOf = (index: number, row: RecipeIngredientRow) => {
		const raw = selected.get(index) ?? 0
		// Substituto removido encolhe a lista: sem o clamp, a linha renderizaria `undefined`.
		return raw <= row.alternatives.length ? raw : 0
	}

	/** Escreve a quantidade no candidato em exibição — principal ou substituto. */
	const setQuantity = (index: number, candidate: number, quantity: number) => {
		const row = ingredients[index]
		if (!row) return
		if (candidate === 0) {
			patch(index, { net_quantity: quantity })
			return
		}
		patch(index, { alternatives: row.alternatives.map((alt, i) => (i === candidate - 1 ? { ...alt, net_quantity: quantity } : alt)) })
	}

	const remove = (index: number) => {
		const snapshot = [...ingredients]
		onChange(snapshot.filter((_, i) => i !== index))
		// As posições acima da removida descem uma casa; sem o ajuste, a expansão e a seleção
		// ficariam presas à linha errada — a de baixo, que o usuário não tocou.
		const shift = <T,>(entries: Iterable<[number, T]>) => {
			const next = new Map<number, T>()
			for (const [i, value] of entries) {
				if (i === index) continue
				next.set(i > index ? i - 1 : i, value)
			}
			return next
		}
		setExpanded((prev) => new Set(shift([...prev].map((i) => [i, true])).keys()))
		setSelected((prev) => shift(prev))
		toast("Ingrediente removido.", { action: { label: "Desfazer", onClick: () => onChange(snapshot) } })
	}

	const toggleExpanded = (index: number) =>
		setExpanded((prev) => {
			const next = new Set(prev)
			if (next.has(index)) next.delete(index)
			else next.add(index)
			return next
		})

	const select = (index: number, candidate: number) =>
		setSelected((prev) => {
			const next = new Map(prev)
			next.set(index, candidate)
			return next
		})

	const removeAlternative = (index: number, altIndex: number) => {
		const row = ingredients[index]
		if (!row) return
		patch(index, { alternatives: row.alternatives.filter((_, i) => i !== altIndex) })
		// Removeu o que estava em exibição (ou um acima dele): volta ao principal em vez de
		// deslizar para o substituto vizinho, que ninguém escolheu.
		const current = selectedOf(index, row)
		if (current === altIndex + 1 || current > altIndex + 1) select(index, 0)
	}

	// Cada linha entra na ficha pelo candidato em exibição — é ele que a cozinha executa.
	const lines = ingredients.map((row, index) => {
		const candidate = selectedOf(index, row)
		const active = candidatesOf(row)[candidate] ?? candidatesOf(row)[0]
		return {
			row,
			candidate,
			active,
			sheet: technicalSheetLine(
				{ netQuantity: active.quantity, correctionFactor: row.correction_factor, rehydrationIndex: row.rehydration_index },
				portionYield
			),
		}
	})
	const totals = technicalSheetTotals(lines.map(({ active, sheet }) => ({ ...sheet, measureUnit: active.unit })))
	const mixedUnits = totals.units.length > 1
	const swapped = lines.filter((l) => l.candidate > 0).length

	const openRow = substituteFor != null ? ingredients[substituteFor] : undefined

	return (
		<Card>
			<CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<CardTitle>Ingredientes</CardTitle>
					{ingredients.length > 0 && <Badge variant="secondary">{ingredients.length}</Badge>}
				</div>
				<div className="flex flex-wrap items-center gap-2">
					{/* A base é do FORMULÁRIO, não da ficha: escolhe em qual coluna se digita.
					    Fica no cabeçalho porque vale para a tabela inteira — por linha seria uma
					    ficha com metade dos números em cada escala. */}
					<span className="text-caption text-muted-foreground">Digitar por</span>
					<ToggleGroup
						value={[quantityBasis]}
						// Base UI devolve array mesmo em seleção única. Desmarcar mantém a base atual:
						// não existe "sem base", e voltar ao default por um clique de desmarque
						// reinterpretaria toda a coluna em outra escala sem o usuário pedir.
						onValueChange={(value) => onQuantityBasisChange((value[0] as QuantityBasis) ?? quantityBasis)}
						variant="outline"
						size="sm"
						spacing={1}
						aria-label="Base de digitação da quantidade"
					>
						<ToggleGroupItem value="porcao" aria-label="Digitar a quantidade de uma porção">
							Porção
						</ToggleGroupItem>
						<ToggleGroupItem value="total" aria-label="Digitar a quantidade do rendimento inteiro">
							Rendimento{portionYield > 0 ? ` (${portionYield})` : ""}
						</ToggleGroupItem>
					</ToggleGroup>
					<Button type="button" variant="outline" size="sm" onClick={onAdd}>
						<Plus className="size-4 mr-2" />
						Adicionar
					</Button>
				</div>
			</CardHeader>
			<CardContent className="space-y-3">
				{ingredients.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border py-10 text-muted-foreground">
						<p className="text-body">Nenhum ingrediente adicionado</p>
						<Button type="button" variant="outline" size="sm" onClick={onAdd}>
							<Plus className="size-4 mr-2" />
							Adicionar ingrediente
						</Button>
					</div>
				) : (
					<Table>
						<TableHeader>
							{/* Dois níveis de cabeçalho, como no modelo: a faixa PER CAPITA agrupa as cinco
							    colunas derivadas e deixa explícito que aquilo NÃO é o total da preparação. */}
							<TableRow className="hover:bg-transparent">
								<TableHead rowSpan={2} className="align-bottom">
									Ingrediente
								</TableHead>
								<TableHead rowSpan={2} className="align-bottom">
									Unidade
								</TableHead>
								<TableHead rowSpan={2} className="align-bottom text-right">
									PL total
								</TableHead>
								<TableHead colSpan={5} className="border-x border-border text-center">
									PER CAPITA
								</TableHead>
								<TableHead rowSpan={2} className="align-bottom text-center">
									Opcional
								</TableHead>
								<TableHead rowSpan={2}>
									<span className="sr-only">Ações</span>
								</TableHead>
							</TableRow>
							<TableRow className="hover:bg-transparent">
								<TableHead className="border-l border-border text-right">PB</TableHead>
								<TableHead className="text-right">FC</TableHead>
								<TableHead className="text-right">PL</TableHead>
								<TableHead className="text-right">IR</TableHead>
								<TableHead className="border-r border-border text-right">Peso reidratado</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{lines.map(({ row, sheet, candidate, active }, index) => {
								const rowError = rowErrors?.(row) ?? {}
								const messages = [
									rowError.ingredient_id,
									rowError.net_quantity,
									rowError.correction_factor,
									rowError.rehydration_index,
									rowError.alternatives,
								].filter(Boolean)
								// Erro de substituto abre a expansão: o campo culpado mora lá dentro, e sem
								// isso o salvamento era barrado por um toast que apontava para uma linha
								// aparentemente correta. Derivado, não efeito — não há estado a sincronizar.
								const isExpanded = expanded.has(index) || !!rowError.alternatives
								const isSwapped = candidate > 0
								// Chave composta: o mesmo insumo pode entrar duas vezes na ficha (dois cortes de
								// carne com o mesmo cadastro), e só o `ingredient_id` colidiria — duas linhas com a
								// mesma chave trocam o foco e o valor dos inputs entre si ao editar.
								const rowKey = `${row.ingredient_id ?? "novo"}-${index}`
								return (
									<Fragment key={rowKey}>
										<TableRow
											data-invalid={messages.length > 0 || undefined}
											// Tinta de fundo (não faixa lateral) marca a linha que está lendo um
											// substituto: o campo de quantidade ali edita o substituto, e um modo
											// invisível faria o usuário achar que alterou o insumo principal.
											className={cn("data-[invalid]:bg-destructive/5", isSwapped && "bg-primary/5")}
										>
											<TableCell className="max-w-72 whitespace-normal font-medium">
												<div className="flex items-start gap-1.5">
													<Button
														type="button"
														variant="ghost"
														size="icon-sm"
														className="-ml-1 shrink-0 text-muted-foreground"
														aria-expanded={isExpanded}
														aria-label={`${isExpanded ? "Recolher" : "Expandir"} substitutos de ${row.ingredient_name}`}
														onClick={() => toggleExpanded(index)}
													>
														{isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
													</Button>
													<div className="min-w-0">
														<span>{active.name}</span>
														{isSwapped ? (
															<Tooltip>
																<TooltipTrigger
																	render={
																		<Badge variant="outline" className="ml-2 align-middle">
																			<ArrowLeftRight className="size-3" />
																			substituto
																		</Badge>
																	}
																/>
																<TooltipContent>
																	Lendo a ficha com {active.name} no lugar de {row.ingredient_name}. A escolha não é salva.
																</TooltipContent>
															</Tooltip>
														) : (
															row.alternatives.length > 0 && (
																<Tooltip>
																	<TooltipTrigger
																		render={
																			<Badge variant="secondary" className="ml-2 align-middle">
																				<ArrowLeftRight className="size-3" />
																				{row.alternatives.length}
																			</Badge>
																		}
																	/>
																	<TooltipContent>
																		{row.alternatives.length === 1 ? "1 substituto cadastrado" : `${row.alternatives.length} substitutos cadastrados`}
																	</TooltipContent>
																</Tooltip>
															)
														)}
														{messages.length > 0 && (
															<p role="alert" className="text-caption text-destructive">
																{messages.join(" · ")}
															</p>
														)}
													</div>
												</div>
											</TableCell>
											<TableCell className="text-muted-foreground">{active.unit}</TableCell>
											<TableCell className="text-right">
												<SheetNumberInput
													label={`Peso líquido total de ${active.name}`}
													value={active.quantity ?? 0}
													invalid={!!rowError.net_quantity}
													onCommit={(value) => setQuantity(index, candidate, value ?? 0)}
													// Digitando por porção, este campo é o produto — mas continua digitável:
													// a ficha de papel que chega com o total já somado não deve obrigar
													// ninguém a dividir de cabeça para entrar pela outra coluna.
													hint={
														quantityBasis === "porcao" ? (
															<>
																<strong>Calculado:</strong> PL total = PL por porção × rendimento ({formatSheetNumber(yieldSafe, 0)}). É este número que é
																gravado — dele saem a lista de compras, o custo e a escala da produção. Digitar aqui grava o total direto, e a coluna por porção
																passa a mostrar total ÷ {formatSheetNumber(yieldSafe, 0)}.
															</>
														) : undefined
													}
												/>
											</TableCell>
											<TableCell className="border-l border-border text-right">
												<SheetNumberInput
													label={`Peso bruto por porção de ${active.name}`}
													value={sheet.grossWeight}
													// Sem PL não existe FC (a volta divide por ele): o campo fica em leitura,
													// e o motivo vai no mesmo hover em vez de virar um campo que ignora a
													// tecla em silêncio. `readOnly`, não `disabled` — campo desabilitado não
													// recebe hover em Chrome, e a explicação é justamente o que falta ali.
													readOnly={sheet.netWeight <= 0}
													onCommit={(value) => patch(index, { correction_factor: value == null ? null : correctionFactorFromGross(value, sheet.netWeight) })}
													hint={
														sheet.netWeight > 0 ? (
															<>
																<strong>Calculado:</strong> PB = PL × FC ({formatSheetNumber(sheet.netWeight)} × {formatSheetNumber(sheet.correctionFactor, 2)}
																). Digitar aqui não mexe no PL: ajusta o <strong>FC</strong> pela volta FC = PB ÷ PL — é assim que a ficha de papel chega, com
																os dois pesos medidos e o fator deduzido.
																{isSwapped &&
																	` O FC é da LINHA e vale para qualquer candidato: derivá-lo do PB de ${active.name} muda também o PB de ${row.ingredient_name}.`}
															</>
														) : (
															<>
																<strong>Calculado:</strong> PB = PL × FC. Informe o PL desta linha para digitar o PB — o FC sai de PB ÷ PL, e sem PL não há o
																que dividir.
															</>
														)
													}
												/>
											</TableCell>
											<TableCell className="text-right">
												<SheetNumberInput
													label={`Fator de correção de ${row.ingredient_name}`}
													value={row.correction_factor}
													placeholder="1"
													invalid={!!rowError.correction_factor}
													onCommit={(value) => patch(index, { correction_factor: value })}
													className="w-20"
												/>
											</TableCell>
											<TableCell className="text-right">
												<SheetNumberInput
													label={`Peso líquido por porção de ${active.name}`}
													value={fromStoredQuantity(active.quantity, "porcao", portionYield)}
													invalid={!!rowError.net_quantity}
													onCommit={(value) => setQuantity(index, candidate, toStoredQuantity(value ?? 0, "porcao", portionYield))}
													hint={
														quantityBasis === "total" ? (
															<>
																<strong>Calculado:</strong> PL por porção = PL total ÷ rendimento ({formatSheetNumber(yieldSafe, 0)}). Digitar aqui grava o
																total = valor × {formatSheetNumber(yieldSafe, 0)} — o banco guarda sempre o total.
															</>
														) : undefined
													}
												/>
											</TableCell>
											<TableCell className="text-right">
												<SheetNumberInput
													label={`Índice de reidratação de ${row.ingredient_name}`}
													value={row.rehydration_index}
													placeholder="1"
													invalid={!!rowError.rehydration_index}
													onCommit={(value) => patch(index, { rehydration_index: value })}
													className="w-20"
												/>
											</TableCell>
											<TableCell className="border-r border-border text-right">
												<SheetNumberInput
													label={`Peso reidratado por porção de ${active.name}`}
													value={sheet.rehydratedWeight}
													readOnly={sheet.netWeight <= 0}
													onCommit={(value) =>
														patch(index, { rehydration_index: value == null ? null : rehydrationIndexFromRehydrated(value, sheet.netWeight) })
													}
													hint={
														sheet.netWeight > 0 ? (
															<>
																<strong>Calculado:</strong> Peso reidratado = PL × IR ({formatSheetNumber(sheet.netWeight)} ×{" "}
																{formatSheetNumber(sheet.rehydrationIndex, 2)}). Digitar aqui ajusta o <strong>IR</strong> pela volta IR = Peso reidratado ÷ PL
																— o PL não muda.
																{isSwapped &&
																	` O IR é da LINHA e vale para qualquer candidato: derivá-lo do peso de ${active.name} muda também o de ${row.ingredient_name}.`}
															</>
														) : (
															<>
																<strong>Calculado:</strong> Peso reidratado = PL × IR. Informe o PL desta linha para digitar o peso reidratado — o IR sai da
																divisão pelo PL.
															</>
														)
													}
												/>
											</TableCell>
											<TableCell className="text-center">
												<Toggle
													variant="outline"
													size="sm"
													pressed={row.is_optional}
													onPressedChange={(pressed) => patch(index, { is_optional: pressed })}
													aria-label={`Marcar ${row.ingredient_name} como opcional`}
												>
													{row.is_optional ? <CircleCheck className="size-3.5" /> : <Circle className="size-3.5" />}
												</Toggle>
											</TableCell>
											<TableCell>
												<Button
													type="button"
													variant="ghost"
													size="icon-sm"
													className="text-muted-foreground hover:text-destructive"
													aria-label={`Remover ${row.ingredient_name}`}
													onClick={() => remove(index)}
												>
													<Trash2 className="size-3.5" />
												</Button>
											</TableCell>
										</TableRow>

										{isExpanded && (
											<TableRow className="hover:bg-transparent">
												<TableCell colSpan={COLUMN_COUNT} className="whitespace-normal bg-muted/30 p-3">
													<CandidatePicker
														row={row}
														rowIndex={index}
														selected={candidate}
														yieldSafe={yieldSafe}
														radioName={`${radioName}-${index}`}
														onSelect={(next) => select(index, next)}
														onRemoveAlternative={(altIndex) => removeAlternative(index, altIndex)}
														onAdd={() => setSubstituteFor(index)}
													/>
												</TableCell>
											</TableRow>
										)}
									</Fragment>
								)
							})}
						</TableBody>
						<TableFooter>
							<TableRow className="hover:bg-transparent">
								<TableCell colSpan={3} className="font-medium">
									TOTAL
								</TableCell>
								{/* A linha TOTAL é a única que NÃO se digita: é soma de coluna, e um campo ali
								    aceitaria um número que as linhas não produzem. O hover diz de onde vem. */}
								<TableCell className={cn("border-l border-border text-right", mixedUnits && "text-muted-foreground")}>
									<TotalCell value={totals.grossWeight} formula="Soma dos PB de todas as linhas, no candidato em exibição." />
								</TableCell>
								<TableCell />
								<TableCell className={cn("text-right", mixedUnits && "text-muted-foreground")}>
									<TotalCell value={totals.netWeight} formula="Soma dos PL por porção. É o peso de uma porção da preparação inteira." />
								</TableCell>
								<TableCell />
								<TableCell className={cn("border-r border-border text-right", mixedUnits && "text-muted-foreground")}>
									<TotalCell value={totals.rehydratedWeight} formula="Soma dos pesos reidratados de todas as linhas." />
								</TableCell>
								<TableCell colSpan={2} />
							</TableRow>
						</TableFooter>
					</Table>
				)}

				{/* Legenda do modelo — as siglas não são óbvias fora do formulário em papel. */}
				{ingredients.length > 0 && (
					<p className="text-caption text-muted-foreground">
						PB = Peso Bruto · PL = Peso Líquido · FC = PB ÷ PL · IR = Peso reidratado ÷ Peso seco. A faixa PER CAPITA é o valor por porção
						{portionYield > 0 ? ` (rendimento: ${portionYield} porções)` : " (defina o rendimento na aba Detalhes)"}. Toda coluna aceita digitação: as de{" "}
						<span className="border-dashed border-b border-muted-foreground/60">borda tracejada</span> são calculadas — passe o mouse para ver a fórmula e o que
						a digitação ajusta. Expanda a linha para cadastrar substitutos e escolher qual deles a ficha está lendo.
					</p>
				)}

				{/* Digitando por porção, o que vai para o banco é o produto — dizer isso na tela
				    evita a conclusão de que o rendimento "não fez nada", e avisa que mexer no
				    rendimento depois reinterpreta o que já foi digitado. */}
				{/* Rendimento 1 com base "porção" é a armadilha da tela: o total gravado sai igual
				    ao digitado, e a ficha de 100 porções vai para o banco 100× menor. A base vem
				    do sessionStorage (segue de uma ficha para a outra) e o rendimento nasce em 1
				    na criação, então a combinação acontece sozinha, sem ninguém escolher. Aviso,
				    e não bloqueio: rendimento 1 é legítimo (preparação de porção única). */}
				{ingredients.length > 0 && quantityBasis === "porcao" && portionYield <= 1 && (
					<p className="text-caption text-warning">
						Rendimento em {portionYield > 0 ? portionYield : "1"} porção: digitando por porção, o total gravado fica igual ao digitado. Se a ficha rende mais de
						uma porção, defina o rendimento na aba Detalhes antes de preencher as quantidades.
					</p>
				)}

				{ingredients.length > 0 && quantityBasis === "porcao" && portionYield > 1 && (
					<p className="text-caption text-muted-foreground">
						Você está digitando a quantidade de <strong className="font-medium text-foreground">1 porção</strong>; a coluna PL total mostra o que é gravado (×{" "}
						{portionYield > 0 ? portionYield : "rendimento"}). Defina o rendimento antes de digitar — alterá-lo depois muda a leitura por porção das linhas já
						preenchidas, não o total gravado.
					</p>
				)}

				{/* O TOTAL passou a somar substituto: sem dizer isso, o número diverge do que a
				    ficha salva e ninguém sabe por quê. */}
				{swapped > 0 && (
					<p className="text-caption text-primary">
						{swapped === 1 ? "1 linha está lendo um substituto" : `${swapped} linhas estão lendo um substituto`} — o TOTAL acompanha. A escolha é só de leitura
						e não é salva; as quantidades, sim.
					</p>
				)}

				{/* O TOTAL do formulário em papel pressupõe uma unidade só; o catálogo mistura KG,
				    LT e UN. Somar assim mesmo e ficar calado seria imprimir um número inventado. */}
				{mixedUnits && (
					<Tooltip>
						<TooltipTrigger
							render={
								<p className="w-fit cursor-help text-caption text-warning">
									O TOTAL soma unidades diferentes ({totals.units.join(", ")}) — use como referência, não como peso.
								</p>
							}
						/>
						<TooltipContent>O modelo em papel tem uma linha TOTAL só, que só faz sentido quando toda a ficha está na mesma unidade.</TooltipContent>
					</Tooltip>
				)}

				<FieldError errors={errors} />
			</CardContent>

			{/* Seletor do substituto — montado fora da tabela para não remontar a cada teclada nela. */}
			{substituteFor != null && openRow && (
				<IngredientSelector
					isOpen
					onClose={() => setSubstituteFor(null)}
					onSelect={(ingredient) => {
						// O insumo da própria linha não substitui a si mesmo, e o mesmo substituto não
						// entra duas vezes: o índice único da tabela rejeitaria o segundo com um 23505
						// sem mensagem, já depois de o usuário ter clicado em salvar.
						if (ingredient.id === openRow.ingredient_id) return
						if (openRow.alternatives.some((alt) => alt.ingredient_id === ingredient.id)) return
						patch(substituteFor, {
							alternatives: [
								...openRow.alternatives,
								{
									ingredient_id: ingredient.id,
									ingredient_name: ingredient.description ?? "",
									measure_unit: ingredient.measure_unit ?? "UN",
									// Nasce com a quantidade do principal: é o palpite certo na maioria dos
									// casos e deixa explícito o que ajustar quando não é.
									net_quantity: openRow.net_quantity,
								},
							],
						})
					}}
				/>
			)}
		</Card>
	)
}

/**
 * Campo numérico da tabela — o mesmo controle para as colunas gravadas e as calculadas.
 *
 * Duas coisas que um `<Input value={conta}>` cru não resolve:
 *
 * 1. **Rascunho enquanto tem foco.** O valor exibido de uma coluna calculada é o resultado
 *    de uma volta (digita PB → grava FC → relê PB = PL × FC). Reescrever o campo a cada
 *    tecla apagaria o `1.` de quem está digitando `1.5` e devolveria 0,6650000000000001 no
 *    meio da digitação. Enquanto o campo está sendo editado ele mostra o que foi digitado;
 *    ao sair do foco, volta a mostrar a conta. Vale também para as colunas gravadas — o
 *    `value={row.correction_factor ?? ""}` anterior tinha o mesmo problema com `0,`.
 * 2. **`hint` marca o campo como calculado** — borda tracejada e tooltip no hover com a
 *    fórmula, os números que entraram nela e o que a digitação vai alterar. É a diferença
 *    entre "meu valor sumiu" e "o FC absorveu o PB que eu digitei".
 *
 * `readOnly`, e não `disabled`, quando a volta é impossível (dividir pelo PL zerado):
 * campo desabilitado não emite hover no Chrome, e é justamente o hover que carrega o
 * motivo. Ele continua focável e legível por leitor de tela, só não aceita a tecla.
 */
function SheetNumberInput({
	label,
	value,
	onCommit,
	hint,
	readOnly,
	invalid,
	placeholder,
	className,
}: {
	label: string
	value: number | null
	/** `null` = campo apagado. Quem grava quantidade trata como 0; FC e IR, como "sem fator". */
	onCommit: (value: number | null) => void
	/** Presente ⇒ a coluna é calculada: explica a fórmula e o efeito da digitação. */
	hint?: React.ReactNode
	readOnly?: boolean
	invalid?: boolean
	placeholder?: string
	className?: string
}) {
	const [draft, setDraft] = useState<string | null>(null)

	const input = (
		<Input
			aria-label={label}
			type="number"
			// `any`, e não um passo fixo: o valor de uma coluna calculada tem seis casas
			// (PL 0,15 × FC 1,33 = 0,1995) e a volta produz FC 1,333333. Com `step="0.001"`
			// isso vira violação de restrição NATIVA — o form tem submit de verdade e não tem
			// `noValidate`, então o Salvar era barrado por um campo que o usuário não digitou;
			// num campo em aba fechada o Chrome nem consegue focar para reclamar e o clique
			// simplesmente não faz nada. O gate do salvamento é o schema, não o passo.
			step="any"
			min={0}
			placeholder={placeholder}
			aria-invalid={invalid || undefined}
			readOnly={readOnly}
			value={draft ?? (value == null ? "" : String(roundSheetQuantity(value)))}
			onChange={(event) => {
				const raw = event.target.value
				setDraft(raw)
				if (raw.trim() === "") {
					onCommit(null)
					return
				}
				const parsed = Number(raw)
				if (Number.isFinite(parsed)) onCommit(parsed)
			}}
			// Fora do foco quem manda é a conta: o rascunho `1.` do FC vira 1 e o PB volta a
			// exibir o produto arredondado, e não o eco do que foi digitado.
			onBlur={() => setDraft(null)}
			className={cn("ml-auto w-24 text-right font-mono tabular-nums", hint && "border-dashed", readOnly && "cursor-help text-muted-foreground", className)}
		/>
	)

	if (!hint) return input
	return (
		<Tooltip>
			<TooltipTrigger render={input} />
			<TooltipContent>{hint}</TooltipContent>
		</Tooltip>
	)
}

/** Célula da linha TOTAL: soma, não campo — o hover diz qual soma. */
function TotalCell({ value, formula }: { value: number; formula: string }) {
	return (
		<Tooltip>
			<TooltipTrigger render={<span className="cursor-help font-mono tabular-nums">{formatSheetNumber(value)}</span>} />
			<TooltipContent>{formula}</TooltipContent>
		</Tooltip>
	)
}

/**
 * Seletor do candidato em execução: o principal e os substitutos, em rádio.
 *
 * Rádio, e não lista: a preparação leva um OU outro. Uma lista sugeriria acúmulo, e é
 * exatamente a leitura errada que o TOTAL somando os dois produziria.
 *
 * `<input type="radio">` real (visualmente oculto) dentro do `<Item>`: o grupo ganha
 * navegação por setas e leitura de "1 de 3" nos leitores de tela, que um `div` com
 * `aria-checked` não entrega.
 */
function CandidatePicker({
	row,
	rowIndex,
	selected,
	yieldSafe,
	radioName,
	onSelect,
	onRemoveAlternative,
	onAdd,
}: {
	row: RecipeIngredientRow
	rowIndex: number
	selected: number
	yieldSafe: number
	radioName: string
	onSelect: (candidate: number) => void
	onRemoveAlternative: (altIndex: number) => void
	onAdd: () => void
}) {
	const candidates = candidatesOf(row)

	return (
		<section className="space-y-3" aria-label={`Substitutos de ${row.ingredient_name}`}>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<p className="flex items-center gap-2 text-caption text-muted-foreground">
					<ArrowLeftRight className="size-3.5" />A preparação leva <strong className="font-medium text-foreground">um</strong> destes, não a soma:
				</p>
				<Button type="button" variant="outline" size="sm" onClick={onAdd}>
					<Plus className="size-4 mr-2" />
					Adicionar substituto
				</Button>
			</div>

			<ItemGroup>
				{candidates.map((candidate, candidateIndex) => {
					const isSelected = candidateIndex === selected
					const perCapita = (candidate.quantity ?? 0) / yieldSafe
					return (
						<Item
							key={`${rowIndex}-${candidate.name}-${candidateIndex}`}
							variant="outline"
							size="sm"
							// Clique na linha é conveniência de mouse; quem carrega a semântica é o
							// `<input type="radio">`, com nome de grupo e rótulo próprios. Envolver a
							// linha num `<label>` daria o mesmo alvo de clique, mas o `render` do
							// `<Item>` esconde o input da análise estática e o par vira um label sem
							// controle aos olhos do linter (e de parte dos leitores de tela).
							onClick={() => onSelect(candidateIndex)}
							className={cn("cursor-pointer bg-background transition-colors", isSelected ? "border-primary/40 bg-primary/5" : "hover:bg-muted/40")}
						>
							<ItemMedia>
								<input
									type="radio"
									name={radioName}
									checked={isSelected}
									onChange={() => onSelect(candidateIndex)}
									className="size-4 accent-primary"
									aria-label={`Ler a ficha com ${candidate.name}`}
								/>
							</ItemMedia>
							<ItemContent>
								<ItemTitle>
									{candidate.name || "Sem nome"}
									{candidate.isPrimary && (
										<Badge variant="secondary" className="ml-2">
											Principal
										</Badge>
									)}
								</ItemTitle>
								<ItemDescription>
									{formatSheetNumber(candidate.quantity ?? 0)} {candidate.unit} no total · {formatSheetNumber(perCapita)} {candidate.unit} por porção
								</ItemDescription>
							</ItemContent>
							<ItemActions>
								{!candidate.isPrimary && (
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										className="text-muted-foreground hover:text-destructive"
										aria-label={`Remover ${candidate.name}`}
										onClick={(event) => {
											// A linha inteira seleciona o candidato; sem parar aqui, apagar o
											// substituto A com dois na lista deixava a ficha lendo o B — nome,
											// unidade, quantidade e TOTAL trocados por um clique de exclusão.
											event.stopPropagation()
											onRemoveAlternative(candidateIndex - 1)
										}}
									>
										<Trash2 className="size-3.5" />
									</Button>
								)}
							</ItemActions>
						</Item>
					)
				})}
			</ItemGroup>

			<p className="text-caption text-muted-foreground">
				A quantidade de quem está marcado é editada na própria linha da tabela, acima. FC e IR são da linha e valem para qualquer candidato.
			</p>
		</section>
	)
}
