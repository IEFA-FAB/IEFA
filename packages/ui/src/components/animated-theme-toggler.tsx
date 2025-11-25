import { useTheme } from "@iefa/ui";
import { Moon, Sun } from "lucide-react";
import { useRef } from "react";
import { flushSync } from "react-dom";
import { cn } from "@/lib/utils";

interface AnimatedThemeTogglerProps
	extends React.ComponentPropsWithoutRef<"button"> {
	duration?: number;
}

export const AnimatedThemeToggler = ({
	className,
	duration = 400,
	...props
}: AnimatedThemeTogglerProps) => {
	const { toggle } = useTheme();
	const buttonRef = useRef<HTMLButtonElement>(null);

	const handleToggle = async () => {
		if (!document.startViewTransition) {
			toggle();
			return;
		}

		const button = buttonRef.current;
		if (!button) return;

		await document.startViewTransition(() => {
			flushSync(() => {
				toggle();
			});
		}).ready;

		const { top, left, width, height } = button.getBoundingClientRect();

		const x = left + width / 2;
		const y = top + height / 2;

		const right = window.innerWidth - left;
		const bottom = window.innerHeight - top;
		const maxRadius = Math.hypot(Math.max(left, right), Math.max(top, bottom));

		document.documentElement.animate(
			{
				clipPath: [
					`circle(0px at ${x}px ${y}px)`,
					`circle(${maxRadius}px at ${x}px ${y}px)`,
				],
			},
			{
				duration,
				easing: "ease-in-out",
				pseudoElement: "::view-transition-new(root)",
			},
		);
	};

	return (
		<button
			ref={buttonRef}
			onClick={handleToggle}
			className={cn(
				"relative inline-flex items-center justify-center overflow-hidden rounded-full p-2 transition-colors hover:bg-accent",
				className,
			)}
			{...props}
		>
			<div className="relative h-5 w-5">
				<Sun
					className={
						"absolute inset-0 h-full w-full transition-all duration-300 rotate-0 scale-100 opacity-100 dark:rotate-90 dark:scale-0 dark:opacity-0"
					}
				/>
				<Moon
					className={
						"absolute inset-0 h-full w-full transition-all duration-300 dark:rotate-0 -rotate-90 scale-0 opacity-0 dark:scale-100 dark:opacity-100"
					}
				/>
			</div>
			<span className="sr-only">Alternar tema</span>
		</button>
	);
};
