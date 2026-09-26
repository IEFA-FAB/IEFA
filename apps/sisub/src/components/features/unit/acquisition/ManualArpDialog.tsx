import { Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useCreateManualArp } from "@/hooks/data/useAcquisitions"
import { normalizeDocument, parseMoneyInput } from "@/lib/expense-execution"

interface ItemDraft {
	key: number
	numeroItem: string
	descricao: string
	catmat: string
	cnpj: string
	fornecedor: string
	valorUnitario: string
	quantidade: string
	medida: string
}

const emptyItem = (key: number, numero: number): ItemDraft => ({
	key,
	numeroItem: String(numero),
	descricao: "",
	catmat: "",
	cnpj: "",
	fornecedor: "",
	valorUnitario: "",
	quantidade: "",
	medida: "",
})

/** Número digitado em pt-BR ("1.234,56"); inválido ou vazio vira `null`. */
const toNumber = (value: string): number | null => {
	const parsed = parseMoneyInput(value)
	return parsed.ok ? parsed.value : null
}

/**
 * Cadastro da ARP e dos itens à mão: a API do Compras.gov.br fora do ar, ou a ata de outro órgão
 * (carona) que não aparece na busca. Fica "não sincronizada" até a primeira importação, que
 * atualiza os itens pelo número, sem duplicar.
 */
export function ManualArpDialog({ unitId, acquisitionId, onClose }: { unitId: number; acquisitionId: string | null; onClose: () => void }) {
	const create = useCreateManualArp(unitId)
	const [numero, setNumero] = useState("")
	const [ano, setAno] = useState(String(new Date().getFullYear()))
	const [uasg, setUasg] = useState("")
	const [nomeUasg, setNomeUasg] = useState("")
	const [objeto, setObjeto] = useState("")
	const [inicio, setInicio] = useState("")
	const [fim, setFim] = useState("")
	const [items, setItems] = useState<ItemDraft[]>([emptyItem(1, 1)])

	const update = (key: number, patch: Partial<ItemDraft>) => setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)))
	const itemProblems = items.flatMap((item, index) => {
		const problems: string[] = []
		if (!item.descricao.trim()) problems.push(`item ${index + 1} sem descrição`)
		if (!((toNumber(item.quantidade) ?? 0) > 0)) problems.push(`item ${index + 1} sem quantidade`)
		if (toNumber(item.valorUnitario) == null) problems.push(`item ${index + 1} sem valor unitário`)
		if (item.cnpj.trim() && normalizeDocument(item.cnpj)?.length !== 14) problems.push(`item ${index + 1} com CNPJ inválido`)
		return problems
	})
	const headerOk = numero.trim() !== "" && /^\d{4}$/.test(ano) && /^\d{6}$/.test(uasg)
	const canSubmit = headerOk && itemProblems.length === 0 && !create.isPending

	function submit() {
		if (!canSubmit) return
		create.mutate(
			{
				acquisitionId,
				numeroAta: numero.trim(),
				anoAta: ano,
				uasgGerenciadora: uasg,
				nomeUasgGerenciadora: nomeUasg.trim() || null,
				objeto: objeto.trim() || null,
				vigenciaInicio: inicio || null,
				vigenciaFim: fim || null,
				items: items.map((item) => ({
					numeroItem: Number(item.numeroItem),
					descricaoItem: item.descricao.trim(),
					catmatItemCodigo: item.catmat.trim() ? Number(item.catmat) : null,
					niFornecedor: normalizeDocument(item.cnpj),
					nomeFornecedor: item.fornecedor.trim() || null,
					valorUnitario: toNumber(item.valorUnitario) ?? 0,
					quantidadeHomologada: toNumber(item.quantidade) ?? 0,
					medida: item.medida.trim() || null,
				})),
			},
			{ onSuccess: onClose }
		)
	}

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
				<DialogHeader>
					<DialogTitle>Cadastrar ARP à mão</DialogTitle>
					<DialogDescription>
						Para quando a busca no Compras.gov.br não responde ou a ata é de outro órgão. A ARP fica "não sincronizada" até a primeira importação, que atualiza
						os itens pelo número.
					</DialogDescription>
				</DialogHeader>
				<FieldGroup>
					<div className="grid gap-4 sm:grid-cols-4">
						<Field>
							<FieldLabel htmlFor="marp-numero">Número da ata</FieldLabel>
							<Input id="marp-numero" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="00012" />
						</Field>
						<Field>
							<FieldLabel htmlFor="marp-ano">Ano</FieldLabel>
							<Input id="marp-ano" inputMode="numeric" maxLength={4} value={ano} onChange={(e) => setAno(e.target.value.replace(/\D/g, ""))} />
						</Field>
						<Field>
							<FieldLabel htmlFor="marp-uasg">UASG gerenciadora</FieldLabel>
							<Input id="marp-uasg" inputMode="numeric" maxLength={6} value={uasg} onChange={(e) => setUasg(e.target.value.replace(/\D/g, ""))} />
						</Field>
						<Field>
							<FieldLabel htmlFor="marp-nome">Órgão gerenciador</FieldLabel>
							<Input id="marp-nome" value={nomeUasg} onChange={(e) => setNomeUasg(e.target.value)} placeholder="Opcional" />
						</Field>
					</div>
					<div className="grid gap-4 sm:grid-cols-[1fr_10rem_10rem]">
						<Field>
							<FieldLabel htmlFor="marp-objeto">Objeto</FieldLabel>
							<Input id="marp-objeto" value={objeto} onChange={(e) => setObjeto(e.target.value)} />
						</Field>
						<Field>
							<FieldLabel htmlFor="marp-inicio">Vigência — início</FieldLabel>
							<Input id="marp-inicio" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
						</Field>
						<Field>
							<FieldLabel htmlFor="marp-fim">Vigência — fim</FieldLabel>
							<Input id="marp-fim" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
						</Field>
					</div>
				</FieldGroup>

				<div className="rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-16">Item</TableHead>
								<TableHead>Descrição</TableHead>
								<TableHead className="w-24">CATMAT</TableHead>
								<TableHead className="w-36">CNPJ</TableHead>
								<TableHead className="w-40">Fornecedor</TableHead>
								<TableHead className="w-28">Valor unit.</TableHead>
								<TableHead className="w-24">Qtd.</TableHead>
								<TableHead className="w-20">Unid.</TableHead>
								<TableHead className="w-10" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{items.map((item) => (
								<TableRow key={item.key}>
									<TableCell>
										<Input
											aria-label="Número do item"
											inputMode="numeric"
											value={item.numeroItem}
											onChange={(e) => update(item.key, { numeroItem: e.target.value.replace(/\D/g, "") })}
										/>
									</TableCell>
									<TableCell>
										<Input aria-label="Descrição" value={item.descricao} onChange={(e) => update(item.key, { descricao: e.target.value })} />
									</TableCell>
									<TableCell>
										<Input
											aria-label="CATMAT"
											inputMode="numeric"
											value={item.catmat}
											onChange={(e) => update(item.key, { catmat: e.target.value.replace(/\D/g, "") })}
										/>
									</TableCell>
									<TableCell>
										<Input aria-label="CNPJ do fornecedor" inputMode="numeric" value={item.cnpj} onChange={(e) => update(item.key, { cnpj: e.target.value })} />
									</TableCell>
									<TableCell>
										<Input aria-label="Fornecedor" value={item.fornecedor} onChange={(e) => update(item.key, { fornecedor: e.target.value })} />
									</TableCell>
									<TableCell>
										<Input
											aria-label="Valor unitário"
											inputMode="decimal"
											value={item.valorUnitario}
											onChange={(e) => update(item.key, { valorUnitario: e.target.value })}
										/>
									</TableCell>
									<TableCell>
										<Input
											aria-label="Quantidade registrada"
											inputMode="decimal"
											value={item.quantidade}
											onChange={(e) => update(item.key, { quantidade: e.target.value })}
										/>
									</TableCell>
									<TableCell>
										<Input aria-label="Unidade" value={item.medida} onChange={(e) => update(item.key, { medida: e.target.value })} placeholder="KG" />
									</TableCell>
									<TableCell>
										<Button
											variant="ghost"
											size="icon-sm"
											aria-label="Remover item"
											disabled={items.length === 1}
											onClick={() => setItems((current) => current.filter((row) => row.key !== item.key))}
										>
											<Trash2 className="size-4" aria-hidden="true" />
										</Button>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
				<div className="flex items-center justify-between gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() =>
							setItems((current) => {
								const nextKey = Math.max(...current.map((row) => row.key)) + 1
								const nextNumber = Math.max(0, ...current.map((row) => Number(row.numeroItem) || 0)) + 1
								return [...current, emptyItem(nextKey, nextNumber)]
							})
						}
					>
						<Plus className="size-4" aria-hidden="true" />
						Adicionar item
					</Button>
					{itemProblems.length > 0 && <FieldDescription>Falta: {itemProblems.slice(0, 3).join(", ")}</FieldDescription>}
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancelar
					</Button>
					<Button onClick={submit} disabled={!canSubmit}>
						{create.isPending ? "Cadastrando…" : "Cadastrar ARP"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
