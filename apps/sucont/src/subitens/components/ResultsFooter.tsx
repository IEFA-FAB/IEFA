// Extraído de routes/subitens-genericos.tsx (port do sucontsubitem): rodapé da tela de resultados.
import { Crosshair, Plane, Shield } from "lucide-react"

export function ResultsFooter() {
	return (
		<footer className="pt-20 pb-32 border-t border-border text-center">
			<div className="flex items-center justify-center gap-4 mb-6 opacity-30">
				<Shield size={24} className="text-foreground" />
				<div className="w-2 h-2 rounded-full bg-warning" />
				<Crosshair size={24} className="text-foreground" />
				<div className="w-2 h-2 rounded-full bg-warning" />
				<Plane size={24} className="text-foreground -rotate-45" />
			</div>
			<p className="text-label text-muted-foreground/60">Analista SUCONT • DIREF • 2026</p>
		</footer>
	)
}
