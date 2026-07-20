import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router"
import { Loader2, Plus, Sandwich } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createBlankTemplateFn } from "@/server/templates.fn"

/**
 * KITCHEN — Nova Exceção
 * Cria um cardápio de exceção previsível (template_type = 'exception') vinculado à cozinha.
 * Esses templates são selecionados no Step 2 da Ata de Registro de Preços, multiplicados
 * pela recorrência mensal esperada.
 */
export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/exceptions/new")({
	beforeLoad: (opts) => requirePermission(opts, "kitchen", 2),
	component: NewExceptionPage,
	head: () => ({
		meta: [{ title: "Nova Exceção - SISUB" }],
	}),
})

function NewExceptionPage() {
	const navigate = useNavigate()
	const queryClient = useQueryClient()
	const { kitchenId: kitchenIdStr } = useParams({ strict: false })
	const kitchenId = Number(kitchenIdStr)

	const storageKey = `exceptions-new-draft-${kitchenId}`
	const storageLoadedRef = useRef(false)

	const [name, setName] = useState("")
	const [description, setDescription] = useState("")
	const [occurrences, setOccurrences] = useState("")

	useEffect(() => {
		if (storageLoadedRef.current || !kitchenId) return
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
	}, [kitchenId, storageKey])

	useEffect(() => {
		if (!storageLoadedRef.current) return
		try {
			sessionStorage.setItem(storageKey, JSON.stringify({ name, description, occurrences }))
		} catch {}
	}, [name, description, occurrences, storageKey])

	const { mutate: createException, isPending } = useMutation({
		mutationFn: () => {
			if (!kitchenId || !name.trim()) throw new Error("Dados incompletos")
			const parsed = Number.parseInt(occurrences, 10)
			const expectedMonthlyOccurrences = Number.isFinite(parsed) && parsed > 0 ? parsed : null
			return createBlankTemplateFn({
				data: {
					name: name.trim(),
					description: description.trim() || undefined,
					kitchenId,
					templateType: "exception",
					expectedMonthlyOccurrences,
				},
			})
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: ["menu_templates"] })
			try {
				sessionStorage.removeItem(storageKey)
			} catch {}
			toast.success(`Exceção "${data.name}" criada!`)
			navigate({
				to: "/kitchen/$kitchenId/exceptions/$exceptionId",
				params: { kitchenId: kitchenIdStr as string, exceptionId: data.id },
			})
		},
		onError: (err) => toast.error(`Erro: ${err.message}`),
	})

	const handleSubmit = () => {
		if (!name.trim() || !kitchenId) return
		createException()
	}

	return (
		<div className="space-y-6">
			<PageHeader
				title="Nova Exceção"
				description="Crie um molde para uma refeição previsível fora do calendário semanal regular."
				onBack={() =>
					navigate({
						to: "/kitchen/$kitchenId/exceptions",
						params: { kitchenId: kitchenIdStr as string },
					})
				}
			/>

			<div className="mx-auto w-full max-w-2xl space-y-6">
				<div className="rounded-md border bg-muted/30 p-4 flex items-start gap-3">
					<Sandwich className="size-4 text-muted-foreground mt-0.5 shrink-0" />
					<p className="text-sm text-muted-foreground">
						Exceções são refeições previsíveis e recorrentes — lanches de bordo, cafés de reunião. Crie um molde por tipo e informe quantas vezes por mês ele
						ocorre; o custeio da Ata multiplica automaticamente. Após criar, você montará o cardápio da exceção.
					</p>
				</div>

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
								Nome da Exceção <span className="text-destructive">*</span>
							</Label>
							<Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Lanche de Bordo, Café de Reunião" required />
						</div>

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
							<p className="text-xs text-muted-foreground">Usado para multiplicar o custeio na Ata. Em branco, conta como 1 ocorrência.</p>
						</div>

						<div className="space-y-2">
							<Label htmlFor="description">Descrição (opcional)</Label>
							<Textarea
								id="description"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder="Contexto da exceção ou observações relevantes"
								rows={2}
							/>
						</div>
					</div>

					<div className="flex items-center justify-between">
						<p className="text-xs text-muted-foreground">Após criar, você será redirecionado para montar o cardápio da exceção.</p>
						<div className="flex gap-2">
							<Button
								nativeButton={false}
								type="button"
								variant="outline"
								render={
									<Link to="/kitchen/$kitchenId/exceptions" params={{ kitchenId: kitchenIdStr as string }}>
										Cancelar
									</Link>
								}
							/>
							<Button type="submit" disabled={isPending || !name.trim() || !kitchenId}>
								{isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
								<Plus className="size-4 mr-2" />
								Criar Exceção
							</Button>
						</div>
					</div>
				</form>
			</div>
		</div>
	)
}
