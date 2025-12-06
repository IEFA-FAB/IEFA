import { motion, useMotionTemplate, useMotionValue } from "motion/react";
import { useEffect, useRef } from "react";
import { cn } from "@/utils/utils";

export const HeroHighlight = ({
	children,
	className,
	containerClassName,
	...props
}: {
	children: React.ReactNode;
	className?: string;
	containerClassName?: string;
} & React.HTMLAttributes<HTMLDivElement>) => {
	const mouseX = useMotionValue(0);
	const mouseY = useMotionValue(0);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const handleMouseMove = (e: MouseEvent) => {
			const { left, top } = container.getBoundingClientRect();
			mouseX.set(e.clientX - left);
			mouseY.set(e.clientY - top);
		};

		container.addEventListener("mousemove", handleMouseMove);
		return () => {
			container.removeEventListener("mousemove", handleMouseMove);
		};
	}, [mouseX, mouseY]);

	return (
		<div
			ref={containerRef}
			className={cn(
				"relative flex items-center bg-background justify-center w-full group overflow-hidden",
				containerClassName,
			)}
			{...props}
		>
			<div className="absolute inset-0 pointer-events-none">
				<div
					className="absolute inset-0 opacity-[0.03] dark:opacity-[0.08]"
					style={{
						backgroundImage:
							"radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
						backgroundSize: "24px 24px",
					}}
				/>
			</div>

			{/* Vignette */}
			<div className="absolute inset-0 bg-background [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)] pointer-events-none" />

			<motion.div
				className="pointer-events-none absolute inset-0 opacity-0 transition duration-300 group-hover:opacity-100"
				style={{
					WebkitMaskImage: useMotionTemplate`
            radial-gradient(
              200px circle at ${mouseX}px ${mouseY}px,
              black 0%,
              transparent 100%
            )
          `,
					maskImage: useMotionTemplate`
            radial-gradient(
              200px circle at ${mouseX}px ${mouseY}px,
              black 0%,
              transparent 100%
            )
          `,
				}}
			>
				<div
					className="absolute inset-0 opacity-[0.15] dark:opacity-[0.2] text-primary"
					style={{
						backgroundImage:
							"radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
						backgroundSize: "24px 24px",
					}}
				/>
			</motion.div>

			<div className={cn("relative z-20", className)}>{children}</div>
		</div>
	);
};

export const Highlight = ({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) => {
	return (
		<motion.span
			initial={{
				backgroundSize: "0% 100%",
			}}
			animate={{
				backgroundSize: "100% 100%",
			}}
			transition={{
				duration: 2,
				ease: "linear",
				delay: 0.5,
			}}
			style={{
				backgroundRepeat: "no-repeat",
				backgroundPosition: "left center",
				display: "inline",
			}}
			className={cn(
				"relative inline-block pb-1 px-1 rounded-lg bg-linear-to-r from-primary/20 to-purple-500/20 dark:from-primary/40 dark:to-purple-500/40",
				className,
			)}
		>
			{children}
		</motion.span>
	);
};
