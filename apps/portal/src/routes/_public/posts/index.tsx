import { Separator } from "@iefa/ui"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Suspense } from "react"
import { PostCard } from "@/components/PostCard"
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

export const Route = createFileRoute("/_public/posts/")({
	loader: ({ context: { queryClient } }) => {
		return queryClient.ensureQueryData(postsQueryOptions)
	},
	component: PostsIndex,
})

function PostsIndex() {
	const { data: posts } = useSuspenseQuery(postsQueryOptions)

	return (
		<div className="relative flex flex-col items-center justify-center w-full text-foreground p-4 md:p-8">
			<section className="w-full max-w-5xl">
				<div className="flex flex-col gap-2">
					<h2 className="text-3xl font-bold tracking-tight">Blog & Artigos</h2>
					<p className="text-muted-foreground">
						Acompanhe nossas últimas atualizações e tutoriais.
					</p>
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
