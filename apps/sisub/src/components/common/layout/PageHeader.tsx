import { Button } from "@iefa/ui";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

interface PageHeaderProps {
	title: string;
	description?: string;
	children?: ReactNode;
	onBack?: () => void;
}

export function PageHeader({
	title,
	description,
	children,
	onBack,
}: PageHeaderProps) {
	return (
		<header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between px-1">
			<div className="flex items-center gap-4">
				{onBack && (
					<Button variant="ghost" size="icon" onClick={onBack}>
						<ArrowLeft className="w-5 h-5" />
					</Button>
				)}
				<div className="space-y-1.5">
					<h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
						{title}
					</h1>
					{description && (
						<p className="text-sm text-muted-foreground">{description}</p>
					)}
				</div>
			</div>
			{children && (
				<div className="flex flex-wrap items-center gap-2">{children}</div>
			)}
		</header>
	);
}
