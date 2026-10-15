import { describe, expect, it } from "vitest"
import {
	buildImportedArpItemRow,
	buildImportedArpRow,
	buildManualArpItemRow,
	buildManualArpRow,
	computeArpExecutionByItem,
	describeKeptStaleItems,
	formatNumeroAtaFromInput,
	hasDuplicateItemNumbers,
	hasItemProportion,
	indexArpItemsByNumero,
	indexQuantityEstimateItemsByCatmat,
	listStaleArpItemIds,
	planArpItemReconciliation,
	readItemTotalsByEmpenho,
	resolveArpLinks,
	resolveImportedSaldo,
	splitDeletableArpItems,
	sumItemValuesByEmpenho,
} from "@/lib/arp-import"
import type { ComprasArpItemResult } from "@/types/domain/arp"

describe("resolveArpLinks", () => {
	const base = { numeroAta: "00002/2025" }

	it("ARP nova: usa o que foi pedido, sem aviso", () => {
		expect(resolveArpLinks({ ...base, requestedQuantityEstimateId: "qe", requestedAcquisitionId: "acq", existing: null })).toEqual({
			quantityEstimateId: "qe",
			acquisitionId: "acq",
			warnings: [],
		})
	})

	it("nada pedido e nada gravado: nulos", () => {
		expect(resolveArpLinks({ ...base, requestedQuantityEstimateId: undefined, requestedAcquisitionId: null, existing: null })).toEqual({
			quantityEstimateId: null,
			acquisitionId: null,
			warnings: [],
		})
	})

	it("nada pedido: mantém o vínculo gravado, sem aviso", () => {
		expect(
			resolveArpLinks({
				...base,
				requestedQuantityEstimateId: null,
				requestedAcquisitionId: undefined,
				existing: { quantity_estimate_id: "qe0", acquisition_id: "acq0" },
			})
		).toEqual({ quantityEstimateId: "qe0", acquisitionId: "acq0", warnings: [] })
	})

	it("pedido igual ao gravado: sem aviso", () => {
		expect(
			resolveArpLinks({
				...base,
				requestedQuantityEstimateId: "qe0",
				requestedAcquisitionId: "acq0",
				existing: { quantity_estimate_id: "qe0", acquisition_id: "acq0" },
			})
		).toEqual({ quantityEstimateId: "qe0", acquisitionId: "acq0", warnings: [] })
	})

	it("gravado sem vínculo: o pedido entra, sem aviso", () => {
		expect(
			resolveArpLinks({
				...base,
				requestedQuantityEstimateId: "qe",
				requestedAcquisitionId: "acq",
				existing: { quantity_estimate_id: null, acquisition_id: null },
			})
		).toEqual({ quantityEstimateId: "qe", acquisitionId: "acq", warnings: [] })
	})

	it("conflito nos dois: mantém os gravados e avisa anexo antes de contratação", () => {
		expect(
			resolveArpLinks({
				...base,
				requestedQuantityEstimateId: "qe",
				requestedAcquisitionId: "acq",
				existing: { quantity_estimate_id: "qe0", acquisition_id: "acq0" },
			})
		).toEqual({
			quantityEstimateId: "qe0",
			acquisitionId: "acq0",
			warnings: [
				"A ARP 00002/2025 já está vinculada a outro anexo quantitativo; o vínculo existente foi mantido",
				"A ARP 00002/2025 já está vinculada a outra contratação de origem; o vínculo existente foi mantido",
			],
		})
	})

	it("conflito só na contratação", () => {
		const result = resolveArpLinks({
			...base,
			requestedQuantityEstimateId: "qe0",
			requestedAcquisitionId: "acq",
			existing: { quantity_estimate_id: "qe0", acquisition_id: "acq0" },
		})
		expect(result.acquisitionId).toBe("acq0")
		expect(result.warnings).toEqual(["A ARP 00002/2025 já está vinculada a outra contratação de origem; o vínculo existente foi mantido"])
	})
})

describe("indexQuantityEstimateItemsByCatmat", () => {
	it("indexa por catmat; sem catmat fica de fora; medida só quando há", () => {
		const index = indexQuantityEstimateItemsByCatmat([
			{ id: "a", catmat_item_codigo: 1, measure_unit: "KG" },
			{ id: "b", catmat_item_codigo: 2, measure_unit: null },
			{ id: "c", catmat_item_codigo: null, measure_unit: "UN" },
			{ id: "d", catmat_item_codigo: 3, measure_unit: "" },
		])
		expect([...index.catmatToQuantityEstimateItemId]).toEqual([
			[1, "a"],
			[2, "b"],
			[3, "d"],
		])
		expect([...index.catmatToMeasureUnit]).toEqual([[1, "KG"]])
	})

	it("catmat repetido: o último vence", () => {
		const index = indexQuantityEstimateItemsByCatmat([
			{ id: "a", catmat_item_codigo: 1, measure_unit: "KG" },
			{ id: "b", catmat_item_codigo: 1, measure_unit: "G" },
		])
		expect(index.catmatToQuantityEstimateItemId.get(1)).toBe("b")
		expect(index.catmatToMeasureUnit.get(1)).toBe("G")
	})
})

describe("buildImportedArpRow", () => {
	const ctx = { unitId: 7, quantityEstimateId: "qe", acquisitionId: null, dataVigenciaInicial: "2025-01-10", lastSyncedAt: "2026-10-13T12:00:00.000Z" }

	it("grava o cabeçalho da API como compras_gov, com ano e fim de vigência normalizados", () => {
		expect(
			buildImportedArpRow(
				{
					numeroAtaRegistroPreco: "00002/2025",
					codigoUnidadeGerenciadora: "120001",
					nomeUnidadeGerenciadora: "GAP-SJ",
					objeto: "Gêneros",
					dataVigenciaFinal: "09/01/2026",
					statusAta: "Vigente",
				},
				ctx
			)
		).toEqual({
			unit_id: 7,
			quantity_estimate_id: "qe",
			acquisition_id: null,
			source: "compras_gov",
			numero_ata: "00002/2025",
			ano_ata: "2025",
			uasg_gerenciadora: "120001",
			nome_uasg_gerenciadora: "GAP-SJ",
			objeto: "Gêneros",
			data_vigencia_inicio: "2025-01-10",
			data_vigencia_fim: "2026-01-09",
			status_ata: "Vigente",
			last_synced_at: "2026-10-13T12:00:00.000Z",
		})
	})

	it("campos ausentes viram null", () => {
		const row = buildImportedArpRow(
			{
				numeroAtaRegistroPreco: "00002",
				codigoUnidadeGerenciadora: "1",
				nomeUnidadeGerenciadora: null,
				objeto: null,
				dataVigenciaFinal: null,
				statusAta: null,
			},
			ctx
		)
		expect(row).toMatchObject({ ano_ata: null, nome_uasg_gerenciadora: null, objeto: null, data_vigencia_fim: null, status_ata: null })
	})
})

describe("resolveImportedSaldo", () => {
	it("item fora do endpoint 4: nada empenhado e saldo cheio", () => {
		expect(resolveImportedSaldo(undefined, 100)).toEqual({ quantidade_empenhada: 0, saldo_empenho: 100 })
	})

	it("item fora do endpoint 4 sem homologada: saldo null", () => {
		expect(resolveImportedSaldo(undefined, null)).toEqual({ quantidade_empenhada: 0, saldo_empenho: null })
		expect(resolveImportedSaldo(undefined, undefined)).toEqual({ quantidade_empenhada: 0, saldo_empenho: null })
	})

	it("linha presente manda no valor, inclusive saldo zero e saldo null", () => {
		expect(resolveImportedSaldo({ quantidadeEmpenhada: 100, saldoEmpenho: 0 }, 100)).toEqual({ quantidade_empenhada: 100, saldo_empenho: 0 })
		expect(resolveImportedSaldo({ quantidadeEmpenhada: 3, saldoEmpenho: null }, 100)).toEqual({ quantidade_empenhada: 3, saldo_empenho: null })
	})
})

describe("buildImportedArpItemRow", () => {
	const catmat = indexQuantityEstimateItemsByCatmat([{ id: "qei", catmat_item_codigo: 555, measure_unit: "KG" }])
	const saldos = new Map([[17, { quantidadeEmpenhada: 40, saldoEmpenho: 60 }]])
	const ctx = { arpId: "arp", saldos, catmat, syncedAt: "2026-10-13T12:00:00.000Z" }

	it("casa com o anexo pelo catmat e usa o saldo do endpoint 4", () => {
		const item = {
			numeroItem: "00017",
			codigoItem: 555,
			descricaoItem: "Arroz",
			niFornecedor: "12345678000190",
			nomeRazaoSocialFornecedor: "Fornecedor",
			valorUnitario: 5.5,
			quantidadeHomologadaItem: 100,
		} as ComprasArpItemResult
		expect(buildImportedArpItemRow(item, ctx)).toEqual({
			arp_id: "arp",
			quantity_estimate_item_id: "qei",
			numero_item: 17,
			catmat_item_codigo: 555,
			descricao_item: "Arroz",
			ni_fornecedor: "12345678000190",
			nome_fornecedor: "Fornecedor",
			valor_unitario: 5.5,
			quantidade_homologada: 100,
			medida_catmat: "KG",
			quantidade_empenhada: 40,
			saldo_empenho: 60,
			source: "compras_gov",
			synced_at: "2026-10-13T12:00:00.000Z",
		})
	})

	it("catmat que não casa e item sem número: nulos e saldo cheio", () => {
		const item = { numeroItem: undefined, codigoItem: 999, quantidadeHomologadaItem: 10 } as ComprasArpItemResult
		expect(buildImportedArpItemRow(item, ctx)).toMatchObject({
			quantity_estimate_item_id: null,
			numero_item: null,
			medida_catmat: null,
			descricao_item: null,
			ni_fornecedor: null,
			nome_fornecedor: null,
			valor_unitario: null,
			quantidade_empenhada: 0,
			saldo_empenho: 10,
		})
	})

	it("sem catmat: nem anexo nem medida", () => {
		const item = { numeroItem: "00018" } as ComprasArpItemResult
		expect(buildImportedArpItemRow(item, ctx)).toMatchObject({
			quantity_estimate_item_id: null,
			catmat_item_codigo: null,
			medida_catmat: null,
			numero_item: 18,
			quantidade_homologada: null,
			saldo_empenho: null,
		})
	})
})

describe("reconciliação por número do item", () => {
	it("indexArpItemsByNumero ignora item sem número", () => {
		expect([
			...indexArpItemsByNumero([
				{ id: "a", numero_item: 1 },
				{ id: "b", numero_item: null },
			]),
		]).toEqual([[1, "a"]])
	})

	it("planArpItemReconciliation separa atualização e inserção, na ordem da API", () => {
		const byNumero = new Map([
			[1, "id1"],
			[2, "id2"],
		])
		const items = [{ numeroItem: "00002" }, { numeroItem: "00003" }, { numeroItem: null }, { numeroItem: "00001" }, { numeroItem: "abc" }]
		const plan = planArpItemReconciliation(items, byNumero)
		expect(plan.updates).toEqual([
			{ id: "id2", item: items[0] },
			{ id: "id1", item: items[3] },
		])
		expect(plan.newItems).toEqual([items[1], items[2], items[4]])
		expect([...plan.matchedIds]).toEqual(["id2", "id1"])
	})

	it("dois itens da API com o mesmo número atualizam o mesmo id duas vezes", () => {
		const plan = planArpItemReconciliation([{ numeroItem: "1" }, { numeroItem: "01" }], new Map([[1, "id1"]]))
		expect(plan.updates.map((u) => u.id)).toEqual(["id1", "id1"])
		expect(plan.newItems).toEqual([])
	})

	it("listStaleArpItemIds devolve os gravados que não casaram, na ordem da leitura", () => {
		expect(listStaleArpItemIds([{ id: "a" }, { id: "b" }, { id: "c" }], new Set(["b"]))).toEqual(["a", "c"])
	})

	it("splitDeletableArpItems mantém os que têm empenho", () => {
		expect(splitDeletableArpItems(["a", "b", "c"], new Set<string | null>(["b", null]))).toEqual({ deletableIds: ["a", "c"], kept: 1 })
		expect(splitDeletableArpItems([], new Set())).toEqual({ deletableIds: [], kept: 0 })
	})

	it("describeKeptStaleItems só avisa quando sobrou item", () => {
		expect(describeKeptStaleItems(0)).toBeNull()
		expect(describeKeptStaleItems(2)).toBe("2 item(ns) que saíram da ARP no Compras.gov.br continuam aqui porque têm empenho")
	})
})

describe("cadastro manual", () => {
	it("hasDuplicateItemNumbers", () => {
		expect(hasDuplicateItemNumbers([{ numeroItem: 1 }, { numeroItem: 2 }])).toBe(false)
		expect(hasDuplicateItemNumbers([{ numeroItem: 1 }, { numeroItem: 1 }])).toBe(true)
	})

	it("formatNumeroAtaFromInput aceita número com ou sem ano", () => {
		expect(formatNumeroAtaFromInput("2/2024", "2025")).toBe("00002/2025")
		expect(formatNumeroAtaFromInput("2", "2025")).toBe("00002/2025")
		expect(formatNumeroAtaFromInput("/2025", "2025")).toBe("00000/2025")
	})

	it("buildManualArpRow apara textos e anula vazios", () => {
		expect(
			buildManualArpRow(
				{ unitId: 3, numeroAta: "2", anoAta: "2025", uasgGerenciadora: "120001", nomeUasgGerenciadora: "  GAP  ", objeto: "   ", vigenciaInicio: "2025-01-01" },
				"00002/2025"
			)
		).toEqual({
			unit_id: 3,
			quantity_estimate_id: null,
			acquisition_id: null,
			numero_ata: "00002/2025",
			ano_ata: "2025",
			uasg_gerenciadora: "120001",
			nome_uasg_gerenciadora: "GAP",
			objeto: null,
			data_vigencia_inicio: "2025-01-01",
			data_vigencia_fim: null,
			source: "manual",
			last_synced_at: null,
		})
	})

	it("buildManualArpRow com vínculos e fim de vigência", () => {
		expect(
			buildManualArpRow(
				{
					unitId: 3,
					numeroAta: "2",
					anoAta: "2025",
					uasgGerenciadora: "1",
					quantityEstimateId: "qe",
					acquisitionId: "acq",
					objeto: "Obj",
					vigenciaFim: "2026-01-01",
				},
				"x"
			)
		).toMatchObject({ quantity_estimate_id: "qe", acquisition_id: "acq", objeto: "Obj", nome_uasg_gerenciadora: null, data_vigencia_fim: "2026-01-01" })
	})

	it("buildManualArpItemRow nasce com saldo cheio", () => {
		expect(
			buildManualArpItemRow("arp", {
				numeroItem: 1,
				descricaoItem: "Feijão",
				catmatItemCodigo: 10,
				niFornecedor: "12345678000190",
				nomeFornecedor: " Forn ",
				valorUnitario: 7,
				quantidadeHomologada: 50,
				medida: " KG ",
			})
		).toEqual({
			arp_id: "arp",
			numero_item: 1,
			descricao_item: "Feijão",
			catmat_item_codigo: 10,
			ni_fornecedor: "12345678000190",
			nome_fornecedor: "Forn",
			valor_unitario: 7,
			quantidade_homologada: 50,
			quantidade_empenhada: 0,
			saldo_empenho: 50,
			medida_catmat: "KG",
			source: "manual",
		})
		expect(buildManualArpItemRow("arp", { numeroItem: 2, descricaoItem: "X", valorUnitario: 0, quantidadeHomologada: 1, nomeFornecedor: "  " })).toMatchObject({
			catmat_item_codigo: null,
			ni_fornecedor: null,
			nome_fornecedor: null,
			medida_catmat: null,
		})
	})
})

describe("hasItemProportion / sumItemValuesByEmpenho", () => {
	it("soma por NE e só há proporção com total positivo", () => {
		const totals = sumItemValuesByEmpenho([
			{ empenho_id: "a", value: "10" },
			{ empenho_id: "a", value: 5 },
			{ empenho_id: "b", value: 0 },
			{ empenho_id: "c", value: null },
		])
		expect(Object.fromEntries(totals)).toEqual({ a: 15, b: 0, c: 0 })
		expect(hasItemProportion(totals.get("a"))).toBe(true)
		expect(hasItemProportion(totals.get("b"))).toBe(false)
		expect(hasItemProportion(totals.get("c"))).toBe(false)
		expect(hasItemProportion(undefined)).toBe(false)
		expect(hasItemProportion(-1)).toBe(false)
	})
})

describe("readItemTotalsByEmpenho", () => {
	/** `empenho_item` falso com o teto do PostgREST: `.in()`, `.gt("id")`, `.order("id")`, `.limit()`. */
	function itemTable(itemsPerEmpenho: number, empenhoCount: number, maxRows = 1000) {
		const rows = Array.from({ length: empenhoCount * itemsPerEmpenho }, (_, i) => ({
			id: `item-${String(i).padStart(6, "0")}`,
			empenho_id: `ne-${String(i % empenhoCount).padStart(4, "0")}`,
			value: 1,
		}))
		const chunks: number[] = []
		const page = async (chunk: string[], after: string | null, pageSize: number) => {
			if (after === null) chunks.push(chunk.length)
			const data = rows.filter((row) => chunk.includes(row.empenho_id) && (after === null || row.id > after)).slice(0, Math.min(pageSize, maxRows))
			return { data, error: null }
		}
		const ids = Array.from({ length: empenhoCount }, (_, i) => `ne-${String(i).padStart(4, "0")}`)
		return { ids, page, chunks }
	}

	it("lê além do teto de 1000 linhas: nenhuma NE fica sem total (o badge falso)", async () => {
		// 15 NEs de 80 itens = 1200 linhas; lida de uma vez, o corte deixava NEs sem linha nenhuma
		const { ids, page } = itemTable(80, 15)
		const totals = await readItemTotalsByEmpenho(ids, page)
		expect(totals.size).toBe(15)
		for (const id of ids) {
			expect(totals.get(id), id).toBe(80)
			expect(hasItemProportion(totals.get(id))).toBe(true)
		}
	})

	it("fatia os ids do .in() e não consulta com lista vazia", async () => {
		const { ids, page, chunks } = itemTable(2, 250)
		const totals = await readItemTotalsByEmpenho([...ids, ids[0]], page)
		expect(chunks).toEqual([100, 100, 50])
		expect([...totals.values()].every((total) => total === 2)).toBe(true)
		const empty = itemTable(1, 1)
		expect((await readItemTotalsByEmpenho([], empty.page)).size).toBe(0)
		expect(empty.chunks).toEqual([])
	})
})

describe("computeArpExecutionByItem", () => {
	const saldo = (empenho_id: string, liquidado: number | null, pago: number | null, aLiquidar: number | null) => ({
		empenho_id,
		valor_liquidado: liquidado,
		valor_pago: pago,
		saldo_a_liquidar: aLiquidar,
	})

	it("reparte a execução da NE na proporção do valor de cada item", () => {
		const result = computeArpExecutionByItem({
			arpNeItems: [
				{ empenho_id: "ne1", arp_item_id: "a", value: 30 },
				{ empenho_id: "ne1", arp_item_id: "b", value: 70 },
			],
			activeIds: new Set(["ne1"]),
			allItems: [
				{ empenho_id: "ne1", value: 30 },
				{ empenho_id: "ne1", value: 70 },
			],
			saldos: [saldo("ne1", 100, 50, 0)],
		})
		expect(result.byItem.a).toEqual({ liquidado: 30, pago: 15, aLiquidar: 0 })
		expect(result.byItem.b).toEqual({ liquidado: 70, pago: 35, aLiquidar: 0 })
		expect(result.incompleteEmpenhoIds).toEqual([])
	})

	it("NE inativa, sem saldo ou item nulo ficam de fora; total zero não reparte e marca a NE incompleta", () => {
		const result = computeArpExecutionByItem({
			arpNeItems: [
				{ empenho_id: "inativa", arp_item_id: "a", value: 10 },
				{ empenho_id: "semSaldo", arp_item_id: "a", value: 10 },
				{ empenho_id: "zero", arp_item_id: null, value: 0 },
				{ empenho_id: "zero", arp_item_id: "z", value: 0 },
				{ empenho_id: "semItens", arp_item_id: "z", value: "5" },
			],
			activeIds: new Set(["semSaldo", "zero", "semItens"]),
			allItems: [{ empenho_id: "zero", value: 0 }],
			saldos: [saldo("inativa", 1, 1, 1), saldo("zero", 10, null, 4), saldo("semItens", null, 2, null)],
		})
		expect(result.byItem.a).toBeUndefined()
		// sem proporção, nem zero: o item fica sem entrada e a NE sai como incompleta
		expect(result.byItem.z).toBeUndefined()
		expect(result.incompleteEmpenhoIds).toEqual(["semItens", "zero"])
	})

	it("NE com total zero e vários itens na ata não multiplica a execução pelo número de itens", () => {
		const result = computeArpExecutionByItem({
			arpNeItems: [
				{ empenho_id: "zero", arp_item_id: "a", value: 0 },
				{ empenho_id: "zero", arp_item_id: "b", value: 0 },
				{ empenho_id: "zero", arp_item_id: "c", value: "0" },
				{ empenho_id: "ne1", arp_item_id: "a", value: 50 },
			],
			activeIds: new Set(["zero", "ne1"]),
			allItems: [
				{ empenho_id: "zero", value: 0 },
				{ empenho_id: "zero", value: 0 },
				{ empenho_id: "zero", value: "0" },
				{ empenho_id: "ne1", value: 50 },
			],
			saldos: [saldo("zero", 90, 60, 30), saldo("ne1", 20, 10, 30)],
		})
		// antes: 90 de liquidado em cada um dos três itens (270 numa NE de 90)
		expect(result.byItem.a).toEqual({ liquidado: 20, pago: 10, aLiquidar: 30 })
		expect(result.byItem.b).toBeUndefined()
		expect(result.byItem.c).toBeUndefined()
		expect(result.incompleteEmpenhoIds).toEqual(["zero"])
	})

	it("acumula duas NEs no mesmo item", () => {
		const result = computeArpExecutionByItem({
			arpNeItems: [
				{ empenho_id: "ne1", arp_item_id: "a", value: "10" },
				{ empenho_id: "ne2", arp_item_id: "a", value: 5 },
			],
			activeIds: new Set(["ne1", "ne2"]),
			allItems: [
				{ empenho_id: "ne1", value: "10" },
				{ empenho_id: "ne2", value: 10 },
			],
			saldos: [saldo("ne1", 4, 2, 6), saldo("ne2", 8, 8, 2)],
		})
		expect(result.byItem.a).toEqual({ liquidado: 8, pago: 6, aLiquidar: 7 })
	})
})
