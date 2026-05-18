import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Trash } from "iconoir-react"
import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { addViewerFn, getOmOptionsFn, removeViewerFn, updateViewerPolicyFn } from "@/server/forms.fn"

type ViewerBinding = {
	id?: string
	attribute_key: "om"
	effect: "allow" | "deny"
	value: string
}

export type ResponseViewer = {
	id: string
	viewer_email: string
	viewer_id: string
	questionnaire_id: string
	scope_mode: "global" | "scoped"
	bindings: ViewerBinding[]
}

const omOptionsQueryOptions = () =>
	queryOptions({
		queryKey: ["om-options"],
		queryFn: () => getOmOptionsFn({ data: {} }),
	})

function parseLines(value: string) {
	return Array.from(
		new Set(
			value
				.split("\n")
				.map((item) => item.trim())
				.filter(Boolean)
		)
	)
}

function bindingsToText(bindings: ViewerBinding[], effect: "allow" | "deny") {
	return bindings
		.filter((binding) => binding.attribute_key === "om" && binding.effect === effect)
		.map((binding) => binding.value)
		.join("\n")
}

export function ViewerManager({ questionnaireId, viewers, omScopeable }: { questionnaireId: string; viewers: ResponseViewer[]; omScopeable: boolean }) {
	const queryClient = useQueryClient()
	const { data: omOptions = [] } = useQuery(omOptionsQueryOptions())
	const [email, setEmail] = useState("")
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [dialogOpen, setDialogOpen] = useState(false)
	const [editingViewerId, setEditingViewerId] = useState<string | null>(null)
	const [scopeMode, setScopeMode] = useState<"global" | "scoped">("global")
	const [allowText, setAllowText] = useState("")
	const [denyText, setDenyText] = useState("")

	const editingViewer = useMemo(() => viewers.find((viewer) => viewer.id === editingViewerId) ?? null, [editingViewerId, viewers])

	const invalidateViewers = async () => {
		await queryClient.invalidateQueries({ queryKey: ["viewers", questionnaireId] })
	}

	const resetDialog = () => {
		setEditingViewerId(null)
		setScopeMode("global")
		setAllowText("")
		setDenyText("")
	}

	const openCreateDialog = () => {
		setError(null)
		resetDialog()
		setDialogOpen(true)
	}

	const openEditDialog = (viewer: ResponseViewer) => {
		setError(null)
		setEditingViewerId(viewer.id)
		setScopeMode(viewer.scope_mode)
		setAllowText(bindingsToText(viewer.bindings, "allow"))
		setDenyText(bindingsToText(viewer.bindings, "deny"))
		setDialogOpen(true)
	}

	const appendOm = (value: string, effect: "allow" | "deny") => {
		const current = effect === "allow" ? allowText : denyText
		const setter = effect === "allow" ? setAllowText : setDenyText
		const values = parseLines(current)
		if (values.includes(value)) return
		setter([...values, value].join("\n"))
	}

	async function handleAddGlobal() {
		if (!email.trim()) return
		setLoading(true)
		setError(null)
		try {
			await addViewerFn({ data: { questionnaire_id: questionnaireId, email: email.trim(), scope_mode: "global" } })
			setEmail("")
			await invalidateViewers()
		} catch (e) {
			setError(e instanceof Error ? e.message : "Erro ao adicionar visualizador")
		} finally {
			setLoading(false)
		}
	}

	async function handleSavePolicy() {
		setLoading(true)
		setError(null)
		try {
			const policy =
				scopeMode === "scoped"
					? {
							om: {
								allow: parseLines(allowText),
								deny: parseLines(denyText),
							},
						}
					: undefined

			if (editingViewer) {
				await updateViewerPolicyFn({
					data: {
						questionnaire_id: questionnaireId,
						viewer_id: editingViewer.id,
						scope_mode: scopeMode,
						policy,
					},
				})
			} else {
				if (!email.trim()) throw new Error("Informe o email do visualizador")
				await addViewerFn({
					data: {
						questionnaire_id: questionnaireId,
						email: email.trim(),
						scope_mode: scopeMode,
						policy,
					},
				})
				setEmail("")
			}

			await invalidateViewers()
			setDialogOpen(false)
			resetDialog()
		} catch (e) {
			setError(e instanceof Error ? e.message : "Erro ao salvar visualizador")
		} finally {
			setLoading(false)
		}
	}

	async function handleRemove(id: string) {
		setError(null)
		try {
			await removeViewerFn({ data: { id, questionnaire_id: questionnaireId } })
			await invalidateViewers()
		} catch (e) {
			setError(e instanceof Error ? e.message : "Erro ao remover visualizador")
		}
	}

	return (
		<>
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-base">Visualizadores</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<p className="text-sm text-muted-foreground">Defina quem pode ver as respostas e, quando necessário, restrinja por OM.</p>
					<div className="flex gap-2">
						<Input
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && handleAddGlobal()}
							placeholder="email@fab.mil.br"
							className="max-w-sm"
						/>
						<Button onClick={handleAddGlobal} disabled={loading || !email.trim()} size="sm" variant="outline">
							Adicionar global
						</Button>
						<Button onClick={openCreateDialog} disabled={loading || !email.trim()} size="sm">
							<Plus className="h-3.5 w-3.5" />
							Escopo
						</Button>
					</div>
					{error && <p className="text-sm text-destructive">{error}</p>}
					{viewers.length > 0 ? (
						<ul className="space-y-2">
							{viewers.map((viewer) => (
								<li key={viewer.id} className="rounded-md border px-3 py-3">
									<div className="flex items-center justify-between gap-3">
										<div className="space-y-1">
											<p className="text-sm">{viewer.viewer_email}</p>
											<div className="flex flex-wrap gap-1.5">
												<Badge variant={viewer.scope_mode === "global" ? "secondary" : "outline"}>
													{viewer.scope_mode === "global" ? "Global" : "Escopado"}
												</Badge>
												{viewer.bindings
													.filter((binding) => binding.effect === "allow")
													.slice(0, 4)
													.map((binding) => (
														<Badge key={`${viewer.id}-${binding.effect}-${binding.value}`} variant="outline">
															OM {binding.value}
														</Badge>
													))}
												{viewer.bindings.some((binding) => binding.effect === "deny") && <Badge variant="outline">Com exceções</Badge>}
											</div>
										</div>
										<div className="flex items-center gap-2">
											<Button variant="outline" size="sm" onClick={() => openEditDialog(viewer)}>
												Editar escopo
											</Button>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => handleRemove(viewer.id)}
												className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
											>
												<Trash className="h-3.5 w-3.5" />
											</Button>
										</div>
									</div>
								</li>
							))}
						</ul>
					) : (
						<p className="text-sm text-muted-foreground">Nenhum visualizador adicionado.</p>
					)}
				</CardContent>
			</Card>

			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				<DialogContent className="sm:max-w-xl">
					<DialogHeader>
						<DialogTitle>{editingViewer ? "Editar escopo do visualizador" : "Adicionar visualizador com escopo"}</DialogTitle>
						<DialogDescription>
							{editingViewer
								? `Ajuste a política de acesso para ${editingViewer.viewer_email}.`
								: "Configure se o visualizador terá acesso global ou filtrado por OM."}
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4">
						{!editingViewer && (
							<div className="space-y-2">
								<Label>Email</Label>
								<Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@fab.mil.br" />
							</div>
						)}

						<div className="space-y-2">
							<Label>Tipo de acesso</Label>
							<Select value={scopeMode} onValueChange={(value) => setScopeMode((value ?? "global") as "global" | "scoped")}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="global">Global</SelectItem>
									<SelectItem value="scoped" disabled={!omScopeable}>
										Escopado por OM
									</SelectItem>
								</SelectContent>
							</Select>
							{!omScopeable && <p className="text-xs text-muted-foreground">Ative a segmentação por OM no questionário para liberar escopo por OM.</p>}
						</div>

						{scopeMode === "scoped" && (
							<div className="space-y-4">
								<div className="space-y-2">
									<Label>OMs permitidas</Label>
									<Textarea value={allowText} onChange={(e) => setAllowText(e.target.value)} rows={5} placeholder={"Uma OM por linha\nAFA\nGAP-RJ"} />
								</div>
								<div className="space-y-2">
									<Label>OMs negadas</Label>
									<Textarea value={denyText} onChange={(e) => setDenyText(e.target.value)} rows={3} placeholder={"Exceções opcionais, uma por linha\nGAP-RJ"} />
								</div>
								<div className="space-y-2">
									<Label>Atalhos</Label>
									<div className="flex flex-wrap gap-2">
										{omOptions.map((option) => (
											<Button key={option.id} type="button" size="sm" variant="outline" onClick={() => appendOm(option.name, "allow")}>
												{option.name}
											</Button>
										))}
									</div>
								</div>
							</div>
						)}

						{error && <p className="text-sm text-destructive">{error}</p>}
					</div>

					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
							Cancelar
						</Button>
						<Button type="button" onClick={handleSavePolicy} disabled={loading}>
							Salvar
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	)
}
