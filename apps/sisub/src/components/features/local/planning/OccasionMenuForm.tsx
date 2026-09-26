import { useMutation, useQueryClient } from "@tanstack/react-query"
import { type LinkOptions, useNavigate } from "@tanstack/react-router"
import { CalendarRange, GitFork, Loader2, Plus, Sandwich } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { useTemplate } from "@/hooks/data/useTemplates"
import { isSnackStandard, OCCASION_MENU_COPY, type OccasionMenuType, parseMonthlyOccurrences, snackStandardLabel } from "@/lib/occasion-menu"
import { createBlankTemplateFn, forkTemplateFn } from "@/server/templates.fn"

interface OccasionMenuFormProps {
	templateType: OccasionMenuType
	/** `null` = catálogo global da SDAB. */
	kitchenId: number | null
	/** Modelo global a adaptar para a cozinha. Só faz sentido com `kitchenId`. */
	forkFrom?: string
	listLink: LinkOptions
	editorLink: (templateId: string) => LinkOptions
}

/**
 * Criação de evento ou exceção — do zero (cozinha ou catálogo global) ou adaptando um modelo
 * global para a cozinha. A adaptação copia itens, pax por preparação e recorrência mensal.
 */
export function OccasionMenuForm({ templateType, kitchenId, forkFrom, listLink, editorLink }: OccasionMenuFormProps) {
	const navigate = useNavigate()
	const queryClient = useQueryClient()
	const copy = OCCASION_MENU_COPY[templateType]
	const isException = templateType === "exception"
	const isGlobal = kitchenId === null
	const isFork = !!forkFrom && !isGlobal
	const Icon = isException ? Sandwich : CalendarRange

	const { data: baseTemplate } = useTemplate(isFork ? (forkFrom ?? null) : null)

	const [name, setName] = useState("")
	const [description, setDescription] = useState("")
	const [occurrences, setOccurrences] = useState("")

	// Adaptação nasce com o nome do modelo: exigir que se redigite um nome para copiar era o
	// passo a mais que fazia a cozinha montar o evento "na mão" em vez de adaptar o da SDAB.
	const prefilledRef = useRef(false)
	useEffect(() => {
		if (!isFork || prefilledRef.current || !baseTemplate?.name) return
		prefilledRef.current = true
		setName((current) => current || (baseTemplate.name ?? ""))
	}, [isFork, baseTemplate])

	const storageKey = `${templateType === "event" ? "events" : "exceptions"}-new-draft-${kitchenId ?? "global"}`
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
					...(isException ? { expectedMonthlyOccurrences: parseMonthlyOccurrences(occurrences) } : {}),
				},
			})
		},
		onSuccess: (data) => onCreated(data, `${copy.singular} "${data.name}" ${copy.article === "o" ? "criado" : "criada"}!`),
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
				},
			})
		},
		onSuccess: (data) => onCreated(data, `Adaptação "${data.name}" criada com sucesso!`),
		onError: (err) => toast.error(`Erro ao adaptar: ${err.message}`),
	})

	const isPending = isCreating || isForking

	const handleSubmit = () => {
		if (!name.trim()) return
		if (isFork) createFork()
		else createBlank()
	}

	const title = isFork ? `Adaptar ${copy.singular} Global` : isGlobal ? `${copy.newLabel} Modelo` : copy.newLabel

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
						<Card className="border-dashed">
							<CardHeader className="pb-3">
								<CardTitle className="text-sm flex items-center gap-2">
									<GitFork className="size-4 text-muted-foreground" />
									Modelo de origem
								</CardTitle>
								<CardDescription>
									A cópia leva as preparações e o efetivo de cada uma{isException ? ", e as ocorrências por mês" : ""}. Alterações futuras no original não
									afetam a versão local.
									{isException && isSnackStandard(baseTemplate) && (
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
									<Badge variant="outline" className="ml-auto text-xs">
										Global · SDAB
									</Badge>
								</div>
							</CardContent>
						</Card>
					)
				) : (
					<div className="rounded-md border bg-muted/30 p-4 flex items-start gap-3">
						<Icon className="size-4 text-muted-foreground mt-0.5 shrink-0" />
						<p className="text-sm text-muted-foreground">
							{copy.explainer}{" "}
							{isGlobal
								? "Modelos do catálogo global ficam disponíveis para todas as cozinhas adaptarem."
								: `${copy.article === "o" ? "O" : "A"} ${copy.noun} poderá ser ${copy.article === "o" ? "selecionado" : "selecionada"} na composição dos anexos quantitativos do TR.`}
						</p>
					</div>
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
								placeholder={isFork ? `Ex.: ${baseTemplate?.name ?? "Cópia"} — ${new Date().getFullYear()}` : copy.namePlaceholder}
								required
								suppressHydrationWarning
							/>
						</div>

						{isException && !isFork && (
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

					<div className="flex items-center justify-between">
						<p className="text-xs text-muted-foreground">
							{isFork
								? `Após criar, você poderá editar ${copy.article} ${copy.noun} livremente.`
								: `Após criar, você será redirecionado para montar o cardápio d${copy.article} ${copy.noun}.`}
						</p>
						<div className="flex gap-2">
							<Button type="button" variant="outline" onClick={() => navigate(listLink)}>
								Cancelar
							</Button>
							<Button type="submit" disabled={isPending || !name.trim()}>
								{isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
								{isFork ? <GitFork className="size-4 mr-2" /> : <Plus className="size-4 mr-2" />}
								{isFork ? "Criar Adaptação" : `Criar ${copy.singular}`}
							</Button>
						</div>
					</div>
				</form>
			</div>
		</div>
	)
}
