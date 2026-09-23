import type { SnackRequestStatus } from "@iefa/sisub-domain/utils"
import { Badge } from "@/components/ui/badge"
import { STATUS_BADGE_VARIANT, statusLabel } from "./snack-format"

export function SnackStatusBadge({ status }: { status: string }) {
	return <Badge variant={STATUS_BADGE_VARIANT[status as SnackRequestStatus] ?? "secondary"}>{statusLabel(status)}</Badge>
}
