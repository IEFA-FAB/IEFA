import { Link } from "@tanstack/react-router"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const navLinkVariants = cva(
	[
		// Base
		"relative inline-flex cursor-pointer items-center pb-0.5",
		"font-mono text-xs uppercase tracking-widest",
		"transition-colors duration-150",
		"focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring rounded-sm",
		// Underline slide-in
		"after:absolute after:bottom-0 after:left-0 after:h-px after:w-full after:bg-primary",
		"after:scale-x-0 after:origin-left",
		"after:transition-transform after:duration-200 after:ease-out",
		"hover:after:scale-x-100",
		"aria-[current=page]:after:scale-x-100",
	],
	{
		variants: {
			variant: {
				default: "text-muted-foreground hover:text-foreground aria-[current=page]:text-foreground",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	}
)

type NavLinkProps = React.ComponentProps<typeof Link> & VariantProps<typeof navLinkVariants>

function NavLink({ variant, className, ...props }: NavLinkProps) {
	return <Link className={cn(navLinkVariants({ variant }), className)} {...props} />
}

export { NavLink, navLinkVariants }
