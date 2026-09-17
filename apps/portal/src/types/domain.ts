import type { PortableTextBlock } from "@sanity/types"
import type React from "react"

export interface PostAuthor {
	name: string
	// biome-ignore lint/suspicious/noExplicitAny: Sanity image source wrapper requires loose typing
	image?: any // Sanity Image type could be more specific but 'any' for the source object is acceptable for now if using urlFor(source) which takes SanityImageSource
}

export interface PostImage {
	asset: {
		_ref: string
	}
	alt?: string
	caption?: string
	layout?: "full" | "normal"
}

export interface PostSummary {
	title: string
	slug: { current: string }
	publishedAt: string
	excerpt: string
	author: PostAuthor
	mainImage?: PostImage
}

export interface PostDetail extends PostSummary {
	// biome-ignore lint/suspicious/noExplicitAny: Portable Text can have arbitrary properties
	body: (PortableTextBlock & { [key: string]: any })[]
}

export type Contributor = {
	label: string
	url?: string
	icon?: React.ReactNode
}

export type AppItem = {
	id: string
	title: string
	description: string
	to?: string
	href?: string
	icon?: React.ReactNode
	badges?: string[]
	external?: boolean
	contributors?: Contributor[]
}

export type DbContributor = {
	label: string
	url: string | null
	icon_key: string | null
}

export type DbApp = {
	id: string
	title: string
	description: string
	to_path: string | null
	href: string | null
	icon_key: string | null
	external: boolean | null
	badges: string[] | null
	contributors: DbContributor[] | null
}
