/**
 * @module mfa-mandate
 * Prazo de obrigatoriedade do segundo fator, e as duas telas que ele governa.
 *
 * ## A data é constante em código, e está VAZIA
 *
 * `design.md` (Open Questions) registra que a data da obrigatoriedade "depende de decisão
 * organizacional, não técnica". Enquanto ela não existir, `deadline` é `null` e NADA aparece —
 * nem a faixa, nem a tela de cadastro. Inventar uma data aqui seria anunciar ao usuário um
 * prazo que ninguém decidiu, e o primeiro efeito de um prazo que não se cumpre é que o
 * seguinte também não é levado a sério.
 *
 * A data vive em constante, e não em banco, pela mesma razão que o piso de garantia:
 * configuração em runtime que ANTECIPA ou ADIA uma exigência de segurança é configuração que
 * alguém muda às 23h de uma sexta. Aqui é diff revisável em PR.
 *
 * ## Faixa, nunca modal
 *
 * O aviso é uma faixa dispensável no topo — mesmo espírito do aviso de ciência da LGPD, que
 * não bloqueia navegação. Um modal obrigatório antes do prazo pediria uma ação que a pessoa
 * ainda não é obrigada a tomar, e treinaria todo mundo a fechar caixa de diálogo sem ler.
 * Depois do prazo a exigência aparece DEPOIS do login bem-sucedido, com a ação de sair sempre
 * visível (rota `/auth/mfa-enrollment`).
 *
 * @domain app
 */

export interface MfaMandate {
	/**
	 * Data em que a exigência passa a valer, em `YYYY-MM-DD` (fuso local do usuário).
	 * `null` enquanto não houver decisão — e então nada é exibido.
	 */
	deadline: string | null
	/**
	 * Quantos dias ANTES do prazo a faixa começa a aparecer.
	 *
	 * 30 dias é o que a auditoria de atrito do desenho registra ("aviso em faixa por ~30 dias
	 * antes de qualquer bloqueio"). Menos que isso e quem tira férias no mês descobre a
	 * exigência ao ser barrado.
	 */
	noticeWindowDays: number
}

/**
 * **Desligado.** Nenhuma data anunciada, nenhuma faixa, nenhuma tela obrigatória.
 *
 * Para ligar: preencher `deadline` com a data decidida, num PR próprio, depois de o painel de
 * adoção (`/admin/mfa-adoption`) mostrar que a população alvo consegue cumprir o prazo.
 */
export const MFA_MANDATE: MfaMandate = {
	deadline: null,
	noticeWindowDays: 30,
}

/**
 * Em que fase da obrigatoriedade o sistema está.
 *
 * - `off` — sem data anunciada, ou a data ainda está longe demais para avisar. Nada aparece.
 * - `notice` — dentro da janela de aviso: faixa dispensável, e só.
 * - `enforced` — o prazo passou: tela de cadastro depois do login, com saída visível.
 */
export type MfaMandatePhase = "off" | "notice" | "enforced"

/** Meia-noite local da data `YYYY-MM-DD`, ou `null` se a string não for uma data válida. */
function parseDeadline(deadline: string): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(deadline.trim())
	if (!match) return null
	const [, year, month, day] = match
	const parsed = new Date(Number(year), Number(month) - 1, Number(day))
	// `new Date(2026, 1, 31)` não falha — vira 3 de março. A conferência de volta é o que
	// transforma uma data inexistente em "sem prazo" em vez de num prazo deslocado em silêncio.
	if (parsed.getFullYear() !== Number(year) || parsed.getMonth() !== Number(month) - 1 || parsed.getDate() !== Number(day)) return null
	return parsed
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Fase atual, a partir do relógio do NAVEGADOR.
 *
 * Relógio de cliente decidindo uma data é aceitável aqui, e só aqui, porque isto governa
 * APARÊNCIA — faixa e tela de convite. O que de fato barra uma operação é o piso de garantia,
 * avaliado no servidor (`ASSURANCE_ENFORCEMENT`). Adiantar o relógio do próprio computador
 * antecipa um aviso; não concede nem revoga nada.
 */
export function mfaMandatePhase(now: Date, mandate: MfaMandate = MFA_MANDATE): MfaMandatePhase {
	if (!mandate.deadline) return "off"
	const deadline = parseDeadline(mandate.deadline)
	// Data mal escrita não pode virar "exigência imediata": um `deadline` inválido que caísse em
	// `enforced` trancaria todo mundo na tela de cadastro por causa de um erro de digitação.
	if (!deadline) return "off"

	if (now.getTime() >= deadline.getTime()) return "enforced"
	return now.getTime() >= deadline.getTime() - mandate.noticeWindowDays * DAY_MS ? "notice" : "off"
}

/** Dias inteiros que faltam para o prazo. Negativo depois dele. */
export function daysUntilDeadline(now: Date, mandate: MfaMandate = MFA_MANDATE): number | null {
	if (!mandate.deadline) return null
	const deadline = parseDeadline(mandate.deadline)
	if (!deadline) return null
	return Math.ceil((deadline.getTime() - now.getTime()) / DAY_MS)
}

/** A data do prazo, por extenso, para o texto da faixa. */
export function formatDeadline(mandate: MfaMandate = MFA_MANDATE): string | null {
	if (!mandate.deadline) return null
	const deadline = parseDeadline(mandate.deadline)
	return deadline ? deadline.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : null
}

/** Estado da conta que a faixa e a tela obrigatória consomem. */
export interface MfaMandateSubject {
	/** Conta protegida — a que alcança operação classificada (design.md D9). */
	isProtectedAccount: boolean
	/** Fatores TOTP verificados na conta. */
	verifiedCount: number
	/** `false` quando a sessão nasceu de link de recuperação: ela nem cadastra nem remove. */
	canManageFactors: boolean
}

/**
 * O que a UI deve fazer por esta conta, nesta fase.
 *
 * - `none` — nada aparece.
 * - `notice` — faixa dispensável.
 * - `enroll` — tela de cadastro depois do login.
 *
 * A obrigatoriedade recai sobre a CONTA PROTEGIDA, derivada do registro de classificação —
 * nunca sobre um número de nível PBAC (spec `mfa-enrollment`). Os ~800 comensais não são
 * avisados de um prazo que não vale para eles: aviso que não é para você é o que ensina a
 * ignorar o que é.
 *
 * Sessão de recuperação de senha não recebe nem faixa nem tela: ela não pode cadastrar fator
 * (é a linha que sustenta o valor do 2FA), então mandá-la cadastrar seria um beco sem saída.
 */
export function mfaMandateAction(phase: MfaMandatePhase, subject: MfaMandateSubject): "none" | "notice" | "enroll" {
	if (phase === "off") return "none"
	if (!subject.isProtectedAccount) return "none"
	if (subject.verifiedCount > 0) return "none"
	if (!subject.canManageFactors) return "none"
	return phase === "enforced" ? "enroll" : "notice"
}
