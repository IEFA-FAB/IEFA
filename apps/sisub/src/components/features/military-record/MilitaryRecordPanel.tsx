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
	SARAM_FALLBACK_ERROR_MESSAGE,
	SARAM_REQUEST_EXAMPLE,
	type SaramCandidate,
	type SaramLinkOutcome,
	type SaramOutcomeView,
	type SaramStatus,
	type SaramTone,
} from "@iefa/database/saram-link"
import { useMutation } from "@tanstack/react-query"
import { BadgeCheck, Building2, Clock, IdCard, Info, KeyRound, Loader2, MessageSquareText, ShieldAlert, UserRoundSearch } from "lucide-react"
import { type FormEvent, useId, useRef, useState } from "react"
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
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import type { SaramLinkApi } from "@/hooks/business/useUserSaram"

/**
 * "Meu cadastro militar": o estado do vínculo de SARAM da própria conta e só as ações que o
 * servidor oferece (`status.actions`). Cada estado é UMA pergunta em linguagem simples; as
 * alternativas (CPF, pedido à administração, conta de seção) aparecem no lugar, sem trocar de
 * tela, e o que é difícil de desfazer pede confirmação dizendo o efeito.
 *
 * Os valores do contrato (`legacy`, `institucional`, `email`/`cpf`/`admin`) não aparecem: a frase
 * vem de `describeSaramStatus` (`@iefa/database/saram-link`), a mesma do sucont.
 */

type Feedback = SaramOutcomeView & { source: "top" | "cpf" | "suffix" | "request" }
type Alternative = "cpf" | "request"

const TONE_BADGE: Record<SaramTone, "success" | "outline" | "warning" | "destructive"> = {
	ok: "success",
	info: "outline",
	attention: "warning",
	blocked: "destructive",
}

const TONE_ICON: Record<SaramTone, typeof BadgeCheck> = {
	ok: BadgeCheck,
	info: Info,
	attention: UserRoundSearch,
	blocked: ShieldAlert,
}

function errorMessage(error: unknown): string {
	return error instanceof Error && error.message ? error.message : SARAM_FALLBACK_ERROR_MESSAGE
}

export function MilitaryRecordPanel({ status, api, now }: { status: SaramStatus; api: SaramLinkApi; now?: Date }) {
	const view = describeSaramStatus(status, now)
	const Icon = status.status === "institutional" ? Building2 : TONE_ICON[view.tone]

	const [feedback, setFeedback] = useState<Feedback | null>(null)
	const [alternative, setAlternative] = useState<Alternative | null>(null)
	const [showAlternatives, setShowAlternatives] = useState(false)
	const feedbackRef = useRef<HTMLDivElement>(null)

	// Estado novo (verificou, pediu, desistiu): volta ao começo do passo. Padrão "ajuste no render"
	// do React, sem efeito.
	const [prevStatus, setPrevStatus] = useState(status.status)
	if (prevStatus !== status.status) {
		setPrevStatus(status.status)
		setAlternative(null)
		setShowAlternatives(false)
	}

	const action = useMutation({
		mutationFn: ({ run }: { run: () => Promise<SaramLinkOutcome>; source: Feedback["source"] }) => run(),
		onSuccess: (result, { source }) => {
			const outcome = describeSaramOutcome(result, now)
			// Erro de conferência fica junto do formulário (a pessoa vai redigitar); o resto, no topo.
			setFeedback({ ...outcome, source: outcome.kind === "error" ? source : "top" })
			if (outcome.kind !== "error") requestAnimationFrame(() => feedbackRef.current?.focus())
		},
		onError: (error, { source }) => {
			setFeedback({ kind: "error", title: "Não foi possível concluir", description: errorMessage(error), source })
			// O pedido pode ter sido decidido, a carga do cadastro pode ter mudado: o estado é relido.
			void api.refresh()
		},
	})

	const run = (source: Feedback["source"], fn: () => Promise<SaramLinkOutcome>) => {
		setFeedback(null)
		action.mutate({ run: fn, source })
	}
	const busy = action.isPending
	const formFeedback = (source: Feedback["source"]) => (feedback && feedback.source === source ? feedback : null)

	const offersAlternatives = hasSaramAction(status, "verify_cpf") || hasSaramAction(status, "request_link") || hasSaramAction(status, "set_institutional")
	// Sem sugestão nem candidato, as alternativas SÃO a tela; com sugestão, ficam atrás do "Não sou eu".
	const alternativesVisible =
		status.status === "no_match" || status.status === "locked_out" || status.status === "legacy" || (showAlternatives && offersAlternatives)

	return (
		<div className="flex flex-col gap-6">
			<Card>
				<CardHeader>
					<div className="flex flex-wrap items-center gap-2">
						<Icon className="size-5 text-muted-foreground" aria-hidden />
						<Badge variant={TONE_BADGE[view.tone]}>{view.badge}</Badge>
					</div>
					<CardTitle className="text-heading text-foreground">
						<h2>{view.title}</h2>
					</CardTitle>
					<CardDescription className="max-w-prose text-body">{view.description}</CardDescription>
				</CardHeader>
				{(status.status === "verified" || status.status === "legacy") && status.visible && status.identity && (
					<CardContent>
						<IdentityList identity={status.identity} saram={status.saram} />
					</CardContent>
				)}
				{status.status === "suggestion" && status.candidates[0] && !showAlternatives && (
					<CardContent>
						<SuggestionStep
							candidate={status.candidates[0]}
							busy={busy}
							onConfirm={(candidate) => run("top", () => api.confirmCandidate({ candidateRef: candidate.ref }))}
							onNotMe={() => setShowAlternatives(true)}
						/>
					</CardContent>
				)}
				{status.status === "institutional" && hasSaramAction(status, "set_personal") && (
					<CardContent>
						<InstitutionalAction busy={busy} onSetPersonal={() => run("top", () => api.setAccountKind({ kind: "pessoal" }))} />
					</CardContent>
				)}
				{status.hasUnverifiedSaram && status.status !== "verified" && (
					<CardContent>
						<p className="max-w-prose text-caption text-muted-foreground">
							Há um SARAM informado antes nesta conta que ainda não foi conferido. Ele não vale até a verificação abaixo.
						</p>
					</CardContent>
				)}
			</Card>

			{feedback && feedback.source === "top" && <FeedbackAlert feedback={feedback} focusRef={feedbackRef} />}

			{status.status === "homonyms" && !showAlternatives && (
				<HomonymsStep
					status={status}
					busy={busy}
					feedback={formFeedback("suffix")}
					onConfirm={(candidateRef, cpfSuffix) => run("suffix", () => api.confirmCandidate({ candidateRef, cpfSuffix }))}
					onNoneIsMe={() => setShowAlternatives(true)}
				/>
			)}

			{(status.status === "pending_request" || status.status === "contested") && status.request && (
				<PendingRequestCard status={status} busy={busy} onWithdraw={(requestId) => run("top", () => api.withdrawRequest({ requestId }))} />
			)}

			{alternativesVisible && offersAlternatives && (
				<section aria-labelledby="alternatives-title" className="flex flex-col gap-3">
					<div className="flex flex-col gap-1">
						<h2 id="alternatives-title" className="text-subheading text-foreground">
							{status.status === "legacy"
								? "Se quiser, confirme o vínculo agora"
								: showAlternatives
									? "Então vamos por outro caminho"
									: "Como vincular seu SARAM"}
						</h2>
						{status.status === "suggestion" || status.status === "homonyms" ? (
							<Button variant="link" size="sm" className="self-start" onClick={() => setShowAlternatives(false)}>
								Voltar à sugestão
							</Button>
						) : null}
					</div>
					<ItemGroup>
						{hasSaramAction(status, "verify_cpf") && (
							<AlternativeItem
								icon={KeyRound}
								title="Conferir pelo SARAM e o CPF"
								description="Conferimos no cadastro de pessoal na hora. Vale para quem mudou de nome ou tem e-mail fora do padrão."
								open={alternative === "cpf"}
								onToggle={() => setAlternative(alternative === "cpf" ? null : "cpf")}
							>
								<CpfVerifyForm
									attemptsLeft={status.attemptsLeft}
									busy={busy}
									feedback={formFeedback("cpf")}
									onSubmit={(saram, cpf) => run("cpf", () => api.verifyByCpf({ saram, cpf }))}
								/>
							</AlternativeItem>
						)}
						{hasSaramAction(status, "request_link") && (
							<AlternativeItem
								icon={MessageSquareText}
								title="Pedir o vínculo à administração"
								description="Para quem não está no cadastro de pessoal, não tem o CPF à mão ou não consegue conferir. Você continua arranchando enquanto isso."
								open={alternative === "request"}
								onToggle={() => setAlternative(alternative === "request" ? null : "request")}
							>
								<RequestLinkForm
									busy={busy}
									feedback={formFeedback("request")}
									onSubmit={(saram, justification) => run("request", () => api.requestLink({ saram, justification }))}
								/>
							</AlternativeItem>
						)}
						{hasSaramAction(status, "set_institutional") && (
							<InstitutionalAlternative busy={busy} onConfirm={() => run("top", () => api.setAccountKind({ kind: "institucional" }))} />
						)}
					</ItemGroup>
				</section>
			)}

			{status.status === "verified" && (
				<p className="max-w-prose text-caption text-muted-foreground">
					Algum dado está errado ou o SARAM não é seu? Procure a administração do sistema (iefa@fab.mil.br): o vínculo verificado só muda por ela.
				</p>
			)}
		</div>
	)
}

// ── Peças ───────────────────────────────────────────────────────────────────

function FeedbackAlert({ feedback, focusRef }: { feedback: SaramOutcomeView; focusRef?: React.Ref<HTMLDivElement> }) {
	const variant = feedback.kind === "error" ? "destructive" : feedback.kind === "success" ? "success" : "info"
	return (
		<Alert variant={variant} ref={focusRef} tabIndex={-1} role={feedback.kind === "error" ? "alert" : "status"}>
			{feedback.kind === "error" ? <ShieldAlert aria-hidden /> : <BadgeCheck aria-hidden />}
			<AlertTitle>{feedback.title}</AlertTitle>
			<AlertDescription>{feedback.description}</AlertDescription>
		</Alert>
	)
}

function IdentityList({ identity, saram }: { identity: NonNullable<SaramStatus["identity"]>; saram: string | null }) {
	const rows: Array<[string, string]> = [
		["Posto", identity.posto ?? "—"],
		["Nome de guerra", formatMilitaryName({ posto: null, nomeGuerra: identity.nomeGuerra }) || "—"],
		["OM", identity.sgOrg ?? "—"],
		["SARAM", saram ?? "—"],
	]
	return (
		<dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
			{rows.map(([label, value]) => (
				<div key={label} className="flex flex-col gap-0.5">
					<dt className="text-caption text-muted-foreground">{label}</dt>
					<dd className="text-body text-foreground tabular-nums">{value}</dd>
				</div>
			))}
		</dl>
	)
}

function SuggestionStep({
	candidate,
	busy,
	onConfirm,
	onNotMe,
}: {
	candidate: SaramCandidate
	busy: boolean
	onConfirm: (candidate: SaramCandidate) => void
	onNotMe: () => void
}) {
	return (
		<div className="flex flex-col gap-4 border-t pt-4">
			<CandidateSummary candidate={candidate} />
			{candidate.heldByOther && (
				<p className="max-w-prose text-caption text-muted-foreground">
					{candidate.holderVerified
						? "Este cadastro já está vinculado a outra conta verificada. Confirmando, abrimos uma contestação para a administração decidir."
						: "Este cadastro aparece em outra conta, mas sem verificação. Confirmando, o vínculo passa para você."}
				</p>
			)}
			<div className="flex flex-col gap-2 sm:flex-row">
				<Button size="lg" className="w-full sm:w-auto" disabled={busy} onClick={() => onConfirm(candidate)}>
					{busy && <Loader2 className="animate-spin" aria-hidden />}
					Sou eu
				</Button>
				<Button size="lg" variant="outline" className="w-full sm:w-auto" disabled={busy} onClick={onNotMe}>
					Não sou eu
				</Button>
			</div>
		</div>
	)
}

function CandidateSummary({ candidate }: { candidate: SaramCandidate }) {
	return (
		<div className="flex items-center gap-3">
			<IdCard className="size-8 shrink-0 text-muted-foreground" aria-hidden />
			<div className="flex flex-col">
				<span className="text-heading text-foreground">{formatMilitaryName(candidate) || "Cadastro sem nome de guerra"}</span>
				<span className="text-caption text-muted-foreground">{candidate.sgOrg ? `OM: ${candidate.sgOrg}` : "OM não informada no cadastro"}</span>
			</div>
		</div>
	)
}

function HomonymsStep({
	status,
	busy,
	feedback,
	onConfirm,
	onNoneIsMe,
}: {
	status: SaramStatus
	busy: boolean
	feedback: Feedback | null
	onConfirm: (candidateRef: number, cpfSuffix: string) => void
	onNoneIsMe: () => void
}) {
	const [choice, setChoice] = useState<string | null>(status.candidates.length === 1 ? String(status.candidates[0]?.ref) : null)
	const [suffix, setSuffix] = useState("")
	const [touched, setTouched] = useState(false)
	const suffixId = useId()
	const suffixHelpId = useId()
	const choiceError = touched && !choice ? "Escolha o seu cadastro." : null
	const suffixError = touched && suffix.length !== 4 ? "Informe os 4 últimos dígitos do seu CPF." : null

	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		setTouched(true)
		if (!choice || suffix.length !== 4) return
		onConfirm(Number(choice), suffix)
	}

	return (
		<Card>
			<CardContent>
				<form onSubmit={submit} noValidate className="flex flex-col gap-5">
					<FieldGroup>
						<Field data-invalid={!!choiceError}>
							<FieldLabel id={`${suffixId}-choice`}>{status.candidates.length === 1 ? "Este é o cadastro encontrado" : "Qual destes é você?"}</FieldLabel>
							<RadioGroup aria-labelledby={`${suffixId}-choice`} value={choice} onValueChange={(value) => setChoice(value as string)} disabled={busy}>
								{status.candidates.map((candidate) => (
									<FieldLabel key={candidate.ref} className="w-full">
										<Field orientation="horizontal">
											<RadioGroupItem value={String(candidate.ref)} aria-label={formatMilitaryIdentity(candidate)} />
											<span className="flex flex-col">
												<span className="text-subheading text-foreground">{formatMilitaryName(candidate) || "Sem nome de guerra no cadastro"}</span>
												<span className="text-caption text-muted-foreground">
													{candidate.sgOrg ?? "OM não informada"}
													{candidate.heldByOther ? (candidate.holderVerified ? " · já vinculado a outra conta" : " · em outra conta, sem verificação") : ""}
												</span>
											</span>
										</Field>
									</FieldLabel>
								))}
							</RadioGroup>
							{choiceError && <FieldError>{choiceError}</FieldError>}
						</Field>
						<Field data-invalid={!!suffixError}>
							<FieldLabel htmlFor={suffixId}>4 últimos dígitos do seu CPF</FieldLabel>
							<Input
								id={suffixId}
								className="max-w-32"
								value={suffix}
								onChange={(e) => setSuffix(onlyDigits(e.target.value, 4))}
								inputMode="numeric"
								autoComplete="off"
								enterKeyHint="done"
								maxLength={4}
								placeholder="0000"
								aria-invalid={!!suffixError}
								aria-describedby={suffixHelpId}
								disabled={busy}
							/>
							<FieldDescription id={suffixHelpId}>
								Conferimos no cadastro de pessoal e não guardamos o número. {describeAttemptsLeft(status.attemptsLeft)}
							</FieldDescription>
							{suffixError && <FieldError>{suffixError}</FieldError>}
						</Field>
					</FieldGroup>
					{feedback && <FeedbackAlert feedback={feedback} />}
					<div className="flex flex-col gap-2 sm:flex-row">
						<Button type="submit" size="lg" className="w-full sm:w-auto" disabled={busy}>
							{busy && <Loader2 className="animate-spin" aria-hidden />}
							Confirmar
						</Button>
						<Button type="button" size="lg" variant="outline" className="w-full sm:w-auto" disabled={busy} onClick={onNoneIsMe}>
							Nenhum destes sou eu
						</Button>
					</div>
				</form>
			</CardContent>
		</Card>
	)
}

function AlternativeItem({
	icon: Icon,
	title,
	description,
	open,
	onToggle,
	children,
}: {
	icon: typeof KeyRound
	title: string
	description: string
	open: boolean
	onToggle: () => void
	children: React.ReactNode
}) {
	const panelId = useId()
	return (
		<Item variant="outline" role="listitem">
			<ItemMedia variant="icon">
				<Icon aria-hidden />
			</ItemMedia>
			<ItemContent>
				<ItemTitle>{title}</ItemTitle>
				<ItemDescription className="line-clamp-none">{description}</ItemDescription>
			</ItemContent>
			<Button variant={open ? "ghost" : "outline"} size="sm" className="w-full sm:w-auto" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
				{open ? "Fechar" : "Escolher"}
			</Button>
			{open && (
				<div id={panelId} className="basis-full pt-3">
					{children}
				</div>
			)}
		</Item>
	)
}

function CpfVerifyForm({
	attemptsLeft,
	busy,
	feedback,
	onSubmit,
}: {
	attemptsLeft: number
	busy: boolean
	feedback: Feedback | null
	onSubmit: (saram: string, cpf: string) => void
}) {
	const [saram, setSaram] = useState("")
	const [cpf, setCpf] = useState("")
	const [touched, setTouched] = useState(false)
	const saramId = useId()
	const cpfId = useId()
	const cpfHelpId = useId()
	const saramError = touched && !/^\d{6,7}$/.test(saram) ? "O SARAM tem 6 ou 7 dígitos." : null
	const cpfError = touched && onlyDigits(cpf, 11).length !== 11 ? "O CPF tem 11 dígitos." : null

	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		setTouched(true)
		if (!/^\d{6,7}$/.test(saram) || onlyDigits(cpf, 11).length !== 11) return
		onSubmit(saram, onlyDigits(cpf, 11))
	}

	return (
		<form onSubmit={submit} noValidate className="flex flex-col gap-4">
			<FieldGroup>
				<div className="grid gap-4 sm:grid-cols-2">
					<Field data-invalid={!!saramError}>
						<FieldLabel htmlFor={saramId}>SARAM</FieldLabel>
						<Input
							id={saramId}
							value={saram}
							onChange={(e) => setSaram(onlyDigits(e.target.value, 7))}
							inputMode="numeric"
							autoComplete="off"
							maxLength={7}
							placeholder="1234567"
							aria-invalid={!!saramError}
							disabled={busy}
						/>
						{saramError && <FieldError>{saramError}</FieldError>}
					</Field>
					<Field data-invalid={!!cpfError}>
						<FieldLabel htmlFor={cpfId}>CPF</FieldLabel>
						<Input
							id={cpfId}
							value={maskCpf(cpf)}
							onChange={(e) => setCpf(onlyDigits(e.target.value, 11))}
							inputMode="numeric"
							autoComplete="off"
							enterKeyHint="done"
							maxLength={14}
							placeholder="000.000.000-00"
							aria-invalid={!!cpfError}
							aria-describedby={cpfHelpId}
							disabled={busy}
						/>
						{cpfError && <FieldError>{cpfError}</FieldError>}
					</Field>
				</div>
				<FieldDescription id={cpfHelpId}>O CPF é conferido no banco e não é guardado. {describeAttemptsLeft(attemptsLeft)}</FieldDescription>
			</FieldGroup>
			{feedback && <FeedbackAlert feedback={feedback} />}
			<Button type="submit" className="w-full sm:w-auto sm:self-start" disabled={busy}>
				{busy && <Loader2 className="animate-spin" aria-hidden />}
				Conferir e vincular
			</Button>
		</form>
	)
}

const JUSTIFICATION_MIN = 10
const JUSTIFICATION_MAX = 1000

function RequestLinkForm({ busy, feedback, onSubmit }: { busy: boolean; feedback: Feedback | null; onSubmit: (saram: string, justification: string) => void }) {
	const [saram, setSaram] = useState("")
	const [justification, setJustification] = useState("")
	const [touched, setTouched] = useState(false)
	const saramId = useId()
	const textId = useId()
	const helpId = useId()
	const length = justification.trim().length
	const saramError = touched && !/^\d{6,7}$/.test(saram) ? "O SARAM tem 6 ou 7 dígitos." : null
	const textError =
		touched && length < JUSTIFICATION_MIN ? `Conte em poucas palavras quem você é e por que pede (mínimo de ${JUSTIFICATION_MIN} caracteres).` : null

	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		setTouched(true)
		if (!/^\d{6,7}$/.test(saram) || length < JUSTIFICATION_MIN) return
		onSubmit(saram, justification.trim())
	}

	return (
		<form onSubmit={submit} noValidate className="flex flex-col gap-4">
			<FieldGroup>
				<Field data-invalid={!!saramError}>
					<FieldLabel htmlFor={saramId}>Seu SARAM</FieldLabel>
					<Input
						id={saramId}
						className="max-w-40"
						value={saram}
						onChange={(e) => setSaram(onlyDigits(e.target.value, 7))}
						inputMode="numeric"
						autoComplete="off"
						maxLength={7}
						placeholder="1234567"
						aria-invalid={!!saramError}
						disabled={busy}
					/>
					{saramError && <FieldError>{saramError}</FieldError>}
				</Field>
				<Field data-invalid={!!textError}>
					<FieldLabel htmlFor={textId}>Por que você pede este vínculo?</FieldLabel>
					<Textarea
						id={textId}
						value={justification}
						onChange={(e) => setJustification(e.target.value.slice(0, JUSTIFICATION_MAX))}
						placeholder={SARAM_REQUEST_EXAMPLE}
						rows={3}
						aria-invalid={!!textError}
						aria-describedby={helpId}
						disabled={busy}
					/>
					<FieldDescription id={helpId}>
						A administração lê isto para decidir: diga posto, nome de guerra, OM e o que mudou. {length}/{JUSTIFICATION_MAX}
					</FieldDescription>
					{textError && <FieldError>{textError}</FieldError>}
				</Field>
			</FieldGroup>
			{feedback && <FeedbackAlert feedback={feedback} />}
			<Button type="submit" className="w-full sm:w-auto sm:self-start" disabled={busy}>
				{busy && <Loader2 className="animate-spin" aria-hidden />}
				Enviar pedido
			</Button>
		</form>
	)
}

function PendingRequestCard({ status, busy, onWithdraw }: { status: SaramStatus; busy: boolean; onWithdraw: (requestId: string) => void }) {
	const [open, setOpen] = useState(false)
	const request = status.request
	if (!request) return null
	const isDispute = status.status === "contested"
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-subheading text-foreground">
					<span className="flex items-center gap-2">
						<Clock className="size-4 text-muted-foreground" aria-hidden />
						{isDispute ? "Sua contestação" : "Seu pedido"}
					</span>
				</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
					<div className="flex flex-col gap-0.5">
						<dt className="text-caption text-muted-foreground">SARAM pedido</dt>
						<dd className="text-body text-foreground tabular-nums">{request.saram}</dd>
					</div>
					<div className="flex flex-col gap-0.5">
						<dt className="text-caption text-muted-foreground">Enviado em</dt>
						<dd className="text-body text-foreground">{formatLocalDate(request.createdAt) || "—"}</dd>
					</div>
					<div className="flex flex-col gap-0.5">
						<dt className="text-caption text-muted-foreground">Quem decide</dt>
						<dd className="text-body text-foreground">Administração do sistema</dd>
					</div>
					<div className="col-span-2 flex flex-col gap-0.5 sm:col-span-3">
						<dt className="text-caption text-muted-foreground">O que você escreveu</dt>
						<dd className="max-w-prose whitespace-pre-line text-body text-foreground">{request.justification}</dd>
					</div>
				</dl>
				<Button variant="outline" className="w-full sm:w-auto sm:self-start" disabled={busy} onClick={() => setOpen(true)}>
					{busy && <Loader2 className="animate-spin" aria-hidden />}
					{isDispute ? "Desistir da contestação" : "Desistir do pedido"}
				</Button>
				<AlertDialog open={open} onOpenChange={setOpen}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>{isDispute ? "Desistir da contestação?" : "Desistir do pedido?"}</AlertDialogTitle>
							<AlertDialogDescription>
								A administração deixa de analisar o SARAM {request.saram}. Depois você pode verificar de outro jeito ou fazer um pedido novo.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Manter</AlertDialogCancel>
							<AlertDialogAction
								variant="destructive"
								onClick={() => {
									setOpen(false)
									onWithdraw(request.id)
								}}
							>
								Desistir
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</CardContent>
		</Card>
	)
}

function InstitutionalAlternative({ busy, onConfirm }: { busy: boolean; onConfirm: () => void }) {
	const [open, setOpen] = useState(false)
	return (
		<Item variant="outline" role="listitem">
			<ItemMedia variant="icon">
				<Building2 aria-hidden />
			</ItemMedia>
			<ItemContent>
				<ItemTitle>Esta é uma conta de seção ou OM</ItemTitle>
				<ItemDescription className="line-clamp-none">
					Conta usada por uma seção (a cozinha, a subsistência), não por uma pessoa. Ela não tem SARAM nem arranchamento.
				</ItemDescription>
			</ItemContent>
			<Button variant="outline" size="sm" className="w-full sm:w-auto" disabled={busy} onClick={() => setOpen(true)}>
				Marcar
			</Button>
			<AlertDialog open={open} onOpenChange={setOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Marcar como conta de seção?</AlertDialogTitle>
						<AlertDialogDescription>
							Esta conta deixa de ter SARAM e arranchamento próprio: os arranchamentos dela de hoje em diante são cancelados, e um pedido de vínculo em análise
							é encerrado. Módulos, permissões, senha e verificação em duas etapas continuam iguais. Dá para voltar a conta pessoal depois, mas o SARAM terá de
							ser verificado de novo.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancelar</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								setOpen(false)
								onConfirm()
							}}
						>
							Marcar como conta de seção
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Item>
	)
}

function InstitutionalAction({ busy, onSetPersonal }: { busy: boolean; onSetPersonal: () => void }) {
	const [open, setOpen] = useState(false)
	return (
		<div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
			<p className="max-w-prose text-body text-muted-foreground">Esta conta é de uma pessoa, e não de uma seção?</p>
			<Button variant="outline" className="w-full sm:w-auto" disabled={busy} onClick={() => setOpen(true)}>
				{busy && <Loader2 className="animate-spin" aria-hidden />}
				Na verdade, esta é uma conta pessoal
			</Button>
			<AlertDialog open={open} onOpenChange={setOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Marcar como conta pessoal?</AlertDialogTitle>
						<AlertDialogDescription>
							A conta volta a poder arranchar e passa a pedir o vínculo do SARAM de quem a usa. Arranchamentos cancelados antes não voltam sozinhos.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancelar</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								setOpen(false)
								onSetPersonal()
							}}
						>
							Marcar como pessoal
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}
