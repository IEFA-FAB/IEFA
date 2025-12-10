import { PortableTextBlock } from "@sanity/types";

export interface PostAuthor {
	name: string;
	image?: any; // Sanity Image type could be more specific but 'any' for the source object is acceptable for now if using urlFor(source) which takes SanityImageSource
}

export interface PostImage {
	asset: {
		_ref: string;
	};
	alt?: string;
	caption?: string;
	layout?: "full" | "normal";
}

export interface PostSummary {
	title: string;
	slug: { current: string };
	publishedAt: string;
	excerpt: string;
	author: PostAuthor;
	mainImage?: PostImage;
}

export interface PostDetail extends PostSummary {
	body: (PortableTextBlock & { [key: string]: any })[];
}
