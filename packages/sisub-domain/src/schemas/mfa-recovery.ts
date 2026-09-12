import { z } from "zod"

/**
 * Códigos de recuperação de segundo fator (`access_control.mfa_recovery_code`).
 *
 * Nenhum schema aqui carrega o dono: o titular é SEMPRE a sessão (`ctx.userId`). Aceitar
 * um `userId` do chamador deixaria qualquer sessão queimar — ou minerar — o código de
 * recuperação de outra pessoa, que é o pior IDOR possível num fluxo de recuperação.
 */

/**
 * Quantos códigos uma geração emite.
 *
 * Dez porque a spec diz dez, e o número tem uma razão: menos que isso vira "acabaram os
 * códigos" em quem usa dois e perde a folha; mais vira uma lista que ninguém guarda.
 */
export const RECOVERY_CODE_COUNT = 10

/**
 * Alfabeto Crockford Base32 — dígitos e letras, **sem** `I`, `L`, `O` e `U`.
 *
 * São 32 símbolos exatos, e isso importa duas vezes: (1) `byte & 31` sorteia sem viés,
 * sem rejeição e sem módulo enviesado; (2) o código é transcrito À MÃO de uma folha
 * impressa, e `I`/`1`, `O`/`0` são o par que faz alguém concluir que "o código não
 * funciona". `U` sai para não formar palavra ofensiva por acidente.
 */
export const RECOVERY_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

/** Símbolos por grupo, e grupos por código: `XXXX-XXXX-XXXX`. */
export const RECOVERY_CODE_GROUP_SIZE = 4
export const RECOVERY_CODE_GROUPS = 3

/**
 * Entropia de um código: 12 símbolos × 5 bits = 60 bits.
 *
 * É o número que sustenta a decisão de guardar SHA-256 e não um hash lento (design.md
 * D12): não é senha de humano, é aleatório de 60 bits — não há espaço de busca para o
 * hash lento defender, e o limite de tentativas do servidor fecha o resto.
 */
export const RECOVERY_CODE_ENTROPY_BITS = RECOVERY_CODE_GROUP_SIZE * RECOVERY_CODE_GROUPS * 5

/**
 * Código informado pelo usuário.
 *
 * A normalização (maiúsculas, separadores fora, `I`/`L` → `1`, `O` → `0`) roda na
 * operation, e não aqui, porque ela é a MESMA regra usada na geração — deixá-la só no
 * schema faria o caminho que não passa pelo validator normalizar diferente.
 *
 * O teto de 64 caracteres é anti-abuso puro: o que chega além disso não é código, é
 * carga. O piso de 1 existe para o campo vazio dar erro de campo, não erro de código.
 */
export const ConsumeRecoveryCodeSchema = z.object({
	code: z.string().trim().min(1, "Informe o código de recuperação.").max(64),
})
export type ConsumeRecoveryCode = z.infer<typeof ConsumeRecoveryCodeSchema>
