/**
 * Módulos da aplicação — define "o quê" o usuário pode acessar.
 *
 * O módulo é a fronteira entre apps do ERP: cada app resolve a MESMA tabela
 * `access_control.user_permissions` e filtra a própria visão pelos seus módulos.
 *
 * - diner:               Comensal (acesso implícito para todos os usuários válidos) — sisub
 * - messhall:            Rancho (fiscal, operador) — sisub, scoped by mess_hall_id
 * - unit:                Gestão Unidade — sisub, scoped by unit_id
 * - kitchen:             Gestão Cozinha — sisub, scoped by kitchen_id
 * - kitchen-production:  Produção Cozinha — sisub, scoped by kitchen_id
 * - global:              Catálogo global — sisub (insumos, preparações, planos, locais, revisão)
 * - admin:               Administração do sistema — sisub (permissões, avaliação, sincronização,
 *                          ambiente de treino). Separado de `global` para segregar a governança
 *                          de conteúdo (diária, reversível) da administração de plataforma (rara,
 *                          alto risco). Backfill inicial concede `admin` a quem tinha `global`.
 * - analytics:           Análise sistêmica global — sisub
 * - local-analytics:     Análises da unidade — sisub, scoped by unit_id
 * - storage:             Estoque e almoxarifado — sisub
 * - rumaer:              Uniformes RUMAER — rumaer, unscoped/global
 *                          level 2 = editar uniformes; level 3 = gerenciar grants do rumaer.
 * - sucont-1:            SUCONT-1 (Custos / DGC) — sucont, unscoped/global.
 * - sucont-3:            SUCONT-3 (Contábil) — sucont, unscoped/global.
 * - sucont-4:            SUCONT-4 (Patrimonial) — sucont, unscoped/global.
 *                          Nas três divisões: level 1 = abrir as ferramentas DELA;
 *                          level 2 = editar os dados da seção (área de trabalho, relatórios,
 *                          mensagens, análises salvas).
 * - sucont-admin:        Administração do SUCONT (gerenciar grants dos módulos acima) —
 *                          sucont, unscoped/global. Usa level 3, o mesmo que o módulo
 *                          `sucont` único exigia antes do split: o backfill preserva o nível.
 *
 * As três divisões são módulos SEPARADOS, e não escopos de um módulo `sucont` único, porque
 * o escopo do PBAC é um id numérico de unidade/cozinha/refeitório — a divisão da SUCONT não
 * é nenhum dos três. É o mesmo recorte que o sisub faz com `global` × `admin`: quem trabalha
 * na SUCONT-3 não passa a enxergar as telas da SUCONT-4 por ter acesso ao app.
 */
export type AppModule =
	| "diner"
	| "messhall"
	| "unit"
	| "kitchen"
	| "kitchen-production"
	| "global"
	| "admin"
	| "analytics"
	| "local-analytics"
	| "storage"
	| "rumaer"
	| "sucont-1"
	| "sucont-3"
	| "sucont-4"
	| "sucont-admin"

/**
 * Permissão individual de um usuário.
 * - level 0: deny explícito
 * - level 1: leitura / acesso básico
 * - level 2: escrita / edição
 * - level 3+: administração
 * Escopos nulos = permissão global (vale para qualquer contexto).
 */
export interface UserPermission {
	module: AppModule
	level: number
	mess_hall_id: number | null
	kitchen_id: number | null
	unit_id: number | null
}

/** Escopo geográfico/operacional para validação granular. */
export type PermissionScope = { type: "unit"; id: number } | { type: "mess_hall"; id: number } | { type: "kitchen"; id: number }

/**
 * Por onde a credencial da request entrou.
 *
 * `api-key` é a chave do `sisub-mcp`: credencial permanente, sem senha e sem segundo fator.
 * O eixo existe separado do `aal` porque "não elevada" e "impossível de elevar" pedem
 * mensagens diferentes — a primeira manda digitar 6 dígitos, a segunda manda usar a interface.
 */
export type CredentialOrigin = "session" | "api-key"

/**
 * Contexto de um usuário autenticado após resolução das permissões.
 * Compartilhado entre apps (sisub, rumaer) — cada app monta o seu no
 * `requireAuth()` do próprio runtime a partir de `resolveUserPermissions`.
 *
 * ## O eixo de garantia é ORTOGONAL ao PBAC
 *
 * `aal`/`lastFactorAt`/`origin` respondem "quanto esta sessão provou ser quem diz ser", e
 * NÃO alteram a semântica de nenhum `hasPermission`. Quem não tem permissão continua
 * recebendo negativa de permissão; a garantia só é consultada DEPOIS, e só por operação
 * classificada. Ver `assurance.ts`.
 *
 * ## Os valores vêm do JWT já validado, nunca do payload
 *
 * Quem popula é `createRequestAuth` (`start.ts`), lendo as claims do access token DEPOIS de
 * `getUser()` tê-lo validado contra o GoTrue. Um `aal` que chegasse pelo corpo da requisição
 * seria o próprio cliente declarando o quanto se autenticou.
 */
export interface UserContext {
	userId: string
	permissions: UserPermission[]
	/**
	 * Garantia da sessão: 1 = só o primeiro fator, 2 = segundo fator verificado.
	 * Chave de API e qualquer origem sem token de sessão são SEMPRE 1.
	 */
	aal: 1 | 2
	/** Instante (epoch em segundos) da última verificação de segundo fator; `null` se nunca. */
	lastFactorAt: number | null
	origin: CredentialOrigin
	/**
	 * `true` quando a conta tem ao menos um fator VERIFICADO cadastrado.
	 *
	 * Opcional, e ausente significa "não se sabe" — tratado como `false`. Só serve para
	 * escolher entre pedir cadastro (`enroll`) e pedir código (`challenge`) na negativa: é
	 * roteamento de tela, nunca decisão de acesso, e por isso não estar preenchido não abre
	 * nada. Fica fora do trio obrigatório porque nem toda origem de contexto tem como saber
	 * (a chave de API não carrega a lista de fatores do dono).
	 */
	hasVerifiedFactor?: boolean
}
