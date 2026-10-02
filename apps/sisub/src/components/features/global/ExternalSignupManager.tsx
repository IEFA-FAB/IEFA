import { isFabEmail } from "@iefa/auth-kit"
import { AuthorizeExternalSignupSchema, SIGNUP_ALLOWLIST_REASON_MAX_LENGTH, SIGNUP_ALLOWLIST_REASON_MIN_LENGTH } from "@iefa/sisub-domain/schemas"
import { Loader2, MailPlus, ShieldOff, UserCheck } from "lucide-react"
import * as React from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import {
	type AuthorizeExternalSignupResult,
	type SignupAllowlistRow,
	useAuthorizeExternalSignup,
	useRevokeExternalSignup,
	useSignupAllowlist,
} from "@/hooks/data/useSignupAllowlist"
import { isElevationCancelled } from "@/lib/assurance/assurance-error"

/**
 * Autorização de cadastro de e-mail FORA de `@fab.mil.br`, na tela de Permissões.
 *
 * O cadastro do sistema é restrito a e-mail institucional NO SERVIDOR (hook do Supabase Auth,
 * migration 20261001100100) — inclusive o convite. Parceiro de fora (GS1, por exemplo) só ganha
 * conta depois que um administrador autoriza o e-mail dele aqui; a autorização fica registrada
 * com o nome de quem autorizou e o motivo, e o convite sai em seguida.
 *
 * Revogar impede só a criação de conta NOVA: a conta que já existe continua entrando. A tela
 * diz isso no diálogo, para ninguém revogar achando que tirou o acesso de alguém.
 */
export function ExternalSignupManager() {
	return (
		<div className="space-y-6">
			<AuthorizeExternalSignupCard />
			<SignupAllowlistCard />
		</div>
	)
}

function AuthorizeExternalSignupCard() {
	const [email, setEmail] = React.useState("")
	const [reason, setReason] = React.useState("")
	const [error, setError] = React.useState<string | null>(null)
	const [outcome, setOutcome] = React.useState<AuthorizeExternalSignupResult | null>(null)
	const authorize = useAuthorizeExternalSignup()

	// Aviso na hora, sem esperar o servidor: e-mail institucional não precisa de autorização.
	const institutional = isFabEmail(email)

	const handleSubmit = async (event: React.FormEvent) => {
		event.preventDefault()
		setError(null)
		setOutcome(null)
		const parsed = AuthorizeExternalSignupSchema.safeParse({ email, reason })
		if (!parsed.success) {
			setError(parsed.error.issues[0]?.message ?? "Confira o e-mail e o motivo.")
			return
		}
		try {
			const result = await authorize.mutateAsync(parsed.data)
			setOutcome(result)
			setEmail("")
			setReason("")
			toast.success("E-mail autorizado", { description: result.email })
		} catch (caught) {
			// Fechar o modal de elevação não é falha: os campos continuam preenchidos.
			if (isElevationCancelled(caught)) return
			setError(caught instanceof Error ? caught.message : "Não foi possível autorizar o e-mail.")
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Autorizar e-mail externo</CardTitle>
				<CardDescription>
					O cadastro é restrito a e-mails @fab.mil.br. Para dar conta a alguém de fora da FAB (um parceiro, por exemplo), autorize o e-mail dessa pessoa: ela
					recebe um convite para definir a senha. A autorização fica registrada com o seu nome e o motivo.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<form onSubmit={handleSubmit} className="space-y-4">
					<FieldGroup>
						<Field data-invalid={institutional || undefined}>
							<FieldLabel htmlFor="external-signup-email">E-mail</FieldLabel>
							<Input
								id="external-signup-email"
								type="email"
								autoComplete="off"
								value={email}
								onChange={(event) => setEmail(event.target.value)}
								placeholder="nome@empresa.org"
								aria-invalid={institutional || undefined}
								required
							/>
							{institutional ? (
								<FieldError>E-mails @fab.mil.br já podem se cadastrar sem autorização.</FieldError>
							) : (
								<FieldDescription>Um e-mail por autorização. Domínio inteiro não é autorizável.</FieldDescription>
							)}
						</Field>
						<Field>
							<FieldLabel htmlFor="external-signup-reason">Motivo</FieldLabel>
							<Textarea
								id="external-signup-reason"
								value={reason}
								onChange={(event) => setReason(event.target.value)}
								maxLength={SIGNUP_ALLOWLIST_REASON_MAX_LENGTH}
								rows={3}
								placeholder="Ex.: parceria GS1 Brasil — validação do catálogo GTIN, pedido do chefe da seção."
								required
							/>
							<FieldDescription>Mínimo de {SIGNUP_ALLOWLIST_REASON_MIN_LENGTH} caracteres. Fica registrado e é lido em auditoria.</FieldDescription>
							<FieldError>{error}</FieldError>
						</Field>
					</FieldGroup>
					<div className="flex justify-end">
						<Button type="submit" disabled={institutional || authorize.isPending}>
							{authorize.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <MailPlus className="size-4" aria-hidden />}
							Autorizar e convidar
						</Button>
					</div>
				</form>

				{outcome && <InviteOutcome outcome={outcome} />}
			</CardContent>
		</Card>
	)
}

/** O convite tem três desfechos; nenhum deles desfaz a autorização. */
function InviteOutcome({ outcome }: { outcome: AuthorizeExternalSignupResult }) {
	if (outcome.invite.status === "sent") {
		return (
			<Alert>
				<UserCheck aria-hidden />
				<AlertTitle>Convite enviado</AlertTitle>
				<AlertDescription>{outcome.email} recebeu um e-mail para definir a senha e entrar.</AlertDescription>
			</Alert>
		)
	}
	if (outcome.invite.status === "account-exists") {
		return (
			<Alert>
				<UserCheck aria-hidden />
				<AlertTitle>Este e-mail já tem conta</AlertTitle>
				<AlertDescription>
					A autorização foi registrada, mas não houve convite: {outcome.email} já pode entrar com a conta que tem. Se esqueceu a senha, use "Esqueci minha
					senha" na tela de entrada.
				</AlertDescription>
			</Alert>
		)
	}
	return (
		<Alert variant="destructive">
			<MailPlus aria-hidden />
			<AlertTitle>Autorizado, mas o convite não saiu</AlertTitle>
			<AlertDescription>
				{outcome.invite.message} A autorização ficou registrada, mas {outcome.email} precisa do convite para criar a conta — os formulários de cadastro só
				aceitam @fab.mil.br. Para reenviar, revogue esta autorização e autorize de novo.
			</AlertDescription>
		</Alert>
	)
}

function SignupAllowlistCard() {
	const { data: rows = [], isLoading, isError } = useSignupAllowlist()
	const active = rows.filter((row) => !row.revoked_at).length

	return (
		<Card>
			<CardHeader>
				<CardTitle>E-mails externos autorizados</CardTitle>
				<CardDescription>
					{isLoading ? "Carregando…" : `${active} ${active === 1 ? "autorização ativa" : "autorizações ativas"}. As revogadas ficam abaixo, como histórico.`}
				</CardDescription>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<div className="space-y-2">
						<Skeleton className="h-16 w-full" />
						<Skeleton className="h-16 w-full" />
					</div>
				) : isError ? (
					<p className="text-body text-destructive">Não foi possível carregar as autorizações.</p>
				) : rows.length === 0 ? (
					<p className="text-body text-muted-foreground">Nenhum e-mail externo autorizado.</p>
				) : (
					<ItemGroup>
						{rows.map((row) => (
							<AllowlistItem key={row.id} row={row} />
						))}
					</ItemGroup>
				)}
			</CardContent>
		</Card>
	)
}

function formatDate(iso: string | null): string {
	if (!iso) return ""
	return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

function AllowlistItem({ row }: { row: SignupAllowlistRow }) {
	const revoke = useRevokeExternalSignup()
	const isRevoked = Boolean(row.revoked_at)

	const handleRevoke = async () => {
		try {
			await revoke.mutateAsync(row.id)
			toast.success("Autorização revogada", { description: row.email })
		} catch (caught) {
			if (isElevationCancelled(caught)) return
			toast.error("Não foi possível revogar", { description: caught instanceof Error ? caught.message : undefined })
		}
	}

	return (
		<Item variant={isRevoked ? "muted" : "outline"} size="sm">
			<ItemContent>
				<ItemTitle>
					{row.email}
					{isRevoked ? <Badge variant="secondary">Revogada</Badge> : <Badge variant="success">Ativa</Badge>}
					{row.has_account ? <Badge variant="outline">Conta criada</Badge> : <Badge variant="outline">Sem conta</Badge>}
				</ItemTitle>
				<ItemDescription>{row.reason}</ItemDescription>
				<ItemDescription>
					Autorizado em {formatDate(row.created_at)}
					{row.authorized_by_email ? ` por ${row.authorized_by_email}` : ""}
					{isRevoked && ` · Revogado em ${formatDate(row.revoked_at)}${row.revoked_by_email ? ` por ${row.revoked_by_email}` : ""}`}
				</ItemDescription>
			</ItemContent>
			{!isRevoked && (
				<ItemActions>
					<AlertDialog>
						<AlertDialogTrigger render={<Button variant="outline" size="sm" disabled={revoke.isPending} />}>
							{revoke.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ShieldOff className="size-4" aria-hidden />}
							Revogar
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Revogar a autorização de {row.email}?</AlertDialogTitle>
								<AlertDialogDescription>
									{row.has_account
										? "A conta que já existe NÃO é apagada — inclusive a criada pelo convite, mesmo que ainda não aceito: o link do convite continua valendo. A revogação só impede que uma conta NOVA seja criada com este e-mail. Para tirar o acesso, revogue as permissões da pessoa."
										: "Este e-mail deixa de poder criar conta, pelo cadastro ou por convite."}
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancelar</AlertDialogCancel>
								<AlertDialogAction variant="destructive" onClick={handleRevoke}>
									Revogar autorização
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</ItemActions>
			)}
		</Item>
	)
}
