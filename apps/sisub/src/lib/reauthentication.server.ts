/**
 * @module reauthentication.server
 * Reautenticação por senha: prova que quem está na sessão CONHECE a senha da conta.
 *
 * ## Por que isto existe (design.md D14)
 *
 * Cadastrar o primeiro fator só pode exigir AAL1 — a conta ainda não tem fator nenhum. Junto
 * com o comportamento do GoTrue ("ao verificar um fator, as demais sessões são encerradas"),
 * isso desenha um ataque: quem rouba uma sessão cadastra o próprio TOTP, o titular é
 * desconectado de tudo e o atacante fica em AAL2 — com a vítima sem caminho de volta. A
 * senha, pedida de novo imediatamente antes do `enroll`, é o que fecha essa janela.
 *
 * Do SEGUNDO fator em diante a exigência não se repete: o GoTrue responde `403
 * insufficient_aal` ao `enroll` feito fora de AAL2, então pedir a senha ali seria atrito sem
 * ganho.
 *
 * ## Por que não é `auth.reauthenticate()`
 *
 * O `reauthenticate()` do supabase-js não confere senha: ele dispara um nonce por e-mail, que
 * é a etapa da "Secure password change". Aqui a prova pedida é a SENHA, e a única forma de
 * conferi-la contra o GoTrue é um `signInWithPassword`.
 *
 * ## Por que num client separado
 *
 * Feita pelo client SSR, a conferência gravaria a sessão nova nos cookies do usuário —
 * trocando, no meio de um fluxo de segurança, a sessão que o app acabou de autorizar. O
 * client sem estado (`@iefa/supabase-kit`) não enxerga cookie nenhum, e a sessão descartável
 * que a conferência cria é revogada com escopo **local** logo em seguida. Escopo global (o
 * default de `signOut()`) derrubaria todas as sessões do titular — o oposto do que uma
 * conferência de senha pode causar, e exatamente o que o cenário "nenhuma sessão do titular é
 * encerrada" da spec proíbe.
 *
 * @domain app
 */

import { normalizeEmail } from "@iefa/auth-kit"
import { getStatelessAuthClient } from "@/lib/supabase.server"

/**
 * `true` quando a senha confere com a da conta.
 *
 * O `email` DEVE vir da sessão (`requireUser()`), nunca do payload: aceitar o e-mail do
 * cliente transformaria isto num oráculo de senha de qualquer conta do sistema.
 *
 * Erro do provider vira `false` — a função responde "a senha confere?", e "não deu para
 * saber" não pode ser lido como "sim".
 */
export async function verifyAccountPassword(email: string, password: string): Promise<boolean> {
	if (!email || !password) return false

	const client = getStatelessAuthClient()

	const { error } = await client.auth.signInWithPassword({ email: normalizeEmail(email), password })
	if (error) return false

	// Escopo LOCAL: revoga apenas a sessão descartável que a conferência acabou de criar.
	// Falha aqui não invalida a prova da senha — no pior caso sobra uma sessão órfã que
	// expira sozinha, e derrubar o cadastro por causa disso seria pior.
	await client.auth.signOut({ scope: "local" }).catch(() => undefined)
	return true
}
