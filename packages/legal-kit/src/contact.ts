/**
 * Canal único de exercício de direitos do titular (LGPD, art. 18) para TODOS os
 * sistemas do IEFA.
 *
 * Existe como constante — e não como texto solto em cada app — porque um canal
 * divergente entre sistemas é, na prática, ausência de canal: o titular manda o
 * pedido para um endereço que ninguém lê e o prazo corre do mesmo jeito. O texto
 * dos documentos legais (seed em `packages/database/supabase/migrations`) repete
 * estes mesmos valores; o teste `contact.test.ts` trava a divergência.
 */

/** Encarregado pelo tratamento de dados pessoais (LGPD, art. 41). Cargo, não pessoa. */
export const LEGAL_DATA_PROTECTION_OFFICER = "Secretaria do IEFA"

/** Endereço único para pedidos de acesso, correção, portabilidade e eliminação. */
export const LEGAL_CONTACT_EMAIL = "iefa@fab.mil.br"

/**
 * Prazo de resposta assumido pelo IEFA, em dias corridos a contar do recebimento.
 *
 * Mais curto que os 15 dias do art. 19, §1º — é compromisso institucional, não
 * mínimo legal. Ao mudar aqui, mudar também o texto dos documentos legais.
 */
export const LEGAL_RESPONSE_DAYS = 7

/** Controlador dos dados (LGPD, art. 5º, VI). */
export const LEGAL_CONTROLLER = "Instituto de Economia, Finanças e Administração da Aeronáutica (IEFA)"

export const LEGAL_CONTACT = {
	controller: LEGAL_CONTROLLER,
	officer: LEGAL_DATA_PROTECTION_OFFICER,
	email: LEGAL_CONTACT_EMAIL,
	responseDays: LEGAL_RESPONSE_DAYS,
} as const

/**
 * Finalidade institucional e política de não-venda, por locale.
 *
 * Mora aqui pelo mesmo motivo que o e-mail e o prazo: são afirmações que a API
 * repete em JSON e o documento repete em prosa, e duas cópias soltas divergem
 * sozinhas. `contact.test.ts` amarra cada uma ao texto publicado.
 *
 * O `data_sale` é literal e não booleano de propósito — um agente que lê o índice
 * de `/legal` recebe uma palavra que não admite leitura ambígua.
 */
export const LEGAL_DATA_SALE = "never" as const

export const LEGAL_INSTITUTIONAL_PURPOSE = {
	"pt-BR":
		"O IEFA é instituição pública de ensino e pesquisa. Dados pessoais NUNCA são vendidos, alugados, cedidos ou trocados para fim comercial, publicitário ou de perfilamento. São tratados para operar o serviço e produzir estudo, indicador e pesquisa institucional.",
	"en-US":
		"IEFA is a public teaching and research institution. Personal data is NEVER sold, rented, assigned or traded for commercial, advertising or profiling purposes. It is processed to run the service and to produce studies, indicators and institutional research.",
} as const

/** Texto do procedimento de exclusão, por locale — a API o devolve no índice de `/legal`. */
export const LEGAL_DELETION_NOTICE = {
	"pt-BR": `Não há autoexclusão. Pedidos de acesso, correção ou eliminação são processados manualmente pela Secretaria do IEFA, por e-mail para ${LEGAL_CONTACT_EMAIL}, com resposta em até ${LEGAL_RESPONSE_DAYS} dias corridos.`,
	"en-US": `There is no self-service deletion. Requests for access, correction or erasure are handled manually by the IEFA Secretariat, by e-mail to ${LEGAL_CONTACT_EMAIL}, with an answer within ${LEGAL_RESPONSE_DAYS} calendar days.`,
} as const
