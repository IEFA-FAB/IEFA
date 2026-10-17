// Extraído de routes/subitens-genericos.tsx (port do sucontsubitem): tabela situacional.
import { FileSpreadsheet } from "lucide-react"
import { Badge } from "#/components/ui/badge"
import { SectionHeader } from "#/components/ui/section-header"
import { GenericCodeBadges } from "#/subitens/components/GenericCodeBadge"
import type { UgGroup } from "#/subitens/types"
import { formatUgName, getConferente } from "#/subitens/ug"

export function SituationalTable({ filteredData }: { filteredData: UgGroup[] }) {
	return (
		<section className="mb-16">
			<SectionHeader icon={<FileSpreadsheet />} title="Retrato situacional" description="Detalhamento por conta e saldo" className="mb-6" />

			<div className="bg-card rounded-xl border border-border overflow-hidden">
				<div className="overflow-x-auto">
					<table className="w-full text-left border-collapse">
						<thead className="bg-muted/50 border-b border-border text-label text-muted-foreground">
							<tr>
								{["UG Executora", "Questão RAC", "Conta Contábil", "Conta Corrente", "Código genérico", "Saldo"].map((h) => (
									<th key={h} className={`px-4 py-3${h === "Saldo" ? " text-right" : ""}`}>
										{h}
									</th>
								))}
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
							{filteredData.flatMap((group, gIdx) =>
								group.occurrences.map((occ, oIdx) => (
									<tr key={`${gIdx}-${oIdx}`} className="hover:bg-muted/40 transition-colors group">
										<td className="px-4 py-3">
											{oIdx === 0 ? (
												<div className="flex flex-col gap-1">
													<div className="flex items-center gap-3">
														<div className="w-1.5 h-1.5 rounded-full bg-warning" />
														<span className="text-subheading text-foreground">{formatUgName(group.ug)}</span>
													</div>
													<span className="text-label text-muted-foreground ml-4">Conferente: {getConferente(group.ug)}</span>
												</div>
											) : (
												<span className="opacity-0">{group.ug}</span>
											)}
										</td>
										<td className="px-4 py-3">
											<Badge variant="muted">{occ.racId}</Badge>
										</td>
										<td className="px-4 py-3 font-mono text-body text-muted-foreground">{occ.contaContabil}</td>
										<td className="px-4 py-3 font-mono text-body text-foreground">{occ.contaCorrente}</td>
										<td className="px-4 py-3">
											<GenericCodeBadges kinds={occ.genericKinds} />
										</td>
										<td className="px-4 py-3 font-mono text-subheading text-right text-foreground">
											{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(occ.saldo)}
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			</div>
		</section>
	)
}
