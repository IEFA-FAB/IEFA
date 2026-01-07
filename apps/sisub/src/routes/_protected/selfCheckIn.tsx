// routes/protected/presence/selfCheckin.tsx

import { Button } from "@iefa/ui";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	redirect,
	useNavigate,
	useSearch,
} from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { useAuth } from "@/hooks/auth/useAuth";
import {
	messHallByCodeQueryOptions,
	userMealForecastQueryOptions,
} from "@/services/SelfCheckInService";
import type { WillEnter } from "@/types/domain";
import { inferDefaultMeal } from "@/lib/fiscal";
import supabase from "@/lib/supabase";

// Schema for search params validation
const selfCheckInSearchSchema = z.object({
	unit: z.string().optional(),
	u: z.string().optional(),
});

function todayISO(): string {
	return new Date().toISOString().split("T")[0];
}

export const Route = createFileRoute("/_protected/selfCheckIn")({
	validateSearch: selfCheckInSearchSchema,
	beforeLoad: async ({ context, search, location }) => {
		const { user } = context.auth;

		if (!user?.id) {
			throw redirect({
				to: "/auth",
				search: {
					redirect: location.href,
				},
			});
		}

		const unitParam = search.unit ?? search.u;
		const unidade = unitParam ?? "DIRAD - DIRAD";

		// Prefetch Mess Hall
		const messHall = await context.queryClient.ensureQueryData(
			messHallByCodeQueryOptions(unidade),
		);

		if (messHall) {
			const date = todayISO();
			const meal = inferDefaultMeal();
			// Prefetch Forecast
			await context.queryClient.ensureQueryData(
				userMealForecastQueryOptions(user.id, date, meal, messHall.id),
			);
		}
	},
	component: SelfCheckin,
});

const REDIRECT_DELAY_SECONDS = 3;

function isDuplicateOrConflict(err: unknown): boolean {
	const e = err as any;
	const code = e?.code;
	const status = e?.status;
	const msg = String(e?.message || "").toLowerCase();

	return (
		code === "23505" ||
		code === 23505 ||
		code === "409" ||
		status === 409 ||
		msg.includes("duplicate key") ||
		msg.includes("conflict")
	);
}

function SelfCheckin() {
	const search = useSearch({ from: "/_protected/selfCheckIn" });
	const navigate = useNavigate();
	const { user } = useAuth();

	// Ensure user exists (handled by beforeLoad mostly, but for type safety)
	const userId = user?.id ?? "";

	// Params and defaults
	const unitParam = search.unit ?? search.u;
	const unidade = unitParam ?? "DIRAD - DIRAD";
	const date = todayISO();
	const meal = inferDefaultMeal();

	// Suspense Queries
	const { data: messHall } = useSuspenseQuery(
		messHallByCodeQueryOptions(unidade),
	);

	const { data: forecast } = useSuspenseQuery(
		userMealForecastQueryOptions(userId, date, meal, messHall?.id ?? null),
	);

	// Derived State
	const systemForecast = !!forecast?.will_eat;

	// Local State
	const [willEnter, setWillEnter] = useState<WillEnter>("sim");
	const [submitting, setSubmitting] = useState(false);

	// Countdown State
	const [redirectCountdown, setRedirectCountdown] = useState<number | null>(
		null,
	);
	const redirectedRef = useRef(false);
	const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
		null,
	);

	// Effects for cleanup
	useEffect(() => {
		return () => {
			if (countdownIntervalRef.current) {
				clearInterval(countdownIntervalRef.current);
			}
		};
	}, []);

	// If messHall not found, we might want to show error or just let it be.
	// Provide feedback if messHall is missing but code was provided.
	useEffect(() => {
		if (!messHall) {
			toast.error("QR inválido", {
				description: "A unidade informada não foi encontrada.",
			});
		}
	}, [messHall]);

	const scheduleRedirect = (seconds = REDIRECT_DELAY_SECONDS) => {
		if (redirectedRef.current) return;

		setRedirectCountdown(seconds);
		countdownIntervalRef.current = setInterval(() => {
			setRedirectCountdown((s) => {
				const next = (s ?? 1) - 1;
				if (next <= 0) {
					if (countdownIntervalRef.current) {
						clearInterval(countdownIntervalRef.current);
					}
					if (!redirectedRef.current) {
						redirectedRef.current = true;
						navigate({ to: "/forecast", replace: true });
					}
					return null;
				}
				return next;
			});
		}, 1000);
	};

	const handleSubmit = async () => {
		if (submitting || !userId) return;
		if (!messHall) {
			toast.error("Rancho inválido");
			return;
		}

		setSubmitting(true);

		try {
			if (willEnter !== "sim") {
				toast.info("Decisão registrada", {
					description: "Você optou por não entrar para a refeição.",
				});
				return;
			}

			const { error } = await supabase
				.schema("sisub")
				.from("meal_presences")
				.insert({
					user_id: userId,
					date,
					meal,
					mess_hall_id: messHall.id,
				});

			if (!error) {
				toast.success("Presença registrada", {
					description: `Bom apetite! Redirecionando em ${REDIRECT_DELAY_SECONDS}s...`,
				});
				scheduleRedirect(REDIRECT_DELAY_SECONDS);
				return;
			}

			if (isDuplicateOrConflict(error)) {
				toast.info("Já registrado", {
					description: `Sua presença já está registrada para esta refeição. Redirecionando em ${REDIRECT_DELAY_SECONDS}s...`,
				});
				scheduleRedirect(REDIRECT_DELAY_SECONDS);
				return;
			}

			console.error("Erro ao registrar presença:", error);
			toast.error("Erro", {
				description: "Não foi possível registrar sua presença.",
			});
		} catch (err) {
			console.error("Falha inesperada no envio:", err);
			toast.error("Erro", {
				description: "Falha inesperada ao enviar a presença.",
			});
		} finally {
			setSubmitting(false);
		}
	};

	const goHome = () => {
		if (redirectCountdown !== null) return;
		navigate({ to: "/forecast" });
	};

	if (!user) return null; // Should be handled by router but strict null check

	return (
		<div className="w-full mx-auto p-6 text-center space-y-6">
			<h1 className="text-xl font-semibold">Check-in de Refeição</h1>

			<p className="text-sm text-muted-foreground">
				Unidade: <b>{unidade}</b> • Data: <b>{date}</b> • Refeição:{" "}
				<b>{meal}</b>
			</p>

			<div className="rounded-md border p-4 text-left space-y-4">
				{/* Está na previsão? */}
				<div className="space-y-2">
					<div className="text-sm font-medium">Está na previsão?</div>
					<div className="flex gap-2">
						<Button
							disabled
							variant={systemForecast ? "default" : "outline"}
							size="sm"
						>
							Sim
						</Button>
						<Button
							disabled
							variant={!systemForecast ? "default" : "outline"}
							size="sm"
						>
							Não
						</Button>
					</div>
					<div className="text-xs text-muted-foreground mt-1">
						UUID: {userId}
					</div>
				</div>

				{/* Vai entrar? */}
				<div className="space-y-2">
					<div className="text-sm font-medium">Vai entrar?</div>
					<div className="flex gap-2">
						<Button
							variant={willEnter === "sim" ? "default" : "outline"}
							size="sm"
							onClick={() => setWillEnter("sim")}
							disabled={submitting || redirectCountdown !== null}
						>
							Sim
						</Button>
						<Button
							variant={willEnter === "nao" ? "default" : "outline"}
							size="sm"
							onClick={() => setWillEnter("nao")}
							disabled={submitting || redirectCountdown !== null}
						>
							Não
						</Button>
					</div>
				</div>
			</div>

			<div className="flex flex-col items-center justify-center gap-2">
				<div className="flex items-center justify-center gap-3">
					<Button
						onClick={handleSubmit}
						disabled={!messHall || submitting || redirectCountdown !== null}
					>
						{submitting ? "Enviando..." : "Enviar"}
					</Button>
					<Button
						variant="outline"
						onClick={goHome}
						disabled={submitting || redirectCountdown !== null}
					>
						Voltar
					</Button>
				</div>

				{redirectCountdown !== null && (
					<div className="text-xs text-muted-foreground">
						Redirecionando para o rancho em {redirectCountdown}s...
					</div>
				)}
			</div>
		</div>
	);
}
