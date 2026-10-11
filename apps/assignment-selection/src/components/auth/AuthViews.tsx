import { AlertCircle, Loader2, LogOut, ShieldAlert } from "lucide-react"
import { type SyntheticEvent, useId } from "react"
import { Crest } from "@/components/Crest"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * Porta de entrada do controle: fundo liso, identidade em uma linha, formulário direto.
 * Escura como o controle e o telão; nada de brilho ou vidro, que competiriam com o campo.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex min-h-screen w-full items-center justify-center bg-background px-4 py-12 text-foreground">
			<div className="flex w-full max-w-sm flex-col gap-6">
				<div className="flex items-center gap-3">
					<Crest alt="" className="size-10 shrink-0 object-contain" />
					<div>
						<p className="text-base font-semibold leading-tight text-foreground">Escolha de Vagas</p>
						<p className="text-sm text-muted-foreground">CPAINT · Força Aérea Brasileira</p>
					</div>
				</div>
				<div className="rounded-xl border border-border bg-card p-6 text-card-foreground">{children}</div>
				<p className="text-xs text-muted-foreground">Acesso restrito aos operadores autorizados do controle. O telão é público e não pede login.</p>
			</div>
		</div>
	)
}

interface LoginFormProps {
	email: string
	password: string
	error: string | null
	loading: boolean
	onEmailChange: (value: string) => void
	onPasswordChange: (value: string) => void
	onSubmit: (e: SyntheticEvent) => void
}

export function LoginForm({ email, password, error, loading, onEmailChange, onPasswordChange, onSubmit }: LoginFormProps) {
	const emailId = useId()
	const passwordId = useId()
	const errorId = useId()

	return (
		<form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
			<div>
				<h1 className="text-lg font-semibold text-foreground">Entrar no controle</h1>
				<p className="text-sm text-muted-foreground">Use o e-mail institucional e a senha da sua conta.</p>
			</div>

			<div className="grid gap-1.5">
				<label htmlFor={emailId} className="text-sm font-medium text-foreground">
					E-mail
				</label>
				<Input
					id={emailId}
					data-size="lg"
					type="email"
					inputMode="email"
					autoComplete="username"
					autoFocus
					value={email}
					onChange={(e) => onEmailChange(e.target.value)}
					placeholder="nome@fab.mil.br"
					aria-invalid={error ? true : undefined}
					aria-describedby={error ? errorId : undefined}
					required
				/>
			</div>

			<div className="grid gap-1.5">
				<label htmlFor={passwordId} className="text-sm font-medium text-foreground">
					Senha
				</label>
				<Input
					id={passwordId}
					data-size="lg"
					type="password"
					autoComplete="current-password"
					value={password}
					onChange={(e) => onPasswordChange(e.target.value)}
					aria-invalid={error ? true : undefined}
					aria-describedby={error ? errorId : undefined}
					required
				/>
			</div>

			{error && (
				<div
					id={errorId}
					role="alert"
					className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
				>
					<AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
					<span>{error}</span>
				</div>
			)}

			<Button type="submit" size="lg" className="w-full" disabled={loading}>
				{loading && <Loader2 className="animate-spin" aria-hidden="true" />}
				{loading ? "Entrando…" : "Entrar"}
			</Button>
		</form>
	)
}

export function NoAccessPanel({ email, loading, onSignOut }: { email: string; loading: boolean; onSignOut: () => void }) {
	return (
		<div className="flex flex-col gap-5">
			<div className="flex items-start gap-3">
				<span className="grid size-10 shrink-0 place-items-center rounded-lg bg-warning/15 text-warning" aria-hidden="true">
					<ShieldAlert className="size-5" />
				</span>
				<div>
					<h1 className="text-lg font-semibold text-foreground">Sem acesso ao controle</h1>
					<p className="text-sm text-muted-foreground">
						A conta <span className="font-medium text-foreground">{email}</span> entrou, mas não tem permissão para operar o telão. Peça a concessão ao
						administrador e entre de novo.
					</p>
				</div>
			</div>
			<Button variant="outline" size="lg" className="w-full" onClick={onSignOut} disabled={loading}>
				{loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <LogOut aria-hidden="true" />}
				Sair e entrar com outra conta
			</Button>
		</div>
	)
}
