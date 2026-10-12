import { Link } from "@tanstack/react-router"
import { ArrowLeft, Home, SearchX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

export function NotFound({ children }: { children?: React.ReactNode }) {
	return (
		<div className="flex min-h-screen w-full items-center justify-center p-4">
			<Card className="w-full max-w-xl">
				<CardHeader className="space-y-3 text-center">
					<div className="mx-auto flex size-14 items-center justify-center border border-primary/20 bg-primary/10">
						<SearchX className="size-7 text-primary" />
					</div>
					<CardTitle>Página não encontrada</CardTitle>
					<CardDescription>{children || "A página que você procura não existe ou foi movida."}</CardDescription>
				</CardHeader>
				<CardFooter className="flex flex-col gap-2">
					<Button onClick={() => window.history.back()} variant="outline" className="w-full">
						<ArrowLeft className="size-4" />
						Voltar
					</Button>
					<Button nativeButton={false} render={<Link to="/" />} className="w-full">
						<Home className="size-4" />
						Ir para o início
					</Button>
				</CardFooter>
			</Card>
		</div>
	)
}
