/**
 * Derivações puras do `AppShell`: escopo aceito, módulo ativo, sidebar com URLs de escopo,
 * título da aba e destino do "voltar" no celular.
 */

import type { ModuleDef, ModuleId } from "@/components/layout/sidebar/NavItems"
import type { NavCrumb } from "@/lib/breadcrumbs"
import { isScopeInPath, normalizePath, scopeUrl } from "@/lib/nav-paths"
import type { ScopeContext } from "@/types/domain/scope"

export const APP_SHELL_LABELS = {
	appName: "SISUB",
	breadcrumbRoot: "Início",
}

/**
 * Lê o ScopeContext injetado pelo layout route do módulo ativo (ex: $messHallId/route.tsx),
 * e só o aceita se o id dele estiver na URL descrita — escopo de outra página não vaza.
 */
export function resolveScopeContext(matches: readonly { context: unknown }[], pathname: string): ScopeContext | undefined {
	const matchedScope = matches.map((m) => (m.context as Record<string, unknown>)?.scopeContext as ScopeContext | undefined).find(Boolean)
	return matchedScope && isScopeInPath(pathname, matchedScope.id) ? matchedScope : undefined
}

/** Módulo do caminho; senão o escolhido no menu; senão o primeiro disponível. */
export function resolveEffectiveModuleId(pathModuleId: ModuleId | null, selectedModuleId: ModuleId | null, availableModules: ModuleDef[]): ModuleId | null {
	return pathModuleId ?? selectedModuleId ?? availableModules[0]?.id ?? null
}

/**
 * Aplica URLs dinâmicas na sidebar quando dentro de um escopo
 * Ex: /messhall/presence → /messhall/3/presence
 */
export function applyScopeToModules(availableModules: ModuleDef[], effectiveModuleId: ModuleId | null, scopeContext: ScopeContext | undefined): ModuleDef[] {
	return availableModules.map((mod) => {
		if (mod.id !== effectiveModuleId) return mod
		// Módulo com escopo mas sem escopo selecionado → oculta itens para evitar
		// navegação para rotas inválidas (URLs base sem $scopeId não existem no router)
		if (mod.hubUrl && !scopeContext) return { ...mod, items: [] }
		if (!scopeContext) return mod
		return { ...mod, items: mod.items.map((item) => ({ ...item, url: scopeUrl(item.url, mod.id, scopeContext.id) })) }
	})
}

/** Escopo exibido no topo da sidebar: só em módulo com hub e com escopo aberto. */
export function buildSidebarScope(
	scopeContext: ScopeContext | undefined,
	effectiveModule: ModuleDef | undefined
): { name: string; hubUrl: string; noun: string } | null {
	return scopeContext && effectiveModule?.hubUrl
		? { name: scopeContext.name, hubUrl: effectiveModule.hubUrl, noun: effectiveModule.scopeNoun ?? "escopo" }
		: null
}

/** Nome do registro aberto, só quando foi informado para a página atual. */
export function resolveActiveEntityLabel(entityLabel: { path: string; label: string } | null, pathname: string): string | null {
	return entityLabel && entityLabel.path === normalizePath(pathname) ? entityLabel.label : null
}

/**
 * Título da aba: fonte única — as rotas do AppShell não declaram `title` no head, senão
 * as duas fontes disputam a aba. Formato: "Página · Registro · Escopo — SISUB". O registro
 * entra quando não é a própria página (Imprimir, Versões): o título vira o nome do PDF salvo.
 */
export function buildDocumentTitle(crumbs: NavCrumb[], activeEntityLabel: string | null, scopeContext: ScopeContext | undefined): string {
	const currentLabel = crumbs[crumbs.length - 1]?.label || APP_SHELL_LABELS.breadcrumbRoot
	const titleParts = [currentLabel]
	if (activeEntityLabel && activeEntityLabel !== currentLabel) titleParts.push(activeEntityLabel)
	if (scopeContext && currentLabel !== scopeContext.name) titleParts.push(scopeContext.name)
	return `${titleParts.join(" · ")} — ${APP_SHELL_LABELS.appName}`
}

/** Mobile: "voltar" leva ao crumb navegável mais próximo acima da página atual */
export function findParentCrumb(crumbs: NavCrumb[]): NavCrumb | undefined {
	return crumbs
		.slice(0, -1)
		.reverse()
		.find((c) => c.to !== null)
}
