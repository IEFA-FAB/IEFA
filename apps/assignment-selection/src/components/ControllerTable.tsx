import type { Person } from "@iefa/database/assignment-selection"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { localidadesFab } from "@/lib/localidades"
import { cn } from "@/lib/utils"

export type PersonChanges = Partial<Pick<Person, "classificacao" | "nome" | "localidade" | "estado" | "show_card" | "show_om" | "hide_card">>

const omOptions = Object.keys(localidadesFab)

interface ControllerTableProps {
	persons: Person[]
	onUpdate: (id: number, changes: PersonChanges) => void
	updatingId?: number | null
}

export function ControllerTable({ persons, onUpdate, updatingId }: ControllerTableProps) {
	return (
		<div className="rounded-md border bg-white">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="text-center">Classificação</TableHead>
						<TableHead className="text-center">Nome</TableHead>
						<TableHead className="text-center">OM</TableHead>
						<TableHead className="text-center">Estado</TableHead>
						<TableHead className="text-center">Exibir Card</TableHead>
						<TableHead className="text-center">Exibir OM</TableHead>
						<TableHead className="text-center">Ocultar Card</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{persons.length === 0 ? (
						<TableRow>
							<TableCell colSpan={7} className="h-24 text-center text-slate-500">
								Nenhuma pessoa nesta edição.
							</TableCell>
						</TableRow>
					) : (
						persons.map((p) => {
							const isUpdating = p.id === updatingId
							return (
								<TableRow key={p.id} className={cn(isUpdating && "opacity-50 bg-slate-100")}>
									<TableCell>
										<Input
											type="number"
											defaultValue={p.classificacao}
											onBlur={(e) => onUpdate(p.id, { classificacao: e.target.valueAsNumber })}
											className="w-20"
											disabled={isUpdating}
										/>
									</TableCell>
									<TableCell>
										<Input
											type="text"
											defaultValue={p.nome}
											onBlur={(e) => onUpdate(p.id, { nome: e.target.value })}
											className="min-w-[150px]"
											disabled={isUpdating}
										/>
									</TableCell>
									<TableCell>
										<Select
											value={p.localidade ?? null}
											onValueChange={(v) => onUpdate(p.id, { localidade: v as string, estado: localidadesFab[v as string] ?? "N/A" })}
											disabled={isUpdating}
										>
											<SelectTrigger className="w-28">
												<SelectValue>{p.localidade ?? "Selecione"}</SelectValue>
											</SelectTrigger>
											<SelectContent className="max-h-60">
												{omOptions.map((om) => (
													<SelectItem key={om} value={om}>
														{om}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</TableCell>
									<TableCell className="text-sm text-slate-600">{p.localidade ? (localidadesFab[p.localidade] ?? "N/A") : "N/A"}</TableCell>
									<TableCell className="text-center">
										<div className="flex justify-center">
											<Checkbox checked={p.show_card} onCheckedChange={(checked) => onUpdate(p.id, { show_card: checked })} disabled={isUpdating} />
										</div>
									</TableCell>
									<TableCell className="text-center">
										<div className="flex justify-center">
											<Checkbox checked={p.show_om} onCheckedChange={(checked) => onUpdate(p.id, { show_om: checked })} disabled={isUpdating} />
										</div>
									</TableCell>
									<TableCell className="text-center">
										<div className="flex justify-center">
											<Checkbox checked={p.hide_card} onCheckedChange={(checked) => onUpdate(p.id, { hide_card: checked })} disabled={isUpdating} />
										</div>
									</TableCell>
								</TableRow>
							)
						})
					)}
				</TableBody>
			</Table>
		</div>
	)
}
