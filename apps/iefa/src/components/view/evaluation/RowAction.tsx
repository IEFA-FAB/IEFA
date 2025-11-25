import type React from "react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

export function RowAction({
	title,
	onClick,
	children,
}: {
	title: string;
	onClick?: () => void;
	children: React.ReactNode;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={onClick}
					className="h-8 w-8 p-0 text-slate-700 dark:text-slate-300"
					title={title}
					aria-label={title}
				>
					{children}
				</Button>
			</TooltipTrigger>
			<TooltipContent>{title}</TooltipContent>
		</Tooltip>
	);
}
