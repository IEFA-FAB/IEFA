import type { LucideProps } from "lucide-react"
import dynamicIconImports from "lucide-react/dynamicIconImports"
import type React from "react"
import { lazy, Suspense, useMemo } from "react"

const FALLBACK_ICON = "wrench" as const

const toPascalName = (name: string) =>
	name
		.trim()
		.replace(/[-_ ]+(\w)/g, (_, c: string) => c.toUpperCase())
		.replace(/^\w/, (c) => c.toUpperCase())

const toKebabName = (name: string) =>
	name
		.trim()
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.replace(/[\s_]+/g, "-")
		.toLowerCase()

function resolveIconLoader(name?: string | null) {
	const map = dynamicIconImports as Record<
		string,
		() => Promise<{ default: React.ComponentType<LucideProps> }>
	>

	if (name) {
		const direct = name
		const kebab = toKebabName(name)
		const pascal = toPascalName(name)

		if (map[direct]) return map[direct]
		if (map[kebab]) return map[kebab]
		if (map[pascal]) return map[pascal]
	}
	return map[FALLBACK_ICON]
}

// Cache global para manter o mesmo tipo de componente entre renders
const iconLazyCache = new Map<string, React.LazyExoticComponent<React.ComponentType<LucideProps>>>()

function getLazyIcon(name?: string | null) {
	const key = name ?? FALLBACK_ICON
	if (!iconLazyCache.has(key)) {
		iconLazyCache.set(key, lazy(resolveIconLoader(name)))
	}
	const Icon = iconLazyCache.get(key)
	if (!Icon) throw new Error(`Icon ${key} not found in cache`)
	return Icon
}

export function DynamicIcon({
	name,
	className = "h-5 w-5",
	...rest
}: { name?: string | null } & Omit<LucideProps, "ref">) {
	// Estabiliza a referência; só muda se o "name" mudar
	const LazyIcon = useMemo(() => getLazyIcon(name), [name])
	return (
		<Suspense fallback={<span className={className} aria-hidden="true" />}>
			<LazyIcon aria-hidden="true" className={className} {...rest} />
		</Suspense>
	)
}
