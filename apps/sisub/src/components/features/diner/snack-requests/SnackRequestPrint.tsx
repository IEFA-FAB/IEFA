import type { SnackRequestDetail } from "@iefa/sisub-domain"
import type { SnackClass } from "@iefa/sisub-domain/utils"
import { formatDuration } from "@iefa/sisub-domain/utils"
import { Printer } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { formatCurrency, formatDateTime, PREFERENCE_LABELS } from "./snack-format"

/**
 * Requisição de lanche no leiaute do Anexo E do Módulo 7 — impressa por `window.print()`
 * (o diálogo do navegador oferece "Salvar como PDF"), no mesmo padrão do
 * `WeeklyMenuPrint`: a cópia de impressão vive num portal filho direto do <body>, fora do
 * app-shell que recorta o conteúdo com `overflow`.
 *
 * Campo 9 em missão terrestre sai EM BRANCO, como manda o modelo ("terrestres deixar em
 * branco"); a classe de apoio calculada vem numa linha própria (decisão N3 do design).
 */
export function SnackRequestPrintButton({ request }: { request: SnackRequestDetail }) {
	// createPortal exige `document` — só no cliente.
	const [mounted, setMounted] = useState(false)
	useEffect(() => setMounted(true), [])

	return (
		<>
			<Button variant="outline" size="sm" onClick={() => window.print()}>
				<Printer className="size-4" aria-hidden />
				Imprimir requisição (Anexo E)
			</Button>
			{mounted &&
				createPortal(
					<div className="anexo-e-print-portal">
						<style>{PRINT_CSS}</style>
						<AnexoEDocument request={request} />
					</div>,
					document.body
				)}
		</>
	)
}

function uniqueClasses(classes: SnackClass[]): string {
	return [...new Set(classes)]
		.toSorted()
		.map((c) => `Classe ${c}`)
		.join(", ")
}

function AnexoEDocument({ request }: { request: SnackRequestDetail }) {
	const aerial = request.mission_kind === "aerea"
	const requestedClasses = uniqueClasses(request.lines.map((line) => line.standard_snapshot.snackClass))
	const calculatedClasses = uniqueClasses(request.calculator_snapshot?.entitlement?.lines.map((line) => line.snackClass) ?? [])
	const supportClass = calculatedClasses || uniqueClasses(request.lines.map((line) => line.standard_snapshot.snackClass))
	const involvement = request.calculator_snapshot?.entitlement?.involvementMinutes

	return (
		<div className="anexo-e-doc">
			<div className="anexo-e-title">ANEXO E — REQUISIÇÃO DE LANCHE</div>
			<div className="anexo-e-subtitle">{aerial ? "Lanche de Bordo" : "Lanche de Apoio"}</div>

			<table className="anexo-e-grid">
				<colgroup>
					<col className="anexo-e-col-n" />
					<col className="anexo-e-col-label" />
					<col />
					<col />
				</colgroup>
				<tbody>
					<tr>
						<th colSpan={2}>Setor requisitante</th>
						<td colSpan={2}>{request.requester_unit_label}</td>
					</tr>
					<tr>
						<th colSpan={2}>Cozinha apoiadora</th>
						<td colSpan={2}>{request.kitchen_name ?? ""}</td>
					</tr>
					<Row n={1} label={aerial ? "Aeronave (tipo / matrícula / OM)" : "Viatura (tipo / matrícula / OM)"}>
						{[request.vehicle_type, request.vehicle_registration, request.vehicle_om].map((v) => v || "—").join(" / ")}
					</Row>
					<Row n={2} label="Missão">
						{request.mission_description}
					</Row>
					<Row n={3} label={aerial ? "Data/hora da decolagem" : "Data/hora da partida"}>
						{formatDateTime(request.departure_at)}
					</Row>
					<Row n={4} label="Procedência / destino / escalas">
						{[request.origin, request.destination, request.stops].map((v) => v || "—").join(" / ")}
						{request.stops_without_mess ? " (escala sem apoio de rancho)" : ""}
					</Row>
					<Row n={5} label={aerial ? "Tempo de voo" : "Duração do deslocamento"}>
						{formatDuration(request.total_minutes)}
						{request.longest_leg_minutes != null ? ` · maior perna ${formatDuration(request.longest_leg_minutes)}` : ""}
						{aerial && request.ground_minutes > 0 ? ` · em solo ${formatDuration(request.ground_minutes)}` : ""}
						{aerial && involvement != null ? ` · envolvimento ${formatDuration(involvement)}` : ""}
					</Row>
					<Row n={6} label="Nº da ordem de missão">
						{request.mission_order_number ?? ""}
					</Row>
					<Row n={7} label={aerial ? "Nº de tripulantes / passageiros" : "Efetivo / outros"}>
						{request.crew_count} / {request.pax_count}
						{request.includes_non_military ? ` · inclui civis ou servidores: ${request.non_military_reason ?? ""}` : ""}
					</Row>
					<tr>
						<th className="anexo-e-n">8</th>
						<th>Material / QNT</th>
						<td colSpan={2}>
							<table className="anexo-e-inner">
								<tbody>
									<tr>
										<td>Água: {request.water_quantity}</td>
										<td>Copos: {request.cup_quantity}</td>
										<td>Gelo: {request.ice_quantity}</td>
										<td>Café: {request.coffee_quantity}</td>
									</tr>
								</tbody>
							</table>
						</td>
					</tr>
					<Row n={9} label="Tipo de lanche (A, B ou C)">
						{aerial ? requestedClasses : ""}
					</Row>
					{!aerial && (
						<tr>
							<td />
							<th>Lanche de Apoio — classe calculada</th>
							<td colSpan={2}>{supportClass}</td>
						</tr>
					)}
					<Row n={10} label="Preferência: lanche ou refeição (marmita)">
						{PREFERENCE_LABELS[request.preference] ?? request.preference}
					</Row>
					<Row n={11} label="Valor do lanche (SSU)">
						{request.unit_value != null ? formatCurrency(request.unit_value) : ""}
					</Row>
				</tbody>
			</table>

			<table className="anexo-e-grid anexo-e-lines">
				<thead>
					<tr>
						<th>Padrão</th>
						<th>Classe</th>
						<th>Público</th>
						<th>Kits</th>
					</tr>
				</thead>
				<tbody>
					{request.lines.map((line) => (
						<tr key={line.id}>
							<td>{line.standard_snapshot.name}</td>
							<td>{line.standard_snapshot.snackClass}</td>
							<td>{line.audience === "crew" ? (aerial ? "Tripulação" : "Efetivo") : aerial ? "Passageiros" : "Outros"}</td>
							<td>{line.approved_quantity ?? line.quantity}</td>
						</tr>
					))}
				</tbody>
			</table>

			<div className="anexo-e-footer">
				<div>
					<span className="anexo-e-label">Data da Retirada:</span> {formatDateTime(request.pickup_at)}
				</div>
				<div>
					<span className="anexo-e-label">Responsável:</span> {request.pickup_responsible}
				</div>
			</div>

			<div className="anexo-e-sign">
				<div className="anexo-e-sign-line" />
				<div>{request.requester.label}</div>
				<div>Requisitante — {formatDateTime(request.created_at)}</div>
			</div>
		</div>
	)
}

function Row({ n, label, children }: { n: number; label: string; children: ReactNode }) {
	return (
		<tr>
			<th className="anexo-e-n">{n}</th>
			<th>{label}</th>
			<td colSpan={2}>{children}</td>
		</tr>
	)
}

const PRINT_CSS = `
.anexo-e-print-portal { display: none; }
.anexo-e-doc {
	background: #fff;
	color: #000;
	font-family: Arial, Helvetica, sans-serif;
	font-size: 11px;
	line-height: 1.3;
}
.anexo-e-title { font-weight: 700; font-size: 13px; text-align: center; letter-spacing: 0.5px; }
.anexo-e-subtitle { text-align: center; margin-bottom: 10px; }
.anexo-e-grid { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 10px; }
.anexo-e-grid th, .anexo-e-grid td { border: 1px solid #000; padding: 4px 6px; vertical-align: top; text-align: left; word-break: break-word; }
.anexo-e-grid th { font-weight: 700; background: #f2f2f2; }
.anexo-e-grid th.anexo-e-n { width: 28px; text-align: center; }
.anexo-e-col-n { width: 28px; }
.anexo-e-col-label { width: 34%; }
.anexo-e-lines thead th { text-align: center; }
.anexo-e-inner { width: 100%; border-collapse: collapse; }
.anexo-e-inner td { border: none !important; padding: 0 4px 0 0 !important; }
.anexo-e-footer { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 12px; }
.anexo-e-label { font-weight: 700; }
.anexo-e-sign { margin: 40px auto 0; width: 60%; text-align: center; }
.anexo-e-sign-line { border-top: 1px solid #000; margin-bottom: 4px; }

@media print {
	@page { size: A4 portrait; margin: 12mm; }
	body { background: #fff !important; }
	body > *:not(.anexo-e-print-portal) { display: none !important; }
	.anexo-e-print-portal { display: block !important; }
	.anexo-e-grid tr { break-inside: avoid; page-break-inside: avoid; }
}
`
