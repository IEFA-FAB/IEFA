import {
	Alert,
	AlertDescription,
	Button,
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@iefa/ui";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { Link, rootRouteId, useMatch, useRouter } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft, Home, RefreshCw } from "lucide-react";

export function DefaultCatchBoundary({ error }: ErrorComponentProps) {
	const router = useRouter();
	const isRoot = useMatch({
		strict: false,
		select: (state) => state.id === rootRouteId,
	});

	console.error("DefaultCatchBoundary Error:", error);

	const errorMessage =
		error instanceof Error ? error.message : "Um erro inesperado ocorreu";

	return (
		<div className="min-h-screen w-full flex items-center justify-center p-4">
			<Card className="w-full max-w-2xl border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl rounded-3xl overflow-hidden">
				<CardHeader className="text-center space-y-4 pb-4 pt-12">
					<div className="mx-auto w-20 h-20 rounded-full bg-linear-to-br from-red-500/20 to-red-500/10 flex items-center justify-center border border-red-500/20">
						<AlertCircle className="h-10 w-10 text-red-400" />
					</div>
					<CardTitle className="text-4xl font-bold tracking-tight">
						Ops! Algo deu errado
					</CardTitle>
					<CardDescription className="text-zinc-400 text-lg">
						Encontramos um erro inesperado. Por favor, tente novamente.
					</CardDescription>
				</CardHeader>

				<CardContent className="px-8 pb-4">
					<Alert
						variant="destructive"
						className="bg-red-500/10 border-red-500/20 text-red-400"
					>
						<AlertCircle className="h-4 w-4" />
						<AlertDescription className="ml-2">
							<strong className="font-semibold">Detalhes do erro:</strong>
							<br />
							<code className="text-sm mt-2 block bg-black/20 p-3 rounded-lg font-mono">
								{errorMessage}
							</code>
						</AlertDescription>
					</Alert>
				</CardContent>

				<CardFooter className="flex flex-col gap-3 px-8 pb-12 pt-4">
					<Button
						onClick={() => router.invalidate()}
						className="w-full rounded-full font-bold shadow-lg shadow-primary/20 hover:shadow-primary/40 h-12 text-base transition-all hover:-translate-y-0.5"
					>
						<RefreshCw className="mr-2 h-5 w-5" />
						Tentar Novamente
					</Button>

					<div className="grid grid-cols-2 gap-3 w-full">
						{!isRoot && (
							<Button
								onClick={() => window.history.back()}
								variant="outline"
								className="rounded-full font-bold h-12 text-base transition-all hover:-translate-y-0.5 border-white/10 bg-white/5 hover:bg-white/10"
							>
								<ArrowLeft className="mr-2 h-4 w-4" />
								Voltar
							</Button>
						)}
						<Link to="/" className={isRoot ? "col-span-2" : ""}>
							<Button
								variant="outline"
								className="w-full rounded-full font-bold h-12 text-base transition-all hover:-translate-y-0.5 border-white/10 bg-white/5 hover:bg-white/10"
							>
								<Home className="mr-2 h-4 w-4" />
								Ir para o Início
							</Button>
						</Link>
					</div>
				</CardFooter>
			</Card>
		</div>
	);
}
