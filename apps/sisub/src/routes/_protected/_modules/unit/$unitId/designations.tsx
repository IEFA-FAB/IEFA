import { DESIGNATION_ROLE_LABELS, type DesignationRow, toContratosGovBrFunction } from "@iefa/sisub-domain"
import { createFileRoute, useParams } from "@tanstack/react-router"
import { UserCheck, UserPlus } from "lucide-react"
import { useState } from "react"
import { requirePermission, usePBAC } from "@/auth/pbac"
import { DesignationForm } from "@/components/features/unit/designations/DesignationForm"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { toast } from "@/components/ui/toast"
import { useDesignations, useEndDesignation } from "@/hooks/data/useExpenseExecution"
import { formatShortDate } from "@/lib/flows/model"

/**
 * GESTÃO UNIDADE — Designações
 * URL: /unit/:unitId/designations
 *
 * Fiscal, gestor (do contrato ou setorial) e comissão de recebimento, com o ato que designou e a vigência. É o que o
 * recebimento confere: o provisório é do fiscal designado, o definitivo de servidor ou comissão
 * designada (Lei 14.133/2021, art. 140, II). Sem designação, a entrega é conferida, mas não
 * se confirma.
 */
export const Route = createFileRoute("/_protected/_modules/unit/$unitId/designations")({
	beforeLoad: (opts) => requirePermission(opts, "unit", 1),
	component: DesignationsPage,
	head: () => ({ meta: [{ name: "description", content: "Designação de fiscal, gestor e comissão de recebimento da unidade" }] }),
})

function scopeLabel(row: DesignationRow): string {
	if (row.empenhoNumber) return `Empenho ${row.empenhoNumber}`
	if (row.arpNumber) return `ARP ${row.arpNumber}`
	if (row.acquisitionId) return "Contratação vinculada"
	return "Toda a OM"
}

function validityLabel(row: DesignationRow): string {
	const from = formatShortDate(`${row.validFrom}T12:00:00Z`)
	return row.validTo ? `de ${from} a ${formatShortDate(`${row.validTo}T12:00:00Z`)}` : `desde ${from}`
}

function DesignationsPage() {
	const { unitId: unitIdStr } = useParams({ strict: false })
	const unitId = Number(unitIdStr)
	const { can } = usePBAC()
	const canEdit = can("unit", 2, { type: "unit", id: unitId })
	const { data: rows, isLoading, isError } = useDesignations(unitId)
	const end = useEndDesignation(unitId)
	const [creating, setCreating] = useState(false)

	const active = (rows ?? []).filter((row) => row.active)
	const inactive = (rows ?? []).filter((row) => !row.active)

	async function endRow(row: DesignationRow) {
		if (!window.confirm(`Encerrar hoje a designação de ${row.personLabel} como ${DESIGNATION_ROLE_LABELS[row.role].toLowerCase()}?`)) return
		try {
			const result = await end.mutateAsync(row.id)
			toast.success(result.ended === "removed" ? "Designação que ainda não valia foi removida" : "Designação encerrada hoje")
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Não foi possível encerrar a designação")
		}
	}

	function renderRow(row: DesignationRow) {
		const contratosGovBrFunction = toContratosGovBrFunction(row.role, row.isSubstitute)
		return (
			<Item key={row.id} variant="outline" size="sm">
				<ItemMedia variant="icon">
					<UserCheck aria-hidden="true" />
				</ItemMedia>
				<ItemContent>
					<ItemTitle>
						{row.personLabel}
						<Badge variant="outline">{DESIGNATION_ROLE_LABELS[row.role]}</Badge>
						{row.isSubstitute && <Badge variant="secondary">Substituto</Badge>}
					</ItemTitle>
					<ItemDescription>
						{scopeLabel(row)} · {row.sourceReference ?? "sem referência do ato"} · {validityLabel(row)}
						{contratosGovBrFunction && ` · no Contratos.gov.br: ${contratosGovBrFunction}`}
					</ItemDescription>
				</ItemContent>
				{canEdit && row.active && (
					<ItemActions>
						<Button size="sm" variant="outline" disabled={end.isPending} onClick={() => endRow(row)}>
							Encerrar
						</Button>
					</ItemActions>
				)}
			</Item>
		)
	}

	return (
		<div className="space-y-6">
			<PageHeader
				title="Designações"
				description="Quem recebe as entregas em nome da OM: o fiscal confirma o provisório; o gestor do contrato, o gestor setorial ou a comissão efetiva o definitivo (Lei 14.133/2021, art. 140, II; Decreto 11.246/2022, art. 25). Registre o boletim ou a portaria de cada designação."
			>
				{canEdit && (
					<Button size="sm" onClick={() => setCreating(true)}>
						<UserPlus data-icon="inline-start" aria-hidden="true" />
						Nova designação
					</Button>
				)}
			</PageHeader>

			{isLoading ? (
				<div className="h-48 animate-pulse rounded-xl border bg-muted" aria-hidden="true" />
			) : isError ? (
				<p className="text-body text-destructive">Não foi possível carregar as designações.</p>
			) : (
				<>
					<Card>
						<CardHeader>
							<CardTitle>Vigentes</CardTitle>
							<CardDescription>
								{active.length === 0
									? "Ninguém designado: as entregas são conferidas, mas o provisório e o definitivo não se confirmam."
									: `${active.length} designação(ões) valendo hoje.`}
							</CardDescription>
						</CardHeader>
						{active.length > 0 && (
							<CardContent>
								<ItemGroup>{active.map(renderRow)}</ItemGroup>
							</CardContent>
						)}
					</Card>
					{inactive.length > 0 && (
						<Card>
							<CardHeader>
								<CardTitle>Encerradas ou futuras</CardTitle>
								<CardDescription>O termo de recebimento continua apontando a designação que valia no dia.</CardDescription>
							</CardHeader>
							<CardContent>
								<ItemGroup>{inactive.map(renderRow)}</ItemGroup>
							</CardContent>
						</Card>
					)}
				</>
			)}

			<Dialog open={creating} onOpenChange={setCreating}>
				<DialogContent className="sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>Nova designação</DialogTitle>
						<DialogDescription>Registre a designação que a autoridade já publicou: quem, em que papel, por qual ato e para quê.</DialogDescription>
					</DialogHeader>
					<DesignationForm unitId={unitId} onSaved={() => setCreating(false)} />
				</DialogContent>
			</Dialog>
		</div>
	)
}
