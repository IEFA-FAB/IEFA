import { createFileRoute, notFound } from "@tanstack/react-router"
import browserCollections from "collections/browser"
import { useFumadocsLoader } from "fumadocs-core/source/client"
import { DocsLayout } from "fumadocs-ui/layouts/docs"
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page"
import { Suspense } from "react"
import { useMDXComponents } from "@/components/mdx"
import { getDocsIndex } from "@/lib/docs-index"
import { baseOptions } from "@/lib/layout.shared"

export const Route = createFileRoute("/docs/$")({
	component: Page,
	loader: async ({ params }) => {
		const slugs = params._splat?.split("/").filter(Boolean) ?? []
		const { pageTree, paths } = await getDocsIndex()

		const path = paths[slugs.join("/")]
		if (!path) throw notFound()

		return { path, pageTree }
	},
})

function DocsContent({
	toc,
	frontmatter,
	MDX,
}: {
	toc: React.ComponentProps<typeof DocsPage>["toc"]
	frontmatter: { title?: string; description?: string }
	MDX: React.ElementType
}) {
	const components = useMDXComponents()
	return (
		<DocsPage toc={toc}>
			<DocsTitle>{frontmatter.title}</DocsTitle>
			<DocsDescription>{frontmatter.description}</DocsDescription>
			<DocsBody>
				<MDX components={components} />
			</DocsBody>
		</DocsPage>
	)
}

const clientLoader = browserCollections.docs.createClientLoader({
	component({ toc, frontmatter, default: MDX }) {
		return <DocsContent toc={toc} frontmatter={frontmatter} MDX={MDX} />
	},
})

function Page() {
	const { path, pageTree } = useFumadocsLoader(Route.useLoaderData())

	return (
		<DocsLayout {...baseOptions()} tree={pageTree}>
			<Suspense>{clientLoader.useContent(path)}</Suspense>
		</DocsLayout>
	)
}
