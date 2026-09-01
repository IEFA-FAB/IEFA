import { describe, expect, test } from "bun:test"
import {
	CONSERVATION_CLASSES,
	CONSERVATION_LABELS,
	type ConservationClass,
	describeConditioning,
	isConservationClass,
	isPackageType,
	isTemperatureOutOfRange,
	meetsMinimumShelfLife,
	PACKAGE_TYPE_LABELS,
	PACKAGE_TYPES,
	parseConservationFromCatmat,
	parseTemperatureCeiling,
	requiresRefrigeratedTransport,
	TEMPERATURE_CONTROLLED,
	TEMPERATURE_VERDICTS,
	TRANSPORT_LABELS,
	TRANSPORT_REQUIREMENTS,
	temperatureDivergenceReason,
	temperatureVerdict,
} from "./conditioning.ts"

describe("vocabulário", () => {
	test("toda classe/embalagem/transporte tem rótulo — sem chave órfã nos dois sentidos", () => {
		expect(Object.keys(CONSERVATION_LABELS).sort()).toEqual([...CONSERVATION_CLASSES].sort())
		expect(Object.keys(PACKAGE_TYPE_LABELS).sort()).toEqual([...PACKAGE_TYPES].sort())
		expect(Object.keys(TRANSPORT_LABELS).sort()).toEqual([...TRANSPORT_REQUIREMENTS].sort())
	})

	test("as classes com controle de temperatura são um subconjunto real", () => {
		for (const cls of TEMPERATURE_CONTROLLED) expect(CONSERVATION_CLASSES).toContain(cls)
		expect(TEMPERATURE_CONTROLLED).not.toContain("seco" as ConservationClass)
		expect(TEMPERATURE_CONTROLLED).not.toContain("nao_aplicavel" as ConservationClass)
	})

	test("guards recusam valor fora da lista", () => {
		expect(isConservationClass("congelado")).toBe(true)
		expect(isConservationClass("CONGELADO")).toBe(false)
		expect(isConservationClass(null)).toBe(false)
		expect(isPackageType("saco_rafia")).toBe(true)
		expect(isPackageType("saco")).toBe(false)
	})
})

describe("parseConservationFromCatmat", () => {
	// Textos reais do banco de produção (procurement.purchase_item.description).
	test("lê o estado escrito pelo CATMAT, em caixa mista ou alta", () => {
		expect(parseConservationFromCatmat("Peixe In Natura Variedade: Atum  Tipo Corte: Posta  Apresentação: Com Pele  Estado De Conservação: Congelado(A)")).toBe(
			"congelado"
		)
		expect(
			parseConservationFromCatmat("PEIXE IN NATURA, VARIEDADE: ANCHOVA , TIPO CORTE: POSTA , APRESENTAÇÃO: COM PELE , ESTADO DE CONSERVAÇÃO: CONGELADO(A) ")
		).toBe("congelado")
	})

	test("resfriado e refrigerado caem na mesma classe", () => {
		expect(parseConservationFromCatmat("CARNE BOVINA, ESTADO DE CONSERVAÇÃO: RESFRIADO")).toBe("resfriado")
		expect(parseConservationFromCatmat("CARNE BOVINA, ESTADO DE CONSERVAÇÃO: REFRIGERADA")).toBe("resfriado")
	})

	test("seco e desidratado caem em seco", () => {
		expect(parseConservationFromCatmat("LEITE, ESTADO DE CONSERVAÇÃO: SECO")).toBe("seco")
		expect(parseConservationFromCatmat("CEBOLA, ESTADO DE CONSERVAÇÃO: DESIDRATADA")).toBe("seco")
	})

	test("'in natura' SOZINHO não classifica — 295 itens do catálogo dependem disso", () => {
		// in natura fala de processamento, não de temperatura: alface in natura é
		// resfriada e cebola in natura é seca. Chutar produziria centenas de linhas
		// erradas com cara de conferidas.
		expect(parseConservationFromCatmat("ALFACE IN NATURA, VARIEDADE: CRESPA")).toBeNull()
		expect(parseConservationFromCatmat("CEBOLA IN NATURA")).toBeNull()
	})

	test("estado desconhecido devolve null em vez de inventar classe", () => {
		expect(parseConservationFromCatmat("PEIXE, ESTADO DE CONSERVAÇÃO: SALGADO")).toBeNull()
	})

	test("entrada vazia é null, não exceção", () => {
		expect(parseConservationFromCatmat(null)).toBeNull()
		expect(parseConservationFromCatmat(undefined)).toBeNull()
		expect(parseConservationFromCatmat("")).toBeNull()
	})
})

describe("parseTemperatureCeiling", () => {
	test("lê o único padrão presente no dado real", () => {
		expect(parseTemperatureCeiling("Entregar em caminhão frigorífico, temperatura -12 ºC ou inferior")).toBe(-12)
	})

	test("aceita variantes de grau, espaço e vírgula decimal", () => {
		expect(parseTemperatureCeiling("máx -18°C")).toBe(-18)
		expect(parseTemperatureCeiling("temperatura - 12 ºC")).toBe(-12)
		expect(parseTemperatureCeiling("abaixo de -0,5 ºC")).toBe(-0.5)
	})

	test("não inventa teto onde não há número negativo", () => {
		expect(parseTemperatureCeiling("Entregar refrigerado")).toBeNull()
		expect(parseTemperatureCeiling("temperatura ambiente")).toBeNull()
		expect(parseTemperatureCeiling(null)).toBeNull()
	})
})

describe("requiresRefrigeratedTransport", () => {
	test("reconhece o texto real, com e sem acento", () => {
		expect(requiresRefrigeratedTransport("Entregar em caminhão frigorífico, temperatura -12 ºC ou inferior")).toBe(true)
		expect(requiresRefrigeratedTransport("veiculo frigorifico")).toBe(true)
		expect(requiresRefrigeratedTransport("transporte refrigerado")).toBe(true)
	})

	test("entrega comum não exige frio", () => {
		expect(requiresRefrigeratedTransport("Entregar em carro comum")).toBe(false)
		expect(requiresRefrigeratedTransport(null)).toBe(false)
	})
})

describe("temperatureVerdict", () => {
	const congelado = { minC: null, maxC: -12 }

	test("dentro da faixa aberta à esquerda", () => {
		expect(temperatureVerdict(-18, congelado)).toBe("dentro")
		expect(temperatureVerdict(-12, congelado)).toBe("dentro")
	})

	test("acima do teto reprova", () => {
		expect(temperatureVerdict(-5, congelado)).toBe("acima")
	})

	test("faixa fechada dos dois lados", () => {
		const resfriado = { minC: 0, maxC: 4 }
		expect(temperatureVerdict(2, resfriado)).toBe("dentro")
		expect(temperatureVerdict(6, resfriado)).toBe("acima")
		expect(temperatureVerdict(-1, resfriado)).toBe("abaixo")
	})

	test("não medido e sem faixa são resultados DISTINTOS, e nenhum reprova", () => {
		// Cozinha sem termômetro (não mediu) é diferente de especificação sem
		// faixa (não há o que comparar). Colapsar os dois em "ok" esconde a
		// lacuna; colapsar em "fora" trava o recebimento por falta de cadastro.
		expect(temperatureVerdict(null, congelado)).toBe("nao_medido")
		expect(temperatureVerdict(undefined, congelado)).toBe("nao_medido")
		expect(temperatureVerdict(-18, { minC: null, maxC: null })).toBe("sem_faixa")
		expect(isTemperatureOutOfRange("nao_medido")).toBe(false)
		expect(isTemperatureOutOfRange("sem_faixa")).toBe(false)
	})

	test("NaN é ausência de medida, não medida inválida silenciosa", () => {
		expect(temperatureVerdict(Number.NaN, congelado)).toBe("nao_medido")
	})

	test("exatamente um veredito reprova de cada lado, e só esses", () => {
		expect(TEMPERATURE_VERDICTS.filter(isTemperatureOutOfRange)).toEqual(["acima", "abaixo"])
	})
})

describe("temperatureDivergenceReason", () => {
	test("cita o aferido e o limite exigido — é o texto do termo de recebimento", () => {
		expect(temperatureDivergenceReason(-5, { minC: null, maxC: -12 })).toBe("Temperatura aferida -5 °C fora da faixa exigida (máxima -12 °C).")
		expect(temperatureDivergenceReason(6, { minC: 0, maxC: 4 })).toBe("Temperatura aferida 6 °C fora da faixa exigida (mínima 0 °C, máxima 4 °C).")
	})
})

describe("describeConditioning", () => {
	test("monta o resumo na ordem em que o conferente lê", () => {
		expect(
			describeConditioning({
				conservationClass: "congelado",
				storageTempMaxC: -12,
				storageTempMinC: null,
				packageType: "vacuo",
				packageNetContent: 5,
				packageNetContentUnit: "KG",
				transportRequirement: "congelado",
				minShelfLifeDaysOnDelivery: 180,
			})
		).toBe("Congelado · -12 °C ou inferior · Vácuo · 5 KG · transporte congelado (frigorífico) · validade mínima 180 d na entrega")
	})

	test("faixa fechada aparece como intervalo", () => {
		expect(describeConditioning({ conservationClass: "resfriado", storageTempMinC: 0, storageTempMaxC: 4 })).toBe("Resfriado · 0 °C a 4 °C")
	})

	test("transporte ambiente não polui o resumo", () => {
		expect(describeConditioning({ conservationClass: "seco", transportRequirement: "ambiente" })).toBe("Seco")
	})

	test("especificação vazia é string vazia, não 'undefined'", () => {
		expect(describeConditioning({})).toBe("")
	})

	test("conteúdo sem unidade não é exibido pela metade", () => {
		expect(describeConditioning({ packageNetContent: 5, packageNetContentUnit: null })).toBe("")
	})
})

describe("meetsMinimumShelfLife", () => {
	test("compara validade remanescente com a exigência do edital", () => {
		expect(meetsMinimumShelfLife("2027-03-01", "2026-09-01", 180)).toBe(true)
		expect(meetsMinimumShelfLife("2026-10-01", "2026-09-01", 180)).toBe(false)
	})

	test("sem exigência ou sem validade não reprova", () => {
		expect(meetsMinimumShelfLife("2026-09-02", "2026-09-01", null)).toBe(true)
		expect(meetsMinimumShelfLife(null, "2026-09-01", 180)).toBe(true)
	})

	test("data ilegível não reprova — reprovar por parse seria recusar carga por bug", () => {
		expect(meetsMinimumShelfLife("31/12/2026", "2026-09-01", 180)).toBe(true)
	})
})
