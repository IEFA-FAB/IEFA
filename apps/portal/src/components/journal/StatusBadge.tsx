// Status badge component for article status visualization

import { Check, Clock, EditPencil, Eye, Globe, Page, Xmark } from "iconoir-react"
import type React from "react"
import type { ArticleStatus } from "@/lib/journal/types"
import { Badge } from "../ui/badge"

interface StatusBadgeProps {
	status: ArticleStatus
	className?: string
}

const statusConfig: Record<
	ArticleStatus,
	{
		label: string
		variant: "default" | "secondary" | "destructive" | "outline"
		icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
	}
> = {
	draft: {
		label: "Rascunho",
		variant: "secondary",
		icon: Page,
	},
	submitted: {
		label: "Submetido",
		variant: "default",
		icon: Clock,
	},
	under_review: {
		label: "Em Revisão",
		variant: "default",
		icon: Eye,
	},
	revision_requested: {
		label: "Revisão Solicitada",
		variant: "outline",
		icon: EditPencil,
	},
	revised_submitted: {
		label: "Revisão Enviada",
		variant: "default",
		icon: Check,
	},
	accepted: {
		label: "Aceito",
		variant: "default",
		icon: Check,
	},
	rejected: {
		label: "Rejeitado",
		variant: "destructive",
		icon: Xmark,
	},
	published: {
		label: "Publicado",
		variant: "default",
		icon: Globe,
	},
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
	const config = statusConfig[status]
	const Icon = config.icon

	return (
		<Badge variant={config.variant} className={className}>
			<Icon className="size-3 mr-1" />
			{config.label}
		</Badge>
	)
}
