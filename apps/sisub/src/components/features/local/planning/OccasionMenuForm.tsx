import { useMutation, useQueryClient } from "@tanstack/react-query"
import { type LinkOptions, useNavigate } from "@tanstack/react-router"
import { CalendarRange, GitFork, Loader2, Plus, Sandwich } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { OccasionMenuCopy } from "@/components/features/local/planning/occasion-menu-editor"
import {
	afterCreateHint,
	createdOccasionMessage,
	forkSourceSummary,
	isNoMealChosen,
	newOccasionDraftKey,
	newOccasionExplainerTail,
	occasionFormTitle,
	occasionNamePlaceholder,
} from "@/components/features/local/planning/occasion-menu-form"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { useTemplate } from "@/hooks/data/useTemplates"
import { isSnackStandard, OCCASION_MENU_COPY, type OccasionMenuType, parseMonthlyOccurrences, snackStandardLabel } from "@/lib/occasion-menu"
import { createBlankTemplateFn, forkTemplateFn } from "@/server/templates.fn"
import type { MenuTemplateWithItems } from "@/types/domain/planning"

type BaseTemplate = MenuTemplateWithItems

/** Modelo de origem da adaptação, com a escolha das refeições que a cópia leva. */
function ForkSourceCard({
	baseTemplate,
	isSourceGlobal,
	isSupportMenu,
	sourceMeals,
	skippedMealIds,
	onMealCheckedChange,
	noMealChosen,
}: {
	baseTemplate: BaseTemplate
	isSourceGlobal: boolean
	isSupportMenu: boolean
	sourceMeals: BaseTemplate["event_meals"]
	skippedMealIds: ReadonlySet<string>
	onMealCheckedChange: (mealId: string, checked: boolean) => void
	noMealChosen: boolean
}) {
	return (
		<Card className="border-dashed">
			<CardHeader className="pb-3">
				<CardTitle className="flex items-center gap-2">
					<GitFork className="size-4 text-muted-foreground" />
					Modelo de origem
				</CardTitle>
				<CardDescription>
					{forkSourceSummary(isSourceGlobal, isSupportMenu)} Alterações futuras no original não afetam a versão local.
					{isSupportMenu && isSnackStandard(baseTemplate) && (
						<>
							{" "}
							É um padrão de lanche ({snackStandardLabel(baseTemplate)}): a cópia leva a classificação, mas nasce fora do pedido e sem data de revisão —
							publique para o comensal no editor, depois de revisar.
						</>
					)}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="flex items-center gap-3">
					<div>
						<p className="text-subheading">{baseTemplate.name}</p>
						{baseTemplate.description && <p className="text-xs text-muted-foreground mt-0.5">{baseTemplate.description}</p>}
					</div>
					<Badge variant="outline" className="ml-auto">
						{isSourceGlobal ? "Global · SDAB" : "Cozinha"}
					</Badge>
				</div>
				{sourceMeals.length > 1 && (
					<Field className="mt-4">
						<FieldLabel>Refeições que a cópia leva</FieldLabel>
						<div className="space-y-1.5">
							{sourceMeals.map((meal) => {
								const count = baseTemplate.items.filter((i) => i.event_meal_id === meal.id).length
								const id = `fork-meal-${meal.id}`
								return (
									<div key={meal.id} className="flex items-center gap-2">
										<Checkbox id={id} checked={!skippedMealIds.has(meal.id)} onCheckedChange={(checked) => onMealCheckedChange(meal.id, checked)} />
										<Label htmlFor={id}>
											{meal.name}
											<span className="text-muted-foreground">
												{" "}
												· {count} {count === 1 ? "preparação" : "preparações"}
											</span>
										</Label>
									</div>
								)
							})}
						</div>
						{noMealChosen ? (
							<p className="text-sm text-destructive">Marque ao menos uma refeição.</p>
						) : (
							<FieldDescription>Desmarque as refeições que não vão ser usadas: elas e as preparações delas ficam fora da cópia.</FieldDescription>
						)}
					</Field>
				)}
			</CardContent>
		</Card>
	)
}

/** Orientação da criação do zero (cozinha ou catálogo global). */
function NewOccasionExplainer({
	isSupportMenu,
	isGlobal,
	templateType,
	copy,
}: {
	isSupportMenu: boolean
	isGlobal: boolean
	templateType: OccasionMenuType
	copy: OccasionMenuCopy
}) {
	const Icon = isSupportMenu ? Sandwich : CalendarRange
	return (
		<div className="rounded-md border bg-muted/30 p-4 flex items-start gap-3">
			<Icon className="size-4 text-muted-foreground mt-0.5 shrink-0" />
			<p className="text-sm text-muted-foreground">
				{copy.explainer} {newOccasionExplainerTail({ isGlobal, templateType, copy })}
			</p>
		</div>
	)
}

function OccasionFormFooter({
	isFork,
	copy,
	isPending,
	name,
	noMealChosen,
	onCancel,
}: {
	isFork: boolean
	copy: OccasionMenuCopy
	isPending: boolean
	name: string
	noMealChosen: boolean
	onCancel: () => void
}) {
	return (
		<div className="flex items-center justify-between">
			<p className="text-xs text-muted-foreground">{afterCreateHint(isFork, copy)}</p>
			<div className="flex gap-2">
				<Button type="button" variant="outline" onClick={onCancel}>
					Cancelar
				</Button>
				<Button type="submit" disabled={isPending || !name.trim() || noMealChosen}>
					{isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
					{isFork ? <GitFork className="size-4 mr-2" /> : <Plus className="size-4 mr-2" />}
					{isFork ? "Criar Adaptação" : `Criar ${copy.singular}`}
				</Button>
			</div>
		</div>
	)
}

interface OccasionMenuFormProps {
	templateType: OccasionMenuType
	/** `null` = catálogo global da SDAB. */
	kitchenId: number | null
	/** Modelo global a adaptar para a cozinha. Só faz sentido com `kitchenId`. */
	forkFrom?: string
	/** Pasta do catálogo global onde o modelo nasce. Só faz sentido no global. */
	folderId?: string
	listLink: LinkOptions
	editorLink: (templateId: string) => LinkOptions
}

/**
 * Criação de evento ou apoio — do zero (cozinha ou catálogo global) ou adaptando um modelo
 * global para a cozinha.
 *
 * A adaptação de um modelo GLOBAL leva preparações, grupos e proporções; efetivo, pax e
 * ocorrências por mês ficam para a cozinha preencher (o global só tem quantidade relativa). A
 * cópia de um cardápio de cozinha leva tudo. Com mais de uma refeição na origem (evento da
 * cozinha, kit de duas partes), dá para escolher quais levar; o modelo global de evento tem uma só.
 */
export function OccasionMenuForm({ templateType, kitchenId, forkFrom, folderId, listLink, editorLink }: OccasionMenuFormProps) {
	const navigate = useNavigate()
	const queryClient = useQueryClient()
	const copy = OCCASION_MENU_COPY[templateType]
	const isSupportMenu = templateType === "apoio"
	const isGlobal = kitchenId === null
	const isFork = !!forkFrom && !isGlobal

	const { data: baseTemplate } = useTemplate(isFork ? (forkFrom ?? null) : null)

	const [name, setName] = useState("")
	const [description, setDescription] = useState("")
	const [occurrences, setOccurrences] = useState("")
	// Refeições do modelo que a cópia NÃO leva. Guardar as desmarcadas faz "todas" ser o padrão
	// sem esperar o modelo carregar.
	const [skippedMealIds, setSkippedMealIds] = useState<ReadonlySet<string>>(new Set())
	const sourceMeals = baseTemplate?.event_meals ?? []
	const chosenMealIds = sourceMeals.filter((m) => !skippedMealIds.has(m.id)).map((m) => m.id)
	const isSourceGlobal = baseTemplate?.kitchen_id == null

	// Adaptação nasce com o nome do modelo: exigir que se redigite um nome para copiar era o
	// passo a mais que fazia a cozinha montar o evento "na mão" em vez de adaptar o da SDAB.
	const prefilledRef = useRef(false)
	useEffect(() => {
		if (!isFork || prefilledRef.current || !baseTemplate?.name) return
		prefilledRef.current = true
		setName((current) => current || (baseTemplate.name ?? ""))
	}, [isFork, baseTemplate])

	const storageKey = newOccasionDraftKey(templateType, kitchenId)
	const storageLoadedRef = useRef(false)

	useEffect(() => {
		if (isFork || storageLoadedRef.current) return
		storageLoadedRef.current = true
		try {
			const stored = sessionStorage.getItem(storageKey)
			if (stored) {
				const parsed = JSON.parse(stored) as { name?: string; description?: string; occurrences?: string }
				if (parsed.name) setName(parsed.name)
				if (parsed.description) setDescription(parsed.description)
				if (parsed.occurrences) setOccurrences(parsed.occurrences)
			}
		} catch {}
	}, [isFork, storageKey])

	useEffect(() => {
		if (isFork || !storageLoadedRef.current) return
		try {
			sessionStorage.setItem(storageKey, JSON.stringify({ name, description, occurrences }))
		} catch {}
	}, [name, description, occurrences, isFork, storageKey])

	const onCreated = (data: { id: string; name: string | null }, message: string) => {
		queryClient.invalidateQueries({ queryKey: ["menu_templates"] })
		try {
			sessionStorage.removeItem(storageKey)
		} catch {}
		toast.success(message)
		navigate(editorLink(data.id))
	}

	const { mutate: createBlank, isPending: isCreating } = useMutation({
		mutationFn: () => {
			if (!name.trim()) throw new Error("Dados incompletos")
			return createBlankTemplateFn({
				data: {
					name: name.trim(),
					description: description.trim() || undefined,
					kitchenId,
					templateType,
					...(isGlobal && folderId ? { folderId } : {}),
					// Ocorrências por mês são da cozinha: o modelo global não as tem.
					...(isSupportMenu && !isGlobal ? { expectedMonthlyOccurrences: parseMonthlyOccurrences(occurrences) } : {}),
				},
			})
		},
		onSuccess: (data) => onCreated(data, createdOccasionMessage(copy, data.name)),
		onError: (err) => toast.error(`Erro: ${err.message}`),
	})

	const { mutate: createFork, isPending: isForking } = useMutation({
		mutationFn: () => {
			if (kitchenId === null || !forkFrom || !name.trim()) throw new Error("Dados incompletos")
			return forkTemplateFn({
				data: {
					sourceTemplateId: forkFrom,
					targetKitchenId: kitchenId,
					newName: name.trim(),
					description: description.trim() || undefined,
					// Ausente = todas. Só manda a escolha quando alguma ficou de fora.
					...(chosenMealIds.length < sourceMeals.length ? { occasionMealIds: chosenMealIds } : {}),
				},
			})
		},
		onSuccess: (data) => onCreated(data, `Adaptação "${data.name}" criada com sucesso!`),
		onError: (err) => toast.error(`Erro ao adaptar: ${err.message}`),
	})

	const isPending = isCreating || isForking
	// A cópia precisa de ao menos uma refeição (quando o modelo tem refeições).
	const noMealChosen = isNoMealChosen(isFork, sourceMeals.length, chosenMealIds.length)

	const handleSubmit = () => {
		if (!name.trim() || noMealChosen) return
		if (isFork) createFork()
		else createBlank()
	}

	const title = occasionFormTitle({ isFork, isGlobal, copy })
	const handleMealCheckedChange = (mealId: string, checked: boolean) =>
		setSkippedMealIds((prev) => {
			const next = new Set(prev)
			if (checked) next.delete(mealId)
			else next.add(mealId)
			return next
		})

	return (
		<div className="space-y-6">
			<PageHeader
				title={title}
				description={isFork ? `Cria uma cópia independente d${copy.article} ${copy.noun} global para sua cozinha.` : undefined}
				onBack={() => navigate(listLink)}
			/>

			<div className="mx-auto w-full max-w-2xl space-y-6">
				{isFork ? (
					baseTemplate && (
						<ForkSourceCard
							baseTemplate={baseTemplate}
							isSourceGlobal={isSourceGlobal}
							isSupportMenu={isSupportMenu}
							sourceMeals={sourceMeals}
							skippedMealIds={skippedMealIds}
							onMealCheckedChange={handleMealCheckedChange}
							noMealChosen={noMealChosen}
						/>
					)
				) : (
					<NewOccasionExplainer isSupportMenu={isSupportMenu} isGlobal={isGlobal} templateType={templateType} copy={copy} />
				)}

				<form
					onSubmit={(e) => {
						e.preventDefault()
						handleSubmit()
					}}
					className="space-y-4"
				>
					<div className="rounded-md border bg-card p-6 space-y-4">
						<div className="space-y-2">
							<Label htmlFor="name">
								Nome d{copy.article} {copy.singular} <span className="text-destructive">*</span>
							</Label>
							<Input
								id="name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder={occasionNamePlaceholder(isFork, baseTemplate?.name, copy)}
								required
								suppressHydrationWarning
							/>
						</div>

						{/* Ocorrências por mês são da cozinha: o modelo global não as tem. */}
						{isSupportMenu && !isFork && !isGlobal && (
							<div className="space-y-2">
								<Label htmlFor="occurrences">Ocorrências por mês (opcional)</Label>
								<Input
									id="occurrences"
									type="number"
									min={1}
									inputMode="numeric"
									value={occurrences}
									onChange={(e) => setOccurrences(e.target.value)}
									placeholder="Ex.: 30 lanches de bordo/mês"
								/>
								<p className="text-xs text-muted-foreground">
									Usado para multiplicar o custeio no anexo quantitativo. Em branco, conta como 1 ocorrência. Para um padrão de lanche (Módulo 7), marque-o no
									editor depois de criar: este número passa a ser kits por mês.
								</p>
							</div>
						)}

						<div className="space-y-2">
							<Label htmlFor="description">Descrição (opcional)</Label>
							<Textarea
								id="description"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder={`Contexto d${copy.article} ${copy.noun} ou observações relevantes`}
								rows={2}
							/>
						</div>
					</div>

					<OccasionFormFooter isFork={isFork} copy={copy} isPending={isPending} name={name} noMealChosen={noMealChosen} onCancel={() => navigate(listLink)} />
				</form>
			</div>
		</div>
	)
}
