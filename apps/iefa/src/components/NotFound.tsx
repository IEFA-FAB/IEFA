import {
	Button,
	Card,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@iefa/ui";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Home, SearchX } from "lucide-react";

export function NotFound({ children }: { children?: any }) {
	return (
		<div className="min-h-screen w-full flex items-center justify-center p-4">
			<Card className="w-full max-w-xl border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl rounded-3xl overflow-hidden">
				<CardHeader className="text-center space-y-4 pb-4 pt-12">
					<div className="mx-auto w-20 h-20 rounded-full bg-linear-to-br from-primary/20 to-primary/10 flex items-center justify-center border border-primary/20">
						<SearchX className="h-10 w-10 text-primary" />
					</div>
					<CardTitle className="text-4xl font-bold tracking-tight">
						Página não encontrada
					</CardTitle>
					<CardDescription className="text-zinc-400 text-lg">
						{children ||
							"A página que você está procurando não existe ou foi movida."}
					</CardDescription>
				</CardHeader>

				<CardFooter className="flex flex-col gap-3 px-8 pb-12 pt-8">
					<Button
						onClick={() => window.history.back()}
						variant="outline"
						className="w-full rounded-full font-bold h-12 text-base transition-all hover:-translate-y-0.5 border-white/10 bg-white/5 hover:bg-white/10"
					>
						<ArrowLeft className="mr-2 h-5 w-5" />
						Voltar
					</Button>
					<Link to="/" className="w-full">
						<Button className="w-full rounded-full font-bold shadow-lg shadow-primary/20 hover:shadow-primary/40 h-12 text-base transition-all hover:-translate-y-0.5">
							<Home className="mr-2 h-5 w-5" />
							Ir para o Início
						</Button>
					</Link>
				</CardFooter>
			</Card>
		</div>
	);
}
