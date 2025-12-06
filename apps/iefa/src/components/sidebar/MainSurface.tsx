import { Button, cn } from "@iefa/ui";
import type { ReactNode } from "react";

export type MainSurfaceProps = {
	showInitialError: boolean;
	showInitialLoading: boolean;
	onRetry: () => void;
	children: ReactNode;
};

export function MainSurface({
	showInitialError,
	showInitialLoading,
	onRetry,
	children,
}: MainSurfaceProps) {
	return (
		<div
			className={cn(
				" relative isolate flex flex-col bg-background text-foreground ",
				"min-h-svh supports-[height:100dvh]:min-h-dvh",

				"before:content-[''] before:absolute before:inset-0 before:-z-10 before:pointer-events-none",
				"before:bg-[radial-gradient(1200px_800px_at_10%_-10%,rgb(52_211_153/0.14),transparent_60%),radial-gradient(900px_600px_at_90%_0%,rgb(6_182_212/0.12),transparent_60%),radial-gradient(800px_800px_at_50%_100%,rgb(139_92_246/0.10),transparent_60%)]",
				"dark:before:bg-[radial-gradient(1200px_800px_at_10%_-10%,rgb(110_231_183/0.18),transparent_60%),radial-gradient(900px_600px_at_90%_0%,rgb(34_211_238/0.16),transparent_60%),radial-gradient(800px_800px_at_50%_100%,rgb(167_139_250/0.14),transparent_60%)]",

				"before:transform-gpu motion-safe:before:animate-[slow-pan_32s_ease-in-out_infinite]",

				"after:content-[''] after:pointer-events-none after:absolute after:inset-0 after:-z-10",
				"after:bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.8)_1px,transparent_1px)]",
				"after:bg-size-[12px_12px] after:opacity-[0.02]",
				"dark:after:opacity-[0.04]",
			)}
		>
			{showInitialError ? (
				<div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
					<p className="text-sm font-medium text-destructive">
						Não foi possível carregar suas permissões no momento.
					</p>
					<p className="text-xs text-muted-foreground">
						Atualize a página ou entre em contato com um administrador.
					</p>
					<Button size="sm" variant="outline" onClick={onRetry}>
						Tentar novamente
					</Button>
				</div>
			) : showInitialLoading ? (
				<div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
					Carregando painel...
				</div>
			) : (
				children
			)}
		</div>
	);
}
