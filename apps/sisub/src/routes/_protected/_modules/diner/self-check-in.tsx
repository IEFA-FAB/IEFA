// routes/_protected/_modules/diner/self-check-in.tsx
// Handler do QR Code de self check-in do rancho.
// Fluxo: QR → confirmedCode preenchido → fase "confirm"
//        Acesso direto → fase "select" → usuário escolhe rancho → fase "confirm"

import { useQuery } from "@tanstack/react-query"
import { createFileRoute, redirect, useNavigate, useSearch } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
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
	const [selectorCode, setSelectorCode] = useState<string>("")
	// confirmedCode = null → fase "select"; string → fase "confirm"
	const [confirmedCode, setConfirmedCode] = useState<string | null>(qrCode)

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

	// ── Local state ───────────────────────────────────────────────────────────

	const [willEnter, setWillEnter] = useState<WillEnter>("sim")
	const [submitting, setSubmitting] = useState(false)
	const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null)

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
		setConfirmedCode(null)
	}, [messHallNotFound])

	// ── Handlers ──────────────────────────────────────────────────────────────

	const scheduleRedirect = (seconds = REDIRECT_DELAY) => {
		if (redirectedRef.current) return
		setRedirectCountdown(seconds)
		const id = setInterval(() => {
			setRedirectCountdown((s) => {
				const next = (s ?? 1) - 1
				if (next <= 0) {
					clearInterval(id)
					if (!redirectedRef.current) {
						redirectedRef.current = true
						navigate({ to: "/hub", replace: true })
					}
					return null
				}
				return next
			})
		}, 1000)
		countdownRef.current = id
	}

	const handleSubmit = async () => {
		"use no memo"
		if (submitting || !userId || !messHall) return
		setSubmitting(true)

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
			setSubmitting(false)
		}
	}

	if (!user) return null

	const isSelectPhase = !confirmedCode
	const isConfirmPhase = !isSelectPhase
	const blocked = submitting || redirectCountdown !== null

	// ── Render ────────────────────────────────────────────────────────────────

	return (
		<div className="w-full max-w-sm mx-auto p-6 space-y-6">
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
			/>

			{/* ── Fase 1: Seleção manual ── */}
			{isSelectPhase && (
				<div className="rounded-md border p-4 space-y-4">
					<p className="text-sm text-muted-foreground">O QR Code do rancho preenche automaticamente. Se não tiver o QR, selecione abaixo:</p>

					<MessHallSelector value={selectorCode} onChange={setSelectorCode} showLabel showValidation />

					<Button className="w-full" disabled={!selectorCode} onClick={() => setConfirmedCode(selectorCode)}>
						Continuar
					</Button>
				</div>
			)}

			{/* ── Fase 2: Confirmação de entrada ── */}
			{isConfirmPhase && (
				<>
					<div className="rounded-md border p-4 space-y-4">
						{/* Previsão (read-only, informativo) */}
						<div className="space-y-1">
							<div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Está na previsão?</div>
							<Badge variant={systemForecast ? "default" : "secondary"}>{systemForecast ? "Sim" : "Não"}</Badge>
						</div>

						{/* Vai entrar? (interativo) */}
						<div className="space-y-2">
							<div className="text-sm font-medium">Vai entrar?</div>
							<div className="flex gap-2">
								<Button variant={willEnter === "sim" ? "default" : "outline"} size="sm" onClick={() => setWillEnter("sim")} disabled={blocked}>
									Sim
								</Button>
								<Button variant={willEnter === "nao" ? "default" : "outline"} size="sm" onClick={() => setWillEnter("nao")} disabled={blocked}>
									Não
								</Button>
							</div>
						</div>
					</div>

					<div className="flex flex-col items-center gap-2">
						<div className="flex gap-3">
							<Button onClick={handleSubmit} disabled={!messHall || blocked}>
								{submitting ? "Enviando..." : "Confirmar presença"}
							</Button>
							<Button variant="outline" onClick={() => navigate({ to: "/diner/forecast" })} disabled={blocked}>
								Voltar
							</Button>
						</div>

						{redirectCountdown !== null && <p className="text-xs text-muted-foreground">Redirecionando em {redirectCountdown}s...</p>}
					</div>
				</>
			)}
		</div>
	)
}
