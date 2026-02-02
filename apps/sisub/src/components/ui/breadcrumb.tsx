import { cn } from "@iefa/ui"
import type { ReactNode } from "react"

// Breadcrumb components - simple implementation for navigation
export function Breadcrumb({ children }: { children: ReactNode }) {
	return <nav aria-label="Breadcrumb">{children}</nav>
}

export function BreadcrumbList({
	children,
	className,
}: {
	children: ReactNode
	className?: string
}) {
	return <ol className={cn("flex items-center gap-2", className)}>{children}</ol>
}

export function BreadcrumbItem({ children }: { children: ReactNode }) {
	return <li className="inline-flex items-center">{children}</li>
}

export function BreadcrumbLink({ children, render }: { children?: ReactNode; render?: ReactNode }) {
	if (render) {
		return <>{render}</>
	}
	return <span>{children}</span>
}

export function BreadcrumbSeparator({ className }: { className?: string }) {
	return <span className={cn("mx-1", className)}>/</span>
}
