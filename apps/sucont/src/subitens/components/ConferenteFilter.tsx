// Extraído de routes/subitens-genericos.tsx (port do sucontsubitem): filtro por conferente.
import { X } from "lucide-react"
import { Button } from "#/components/ui/button"
import { Label } from "#/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select"

interface ConferenteFilterProps {
	allConferentes: string[]
	selectedConferente: string
	onSelectedConferenteChange: (value: string) => void
}

export function ConferenteFilter({ allConferentes, selectedConferente, onSelectedConferenteChange }: ConferenteFilterProps) {
	return (
		<div className="mb-8 flex flex-col gap-2">
			<Label htmlFor="conferente-filter">Filtrar por conferente</Label>
			<div className="flex items-center gap-2">
				<Select items={{ all: "Todos os conferentes" }} value={selectedConferente} onValueChange={(v) => onSelectedConferenteChange(v ?? "all")}>
					<SelectTrigger id="conferente-filter" className="w-64">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">Todos os conferentes</SelectItem>
						{allConferentes.map((c) => (
							<SelectItem key={c} value={c}>
								{c}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{selectedConferente !== "all" && (
					<Button type="button" variant="ghost" size="sm" onClick={() => onSelectedConferenteChange("all")}>
						<X />
						Limpar
					</Button>
				)}
			</div>
		</div>
	)
}
