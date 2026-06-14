import { Link } from "@tanstack/react-router"
import { ArrowLeft, Home } from "iconoir-react"
import { Button } from "./ui/button"

export function NotFound({ children }: { children?: React.ReactNode }) {
	return (
		<div className="flex min-h-[calc(100vh-3.5rem)] flex-col justify-center">
			<div className="mx-auto w-full max-w-2xl border-x border-border px-8 py-20">
				{/* Typographic statement */}
				<p
					aria-hidden="true"
					className="font-mono font-bold leading-none select-none text-foreground"
					style={{ fontSize: "clamp(5rem, 14vw, 9rem)", letterSpacing: "-0.04em" }}
				>
					404
				</p>

				<div className="mt-8 border-t border-border pt-8">
					<h1 className="mb-2 text-xl font-semibold text-foreground" style={{ letterSpacing: "-0.02em" }}>
						Página não encontrada
					</h1>
					<p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{children || "A página que você está procurando não existe ou foi movida."}</p>
				</div>

				<div className="mt-10 flex flex-wrap gap-3">
					<Button variant="outline" onClick={() => window.history.back()}>
						<ArrowLeft />
						Voltar
					</Button>
					<Button nativeButton={false} render={<Link to="/" />}>
						<Home />
						Ir para o Início
					</Button>
				</div>
			</div>
		</div>
	)
}
