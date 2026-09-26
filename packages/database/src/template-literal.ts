/**
 * Texto que vai para dentro de um template literal de um arquivo GERADO (ex.: o default de
 * coluna que `scripts/patch-drizzle-pull.ts` copia do banco para `sql\`…\``). Barra invertida
 * primeiro — senão as fugas seguintes viram fuga dela —, depois crase e `${`. Sem isso, um
 * default com `\` ou `${` quebraria o TS gerado ou viraria interpolação.
 */
export function escapeTemplateLiteral(text: string): string {
	return text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${")
}
