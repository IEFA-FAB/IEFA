import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import AdminHero from "@/components/admin/AdminHero";
import IndicatorsCard from "@/components/admin/IndicatorsCard";
import QRAutoCheckinCard from "@/components/admin/QRAutoCheckinCard";
import { useAuth } from "@/hooks/useAuth";
import { useUserLevel } from "@/services/AdminService";

export const Route = createFileRoute("/_protected/admin")({
	component: AdminPanel,
	head: () => ({
		meta: [
			{ title: "Painel Admin" },
			{ name: "description", content: "Controle sua unidade" },
		],
	}),
});

function AdminPanel() {
	const { user } = useAuth();

	// Busca nível de usuário (data já vem null se não autorizado/erro)
	const { data: userLevel, isLoading, isError } = useUserLevel(user?.id);

	// Unidade selecionada no QR
	const [selectedOm, setSelectedOm] = useState<string>("");

	// Entrada com fade-in
	const [mounted, setMounted] = useState(false);
	useEffect(() => {
		const t = setTimeout(() => setMounted(true), 10);
		return () => clearTimeout(t);
	}, []);

	// Cálculo do status
	const isAuthorized = userLevel === "admin" || userLevel === "superadmin";

	if (isLoading) {
		// Loading discreto ou null enquanto verifica (evita flash)
		return <div className="min-h-screen" />;
	}

	if (!isAuthorized && !isLoading) {
		// Se terminou de carregar e não é autorizado (ou deu erro), redirect
		return <Navigate to="/forecast" replace />;
	}

	const error = isError ? "Não foi possível verificar suas permissões." : null;

	return (
		<div className="min-h-screen">
			{/* Hero */}
			<section
				id="hero"
				className={`container mx-auto max-w-screen-2xl px-4 pt-10 md:pt-14 transition-all duration-500 ${
					mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
				}`}
			>
				<AdminHero error={error} />
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
					<QRAutoCheckinCard
						selectedOm={selectedOm}
						onChangeSelectedOm={setSelectedOm}
						status="authorized"
					/>
				</div>
			</section>
		</div>
	);
}
