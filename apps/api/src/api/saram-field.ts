// ─── SARAM: o nome do espelho e o campo depreciado de `/user-data` ───────────────
//
// O glossário chama o número do militar de SARAM (`saram`) em todo objeto nosso (lote 6 de
// `sisub-ubiquitous-language`, D2): `core.user_data.saram`, `core.person.saram`,
// `core.military_identity.saram`. Dois nomes antigos ficam, e só aqui:
//
//   * `MIRROR_SARAM_COLUMN`: a coluna do espelho do cadastro de pessoal (`core.user_military_data`)
//     guarda o nome do sistema de origem, que o patch manual do mantenedor traz (D3; `LGPD.md`).
//     `/user-military-data` espelha a tabela, e o campo e o filtro dela seguem com esse nome;
//   * `LEGACY_SARAM_FIELD`: `/user-data` passou a devolver e filtrar por `saram`; o nome antigo
//     continua na resposta (mesmo valor) e como filtro, marcado como obsoleto no OpenAPI, para não
//     quebrar um consumidor externo desconhecido da rota restrita (a mesma cautela do D7).
//
// TODO(2026-09-27): `LEGACY_SARAM_FIELD` sai quando o mantenedor decidir; o contract do lote 6
// (20260927190000) não depende dele, porque o alias lê a coluna nova.

export const MIRROR_SARAM_COLUMN = "nrOrdem"
export const LEGACY_SARAM_FIELD = "nrOrdem"
