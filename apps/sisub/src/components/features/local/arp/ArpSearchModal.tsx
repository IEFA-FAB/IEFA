import { Search } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { useImportArp, useSearchArp } from "@/hooks/data/useArp"
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
	const [uasg, setUasg] = useState(defaultUasg ?? "")
	const [numero, setNumero] = useState("")
	const [ano, setAno] = useState(String(new Date().getFullYear()))
	const [importingId, setImportingId] = useState<string | null>(null)

	const { mutate: search, data: searchResult, isPending: isSearching, reset: resetSearch } = useSearchArp()
	const { mutate: importArp, isPending: isImporting } = useImportArp(ataId)

	const results = searchResult?.resultado ?? []

	function handleSearch() {
		if (!uasg.trim()) return
		resetSearch()
		search({ uasgGerenciadora: uasg.trim(), numeroAta: numero.trim() || undefined, anoAta: ano.trim() || undefined })
	}

	function handleImport(item: ComprasArpResult) {
		const key = `${item.numeroAta}-${item.uasgGerenciadora}`
		setImportingId(key)
		importArp(
			{
				ataId,
				unitId,
				arpData: {
					numeroAta: item.numeroAta,
					anoAta: item.anoAta,
					uasgGerenciadora: item.uasgGerenciadora,
					nomeUasgGerenciadora: item.nomeUasgGerenciadora,
					objeto: item.objeto,
					dataVigenciaIni: item.dataVigenciaIni,
					dataVigenciaFim: item.dataVigenciaFim,
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
				<Button onClick={handleSearch} disabled={!uasg.trim() || isSearching} className="self-end gap-2">
					{isSearching ? <Spinner className="h-4 w-4" /> : <Search className="h-4 w-4" />}
					Buscar
				</Button>

				{/* Resultados */}
				{searchResult && (
					<div className="flex-1 overflow-y-auto space-y-2 min-h-0">
						{results.length === 0 ? (
							<p className="text-sm text-muted-foreground text-center py-6">Nenhuma ARP encontrada com os critérios informados.</p>
						) : (
							results.map((item) => {
								const key = `${item.numeroAta}-${item.uasgGerenciadora}`
								const status = vigenciaStatus(item.dataVigenciaFim)
								const isThis = importingId === key
								return (
									<div key={key} className="border rounded-lg p-4 flex items-start justify-between gap-4 hover:bg-muted/50 transition-colors">
										<div className="space-y-1 min-w-0">
											<div className="flex items-center gap-2 flex-wrap">
												<span className="font-semibold text-sm">
													ARP {item.numeroAta}/{item.anoAta}
												</span>
												<span className="text-xs text-muted-foreground">UASG {item.uasgGerenciadora}</span>
												<Badge variant={status === "ativa" ? "default" : status === "vencida" ? "destructive" : "secondary"} className="text-xs">
													{status === "ativa" ? "Ativa" : status === "vencida" ? "Vencida" : "Vigência desconhecida"}
												</Badge>
											</div>
											{item.nomeUasgGerenciadora && <p className="text-xs text-muted-foreground truncate">{item.nomeUasgGerenciadora}</p>}
											{item.objeto && <p className="text-xs text-foreground/80 line-clamp-2">{item.objeto}</p>}
											<div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
												{item.dataVigenciaIni && (
													<span>
														Vigência: {formatDate(item.dataVigenciaIni)} → {formatDate(item.dataVigenciaFim)}
													</span>
												)}
												{item.valorGlobal != null && <span>Valor global: {BRL.format(item.valorGlobal)}</span>}
											</div>
										</div>
										<Button size="sm" onClick={() => handleImport(item)} disabled={isImporting} className="shrink-0">
											{isThis && isImporting ? <Spinner className="h-4 w-4 mr-1.5" /> : null}
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
