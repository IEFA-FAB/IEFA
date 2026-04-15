import { Link } from "@tanstack/react-router"

export function NotFound() {
	return (
		<div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center p-8">
			<h2 className="text-2xl font-semibold">Página não encontrada</h2>
			<Link to="/" className="text-fd-primary hover:underline text-sm cursor-pointer">
				Voltar ao início
			</Link>
		</div>
	)
}
