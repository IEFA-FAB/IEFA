// Subpath `/schemas` e não a raiz: este módulo é de cliente, e o índice raiz do domínio
// arrasta as operations (Drizzle) para o bundle do navegador. O de schemas só depende de zod.
import { MCP_API_KEY_LIFETIME_DAYS, type McpApiKeyLifetimeDays } from "@iefa/sisub-domain/schemas"
import { useForm } from "@tanstack/react-form"
import { createFileRoute } from "@tanstack/react-router"
import { CalendarClock, Check, Copy, Eye, EyeOff, KeyRound, Loader2, Plus, ShieldAlert, ShieldOff, Terminal, Trash2 } from "lucide-react"
import { useState } from "react"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/toast"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useCreateMcpKey, useDeleteMcpKey, useMcpKeys, useRevokeMcpKey } from "@/hooks/data/useMcpKeys"
import { formatExpiryDate, mcpKeyExpiry } from "@/lib/mcp-key-expiry"
import type { McpApiKey } from "@/server/mcp-keys.fn"

// ============================================================================
// Route
// ============================================================================

export const Route = createFileRoute("/_protected/_modules/diner/mcp-keys")({
	beforeLoad: (opts) => requirePermission(opts, "diner", 1),
	component: McpKeysPage,
	head: () => ({
		meta: [{ title: "Chaves MCP — SISUB" }],
	}),
})

// ============================================================================
// Page
// ============================================================================

function McpKeysPage() {
	const [createOpen, setCreateOpen] = useState(false)
	const [revealed, setRevealed] = useState<{ key: string; expiresAt: string } | null>(null)
	const { data: keys, isLoading } = useMcpKeys()

	// Contagem só das chaves que ainda autenticam: revogada ou já vencida não "vence em breve".
	const expiringSoon = (keys ?? []).filter((key) => key.is_active && mcpKeyExpiry(key.expires_at).isNear).length

	return (
		<div className="space-y-6">
			<PageHeader title="Chaves de API — MCP" description="Gerencie as chaves de acesso do sisub-mcp para uso com Claude, Cursor e outros clientes MCP." />

			{/* Info card */}
			<Card className="border-dashed bg-muted/30">
				<CardHeader className="pb-2">
					<CardTitle className="text-subheading flex items-center gap-2">
						<Terminal className="size-4 text-muted-foreground" />
						Como usar
					</CardTitle>
				</CardHeader>
				<CardContent className="text-sm text-muted-foreground space-y-1">
					<p>
						Configure o cliente MCP com o header <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">x-api-key: &lt;sua-chave&gt;</code> apontando
						para o endpoint do sisub-mcp.
					</p>
					<p>
						A chave concede o mesmo nível de acesso que você possui na plataforma. Ela é exibida <strong>apenas uma vez</strong> no momento da criação.
					</p>
					<p className="flex items-start gap-2 pt-1">
						<ShieldAlert className="size-4 shrink-0 mt-0.5" />
						<span>
							Uma chave <strong>não executa operação protegida por verificação em duas etapas</strong> — conceder permissão, criar outra chave, liberar acesso a
							parceiro externo, reiniciar o ambiente de treino, exportar dados nominais. Essas operações exigem um código de 6 dígitos, e chave de API não tem
							como apresentá-lo: faça-as aqui no sistema.
						</span>
					</p>
				</CardContent>
			</Card>

			{/* List header */}
			<div className="flex items-center justify-between gap-3">
				<p className="text-sm text-muted-foreground">
					{isLoading ? "Carregando…" : `${(keys ?? []).length} ${(keys ?? []).length === 1 ? "chave cadastrada" : "chaves cadastradas"}`}
					{!isLoading && expiringSoon > 0 && (
						<span className="text-warning">
							{" · "}
							{expiringSoon === 1 ? "1 vence em menos de 30 dias" : `${expiringSoon} vencem em menos de 30 dias`}
						</span>
					)}
				</p>
				<Button size="sm" onClick={() => setCreateOpen(true)} className="gap-2">
					<Plus className="size-4" />
					Nova Chave
				</Button>
			</div>

			{/* Loading */}
			{isLoading && (
				<div className="space-y-3">
					{Array.from({ length: 2 }).map((_, i) => (
						<Skeleton key={i} className="h-20 w-full rounded-lg" />
					))}
				</div>
			)}

			{/* Empty state */}
			{!isLoading && (keys ?? []).length === 0 && (
				<Card>
					<CardContent className="flex flex-col items-center justify-center py-12 text-center">
						<KeyRound className="size-10 text-muted-foreground/40 mb-3" />
						<p className="text-subheading text-muted-foreground">Nenhuma chave cadastrada</p>
						<p className="text-xs text-muted-foreground/70 mt-1">Crie uma chave para usar o sisub-mcp com Claude ou Cursor.</p>
						<Button size="sm" variant="outline" onClick={() => setCreateOpen(true)} className="mt-4 gap-2">
							<Plus className="size-4" />
							Nova Chave
						</Button>
					</CardContent>
				</Card>
			)}

			{/* Keys list */}
			{!isLoading && (keys ?? []).length > 0 && (
				<div className="space-y-2">
					{(keys ?? []).map((key) => (
						<KeyItem key={key.id} apiKey={key} />
					))}
				</div>
			)}

			<CreateKeyDialog
				open={createOpen}
				onOpenChange={setCreateOpen}
				onKeyCreated={(created) => {
					setCreateOpen(false)
					setRevealed(created)
				}}
			/>

			<RevealKeyDialog created={revealed} onClose={() => setRevealed(null)} />
		</div>
	)
}

// ============================================================================
// KeyItem
// ============================================================================

interface KeyItemProps {
	apiKey: McpApiKey
}

function KeyItem({ apiKey }: KeyItemProps) {
	const revokeMutation = useRevokeMcpKey()
	const deleteMutation = useDeleteMcpKey()

	const isRevoking = revokeMutation.isPending && revokeMutation.variables === apiKey.id
	const isDeleting = deleteMutation.isPending && deleteMutation.variables === apiKey.id

	const lastUsed = apiKey.last_used_at
		? new Date(apiKey.last_used_at).toLocaleString("pt-BR", {
				day: "2-digit",
				month: "2-digit",
				year: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			})
		: "Nunca"

	const createdAt = new Date(apiKey.created_at).toLocaleDateString("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	})

	const expiry = mcpKeyExpiry(apiKey.expires_at)
	// Chave vencida é tão inerte quanto revogada — a lista mostra as duas com o mesmo peso,
	// porque a pergunta que o dono faz aqui é "isto ainda funciona?", não "por que parou".
	const isSpent = !apiKey.is_active || expiry.isExpired
	// Destaque do vencimento próximo por tint de fundo + borda inteira: faixa de acento
	// lateral é proibida no repo (CLAUDE.md), e a cor sozinha não bastaria — o texto ao lado
	// diz quantos dias faltam.
	const nearClass = !isSpent && expiry.isNear ? "border-warning/40 bg-warning/5" : ""

	return (
		<Card className={isSpent ? "opacity-60" : nearClass}>
			<CardContent className="flex items-center gap-4 py-4">
				<KeyRound className="size-5 shrink-0 text-muted-foreground" />

				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 flex-wrap">
						<p className="text-subheading">{apiKey.label}</p>
						{apiKey.is_active ? (
							<Badge variant={expiry.isExpired ? "secondary" : "default"} className="text-xs">
								{expiry.isExpired ? "Vencida" : "Ativa"}
							</Badge>
						) : (
							<Badge variant="secondary" className="text-xs">
								Revogada
							</Badge>
						)}
						{apiKey.is_active && expiry.isNear && (
							<Badge variant="warning" className="text-xs gap-1">
								<CalendarClock className="size-3" />
								{expiry.days === 1 ? "Vence amanhã" : `Vence em ${expiry.days} dias`}
							</Badge>
						)}
					</div>
					<p className="text-xs text-muted-foreground mt-0.5 font-mono">{apiKey.key_prefix}…</p>
					<p className="text-xs text-muted-foreground mt-0.5">
						Criada em {createdAt} · Último uso: {lastUsed}
					</p>
					<p className="text-xs text-muted-foreground mt-0.5">
						{expiry.isExpired ? `Venceu em ${formatExpiryDate(expiry.at)} — gere uma nova chave` : `Válida até ${formatExpiryDate(expiry.at)}`}
					</p>
				</div>

				<div className="flex items-center gap-1 shrink-0">
					{/* Revogar — só para chaves ativas */}
					{apiKey.is_active && (
						<Tooltip>
							<AlertDialog>
								<AlertDialogTrigger
									render={
										<TooltipTrigger
											render={
												<Button
													variant="ghost"
													size="icon"
													className="size-8 text-muted-foreground hover:text-foreground"
													aria-label="Revogar chave"
													disabled={isRevoking}
												/>
											}
										/>
									}
								>
									{isRevoking ? <Loader2 className="size-4 animate-spin" /> : <ShieldOff className="size-4" />}
								</AlertDialogTrigger>
								<TooltipContent>Revogar chave</TooltipContent>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>Revogar chave?</AlertDialogTitle>
										<AlertDialogDescription>
											A chave <strong>"{apiKey.label}"</strong> será desativada imediatamente. Clientes usando essa chave perderão acesso ao sisub-mcp.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>Cancelar</AlertDialogCancel>
										<AlertDialogAction onClick={() => revokeMutation.mutate(apiKey.id)}>Revogar</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						</Tooltip>
					)}

					{/* Remover */}
					<Tooltip>
						<AlertDialog>
							<AlertDialogTrigger
								render={
									<TooltipTrigger
										render={
											<Button
												variant="ghost"
												size="icon"
												className="size-8 text-destructive hover:text-destructive"
												aria-label="Remover chave"
												disabled={isDeleting}
											/>
										}
									/>
								}
							>
								{isDeleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
							</AlertDialogTrigger>
							<TooltipContent>Remover chave</TooltipContent>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Remover chave?</AlertDialogTitle>
									<AlertDialogDescription>
										A chave <strong>"{apiKey.label}"</strong> será removida permanentemente. Esta ação não pode ser desfeita.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>Cancelar</AlertDialogCancel>
									<AlertDialogAction
										onClick={() => deleteMutation.mutate(apiKey.id)}
										className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
									>
										Remover
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					</Tooltip>
				</div>
			</CardContent>
		</Card>
	)
}

// ============================================================================
// CreateKeyDialog
// ============================================================================

const createKeySchema = z.object({
	label: z.string().min(1, "Obrigatório").max(100, "Máximo de 100 caracteres"),
	expiresInDays: z.union([z.literal(30), z.literal(90), z.literal(365)]),
})

/** Rótulo de cada prazo. A lista vem do domínio; aqui só se diz como cada um se chama. */
const LIFETIME_LABEL: Record<McpApiKeyLifetimeDays, string> = {
	30: "30 dias",
	90: "90 dias",
	365: "1 ano",
}

/** Prazo padrão: o do meio. Cobre o uso corrente sem ser o mais longo por inércia. */
const DEFAULT_LIFETIME: McpApiKeyLifetimeDays = 90

interface CreateKeyDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	onKeyCreated: (created: { key: string; expiresAt: string }) => void
}

function CreateKeyDialog({ open, onOpenChange, onKeyCreated }: CreateKeyDialogProps) {
	const createMutation = useCreateMcpKey()

	const form = useForm({
		defaultValues: { label: "", expiresInDays: DEFAULT_LIFETIME as McpApiKeyLifetimeDays },
		validators: {
			onChange: ({ value }) => {
				const result = createKeySchema.safeParse(value)
				if (result.success) return undefined
				const errors: Record<string, string> = {}
				for (const issue of result.error.issues) {
					errors[issue.path.join(".")] = issue.message
				}
				return errors
			},
		},
		onSubmit: async ({ value }) => {
			try {
				const result = await createMutation.mutateAsync({ label: value.label, expiresInDays: value.expiresInDays })
				form.reset()
				onKeyCreated({ key: result.key, expiresAt: result.row.expires_at })
			} catch {
				// toast handled by mutation onError
			}
		},
	})

	function handleClose() {
		if (createMutation.isPending) return
		form.reset()
		onOpenChange(false)
	}

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Nova Chave de API</DialogTitle>
				</DialogHeader>

				<form
					onSubmit={(e) => {
						e.preventDefault()
						e.stopPropagation()
						form.handleSubmit()
					}}
					className="space-y-4"
				>
					<FieldGroup>
						<form.Field name="label">
							{(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>Nome da chave</FieldLabel>
									<FieldDescription>Identifique onde esta chave será usada (ex.: "Claude Desktop", "Cursor").</FieldDescription>
									<Input
										id={field.name}
										placeholder="Ex.: Claude Desktop pessoal"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										disabled={createMutation.isPending}
										autoFocus
									/>
									{field.state.meta.errors.length > 0 && <FieldError>{field.state.meta.errors.join(", ")}</FieldError>}
								</Field>
							)}
						</form.Field>

						<form.Field name="expiresInDays">
							{(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>Validade</FieldLabel>
									<FieldDescription>Toda chave vence. Depois do prazo ela para de autenticar sozinha, mesmo que ninguém lembre de revogá-la.</FieldDescription>
									<Select
										value={String(field.state.value)}
										onValueChange={(value) => field.handleChange(Number(value ?? DEFAULT_LIFETIME) as McpApiKeyLifetimeDays)}
										disabled={createMutation.isPending}
									>
										<SelectTrigger id={field.name} className="w-full">
											<SelectValue>{LIFETIME_LABEL[field.state.value]}</SelectValue>
										</SelectTrigger>
										<SelectContent>
											{MCP_API_KEY_LIFETIME_DAYS.map((days) => (
												<SelectItem key={days} value={String(days)}>
													{LIFETIME_LABEL[days]}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</Field>
							)}
						</form.Field>
					</FieldGroup>

					<p className="text-xs text-muted-foreground">
						A chave age com as suas permissões, mas <strong>não executa operação protegida por verificação em duas etapas</strong>.
					</p>

					<DialogFooter className="pt-2">
						<form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
							{([canSubmit, isSubmitting]) => (
								<>
									<Button type="button" variant="ghost" onClick={handleClose} disabled={createMutation.isPending}>
										Cancelar
									</Button>
									<Button type="submit" disabled={!canSubmit || createMutation.isPending || isSubmitting} className="gap-2">
										{createMutation.isPending || isSubmitting ? (
											<>
												<Loader2 className="size-4 animate-spin" />
												Gerando…
											</>
										) : (
											<>
												<Plus className="size-4" />
												Gerar Chave
											</>
										)}
									</Button>
								</>
							)}
						</form.Subscribe>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}

// ============================================================================
// RevealKeyDialog — exibe a chave real UMA ÚNICA VEZ após criação
// ============================================================================

interface RevealKeyDialogProps {
	created: { key: string; expiresAt: string } | null
	onClose: () => void
}

function RevealKeyDialog({ created, onClose }: RevealKeyDialogProps) {
	const rawKey = created?.key ?? null
	const [copied, setCopied] = useState(false)
	const [visible, setVisible] = useState(false)

	async function handleCopy() {
		if (!rawKey) return
		await navigator.clipboard.writeText(rawKey)
		setCopied(true)
		toast.success("Chave copiada!")
		setTimeout(() => setCopied(false), 2000)
	}

	function handleOpenChange(open: boolean) {
		if (!open) {
			setVisible(false)
			setCopied(false)
			onClose()
		}
	}

	return (
		<Dialog open={rawKey !== null} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<KeyRound className="size-5 text-muted-foreground" />
						Chave gerada com sucesso
					</DialogTitle>
				</DialogHeader>

				<div className="space-y-4">
					<Card className="border-warning/30 bg-warning/10">
						<CardContent className="py-3 px-4">
							<p className="text-subheading text-foreground">⚠️ Salve esta chave agora — ela não será exibida novamente.</p>
						</CardContent>
					</Card>

					<div className="flex items-center gap-2">
						<div className="flex-1 font-mono text-sm bg-muted rounded-md px-3 py-2 break-all select-all min-h-[40px] flex items-center">
							{visible ? rawKey : rawKey?.replace(/./g, "•")}
						</div>
						<Button
							variant="ghost"
							size="icon"
							className="shrink-0 size-9"
							onClick={() => setVisible(!visible)}
							aria-label={visible ? "Ocultar chave" : "Revelar chave"}
						>
							{visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
						</Button>
					</div>

					<p className="text-xs text-muted-foreground">
						Use o header <code className="font-mono bg-muted px-1 py-0.5 rounded">x-api-key: &lt;chave&gt;</code> nas configurações do cliente MCP.
					</p>

					{created && (
						<p className="text-xs text-muted-foreground flex items-center gap-1.5">
							<CalendarClock className="size-3.5 shrink-0" />
							Válida até {formatExpiryDate(new Date(created.expiresAt))}. Depois disso o cliente MCP para de autenticar e você gera outra aqui.
						</p>
					)}
				</div>

				<DialogFooter>
					<Button variant="ghost" onClick={() => handleOpenChange(false)}>
						Fechar
					</Button>
					<Button onClick={handleCopy} className="gap-2">
						{copied ? (
							<>
								<Check className="size-4" />
								Copiado!
							</>
						) : (
							<>
								<Copy className="size-4" />
								Copiar Chave
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
