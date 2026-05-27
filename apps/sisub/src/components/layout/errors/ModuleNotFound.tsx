import { useRouter } from "@tanstack/react-router"
import { ArrowLeft, SearchX } from "lucide-react"
import { Button } from "@/components/ui/button"

export function ModuleNotFound() {
	const router = useRouter()

	return (
		<div className="flex flex-col items-center justify-center gap-6 py-20 text-center">
			<div className="flex size-16 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
				<SearchX className="size-8 text-primary" />
			</div>

			<div className="space-y-1.5">
				<h2 className="text-lg font-semibold">Página não encontrada</h2>
				<p className="text-sm text-muted-foreground max-w-sm">A página que você está procurando não existe ou foi movida.</p>
			</div>

			<Button variant="outline" onClick={() => router.history.back()}>
				<ArrowLeft className="size-4" />
				Voltar
			</Button>
		</div>
	)
}
