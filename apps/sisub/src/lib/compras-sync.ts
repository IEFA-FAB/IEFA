import type { SyncLog, SyncStep } from "@/types/domain/compras-sync"

export function statusColor(status: SyncLog["status"] | SyncStep["status"]) {
	switch (status) {
		case "running":
			return "bg-info/15 text-info"
		case "success":
			return "bg-success/15 text-success"
		case "partial":
			return "bg-warning/15 text-warning"
		case "error":
			return "bg-destructive/15 text-destructive"
		case "pending":
			return "bg-muted text-muted-foreground"
		default:
			return "bg-muted text-muted-foreground"
	}
}

export function statusLabel(status: string) {
	const map: Record<string, string> = {
		running: "Rodando",
		success: "Concluído",
		partial: "Parcial",
		error: "Erro",
		pending: "Aguardando",
	}
	return map[status] ?? status
}

export function formatSyncDate(iso: string | null) {
	if (!iso) return "—"
	return new Intl.DateTimeFormat("pt-BR", {
		dateStyle: "short",
		timeStyle: "short",
	}).format(new Date(iso))
}
