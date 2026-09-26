import { brasiliaCivilDate, DEFAULT_SHELF_LIFE_HOURS, isStandardReviewOverdue, kcalRangeFor, NORM_REFS } from "@iefa/sisub-domain/utils"
import { useQuery } from "@tanstack/react-query"
import { AlertTriangle, Flame, Loader2, Sandwich } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { snackStandardEnergyQueryOptions } from "@/hooks/data/useSnackRequests"
import { normalizeSnackDraft, SNACK_FAMILY_LABELS, SNACK_VARIANT_LABELS, type SnackStandardDraft, snackDraftIssues } from "@/lib/occasion-menu"

const KCAL = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 })

interface SnackStandardPanelProps {
	draft: SnackStandardDraft
	onChange: (draft: SnackStandardDraft) => void
	/**
	 * A edição termina num template de cozinha (edição local ou cópia de um global aberto na
	 * cozinha). No catálogo global o padrão é só molde: não é pedível.
	 */
	isKitchenTemplate: boolean
	/** Template gravado de onde sai o kcal por kit; nulo esconde o bloco de energia. */
	energyTemplateId: string | null
	/** Há preparação ou porção alterada e ainda não salva — o kcal mostrado é o da versão gravada. */
	itemsDirty: boolean
}

/**
 * Bloco "Padrão de lanche (Módulo 7)" do editor de exceção: classifica a exceção como padrão
 * de Lanche de Bordo/Apoio que o comensal pede. A classificação é gravada à parte do conteúdo
 * (`setSnackClassification`), depois do salvamento do template.
 */
export function SnackStandardPanel({ draft, onChange, isKitchenTemplate, energyTemplateId, itemsDirty }: SnackStandardPanelProps) {
	const set = (patch: Partial<SnackStandardDraft>) => onChange(normalizeSnackDraft({ ...draft, ...patch }))
	const today = brasiliaCivilDate(new Date().toISOString())
	const reviewOverdue = draft.enabled && isStandardReviewOverdue(draft.reviewedAt || null, today)
	// Valor inválido some calado se não for mostrado: a validade fora da faixa virava o default
	// de 24 h na etiqueta, e a revisão no futuro desligava o aviso de vencida.
	const issues = snackDraftIssues(draft, today)

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Sandwich className="size-4 text-muted-foreground" />
					Padrão de lanche (Módulo 7)
				</CardTitle>
				<CardDescription>
					Um padrão de lanche é o kit que o comensal pede para missão aérea (Lanche de Bordo, classes A, B e C) ou terrestre (Lanche de Apoio, classes A e B).
				</CardDescription>
				<CardAction>
					<div className="flex items-center gap-2">
						<Switch id="snack-enabled" checked={draft.enabled} onCheckedChange={(checked) => set({ enabled: checked })} />
						<FieldLabel htmlFor="snack-enabled">É padrão de lanche</FieldLabel>
					</div>
				</CardAction>
			</CardHeader>

			{draft.enabled && (
				<CardContent className="space-y-6">
					{/* Colunas pelo conteúdo, não em terços: "Lanche de Bordo" + "Lanche de Apoio" não cabem num terço do card com a barra lateral aberta. */}
					<FieldGroup className="md:flex-row md:flex-wrap">
						<Field className="md:w-auto">
							<FieldLabel>Família</FieldLabel>
							<ToggleGroup
								value={[draft.family]}
								// Base UI devolve array mesmo em seleção única; desmarcar mantém a família.
								onValueChange={(value) => {
									const next = value[0]
									if (next === "bordo" || next === "apoio") set({ family: next })
								}}
								variant="outline"
								size="sm"
								aria-label="Família do lanche"
							>
								<ToggleGroupItem value="bordo">{SNACK_FAMILY_LABELS.bordo}</ToggleGroupItem>
								<ToggleGroupItem value="apoio">{SNACK_FAMILY_LABELS.apoio}</ToggleGroupItem>
							</ToggleGroup>
						</Field>
						{/* Largura fixa: o aviso de classe do Lanche de Apoio aparece e some com a família, e a coluna não pode mudar de largura junto. */}
						<Field className="md:w-44">
							<FieldLabel>Classe</FieldLabel>
							<ToggleGroup
								value={[draft.snackClass]}
								onValueChange={(value) => {
									const next = value[0]
									if (next === "A" || next === "B" || next === "C") set({ snackClass: next })
								}}
								variant="outline"
								size="sm"
								aria-label="Classe do lanche"
							>
								<ToggleGroupItem value="A">A</ToggleGroupItem>
								<ToggleGroupItem value="B">B</ToggleGroupItem>
								<ToggleGroupItem value="C" disabled={draft.family === "apoio"}>
									C
								</ToggleGroupItem>
							</ToggleGroup>
							{draft.family === "apoio" && <FieldDescription>Lanche de Apoio só tem as classes A e B.</FieldDescription>}
						</Field>
						<Field className="md:w-auto">
							<FieldLabel>Variante</FieldLabel>
							<ToggleGroup
								value={[draft.variant]}
								onValueChange={(value) => {
									const next = value[0]
									if (next === "lanche" || next === "refeicao") set({ variant: next })
								}}
								variant="outline"
								size="sm"
								aria-label="Variante do lanche"
							>
								<ToggleGroupItem value="lanche">{SNACK_VARIANT_LABELS.lanche}</ToggleGroupItem>
								<ToggleGroupItem value="refeicao">{SNACK_VARIANT_LABELS.refeicao}</ToggleGroupItem>
							</ToggleGroup>
						</Field>
					</FieldGroup>

					<FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-3">
						<Field orientation="horizontal">
							<Switch id="snack-galley" checked={draft.requiresGalley} onCheckedChange={(checked) => set({ requiresGalley: checked })} />
							<FieldLabel htmlFor="snack-galley">Exige copa ou minicozinha</FieldLabel>
						</Field>
						<Field orientation="horizontal">
							<Switch id="snack-oven" checked={draft.requiresOven} onCheckedChange={(checked) => set({ requiresOven: checked })} />
							<FieldLabel htmlFor="snack-oven">Exige forno</FieldLabel>
						</Field>
						<Field orientation="horizontal">
							<Switch
								id="snack-orderable"
								checked={isKitchenTemplate && draft.orderable}
								disabled={!isKitchenTemplate}
								onCheckedChange={(checked) => set({ orderable: checked })}
							/>
							<div className="space-y-1">
								<FieldLabel htmlFor="snack-orderable">Disponível para pedido</FieldLabel>
								<FieldDescription>
									{isKitchenTemplate
										? "O comensal vê este padrão ao pedir lanche a esta cozinha."
										: "Padrão do catálogo global é só molde: copie para a cozinha que vai produzir e publique lá."}
								</FieldDescription>
							</div>
						</Field>
					</FieldGroup>

					<FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-3">
						<Field>
							<FieldLabel htmlFor="snack-reviewed">Revisado em</FieldLabel>
							<Input
								id="snack-reviewed"
								type="date"
								max={today}
								aria-invalid={issues.reviewedAt != null}
								value={draft.reviewedAt}
								onChange={(e) => set({ reviewedAt: e.target.value })}
							/>
							{issues.reviewedAt ? (
								<FieldError>{issues.reviewedAt}</FieldError>
							) : reviewOverdue ? (
								<Badge variant="warning" className="gap-1">
									<AlertTriangle />
									Revisão trimestral vencida
								</Badge>
							) : (
								<FieldDescription>O cardápio do lanche é revisto a cada três meses.</FieldDescription>
							)}
						</Field>
						<Field>
							<FieldLabel htmlFor="snack-shelf-life">Validade da etiqueta (horas)</FieldLabel>
							<Input
								id="snack-shelf-life"
								type="number"
								min={1}
								max={720}
								inputMode="numeric"
								value={draft.shelfLifeHours}
								aria-invalid={issues.shelfLifeHours != null}
								onChange={(e) => set({ shelfLifeHours: e.target.value })}
								placeholder={String(DEFAULT_SHELF_LIFE_HOURS)}
							/>
							{issues.shelfLifeHours ? (
								<FieldError>{issues.shelfLifeHours}</FieldError>
							) : (
								<FieldDescription>Em branco, a etiqueta vale {DEFAULT_SHELF_LIFE_HOURS} h a partir da fabricação.</FieldDescription>
							)}
						</Field>
					</FieldGroup>

					<SnackEnergySummary draft={draft} templateId={energyTemplateId} itemsDirty={itemsDirty} />
				</CardContent>
			)}
		</Card>
	)
}

function SnackEnergySummary({ draft, templateId, itemsDirty }: { draft: SnackStandardDraft; templateId: string | null; itemsDirty: boolean }) {
	const { data, error, isLoading } = useQuery({ ...snackStandardEnergyQueryOptions(templateId ?? ""), enabled: templateId != null })
	const range = kcalRangeFor(draft.family, draft.snackClass)
	const normRef = NORM_REFS[`${draft.family}${draft.snackClass}` as keyof typeof NORM_REFS] ?? null
	const rangeText =
		draft.family === "bordo" && draft.snackClass === "C"
			? `${KCAL.format(range.min)}–${KCAL.format(range.max)} kcal (${KCAL.format(1200)}–${KCAL.format(2000)} kcal em missão acima de 15 h)`
			: `${KCAL.format(range.min)}–${KCAL.format(range.max)} kcal`

	if (templateId == null) return null

	let body: React.ReactNode
	if (isLoading) {
		body = (
			<span className="flex items-center gap-2 text-sm text-muted-foreground">
				<Loader2 className="size-4 animate-spin" />
				Calculando o valor calórico…
			</span>
		)
	} else if (error) {
		body = <p className="text-sm text-destructive">Não foi possível calcular o valor calórico do kit: {error.message}</p>
	} else if (!data || data.kcalPerKit == null) {
		body = <p className="text-sm text-muted-foreground">Sem dado de energia: as preparações do kit não têm rendimento ou composição nutricional.</p>
	} else {
		const kcal = data.kcalPerKit
		const below = kcal < range.min
		const above = kcal > range.max
		body = (
			<div className="space-y-2">
				<p className="text-sm">
					<strong className="tabular-nums">{KCAL.format(kcal)} kcal</strong> por kit
					{!data.complete && <span className="text-muted-foreground"> (parcial)</span>}
				</p>
				{(below || above) && (
					<p className="flex items-start gap-1.5 text-sm text-warning">
						<AlertTriangle className="size-4 shrink-0 mt-0.5" />
						{below
							? `O kit está abaixo de ${KCAL.format(range.min)} kcal, o mínimo da classe.`
							: `O kit está acima de ${KCAL.format(range.max)} kcal, o máximo da classe.`}{" "}
						O padrão pode ser salvo assim.
					</p>
				)}
				{!data.complete && data.incomplete.length > 0 && (
					<p className="text-sm text-muted-foreground">Sem composição completa (não contam como 0 kcal): {data.incomplete.join(", ")}.</p>
				)}
			</div>
		)
	}

	return (
		<div className="space-y-2 border-t pt-4">
			<div className="flex flex-wrap items-center gap-2">
				<Flame className="size-4 text-muted-foreground" />
				<span className="text-subheading">Valor calórico por kit</span>
				<Badge variant="outline" className="font-normal">
					Faixa da classe: {rangeText}
				</Badge>
			</div>
			{normRef && <p className="text-xs text-muted-foreground">Referência: {normRef}.</p>}
			{body}
			<p className="text-xs text-muted-foreground">
				Calculado no servidor sobre as preparações e porções por kit gravadas{itemsDirty ? " — salve para atualizar com as alterações em aberto" : ""}.
			</p>
		</div>
	)
}
