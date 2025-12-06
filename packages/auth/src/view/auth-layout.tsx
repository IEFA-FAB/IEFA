// packages/auth/src/auth-layout.tsx
import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { type AuthConfig, resolveAuthConfig } from "../config";
import { useAuth } from "../model/auth-provider";
import { preserveRedirectFromQuery, resolveTarget } from "../model/redirect";

type Props = {
	variant?: "full" | "strip";
	config?: AuthConfig; // para textos/brand/defaultRedirect/keys/etc
	LoaderIcon?: React.ComponentType<{ className?: string }>;
	// Você pode passar seus próprios wrappers/slots se quiser
};

export function AuthLayout({ variant = "full", config, LoaderIcon }: Props) {
	const cfg = resolveAuthConfig(config);
	const { user, isLoading } = useAuth();
	const location = useLocation();

	// Preserva redirectTo
	useEffect(() => {
		preserveRedirectFromQuery(location.search, cfg.storageKeys.redirect);
	}, [location.search, cfg.storageKeys.redirect]);

	const { target, stored } = resolveTarget(
		location.search,
		location.state,
		cfg.defaultRedirect,
		cfg.storageKeys.redirect,
	);

	const isResetPasswordRoute = location.pathname.startsWith(
		"/auth/reset-password",
	);

	// Loading (evita flicker) - só renderiza na variação "full"
	if (isLoading && variant === "full") {
		return (
			<div className="h-full w-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
				<div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
					{cfg.brand.logoUrl ? (
						<img
							src={cfg.brand.logoUrl}
							alt={cfg.brand.title}
							className="mx-auto h-16"
						/>
					) : (
						<h1 className="text-7xl md:text-8xl text-blue-600 font-black">
							{cfg.brand.title}
						</h1>
					)}
					{cfg.brand.subtitle && (
						<p className="text-gray-600">{cfg.brand.subtitle}</p>
					)}
				</div>
				<div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
					<div className="w-full flex items-center justify-center py-12 bg-white rounded-md shadow-sm">
						{LoaderIcon ? (
							<LoaderIcon className="h-6 w-6 animate-spin text-gray-500" />
						) : null}
						<span className="ml-2 text-sm text-gray-600">
							{cfg.ui.checkingAuth}
						</span>
					</div>
				</div>
			</div>
		);
	}

	// Se logado e não estiver na rota de reset, manda pro destino
	if (user && !isResetPasswordRoute) {
		if (stored) sessionStorage.removeItem(cfg.storageKeys.redirect);
		return <Navigate to={target} replace />;
	}

	if (variant === "strip") {
		return <Outlet />;
	}

	// Páginas de auth com UI (login/register/reset)
	return (
		<div className="h-full flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-gray-50">
			<div className="sm:mx-auto sm:w-full sm:max-w-md">
				<div className="text-center">
					{cfg.brand.logoUrl ? (
						<img
							src={cfg.brand.logoUrl}
							alt={cfg.brand.title}
							className="mx-auto h-16"
						/>
					) : (
						<h1 className="text-7xl md:text-8xl font-black text-blue-600">
							{cfg.brand.title}
						</h1>
					)}
					{cfg.brand.subtitle && (
						<p className="text-gray-600">{cfg.brand.subtitle}</p>
					)}
				</div>
			</div>
			<div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
				<Outlet />
			</div>
		</div>
	);
}
