import { Link } from "@tanstack/react-router"
import { Group, Refresh, Star, Timer, Trash } from "iconoir-react"
import { Button } from "@/components/ui/button"

const SENSOS = [
	{
		number: "1°S",
		name: "Utilização",
		japanese: "Seiri",
		description: "Identificar e descartar o que é desnecessário, mantendo apenas o essencial para as atividades.",
	},
	{
		number: "2°S",
		name: "Ordenação",
		japanese: "Seiton",
		description: "Organizar e identificar cada item em seu lugar, permitindo acesso rápido e eficiente.",
	},
	{ number: "3°S", name: "Limpeza", japanese: "Seiso", description: "Manter o ambiente limpo e identificar as fontes de sujeira para eliminação definitiva." },
	{
		number: "4°S",
		name: "Padronização",
		japanese: "Seiketsu",
		description: "Estabelecer padrões e rotinas para manter os três primeiros S de forma sistemática.",
	},
	{ number: "5°S", name: "Disciplina", japanese: "Shitsuke", description: "Cultivar o hábito de seguir os padrões, criando uma cultura de melhoria contínua." },
]

const VETOR_PHASES = [
	{ letter: "N", name: "Nivelar", description: "Sensibilização, estruturação e preparação para implantação", color: "var(--5s-phase-n)" },
	{ letter: "I", name: "Implementar", description: "Execução prática dos 3 primeiros S", color: "var(--5s-phase-i)" },
	{ letter: "T", name: "Tornar Padrão", description: "Estabelecer padrões e rotinas para qualidade", color: "var(--5s-phase-t)" },
	{ letter: "I", name: "Inspecionar", description: "Verificação sistemática dos resultados", color: "var(--5s-phase-i2)" },
	{ letter: "D", name: "Demonstrar", description: "Apresentação dos resultados e reconhecimento", color: "var(--5s-phase-d)" },
	{ letter: "U", name: "Utilizar", description: "Integração do 5S à rotina diária", color: "var(--5s-phase-u)" },
	{ letter: "S", name: "Sofisticar", description: "Busca contínua pela excelência e inovação", color: "var(--5s-phase-s)" },
]

const BENEFITS = [
	{ icon: Timer, label: "Mais Eficiência", description: "Processos otimizados e tempo bem utilizado" },
	{ icon: Trash, label: "Menos Desperdícios", description: "Eliminação de recursos desperdiçados" },
	{ icon: Star, label: "Mais Qualidade", description: "Padrões elevados em todas as entregas" },
	{ icon: Group, label: "Engajamento", description: "Equipes motivadas e comprometidas" },
	{ icon: Refresh, label: "Melhoria Contínua", description: "Evolução constante em todas as áreas" },
]

export function CincoSLanding() {
	return (
		<div className="relative flex flex-col w-full text-foreground">
			{/* ─── Hero — fundo claro institucional, tipografia bold italic ──────── */}
			<section className="relative min-h-[calc(100dvh-2rem)] flex flex-col items-center justify-center overflow-hidden bg-background px-6 py-20">
				{/* Padrão de pontos halftone — fidelidade à identidade visual */}
				<svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
					<defs>
						<pattern id="5s-dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
							<circle cx="2" cy="2" r="1.4" fill="currentColor" />
						</pattern>
					</defs>
					<rect width="100%" height="100%" fill="url(#5s-dots)" style={{ color: "var(--5s-navy)" }} opacity="0.04" />
				</svg>

				{/* Detalhe navy no canto superior esquerdo */}
				<svg
					className="absolute top-0 left-0 pointer-events-none w-48 h-48 sm:w-64 sm:h-64"
					viewBox="0 0 256 256"
					aria-hidden="true"
					xmlns="http://www.w3.org/2000/svg"
				>
					<defs>
						<filter id="5s-corner-glow">
							<feGaussianBlur stdDeviation="5" result="blur" />
							<feMerge>
								<feMergeNode in="blur" />
								<feMergeNode in="SourceGraphic" />
							</feMerge>
						</filter>
					</defs>
					<path d="M0,0 L180,0 C140,40 100,90 80,160 L0,256 Z" style={{ fill: "var(--5s-navy-deep)" }} opacity="0.9" />
					<path
						d="M180,0 C140,40 100,90 80,160"
						fill="none"
						style={{ stroke: "var(--5s-electric)", strokeWidth: "2.5" }}
						filter="url(#5s-corner-glow)"
						opacity="0.7"
					/>
				</svg>

				{/* Conteúdo central */}
				<div className="relative z-10 flex flex-col items-center text-center gap-6 max-w-2xl w-full">
					<p className="font-semibold uppercase text-muted-foreground tracking-widest" style={{ fontSize: "11px", letterSpacing: "0.18em" }}>
						Programa
					</p>

					{/* VETOR 5S — bold italic, navy escuro + azul elétrico (fiel à referência) */}
					<h1
						style={{
							fontSize: "clamp(4rem, 12vw, 8.5rem)",
							fontWeight: 900,
							fontStyle: "italic",
							lineHeight: 0.92,
							letterSpacing: "-0.04em",
						}}
					>
						<span style={{ color: "var(--5s-navy-deep)" }}>VETOR </span>
						<span style={{ color: "var(--5s-electric)" }}>5S</span>
					</h1>

					{/* Banner MELHORIA CONTÍNUA — navy pill + chevron dourado */}
					<div className="inline-flex items-stretch overflow-hidden" style={{ borderRadius: "0.25rem" }}>
						<div className="px-4 py-2" style={{ background: "var(--5s-navy-deep)" }}>
							<span className="text-xs sm:text-sm font-bold tracking-widest uppercase text-white">MELHORIA CONTÍNUA</span>
						</div>
						<div className="px-3 flex items-center justify-center" style={{ background: "var(--5s-gold)" }}>
							<span className="text-base font-black leading-none" style={{ color: "var(--5s-navy-deep)" }}>
								»
							</span>
						</div>
					</div>

					{/* Linha dourada */}
					<div className="h-0.5 w-16 rounded-full" style={{ background: "var(--5s-gold)", opacity: 0.8 }} />

					<p className="text-base sm:text-lg italic text-muted-foreground leading-relaxed max-w-md">Direção clara. Esforços alinhados. Excelência contínua.</p>

					<div className="flex flex-wrap gap-3 justify-center pt-2">
						<Button nativeButton={false} render={<Link to="/auth">Entrar</Link>} size="lg" variant="default" />
						<Button
							nativeButton={false}
							render={
								<Link to="/auth" search={{ tab: "register" }}>
									Criar conta
								</Link>
							}
							size="lg"
							variant="outline"
						/>
					</div>
				</div>

				{/* Ciclo NITI DUS — pills inline sem card */}
				<div className="relative z-10 w-full max-w-3xl mt-14 space-y-3">
					<p className="font-semibold uppercase text-center text-muted-foreground" style={{ fontSize: "10px", letterSpacing: "0.14em" }}>
						Ciclo NITI DUS · 7 Fases
					</p>
					<div className="flex flex-wrap gap-2 justify-center">
						{VETOR_PHASES.map(({ letter, name, color }, index) => (
							<div
								key={`${letter}-${index}`}
								className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white"
								style={{ background: color, borderRadius: "2rem" }}
							>
								<span className="font-black text-[10px] opacity-70">{index + 1}</span>
								<span>{name}</span>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* ─── Os 5 Sensos ──────────────────────────────────────────────────── */}
			<section className="py-20 px-4">
				<div className="max-w-5xl mx-auto">
					<div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 mb-14">
						<div>
							<p className="text-label text-muted-foreground mb-2">BASE 5S</p>
							<h2 className="text-headline font-bold">Os 5 Sensos</h2>
						</div>
						<span className="text-xs text-muted-foreground hidden sm:block italic">Seiri · Seiton · Seiso · Seiketsu · Shitsuke</span>
					</div>

					<div className="divide-y divide-border">
						{SENSOS.map(({ number, name, japanese, description }, i) => (
							<div key={number} className="py-8 grid grid-cols-1 sm:grid-cols-[6rem_11rem_1fr] gap-3 sm:gap-8 items-start">
								{/* Numeral — ancora tipográfico */}
								<span
									className="font-black tabular-nums leading-none select-none"
									style={{
										fontSize: "clamp(2.75rem, 6vw, 4.5rem)",
										color: "var(--5s-teal)",
										letterSpacing: "-0.04em",
									}}
								>
									{i + 1}
								</span>

								{/* Nome */}
								<div className="sm:pt-1.5">
									<p className="text-xs italic text-muted-foreground mb-1">{japanese}</p>
									<h3 className="font-bold text-xl leading-tight">{name}</h3>
									<p className="font-semibold uppercase mt-1.5" style={{ fontSize: "10px", letterSpacing: "0.12em", color: "var(--5s-teal)", opacity: 0.7 }}>
										{number}
									</p>
								</div>

								{/* Descrição */}
								<p className="text-sm text-muted-foreground leading-relaxed sm:pt-1.5">{description}</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* ─── Ciclo VETOR ──────────────────────────────────────────────────── */}
			<section className="py-20 px-4" style={{ background: "var(--5s-navy-deep)" }}>
				<div className="max-w-4xl mx-auto">
					<div className="mb-10">
						<p className="text-xs font-semibold uppercase tracking-widest mb-2 text-white/40">METODOLOGIA</p>
						<h2 className="text-2xl sm:text-3xl font-bold text-white">Ciclo NITI DUS</h2>
						<p className="text-sm text-white/40 mt-2 max-w-lg">Sete fases cíclicas que garantem a implantação sustentável do programa.</p>
					</div>
					<div className="divide-y divide-white/10">
						{VETOR_PHASES.map(({ letter, name, description, color }, index) => (
							<div key={`${letter}-${index}`} className="py-5 grid grid-cols-[2.5rem_1fr] sm:grid-cols-[2.5rem_11rem_1fr] gap-4 items-start">
								<div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black shrink-0" style={{ background: color }}>
									<span className="text-white">{letter}</span>
								</div>
								<div>
									<p className="text-[10px] text-white/35 font-medium uppercase tracking-wide">Fase {index + 1}</p>
									<h4 className="font-bold text-sm text-white/90">{name}</h4>
								</div>
								<p className="text-xs text-white/45 leading-relaxed hidden sm:block">{description}</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* ─── Propósito ────────────────────────────────────────────────────── */}
			<section className="py-20 px-4">
				<div className="max-w-5xl mx-auto">
					<div className="text-center mb-10">
						<p className="text-label text-muted-foreground mb-2">PROPÓSITO</p>
						<h2 className="text-headline font-bold">Nossa Missão</h2>
					</div>

					<div className="max-w-3xl mx-auto text-center space-y-5">
						<div className="h-px w-10 mx-auto" style={{ background: "var(--5s-electric)" }} />
						<p className="text-lg sm:text-xl text-foreground font-medium leading-relaxed italic">
							"Promover ambientes organizados, padronizados e sustentáveis, impulsionando a eficiência, a qualidade e a melhoria contínua em todas as unidades."
						</p>
						<div className="h-px w-10 mx-auto" style={{ background: "var(--5s-electric)" }} />
					</div>

					<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mt-14">
						{BENEFITS.map(({ icon: Icon, label, description }) => (
							<div key={label} className="flex flex-col items-center gap-3 p-4 text-center">
								<div className="p-3 bg-primary/10 rounded-2xl">
									<Icon className="h-5 w-5 text-primary" aria-hidden="true" />
								</div>
								<div>
									<h4 className="font-bold text-sm">{label}</h4>
									<p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
								</div>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* ─── CTA ──────────────────────────────────────────────────────────── */}
			<section className="py-20 px-4 text-center max-w-3xl mx-auto w-full">
				<h2 className="text-2xl sm:text-3xl font-bold mb-4">Acesse o Programa 5S</h2>
				<p className="text-muted-foreground mb-8 text-sm sm:text-base text-pretty">
					Faça login com seu email institucional @fab.mil.br para acessar os checklists e acompanhar o progresso do programa.
				</p>
				<div className="flex flex-wrap gap-3 justify-center">
					<Button nativeButton={false} render={<Link to="/auth">Entrar</Link>} size="lg" variant="default" />
					<Button
						nativeButton={false}
						render={
							<Link to="/auth" search={{ tab: "register" }}>
								Criar conta
							</Link>
						}
						size="lg"
						variant="secondary"
					/>
				</div>
			</section>

			{/* ─── Footer SEFA ──────────────────────────────────────────────────── */}
			<footer className="border-t border-border py-8 px-4">
				<div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
					<div className="text-center sm:text-left">
						<p className="font-semibold text-foreground/80 uppercase tracking-wide" style={{ letterSpacing: "0.04em" }}>
							Secretaria de Economia, Finanças e Administração da Aeronáutica
						</p>
						<p className="mt-0.5">Gestão com Eficiência, Disciplina e Inovação</p>
					</div>
					<span>© {new Date().getFullYear()} SEFA / IEFA</span>
				</div>
			</footer>
		</div>
	)
}
