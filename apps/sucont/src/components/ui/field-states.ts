/**
 * Somente leitura dos campos de digitação, pelo atributo `readonly` e não por `:read-only`: a
 * pseudoclasse também casa campo desabilitado e tipos em que o atributo não se aplica (`file`,
 * `checkbox`, `color`), que sairiam tracejados sem ninguém ter pedido. O desabilitado segue só com
 * a opacidade do `disabled:`. No escuro `--muted` é a cor da borda: em tom cheio, o tracejado
 * sumiria.
 */
export const READ_ONLY_FIELD =
	"[&[readonly]:not(:disabled)]:cursor-default [&[readonly]:not(:disabled)]:border-dashed [&[readonly]:not(:disabled)]:bg-muted dark:[&[readonly]:not(:disabled)]:bg-muted/50"
