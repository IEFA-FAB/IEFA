import { Button, Separator } from "@iefa/ui";
import { PortableText, type PortableTextComponents } from "@portabletext/react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { client, urlFor } from "@/lib/sanity";
import type { PostDetail } from "@/types/domain";

// 1. Componentes do Portable Text
const myPortableTextComponents: PortableTextComponents = {
	types: {
		image: ({ value }: { value: any }) => {
			if (!value?.asset?._ref) return null;
			return (
				<figure className="my-8">
					<img
						src={urlFor(value).width(800).fit("max").url()}
						alt={value.alt || "Imagem do post"}
						className={`rounded-lg shadow-md mx-auto ${value.layout === "full" ? "w-full" : "max-w-3xl"}`}
					/>
					{value.caption && (
						<figcaption className="text-center text-sm text-muted-foreground mt-2">
							{value.caption}
						</figcaption>
					)}
				</figure>
			);
		},
		callToAction: ({ value }: { value: { url: string; text: string } }) => (
			<div className="my-8 text-center">
				<a
					href={value.url}
					className={`inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2`}
				>
					{value.text}
				</a>
			</div>
		),
		code: ({ value }: { value: { language: string; code: string } }) => (
			<div className="my-6 rounded-md bg-muted p-4 overflow-x-auto">
				<pre data-language={value.language} className="text-sm font-mono">
					<code>{value.code}</code>
				</pre>
			</div>
		),
	},
	block: {
		h1: ({ children }: { children?: React.ReactNode }) => (
			<h1 className="text-4xl font-bold mt-12 mb-6 text-foreground">
				{children}
			</h1>
		),
		h2: ({ children }: { children?: React.ReactNode }) => (
			<h2 className="text-2xl font-bold mt-10 mb-4 text-foreground">
				{children}
			</h2>
		),
		h3: ({ children }: { children?: React.ReactNode }) => (
			<h3 className="text-xl font-semibold mt-8 mb-3 text-foreground">
				{children}
			</h3>
		),
		normal: ({ children }: { children?: React.ReactNode }) => (
			<p className="mb-4 leading-relaxed text-foreground/90 text-lg">
				{children}
			</p>
		),
		blockquote: ({ children }: { children?: React.ReactNode }) => (
			<blockquote className="border-l-4 border-primary pl-4 italic my-6 text-muted-foreground text-xl">
				{children}
			</blockquote>
		),
	},
	marks: {
		link: ({
			children,
			value,
		}: {
			children?: React.ReactNode;
			value?: { href: string };
		}) => {
			const rel = !value?.href.startsWith("/")
				? "noreferrer noopener"
				: undefined;
			return (
				<a
					href={value?.href}
					rel={rel}
					className="font-medium text-primary underline underline-offset-4 hover:text-primary/80 transition-colors"
				>
					{children}
				</a>
			);
		},
	},
};

// 2. Query para pegar um único post
const postQuery = `*[_type == "post" && slug.current == $slug][0]{
  title,
  mainImage,
  publishedAt,
  author->{name, image},
  body
}`;

export const Route = createFileRoute("/_public/posts/$slug")({
	component: PostDetailComponent,
	loader: async ({ params }): Promise<PostDetail> => {
		const post = await client.fetch<PostDetail>(postQuery, {
			slug: params.slug,
		});
		if (!post) throw notFound();
		return post;
	},
});

function PostDetailComponent() {
	const post = Route.useLoaderData() as PostDetail;

	if (!post) return null;

	return (
		<article className="max-w-4xl mx-auto py-10 px-4 sm:px-6">
			{/* Botão Voltar */}
			<Button
				variant="ghost"
				className="mb-8 group"
				render={
					<Link to="/posts">
						<ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" />
						Voltar para lista
					</Link>
				}
			/>

			{/* Cabeçalho do Post */}
			<header className="mb-10 text-center">
				<div className="text-sm text-muted-foreground mb-4">
					{new Date(post.publishedAt).toLocaleDateString("pt-BR", {
						day: "numeric",
						month: "long",
						year: "numeric",
					})}
				</div>

				<h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-balance mb-6">
					{post.title}
				</h1>

				{post.author && (
					<div className="flex items-center justify-center gap-3">
						{post.author.image && (
							<img
								src={urlFor(post.author.image).width(40).height(40).url()}
								alt={post.author.name}
								className="rounded-full w-10 h-10 object-cover border border-border"
							/>
						)}
						<span className="font-medium text-sm">{post.author.name}</span>
					</div>
				)}
			</header>

			{/* Imagem Principal */}
			{post.mainImage && (
				<div className="mb-12 rounded-xl overflow-hidden shadow-lg">
					<img
						src={urlFor(post.mainImage).width(1200).height(600).url()}
						alt={post.title}
						className="w-full h-auto object-cover"
					/>
				</div>
			)}

			{/* Conteúdo Rico (Medium Style) */}
			<div className="prose prose-lg dark:prose-invert max-w-none">
				<PortableText value={post.body} components={myPortableTextComponents} />
			</div>

			<Separator className="my-12" />

			{/* Rodapé do artigo */}
			<div className="text-center">
				<p className="text-muted-foreground mb-4">Gostou deste artigo?</p>
				<Button render={<Link to="/posts">Ler mais artigos</Link>} />
			</div>
		</article>
	);
}
