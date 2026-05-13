// ─── Resposta bruta da API 6.1 consultarMaterial ─────────────────────────────
// Campos em português: nomes originais do sistema externo Compras.gov.br

export interface ComprasMaterialPrecoItem {
	idCompra: string
	idItemCompra: number
	forma: string | null
	modalidade: number | null
	criterioJulgamento: string | null
	numeroItemCompra: number | null
	descricaoItem: string
	codigoItemCatalogo: number
	nomeUnidadeMedida: string | null
	siglaUnidadeMedida: string | null
	nomeUnidadeFornecimento: string | null
	siglaUnidadeFornecimento: string | null
	capacidadeUnidadeFornecimento: number | null
	quantidade: number | null
	precoUnitario: number
	percentualMaiorDesconto: number | null
	niFornecedor: string | null
	nomeFornecedor: string | null
	marca: string | null
	codigoUasg: string
	nomeUasg: string | null
	codigoMunicipio: number | null
	municipio: string | null
	estado: string | null
	codigoOrgao: number | null
	nomeOrgao: string | null
	poder: string | null
	esfera: string | null
	dataCompra: string | null
	dataHoraAtualizacaoCompra: string | null
	dataHoraAtualizacaoItem: string | null
	dataResultado: string | null
	dataHoraAtualizacaoUasg: string | null
	codigoClasse: number | null
	nomeClasse: string | null
}

export interface ComprasMaterialPrecoPage {
	resultado: ComprasMaterialPrecoItem[]
	totalRegistros: number
	totalPaginas: number
	paginasRestantes: number
	dataHoraConsulta: string
	timeZoneAtual: string
}

// ─── Amostra de preço normalizada ────────────────────────────────────────────

export interface AmostraPreco {
	// Campos externos (nomes do Compras.gov.br)
	idCompra: string
	idItemCompra: number
	descricaoItem: string
	/** precoUnitario original da API — preço por unidade de fornecimento */
	precoUnitario: number
	capacidadeUnidadeFornecimento: number
	siglaUnidadeFornecimento: string | null
	siglaUnidadeMedida: string | null
	quantidade: number | null
	codigoUasg: string
	nomeUasg: string | null
	municipio: string | null
	estado: string | null
	esfera: string | null
	marca: string | null

	// Campos internos (inglês)
	/** precoUnitario / capacidadeUnidadeFornecimento — cálculo interno para comparação homogênea */
	normalizedPrice: number
	/** dataResultado se disponível, senão dataCompra — derivado internamente */
	referenceDate: string | null
	/** Recall de tokens vs descrição CATMAT — score calculado internamente (0–1) */
	similarity: number
}

// ─── Resultado da análise estatística (tudo interno) ─────────────────────────

export interface PriceStatistics {
	min: number
	max: number
	mean: number
	median: number
	stdDev: number
	/** Coeficiente de variação em % — indica dispersão do mercado */
	cv: number
	/** Número de UASGs distintas — diversidade de fontes */
	uniqueSources: number
}

// ─── Conformidade Lei 14.133 / IN SEGES 65/2021 (tudo interno) ───────────────

export interface LegalCompliance {
	compliant: boolean
	validSamples: number
	uniqueSources: number
	nonComplianceReasons: string[]
}

// ─── Análise completa de um item CATMAT (tudo interno) ───────────────────────

export interface PriceAnalysis {
	// Identificadores externos (nomes do catálogo CATMAT)
	catmatCodigo: number
	catmatDescricao: string | null

	// Parâmetros internos da pesquisa
	params: {
		months: number
		similarityThreshold: number
		// Filtros opcionais — valores referenciam campos externos da API
		estado?: string
		codigoUasg?: string
		codigoMunicipio?: number
	}

	// Funil de filtragem (interno)
	counts: {
		/** Total de registros retornados pela API */
		raw: number
		/** Após filtro de data e preço > 0 */
		afterDateFilter: number
		/** Após remoção de poluição CATMAT */
		afterPollutionFilter: number
		/** Após remoção de outliers (IQR) */
		afterOutlierRemoval: number
	}

	/** null quando não há amostras válidas */
	statistics: PriceStatistics | null
	compliance: LegalCompliance

	/**
	 * Preço de referência recomendado = mediana das amostras válidas.
	 * Conforme IN SEGES 65/2021, Art. 5º.
	 */
	referencePrice: number | null
	primaryMeasureUnit: string | null

	samples: AmostraPreco[]
	outliers: AmostraPreco[]
	pollutionDiscards: AmostraPreco[]

	consultedAt: string
}

// ─── Item de ATA com análise de preço (tudo interno) ─────────────────────────

export interface AtaItemPriceResult {
	ataItemId: string
	ingredientId: string | null
	ingredientName: string
	// Identificadores externos do catálogo
	catmatCodigo: number | null
	catmatDescricao: string | null
	// Resultado interno
	analysis: PriceAnalysis | null
	error: string | null
}
