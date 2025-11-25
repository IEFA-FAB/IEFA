import { cn } from "@/lib/utils";

export const BentoGrid = ({
	className,
	children,
}: {
	className?: string;
	children?: React.ReactNode;
}) => {
	return (
		<div
			className={cn(
				"grid auto-rows-auto md:auto-rows-[minmax(18rem,auto)] grid-cols-1 md:grid-cols-3 gap-3 md:gap-6 max-w-7xl mx-auto ",
				className,
			)}
		>
			{children}
		</div>
	);
};

export const BentoGridItem = ({
	className,
	title,
	description,
	header,
	icon,
}: {
	className?: string;
	title?: string | React.ReactNode;
	description?: string | React.ReactNode;
	header?: React.ReactNode;
	icon?: React.ReactNode;
}) => {
	return (
		<div
			className={cn(
				"row-span-1 rounded-xl group/bento hover:shadow-xl transition duration-200 shadow-sm dark:shadow-none p-5 md:p-6 bg-card border border-border justify-between flex flex-col space-y-4 hover:border-primary/50 hover:bg-accent/5 relative overflow-hidden",
				className,
			)}
		>
			<div className="absolute inset-0 bg-linear-to-br from-primary/5 to-transparent opacity-0 group-hover/bento:opacity-100 transition-opacity duration-500" />
			<div className="relative z-10">
				{header}
				<div className="group-hover/bento:translate-x-2 transition duration-200">
					{icon}
					<div className="font-sans font-bold text-card-foreground mb-2 mt-2 group-hover/bento:text-primary transition-colors">
						{title}
					</div>
					<div className="font-sans font-normal text-muted-foreground text-xs group-hover/bento:text-foreground transition-colors">
						{description}
					</div>
				</div>
			</div>
		</div>
	);
};
