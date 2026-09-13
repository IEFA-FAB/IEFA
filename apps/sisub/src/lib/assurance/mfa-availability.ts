/**
 * @module mfa-availability
 * Modo da verificação em duas etapas no sisub — a chave única acima de todas as outras.
 *
 * ## Os três modos
 *
 * - `"off"`: a funcionalidade não existe. Somem as entradas (menu, perfil, gestão de
 *   permissões), o desvio do login para o desafio e as rotas, e as server functions recusam
 *   com 503 — esta última camada é a que importa, porque `/_serverFn/...` é chamável direto.
 * - `"optional"`: quem quiser cadastra um fator, e daí em diante recebe o desafio no login —
 *   por escolha própria. NINGUÉM é obrigado: nenhuma operação exige AAL2, nenhum prazo de
 *   cadastro é anunciado, e quem gasta um código de recuperação pode seguir sem recadastrar.
 * - `"enforced"`: valem `ASSURANCE_ENFORCEMENT` (`server/assurance-registry.ts`) e
 *   `MFA_MANDATE` (`lib/assurance/mfa-mandate.ts`), cada um com a sua ordem de ativação.
 *
 * ## Por que `"optional"` agora
 *
 * Decisão do mantenedor (2026-09-13): o cadastro voluntário fica possível, mas ninguém pode
 * precisar de segundo fator. Os dois consumidores de exigência — o piso por operação e o prazo
 * de cadastro — consultam ESTE modo antes da própria configuração, de modo que ligar só um deles
 * por engano não tranca ninguém fora do sistema.
 *
 * ## Por que constante, e não variável de ambiente
 *
 * Mudar o modo muda o login de todo mundo. Passa por PR e revisão, não por painel.
 */
export type MfaMode = "off" | "optional" | "enforced"

// `as`, e não anotação: sem o cast o TypeScript estreita a constante para o literal, e as
// comparações abaixo virariam "sempre falso" para o compilador.
export const MFA_MODE = "optional" as MfaMode

/** A funcionalidade existe (modo `optional` ou `enforced`): telas, rotas e server fns ativas. */
export const MFA_AVAILABLE = MFA_MODE !== "off"

/**
 * Exigências podem valer (só no modo `enforced`). Fora dele, nenhuma operação exige AAL2 e
 * nenhum prazo de cadastro aparece — independentemente de `ASSURANCE_ENFORCEMENT` e `MFA_MANDATE`.
 */
export const MFA_ENFORCEMENT_ALLOWED = MFA_MODE === "enforced"
