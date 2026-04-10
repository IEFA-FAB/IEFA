// Envelope de paginação retornado por todos os endpoints da API Compras
export interface ComprasPage<T> {
	resultado: T[]
	totalRegistros: number
	totalPaginas: number
	paginasRestantes: number
}

// ─── Módulo Material ──────────────────────────────────────────────────────────

export interface ComprasGrupoMaterial {
	codigoGrupo: number
	nomeGrupo: string
	statusGrupo: boolean
	dataHoraAtualizacao?: string | null
}

export interface ComprasClasseMaterial {
	codigoClasse: number
	codigoGrupo: number
	nomeClasse: string
	statusClasse: boolean
	dataHoraAtualizacao?: string | null
}

export interface ComprasPdmMaterial {
	codigoPdm: number
	codigoClasse: number
	nomePdm: string
	statusPdm: boolean
	dataHoraAtualizacao?: string | null
}

export interface ComprasItemMaterial {
	codigoItem: number
	codigoPdm?: number | null
	descricaoItem: string
	statusItem: boolean
	itemSustentavel?: boolean | null
	codigoNcm?: string | null
	codigo_ncm?: string | null
	descricaoNcm?: string | null
	descricao_ncm?: string | null
	aplicaMargemPreferencia?: boolean | null
	aplica_margem_preferencia?: boolean | null
	dataHoraAtualizacao?: string | null
}

export interface ComprasNaturezaDespesaMaterial {
	codigoPdm: number
	codigoNaturezaDespesa: string
	nomeNaturezaDespesa: string
	statusNaturezaDespesa: boolean
}

export interface ComprasUnidadeFornecimento {
	codigoPdm: number
	numeroSequencialUnidadeFornecimento?: number | null
	siglaUnidadeFornecimento?: string | null
	nomeUnidadeFornecimento?: string | null
	descricaoUnidadeFornecimento?: string | null
	siglaUnidadeMedida?: string | null
	capacidadeUnidadeFornecimento?: number | string | null
	statusUnidadeFornecimentoPdm: boolean
	dataHoraAtualizacao?: string | null
}

export interface ComprasCaracteristicaMaterial {
	codigoItem: number
	codigoCaracteristica: string
	nomeCaracteristica: string
	statusCaracteristica: boolean
	codigoValorCaracteristica?: string | null
	nomeValorCaracteristica?: string | null
	statusValorCaracteristica?: boolean | null
	numeroCaracteristica?: number | null
	siglaUnidadeMedida?: string | null
	dataHoraAtualizacao?: string | null
}

// ─── Módulo Serviço ───────────────────────────────────────────────────────────

export interface ComprasSecaoServico {
	codigoSecao: number
	nomeSecao: string
	statusSecao: boolean
	dataHoraAtualizacao?: string | null
}

export interface ComprasDivisaoServico {
	codigoDivisao: number
	codigoSecao: number
	nomeDivisao: string
	statusDivisao: boolean
	dataHoraAtualizacao?: string | null
}

export interface ComprasGrupoServico {
	codigoGrupo: number
	codigoDivisao: number
	nomeGrupo: string
	statusGrupo: boolean
	dataHoraAtualizacao?: string | null
}

export interface ComprasClasseServico {
	codigoClasse: number
	codigoGrupo: number
	nomeClasse: string
	statusGrupo: boolean
	dataHoraAtualizacao?: string | null
}

export interface ComprasSubclasseServico {
	codigoSubclasse: number
	codigoClasse: number
	nomeSubclasse: string
	statusSubclasse: boolean
	dataHoraAtualizacao?: string | null
}

export interface ComprasItemServico {
	codigoServico: number
	codigoSubclasse?: number | null
	nomeServico: string
	codigoCpc?: number | null
	exclusivoCentralCompras?: boolean | null
	statusServico: boolean
	dataHoraAtualizacao?: string | null
}

export interface ComprasUnidadeMedidaServico {
	codigoServico: number
	siglaUnidadeMedida: string
	nomeUnidadeMedida?: string | null
	statusUnidadeMedida: boolean
}

export interface ComprasNaturezaDespesaServico {
	codigoServico: number
	codigoNaturezaDespesa: string
	nomeNaturezaDespesa: string
	statusNaturezaDespesa: boolean
}
