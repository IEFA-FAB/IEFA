import {
	Badge,
	Button,
	Card,
	CardContent,
	CardFooter,
	CardHeader,
} from "@iefa/ui";
import { Link } from "@tanstack/react-router";
import { User } from "lucide-react";
import { urlFor } from "@/lib/sanity";
import type { PostSummary } from "@/types/domain";

export function PostCard({ post }: { post: PostSummary }) {
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
				<Button
					render={
						<Link to="/posts/$slug" params={{ slug: post.slug.current }}>
							Ler Artigo
						</Link>
					}
					className="w-full"
					variant="secondary"
				/>
			</CardFooter>
		</Card>
	);
}
