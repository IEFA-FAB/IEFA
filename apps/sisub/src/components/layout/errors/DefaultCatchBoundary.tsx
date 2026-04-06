import type { ErrorComponentProps } from "@tanstack/react-router"
import { Link, rootRouteId, useMatch, useRouter } from "@tanstack/react-router"
import { AlertCircle, ArrowLeft, Home, RefreshCw } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/cn"

export function DefaultCatchBoundary({ error }: ErrorComponentProps) {
	const router = useRouter()
	const isRoot = useMatch({
		strict: false,
		select: (state) => state.id === rootRouteId,
	})

	const errorMessage = error instanceof Error ? error.message : "Um erro inesperado ocorreu"

	return (
		<div className="min-h-screen w-full flex items-center justify-center p-4">
			<Card className="w-full max-w-2xl">
				<CardHeader className="text-center space-y-3">
					<div className="mx-auto flex size-14 items-center justify-center border border-destructive/20 bg-destructive/10">
						<AlertCircle className="size-7 text-destructive" />
					</div>
					<CardTitle>Ops! Algo deu errado</CardTitle>
					<CardDescription>Encontramos um erro inesperado. Por favor, tente novamente.</CardDescription>
				</CardHeader>

				<CardContent>
					<Alert variant="destructive">
						<AlertCircle className="size-4" />
						<AlertDescription>
							<strong className="font-semibold">Detalhes do erro:</strong>
							<code className="mt-2 block bg-muted p-2 font-mono text-sm text-muted-foreground">{errorMessage}</code>
						</AlertDescription>
					</Alert>
				</CardContent>

				<CardFooter className="flex flex-col gap-2">
					<Button onClick={() => router.invalidate()} className="w-full">
						<RefreshCw className="size-4" />
						Tentar Novamente
					</Button>

					<div className="grid w-full grid-cols-2 gap-2">
						{!isRoot && (
							<Button onClick={() => window.history.back()} variant="outline">
								<ArrowLeft className="size-4" />
								Voltar
							</Button>
						)}
						<Button variant="outline" render={<Link to="/" />} className={cn(isRoot && "col-span-2")}>
							<Home className="size-4" />
							Ir para o Início
						</Button>
					</div>
				</CardFooter>
			</Card>
		</div>
	)
}
