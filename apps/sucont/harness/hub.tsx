/**
 * Harness visual da casca do hub — NÃO faz parte do app.
 *
 * A casca (barra lateral, cabeçalho, bloco da conta) e o catálogo só aparecem
 * com sessão, e o app compartilha o projeto Supabase com produção — criar
 * usuário de teste lá só para olhar um layout não é aceitável. Aqui os
 * componentes reais rodam num router de memória, com a sessão semeada no cache
 * do react-query, contra a folha de estilo real.
 *
 * Foi a ausência desta tela que deixou passar um `ReferenceError` de avaliação
 * de módulo: typecheck, build e `/health` estavam verdes e nenhum deles montava
 * a casca.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router"
import { AlertTriangle, BookOpen, MessageSquare, Search } from "lucide-react"
import type React from "react"
import { createRoot } from "react-dom/client"
import { z } from "zod"
import { SucontPermissionsManager } from "#/components/admin/permissions-manager"
import { AnalysisStart } from "#/components/analysis-start"
import { HubLayout } from "#/components/hub-layout"
import { RacReference } from "#/components/rac-reference"
import { TesouroGerencialPath } from "#/components/tesouro-gerencial-path"
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert"
import { FileDropzone } from "#/components/ui/file-dropzone"
import { SectionHeader } from "#/components/ui/section-header"
import { SegmentedControl } from "#/components/ui/segmented-control"
import { StatTile } from "#/components/ui/stat-tile"
import { Route as IndexRoute } from "#/routes/index"
import "./harness.css"

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
queryClient.setQueryData(["auth", "user"], {
	// O `id` casa com o primeiro grant do stub de `permissions.fn`: é o que faz a
	// tela marcar a linha como "Você" e desabilitar o próprio "Revogar".
	user: { id: "harness-admin", email: "nannijpsn@fab.mil.br", user_metadata: { name: "Nanni JPSN" } },
	session: null,
	isAuthenticated: true,
	isLoading: false,
})

// Nível 3: é o único que revela o seletor de módulo no topo da barra. Com nível 1
// ou 2 o cabeçalho volta a ser o atalho para a casa, e o harness deixaria de
// cobrir justamente o controle novo.
queryClient.setQueryData(["sucont", "myPermissions"], [{ module: "sucont", level: 3, mess_hall_id: null, kitchen_id: null, unit_id: null }])

// SARAM já vinculado: sem isto o diálogo de primeiro acesso (montado pelo
// HubLayout) abriria sobre TODA tela do harness, e o que está sob exame é a
// casca. Para inspecionar o diálogo, apague esta semente.
queryClient.setQueryData(["sucont", "myIdentity"], { nrOrdem: "7379749", posto: "1T", nomeGuerra: "NANNI" })

const Catalogo = IndexRoute.options.component as () => React.ReactNode

// Mesmo `validateSearch` da raiz do app: os filtros do catálogo leem `?q=`,
// `?etapa=` e `?rac=`.
// Lê o mesmo cookie que a raiz do app lê no `beforeLoad`. Sem isto o harness
// entregava `sidebarOpen` indefinido, o provider caía no padrão "aberta", e um
// reload sempre voltava expandida — o harness não cobria a persistência que é
// justamente o ponto da implementação.
function sidebarOpenFromCookie(): boolean {
	const raw = Object.fromEntries(
		document.cookie.split(";").map((c) => {
			const [name, ...v] = c.trim().split("=")
			return [name.trim(), v.join("=")]
		})
	).sidebar_state
	return raw === undefined ? true : raw === "true"
}

const rootRoute = createRootRoute({
	beforeLoad: () => ({ sidebarOpen: sidebarOpenFromCookie() }),
	validateSearch: z.object({
		q: z.coerce.string().optional().catch(undefined),
		etapa: z.string().optional().catch(undefined),
		rac: z.coerce.number().int().optional().catch(undefined),
		// A divisão da SUCONT: é ela que o seletor de módulo escreve na URL, e sem
		// declará-la aqui o harness perderia o parâmetro na navegação e a barra
		// lateral voltaria sempre para a divisão padrão.
		divisao: z.enum(["sucont-1", "sucont-3", "sucont-4"]).optional().catch(undefined),
	}),
})
const screen = (path: string) => createRoute({ getParentRoute: () => rootRoute, path, component: Catalogo })

// Rotas de ferramenta, para inspecionar a orientação DENTRO de uma delas: item
// ativo na barra e trilha no cabeçalho.
//
// O conteúdo é a tela inicial de análise DE VERDADE — a mesma composição que as
// sete ferramentas montam. Era um parágrafo marcador, e por isso o harness não
// enxergava justamente o que divergia entre elas: a forma da zona de envio, a
// ordem dos blocos e o comportamento da borda tracejada no tema escuro.
const toolScreen = (path: string) =>
	createRoute({
		getParentRoute: () => rootRoute,
		path,
		component: () => (
			<HubLayout>
				<AnalysisStart
					dropzone={
						<FileDropzone
							accept=".xlsx,.xls"
							onFiles={() => {}}
							prompt="ou arraste o relatório"
							hint="Excel do Tesouro Gerencial (.xlsx, .xls)"
							columns={["UG", "Conta Contábil", "Conta Corrente", "Saldo"]}
						/>
					}
					source={<TesouroGerencialPath />}
					reference={
						<RacReference
							statement="Enunciado da questão do RAC que a ferramenta responde, como ele aparece no roteiro."
							objective="O que a análise procura na planilha."
							risk="O que a inconsistência esconde ou provoca."
							importance="O que a regularização preserva."
						/>
					}
					notes={[
						{ icon: Search, title: "O que é analisado", text: "Recorte do dado que a ferramenta percorre." },
						{ icon: MessageSquare, title: "O que é gerado", text: "Mensagem padronizada por UG, pronta para revisão." },
						{ icon: BookOpen, title: "Como o resultado é lido", text: "As visões em que o achado é apresentado." },
					]}
				/>
			</HubLayout>
		),
	})

// Estado de RESULTADO de uma ferramenta: o segmentado de visão, os indicadores,
// o cabeçalho de seção e os avisos — as peças que as sete telas passaram a
// compartilhar depois da entrada. Uma rota só; o que está sob exame é a forma.
const resultScreen = (path: string) =>
	createRoute({
		getParentRoute: () => rootRoute,
		path,
		component: () => (
			<HubLayout>
				<div className="space-y-6">
					<SegmentedControl
						label="Visão do painel"
						size="lg"
						value="operacional"
						onValueChange={() => {}}
						options={[
							{ value: "estrategica", label: "Estratégica" },
							{ value: "tatica", label: "Tática" },
							{ value: "operacional", label: "Operacional" },
						]}
					/>
					<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
						<StatTile label="Total de inconsistências" value={128} />
						<StatTile label="Volume financeiro em risco" value="R$ 4,2 mi" status="destructive" hint="soma absoluta dos saldos irregulares" />
						<StatTile label="UGs com inconsistências" value={17} status="warning" />
						<StatTile label="Questão RAC mais frequente" value="Q28" status="action" hint="principal ofensor sistêmico" />
					</div>
					<Alert variant="warning">
						<AlertTriangle />
						<AlertTitle>Conta fora do escopo também é analisada</AlertTitle>
						<AlertDescription>Contas que não fazem parte do escopo parametrizado do RAC são destacadas em seção própria.</AlertDescription>
					</Alert>
					<SectionHeader
						icon={<AlertTriangle />}
						title="Inconsistências por UG"
						description="Ações de cobrança e auditoria SUCONT-3"
						actions={
							<SegmentedControl
								label="Modo de mensagem"
								value="individual"
								onValueChange={() => {}}
								options={[
									{ value: "individual", label: "Mensagens individuais" },
									{ value: "unica", label: "Mensagem única" },
								]}
							/>
						}
					/>
					<Alert variant="success">
						<AlertTriangle />
						<AlertTitle>Nenhuma cobrança necessária</AlertTitle>
						<AlertDescription>Todas as ocorrências processadas são exceções previstas na matriz normativa.</AlertDescription>
					</Alert>
				</div>
			</HubLayout>
		),
	})

const TOOL_PATHS = [
	"/auditor",
	"/monitoramento",
	"/documentacao",
	"/subitens-genericos",
	"/cruzamento-contas",
	"/analista-compatibilidade",
	"/conta-generica",
	"/analistasaldoalongado",
	"/sac-dgc",
	"/centro-monitoramento",
]

/**
 * O módulo `admin`: barra lateral própria e a tela de permissões com dado do stub.
 *
 * As DUAS rotas montam a mesma tela porque o harness não tem o `beforeLoad` que,
 * no app, redireciona `/admin` para `/admin/permissoes`. Sem a entrada de `/admin`
 * o clique no seletor caía num "Not Found" que não existe em produção.
 */
const adminScreen = (path: string) =>
	createRoute({
		getParentRoute: () => rootRoute,
		path,
		component: () => (
			<HubLayout
				title="Permissões"
				description="Quem entra no SUCONT e em que nível. O acesso vale para as três divisões — não há grant por divisão nem por seção."
			>
				<SucontPermissionsManager />
			</HubLayout>
		),
	})

const router = createRouter({
	routeTree: rootRoute.addChildren([
		screen("/"),
		screen("/workspace"),
		screen("/reports"),
		adminScreen("/admin"),
		adminScreen("/admin/permissoes"),
		...TOOL_PATHS.map(toolScreen),
		resultScreen("/harness/resultado"),
	]),
	history: createMemoryHistory({ initialEntries: ["/"] }),
})

// Atalho para a captura chegar a uma rota que não tem link na barra: o router
// é de memória e não lê a URL.
;(window as Window & { __harnessNavigate?: (to: string) => void }).__harnessNavigate = (to) => router.navigate({ to })

const el = document.getElementById("root")
if (!el) throw new Error("harness: #root ausente")
createRoot(el).render(
	<QueryClientProvider client={queryClient}>
		<RouterProvider router={router} />
	</QueryClientProvider>
)
