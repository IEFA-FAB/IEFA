import type { SyncLog, SyncStep } from "@/types/domain/compras-sync"

export function statusColor(status: SyncLog["status"] | SyncStep["status"]) {
	switch (status) {
		case "running":
			return "bg-blue-500/15 text-blue-700 dark:text-blue-400"
		case "success":
			return "bg-green-500/15 text-green-700 dark:text-green-400"
		case "partial":
			return "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400"
		case "error":
			return "bg-red-500/15 text-red-700 dark:text-red-400"
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
