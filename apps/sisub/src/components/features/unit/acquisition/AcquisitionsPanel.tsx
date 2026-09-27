import { FileSignature, Plus, Search } from "lucide-react"
import { useState } from "react"
import { ArpSearchModal } from "@/components/features/local/arp/ArpSearchModal"
import { QuickEmpenhoDialog } from "@/components/features/unit/finance/QuickEmpenhoForm"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { toast } from "@/components/ui/toast"
import { useAcquisitionMutations } from "@/hooks/data/useAcquisitions"
import { BRL, formatIsoDate } from "@/lib/expense-execution"
import type { AcquisitionsOverview } from "@/server/acquisition.fn"
import { AcquisitionCard } from "./AcquisitionCard"
import { CreateAcquisitionDialog } from "./CreateAcquisitionDialog"

/**
 * Contratações de origem da unidade: todo caminho real de aquisição da subsistência — ata própria,
 * adesão (carona), dispensa, inexigibilidade, contrato, Contrata+Brasil, suprimento de fundos —,
 * com o que falta em cada uma, o somatório da dispensa e as NEs que ela sustenta. Embaixo, o que
 * ainda não tem origem: NE importada ou registrada às pressas, e ARP antiga sem contratação.
 */
export function AcquisitionsPanel({ unitId, overview, canEdit }: { unitId: number; overview: AcquisitionsOverview; canEdit: boolean }) {
	const [creating, setCreating] = useState(false)
	const [quickNe, setQuickNe] = useState(false)
	const [importingArp, setImportingArp] = useState(false)
	const { linkEmpenho, linkArp } = useAcquisitionMutations(unitId)
	const incomplete = overview.acquisitions.filter((a) => a.gaps.length > 0).length
	const acquisitionOptions = overview.acquisitions.map((a) => ({
		value: a.id,
		label: `${a.kindLabel}${a.object ? ` — ${a.object}` : ""}`,
		hint: a.supplierName ?? a.processNup ?? undefined,
		keywords: `${a.processNup ?? ""} ${a.supplierName ?? ""}`,
	}))
	const srpOptions = acquisitionOptions.filter((option) => overview.acquisitions.find((a) => a.id === option.value)?.kind === "registro_precos")

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-center gap-2">
				<Badge variant="outline">
					{overview.acquisitions.length} contrataç{overview.acquisitions.length === 1 ? "ão" : "ões"}
				</Badge>
				<Badge variant={incomplete > 0 ? "warning" : "success"}>{incomplete} com pendência</Badge>
				<Badge variant={overview.empenhosWithoutOrigin.length > 0 ? "warning" : "success"}>{overview.empenhosWithoutOrigin.length} NE sem origem</Badge>
				{overview.currentLimits.map((limit) => (
					<Badge key={limit.clause} variant={limit.isOutdated ? "warning" : "secondary"}>
						Art. 75, {limit.clause}: {limit.value != null ? BRL.format(limit.value) : "sem limite"}
						{limit.isOutdated ? ` (cadastre o de ${overview.fiscalYear})` : ""}
					</Badge>
				))}
				{canEdit && (
					<div className="ml-auto flex flex-wrap gap-2">
						<Button size="sm" variant="outline" onClick={() => setQuickNe(true)}>
							<FileSignature className="size-4" aria-hidden="true" />
							Registro rápido de NE
						</Button>
						<Button size="sm" onClick={() => setCreating(true)}>
							<Plus className="size-4" aria-hidden="true" />
							Nova contratação de origem
						</Button>
					</div>
				)}
			</div>

			{overview.acquisitions.length === 0 ? (
				<Card>
					<CardContent className="py-10">
						<p className="text-center text-body text-muted-foreground">
							Nenhuma contratação de origem ainda. Registre a ata, o contrato ou a dispensa que sustenta cada empenho — só o tipo é obrigatório.
						</p>
					</CardContent>
				</Card>
			) : (
				<div className="space-y-4">
					{overview.acquisitions.map((acquisition) => (
						<AcquisitionCard key={acquisition.id} unitId={unitId} acquisition={acquisition} canEdit={canEdit} />
					))}
				</div>
			)}

			{overview.empenhosWithoutOrigin.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle>NE sem contratação de origem</CardTitle>
						<CardDescription>
							Importadas do SIAFI ou registradas às pressas. Continuam valendo na OF e na liquidação; vincule cada uma à contratação de origem que a sustenta.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ItemGroup>
							{overview.empenhosWithoutOrigin.map((empenho) => (
								<Item key={empenho.id} variant="outline" size="sm">
									<ItemContent>
										<ItemTitle>
											{empenho.numeroEmpenho}
											<Badge variant="outline">{empenho.origem === "siafi" ? "SIAFI" : "manual"}</Badge>
										</ItemTitle>
										<ItemDescription className="text-xs">
											{formatIsoDate(empenho.dataEmpenho)} · {BRL.format(empenho.valorVigente)}
											{empenho.favorecidoNome ? ` · ${empenho.favorecidoNome}` : ""}
										</ItemDescription>
									</ItemContent>
									{canEdit && (
										<ItemActions className="w-72">
											<SearchableSelect
												value={null}
												onValueChange={(acquisitionId) => acquisitionId && linkEmpenho.mutate({ empenhoId: empenho.id, acquisitionId })}
												options={acquisitionOptions}
												placeholder="Vincular à contratação de origem…"
												searchPlaceholder="Buscar contratação de origem"
												emptyLabel="Nenhuma contratação de origem: registre uma acima"
												aria-label={`Vincular ${empenho.numeroEmpenho} à contratação de origem`}
											/>
										</ItemActions>
									)}
								</Item>
							))}
						</ItemGroup>
					</CardContent>
				</Card>
			)}

			<Card>
				<CardHeader>
					<div className="flex flex-wrap items-start justify-between gap-2">
						<div>
							<CardTitle>ARPs sem contratação de origem</CardTitle>
							<CardDescription>
								Atas importadas pelo anexo quantitativo ou antes desta tela. Ligue cada uma à contratação de origem (registro de preços) que ela formaliza.
							</CardDescription>
						</div>
						{canEdit && (
							<Button size="sm" variant="outline" onClick={() => setImportingArp(true)}>
								<Search className="size-4" aria-hidden="true" />
								Importar ARP sem anexo
							</Button>
						)}
					</div>
				</CardHeader>
				<CardContent>
					{overview.arpsWithoutAcquisition.length === 0 ? (
						<p className="text-caption text-muted-foreground">Toda ARP da unidade já tem contratação de origem.</p>
					) : (
						<ItemGroup>
							{overview.arpsWithoutAcquisition.map((arp) => (
								<Item key={arp.id} variant="outline" size="sm">
									<ItemContent>
										<ItemTitle>
											ARP {arp.numeroAta} · UASG {arp.uasgGerenciadora}
											{arp.lastSyncedAt == null && <Badge variant="warning">não sincronizada</Badge>}
										</ItemTitle>
										<ItemDescription className="text-xs">
											{arp.itemCount} ite{arp.itemCount === 1 ? "m" : "ns"}
											{arp.quantityEstimateId ? " · com anexo quantitativo" : " · sem anexo quantitativo"}
										</ItemDescription>
									</ItemContent>
									{canEdit && (
										<ItemActions className="w-72">
											<SearchableSelect
												value={null}
												onValueChange={(acquisitionId) => acquisitionId && linkArp.mutate({ arpId: arp.id, acquisitionId })}
												options={srpOptions}
												placeholder="Vincular ao registro de preços…"
												searchPlaceholder="Buscar contratação de origem"
												emptyLabel="Nenhum registro de preços: registre um acima"
												aria-label={`Vincular a ARP ${arp.numeroAta}`}
											/>
										</ItemActions>
									)}
								</Item>
							))}
						</ItemGroup>
					)}
				</CardContent>
			</Card>

			{creating && <CreateAcquisitionDialog unitId={unitId} onClose={() => setCreating(false)} />}
			{importingArp && <ArpSearchModal open onOpenChange={(open) => !open && setImportingArp(false)} unitId={unitId} />}
			<QuickEmpenhoDialog
				open={quickNe}
				onOpenChange={setQuickNe}
				unitId={unitId}
				onRegistered={(result) => {
					if (result.created) {
						toast.success(
							`NE ${result.numeroEmpenho} registrada${result.relinked > 0 ? ` — ${result.relinked} documento(s) do SIAFI religado(s)` : ""}. Vincule-a à contratação de origem.`
						)
					}
				}}
			/>
		</div>
	)
}
