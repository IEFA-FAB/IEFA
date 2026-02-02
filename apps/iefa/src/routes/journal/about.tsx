import { Button } from "@iefa/ui"
import { createFileRoute } from "@tanstack/react-router"
import {
	Award,
	BookOpen,
	ExternalLink,
	FileCheck,
	Globe,
	Mail,
	Shield,
	Target,
	Users,
} from "lucide-react"
import { useState } from "react"

export const Route = createFileRoute("/journal/about")({
	component: AboutPage,
})

const sections = [
	{ id: "identity", label: "Identidade", icon: BookOpen },
	{ id: "mission", label: "Missão & Escopo", icon: Target },
	{ id: "policies", label: "Políticas Editoriais", icon: FileCheck },
	{ id: "ethics", label: "Ética & Integridade", icon: Shield },
	{ id: "team", label: "Equipe Editorial", icon: Users },
	{ id: "contact", label: "Contato", icon: Mail },
] as const

function AboutPage() {
	const [activeSection, setActiveSection] = useState<string>("identity")
	const [language, setLanguage] = useState<"pt" | "en">("pt")

	return (
		<div className="min-h-screen bg-linear-to-b from-background to-muted/20">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
				{/* Header */}
				<div className="text-center mb-12">
					<h1 className="text-4xl font-bold mb-3">
						SEIVA — Journal of Public Administration and Innovation
					</h1>
					<p className="text-xl text-muted-foreground mb-6">
						Instituto de Economia, Finanças e Administração da Aeronáutica (IEFA)
					</p>
					<div className="flex justify-center gap-3">
						<Button
							variant={language === "pt" ? "default" : "outline"}
							onClick={() => setLanguage("pt")}
						>
							🇧🇷 Português
						</Button>
						<Button
							variant={language === "en" ? "default" : "outline"}
							onClick={() => setLanguage("en")}
						>
							🇺🇸 English
						</Button>
					</div>
				</div>

				{/* Navigation */}
				<div className="flex flex-wrap gap-2 justify-center mb-8">
					{sections.map((section) => {
						const Icon = section.icon
						return (
							<Button
								key={section.id}
								variant={activeSection === section.id ? "default" : "outline"}
								onClick={() => setActiveSection(section.id)}
								className="gap-2"
							>
								<Icon className="size-4" />
								{section.label}
							</Button>
						)
					})}
				</div>

				{/* Content */}
				<div className="bg-card border rounded-lg p-8 shadow-sm">
					{activeSection === "identity" && <IdentitySection language={language} />}
					{activeSection === "mission" && <MissionSection language={language} />}
					{activeSection === "policies" && <PoliciesSection language={language} />}
					{activeSection === "ethics" && <EthicsSection language={language} />}
					{activeSection === "team" && <TeamSection language={language} />}
					{activeSection === "contact" && <ContactSection language={language} />}
				</div>
			</div>
		</div>
	)
}

function IdentitySection({ language }: { language: "pt" | "en" }) {
	return (
		<div className="space-y-6">
			<h2 className="text-3xl font-bold border-b pb-3">
				{language === "pt" ? "Identidade do Periódico" : "Journal Identity"}
			</h2>

			<div className="grid md:grid-cols-2 gap-6">
				<InfoCard
					title={language === "pt" ? "Título" : "Title"}
					content="SEIVA — Journal of Public Administration and Innovation"
				/>
				<InfoCard
					title={language === "pt" ? "Instituição" : "Institution"}
					content="Instituto de Economia, Finanças e Administração da Aeronáutica (IEFA)"
				/>
				<InfoCard
					title={language === "pt" ? "Área" : "Field"}
					content={
						language === "pt"
							? "Administração Pública, Gestão Pública e Inovação no Setor Público"
							: "Public Administration, Public Management, and Innovation in the Public Sector"
					}
				/>
				<InfoCard
					title={language === "pt" ? "Modelo" : "Model"}
					content={
						language === "pt"
							? "Acesso aberto, sem taxas (sem APC)"
							: "Open access, no fees (no APCs)"
					}
				/>
				<InfoCard
					title={language === "pt" ? "Periodicidade" : "Frequency"}
					content={
						language === "pt"
							? "Publicação contínua organizada por semestres"
							: "Continuous publication organized by semesters"
					}
				/>
				<InfoCard
					title={language === "pt" ? "Contato Editorial" : "Editorial Contact"}
					content="secretaria.iefa@fab.mil.br"
				/>
			</div>

			<div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-900">
				<p className="text-sm text-blue-900 dark:text-blue-100">
					<strong>{language === "pt" ? "📌 Importante:" : "📌 Important:"}</strong>{" "}
					{language === "pt"
						? "ISSN e outros dados institucionais específicos em processo de definição oficial."
						: "ISSN and other specific institutional data under official definition process."}
				</p>
			</div>
		</div>
	)
}

function MissionSection({ language }: { language: "pt" | "en" }) {
	return (
		<div className="space-y-6">
			<h2 className="text-3xl font-bold border-b pb-3">
				{language === "pt" ? "Missão, Visão e Escopo" : "Mission, Vision & Scope"}
			</h2>

			{/* Mission */}
			<div>
				<h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
					<Target className="size-5 text-primary" />
					{language === "pt" ? "Missão" : "Mission"}
				</h3>
				<p className="text-muted-foreground leading-relaxed">
					{language === "pt"
						? "A SEIVA é uma revista científica do IEFA dedicada a publicar pesquisas e contribuições técnico-científicas em Administração Pública e inovação aplicada ao setor público, promovendo comunicação científica rigoro sa, relevante e útil para a academia e para profissionais do campo público."
						: "SEIVA is a scholarly journal published by IEFA dedicated to research and technical-scholarly contributions in Public Administration and innovation in the public sector, promoting rigorous, relevant, and useful scholarly communication for both academia and practitioners."}
				</p>
			</div>

			{/* Vision */}
			<div>
				<h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
					<Award className="size-5 text-primary" />
					{language === "pt" ? "Visão" : "Vision"}
				</h3>
				<p className="text-muted-foreground leading-relaxed">
					{language === "pt"
						? "A revista busca consolidar-se como referência, com alto padrão editorial, integridade, transparência, diversidade institucional e impacto na produção e disseminação de conhecimento para aprimorar governança, políticas públicas e gestão pública."
						: "The journal aims to become a recognized reference by adopting high editorial standards, integrity, transparency, institutional diversity, and real-world relevance for better governance, public policies, and public management."}
				</p>
			</div>

			{/* Scope */}
			<div>
				<h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
					<BookOpen className="size-5 text-primary" />
					{language === "pt" ? "Foco e Escopo" : "Aims & Scope"}
				</h3>
				<p className="text-muted-foreground mb-4">
					{language === "pt"
						? "A SEIVA publica trabalhos relacionados a Administração Pública e inovação em gestão pública, incluindo:"
						: "SEIVA publishes research and scholarly technical contributions in Public Administration and innovation in public management, including:"}
				</p>
				<ul className="space-y-2 text-muted-foreground">
					<li className="flex items-start gap-2">
						<span className="text-primary mt-1">•</span>
						<span>
							{language === "pt"
								? "Governança e gestão pública"
								: "Public governance and management"}
						</span>
					</li>
					<li className="flex items-start gap-2">
						<span className="text-primary mt-1">•</span>
						<span>
							{language === "pt"
								? "Planejamento, orçamento, finanças públicas e gestão fiscal"
								: "Planning, budgeting, public finance, and fiscal management"}
						</span>
					</li>
					<li className="flex items-start gap-2">
						<span className="text-primary mt-1">•</span>
						<span>
							{language === "pt"
								? "Gestão por desempenho, eficiência e avaliação de políticas públicas"
								: "Performance management, efficiency, and public policy evaluation"}
						</span>
					</li>
					<li className="flex items-start gap-2">
						<span className="text-primary mt-1">•</span>
						<span>
							{language === "pt"
								? "Transformação digital no setor público e inovação organizacional"
								: "Digital transformation in the public sector and organizational innovation"}
						</span>
					</li>
					<li className="flex items-start gap-2">
						<span className="text-primary mt-1">•</span>
						<span>
							{language === "pt"
								? "Processos, qualidade, simplificação e melhoria regulatória"
								: "Process improvement, quality management, simplification, and better regulation"}
						</span>
					</li>
					<li className="flex items-start gap-2">
						<span className="text-primary mt-1">•</span>
						<span>
							{language === "pt"
								? "Compras públicas, contratos e gestão de suprimentos"
								: "Public procurement, contracting, and supply management"}
						</span>
					</li>
					<li className="flex items-start gap-2">
						<span className="text-primary mt-1">•</span>
						<span>
							{language === "pt"
								? "Integridade, compliance, controles internos e gestão de riscos"
								: "Integrity, compliance, internal controls, and risk management"}
						</span>
					</li>
					<li className="flex items-start gap-2">
						<span className="text-primary mt-1">•</span>
						<span>
							{language === "pt"
								? "Gestão de pessoas e desenvolvimento institucional no setor público"
								: "People management and institutional development in the public sector"}
						</span>
					</li>
				</ul>
			</div>
		</div>
	)
}

function PoliciesSection({ language }: { language: "pt" | "en" }) {
	return (
		<div className="space-y-6">
			<h2 className="text-3xl font-bold border-b pb-3">
				{language === "pt" ? "Políticas Editoriais" : "Editorial Policies"}
			</h2>

			{/* Open Access */}
			<PolicyCard title={language === "pt" ? "Acesso Aberto" : "Open Access"} icon={Globe}>
				<p>
					{language === "pt"
						? "A SEIVA é uma revista de Acesso Aberto: todo o conteúdo é disponibilizado gratuitamente ao público, sem barreiras de leitura. A revista não cobra taxas de submissão, avaliação ou publicação (sem APC)."
						: "SEIVA is a fully Open Access journal: all content is freely available without paywalls. SEIVA does not charge submission, review, or publication fees (no APCs)."}
				</p>
			</PolicyCard>

			{/* Languages */}
			<PolicyCard
				title={
					language === "pt" ? "Idiomas e Metadados Bilíngues" : "Languages & Bilingual Metadata"
				}
				icon={Globe}
			>
				<p className="mb-3">
					{language === "pt"
						? "A SEIVA aceita submissões em português, inglês ou em ambas as línguas. Todos os artigos publicados devem incluir metadados bilíngues (PT/EN):"
						: "SEIVA accepts submissions in Portuguese, English, or both languages. All published articles must include bilingual metadata (PT/EN):"}
				</p>
				<ul className="space-y-1">
					<li>• {language === "pt" ? "Título" : "Title"}</li>
					<li>• {language === "pt" ? "Resumo" : "Abstract"}</li>
					<li>• {language === "pt" ? "Palavras-chave" : "Keywords"}</li>
				</ul>
			</PolicyCard>

			{/* DOI */}
			<PolicyCard title="DOI" icon={FileCheck}>
				<p className="mb-3">
					{language === "pt"
						? "A SEIVA atribui DOI a todos os artigos publicados."
						: "SEIVA assigns a DOI to all published articles."}
				</p>
				<div className="p-3 bg-blue-50 dark:bg-blue-950 rounded border border-blue-200 dark:border-blue-800">
					<p className="text-sm text-blue-900 dark:text-blue-100">
						<strong>{language === "pt" ? "Um DOI por língua:" : "One DOI per language:"}</strong>{" "}
						{language === "pt"
							? "Quando um trabalho for publicado em duas versões linguísticas (PT e EN), cada versão recebe um DOI distinto, garantindo independência de citação por idioma."
							: "When a work is published in two language versions (PT and EN), each version receives a separate DOI, ensuring independent citation by language."}
					</p>
				</div>
			</PolicyCard>

			{/* Peer Review */}
			<PolicyCard
				title={language === "pt" ? "Avaliação por Pares Duplo-Cega" : "Double-Blind Peer Review"}
				icon={Shield}
			>
				<p className="mb-3">
					{language === "pt"
						? "A SEIVA adota avaliação por pares duplo-cega (double-blind peer review)."
						: "SEIVA uses double-blind peer review."}
				</p>
				<div className="space-y-2 text-sm">
					<p>
						<strong>{language === "pt" ? "Fluxo editorial:" : "Editorial workflow:"}</strong>
					</p>
					<ol className="list-decimal list-inside space-y-1 ml-2">
						<li>
							{language === "pt"
								? "Triagem editorial (desk check)"
								: "Editorial screening (desk check)"}
						</li>
						<li>
							{language === "pt"
								? "Designação de Editor Associado"
								: "Assignment to Associate Editor"}
						</li>
						<li>
							{language === "pt"
								? "Avaliação por pares (pelo menos dois pareceres)"
								: "Peer review (at least two reports)"}
						</li>
						<li>
							{language === "pt"
								? "Decisão editorial (aceite, revisão ou rejeição)"
								: "Editorial decision (accept, revise, or reject)"}
						</li>
						<li>
							{language === "pt"
								? "Revisões pelos autores (quando aplicável)"
								: "Author revisions (if applicable)"}
						</li>
						<li>
							{language === "pt"
								? "Aceite e publicação em fluxo contínuo"
								: "Acceptance and continuous publication"}
						</li>
					</ol>
					<p className="mt-3">
						<strong>{language === "pt" ? "Prazo-alvo:" : "Target timeline:"}</strong>{" "}
						{language === "pt"
							? "primeira decisão em até 30 dias (meta)."
							: "first decision within 30 days (goal)."}
					</p>
				</div>
			</PolicyCard>

			{/* Preprints */}
			<PolicyCard
				title={
					language === "pt" ? "Publicação Prévia e Preprints" : "Prior Publication & Preprints"
				}
				icon={FileCheck}
			>
				<div className="space-y-3">
					<div className="p-3 bg-orange-50 dark:bg-orange-950 rounded border border-orange-200 dark:border-orange-800">
						<p className="text-sm text-orange-900 dark:text-orange-100">
							<strong>⚠️ {language === "pt" ? "Importante:" : "Important:"}</strong>{" "}
							{language === "pt"
								? "A SEIVA não aceita, neste momento, manuscritos que tenham sido disponibilizados integralmente como preprint."
								: "SEIVA does not currently accept manuscripts whose full text has been publicly posted as a preprint."}
						</p>
					</div>
					<p>
						{language === "pt"
							? "Divulgações parciais são permitidas (pôsteres, slides, apresentações orais, resumos) desde que o manuscrito completo não tenha sido tornado publicamente disponível."
							: "Partial dissemination is allowed (posters, slides, oral presentations, abstracts) provided the full manuscript has not been made publicly available."}
					</p>
				</div>
			</PolicyCard>
		</div>
	)
}

function EthicsSection({ language }: { language: "pt" | "en" }) {
	return (
		<div className="space-y-6">
			<h2 className="text-3xl font-bold border-b pb-3">
				{language === "pt" ? "Ética e Integridade" : "Ethics & Integrity"}
			</h2>

			{/* Ethics Overview */}
			<div className="p-6 bg-muted rounded-lg">
				<p className="leading-relaxed">
					{language === "pt"
						? "A SEIVA adota políticas para garantir integridade na publicação científica, incluindo compromisso com originalidade, rigor e transparência, prevenção e tratamento de plágio, gestão de conflitos de interesse, boas práticas de autoria e tratamento de condutas inadequadas."
						: "SEIVA maintains publication ethics policies, including commitment to originality, rigor, and transparency, prevention and handling of plagiarism, conflict of interest management, good authorship practices, and handling of misconduct."}
				</p>
			</div>

			{/* Conflict of Interest */}
			<PolicyCard
				title={language === "pt" ? "Conflito de Interesses" : "Conflict of Interest"}
				icon={Shield}
			>
				<p className="mb-4">
					{language === "pt"
						? "Conflitos de interesse (COI) ocorrem quando interesses secundários possam influenciar julgamento editorial ou científico."
						: "Conflicts of interest (COI) are situations where secondary interests may influence editorial or scientific judgment."}
				</p>
				<div className="space-y-3">
					<div>
						<strong>{language === "pt" ? "Quem deve declarar:" : "Who must disclose:"}</strong>
						<ul className="mt-2 space-y-1">
							<li>• {language === "pt" ? "Autores (na submissão)" : "Authors (at submission)"}</li>
							<li>
								•{" "}
								{language === "pt"
									? "Revisores (ao aceitar convite)"
									: "Reviewers (when accepting)"}
							</li>
							<li>
								•{" "}
								{language === "pt"
									? "Editores (ao receber manuscrito)"
									: "Editors (upon assignment)"}
							</li>
						</ul>
					</div>
					<div className="p-3 bg-blue-50 dark:bg-blue-950 rounded border border-blue-200 dark:border-blue-800">
						<p className="text-sm text-blue-900 dark:text-blue-100">
							{language === "pt"
								? "COI declarado não implica rejeição automática, mas exige transparência."
								: "Declared COI does not automatically imply rejection but requires transparency."}
						</p>
					</div>
				</div>
			</PolicyCard>

			{/* Authorship */}
			<PolicyCard title={language === "pt" ? "Autoria" : "Authorship"} icon={Users}>
				<p className="mb-3">
					{language === "pt"
						? "A SEIVA espera que a autoria reflita contribuição intelectual real e responsabilidade pelo conteúdo."
						: "SEIVA expects authorship to reflect real intellectual contribution and accountability."}
				</p>
				<p>
					{language === "pt"
						? "Mudanças de autoria (inclusão/remoção/ordem) após submissão exigem justificativa e concordância documentada de todos os autores."
						: "Authorship changes (add/remove/reorder) after submission require justification and documented agreement by all authors."}
				</p>
			</PolicyCard>

			{/* AI Use */}
			<PolicyCard title={language === "pt" ? "Uso de IA" : "AI Use Policy"} icon={FileCheck}>
				<div className="space-y-3">
					<p>
						{language === "pt"
							? "Ferramentas de IA podem ser usadas como apoio (ex.: revisão linguística), desde que:"
							: "AI tools may be used as support (e.g., language polishing), provided that:"}
					</p>
					<ul className="space-y-1">
						<li>
							•{" "}
							{language === "pt"
								? "Não sejam usadas para fabricar dados ou alterar evidências"
								: "Not used to fabricate data or manipulate evidence"}
						</li>
						<li>
							•{" "}
							{language === "pt"
								? "Os autores permaneçam integralmente responsáveis"
								: "Authors remain fully responsible"}
						</li>
						<li>
							•{" "}
							{language === "pt"
								? "O uso seja declarado quando relevante"
								: "Use is disclosed when relevant"}
						</li>
					</ul>
				</div>
			</PolicyCard>

			{/* Research Ethics */}
			<PolicyCard
				title={language === "pt" ? "Ética em Pesquisa e Privacidade" : "Research Ethics & Privacy"}
				icon={Shield}
			>
				<p>
					{language === "pt"
						? "Estudos envolvendo entrevistas, questionários ou dados com risco de reidentificação devem: cumprir exigências éticas aplicáveis, adotar boas práticas de anonimização, evitar exposição de informações pessoais desnecessárias e declarar restrições quando dados não puderem ser abertos."
						: "Studies involving interviews, surveys, or data with re-identification risk must: comply with applicable ethics requirements, apply anonymization practices, avoid unnecessary exposure of personal data, and declare justified restrictions when data cannot be openly shared."}
				</p>
			</PolicyCard>
		</div>
	)
}

function TeamSection({ language }: { language: "pt" | "en" }) {
	return (
		<div className="space-y-6">
			<h2 className="text-3xl font-bold border-b pb-3">
				{language === "pt" ? "Equipe Editorial" : "Editorial Team"}
			</h2>

			{/* Structure */}
			<div>
				<h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
					<Users className="size-5 text-primary" />
					{language === "pt" ? "Estrutura" : "Structure"}
				</h3>
				<div className="space-y-3">
					<div className="p-4 border rounded-lg">
						<h4 className="font-semibold mb-2">
							{language === "pt" ? "Editor-chefe (Editor-in-Chief)" : "Editor-in-Chief"}
						</h4>
						<p className="text-sm text-muted-foreground">
							{language === "pt"
								? "Política editorial e decisões finais"
								: "Editorial policy and final decisions"}
						</p>
					</div>
					<div className="p-4 border rounded-lg">
						<h4 className="font-semibold mb-2">
							{language === "pt" ? "Editores Associados (Associate Editors)" : "Associate Editors"}
						</h4>
						<p className="text-sm text-muted-foreground">
							{language === "pt"
								? "Condução do peer review e recomendações"
								: "Manage peer review and recommend decisions"}
						</p>
					</div>
					<div className="p-4 border rounded-lg">
						<h4 className="font-semibold mb-2">
							{language === "pt" ? "Conselho Editorial (Editorial Board)" : "Editorial Board"}
						</h4>
						<p className="text-sm text-muted-foreground">
							{language === "pt"
								? "Apoio consultivo e orientação científica"
								: "Advisory support and scientific guidance"}
						</p>
					</div>
				</div>
			</div>

			{/* Diversity */}
			<div className="p-6 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
				<h4 className="font-semibold mb-2 text-green-900 dark:text-green-100">
					{language === "pt" ? "📊 Diversidade Institucional" : "📊 Institutional Diversity"}
				</h4>
				<p className="text-sm text-green-800 dark:text-green-200">
					{language === "pt"
						? "A revista busca diversidade institucional e participação externa. A participação de membros do IEFA em funções editoriais operacionais é limitada a até 25%, promovendo pluralidade e reduzindo endogenia."
						: "SEIVA aims for institutional diversity and external participation. Operational editorial roles from IEFA are limited to up to 25%, fostering plurality and reducing endogeneity."}
				</p>
			</div>

			{/* Independence */}
			<div>
				<h3 className="text-xl font-semibold mb-3">
					{language === "pt" ? "Independência Editorial" : "Editorial Independence"}
				</h3>
				<p className="text-muted-foreground">
					{language === "pt"
						? "A SEIVA é publicada pelo IEFA; entretanto, as decisões editoriais são tomadas de forma independente pela equipe editorial, com base em mérito acadêmico, revisão por pares, aderência ao escopo e políticas de integridade, sem interferência institucional no julgamento científico."
						: "SEIVA is published by IEFA; however, editorial decisions are made independently by the editorial team based on scholarly merit, peer review, scope fit, and integrity policies, without institutional interference in scientific judgment."}
				</p>
			</div>
		</div>
	)
}

function ContactSection({ language }: { language: "pt" | "en" }) {
	return (
		<div className="space-y-6">
			<h2 className="text-3xl font-bold border-b pb-3">
				{language === "pt" ? "Contato" : "Contact"}
			</h2>

			<div className="grid md:grid-cols-2 gap-6">
				<div className="p-6 border rounded-lg bg-card">
					<div className="flex items-center gap-3 mb-4">
						<Mail className="size-6 text-primary" />
						<h3 className="font-semibold text-lg">
							{language === "pt" ? "Contato Editorial" : "Editorial Contact"}
						</h3>
					</div>
					<a
						href="mailto:secretaria.iefa@fab.mil.br"
						className="text-primary hover:underline flex items-center gap-2"
					>
						secretaria.iefa@fab.mil.br
						<ExternalLink className="size-4" />
					</a>
				</div>

				<div className="p-6 border rounded-lg bg-card">
					<div className="flex items-center gap-3 mb-4">
						<BookOpen className="size-6 text-primary" />
						<h3 className="font-semibold text-lg">
							{language === "pt" ? "Instituição" : "Institution"}
						</h3>
					</div>
					<p className="text-muted-foreground">
						Instituto de Economia, Finanças e Administração da Aeronáutica (IEFA)
					</p>
				</div>
			</div>

			{/* Additional Info */}
			<div className="p-6 bg-muted rounded-lg">
				<h3 className="font-semibold mb-3">
					{language === "pt"
						? "📬 Para dúvidas e comunicações"
						: "📬 For inquiries and communications"}
				</h3>
				<p className="text-muted-foreground">
					{language === "pt"
						? "Para dúvidas sobre submissões, revisões, políticas editoriais ou comunicações institucionais, entre em contato através do email editorial."
						: "For questions about submissions, reviews, editorial policies, or institutional communications, contact us via editorial email."}
				</p>
			</div>
		</div>
	)
}

function InfoCard({ title, content }: { title: string; content: string }) {
	return (
		<div className="p-4 border rounded-lg bg-muted/50">
			<h4 className="font-semibold text-sm text-muted-foreground mb-2">{title}</h4>
			<p className="font-medium">{content}</p>
		</div>
	)
}

function PolicyCard({
	title,
	icon: Icon,
	children,
}: {
	title: string
	// biome-ignore lint/suspicious/noExplicitAny: Icon component type is loose
	icon: any
	children: React.ReactNode
}) {
	return (
		<div className="border rounded-lg p-6">
			<h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
				<Icon className="size-5 text-primary" />
				{title}
			</h3>
			<div className="text-muted-foreground">{children}</div>
		</div>
	)
}
