"use client"

// shadcn/ui – imports corrigidos
import { createFileRoute } from "@tanstack/react-router"
import { Calendar, Clock, Expand } from "iconoir-react"
import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { FacilidadesTable } from "@/components/table"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { supabase } from "@/lib/supabase"
import { getPreferencesFn, insertFacilityFn, insertPreferencesFn, updateFacilityFn, upsertPreferencesFn } from "@/server/pregoeiro.fn"
import type { FacilidadesTableProps } from "@/types/domain"

/* -----------------------------------------------
   Tipos auxiliares (alinhar com a tabela existente)
-------------------------------------------------- */

type Facility = {
	id?: string
	created_at?: string
	phase: string
	title: string
	content: string
	tags: string[] | null
	owner_id?: string | null
	default?: boolean | null
}

export const Route = createFileRoute("/_public/facilities/pregoeiro")({
	staticData: {
		nav: {
			title: "Pregoeiro",
			section: "Facilidades",
			subtitle: "Ferramenta de apoio ao pregoeiro",
			keywords: ["licitacao", "compras", "pregao", "suite"],
			order: 21,
		},
	},
	component: Pregoeiro,
	head: () => ({
		meta: [{ title: "Facilidades do Pregoeiro" }, { name: "description", content: "Suite de Soluções do IEFA" }],
	}),
})

/* -----------------------------------------------
   Hook de preferências (Supabase + LocalStorage)
-------------------------------------------------- */

const LS_KEY = "pregoeiro_preferences_v1"

type Prefs = {
	env: FacilidadesTableProps
	is_open: boolean
}

const DEFAULT_PREFS: Prefs = {
	env: {
		OM: "o IEFA",
		Hour: "09:00h",
		Date: "15/04 (terça-feira)",
		Hour_limit: "2 (duas)",
	},
	is_open: false,
}

function usePregoeiroPreferences() {
	const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS)
	const [loading, setLoading] = useState(true)
	const [userId, setUserId] = useState<string | null>(null)
	const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

	// Carrega usuário atual
	useEffect(() => {
		let mounted = true
		supabase.auth.getUser().then(({ data }) => {
			if (!mounted) return
			setUserId(data.user?.id ?? null)
		})
		return () => {
			mounted = false
		}
	}, [])

	// Carrega preferências (Supabase se autenticado, senão localStorage)
	useEffect(() => {
		let mounted = true

		async function load() {
			setLoading(true)
			try {
				if (userId) {
					const row = (await getPreferencesFn({ data: { userId } })) as {
						env?: Record<string, unknown>
						is_open?: boolean
					} | null

					if (row) {
						const env = { ...DEFAULT_PREFS.env, ...(row.env || {}) } as typeof DEFAULT_PREFS.env
						const is_open = row.is_open ?? DEFAULT_PREFS.is_open
						setPrefs({ env, is_open })
					} else {
						await insertPreferencesFn({
							data: { userId, env: DEFAULT_PREFS.env as Record<string, unknown>, is_open: DEFAULT_PREFS.is_open },
						})
						setPrefs(DEFAULT_PREFS)
					}
				} else {
					// anônimo -> localStorage
					const raw = typeof window !== "undefined" ? localStorage.getItem(LS_KEY) : null
					if (raw) {
						const parsed = JSON.parse(raw) as Prefs
						setPrefs({
							env: { ...DEFAULT_PREFS.env, ...(parsed.env || {}) },
							is_open: parsed.is_open ?? DEFAULT_PREFS.is_open,
						})
					} else {
						setPrefs(DEFAULT_PREFS)
					}
				}
			} catch (_e) {
				// fallback seguro
				setPrefs(DEFAULT_PREFS)
			} finally {
				if (mounted) setLoading(false)
			}
		}

		load()
		return () => {
			mounted = false
		}
	}, [userId])

	// Salva com debounce (Supabase ou localStorage)
	const persist = (next: Prefs) => {
		if (saveTimer.current) clearTimeout(saveTimer.current)
		saveTimer.current = setTimeout(async () => {
			try {
				if (userId) {
					await upsertPreferencesFn({
						data: { userId, env: next.env as Record<string, unknown>, is_open: next.is_open },
					})
				} else if (typeof window !== "undefined") {
					localStorage.setItem(LS_KEY, JSON.stringify(next))
				}
			} catch {
				// manter silencioso; UI não deve travar por causa disso
			}
		}, 900)
	}

	// Setters
	const setEnv = (updater: (prev: FacilidadesTableProps) => FacilidadesTableProps) => {
		setPrefs((prev) => {
			const next: Prefs = { ...prev, env: updater(prev.env) }
			persist(next)
			return next
		})
	}

	const setIsOpen = (value: boolean | ((prev: boolean) => boolean)) => {
		setPrefs((prev) => {
			const nextIsOpen = typeof value === "function" ? value(prev.is_open) : value
			const next: Prefs = { ...prev, is_open: nextIsOpen }
			persist(next)
			return next
		})
	}

	return { prefs, setEnv, setIsOpen, loading, userId }
}

/* -----------------------------------------------
   Skeleton da tabela (Suspense fallback)
-------------------------------------------------- */

// Proporções aproximadas das colunas: fase | título | conteúdo | tags | padrão | ações
const COL_WIDTHS = [14, 22, 36, 12, 8, 8]

function TableSkeleton() {
	return (
		<div className="w-full space-y-4">
			{/* Toolbar */}
			<div className="flex items-center justify-between gap-2 flex-wrap">
				<Skeleton className="h-9 w-64" />
				<div className="flex items-center gap-2">
					<Skeleton className="h-4 w-32" />
					<Skeleton className="h-9 w-20" />
					<Skeleton className="h-9 w-24" />
				</div>
			</div>

			{/* Tabela */}
			<div className="border overflow-hidden">
				{/* Cabeçalho */}
				<div className="flex border-b bg-muted/40">
					{COL_WIDTHS.map((w, i) => (
						<div key={i} className="p-3 border-r last:border-r-0" style={{ width: `${w}%` }}>
							<Skeleton className="h-3 w-4/5" />
						</div>
					))}
				</div>
				{/* Linhas */}
				{Array.from({ length: 7 }).map((_, ri) => (
					<div key={ri} className="flex border-b last:border-b-0">
						{COL_WIDTHS.map((w, ci) => (
							<div key={ci} className="p-4 border-r last:border-r-0" style={{ width: `${w}%` }}>
								<Skeleton className="h-4 w-full" />
								{ci === 2 && <Skeleton className="h-4 w-4/5 mt-2" />}
								{ci === 2 && <Skeleton className="h-4 w-3/5 mt-2" />}
							</div>
						))}
					</div>
				))}
			</div>

			{/* Paginação */}
			<div className="flex items-center justify-between gap-2 flex-wrap">
				<Skeleton className="h-4 w-48" />
				<div className="flex gap-2">
					{Array.from({ length: 4 }).map((_, i) => (
						<Skeleton key={i} className="h-8 w-16" />
					))}
				</div>
			</div>
		</div>
	)
}

/* -----------------------------------------------
   Modal de Cadastro/Edição de Frase
-------------------------------------------------- */

type PhraseModalProps = {
	open: boolean
	onOpenChange: (v: boolean) => void
	initial?: Facility | null
	currentUserId: string | null
	onSaved?: () => void
}

function parseTags(input: string): string[] {
	return input
		.split(",")
		.map((t) => t.trim())
		.filter(Boolean)
}

function PhraseModal({ open, onOpenChange, initial, currentUserId, onSaved }: PhraseModalProps) {
	const isEdit = Boolean(initial?.id)
	const [phase, setPhase] = useState(initial?.phase ?? "")
	const [title, setTitle] = useState(initial?.title ?? "")
	const [content, setContent] = useState(initial?.content ?? "")
	const [tagsText, setTagsText] = useState((initial?.tags ?? []).join(", "))
	const [saving, setSaving] = useState(false)

	useEffect(() => {
		if (open) {
			setPhase(initial?.phase ?? "")
			setTitle(initial?.title ?? "")
			setContent(initial?.content ?? "")
			setTagsText((initial?.tags ?? []).join(", "))
		}
	}, [open, initial])

	const canEdit = useMemo(() => {
		if (!isEdit) return true
		if (!currentUserId) return false
		return initial?.owner_id === currentUserId
	}, [isEdit, currentUserId, initial?.owner_id])

	const handleSave = async () => {
		if (!currentUserId) {
			alert("Você precisa estar autenticado para salvar suas frases.")
			return
		}
		if (!title.trim() || !content.trim()) {
			alert("Título e Conteúdo são obrigatórios.")
			return
		}
		if (isEdit && !canEdit) {
			alert("Você não tem permissão para editar esta frase.")
			return
		}

		setSaving(true)
		try {
			const payload: Facility = {
				phase: phase.trim(),
				title: title.trim(),
				content: content.trim(),
				tags: parseTags(tagsText),
				owner_id: currentUserId,
				default: false,
			}

			if (isEdit && initial?.id) {
				await updateFacilityFn({ data: { id: initial.id, ownerId: currentUserId, payload } })
			} else {
				await insertFacilityFn({ data: payload })
			}

			onOpenChange(false)
			onSaved?.()
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : (e as { message: string })?.message || "Erro ao salvar"
			alert(msg)
		} finally {
			setSaving(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{isEdit ? "Editar frase" : "Nova frase"}</DialogTitle>
				</DialogHeader>

				<div className="grid gap-4 py-2">
					<div className="grid gap-2">
						<Label htmlFor="phrase-phase">Fase</Label>
						<Input id="phrase-phase" placeholder="Ex.: Abertura" value={phase} onChange={(e) => setPhase(e.target.value)} />
					</div>

					<div className="grid gap-2">
						<Label htmlFor="phrase-title">Título</Label>
						<Input id="phrase-title" placeholder="Ex.: Abertura da Sessão Pública" value={title} onChange={(e) => setTitle(e.target.value)} />
					</div>

					<div className="grid gap-2">
						<Label htmlFor="phrase-content">Conteúdo</Label>
						<Textarea
							id="phrase-content"
							className="min-h-40"
							placeholder="Mensagem com placeholders: ${OM}, ${date}, ${hour}, ${hour_limit}"
							value={content}
							onChange={(e) => setContent(e.target.value)}
						/>
					</div>

					<div className="grid gap-2">
						<Label htmlFor="phrase-tags">Tags (separe por vírgula)</Label>
						<Input id="phrase-tags" placeholder="Ex.: sessão, abertura" value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
					</div>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
						Cancelar
					</Button>
					<Button onClick={handleSave} disabled={saving || (isEdit && !canEdit)}>
						{saving ? "Salvando..." : isEdit ? "Salvar alterações" : "Salvar"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

/* -----------------------------------------------
   Página
-------------------------------------------------- */

function Pregoeiro() {
	const { prefs, setEnv, setIsOpen, loading, userId } = usePregoeiroPreferences()

	// Modal de frase
	const [phraseOpen, setPhraseOpen] = useState(false)
	const [phraseEditing, setPhraseEditing] = useState<Facility | null>(null)

	const handleChange = (key: keyof FacilidadesTableProps) => (e: React.ChangeEvent<HTMLInputElement>) => setEnv((prev) => ({ ...prev, [key]: e.target.value }))

	const handleOpenCreate = () => {
		setPhraseEditing(null)
		setPhraseOpen(true)
	}

	const handleEditFromRow = (row: Facility) => {
		setPhraseEditing(row)
		setPhraseOpen(true)
	}

	return (
		<div className="flex flex-col items-center justify-center w-full p-6 gap-8 pt-20">
			<h1 className="text-4xl font-bold text-gray-800 dark:text-gray-200">Pregoeiro</h1>

			{/* Toolbar principal */}
			<div className="flex w-full max-w-5xl items-center justify-between gap-2 flex-wrap">
				<div className="text-sm text-muted-foreground">{loading ? <Skeleton className="h-4 w-44" /> : null}</div>
				<div className="flex items-center gap-2">
					<Button onClick={handleOpenCreate}>Nova frase</Button>
				</div>
			</div>

			<Card className="w-full max-w-2xl p-4">
				<Collapsible open={prefs.is_open} onOpenChange={setIsOpen} className="flex flex-col gap-4">
					<CollapsibleTrigger
						render={
							<Button variant="ghost" className="flex w-full items-center place-content-between">
								<CardHeader className="flex items-center justify-between w-full">
									<CardTitle>Atributos</CardTitle>
									<Expand />
								</CardHeader>
							</Button>
						}
					/>

					<CollapsibleContent className="flex flex-col gap-4">
						{/* OM - Field */}
						<CardContent className="grid gap-2">
							<Field>
								<FieldLabel htmlFor="attr-om">OM</FieldLabel>
								<Input
									id="attr-om"
									placeholder="Insira a OM"
									type="text"
									autoComplete="off"
									autoCorrect="off"
									spellCheck="false"
									value={prefs.env.OM}
									onChange={handleChange("OM")}
									className="w-full"
								/>
								{/* <FieldDescription>Opcional</FieldDescription> */}
							</Field>
						</CardContent>

						{/* Data - Input Group com ícone de calendário (leading icon) */}
						<CardContent className="grid gap-2">
							<Field>
								<FieldLabel htmlFor="attr-date">Data</FieldLabel>
								<InputGroup>
									{/* Coloque o addon DEPOIS do input e use align para posicionar à esquerda */}
									<InputGroupInput
										id="attr-date"
										placeholder="Insira a Data"
										type="text"
										autoComplete="off"
										autoCorrect="off"
										spellCheck="false"
										value={prefs.env.Date}
										onChange={handleChange("Date")}
										className="w-full"
									/>
									<InputGroupAddon align="inline-start">
										<Calendar className="size-4 text-muted-foreground" />
									</InputGroupAddon>
								</InputGroup>
								<FieldDescription>Ex.: 15/04 (terça-feira)</FieldDescription>
							</Field>
						</CardContent>

						{/* Hora - Input Group com ícone de relógio (leading icon) */}
						<CardContent className="grid gap-2">
							<Field>
								<FieldLabel htmlFor="attr-hour">Hora</FieldLabel>
								<InputGroup>
									<InputGroupInput
										id="attr-hour"
										placeholder="Insira a Hora"
										type="text"
										autoComplete="off"
										autoCorrect="off"
										spellCheck="false"
										value={prefs.env.Hour}
										onChange={handleChange("Hour")}
										className="w-full"
									/>
									<InputGroupAddon align="inline-start">
										<Clock className="size-4 text-muted-foreground" />
									</InputGroupAddon>
								</InputGroup>
								<FieldDescription>Ex.: 09:00h</FieldDescription>
							</Field>
						</CardContent>

						{/* Tempo limite - Field */}
						<CardContent className="grid gap-2">
							<Field>
								<FieldLabel htmlFor="attr-hour-limit">Tempo limite</FieldLabel>
								<Input
									id="attr-hour-limit"
									placeholder="Insira o tempo limite"
									type="text"
									autoComplete="off"
									autoCorrect="off"
									spellCheck="false"
									value={prefs.env.Hour_limit}
									onChange={handleChange("Hour_limit")}
									className="w-full"
								/>
								<FieldDescription>Ex.: 2 (duas)</FieldDescription>
							</Field>
						</CardContent>
					</CollapsibleContent>
				</Collapsible>
			</Card>

			{/* Tabela com placeholders aplicados a partir das preferências */}
			<div className="w-full">
				<Suspense fallback={<TableSkeleton />}>
					<FacilidadesTable
						OM={prefs.env.OM}
						Date={prefs.env.Date}
						Hour={prefs.env.Hour}
						Hour_limit={prefs.env.Hour_limit}
						currentUserId={userId ?? undefined}
						onEditRow={handleEditFromRow}
					/>
				</Suspense>
			</div>

			{/* Modal de criar/editar frase */}
			<PhraseModal open={phraseOpen} onOpenChange={setPhraseOpen} initial={phraseEditing} currentUserId={userId} />
		</div>
	)
}
