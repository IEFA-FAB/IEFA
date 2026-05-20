// routes/_protected/_modules/diner/self-check-in.tsx
// Handler do QR Code de self check-in do rancho.
// Fluxo: QR → confirmedCode preenchido → fase "confirm"
//        Acesso direto → fase "select" → usuário escolhe rancho → fase "confirm"

import { useQuery } from "@tanstack/react-query"
import { createFileRoute, redirect, useNavigate, useSearch } from "@tanstack/react-router"
import { useEffect, useReducer, useRef } from "react"
import { toast } from "sonner"
import { z } from "zod"
import { MessHallSelector } from "@/components/features/diner/MessHallSelector"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/auth/useAuth"
import { inferDefaultMeal, MEAL_LABEL } from "@/lib/fiscal"
import { insertPresenceFn } from "@/server/presence.fn"
import { messHallByCodeQueryOptions, userMealForecastQueryOptions } from "@/services/SelfCheckInService"
import type { WillEnter } from "@/types/domain/presence"

// ─── Schema ──────────────────────────────────────────────────────────────────

const selfCheckinSearchSchema = z.object({
	unit: z.string().optional(),
	u: z.string().optional(),
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayISO(): string {
	return new Date().toISOString().split("T")[0]
}

function todayDisplay(): string {
	return new Date().toLocaleDateString("pt-BR")
}

function isDuplicateOrConflict(err: unknown): boolean {
	if (!err || typeof err !== "object") return false
	const e = err as { code?: string | number; status?: number; message?: string }
	const msg = String(e.message || "").toLowerCase()
	return e.code === "23505" || e.code === 23505 || e.code === "409" || e.status === 409 || msg.includes("duplicate key") || msg.includes("conflict")
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

type SelfCheckinState = {
	selectorCode: string
	confirmedCode: string | null
	willEnter: WillEnter
	submitting: boolean
	redirectCountdown: number | null
}

type SelfCheckinAction =
	| { type: "SET_SELECTOR_CODE"; value: string }
	| { type: "SET_CONFIRMED_CODE"; value: string | null }
	| { type: "SET_WILL_ENTER"; value: WillEnter }
	| { type: "SET_SUBMITTING"; value: boolean }
	| { type: "SET_REDIRECT_COUNTDOWN"; value: number | null }

function selfCheckinReducer(state: SelfCheckinState, action: SelfCheckinAction): SelfCheckinState {
	switch (action.type) {
		case "SET_SELECTOR_CODE":
			return { ...state, selectorCode: action.value }
		case "SET_CONFIRMED_CODE":
			return { ...state, confirmedCode: action.value }
		case "SET_WILL_ENTER":
			return { ...state, willEnter: action.value }
		case "SET_SUBMITTING":
			return { ...state, submitting: action.value }
		case "SET_REDIRECT_COUNTDOWN":
			return { ...state, redirectCountdown: action.value }
		default:
			return state
	}
}

// ─── Route ───────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_protected/_modules/diner/self-check-in")({
	validateSearch: selfCheckinSearchSchema,
	beforeLoad: async ({ context, search, location }) => {
		const { user } = context.auth

		if (!user?.id) {
			throw redirect({ to: "/auth", search: { redirect: location.href } })
		}

		// Só prefetch se veio com código (via QR). Sem código, usuário selecionará manualmente.
		const unitParam = search.unit ?? search.u
		if (!unitParam) return

		const messHall = await context.queryClient.ensureQueryData(messHallByCodeQueryOptions(unitParam))

		if (messHall) {
			await context.queryClient.ensureQueryData(userMealForecastQueryOptions(user.id, todayISO(), inferDefaultMeal(), messHall.id))
		}
	},
	component: SelfCheckin,
})

// ─── Component ───────────────────────────────────────────────────────────────

const REDIRECT_DELAY = 3

function SelfCheckin() {
	"use no memo"

	const search = useSearch({ from: "/_protected/_modules/diner/self-check-in" })
	const navigate = useNavigate()
	const { user } = useAuth()

	const userId = user?.id ?? ""
	const date = todayISO()
	const meal = inferDefaultMeal()

	// Código do rancho: vem do QR (URL) ou da seleção manual
	const qrCode = search.unit ?? search.u ?? null
	const [checkinState, dispatch] = useReducer(selfCheckinReducer, {
		selectorCode: "",
		confirmedCode: qrCode,
		willEnter: "sim",
		submitting: false,
		redirectCountdown: null,
	})
	const { selectorCode, confirmedCode, willEnter, submitting, redirectCountdown } = checkinState

	// ── Queries ──────────────────────────────────────────────────────────────

	const { data: messHall, isLoading: messHallLoading } = useQuery({
		...messHallByCodeQueryOptions(confirmedCode ?? ""),
		enabled: !!confirmedCode,
	})

	const { data: forecast } = useQuery({
		...userMealForecastQueryOptions(userId, date, meal, messHall?.id ?? null),
		enabled: !!messHall?.id,
	})

	// ── Derived state ─────────────────────────────────────────────────────────

	const systemForecast = !!forecast?.will_eat
	// messHall=null (não undefined) significa que a query resolveu e não encontrou
	const messHallNotFound = !!confirmedCode && !messHallLoading && messHall === null

	const redirectedRef = useRef(false)
	const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

	useEffect(
		() => () => {
			if (countdownRef.current) clearInterval(countdownRef.current)
		},
		[]
	)

	// Se QR inválido → volta pra seleção manual com toast
	useEffect(() => {
		if (!messHallNotFound) return
		toast.error("QR inválido", { description: "Rancho não encontrado. Selecione manualmente." })
		dispatch({ type: "SET_CONFIRMED_CODE", value: null })
	}, [messHallNotFound])

	// ── Handlers ──────────────────────────────────────────────────────────────

	const countdownValueRef = useRef<number | null>(null)

	const scheduleRedirect = (seconds = REDIRECT_DELAY) => {
		if (redirectedRef.current) return
		countdownValueRef.current = seconds
		dispatch({ type: "SET_REDIRECT_COUNTDOWN", value: seconds })
		const id = setInterval(() => {
			const current = countdownValueRef.current ?? 1
			const next = current - 1
			countdownValueRef.current = next
			if (next <= 0) {
				clearInterval(id)
				dispatch({ type: "SET_REDIRECT_COUNTDOWN", value: null })
				if (!redirectedRef.current) {
					redirectedRef.current = true
					navigate({ to: "/hub", replace: true })
				}
			} else {
				dispatch({ type: "SET_REDIRECT_COUNTDOWN", value: next })
			}
		}, 1000)
		countdownRef.current = id
	}

	const handleSubmit = async () => {
		"use no memo"
		if (submitting || !userId || !messHall) return
		dispatch({ type: "SET_SUBMITTING", value: true })

		try {
			if (willEnter !== "sim") {
				toast.info("Decisão registrada", { description: "Você optou por não entrar para a refeição." })
				scheduleRedirect()
				return
			}

			await insertPresenceFn({ data: { user_id: userId, date, meal, messHallId: messHall.id } })

			toast.success("Presença registrada", { description: `Bom apetite! Redirecionando em ${REDIRECT_DELAY}s...` })
			scheduleRedirect()
		} catch (err) {
			if (isDuplicateOrConflict(err)) {
				toast.info("Já registrado", { description: `Presença já registrada para esta refeição. Redirecionando em ${REDIRECT_DELAY}s...` })
				scheduleRedirect()
				return
			}
			toast.error("Erro", { description: "Não foi possível registrar sua presença." })
		} finally {
			dispatch({ type: "SET_SUBMITTING", value: false })
		}
	}

	if (!user) return null

	const isSelectPhase = !confirmedCode
	const isConfirmPhase = !isSelectPhase
	const blocked = submitting || redirectCountdown !== null

	// ── Render ────────────────────────────────────────────────────────────────

	return (
		<div className="w-full max-w-2xl mx-auto px-6 py-8 space-y-8">
			<PageHeader
				title="Check-in de Refeição"
				description={
					isSelectPhase
						? "Selecione o rancho ou escaneie o QR Code"
						: messHallLoading
							? "Carregando..."
							: messHall
								? `${messHall.display_name} • ${MEAL_LABEL[meal]} • ${todayDisplay()}`
								: "Rancho não encontrado"
				}
				suppressDescriptionHydrationWarning
			/>

			{/* ── Fase 1: Seleção manual ── */}
			{isSelectPhase && (
				<div className="space-y-6">
					<p className="text-sm text-muted-foreground">O QR Code do rancho preenche automaticamente. Se não tiver o QR, selecione abaixo:</p>

					<MessHallSelector value={selectorCode} onChange={(v) => dispatch({ type: "SET_SELECTOR_CODE", value: v })} showLabel showValidation />

					<Button className="w-full" disabled={!selectorCode} onClick={() => dispatch({ type: "SET_CONFIRMED_CODE", value: selectorCode })}>
						Continuar
					</Button>
				</div>
			)}

			{/* ── Fase 2: Confirmação de entrada ── */}
			{isConfirmPhase && (
				<div className="space-y-6">
					{/* Previsão (read-only, informativo) */}
					<div className="flex items-center justify-between py-3 border-b border-border/60">
						<span className="text-sm text-muted-foreground">Previsão do sistema</span>
						<Badge variant={systemForecast ? "default" : "secondary"}>{systemForecast ? "Sim" : "Não"}</Badge>
					</div>

					{/* Vai entrar? (interativo) */}
					<div className="space-y-3">
						<p className="text-subheading text-foreground">Vai entrar na refeição?</p>
						<div className="flex gap-2">
							<Button
								variant={willEnter === "sim" ? "default" : "outline"}
								size="sm"
								onClick={() => dispatch({ type: "SET_WILL_ENTER", value: "sim" })}
								disabled={blocked}
							>
								Sim
							</Button>
							<Button
								variant={willEnter === "nao" ? "default" : "outline"}
								size="sm"
								onClick={() => dispatch({ type: "SET_WILL_ENTER", value: "nao" })}
								disabled={blocked}
							>
								Não
							</Button>
						</div>
					</div>

					{/* Ações */}
					<div className="flex items-center gap-3 pt-2">
						<Button className="flex-1" onClick={handleSubmit} disabled={!messHall || blocked}>
							{submitting ? "Enviando..." : "Confirmar presença"}
						</Button>
						<Button variant="outline" onClick={() => navigate({ to: "/diner/forecast" })} disabled={blocked}>
							Voltar
						</Button>
					</div>

					{redirectCountdown !== null && <p className="text-xs text-muted-foreground text-center">Redirecionando em {redirectCountdown}s...</p>}
				</div>
			)}
		</div>
	)
}
