/**
 * @module image-placeholder
 * Regras puras do LQIP (low-quality image placeholder) das ilustrações de uniforme.
 *
 * O placeholder é um data URL de ~1,5 KB gerado por `Bun.Image#placeholder()`
 * (ThumbHash renderizado como PNG de ≤32px). Ele viaja junto da linha no mesmo SELECT
 * que já traz `image_path`, então a prévia borrada aparece no primeiro paint — antes
 * de existir URL assinada, e muito antes do arquivo real (grande e privado) terminar
 * de baixar.
 *
 * A geração mora no servidor (`image-placeholder.server.ts`); aqui ficam só as regras
 * que precisam ser verificáveis sem runtime de Bun nem rede.
 */

/**
 * Prefixo emitido por `Bun.Image#placeholder()`. O método sempre devolve PNG,
 * independente do formato da origem — o thumbhash é rasterizado, não reencodado.
 */
const PLACEHOLDER_PREFIX = "data:image/png;base64,"

/**
 * Teto defensivo do tamanho do data URL. Medido no acervo real (240 ilustrações, 3:4):
 * média 1.574 e máximo 2.742 caracteres — bem acima dos 400–700 que a doc do Bun cita,
 * porque aquele número é de imagem larga e estas são altas. 4096 deixa ~1,5x de folga
 * sobre o pior caso observado e ainda pega "a imagem inteira foi embutida por engano",
 * que viajaria em TODA linha de TODA listagem do catálogo.
 *
 * Estourar o teto é SEGURO: `buildImagePlaceholder` devolve null e a linha fica sem
 * prévia. O valor nunca chega no CHECK do banco, que rejeitaria o upsert inteiro e
 * faria o usuário perder o save por causa da miniatura.
 */
export const MAX_PLACEHOLDER_CHARS = 4096

/** Aceita como placeholder só o que tem a cara do que o Bun gera, e no tamanho certo. */
export function isPlaceholderDataUrl(value: unknown): value is string {
	return typeof value === "string" && value.startsWith(PLACEHOLDER_PREFIX) && value.length <= MAX_PLACEHOLDER_CHARS
}

type PlaceholderActionInput = {
	/** Caminho que a linha vai passar a ter. `null` = imagem removida; `undefined` = payload não toca na imagem. */
	nextPath: string | null | undefined
	/** Caminho que a linha tem hoje. */
	currentPath: string | null | undefined
	/** Placeholder que a linha tem hoje. */
	currentPlaceholder: string | null | undefined
	/**
	 * O chamador acabou de gravar BYTES em `nextPath`.
	 *
	 * Sem isto a decisão por caminho erra o caso mais comum do admin: o upload usa um path
	 * derivado da variante (`<uniform>/<variant>.<ext>`) com `upsert: true` no storage, então
	 * trocar a ilustração por outra do mesmo formato mantém o path IGUAL. A regra por caminho
	 * concluiria "nada mudou" e o blur continuaria prevendo a ilustração anterior — que é o
	 * pior modo de falha possível aqui, porque a mentira só existe no intervalo em que ninguém
	 * consegue conferir (antes de a imagem real carregar por cima).
	 */
	uploaded?: boolean
}

/**
 * O que fazer com `blur_placeholder` num upsert.
 *
 * - `"build"` — baixar o arquivo e gerar.
 * - `"clear"` — gravar `null`. A imagem foi removida; manter o blur antigo deixaria a
 *   silhueta de uma ilustração que não existe mais no lugar do estado "sem ilustração".
 * - `"keep"` — não mexer. Payload que não fala de imagem, ou mesmo arquivo já com
 *   placeholder válido — rebaixar de novo custaria um download por save.
 */
export function placeholderActionFor({ nextPath, currentPath, currentPlaceholder, uploaded }: PlaceholderActionInput): "build" | "clear" | "keep" {
	if (nextPath === undefined) return "keep"
	if (nextPath === null) return currentPlaceholder ? "clear" : "keep"
	if (uploaded) return "build"
	if (nextPath !== currentPath) return "build"
	return isPlaceholderDataUrl(currentPlaceholder) ? "keep" : "build"
}
