export interface ComprasMaterialPriceResult {
	idCompra: string
	idItemCompra: number
	forma: string | null
	modalidade: number | null
	criterioJulgamento: string | null
	numeroItemCompra: number | null
	descricaoItem: string | null
	codigoItemCatalogo: number | null
	nomeUnidadeMedida: string | null
	siglaUnidadeMedida: string | null
	nomeUnidadeFornecimento: string | null
	siglaUnidadeFornecimento: string | null
	capacidadeUnidadeFornecimento: number | null
	quantidade: number | null
	precoUnitario: number | null
	percentualMaiorDesconto: number | null
	niFornecedor: string | null
	nomeFornecedor: string | null
	marca: string | null
	codigoUasg: string | null
	nomeUasg: string | null
	codigoMunicipio: number | null
	municipio: string | null
	estado: string | null
	codigoOrgao: number | null
	nomeOrgao: string | null
	dataCompra: string | null
	dataResultado: string | null
}

export interface ComprasMaterialPricePage {
	resultado: ComprasMaterialPriceResult[]
	totalRegistros: number
	totalPaginas: number
	paginasRestantes: number
	dataHoraConsulta: string | null
	timeZoneAtual: string | null
}
