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
