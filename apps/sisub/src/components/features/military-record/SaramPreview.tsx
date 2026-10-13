/**
 * Pré-visualização SÓ DE DESENVOLVIMENTO da tela "Meu cadastro militar" (`?preview=<estado>`).
 *
 * Os estados que dependem de e-mail @fab.mil.br e do cadastro de pessoal (sugestão, homônimos,
 * bloqueio…) não se reproduzem com conta de teste sem gravar dado militar de gente real. Aqui a
 * tela recebe cada `SaramStatus` fictício e uma API falsa que simula os desfechos — nada vai ao
 * servidor. Os nomes são inventados.
 *
 * Só é importado atrás de `import.meta.env.DEV` (rota `diner/military-record`): o Vite troca a
 * condição por `false` no build de produção e o `import()` some do bundle junto com este arquivo.
 */

import type { SaramLinkOutcome, SaramStatus } from "@iefa/database/saram-link"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { SaramLinkApi } from "@/hooks/business/useUserSaram"
import { MilitaryRecordNoticeView } from "./MilitaryRecordNotice"
import { MilitaryRecordPanel } from "./MilitaryRecordPanel"

const BASE: SaramStatus = {
	status: "no_match",
	accountKind: "pessoal",
	saram: null,
	verifiedBy: null,
	verifiedAt: null,
	visible: false,
	identity: null,
	hasUnverifiedSaram: false,
	request: null,
	candidates: [],
	requiresCpfSuffix: false,
	emailEligibility: "eligible",
	lockedUntil: null,
	attemptsLeft: 5,
	actions: [],
}

const inOneHour = () => new Date(Date.now() + 47 * 60_000).toISOString()

export const SARAM_PREVIEW_STATES: Record<string, () => SaramStatus> = {
	suggestion: () => ({
		...BASE,
		status: "suggestion",
		candidates: [{ ref: 101, posto: "3S", nomeGuerra: "FICTICIO", sgOrg: "1º GAP", heldByOther: false, holderVerified: false }],
		actions: ["confirm_candidate", "verify_cpf", "request_link", "set_institutional"],
	}),
	homonyms: () => ({
		...BASE,
		status: "homonyms",
		requiresCpfSuffix: true,
		attemptsLeft: 3,
		candidates: [
			{ ref: 201, posto: "2S", nomeGuerra: "EXEMPLO", sgOrg: "GAP-SJ", heldByOther: false, holderVerified: false },
			{ ref: 202, posto: "CAP", nomeGuerra: "EXEMPLO", sgOrg: "DIRAD", heldByOther: true, holderVerified: true },
		],
		actions: ["confirm_candidate", "verify_cpf", "request_link", "set_institutional"],
	}),
	no_match: () => ({ ...BASE, status: "no_match", emailEligibility: "eligible", actions: ["verify_cpf", "request_link", "set_institutional"] }),
	no_match_domain: () => ({ ...BASE, status: "no_match", emailEligibility: "domain", actions: ["verify_cpf", "request_link", "set_institutional"] }),
	locked_out: () => ({ ...BASE, status: "locked_out", attemptsLeft: 0, lockedUntil: inOneHour(), actions: ["request_link", "set_institutional"] }),
	pending_request: () => ({
		...BASE,
		status: "pending_request",
		request: {
			id: "00000000-0000-4000-8000-000000000001",
			kind: "link",
			saram: "0000001",
			justification: "Sou o 3S Fictício, do 1º GAP. Mudei o nome de guerra e o e-mail ficou com o antigo.",
			createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
			claimVerifiedBy: null,
		},
		actions: ["withdraw_request"],
	}),
	contested: () => ({
		...BASE,
		status: "contested",
		request: {
			id: "00000000-0000-4000-8000-000000000002",
			kind: "dispute",
			saram: "0000002",
			justification: "Este SARAM é meu; a outra conta foi criada por engano na seção.",
			createdAt: new Date(Date.now() - 3_600_000).toISOString(),
			claimVerifiedBy: "cpf",
		},
		actions: ["withdraw_request"],
	}),
	verified: () => ({
		...BASE,
		status: "verified",
		saram: "0000003",
		verifiedBy: "email",
		verifiedAt: new Date(Date.now() - 30 * 86_400_000).toISOString(),
		visible: true,
		identity: { posto: "3S", nomeGuerra: "FICTICIO", sgOrg: "1º GAP" },
	}),
	legacy: () => ({
		...BASE,
		status: "legacy",
		saram: "0000004",
		verifiedBy: "legacy",
		visible: true,
		identity: { posto: "1T", nomeGuerra: "MODELO", sgOrg: "IEFA" },
		actions: ["verify_cpf"],
	}),
	institutional: () => ({ ...BASE, status: "institutional", accountKind: "institucional", actions: ["set_personal"] }),
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 400))

/** Desfechos simulados: "1234" confere o sufixo; qualquer CPF falha (para ver tentativas e bloqueio). */
function makePreviewApi(get: () => SaramStatus, set: (s: SaramStatus) => void): SaramLinkApi {
	const out = (outcome: SaramLinkOutcome["outcome"], status: SaramStatus, extra: Partial<SaramLinkOutcome> = {}): SaramLinkOutcome => {
		set(status)
		return { outcome, attemptsLeft: null, lockedUntil: null, requestId: null, upgraded: false, effects: null, status, ...extra }
	}
	const fail = (current: SaramStatus) => {
		const attemptsLeft = Math.max(0, current.attemptsLeft - 1)
		if (attemptsLeft === 0) {
			const locked = { ...SARAM_PREVIEW_STATES.locked_out() }
			return out("mismatch", locked, { attemptsLeft: 0, lockedUntil: locked.lockedUntil })
		}
		return out("mismatch", { ...current, attemptsLeft }, { attemptsLeft })
	}
	return {
		async confirmCandidate({ cpfSuffix }) {
			await pause()
			const current = get()
			if (current.requiresCpfSuffix && cpfSuffix !== "1234") return fail(current)
			return out("linked", SARAM_PREVIEW_STATES.verified())
		},
		async verifyByCpf() {
			await pause()
			return fail(get())
		},
		async requestLink({ saram, justification }) {
			await pause()
			const pending = SARAM_PREVIEW_STATES.pending_request()
			return out("requested", { ...pending, request: pending.request && { ...pending.request, saram, justification, createdAt: new Date().toISOString() } })
		},
		async withdrawRequest() {
			await pause()
			return out("withdrawn", SARAM_PREVIEW_STATES.no_match())
		},
		async setAccountKind({ kind }) {
			await pause()
			return kind === "institucional"
				? out("changed", SARAM_PREVIEW_STATES.institutional(), {
						effects: { previousSaram: null, withdrawnRequests: 0, cancelledArranchamentos: 3 },
					})
				: out("changed", SARAM_PREVIEW_STATES.no_match())
		},
		async refresh() {},
	}
}

export default function SaramPreview({ initial }: { initial: string }) {
	const [name, setName] = useState(initial in SARAM_PREVIEW_STATES ? initial : "suggestion")
	const [status, setStatus] = useState<SaramStatus>(() => (SARAM_PREVIEW_STATES[name] ?? SARAM_PREVIEW_STATES.suggestion)())
	const ref = { current: status }
	const api = makePreviewApi(
		() => ref.current,
		(next) => {
			ref.current = next
			setStatus(next)
		}
	)

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-wrap items-center gap-2" data-preview-toolbar>
				<Badge variant="warning">Pré-visualização (só em desenvolvimento)</Badge>
				{Object.keys(SARAM_PREVIEW_STATES).map((key) => (
					<Button
						key={key}
						size="xs"
						variant={key === name ? "default" : "outline"}
						onClick={() => {
							setName(key)
							setStatus(SARAM_PREVIEW_STATES[key]())
						}}
					>
						{key}
					</Button>
				))}
			</div>
			<MilitaryRecordNoticeView status={status} onDismiss={() => {}} />
			<MilitaryRecordPanel key={name} status={status} api={api} />
		</div>
	)
}
