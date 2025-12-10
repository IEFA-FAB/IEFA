import {
	Badge,
	Button,
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	Separator,
} from "@iefa/ui";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { User } from "lucide-react";
import { client, urlFor } from "@/lib/sanity";

import type { PostSummary } from "@/types/domain";

// 2. Query GROQ para buscar a lista
const postsQuery = `*[_type == "post"] | order(publishedAt desc) {
  title,
  slug,
  publishedAt,
  excerpt,
  mainImage,
  author->{name}
}`;

export const Route = createFileRoute("/_public/posts/")({
	component: PostsIndex,
});

function PostCard({ post }: { post: PostSummary }) {
	return (
		<Card className="group h-full flex flex-col border border-border bg-card text-card-foreground transition-all hover:border-primary/40 hover:shadow-lg">
			{/* Imagem de Capa (Opcional) */}
			{post.mainImage && (
				<div className="w-full h-48 overflow-hidden rounded-t-xl">
					<img
						src={urlFor(post.mainImage).width(400).height(200).url()}
						alt={post.title}
						className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
					/>
				</div>
			)}
			<CardHeader className="pb-2">
				<div className="flex items-center justify-between mb-2">
					<Badge variant="outline" className="text-xs font-normal">
						{new Date(post.publishedAt).toLocaleDateString("pt-BR")}
					</Badge>
				</div>
				<h3 className="text-lg font-semibold leading-tight line-clamp-2">
					{post.title}
				</h3>
			</CardHeader>
			<CardContent className="grow space-y-3">
				<p className="text-sm text-muted-foreground line-clamp-3">
					{post.excerpt}
				</p>

				{post.author && (
					<div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
						<User className="h-3 w-3" />
						<span>{post.author.name}</span>
					</div>
				)}
			</CardContent>
			<CardFooter className="pt-4">
				<Button asChild className="w-full" variant="secondary">
					{/* Link para a rota dinâmica */}
					<Link to="/posts/$slug" params={{ slug: post.slug.current }}>
						Ler Artigo
					</Link>
				</Button>
			</CardFooter>
		</Card>
	);
}

function PostsIndex() {
	const {
		data: posts,
		isLoading,
		isError,
	} = useQuery({
		queryKey: ["posts"],
		queryFn: async () => {
			return await client.fetch<PostSummary[]>(postsQuery);
		},
		staleTime: Number.POSITIVE_INFINITY,
	});

	if (isLoading) {
		return (
			<div className="flex items-center justify-center p-8">
				<div className="text-muted-foreground">Carregando posts...</div>
			</div>
		);
	}

	if (isError || !posts) {
		return (
			<div className="flex items-center justify-center p-8">
				<div className="text-destructive">Erro ao carregar posts.</div>
			</div>
		);
	}

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

				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
					{posts.map((post) => (
						<PostCard key={post.slug.current} post={post} />
					))}
				</div>
			</section>
		</div>
	);
}
