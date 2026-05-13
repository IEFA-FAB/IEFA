import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Suspense, useMemo } from "react"
import { useCommandPaletteItems } from "@/components/command-palette/CommandPaletteProvider"
import { PostCard } from "@/components/PostCard"
import { Separator } from "@/components/ui/separator"
import { client } from "@/lib/sanity"
import type { PostSummary } from "@/types/domain"

const postsQueryOptions = {
	queryKey: ["posts"],
	queryFn: async () => {
		return await client.fetch<PostSummary[]>(`*[_type == "post"] | order(publishedAt desc) {
      title, slug, publishedAt, excerpt, mainImage, author->{name}
    }`)
	},
	staleTime: 1000 * 60 * 5, // 5 minutes
}

export const Route = createFileRoute("/_public/_en/posts/")({
	staticData: {
		nav: {
			title: "Blog & Artigos",
			section: "Portal",
			subtitle: "Conteúdo editorial e atualizações do portal",
			keywords: ["blog", "posts", "artigos", "noticias", "conteudo"],
			order: 30,
		},
	},
	loader: ({ context: { queryClient } }) => {
		return queryClient.ensureQueryData(postsQueryOptions)
	},
	component: PostsIndex,
})

function PostsIndex() {
	const { data: posts } = useSuspenseQuery(postsQueryOptions)
	const navigate = Route.useNavigate()
	const commandItems = useMemo(() => {
		return posts.map((post) => ({
			id: `post:${post.slug.current}`,
			kind: "context" as const,
			title: post.title,
			section: "Blog & Artigos",
			subtitle: post.excerpt,
			keywords: [post.author?.name, post.slug.current].filter(Boolean) as string[],
			perform: () => {
				void navigate({
					to: "/posts/$slug",
					params: { slug: post.slug.current },
				})
			},
		}))
	}, [navigate, posts])

	useCommandPaletteItems(commandItems)

	return (
		<div className="relative flex flex-col items-center justify-center w-full text-foreground p-4 md:p-8">
			<section className="w-full max-w-5xl">
				<div className="flex flex-col gap-2">
					<h2 className="text-3xl font-bold tracking-tight">Blog & Artigos</h2>
					<p className="text-muted-foreground">Acompanhe nossas últimas atualizações e tutoriais.</p>
				</div>

				<Separator className="my-8" />
				<Suspense fallback={<div>Carregando posts...</div>}>
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
						{posts.map((post) => (
							<PostCard key={post.slug.current} post={post} />
						))}
					</div>
				</Suspense>
			</section>
		</div>
	)
}
