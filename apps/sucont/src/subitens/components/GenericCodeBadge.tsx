// Marca do tipo de código genérico da conta corrente: subitem 99 × favorecido 999.
import { Badge } from "#/components/ui/badge"
import { GENERIC_CODE_LABELS } from "#/subitens/generic-code"
import type { GenericCodeKind } from "#/subitens/types"

/**
 * Cor por tipo, e não por gravidade: as duas marcas pedem providência, mas o subitem 99 se
 * corrige na natureza de despesa e o 999 no favorecido. O rótulo diz qual; a cor só separa.
 */
const VARIANT_BY_KIND = {
	"subitem-99": "destructive",
	"favorecido-999": "warning",
} as const satisfies Record<GenericCodeKind, "destructive" | "warning">

export function GenericCodeBadge({ kind }: { kind: GenericCodeKind }) {
	return <Badge variant={VARIANT_BY_KIND[kind]}>{GENERIC_CODE_LABELS[kind]}</Badge>
}

/** As marcas de uma ocorrência; a conta corrente com os dois códigos mostra as duas. */
export function GenericCodeBadges({ kinds }: { kinds: readonly GenericCodeKind[] }) {
	return (
		<div className="flex flex-wrap gap-1">
			{kinds.map((kind) => (
				<GenericCodeBadge key={kind} kind={kind} />
			))}
		</div>
	)
}
