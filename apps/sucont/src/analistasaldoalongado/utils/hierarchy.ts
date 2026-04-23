export interface UgHierarchy {
	ug: string
	nome: string
	orgaoSuperior: string
	ods: string
}

export const UG_HIERARCHY: Record<string, UgHierarchy> = {
	"120001": { ug: "120001", nome: "GABAER", orgaoSuperior: "GABAER", ods: "GABAER" },
	"120002": { ug: "120002", nome: "DIREF", orgaoSuperior: "SEFA", ods: "SEFA" },
	"120004": { ug: "120004", nome: "BABR", orgaoSuperior: "VI COMAR", ods: "COMPREP" },
	"120005": { ug: "120005", nome: "PABR", orgaoSuperior: "DIRAD", ods: "SEFA" },
	"120006": { ug: "120006", nome: "GAP-BR", orgaoSuperior: "DIRAD", ods: "SEFA" },
	"120007": { ug: "120007", nome: "PARF", orgaoSuperior: "DIRAD", ods: "SEFA" },
	"120008": { ug: "120008", nome: "CINDACTA I", orgaoSuperior: "DECEA", ods: "DECEA" },
	"120013": { ug: "120013", nome: "CLA", orgaoSuperior: "DCTA", ods: "DCTA" },
	"120014": { ug: "120014", nome: "BAFZ", orgaoSuperior: "II COMAR", ods: "COMPREP" },
	"120015": { ug: "120015", nome: "CLBI", orgaoSuperior: "DCTA", ods: "DCTA" },
	"120016": { ug: "120016", nome: "GAP-SJ", orgaoSuperior: "DCTA", ods: "DCTA" },
	"120017": { ug: "120017", nome: "II COMAR", orgaoSuperior: "COMPREP", ods: "COMPREP" },
	"120018": { ug: "120018", nome: "BARF", orgaoSuperior: "II COMAR", ods: "COMPREP" },
	"120019": { ug: "120019", nome: "HARF", orgaoSuperior: "DIRSA", ods: "COMGEP" },
	"120021": { ug: "120021", nome: "CINDACTA III", orgaoSuperior: "DECEA", ods: "DECEA" },
	"120023": { ug: "120023", nome: "BASV", orgaoSuperior: "II COMAR", ods: "COMPREP" },
	"120025": { ug: "120025", nome: "EPCAR", orgaoSuperior: "DIRENS", ods: "COMGEP" },
	"120026": { ug: "120026", nome: "PAMA-LS", orgaoSuperior: "DIRMAB", ods: "COMGAP" },
	"120029": { ug: "120029", nome: "BAAF", orgaoSuperior: "III COMAR", ods: "COMPREP" },
	"120030": { ug: "120030", nome: "BAGL", orgaoSuperior: "III COMAR", ods: "COMPREP" },
	"120035": { ug: "120035", nome: "CTLA", orgaoSuperior: "CELOG", ods: "COMGAP" },
	"120036": { ug: "120036", nome: "DECEA", orgaoSuperior: "DECEA", ods: "DECEA" },
	"120039": { ug: "120039", nome: "GAP-RJ", orgaoSuperior: "DIRAD", ods: "SEFA" },
	"120040": { ug: "120040", nome: "HCA", orgaoSuperior: "DIRSA", ods: "COMGEP" },
	"120041": { ug: "120041", nome: "HAAF", orgaoSuperior: "DIRSA", ods: "COMGEP" },
	"120042": { ug: "120042", nome: "HFAG", orgaoSuperior: "DIRSA", ods: "COMGEP" },
	"120044": { ug: "120044", nome: "BREVET", orgaoSuperior: "DIRAD", ods: "SEFA" },
	"120045": { ug: "120045", nome: "PAGL", orgaoSuperior: "DIRAD", ods: "SEFA" },
	"120047": { ug: "120047", nome: "PAMB", orgaoSuperior: "DIRMAB", ods: "COMGAP" },
	"120048": { ug: "120048", nome: "PAME", orgaoSuperior: "DECEA", ods: "DECEA" },
	"120049": { ug: "120049", nome: "PAMA-GL", orgaoSuperior: "DIRMAB", ods: "COMGAP" },
	"120052": { ug: "120052", nome: "SDPP/PAÍS", orgaoSuperior: "DIRAD", ods: "SEFA" },
	"120053": { ug: "120053", nome: "PAAF", orgaoSuperior: "DIRAD", ods: "SEFA" },
	"120060": { ug: "120060", nome: "AFA", orgaoSuperior: "DIRENS", ods: "COMGEP" },
	"120061": { ug: "120061", nome: "BAST", orgaoSuperior: "IV COMAR", ods: "COMPREP" },
	"120062": { ug: "120062", nome: "BASP", orgaoSuperior: "IV COMAR", ods: "COMPREP" },
	"120064": { ug: "120064", nome: "EEAR", orgaoSuperior: "DIRENS", ods: "COMGEP" },
	"120065": { ug: "120065", nome: "FAYS", orgaoSuperior: "DIRAD", ods: "SEFA" },
	"120066": { ug: "120066", nome: "HFASP", orgaoSuperior: "DIRSA", ods: "COMGEP" },
	"120068": { ug: "120068", nome: "PAMA-SP", orgaoSuperior: "DIRMAB", ods: "COMGAP" },
	"120069": { ug: "120069", nome: "CRCEA-SE", orgaoSuperior: "DECEA", ods: "DECEA" },
	"120071": { ug: "120071", nome: "CELOG", orgaoSuperior: "COMGAP", ods: "COMGAP" },
	"120072": { ug: "120072", nome: "CINDACTA II", orgaoSuperior: "DECEA", ods: "DECEA" },
	"120073": { ug: "120073", nome: "BAFL", orgaoSuperior: "V COMAR", ods: "COMPREP" },
	"120075": { ug: "120075", nome: "BACO", orgaoSuperior: "V COMAR", ods: "COMPREP" },
	"120077": { ug: "120077", nome: "HACO", orgaoSuperior: "DIRSA", ods: "COMGEP" },
	"120082": { ug: "120082", nome: "BAMN", orgaoSuperior: "VII COMAR", ods: "COMPREP" },
	"120087": { ug: "120087", nome: "BABE", orgaoSuperior: "I COMAR", ods: "COMPREP" },
	"120088": { ug: "120088", nome: "COMARA", orgaoSuperior: "COMGAP", ods: "COMGAP" },
	"120089": { ug: "120089", nome: "HABE", orgaoSuperior: "DIRSA", ods: "COMGEP" },
	"120090": { ug: "120090", nome: "CABW", orgaoSuperior: "CELOG", ods: "COMGAP" },
	"120091": { ug: "120091", nome: "CABE", orgaoSuperior: "CELOG", ods: "COMGAP" },
	"120093": { ug: "120093", nome: "SDPP/EXTERIOR", orgaoSuperior: "DIRAD", ods: "SEFA" },
	"120094": { ug: "120094", nome: "CINDACTA IV", orgaoSuperior: "DECEA", ods: "DECEA" },
	"120096": { ug: "120096", nome: "HFAB", orgaoSuperior: "DIRSA", ods: "COMGEP" },
	"120097": { ug: "120097", nome: "PASP", orgaoSuperior: "DIRAD", ods: "SEFA" },
	"120099": { ug: "120099", nome: "DIRINFRA", orgaoSuperior: "COMGAP", ods: "COMGAP" },
	"120100": { ug: "120100", nome: "SDAB", orgaoSuperior: "DIRAD", ods: "SEFA" },
	"120108": { ug: "120108", nome: "COPAC", orgaoSuperior: "DCTA", ods: "DCTA" },
	"120127": { ug: "120127", nome: "CISCEA", orgaoSuperior: "DECEA", ods: "DECEA" },
	"120152": { ug: "120152", nome: "CPBV", orgaoSuperior: "VI COMAR", ods: "COMPREP" },
	"120154": { ug: "120154", nome: "HAMN", orgaoSuperior: "DIRSA", ods: "COMGEP" },
	"120195": { ug: "120195", nome: "CAE", orgaoSuperior: "DIRAD", ods: "SEFA" },
	"120225": { ug: "120225", nome: "SERINFRA-SJ", orgaoSuperior: "DIRINFRA", ods: "COMGAP" },
	"120255": { ug: "120255", nome: "SERINFRA-BE", orgaoSuperior: "DIRINFRA", ods: "COMGAP" },
	"120257": { ug: "120257", nome: "SERINFRA-RJ", orgaoSuperior: "DIRINFRA", ods: "COMGAP" },
	"120258": { ug: "120258", nome: "SERINFRA-SP", orgaoSuperior: "DIRINFRA", ods: "COMGAP" },
	"120259": { ug: "120259", nome: "SERINFRA-CO", orgaoSuperior: "DIRINFRA", ods: "COMGAP" },
	"120260": { ug: "120260", nome: "SERINFRA-BR", orgaoSuperior: "DIRINFRA", ods: "COMGAP" },
	"120261": { ug: "120261", nome: "SERINFRA-MN", orgaoSuperior: "DIRINFRA", ods: "COMGAP" },
	"120265": { ug: "120265", nome: "SERINFRA-NT", orgaoSuperior: "DIRINFRA", ods: "COMGAP" },
	"120279": { ug: "120279", nome: "RANCHO-DIRAD", orgaoSuperior: "DIRAD", ods: "SEFA" },
	"120512": { ug: "120512", nome: "PASJ", orgaoSuperior: "DCTA", ods: "DCTA" },
	"120623": { ug: "120623", nome: "GAP-AF", orgaoSuperior: "DIRAD", ods: "SEFA" },
	"120624": { ug: "120624", nome: "BAAN", orgaoSuperior: "VI COMAR", ods: "COMPREP" },
	"120625": { ug: "120625", nome: "GAP-DF", orgaoSuperior: "DIRAD", ods: "SEFA" },
	"120628": { ug: "120628", nome: "GAP-BE", orgaoSuperior: "DIRAD", ods: "SEFA" },
	"120629": { ug: "120629", nome: "GAP-CO", orgaoSuperior: "DIRAD", ods: "SEFA" },
	"120630": { ug: "120630", nome: "GAP-MN", orgaoSuperior: "DIRAD", ods: "SEFA" },
	"120631": { ug: "120631", nome: "BANT", orgaoSuperior: "II COMAR", ods: "COMPREP" },
	"120632": { ug: "120632", nome: "GAP-RF", orgaoSuperior: "DIRAD", ods: "SEFA" },
	"120633": { ug: "120633", nome: "GAP-SP", orgaoSuperior: "DIRAD", ods: "SEFA" },
	"120636": { ug: "120636", nome: "GAP-LS", orgaoSuperior: "DIRAD", ods: "SEFA" },
	"120637": { ug: "120637", nome: "BABV", orgaoSuperior: "VII COMAR", ods: "COMPREP" },
	"120638": { ug: "120638", nome: "BACG", orgaoSuperior: "IV COMAR", ods: "COMPREP" },
	"120639": { ug: "120639", nome: "GAP-FL", orgaoSuperior: "DIRAD", ods: "SEFA" },
	"120640": { ug: "120640", nome: "GAP-FZ", orgaoSuperior: "DIRAD", ods: "SEFA" },
	"120641": { ug: "120641", nome: "BAPV", orgaoSuperior: "VII COMAR", ods: "COMPREP" },
	"120642": { ug: "120642", nome: "GAP-SV", orgaoSuperior: "DIRAD", ods: "SEFA" },
	"120643": { ug: "120643", nome: "BASM", orgaoSuperior: "V COMAR", ods: "COMPREP" },
	"120644": { ug: "120644", nome: "GAP-CT", orgaoSuperior: "DIRAD", ods: "SEFA" },
	"120645": { ug: "120645", nome: "GAP-GL", orgaoSuperior: "DIRAD", ods: "SEFA" },
	"120669": { ug: "120669", nome: "BASC", orgaoSuperior: "III COMAR", ods: "COMPREP" },
	"120701": { ug: "120701", nome: "DIREF/SUCONT", orgaoSuperior: "SEFA", ods: "SEFA" },
	"120702": { ug: "120702", nome: "DIREF/SUCONV", orgaoSuperior: "SEFA", ods: "SEFA" },
	"120999": {
		ug: "120999",
		nome: "MAER - DIF. CAMBIAL",
		orgaoSuperior: "STN",
		ods: "STN",
	},
}

export const getUgHierarchy = (ug: string): UgHierarchy => {
	return (
		UG_HIERARCHY[ug] || {
			ug,
			nome: "Desconhecida",
			orgaoSuperior: "Desconhecido",
			ods: "Desconhecido",
		}
	)
}

export const getUniqueOds = (): string[] => {
	const ods = new Set<string>()
	Object.values(UG_HIERARCHY).forEach((item) => {
		ods.add(item.ods)
	})
	return Array.from(ods).sort()
}

export const getUniqueOrgaosSuperiores = (): string[] => {
	const orgaos = new Set<string>()
	Object.values(UG_HIERARCHY).forEach((item) => {
		orgaos.add(item.orgaoSuperior)
	})
	return Array.from(orgaos).sort()
}
