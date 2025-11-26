// ~/components/super-admin/SuperAdminPanelInner.tsx

import {
	Button,
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
	Label,
	Switch,
	Textarea,
} from "@iefa/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { RoleGuard } from "@/auth/RoleGuard";
import IndicatorsCard from "@/components/super-admin/IndicatorsCard";
import ProfilesManager from "@/components/super-admin/ProfilesManager";
import SuperAdminHero from "@/components/super-admin/SuperAdminHero";
import supabase from "@/utils/supabase";

export const Route = createFileRoute("/_protected/superAdmin")({
	component: SuperAdminPanelRoute,
	head: () => ({
		meta: [
			{ title: "Painel SuperAdmin" },
			{
				name: "description",
				content: "Controle o sistema de subsistência",
			},
		],
	}),
});

type EvalConfig = { active: boolean; value: string };

async function fetchEvalConfig(): Promise<EvalConfig> {
	const { data, error } = await supabase
		.from("super_admin_controller")
		.select("key, active, value")
		.eq("key", "evaluation")
		.maybeSingle();
	if (error) throw error;

	return {
		active: !!data?.active,
		value:
			typeof data?.value === "string"
				? data.value
				: data?.value == null
					? ""
					: String(data.value),
	}
}

async function upsertEvalConfig(cfg: EvalConfig): Promise<EvalConfig> {
	const { data, error } = await supabase
		.from("super_admin_controller")
		.upsert(
			{ key: "evaluation", active: cfg.active, value: cfg.value },
			{ onConflict: "key" },
		)
		.select("key, active, value")
		.maybeSingle();

	if (error) throw error;

	return {
		active: !!data?.active,
		value:
			typeof data?.value === "string"
				? data.value
				: data?.value == null
					? ""
					: String(data.value),
	}
}

function SuperAdminPanelInner() {
	// fade-in
	const [mounted, setMounted] = useState(false);
	useEffect(() => {
		const t = setTimeout(() => setMounted(true), 10);
		return () => clearTimeout(t);
	}, []);

	const queryClient = useQueryClient();

	// load config
	const evalQuery = useQuery({
		queryKey: ["super-admin", "evaluation-config"],
		queryFn: fetchEvalConfig,
		staleTime: 60_000,
	})

	// form state controlado localmente
	const [form, setForm] = useState<EvalConfig>({ active: false, value: "" });

	// sincroniza form com data carregada
	useEffect(() => {
		if (evalQuery.data && !evalQuery.isFetching) {
			setForm(evalQuery.data);
		}
	}, [evalQuery.data, evalQuery.isFetching]);

	const dirty = useMemo(() => {
		const d = evalQuery.data;
		if (!d) return false;
		return d.active !== form.active || d.value !== form.value;
	}, [evalQuery.data, form]);

	const invalid = useMemo(() => {
		if (evalQuery.isLoading) return true;
		if (form.active && !form.value.trim()) return true;
		return false;
	}, [evalQuery.isLoading, form]);

	const saveMutation = useMutation({
		mutationFn: upsertEvalConfig,
		onSuccess: (saved) => {
			queryClient.setQueryData(["super-admin", "evaluation-config"], saved);
		},
	})

	const loading = evalQuery.isLoading;
	const saving = saveMutation.isPending;
	const saveError = saveMutation.isError
		? ((saveMutation.error as any)?.message ?? "Não foi possível salvar.")
		: null;
	const saveOk = saveMutation.isSuccess
		? "Configuração salva com sucesso."
		: null;

	return (
		<div className="min-h-screen ">
			{/* Hero */}
			<section
				id="hero"
				className={`container mx-auto max-w-screen-2xl px-4 pt-10 md:pt-14 transition-all duration-500 ${
					mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
				}`}
			>
				<SuperAdminHero />
			</section>

			{/* Conteúdo */}
			<section
				id="content"
				className={`container mx-auto max-w-screen-2xl px-4 py-10 md:py-14 transition-all duration-500 delay-100 ${
					mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
				}`}
			>
				<div className="grid grid-cols-1 gap-6 lg:gap-8">
					<IndicatorsCard />
					<ProfilesManager />

					<Card className="border-2">
						<CardHeader>
							<CardTitle>Configuração da Pergunta de Avaliação</CardTitle>
							<CardDescription>
								Ligue/desligue a pergunta global de avaliação e defina o texto
								exibido aos usuários.
							</CardDescription>
						</CardHeader>

						<CardContent className="space-y-6">
							<div className="flex items-center justify-between gap-4">
								<div>
									<Label htmlFor="evaluation-active" className="text-base">
										Ativar pergunta
									</Label>
									<p className="text-sm text-muted-foreground">
										Quando ativo, usuários que ainda não responderam verão a
										pergunta.
									</p>
								</div>
								<Switch
									id="evaluation-active"
									className="cursor-pointer"
									checked={form.active}
									onCheckedChange={(v: boolean) =>
										setForm((p) => ({ ...p, active: v }))
									}
									disabled={loading || saving}
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="evaluation-question">Texto da pergunta</Label>
								<Textarea
									id="evaluation-question"
									placeholder="Ex.: Como você avalia sua experiência no Rancho?"
									value={form.value}
									onChange={(e) =>
										setForm((p) => ({ ...p, value: e.target.value }))
									}
									disabled={loading || saving}
									rows={3}
									maxLength={240}
									className="resize-y"
								/>
								<div className="flex justify-end text-xs text-muted-foreground">
									{form.value.length}/240
								</div>
							</div>

							{loading && (
								<p className="text-sm text-muted-foreground">
									Carregando configuração...
								</p>
							)}
							{saveError && <p className="text-sm ">{saveError}</p>}
							{saveOk && <p className="text-sm ">{saveOk}</p>}
						</CardContent>

						<CardFooter className="flex items-center justify-end gap-2">
							<Button
								type="button"
								variant="ghost"
								onClick={() => evalQuery.data && setForm(evalQuery.data)}
								disabled={!dirty || saving || loading}
							>
								Reverter
							</Button>
							<Button
								type="button"
								onClick={() => saveMutation.mutate(form)}
								disabled={!dirty || invalid || saving}
							>
								{saving ? (
									<span className="inline-flex items-center gap-2">
										<span className="h-4 w-4 animate-spin rounded-full border-2 border-b-transparent" />
										Salvando...
									</span>
								) : (
									"Salvar alterações"
								)}
							</Button>
						</CardFooter>
					</Card>
				</div>
			</section>
		</div>
	)
}

function SuperAdminPanelRoute() {
	return (
		<RoleGuard requireAny={["superadmin"]} redirectTo="/forecast">
			<SuperAdminPanelInner />
		</RoleGuard>
	)
}
