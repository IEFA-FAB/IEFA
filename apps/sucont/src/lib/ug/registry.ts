/**
 * @module lib/ug/registry
 * Fonte ÚNICA das Unidades Gestoras do COMAER acompanhadas pela SUCONT: sigla
 * interna, ODS, órgão superior, conferente responsável e o título oficial da UG
 * no SIAFI.
 *
 * Antes existiam sete tabelas de UG e seis de conferente espalhadas pelo app, e
 * elas já haviam divergido: `auditor/ugMapping.ts` não conhecia 120283 nem
 * 121002 e carregava 120627, que não existia em nenhuma outra; `cruzamento` e
 * `analista` discordavam do nome de 120283 e de 120999. UG que falta numa tabela
 * vira "OUTROS"/"NÃO IDENTIFICADA" na tela e some dos filtros por conferente.
 *
 * O campo `tituloSiafi` foi conferido contra o cadastro oficial de Unidades
 * Gestoras do SIAFI (dataset público da STN, "SIAFI - Relatório Unidades
 * Gestoras"). Ele existe para que a próxima divergência seja verificável em vez
 * de opinativa — a sigla é uso interno, o título é o que o SIAFI responde.
 */

export interface UnidadeGestora {
	/** Sigla de uso interno no COMAER (é o que aparece nas telas e mensagens). */
	sigla: string
	/** Órgão de Direção Setorial. */
	ods: string
	/** Órgão superior imediato. */
	orgaoSuperior: string
	/** Título oficial da UG no cadastro do SIAFI. */
	tituloSiafi: string
	/** Conferente responsável na SUCONT-3. Ausente = UG sem conferente atribuído. */
	conferente?: string
	/** `false` quando a UG está inativa no cadastro do SIAFI. Ausente = ativa. */
	ativoSiafi?: false
}

export const UNIDADES_GESTORAS: Record<string, UnidadeGestora> = {
	"120001": { sigla: "GABAER", ods: "GABAER", orgaoSuperior: "GABAER", tituloSiafi: "GABINETE DO COMANDANTE DA AERONAUTICA", conferente: "1S ELIANA" },
	"120002": { sigla: "DIREF", ods: "SEFA", orgaoSuperior: "SEFA", tituloSiafi: "DIRETORIA DE ECON E FINANÇAS DA AERONÁUTICA", conferente: "1S ELIANA" },
	"120004": { sigla: "BABR", ods: "COMPREP", orgaoSuperior: "VI COMAR", tituloSiafi: "BASE AEREA DE BRASILIA", conferente: "1S ELIANA" },
	"120005": { sigla: "PABR", ods: "SEFA", orgaoSuperior: "DIRAD", tituloSiafi: "PREFEITURA DE AERONAUTICA DE BRASILIA", conferente: "1S ELIANA" },
	"120006": { sigla: "GAP-BR", ods: "SEFA", orgaoSuperior: "DIRAD", tituloSiafi: "GRUPAMENTO DE APOIO DE BRASILIA", conferente: "1T JEFFERSON LUÍS" },
	"120007": { sigla: "PARF", ods: "SEFA", orgaoSuperior: "DIRAD", tituloSiafi: "PREFEITURA DE AERONAUTICA DE RECIFE", conferente: "1T ÉRIKA VICENTE" },
	"120008": {
		sigla: "CINDACTA I",
		ods: "DECEA",
		orgaoSuperior: "DECEA",
		tituloSiafi: "PRIMEIRO CENTRO INT.DEF.AEREA CONTR.TFG.AEREO",
		conferente: "1S ELIANA",
	},
	"120013": { sigla: "CLA", ods: "DCTA", orgaoSuperior: "DCTA", tituloSiafi: "CENTRO DE LANCAMENTO DE ALCANTARA", conferente: "1T ÉRIKA VICENTE" },
	"120014": { sigla: "BAFZ", ods: "COMPREP", orgaoSuperior: "II COMAR", tituloSiafi: "BASE AEREA DE FORTALEZA", conferente: "1T JEFFERSON LUÍS" },
	"120015": { sigla: "CLBI", ods: "DCTA", orgaoSuperior: "DCTA", tituloSiafi: "CENTRO DE LANCAMENTO DA BARREIRA DO INFERNO", conferente: "1S ELIANA" },
	"120016": { sigla: "GAP-SJ", ods: "DCTA", orgaoSuperior: "DCTA", tituloSiafi: "GRUPAMENTO DE APOIO DE S J CAMPOS", conferente: "1T JEFFERSON LUÍS" },
	"120017": { sigla: "II COMAR", ods: "COMPREP", orgaoSuperior: "COMPREP", tituloSiafi: "SEGUNDO COMANDO AÉREO REGIONAL" },
	"120018": {
		sigla: "BARF",
		ods: "COMPREP",
		orgaoSuperior: "II COMAR",
		tituloSiafi: "BASE AEREA DE RECIFE",
		conferente: "1T ÉRIKA VICENTE",
		ativoSiafi: false,
	},
	"120019": { sigla: "HARF", ods: "COMGEP", orgaoSuperior: "DIRSA", tituloSiafi: "HOSPITAL DE AERONAUTICA DE RECIFE", conferente: "1T ÉRIKA VICENTE" },
	"120021": {
		sigla: "CINDACTA III",
		ods: "DECEA",
		orgaoSuperior: "DECEA",
		tituloSiafi: "TERCEIRO CENTRO INT.DEF.AEREA CONTR.TFG.AEREO",
		conferente: "1T ÉRIKA VICENTE",
	},
	"120023": { sigla: "BASV", ods: "COMPREP", orgaoSuperior: "II COMAR", tituloSiafi: "BASE AEREA DE SALVADOR", conferente: "1S ELIANA" },
	"120025": { sigla: "EPCAR", ods: "COMGEP", orgaoSuperior: "DIRENS", tituloSiafi: "ESCOLA PREPARATÓRIA DE CADETES DO AR", conferente: "1S ELIANA" },
	"120026": {
		sigla: "PAMA-LS",
		ods: "COMGAP",
		orgaoSuperior: "DIRMAB",
		tituloSiafi: "PARQUE MATERIAL AERONAUTICO DE LAGOA SANTA",
		conferente: "1T JEFFERSON LUÍS",
	},
	"120029": { sigla: "BAAF", ods: "COMPREP", orgaoSuperior: "III COMAR", tituloSiafi: "BASE AEREA DOS AFONSOS", conferente: "2S PÂMELA" },
	"120030": { sigla: "BAGL", ods: "COMPREP", orgaoSuperior: "III COMAR", tituloSiafi: "BASE AEREA DO GALEAO", conferente: "1T ÉRIKA VICENTE" },
	"120035": {
		sigla: "CTLA",
		ods: "COMGAP",
		orgaoSuperior: "CELOG",
		tituloSiafi: "CENTRO DE TRANSPORTE LOGÍSTICO DA AERONÁUTICA",
		conferente: "1T ÉRIKA VICENTE",
	},
	"120036": { sigla: "DECEA", ods: "DECEA", orgaoSuperior: "DECEA", tituloSiafi: "DEPARTAMENTO DE CONTROLE DO ESPACO AEREO", conferente: "1T JEFFERSON LUÍS" },
	"120039": { sigla: "GAP-RJ", ods: "SEFA", orgaoSuperior: "DIRAD", tituloSiafi: "GRUPAMENTO DE APOIO DO RIO DE JANEIRO", conferente: "1T ÉRIKA VICENTE" },
	"120040": { sigla: "HCA", ods: "COMGEP", orgaoSuperior: "DIRSA", tituloSiafi: "HOSPITAL CENTRAL AERONAUTICA", conferente: "2S PÂMELA" },
	"120041": { sigla: "HAAF", ods: "COMGEP", orgaoSuperior: "DIRSA", tituloSiafi: "HOSPITAL DE AERONAUTICA DOS AFONSOS", conferente: "2S PÂMELA" },
	"120042": { sigla: "HFAG", ods: "COMGEP", orgaoSuperior: "DIRSA", tituloSiafi: "HOSPITAL DE FORCA AEREA DO GALEAO", conferente: "1S ELIANA" },
	"120044": { sigla: "BREVET", ods: "SEFA", orgaoSuperior: "DIRAD", tituloSiafi: "BASE DE RECEPÇÃO DE VETERANOS", conferente: "2S PÂMELA" },
	"120045": { sigla: "PAGL", ods: "SEFA", orgaoSuperior: "DIRAD", tituloSiafi: "PREFEITURA DE AERONAUTICA DO GALEAO", conferente: "1T ÉRIKA VICENTE" },
	"120047": { sigla: "PAMB", ods: "COMGAP", orgaoSuperior: "DIRMAB", tituloSiafi: "PARQUE DE MATERIAL BELICO DA AERONAUTICA", conferente: "1S ELIANA" },
	"120048": { sigla: "PAME", ods: "DECEA", orgaoSuperior: "DECEA", tituloSiafi: "PARQUE DE MAT. DE ELETRONICA DA AERONAUTICA", conferente: "2S PÂMELA" },
	"120049": { sigla: "PAMA-GL", ods: "COMGAP", orgaoSuperior: "DIRMAB", tituloSiafi: "PARQUE DE MATERIAL AERONAUTICO DO GALEAO", conferente: "2S PÂMELA" },
	"120052": { sigla: "SDPP/PAÍS", ods: "SEFA", orgaoSuperior: "DIRAD", tituloSiafi: "SUBDIRETORIA DE PAGAMENTO DE PESSOAL/PAIS", conferente: "1S ELIANA" },
	"120053": { sigla: "PAAF", ods: "SEFA", orgaoSuperior: "DIRAD", tituloSiafi: "PREFEITURA DE AERONAUTICA DOS AFONSOS", conferente: "1T JEFFERSON LUÍS" },
	"120060": { sigla: "AFA", ods: "COMGEP", orgaoSuperior: "DIRENS", tituloSiafi: "ACADEMIA DA FORCA AEREA", conferente: "2S PÂMELA" },
	"120061": { sigla: "BAST", ods: "COMPREP", orgaoSuperior: "IV COMAR", tituloSiafi: "BASE AEREA DE SANTOS", conferente: "1T ÉRIKA VICENTE" },
	"120062": { sigla: "BASP", ods: "COMPREP", orgaoSuperior: "IV COMAR", tituloSiafi: "BASE AEREA DE SAO PAULO", conferente: "1T ÉRIKA VICENTE" },
	"120064": { sigla: "EEAR", ods: "COMGEP", orgaoSuperior: "DIRENS", tituloSiafi: "ESCOLA DE ESPECIALISTAS DE AERONAUTICA", conferente: "1S ELIANA" },
	"120065": { sigla: "FAYS", ods: "SEFA", orgaoSuperior: "DIRAD", tituloSiafi: "FAZENDA DE AERONAUTICA DE PIRASSUNUNGA", conferente: "2S PÂMELA" },
	"120066": { sigla: "HFASP", ods: "COMGEP", orgaoSuperior: "DIRSA", tituloSiafi: "HOSPITAL DE FORÇA AÉREA DE SÃO PAULO", conferente: "1T JEFFERSON LUÍS" },
	"120068": {
		sigla: "PAMA-SP",
		ods: "COMGAP",
		orgaoSuperior: "DIRMAB",
		tituloSiafi: "PARQUE DE MATERIAL AERONAUTICO DE SAO PAULO",
		conferente: "1T JEFFERSON LUÍS",
	},
	"120069": {
		sigla: "CRCEA-SE",
		ods: "DECEA",
		orgaoSuperior: "DECEA",
		tituloSiafi: "CENTRO REGIONAL DE CONTROLE DO ESPAÇO AEREO",
		conferente: "1T JEFFERSON LUÍS",
	},
	"120071": { sigla: "CELOG", ods: "COMGAP", orgaoSuperior: "COMGAP", tituloSiafi: "CENTRO LOGISTICO DA AERONAUTICA", conferente: "2S PÂMELA" },
	"120072": {
		sigla: "CINDACTA II",
		ods: "DECEA",
		orgaoSuperior: "DECEA",
		tituloSiafi: "SEGUNDO CENTRO INT.DEF.AEREA CONTR.TFG.AEREO",
		conferente: "2S PÂMELA",
	},
	"120073": { sigla: "BAFL", ods: "COMPREP", orgaoSuperior: "V COMAR", tituloSiafi: "BASE AEREA DE FLORIANOPOLIS", conferente: "2S PÂMELA" },
	"120075": { sigla: "BACO", ods: "COMPREP", orgaoSuperior: "V COMAR", tituloSiafi: "BASE AEREA DE CANOAS", conferente: "2S PÂMELA" },
	"120077": { sigla: "HACO", ods: "COMGEP", orgaoSuperior: "DIRSA", tituloSiafi: "HOSPITAL DE AERONAUTICA DE CANOAS", conferente: "2S PÂMELA" },
	"120082": { sigla: "BAMN", ods: "COMPREP", orgaoSuperior: "VII COMAR", tituloSiafi: "BASE AEREA DE MANAUS", conferente: "1S ELIANA" },
	"120087": { sigla: "BABE", ods: "COMPREP", orgaoSuperior: "I COMAR", tituloSiafi: "BASE AEREA DE BELEM", conferente: "1T ÉRIKA VICENTE" },
	"120088": {
		sigla: "COMARA",
		ods: "COMGAP",
		orgaoSuperior: "COMGAP",
		tituloSiafi: "COMISSAO DE AEROPORTOS DA REGIAO AMAZONICA",
		conferente: "1T JEFFERSON LUÍS",
	},
	"120089": { sigla: "HABE", ods: "COMGEP", orgaoSuperior: "DIRSA", tituloSiafi: "HOSPITAL DE AERONAUTICA DE BELEM", conferente: "1T JEFFERSON LUÍS" },
	"120090": { sigla: "CABW", ods: "COMGAP", orgaoSuperior: "CELOG", tituloSiafi: "COMISSAO AERONAUTICA BRASILEIRA EM WASHINGTON", conferente: "2S PÂMELA" },
	"120091": { sigla: "CABE", ods: "COMGAP", orgaoSuperior: "CELOG", tituloSiafi: "COMISSAO AERONAUTICA BRASILEIRA NA EUROPA", conferente: "1T JEFFERSON LUÍS" },
	"120093": {
		sigla: "SDPP/EXTERIOR",
		ods: "SEFA",
		orgaoSuperior: "DIRAD",
		tituloSiafi: "SUBDIRETORIA DE PAGAMENTO DE PESSOAL/EXTERIOR",
		conferente: "1T ÉRIKA VICENTE",
	},
	"120094": {
		sigla: "CINDACTA IV",
		ods: "DECEA",
		orgaoSuperior: "DECEA",
		tituloSiafi: "QUARTO CENTRO INT. DEF. AEREA CONTR.TFG.AEREO",
		conferente: "1S ELIANA",
	},
	"120096": { sigla: "HFAB", ods: "COMGEP", orgaoSuperior: "DIRSA", tituloSiafi: "HOSPITAL DE FORCA AEREA DE BRASILIA", conferente: "1S ELIANA" },
	"120097": { sigla: "PASP", ods: "SEFA", orgaoSuperior: "DIRAD", tituloSiafi: "PREFEITURA DE AERONAUTICA DE SAO PAULO", conferente: "1T ÉRIKA VICENTE" },
	"120099": {
		sigla: "DIRINFRA",
		ods: "COMGAP",
		orgaoSuperior: "COMGAP",
		tituloSiafi: "DIRETORIA DE INFRAESTRUTURA DA AERONAUTICA",
		conferente: "1T ÉRIKA VICENTE",
	},
	"120100": { sigla: "SDAB", ods: "SEFA", orgaoSuperior: "DIRAD", tituloSiafi: "SUBDIRETORIA DE ABASTECIMENTO", conferente: "1S ELIANA" },
	"120108": { sigla: "COPAC", ods: "DCTA", orgaoSuperior: "DCTA", tituloSiafi: "COMISSAO COORD. DO PROGRAMA ANV DE COMBATE", conferente: "1T JEFFERSON LUÍS" },
	"120127": { sigla: "CISCEA", ods: "DECEA", orgaoSuperior: "DECEA", tituloSiafi: "COMISSAO DE IMPLANT.DO SIST.DE CONTR.DO E AER", conferente: "2S PÂMELA" },
	"120152": { sigla: "CPBV", ods: "COMPREP", orgaoSuperior: "VI COMAR", tituloSiafi: "CAMPO DE PROVAS BRIGADEIRO VELLOSO", conferente: "1S ELIANA" },
	"120154": { sigla: "HAMN", ods: "COMGEP", orgaoSuperior: "DIRSA", tituloSiafi: "HOSPITAL DE AERONAUTICA DE MANAUS", conferente: "1T JEFFERSON LUÍS" },
	"120195": { sigla: "CAE", ods: "SEFA", orgaoSuperior: "DIRAD", tituloSiafi: "CENTRO DE AQUISIÇÕES ESPECÍFICAS", conferente: "2S PÂMELA" },
	"120225": {
		sigla: "SERINFRA-SJ",
		ods: "COMGAP",
		orgaoSuperior: "DIRINFRA",
		tituloSiafi: "SERVIÇO REG. DE INFRAEST DA AER.DE S.J.CAMPOS",
		conferente: "1T JEFFERSON LUÍS",
	},
	"120255": {
		sigla: "SERINFRA-BE",
		ods: "COMGAP",
		orgaoSuperior: "DIRINFRA",
		tituloSiafi: "SERVIÇO REG. DE INFRAEST. DA AERON. DE BELÉM",
		conferente: "1T ÉRIKA VICENTE",
	},
	"120257": {
		sigla: "SERINFRA-RJ",
		ods: "COMGAP",
		orgaoSuperior: "DIRINFRA",
		tituloSiafi: "SERVIÇO REG. DE INFRAEST. DA AERON. DO RJ",
		conferente: "2S PÂMELA",
	},
	"120258": { sigla: "SERINFRA-SP", ods: "COMGAP", orgaoSuperior: "DIRINFRA", tituloSiafi: "DEST INFRAESTRUTURA DA AER DE SAO PAULO", conferente: "2S PÂMELA" },
	"120259": {
		sigla: "SERINFRA-CO",
		ods: "COMGAP",
		orgaoSuperior: "DIRINFRA",
		tituloSiafi: "SERVIÇO REG. DE INFRAEST. DA AERON. DE CANOAS",
		conferente: "2S PÂMELA",
	},
	"120260": {
		sigla: "SERINFRA-BR",
		ods: "COMGAP",
		orgaoSuperior: "DIRINFRA",
		tituloSiafi: "SERVIÇO REG. DE INFRAEST. DA AERON. DE BRASIL",
		conferente: "1S ELIANA",
	},
	"120261": {
		sigla: "SERINFRA-MN",
		ods: "COMGAP",
		orgaoSuperior: "DIRINFRA",
		tituloSiafi: "SERVIÇO REG. DE INFRAEST. DE MANAUS",
		conferente: "1T JEFFERSON LUÍS",
	},
	"120265": {
		sigla: "SERINFRA-NT",
		ods: "COMGAP",
		orgaoSuperior: "DIRINFRA",
		tituloSiafi: "SERVIÇO REG. DE INFRAEST. DA AERON. DE NATAL",
		conferente: "1S ELIANA",
	},
	"120279": {
		sigla: "RANCHO-DIRAD",
		ods: "SEFA",
		orgaoSuperior: "DIRAD",
		tituloSiafi: "RANCHO CONCEITO DA DIRETORIA DE ADM.DA AERON.",
		conferente: "1T ÉRIKA VICENTE",
		ativoSiafi: false,
	},
	"120283": {
		sigla: "SERINFRA-RF",
		ods: "COMGAP",
		orgaoSuperior: "DIRINFRA",
		tituloSiafi: "GRUPAMENTO DE ENG. DE CAMPANHA DA AERONÁUTICA",
		conferente: "1S ELIANA",
	},
	"120512": {
		sigla: "PASJ",
		ods: "DCTA",
		orgaoSuperior: "DCTA",
		tituloSiafi: "PREFEITURA DE AERONAUT.DE SAO JOSE DOS CAMPOS",
		conferente: "1T JEFFERSON LUÍS",
	},
	"120623": { sigla: "GAP-AF", ods: "SEFA", orgaoSuperior: "DIRAD", tituloSiafi: "GRUPAMENTO DE APOIO DOS AFONSOS", conferente: "2S PÂMELA" },
	"120624": { sigla: "BAAN", ods: "COMPREP", orgaoSuperior: "VI COMAR", tituloSiafi: "BASE AÉREA DE ANÁPOLIS", conferente: "1T JEFFERSON LUÍS" },
	"120625": { sigla: "GAP-DF", ods: "SEFA", orgaoSuperior: "DIRAD", tituloSiafi: "GRUPAMENTO DE APOIO DO DISTRITO FED", conferente: "1S ELIANA" },
	"120628": { sigla: "GAP-BE", ods: "SEFA", orgaoSuperior: "DIRAD", tituloSiafi: "GRUPAMENTO DE APOIO DE BELÉM", conferente: "1T ÉRIKA VICENTE" },
	"120629": { sigla: "GAP-CO", ods: "SEFA", orgaoSuperior: "DIRAD", tituloSiafi: "GRUPAMENTO DE APOIO DE CANOAS", conferente: "2S PÂMELA" },
	"120630": { sigla: "GAP-MN", ods: "SEFA", orgaoSuperior: "DIRAD", tituloSiafi: "GRUPAMENTO DE APOIO DE MANAUS", conferente: "1S ELIANA" },
	"120631": { sigla: "BANT", ods: "COMPREP", orgaoSuperior: "II COMAR", tituloSiafi: "BASE AEREA DE NATAL", conferente: "1S ELIANA" },
	"120632": { sigla: "GAP-RF", ods: "SEFA", orgaoSuperior: "DIRAD", tituloSiafi: "GRUPAMENTO DE APOIO DE RECIFE", conferente: "1T ÉRIKA VICENTE" },
	"120633": { sigla: "GAP-SP", ods: "SEFA", orgaoSuperior: "DIRAD", tituloSiafi: "GRUPAMENTO DE APOIO DE SÃO PAULO", conferente: "1T ÉRIKA VICENTE" },
	"120636": { sigla: "GAP-LS", ods: "SEFA", orgaoSuperior: "DIRAD", tituloSiafi: "GRUPAMENTO DE APOIO DE LAGOA SANTA", conferente: "1T JEFFERSON LUÍS" },
	"120637": { sigla: "BABV", ods: "COMPREP", orgaoSuperior: "VII COMAR", tituloSiafi: "BASE AÉREA DE BOA VISTA", conferente: "1T ÉRIKA VICENTE" },
	"120638": { sigla: "BACG", ods: "COMPREP", orgaoSuperior: "IV COMAR", tituloSiafi: "BASE AEREA DE CAMPO GRANDE", conferente: "1T JEFFERSON LUÍS" },
	"120639": { sigla: "GAP-FL", ods: "SEFA", orgaoSuperior: "DIRAD", tituloSiafi: "GRUPAMENTO DE APOIO DE FLORIANOPOLIS", ativoSiafi: false },
	"120640": { sigla: "GAP-FZ", ods: "SEFA", orgaoSuperior: "DIRAD", tituloSiafi: "GRUPAMENTO DE APOIO DE FORTALEZA", ativoSiafi: false },
	"120641": { sigla: "BAPV", ods: "COMPREP", orgaoSuperior: "VII COMAR", tituloSiafi: "BASE AÉREA DE PORTO VELHO", conferente: "2S PÂMELA" },
	"120642": { sigla: "GAP-SV", ods: "SEFA", orgaoSuperior: "DIRAD", tituloSiafi: "GRUPAMENTO DE APOIO DE SALVADOR", ativoSiafi: false },
	"120643": { sigla: "BASM", ods: "COMPREP", orgaoSuperior: "V COMAR", tituloSiafi: "BASE AÉREA DE SANTA MARIA", conferente: "1T JEFFERSON LUÍS" },
	"120644": { sigla: "GAP-CT", ods: "SEFA", orgaoSuperior: "DIRAD", tituloSiafi: "GRUPAMENTO DE APOIO DE CURITIBA", ativoSiafi: false },
	"120645": { sigla: "GAP-GL", ods: "SEFA", orgaoSuperior: "DIRAD", tituloSiafi: "GRUPAMENTO DE APOIO DO GALEÃO", conferente: "1T ÉRIKA VICENTE" },
	"120669": { sigla: "BASC", ods: "COMPREP", orgaoSuperior: "III COMAR", tituloSiafi: "BASE AÉREA DE SANTA CRUZ", conferente: "1T ÉRIKA VICENTE" },
	"120701": { sigla: "DIREF/SUCONT", ods: "SEFA", orgaoSuperior: "SEFA", tituloSiafi: "DIRETORIA DE ECON E FINANÇAS DA AERONÁUTICA", conferente: "2S PÂMELA" },
	"120702": {
		sigla: "DIREF/SUCONV",
		ods: "SEFA",
		orgaoSuperior: "SEFA",
		tituloSiafi: "DIRETORIA DE ECON E FINANÇAS DA AERONÁUTICA",
		conferente: "1T JEFFERSON LUÍS",
	},
	"120999": { sigla: "MAER - DIF. CAMBIAL", ods: "STN", orgaoSuperior: "STN", tituloSiafi: "MAER - DIFERENCA CAMBIAL" },
	"121002": {
		sigla: "DIREF - FAer",
		ods: "SEFA",
		orgaoSuperior: "SEFA",
		tituloSiafi: "DIRETORIA DE ECON. E FIN. DA AER - F.AER",
		conferente: "1T JEFFERSON LUÍS",
	},
}

/**
 * UGs cuja sigla interna não bate com o título do SIAFI e precisam de confirmação
 * da seção antes de sair em mensagem.
 *
 * - `120283`: o app a chama de SERINFRA-RF (e a tabela do cruzamento a chamava de
 *   SDNB). O SIAFI responde "GRUPAMENTO DE ENG. DE CAMPANHA DA AERONÁUTICA", em
 *   SP. As três versões não podem estar certas ao mesmo tempo.
 */
export const UG_SIGLA_A_CONFIRMAR: readonly string[] = ["120283"]

/** UGs inativas no SIAFI que seguem no acompanhamento — saldo nelas é achado por si só. */
export const UG_INATIVAS_SIAFI: readonly string[] = Object.entries(UNIDADES_GESTORAS)
	.filter(([, ug]) => ug.ativoSiafi === false)
	.map(([codigo]) => codigo)

const CODIGO_UG_REGEX = /\b\d{6}\b/

/** Busca pelo código exato. */
export function getUg(codigo: string): UnidadeGestora | undefined {
	return UNIDADES_GESTORAS[codigo.trim()]
}

/**
 * Extrai o código de UG de um texto qualquer ("120062 - BASP", "UG 120062") e
 * devolve o registro. Os relatórios do Tesouro Gerencial variam entre as duas
 * formas, às vezes no mesmo arquivo.
 */
export function getUgFromText(texto: string): UnidadeGestora | undefined {
	const match = String(texto ?? "").match(CODIGO_UG_REGEX)
	return match ? UNIDADES_GESTORAS[match[0]] : undefined
}

/** Código de UG contido no texto, ou o próprio texto quando não houver um. */
export function extractCodigoUg(texto: string): string {
	const raw = String(texto ?? "").trim()
	return raw.match(CODIGO_UG_REGEX)?.[0] ?? raw
}

export const CONFERENTE_NAO_ATRIBUIDO = "NÃO ATRIBUÍDO"

/** Conferente da UG; aceita código puro ou texto com o código embutido. */
export function getConferente(ugOuTexto: string): string {
	return getUgFromText(ugOuTexto)?.conferente ?? CONFERENTE_NAO_ATRIBUIDO
}

/** Lista ordenada de conferentes distintos, para montar filtros. */
export const CONFERENTES: readonly string[] = Array.from(
	new Set(Object.values(UNIDADES_GESTORAS).flatMap((ug) => (ug.conferente ? [ug.conferente] : [])))
).sort()
