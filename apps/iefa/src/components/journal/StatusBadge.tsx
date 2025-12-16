// Status badge component for article status visualization

import { Badge } from "@iefa/ui";
import { Check, Clock, Edit, Eye, FileText, Globe, X } from "lucide-react";
import type { ArticleStatus } from "@/lib/journal/types";

interface StatusBadgeProps {
	status: ArticleStatus;
	className?: string;
}

const statusConfig: Record<
	ArticleStatus,
	{
		label: string;
		variant: "default" | "secondary" | "destructive" | "outline";
		icon: any;
	}
> = {
	draft: {
		label: "Rascunho",
		variant: "secondary",
		icon: FileText,
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
		icon: Edit,
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
		icon: X,
	},
	published: {
		label: "Publicado",
		variant: "default",
		icon: Globe,
	},
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
	const config = statusConfig[status];
	const Icon = config.icon;

	return (
		<Badge variant={config.variant} className={className}>
			<Icon className="size-3 mr-1" />
			{config.label}
		</Badge>
	);
}
