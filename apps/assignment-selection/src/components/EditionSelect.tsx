import type { Edition } from "@iefa/database/assignment-selection"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function EditionSelect({ editions, value, onChange }: { editions: Edition[]; value: string | null; onChange: (id: string) => void }) {
	const current = editions.find((e) => e.id === value)
	return (
		<Select value={value ?? null} onValueChange={(v) => onChange(v as string)}>
			<SelectTrigger className="w-44 bg-white text-slate-800">
				<SelectValue>{current ? current.name : "Edição"}</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{editions.map((e) => (
					<SelectItem key={e.id} value={e.id}>
						{e.name}
						{e.active ? " · ativa" : ""}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	)
}
