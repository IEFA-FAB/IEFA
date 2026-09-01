import { createIsomorphicFn } from "@tanstack/react-start"
import { getCookie } from "@tanstack/react-start/server"
import { parseTheme, readCookieOnClient, THEME_COOKIE_NAME, type Theme } from "#/services/theme"

/**
 * Leitura da escolha de tema, isomórfica — arquivo separado do provider DE
 * PROPÓSITO.
 *
 * `@tanstack/react-start/server` puxa `node:async_hooks`. Enquanto isto morava
 * junto do `ThemeProvider`, qualquer componente que chamasse `useTheme()` — ou
 * seja, o `HubLayout`, ou seja, o app inteiro — arrastava o módulo de servidor
 * para dentro da árvore de componentes. No app o plugin do Start apaga o ramo,
 * mas o harness visual, que monta os componentes reais com Vite puro, parou de
 * compilar: "Missing #tanstack-start-entry specifier".
 *
 * Só o `__root` importa daqui, e só no shell.
 */
export const readThemePreference = createIsomorphicFn()
	.server((): Theme | null => parseTheme(getCookie(THEME_COOKIE_NAME)))
	.client(readCookieOnClient)
