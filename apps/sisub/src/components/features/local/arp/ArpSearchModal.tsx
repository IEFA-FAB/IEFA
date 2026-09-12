import { COMPRAS_MAX_DATE_WINDOW_DAYS } from "@iefa/compras-api"
import { Search } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { useImportArp, useSearchArp } from "@/hooks/data/useArp"
import { defaultVigenciaWindow } from "@/lib/arp-compras"
import type { ComprasArpResult } from "@/types/domain/arp"

// ─── Props ────────────────────────────────────────────────────────────────────

interface ArpSearchModalProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	ataId: string
	unitId: number
	/** UASG da unidade, pré-preenche o campo de busca quando disponível */
	defaultUasg?: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const ONE_DAY_MS = 24 * 60 * 60 * 1000

function windowDays(min: string, max: string): number | null {
	const from = Date.parse(`${min}T00:00:00Z`)
	const to = Date.parse(`${max}T00:00:00Z`)
	if (Number.isNaN(from) || Number.isNaN(to)) return null
	return (to - from) / ONE_DAY_MS
}

function formatDate(value: string | null | undefined): string {
	if (!value) return "—"
	// Aceita "DD/MM/YYYY" ou ISO
	const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
	if (match) return `${match[1]}/${match[2]}/${match[3]}`
	if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
		const [y, m, d] = value.substring(0, 10).split("-")
		return `${d}/${m}/${y}`
	}
	return value
}

function vigenciaStatus(fim: string | null | undefined): "ativa" | "vencida" | "desconhecida" {
	if (!fim) return "desconhecida"
	// Normalizar para ISO
	let isoDate = fim
	const match = fim.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
	if (match) isoDate = `${match[3]}-${match[2]}-${match[1]}`
	return new Date(isoDate) >= new Date() ? "ativa" : "vencida"
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function ArpSearchModal({ open, onOpenChange, ataId, unitId, defaultUasg }: ArpSearchModalProps) {
	const initialWindow = defaultVigenciaWindow()
	const [uasg, setUasg] = useState(defaultUasg ?? "")
	const [numero, setNumero] = useState("")
	const [ano, setAno] = useState("")
	const [vigenciaMin, setVigenciaMin] = useState(initialWindow.min)
	const [vigenciaMax, setVigenciaMax] = useState(initialWindow.max)
	const [importingId, setImportingId] = useState<string | null>(null)

	const { mutate: search, data: searchResult, isPending: isSearching, reset: resetSearch } = useSearchArp()
	const { mutate: importArp, isPending: isImporting } = useImportArp(ataId)

	const results = searchResult?.resultado ?? []
	const days = windowDays(vigenciaMin, vigenciaMax)
	// O filtro da API é o par NNNNN/AAAA: número sem ano seria ignorado em
	// silêncio, e a janela inteira voltaria como se fosse o resultado da busca.
	const numeroSemAno = Boolean(numero.trim()) && !ano.trim()
	const windowError =
		days === null
			? "Período inválido"
			: days < 0
				? "A data final é anterior à inicial"
				: days > COMPRAS_MAX_DATE_WINDOW_DAYS
					? `O Compras.gov.br aceita no máximo ${COMPRAS_MAX_DATE_WINDOW_DAYS} dias (selecionados: ${Math.round(days)})`
					: null

	function handleSearch() {
		if (!uasg.trim() || windowError || numeroSemAno) return
		resetSearch()
		search({
			codigoUnidadeGerenciadora: uasg.trim(),
			dataVigenciaInicialMin: vigenciaMin,
			dataVigenciaInicialMax: vigenciaMax,
			numeroAta: numero.trim() || undefined,
			anoAta: ano.trim() || undefined,
		})
	}

	function handleImport(item: ComprasArpResult) {
		if (!item.numeroAtaRegistroPreco || !item.codigoUnidadeGerenciadora || !item.dataVigenciaInicial) return
		const key = `${item.numeroAtaRegistroPreco}-${item.codigoUnidadeGerenciadora}`
		setImportingId(key)
		importArp(
			{
				ataId,
				unitId,
				arpData: {
					numeroAtaRegistroPreco: item.numeroAtaRegistroPreco,
					codigoUnidadeGerenciadora: item.codigoUnidadeGerenciadora,
					nomeUnidadeGerenciadora: item.nomeUnidadeGerenciadora,
					// Estreita a consulta de itens: `2_consultarARPItem` não filtra por
					// número de ata, só por compra + janela de vigência.
					numeroCompra: item.numeroCompra,
					objeto: item.objeto,
					dataVigenciaInicial: item.dataVigenciaInicial,
					dataVigenciaFinal: item.dataVigenciaFinal,
					statusAta: item.statusAta,
				},
			},
			{
				onSettled: () => setImportingId(null),
				onSuccess: () => onOpenChange(false),
			}
		)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
				<DialogHeader>
					<DialogTitle>Vincular ARP ao Compras.gov.br</DialogTitle>
					<DialogDescription>
						Busque a Ata de Registro de Preços (ARP) correspondente a esta ATA interna. Os itens serão importados e casados automaticamente por código CATMAT.
					</DialogDescription>
				</DialogHeader>

				{/* Formulário de busca */}
				<div className="space-y-3">
					<div className="grid grid-cols-[1fr_auto_auto] gap-3 items-end">
						<div className="space-y-1.5">
							<Label htmlFor="arp-uasg">UASG Gerenciadora</Label>
							<Input
								id="arp-uasg"
								placeholder="160074"
								maxLength={6}
								value={uasg}
								onChange={(e) => setUasg(e.target.value.replace(/\D/g, ""))}
								onKeyDown={(e) => e.key === "Enter" && handleSearch()}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="arp-numero">Nº ATA</Label>
							<Input
								id="arp-numero"
								placeholder="001"
								value={numero}
								onChange={(e) => setNumero(e.target.value)}
								onKeyDown={(e) => e.key === "Enter" && handleSearch()}
								className="w-24"
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="arp-ano">Ano</Label>
							<Input
								id="arp-ano"
								placeholder="2026"
								maxLength={4}
								value={ano}
								onChange={(e) => setAno(e.target.value.replace(/\D/g, ""))}
								onKeyDown={(e) => e.key === "Enter" && handleSearch()}
								className="w-24"
							/>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label htmlFor="arp-vigencia-min">Vigência inicial — de</Label>
							<Input id="arp-vigencia-min" type="date" value={vigenciaMin} onChange={(e) => setVigenciaMin(e.target.value)} />
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="arp-vigencia-max">até</Label>
							<Input id="arp-vigencia-max" type="date" value={vigenciaMax} onChange={(e) => setVigenciaMax(e.target.value)} />
						</div>
					</div>

					{numeroSemAno && <p className="text-xs text-destructive">Informe o ano da ata junto com o número.</p>}

					<p className={windowError ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
						{windowError ??
							`O Compras.gov.br busca pela data de INÍCIO da vigência, em janelas de no máximo ${COMPRAS_MAX_DATE_WINDOW_DAYS} dias. Ata que começou a vigorar fora do período não aparece.`}
					</p>
				</div>

				<Button onClick={handleSearch} disabled={!uasg.trim() || !!windowError || numeroSemAno || isSearching} className="self-end gap-2">
					{isSearching ? <Spinner className="size-4" /> : <Search className="size-4" />}
					Buscar
				</Button>

				{/* Resultados */}
				{searchResult && (
					<div className="flex-1 overflow-y-auto space-y-2 min-h-0">
						{results.length === 0 ? (
							<p className="text-sm text-muted-foreground text-center py-6">Nenhuma ARP encontrada com os critérios informados.</p>
						) : (
							results.map((item) => {
								const key = `${item.numeroAtaRegistroPreco}-${item.codigoUnidadeGerenciadora}`
								const status = vigenciaStatus(item.dataVigenciaFinal)
								const isThis = importingId === key
								return (
									<div key={key} className="border rounded-lg p-4 flex items-start justify-between gap-4 hover:bg-muted/50 transition-colors">
										<div className="space-y-1 min-w-0">
											<div className="flex items-center gap-2 flex-wrap">
												<span className="text-subheading">ARP {item.numeroAtaRegistroPreco}</span>
												<span className="text-xs text-muted-foreground">UASG {item.codigoUnidadeGerenciadora}</span>
												<Badge
													suppressHydrationWarning
													variant={status === "ativa" ? "default" : status === "vencida" ? "destructive" : "secondary"}
													className="text-xs"
												>
													{status === "ativa" ? "Ativa" : status === "vencida" ? "Vencida" : "Vigência desconhecida"}
												</Badge>
											</div>
											{item.nomeUnidadeGerenciadora && <p className="text-xs text-muted-foreground truncate">{item.nomeUnidadeGerenciadora}</p>}
											{item.objeto && <p className="text-xs text-foreground/80 line-clamp-2">{item.objeto}</p>}
											<div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
												{item.dataVigenciaInicial && (
													<span>
														Vigência: {formatDate(item.dataVigenciaInicial)} → {formatDate(item.dataVigenciaFinal)}
													</span>
												)}
												{item.quantidadeItens != null && <span>{item.quantidadeItens} itens</span>}
												{item.valorTotal != null && <span>Valor total: {BRL.format(item.valorTotal)}</span>}
											</div>
										</div>
										<Button size="sm" onClick={() => handleImport(item)} disabled={isImporting} className="shrink-0">
											{isThis && isImporting ? <Spinner className="size-4 mr-1.5" /> : null}
											Importar
										</Button>
									</div>
								)
							})
						)}
					</div>
				)}
			</DialogContent>
		</Dialog>
	)
}
