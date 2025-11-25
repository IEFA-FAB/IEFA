import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface TableOfContentsProps {
	items: {
		id: string;
		title: string;
	}[];
}

export function TableOfContents({ items }: TableOfContentsProps) {
	const [activeId, setActiveId] = useState<string>("");

	useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting) {
						setActiveId(entry.target.id);
					}
				});
			},
			{ rootMargin: "-20% 0% -35% 0%" },
		);

		items.forEach((item) => {
			const element = document.getElementById(item.id);
			if (element) observer.observe(element);
		});

		return () => observer.disconnect();
	}, [items]);

	const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
		e.preventDefault();
		const element = document.getElementById(id);
		if (element) {
			const yOffset = -100; // Adjust for fixed header
			const y =
				element.getBoundingClientRect().top + window.pageYOffset + yOffset;
			window.scrollTo({ top: y, behavior: "smooth" });
		}
	};

	return (
		<nav className="space-y-2">
			<p className="font-semibold mb-4 text-sm text-foreground/80 uppercase tracking-wider">
				Nesta página
			</p>
			<ul className="space-y-2 text-sm border-l border-border/40">
				{items.map((item) => (
					<li key={item.id}>
						<a
							href={`#${item.id}`}
							onClick={(e) => handleClick(e, item.id)}
							className={cn(
								"block pl-4 py-1 transition-all border-l-2 -ml-[1px]",
								activeId === item.id
									? "border-primary text-primary font-medium"
									: "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
							)}
						>
							{item.title}
						</a>
					</li>
				))}
			</ul>
		</nav>
	);
}
