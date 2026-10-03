import {
	describeAttemptsLeft,
	describeSaramOutcome,
	describeSaramStatus,
	formatLocalDate,
	formatMilitaryIdentity,
	formatMilitaryName,
	hasSaramAction,
	maskCpf,
	onlyDigits,
	SARAM_REQUEST_EXAMPLE,
	type SaramLinkOutcome,
	type SaramOutcomeView,
	type SaramStatus,
} from "@iefa/database/saram-link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Building2, IdCard, Loader2, X } from "lucide-react"
import { createContext, type FormEvent, type ReactNode, use, useId, useState } from "react"
import { mySaramStatusQueryOptions } from "#/auth/identity"
import { useSucontAccess } from "#/auth/pbac"
import { authQueryOptions } from "#/auth/service"
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "#/components/ui/dialog"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Textarea } from "#/components/ui/textarea"
import { readSaramDismissal, rememberSaramDismissal } from "#/lib/saram-dismissal"
import { SARAM_LINK_FALLBACK_MESSAGE } from "#/lib/saram-link"
import { confirmSaramCandidateFn, requestSaramLinkFn, setOwnAccountKindFn, verifySaramByCpfFn, withdrawSaramRequestFn } from "#/server/user.fn"

/**
 * "Meu cadastro militar" no SUCONT: aviso de entrada não bloqueante + diálogo com o estado do
 * vínculo de SARAM e só as ações que o servidor oferece (`status.actions`).
 *
 * Substitui o diálogo antigo que pedia o número solto (`saveMySaramFn`): o SARAM agora só vale
 * verificado (pelo e-mail institucional, por SARAM + CPF, ou pela administração do sistema), e as
 * frases são as mesmas do sisub (`@iefa/database/saram-link`). A tela do sisub tem o mesmo fluxo
 * em página própria; aqui ele cabe num diálogo, aberto pelo aviso ou pelo menu do usuário.
 */

type DialogApi = { open: () => void }
const MilitaryRecordContext = createContext<DialogApi>({ open: () => {} })

/** Abre o diálogo de qualquer ponto do hub (aviso, menu do usuário). */
export function useMilitaryRecordDialog(): DialogApi {
	return use(MilitaryRecordContext)
}

function useMySaramStatus() {
	const isAuthenticated = useQuery(authQueryOptions()).data?.isAuthenticated ?? false
	// O SARAM é da PESSOA, não da divisão: vale para qualquer módulo do sucont, administração inclusive.
	const { canUseApp } = useSucontAccess()
	return useQuery({ ...mySaramStatusQueryOptions(), enabled: isAuthenticated && canUseApp })
}

export function MilitaryRecordProvider({ children }: { children: ReactNode }) {
	const [open, setOpen] = useState(false)
	const status = useMySaramStatus()
	return (
		<MilitaryRecordContext value={{ open: () => setOpen(true) }}>
			{children}
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<IdCard className="size-4 text-muted-foreground" aria-hidden />
							Meu cadastro militar
						</DialogTitle>
						<DialogDescription>
							O vínculo da sua conta com o cadastro de pessoal da FAB (SARAM): é por ele que o sistema mostra seu posto e nome de guerra.
						</DialogDescription>
					</DialogHeader>
					{status.data ? (
						<MilitaryRecordPanel status={status.data} />
					) : status.error ? (
						<Alert variant="destructive">
							<AlertTitle>Não foi possível ler o seu cadastro militar agora</AlertTitle>
							<AlertDescription>Nada mudou na sua conta. Feche e tente de novo em instantes.</AlertDescription>
						</Alert>
					) : (
						<Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" aria-label="Carregando" />
					)}
				</DialogContent>
			</Dialog>
		</MilitaryRecordContext>
	)
}

/** Aviso não bloqueante: só para quem tem algo a fazer ou a acompanhar. Um clique abre o diálogo. */
export function MilitaryRecordNotice() {
	const { data: status } = useMySaramStatus()
	const dialog = useMilitaryRecordDialog()
	const [dismissed, setDismissed] = useState(readSaramDismissal)
	if (!status) return null
	const view = describeSaramStatus(status)
	if (!view.needsAttention || !view.notice || dismissed === status.status) return null
	return (
		<section aria-label="Aviso sobre o seu cadastro militar" className="mb-6">
			{/* Variante neutra: as coloridas do sucont pintam o texto inteiro, e o aviso é para ler. */}
			<Alert role="status">
				<IdCard aria-hidden />
				<AlertDescription className="text-foreground">{view.notice.text}</AlertDescription>
				<div className="col-start-2 mt-2 flex flex-wrap items-center gap-2">
					<Button size="sm" onClick={dialog.open}>
						{view.notice.cta}
					</Button>
					<Button
						size="sm"
						variant="ghost"
						aria-label="Dispensar aviso até recarregar a página"
						onClick={() => {
							rememberSaramDismissal(status.status)
							setDismissed(status.status)
						}}
					>
						<X aria-hidden />
						Agora não
					</Button>
				</div>
			</Alert>
		</section>
	)
}

type Step = null | "alternatives" | "cpf" | "request" | "institutional" | "personal" | "withdraw"

function errorText(error: unknown): string {
	return error instanceof Error && error.message ? error.message : SARAM_LINK_FALLBACK_MESSAGE
}

function MilitaryRecordPanel({ status }: { status: SaramStatus }) {
	const queryClient = useQueryClient()
	const view = describeSaramStatus(status)
	const [step, setStep] = useState<Step>(null)
	const [feedback, setFeedback] = useState<SaramOutcomeView | null>(null)
	const [prevStatus, setPrevStatus] = useState(status.status)
	if (prevStatus !== status.status) {
		setPrevStatus(status.status)
		setStep(null)
	}

	const action = useMutation({
		mutationFn: (run: () => Promise<SaramLinkOutcome>) => run(),
		onSuccess: (result) => {
			queryClient.setQueryData(mySaramStatusQueryOptions().queryKey, result.status)
			// A lista de acessos mostra o nome de quem verificou — e quem verifica costuma ser o administrador olhando.
			queryClient.invalidateQueries({ queryKey: ["sucont", "grants"] })
			setFeedback(describeSaramOutcome(result))
		},
		onError: (error) => {
			setFeedback({ kind: "error", title: "Não foi possível concluir", description: errorText(error) })
			queryClient.invalidateQueries({ queryKey: mySaramStatusQueryOptions().queryKey })
		},
	})
	const run = (fn: () => Promise<SaramLinkOutcome>) => {
		setFeedback(null)
		action.mutate(fn)
	}
	const busy = action.isPending
	const candidate = status.candidates[0]
	// Escolher uma alternativa (CPF, pedido, seção) continua dentro do bloco de alternativas.
	const inAlternatives = step === "alternatives" || step === "cpf" || step === "request" || step === "institutional"
	const showAlternatives = inAlternatives || status.status === "no_match" || status.status === "locked_out" || status.status === "legacy"
	// Vínculo antigo cujo e-mail localiza o dono: confirmar pelo e-mail troca o legacy por um verificado.
	const legacyCanConfirm = status.status === "legacy" && hasSaramAction(status, "confirm_candidate") && status.candidates.length > 0

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-1.5">
				<div className="flex items-center gap-2">
					{status.status === "institutional" && <Building2 className="size-4 text-muted-foreground" aria-hidden />}
					<Badge variant={view.tone === "ok" ? "success" : view.tone === "blocked" ? "destructive" : view.tone === "attention" ? "warning" : "outline"}>
						{view.badge}
					</Badge>
				</div>
				<p className="text-subheading text-foreground">{view.title}</p>
				<p className="text-body text-muted-foreground">{view.description}</p>
				{(status.status === "verified" || status.status === "legacy") && status.visible && status.identity && (
					<p className="text-caption text-muted-foreground">
						{formatMilitaryIdentity(status.identity)} · SARAM {status.saram}
					</p>
				)}
			</div>

			{feedback && (
				<Alert
					variant={feedback.kind === "error" ? "destructive" : feedback.kind === "success" ? "success" : "info"}
					role={feedback.kind === "error" ? "alert" : "status"}
				>
					<AlertTitle>{feedback.title}</AlertTitle>
					<AlertDescription>{feedback.description}</AlertDescription>
				</Alert>
			)}

			{(status.status === "suggestion" || (legacyCanConfirm && !status.requiresCpfSuffix)) && candidate && step === null && (
				<div className="flex flex-col gap-2 sm:flex-row">
					<Button disabled={busy} onClick={() => run(() => confirmSaramCandidateFn({ data: { candidateRef: candidate.ref } }))}>
						{busy && <Loader2 className="animate-spin" aria-hidden />}
						Sou eu
					</Button>
					<Button variant="outline" disabled={busy} onClick={() => setStep("alternatives")}>
						Não sou eu
					</Button>
				</div>
			)}

			{(status.status === "homonyms" || (legacyCanConfirm && status.requiresCpfSuffix)) && step === null && (
				<HomonymsForm
					status={status}
					busy={busy}
					onSubmit={(candidateRef, cpfSuffix) => run(() => confirmSaramCandidateFn({ data: { candidateRef, cpfSuffix } }))}
					onNone={() => setStep("alternatives")}
				/>
			)}

			{(status.status === "pending_request" || status.status === "contested") && status.request && (
				<div className="flex flex-col gap-2 rounded-lg border p-3">
					<p className="text-caption text-muted-foreground">
						SARAM {status.request.saram} · enviado em {formatLocalDate(status.request.createdAt)} · decide a administração do sistema
					</p>
					<p className="text-body text-foreground">“{status.request.justification}”</p>
					{step === "withdraw" ? (
						<ConfirmRow
							text="A administração deixa de analisar este pedido. Depois você pode verificar de outro jeito ou pedir de novo."
							confirmLabel="Desistir"
							busy={busy}
							destructive
							onCancel={() => setStep(null)}
							onConfirm={() => run(() => withdrawSaramRequestFn({ data: { requestId: status.request?.id ?? "" } }))}
						/>
					) : (
						<Button variant="outline" size="sm" className="self-start" disabled={busy} onClick={() => setStep("withdraw")}>
							{status.status === "contested" ? "Desistir da contestação" : "Desistir do pedido"}
						</Button>
					)}
				</div>
			)}

			{status.status === "institutional" &&
				hasSaramAction(status, "set_personal") &&
				(step === "personal" ? (
					<ConfirmRow
						text="A conta volta a poder arranchar no SISUB e passa a pedir o vínculo do SARAM de quem a usa."
						confirmLabel="Marcar como pessoal"
						busy={busy}
						onCancel={() => setStep(null)}
						onConfirm={() => run(() => setOwnAccountKindFn({ data: { kind: "pessoal" } }))}
					/>
				) : (
					<Button variant="outline" size="sm" className="self-start" onClick={() => setStep("personal")}>
						Na verdade, esta é uma conta pessoal
					</Button>
				))}

			{showAlternatives && (
				<div className="flex flex-col gap-3 border-t pt-4">
					<p className="text-subheading text-foreground">{status.status === "legacy" ? "Se quiser, confirme o vínculo agora" : "Como vincular seu SARAM"}</p>
					{hasSaramAction(status, "verify_cpf") &&
						(step === "cpf" ? (
							<CpfForm attemptsLeft={status.attemptsLeft} busy={busy} onSubmit={(saram, cpf) => run(() => verifySaramByCpfFn({ data: { saram, cpf } }))} />
						) : (
							<OptionButton title="Conferir pelo SARAM e o CPF" description="Conferimos no cadastro de pessoal na hora." onClick={() => setStep("cpf")} />
						))}
					{hasSaramAction(status, "request_link") &&
						(step === "request" ? (
							<RequestForm busy={busy} onSubmit={(saram, justification) => run(() => requestSaramLinkFn({ data: { saram, justification } }))} />
						) : (
							<OptionButton
								title="Pedir o vínculo à administração"
								description="Para quem não está no cadastro ou não consegue conferir."
								onClick={() => setStep("request")}
							/>
						))}
					{hasSaramAction(status, "set_institutional") &&
						(step === "institutional" ? (
							<ConfirmRow
								text="Esta conta deixa de ter SARAM e arranchamento próprio (os arranchamentos de hoje em diante são cancelados). Módulos e permissões continuam."
								confirmLabel="Marcar como conta de seção"
								busy={busy}
								onCancel={() => setStep(null)}
								onConfirm={() => run(() => setOwnAccountKindFn({ data: { kind: "institucional" } }))}
							/>
						) : (
							<OptionButton
								title="Esta é uma conta de seção ou OM"
								description="Usada por uma seção, não por uma pessoa."
								onClick={() => setStep("institutional")}
							/>
						))}
				</div>
			)}
		</div>
	)
}

function OptionButton({ title, description, onClick }: { title: string; description: string; onClick: () => void }) {
	return (
		<div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
			<div className="flex flex-col gap-0.5">
				<span className="text-body text-foreground">{title}</span>
				<span className="text-caption text-muted-foreground">{description}</span>
			</div>
			<Button size="sm" variant="outline" className="shrink-0 self-start sm:self-auto" onClick={onClick}>
				Escolher
			</Button>
		</div>
	)
}

function ConfirmRow({
	text,
	confirmLabel,
	busy,
	destructive,
	onCancel,
	onConfirm,
}: {
	text: string
	confirmLabel: string
	busy: boolean
	destructive?: boolean
	onCancel: () => void
	onConfirm: () => void
}) {
	return (
		<fieldset className="flex flex-col gap-2 rounded-lg border p-3">
			<legend className="sr-only">Confirmação</legend>
			<p className="text-body text-foreground">{text}</p>
			<div className="flex flex-wrap gap-2">
				<Button size="sm" variant={destructive ? "destructive" : "default"} disabled={busy} onClick={onConfirm}>
					{busy && <Loader2 className="animate-spin" aria-hidden />}
					{confirmLabel}
				</Button>
				<Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
					Cancelar
				</Button>
			</div>
		</fieldset>
	)
}

function HomonymsForm({
	status,
	busy,
	onSubmit,
	onNone,
}: {
	status: SaramStatus
	busy: boolean
	onSubmit: (candidateRef: number, cpfSuffix: string) => void
	onNone: () => void
}) {
	const [choice, setChoice] = useState<number | null>(status.candidates.length === 1 ? (status.candidates[0]?.ref ?? null) : null)
	const [suffix, setSuffix] = useState("")
	const suffixId = useId()
	const submit = (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault()
		if (choice !== null && suffix.length === 4) onSubmit(choice, suffix)
	}
	return (
		<form onSubmit={submit} className="flex flex-col gap-3" noValidate>
			<fieldset className="flex flex-col gap-2">
				<legend className="mb-1 text-subheading text-foreground">Qual destes é você?</legend>
				{status.candidates.map((c) => (
					<label key={c.ref} className="flex items-center gap-3 rounded-lg border p-2.5 has-checked:border-primary">
						<input type="radio" name="candidate" checked={choice === c.ref} onChange={() => setChoice(c.ref)} disabled={busy} />
						<span className="flex flex-col">
							<span className="text-body text-foreground">{formatMilitaryName(c) || "Sem nome de guerra no cadastro"}</span>
							<span className="text-caption text-muted-foreground">{c.sgOrg ?? "OM não informada"}</span>
						</span>
					</label>
				))}
			</fieldset>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor={suffixId}>4 últimos dígitos do seu CPF</Label>
				<Input
					id={suffixId}
					className="max-w-32"
					value={suffix}
					onChange={(e) => setSuffix(onlyDigits(e.target.value, 4))}
					inputMode="numeric"
					autoComplete="off"
					maxLength={4}
					disabled={busy}
				/>
				<p className="text-hint text-muted-foreground">{describeAttemptsLeft(status.attemptsLeft)}</p>
			</div>
			<div className="flex flex-wrap gap-2">
				<Button type="submit" disabled={busy || choice === null || suffix.length !== 4}>
					{busy && <Loader2 className="animate-spin" aria-hidden />}
					Confirmar
				</Button>
				<Button type="button" variant="outline" disabled={busy} onClick={onNone}>
					Nenhum destes sou eu
				</Button>
			</div>
		</form>
	)
}

function CpfForm({ attemptsLeft, busy, onSubmit }: { attemptsLeft: number; busy: boolean; onSubmit: (saram: string, cpf: string) => void }) {
	const [saram, setSaram] = useState("")
	const [cpf, setCpf] = useState("")
	const saramId = useId()
	const cpfId = useId()
	const valid = /^\d{6,7}$/.test(saram) && cpf.length === 11
	return (
		<form
			className="flex flex-col gap-3 rounded-lg border p-3"
			noValidate
			onSubmit={(e) => {
				e.preventDefault()
				if (valid) onSubmit(saram, cpf)
			}}
		>
			<div className="grid gap-3 sm:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor={saramId}>SARAM</Label>
					<Input id={saramId} value={saram} onChange={(e) => setSaram(onlyDigits(e.target.value, 7))} inputMode="numeric" autoComplete="off" disabled={busy} />
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor={cpfId}>CPF</Label>
					<Input
						id={cpfId}
						value={maskCpf(cpf)}
						onChange={(e) => setCpf(onlyDigits(e.target.value, 11))}
						inputMode="numeric"
						autoComplete="off"
						placeholder="000.000.000-00"
						disabled={busy}
					/>
				</div>
			</div>
			<p className="text-hint text-muted-foreground">O CPF é conferido no banco e não é guardado. {describeAttemptsLeft(attemptsLeft)}</p>
			<Button type="submit" className="self-start" disabled={busy || !valid}>
				{busy && <Loader2 className="animate-spin" aria-hidden />}
				Conferir e vincular
			</Button>
		</form>
	)
}

function RequestForm({ busy, onSubmit }: { busy: boolean; onSubmit: (saram: string, justification: string) => void }) {
	const [saram, setSaram] = useState("")
	const [text, setText] = useState("")
	const saramId = useId()
	const textId = useId()
	const valid = /^\d{6,7}$/.test(saram) && text.trim().length >= 10
	return (
		<form
			className="flex flex-col gap-3 rounded-lg border p-3"
			noValidate
			onSubmit={(e) => {
				e.preventDefault()
				if (valid) onSubmit(saram, text.trim())
			}}
		>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor={saramId}>Seu SARAM</Label>
				<Input
					id={saramId}
					className="max-w-40"
					value={saram}
					onChange={(e) => setSaram(onlyDigits(e.target.value, 7))}
					inputMode="numeric"
					autoComplete="off"
					disabled={busy}
				/>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor={textId}>Por que você pede este vínculo?</Label>
				<Textarea
					id={textId}
					value={text}
					onChange={(e) => setText(e.target.value.slice(0, 1000))}
					placeholder={SARAM_REQUEST_EXAMPLE}
					rows={3}
					disabled={busy}
				/>
				<p className="text-hint text-muted-foreground">Mínimo de 10 caracteres: diga posto, nome de guerra, OM e o que mudou.</p>
			</div>
			<Button type="submit" className="self-start" disabled={busy || !valid}>
				{busy && <Loader2 className="animate-spin" aria-hidden />}
				Enviar pedido
			</Button>
		</form>
	)
}
