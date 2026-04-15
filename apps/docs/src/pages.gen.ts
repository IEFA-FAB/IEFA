// deno-fmt-ignore-file
// biome-ignore format: generated types do not need formatting
// prettier-ignore
import type { GetConfigResponse, PathsForPages } from 'waku/router';
// prettier-ignore
import type { getConfig as File_Root_getConfig } from "./pages/_root"
// prettier-ignore
import type { getConfig as File_HomeIndex_getConfig } from "./pages/(home)/index"
// prettier-ignore
import type { getConfig as File_DocsSlugs_getConfig } from "./pages/docs/[...slugs]"
// prettier-ignore
import type { getConfig as File_DocsIndex_getConfig } from "./pages/docs/index"

// prettier-ignore
type Page =
	| ({ path: "/" } & GetConfigResponse<typeof File_HomeIndex_getConfig>)
	| ({ path: "/_root" } & GetConfigResponse<typeof File_Root_getConfig>)
	| ({ path: "/docs/[...slugs]" } & GetConfigResponse<typeof File_DocsSlugs_getConfig>)
	| ({ path: "/docs" } & GetConfigResponse<typeof File_DocsIndex_getConfig>)

// prettier-ignore
declare module "waku/router" {
	interface RouteConfig {
		paths: PathsForPages<Page>
	}
	interface CreatePagesConfig {
		pages: Page
	}
}
