import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import AdminHero from "@/components/admin/AdminHero";
import IndicatorsCard from "@/components/admin/IndicatorsCard";
import QRAutoCheckinCard from "@/components/admin/QRAutoCheckinCard";
import { useAuth } from "@/hooks/useAuth";
import { adminProfileQueryOptions } from "@/services/AdminService";

export const Route = createFileRoute("/_protected/admin")({
	beforeLoad: async ({ context }) => {
		const userId = context.auth.user?.id;

		if (!userId) {
			// Should be handled by parent _protected, but safe guard
			throw redirect({ to: "/auth" });
		}

		const profile = await context.queryClient.ensureQueryData(
			adminProfileQueryOptions(userId),
		);

		const isAuthorized =
			profile?.role === "admin" || profile?.role === "superadmin";

		if (!isAuthorized) {
			throw redirect({ to: "/forecast" });
		}
	},
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

	// Suspense Query: dado estará disponível e tipado
	// beforeLoad já garantiu a existência e autorização
	useSuspenseQuery(adminProfileQueryOptions(user?.id ?? ""));

	// Unidade selecionada no QR
	const [selectedOm, setSelectedOm] = useState<string>("");

	// Entrada com fade-in
	const [mounted, setMounted] = useState(false);
	useEffect(() => {
		const t = setTimeout(() => setMounted(true), 10);
		return () => clearTimeout(t);
	}, []);

	if (!user) {
		return null;
	}

	return (
		<div className="min-h-screen">
			{/* Hero */}
			<section
				id="hero"
				className={`container mx-auto max-w-screen-2xl px-4 pt-10 md:pt-14 transition-all duration-500 ${
					mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
				}`}
			>
				<AdminHero error={null} />
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
