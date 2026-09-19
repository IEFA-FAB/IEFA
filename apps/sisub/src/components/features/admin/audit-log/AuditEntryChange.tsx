import type { AuditEntryDescription, AuditField } from "@/lib/audit-log/describe-entry"

/** Acima disso a lista chave/valor de forma desconhecida vira "+N campos". */
const MAX_DETAILS_INLINE = 6

function FieldList({ fields, mono = false }: { fields: AuditField[]; mono?: boolean }) {
	return (
		<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-caption">
			{fields.map((field, index) => (
				// Chave repetida é possível no dado cru (não no mapeado): o índice desambigua.
				<div key={`${field.label}-${index}`} className="contents">
					<dt className={mono ? "font-mono text-muted-foreground" : "text-muted-foreground"}>{field.label}</dt>
					<dd className="min-w-0 break-words text-foreground">{field.value}</dd>
				</div>
			))}
		</dl>
	)
}

/**
 * Coluna "O que mudou": os campos legíveis da forma conhecida e, recolhido, tudo o que foi
 * gravado. Forma desconhecida mostra direto a lista chave/valor — nunca o JSON cru.
 */
export function AuditEntryChange({ description }: { description: AuditEntryDescription }) {
	const { fields, details } = description

	if (fields.length === 0) {
		if (details.length === 0) return <span className="text-caption text-muted-foreground">—</span>
		const shown = details.slice(0, MAX_DETAILS_INLINE)
		const hidden = details.slice(MAX_DETAILS_INLINE)
		return (
			<div className="space-y-1">
				<FieldList fields={shown} mono />
				{hidden.length > 0 && (
					<details>
						<summary className="text-caption text-muted-foreground">+{hidden.length} campos</summary>
						<div className="pt-1">
							<FieldList fields={hidden} mono />
						</div>
					</details>
				)}
			</div>
		)
	}

	return (
		<div className="space-y-1">
			<FieldList fields={fields} />
			{details.length > 0 && (
				<details>
					<summary className="text-caption text-muted-foreground">Dados gravados</summary>
					<div className="pt-1">
						<FieldList fields={details} mono />
					</div>
				</details>
			)}
		</div>
	)
}
