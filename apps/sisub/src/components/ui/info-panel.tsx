import { Link } from "@tanstack/react-router"
import { ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type InfoPanelProps = {
	/** Lucide icon component */
	icon: React.ComponentType<{ className?: string }>
	/** Small mono label above the title (e.g. "Tutorial", "Novidades") */
	label: string
	title: string
	description: string
	/** Tags rendered as outline badges */
	tags?: string[]
	/** TanStack Router route `to` */
	to: string
	/** CTA button text */
	cta: string
	className?: string
}

function InfoPanel({ icon: Icon, label, title, description, tags = [], to, cta, className }: InfoPanelProps) {
	return (
		<div className={cn("border border-border rounded-md bg-card p-5 flex flex-col gap-4", "hover:bg-muted/30 transition-colors", className)}>
			{/* Panel label */}
			<div className="flex items-center gap-2">
				<Icon className="h-3.5 w-3.5 text-primary flex-shrink-0" aria-hidden />
				<span className="font-mono text-xs text-muted-foreground uppercase tracking-widest">{label}</span>
			</div>

			{/* Title + description */}
			<div>
				<h3 className="font-bold text-lg text-foreground mb-1">{title}</h3>
				<p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
			</div>

			{/* Tags */}
			{tags.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{tags.map((tag) => (
						<Badge key={tag} variant="outline">
							{tag}
						</Badge>
					))}
				</div>
			)}

			{/* CTA */}
			<Button
				variant="outline"
				nativeButton={false}
				render={
					<Link to={to} className="flex items-center gap-2">
						{cta}
						<ChevronRight className="h-4 w-4" />
					</Link>
				}
				className="self-start mt-auto"
			/>
		</div>
	)
}

export type { InfoPanelProps }
export { InfoPanel }
