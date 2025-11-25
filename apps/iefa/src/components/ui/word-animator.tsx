import { AnimatePresence, motion } from "motion/react";
import React from "react";
import { cn } from "@/lib/utils";

interface WordAnimatorProps {
	words: string[];
	duration?: number;
	className?: string;
}

const WordAnimator: React.FC<WordAnimatorProps> = ({
	words,
	duration = 3, // Reduzi um pouco para ficar mais dinâmico
	className = "",
}) => {
	const [currentIndex, setCurrentIndex] = React.useState(0);

	React.useEffect(() => {
		const interval = setInterval(() => {
			setCurrentIndex((prev) => (prev + 1) % words.length);
		}, duration * 1000);

		return () => clearInterval(interval);
	}, [words.length, duration]);

	return (
		<span
			style={{
				display: "inline-flex",
				position: "relative",
				verticalAlign: "bottom",
			}}
			className={cn(
				// Estilos do Container (Chip Tecnológico)
				"mx-2 px-4 pb-1 pt-0.5 overflow-hidden",
				"rounded-xl border border-primary/20",
				"bg-primary/5 backdrop-blur-sm shadow-[0_0_15px_rgba(var(--primary),0.1)]",
				"transition-[width] duration-500 ease-in-out", // Anima a largura da caixa
				className,
			)}
		>
			{/* Noise Texture - Mantido mas com opacidade ajustada para o tema dark */}
			<span className="absolute inset-0 z-0 pointer-events-none bg-[url('/noise.gif')] opacity-5 mix-blend-overlay"></span>

			{/* Glow interno sutil */}
			<span className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent opacity-50 z-0"></span>

			<AnimatePresence mode="popLayout">
				<motion.span
					key={currentIndex}
					initial={{ y: "100%", opacity: 0, filter: "blur(8px)" }}
					animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
					exit={{ y: "-100%", opacity: 0, filter: "blur(8px)" }}
					transition={{
						duration: 0.6,
						ease: [0.16, 1, 0.3, 1], // Ease "Spring-like" suave
					}}
					style={{
						position: "absolute",
						left: 0,
						right: 0,
						textAlign: "center",
						display: "flex",
						justifyContent: "center",
						alignItems: "center",
						height: "100%",
					}}
					// Gradiente do Texto alinhado com o tema Predator
					className="z-10 font-bold bg-linear-to-r from-primary via-purple-500 to-primary bg-clip-text text-transparent bg-size-[200%_auto] animate-gradient"
				>
					{words[currentIndex]}
				</motion.span>
			</AnimatePresence>

			{/* Texto invisível para manter a altura e largura corretas do container */}
			<span className="invisible opacity-0 pointer-events-none px-1">
				{words[currentIndex]}
			</span>
		</span>
	);
};

export default WordAnimator;
