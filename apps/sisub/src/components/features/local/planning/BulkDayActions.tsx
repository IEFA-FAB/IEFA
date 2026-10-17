/**
 * Edição em lote do calendário: o que a nutricionista faz em vários dias de uma vez.
 *
 * Os dias vêm da seleção do calendário (Ctrl/Shift+clique, ou "selecionar os dias" da busca).
 * Cada ação é uma operação de domínio numa transação só (`planning-bulk`), exceto o
 * quantitativo, que é o mesmo `updateHeadcount` do dia, refeição a refeição. O que já começou a
 * ser produzido não muda, e o aviso diz quantos ficaram de fora.
 */

import { addDays, differenceInCalendarDays, format, getISODay, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ArrowRightLeft, CalendarX2, RefreshCcw, Repeat2, Search, Users, X } from "lucide-react"
import { useMemo, useState } from "react"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from "@/components/ui/combobox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { toast } from "@/components/ui/toast"
import { useUpdateHeadcount } from "@/hooks/data/usePlanning"
import { useClearPlannedDays, useRefreshRecipeVersionsInDays, useReplaceRecipeInDays, useShiftPlannedDays } from "@/hooks/data/usePlanningBulk"
import { useRecipes } from "@/hooks/data/useRecipes"
import { cn } from "@/lib/cn"
import type { HeadcountPlanByDays } from "@/lib/menu-fill"
import { WEEKDAY_GROUPS } from "@/lib/weekdays"
import type { DailyMenuWithItems } from "@/types/domain/planning"
import { collectOutdatedById } from "./day-drawer"
import { MenuHeadcountDialog } from "./MenuHeadcountDialog"
import { RecipeSelector } from "./RecipeSelector"

type ScheduledRecipe = { id: string; name: string; days: string[] }

const NUM_DAYS = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`
const shortDate = (iso: string) => format(parseISO(iso), "dd/MM")

function normalize(value: string) {
	return value
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
}

/** Preparações agendadas nos cardápios, com os dias em que cada uma aparece. */
export function collectScheduledRecipes(menus: readonly DailyMenuWithItems[]): ScheduledRecipe[] {
	const byId = new Map<string, ScheduledRecipe>()
	for (const menu of menus) {
		if (!menu.service_date) continue
		for (const item of menu.menu_items ?? []) {
			const recipe = item.recipe_origin
			if (!recipe) continue
			const entry = byId.get(recipe.id) ?? { id: recipe.id, name: recipe.name ?? "Preparação", days: [] }
			if (!entry.days.includes(menu.service_date)) entry.days.push(menu.service_date)
			byId.set(recipe.id, entry)
		}
	}
	return [...byId.values()].map((r) => ({ ...r, days: r.days.toSorted() })).toSorted((a, b) => a.name.localeCompare(b.name, "pt-BR"))
}

/** Busca de preparação agendada (lista longa: combobox com busca, nunca `<select>`). */
function RecipeCombobox({
	recipes,
	value,
	onChange,
	placeholder,
}: {
	recipes: readonly ScheduledRecipe[]
	value: string | null
	onChange: (id: string | null) => void
	placeholder: string
}) {
	const [open, setOpen] = useState(false)
	const selected = recipes.find((r) => r.id === value) ?? null
	return (
		<Combobox
			items={recipes as ScheduledRecipe[]}
			value={selected}
			autoHighlight
			isItemEqualToValue={(item: ScheduledRecipe, current: ScheduledRecipe) => item.id === current.id}
			itemToStringLabel={(item: ScheduledRecipe) => item.name}
			filter={(item: ScheduledRecipe, query) => normalize(item.name).includes(normalize(query))}
			open={open}
			onOpenChange={setOpen}
			onValueChange={(next) => {
				onChange((next as ScheduledRecipe | null)?.id ?? null)
				setOpen(false)
			}}
		>
			<ComboboxTrigger render={<Button type="button" variant="outline" className="w-full justify-between sm:w-72" />}>
				<span className="flex min-w-0 items-center gap-2">
					<Search className="size-4 shrink-0" />
					<span className="truncate">{selected?.name ?? placeholder}</span>
				</span>
			</ComboboxTrigger>
			<ComboboxContent className="min-w-80">
				<ComboboxInput showTrigger={false} placeholder="Nome da preparação" aria-label="Nome da preparação" />
				<ComboboxEmpty>Nenhuma preparação agendada com esse nome.</ComboboxEmpty>
				<ComboboxList className="max-h-80">
					{(item: ScheduledRecipe) => (
						<ComboboxItem key={item.id} value={item}>
							<span className="flex w-full items-center justify-between gap-3">
								<span className="truncate">{item.name}</span>
								<span className="text-caption text-muted-foreground shrink-0">{NUM_DAYS(item.days.length)}</span>
							</span>
						</ComboboxItem>
					)}
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	)
}

/**
 * Localizar preparação: os dias em que ela está agendada ficam marcados no calendário, e um
 * clique os seleciona para a ação em lote (trocar a preparação, apagar, mover).
 */
export function FindRecipeBar({
	menus,
	highlighted,
	onHighlight,
	onSelectDays,
}: {
	menus: readonly DailyMenuWithItems[]
	highlighted: string | null
	onHighlight: (recipeId: string | null) => void
	onSelectDays: (dates: string[]) => void
}) {
	const recipes = useMemo(() => collectScheduledRecipes(menus), [menus])
	const current = recipes.find((r) => r.id === highlighted)
	return (
		<div className="flex flex-wrap items-center gap-2">
			<RecipeCombobox recipes={recipes} value={highlighted} onChange={onHighlight} placeholder="Localizar preparação" />
			{current && (
				<>
					<span className="text-caption text-muted-foreground">
						{NUM_DAYS(current.days.length)} no calendário: {current.days.map(shortDate).join(", ")}
					</span>
					<Button type="button" size="sm" variant="outline" onClick={() => onSelectDays(current.days)}>
						Selecionar {current.days.length === 1 ? "o dia" : "os dias"}
					</Button>
					<Button type="button" size="icon-sm" variant="ghost" aria-label="Limpar busca" onClick={() => onHighlight(null)}>
						<X />
					</Button>
				</>
			)}
		</div>
	)
}

/** Barra que aparece com dias selecionados: as ações em lote sobre eles. */
export function BulkDayToolbar({
	kitchenId,
	dates,
	menus,
	onClearSelection,
	onShift,
}: {
	kitchenId: number
	/** Datas civis selecionadas, em ordem. */
	dates: readonly string[]
	/** Cardápios visíveis no calendário (a seleção está dentro deles). */
	menus: readonly DailyMenuWithItems[]
	onClearSelection: () => void
	onShift: () => void
}) {
	const dateSet = useMemo(() => new Set(dates), [dates])
	const selectedMenus = useMemo(() => menus.filter((m) => m.service_date && dateSet.has(m.service_date)), [menus, dateSet])
	const recipes = useMemo(() => collectScheduledRecipes(selectedMenus), [selectedMenus])
	const { data: catalog } = useRecipes({ kitchen_id: kitchenId })
	const outdated = useMemo(() => collectOutdatedById(selectedMenus, catalog), [selectedMenus, catalog])
	const outdatedCount = selectedMenus.reduce((n, m) => n + (m.menu_items ?? []).filter((i) => i.recipe_origin_id && outdated.has(i.recipe_origin_id)).length, 0)

	const [dialog, setDialog] = useState<"headcount" | "replace" | "versions" | "clear" | null>(null)
	const clearDays = useClearPlannedDays()
	const refreshVersions = useRefreshRecipeVersionsInDays()
	const { mutateAsync: updateHeadcount } = useUpdateHeadcount({ silent: true })

	const mealTypes = useMemo(() => {
		const seen = new Map<string, string | null>()
		for (const m of selectedMenus) if (m.meal_type_id && !seen.has(m.meal_type_id)) seen.set(m.meal_type_id, m.meal_type?.name ?? null)
		return [...seen.entries()].map(([id, name]) => ({ id, name }))
	}, [selectedMenus])

	/** Refeições que recebem o número: a do dia certo (faixa da semana), sem sobrescrever se não pedido. */
	const headcountTargets = (plans: HeadcountPlanByDays, overwrite: boolean) =>
		selectedMenus.flatMap((menu) => {
			const isoDay = getISODay(parseISO(menu.service_date as string))
			const value = plans.find((p) => p.days.includes(isoDay))?.plan.get(menu.meal_type_id ?? "")
			if (value == null || (!overwrite && menu.forecasted_headcount) || menu.forecasted_headcount === value) return []
			return [{ dailyMenuId: menu.id, forecastedHeadcount: value }]
		})

	const label = `${NUM_DAYS(dates.length)} selecionado${dates.length === 1 ? "" : "s"}`
	const hasMenus = selectedMenus.length > 0

	return (
		<div
			role="toolbar"
			aria-label="Ações nos dias selecionados"
			className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2"
		>
			<span className="text-subheading">{label}</span>
			<span className="text-caption text-muted-foreground">{dates.map(shortDate).join(", ")}</span>
			<div className="ml-auto flex flex-wrap gap-1.5">
				<Button type="button" size="sm" variant="outline" disabled={!hasMenus} onClick={() => setDialog("headcount")}>
					<Users />
					Quantitativo
				</Button>
				<Button type="button" size="sm" variant="outline" disabled={recipes.length === 0} onClick={() => setDialog("replace")}>
					<Repeat2 />
					Substituir preparação
				</Button>
				<Button type="button" size="sm" variant="outline" disabled={outdatedCount === 0} onClick={() => setDialog("versions")}>
					<RefreshCcw />
					Atualizar versões{outdatedCount > 0 ? ` (${outdatedCount})` : ""}
				</Button>
				<Button type="button" size="sm" variant="outline" disabled={!hasMenus} onClick={onShift}>
					<ArrowRightLeft />
					Mover ou copiar
				</Button>
				<Button type="button" size="sm" variant="subtle-destructive" disabled={!hasMenus} onClick={() => setDialog("clear")}>
					<CalendarX2 />
					Apagar
				</Button>
				<Button type="button" size="sm" variant="ghost" onClick={onClearSelection}>
					<X />
					Limpar seleção
				</Button>
			</div>

			<MenuHeadcountDialog
				open={dialog === "headcount"}
				onOpenChange={(open) => !open && setDialog(null)}
				mealTypes={mealTypes}
				scope="day-menu"
				dayGroups={WEEKDAY_GROUPS}
				countTargets={(plans, overwrite) => headcountTargets(plans, overwrite).length}
				onApply={async (plans, overwrite) => {
					const targets = headcountTargets(plans, overwrite)
					const results = await Promise.allSettled(targets.map((t) => updateHeadcount(t)))
					const failed = results.filter((r) => r.status === "rejected").length
					if (failed > 0) toast.error(`${targets.length - failed} refeições atualizadas, ${failed} falharam.`)
					else toast.success(`${targets.length} ${targets.length === 1 ? "refeição atualizada" : "refeições atualizadas"} em ${NUM_DAYS(dates.length)}.`)
				}}
			/>

			<ReplaceRecipeDialog open={dialog === "replace"} onClose={() => setDialog(null)} kitchenId={kitchenId} dates={dates} recipes={recipes} />

			<AlertDialog open={dialog === "versions"} onOpenChange={(open) => !open && setDialog(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Atualizar para a versão vigente?</AlertDialogTitle>
						<AlertDialogDescription>
							{outdatedCount} {outdatedCount === 1 ? "preparação está" : "preparações estão"} numa versão superada da ficha em {NUM_DAYS(dates.length)}. A ficha
							congelada do dia passa a ser a da versão vigente; porções, grupo e substitutos ficam. Não é troca de preparação: o turno não recebe aviso.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
						{[...outdated.values()].map((o) => (
							<li key={o.current.id}>
								{o.current.name}: v{o.current.version} → v{o.latest.version}
							</li>
						))}
					</ul>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancelar</AlertDialogCancel>
						<AlertDialogAction
							disabled={refreshVersions.isPending}
							onClick={() => refreshVersions.mutate({ kitchenId, dates: [...dates] }, { onSuccess: () => setDialog(null) })}
						>
							Atualizar versões
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog open={dialog === "clear"} onOpenChange={(open) => !open && setDialog(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Apagar o planejado de {NUM_DAYS(dates.length)}?</AlertDialogTitle>
						<AlertDialogDescription>
							Todas as preparações de {dates.map(shortDate).join(", ")} vão para a lixeira do agendamento, de onde dá para restaurar. Produção de pedido de
							lanche e o que já começou a ser produzido ficam.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancelar</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={clearDays.isPending}
							onClick={() =>
								clearDays.mutate(
									{ kitchenId, dates: [...dates] },
									{
										onSuccess: () => {
											setDialog(null)
											onClearSelection()
										},
									}
								)
							}
						>
							Apagar {NUM_DAYS(dates.length)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}

/** Substituir preparação: escolhe a que sai (entre as agendadas nos dias), a que entra e o motivo. */
function ReplaceRecipeDialog({
	open,
	onClose,
	kitchenId,
	dates,
	recipes,
}: {
	open: boolean
	onClose: () => void
	kitchenId: number
	dates: readonly string[]
	recipes: readonly ScheduledRecipe[]
}) {
	const [fromId, setFromId] = useState<string | null>(null)
	const [to, setTo] = useState<{ id: string; name: string } | null>(null)
	const [choosingTo, setChoosingTo] = useState(false)
	const [rationale, setRationale] = useState("")
	const replace = useReplaceRecipeInDays()
	const from = recipes.find((r) => r.id === fromId)
	const { data: catalog } = useRecipes({ kitchen_id: kitchenId })

	const reset = () => {
		setFromId(null)
		setTo(null)
		setRationale("")
	}

	return (
		<>
			<Dialog
				open={open && !choosingTo}
				onOpenChange={(next) => {
					if (!next) {
						reset()
						onClose()
					}
				}}
			>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Substituir preparação em {NUM_DAYS(dates.length)}</DialogTitle>
						<DialogDescription>Cada item trocado guarda o motivo, que o turno vê na Produção Cozinha. Porções, grupo e origem ficam.</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<Field>
							<FieldLabel>Sai</FieldLabel>
							<RecipeCombobox recipes={recipes} value={fromId} onChange={setFromId} placeholder="Preparação agendada" />
							{from && <FieldDescription>Agendada em {from.days.map(shortDate).join(", ")}.</FieldDescription>}
						</Field>
						<Field>
							<FieldLabel>Entra</FieldLabel>
							<Button type="button" variant="outline" className="w-full justify-start sm:w-72" onClick={() => setChoosingTo(true)}>
								{to?.name ?? "Escolher preparação"}
							</Button>
						</Field>
						<Field>
							<FieldLabel htmlFor="bulk-replace-rationale">Motivo</FieldLabel>
							<Input
								id="bulk-replace-rationale"
								value={rationale}
								onChange={(e) => setRationale(e.target.value)}
								placeholder="Ex.: fornecedor deixou de entregar o peixe"
								maxLength={300}
							/>
						</Field>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => {
								reset()
								onClose()
							}}
						>
							Cancelar
						</Button>
						<Button
							type="button"
							disabled={!from || !to || !rationale.trim() || replace.isPending}
							onClick={() => {
								if (!from || !to) return
								replace.mutate(
									{ kitchenId, dates: [...dates], fromRecipeId: from.id, toRecipeId: to.id, rationale: rationale.trim() },
									{
										onSuccess: () => {
											reset()
											onClose()
										},
									}
								)
							}}
						>
							Substituir
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<RecipeSelector
				key={`bulk-replace-${choosingTo}`}
				open={open && choosingTo}
				onClose={() => setChoosingTo(false)}
				kitchenId={kitchenId}
				selectedRecipeIds={[]}
				multiSelect={false}
				title="Preparação que entra"
				description={from ? `No lugar de ${from.name}.` : undefined}
				onSelect={(ids) => {
					const id = ids[0]
					setChoosingTo(false)
					if (!id) return
					const recipe = catalog?.find((r) => r.id === id)
					setTo({ id, name: recipe?.name ?? "Preparação escolhida" })
				}}
			/>
		</>
	)
}

export type ShiftRequest = { dates: string[]; offsetDays: number }

/**
 * Mover ou copiar dias: o destino é o novo primeiro dia, e os outros mantêm o espaçamento. Vem
 * da barra (destino padrão: a semana seguinte) ou de arrastar um dia sobre outro.
 */
export function ShiftDaysDialog({
	kitchenId,
	request,
	onClose,
	onDone,
}: {
	kitchenId: number
	request: ShiftRequest | null
	onClose: () => void
	onDone: () => void
}) {
	const shift = useShiftPlannedDays()
	const dates = request?.dates ?? []
	const first = dates[0]
	const [mode, setMode] = useState<"move" | "copy">("move")
	const [target, setTarget] = useState<string>("")
	const [replaceTarget, setReplaceTarget] = useState(false)
	const firstTarget = target || (first && request ? format(addDays(parseISO(first), request.offsetDays), "yyyy-MM-dd") : "")
	const offsetDays = first && firstTarget ? differenceInCalendarDays(parseISO(firstTarget), parseISO(first)) : 0
	const targets = dates.map((d) => format(addDays(parseISO(d), offsetDays), "yyyy-MM-dd"))

	const close = () => {
		setTarget("")
		setMode("move")
		setReplaceTarget(false)
		onClose()
	}

	return (
		<Dialog open={request != null} onOpenChange={(open) => !open && close()}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Mover ou copiar {NUM_DAYS(dates.length)}</DialogTitle>
					<DialogDescription>
						{dates.map(shortDate).join(", ")} → {targets.map(shortDate).join(", ")}
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<RadioGroup value={mode} onValueChange={(value) => setMode(value as "move" | "copy")} className="grid sm:grid-cols-2">
						{(
							[
								["move", "Mover", "Leva as preparações com os ajustes do dia e as tarefas pendentes. O dia de origem fica vazio."],
								["copy", "Copiar", "Repete as preparações e as porções no destino. A origem fica como está."],
							] as const
						).map(([value, title, hint]) => (
							<label
								key={value}
								htmlFor={`shift-mode-${value}`}
								className={cn("flex gap-2 rounded-md border p-3", mode === value && "border-primary bg-primary/5")}
							>
								<RadioGroupItem id={`shift-mode-${value}`} value={value} className="mt-0.5" />
								<span className="space-y-0.5">
									<span className="text-subheading block">{title}</span>
									<span className="text-caption text-muted-foreground block">{hint}</span>
								</span>
							</label>
						))}
					</RadioGroup>
					<Field>
						<FieldLabel htmlFor="shift-target">Novo primeiro dia</FieldLabel>
						<Input id="shift-target" type="date" value={firstTarget} onChange={(e) => setTarget(e.target.value)} className="w-44" />
						{firstTarget && (
							<FieldDescription>
								{capitalize(format(parseISO(firstTarget), "EEEE, d 'de' MMMM", { locale: ptBR }))}
								{offsetDays !== 0 && ` (${offsetDays > 0 ? "+" : ""}${offsetDays} ${Math.abs(offsetDays) === 1 ? "dia" : "dias"})`}
							</FieldDescription>
						)}
					</Field>
					<label htmlFor="shift-replace-target" className="flex items-start gap-2 text-sm">
						<Checkbox id="shift-replace-target" checked={replaceTarget} onCheckedChange={(checked) => setReplaceTarget(checked === true)} className="mt-0.5" />
						<span>
							Substituir o que já está no destino
							<span className="text-caption text-muted-foreground block">
								Sem isto, destino com preparação é recusado. O que sai do destino vai para a lixeira.
							</span>
						</span>
					</label>
				</div>
				<DialogFooter>
					<Button type="button" variant="outline" onClick={close}>
						Cancelar
					</Button>
					<Button
						type="button"
						disabled={offsetDays === 0 || shift.isPending}
						onClick={() =>
							shift.mutate(
								{ kitchenId, dates, offsetDays, mode, replaceTarget },
								{
									onSuccess: () => {
										close()
										onDone()
									},
								}
							)
						}
					>
						{mode === "move" ? "Mover" : "Copiar"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
