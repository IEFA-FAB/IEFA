---
paths:
  - "packages/sisub-domain/**"
  - "apps/sisub/src/lib/module-chat/**"
  - "apps/sisub-mcp/**"
---

# Ferramentas de IA (chat dos módulos + servidor MCP)

Os dois expõem o mesmo domínio para modelos diferentes. Regras para não divergirem:

- **Listagem exposta a modelo mora em `@iefa/sisub-domain/agent`**: entrada (schema Zod), teto
  (`clampLimit`) e projeção são definidos uma vez e consumidos pelo chat
  (`apps/sisub/src/lib/module-chat/tools/`) e pelo MCP (`apps/sisub-mcp/src/tools/`). Testes de
  contrato nos dois lados comparam o `inputSchema`/`parameters` com `toJsonSchema(...)` do schema
  compartilhado.
- **Toda listagem tem `limit` e devolve `total`.** Sem o total, o modelo lê 30 itens e conclui que o
  catálogo tem 30.
- **Resultado de tool tem orçamento** (`MAX_TOOL_RESULT_CHARS`, 60k caracteres em JSON compacto). É
  freio contra patologia; quem dimensiona a resposta normal é o `limit`. O resultado volta inteiro no
  prompt do turno seguinte, e acima do teto o provider responde 413 e a run morre sem mensagem. O teto
  é aplicado no `wrapTool` (chat) e no despacho (MCP); estourar vira erro de tool que o modelo lê e
  corrige.
- **Nada de query PostgREST/SQL escrita à mão numa tool quando a operation existe.** Foi assim que
  `list_ingredients` ordenou por coluna inexistente e `list_kitchens` embutiu `units.name`.

## `null` do modelo é ausência, resolvida no boundary

Modelo não omite campo opcional, manda `null`. Quem normaliza é `dropUnexpectedNulls`, no `wrapTool`
(chat) e no despacho do MCP, os dois únicos pontos por onde argumento de modelo entra. O schema do
domínio segue a semântica do ERP, não a do provider:

- **`.optional()`** (`T | undefined`) é o default de campo de patch: ausente = não mexe.
  `applyTemplateContent` depende disso.
- **`.nullable().optional()`** só onde `null` significa algo no ERP: limpa a coluna. A operation
  ramifica em `!== undefined` (caso de `UpdateTemplateSchema.description`).
- **`.nullish()` é obrigatório dentro de array, e só ali.** `dropUnexpectedNulls` não desce em array
  (posição é significativa), então o `null` aninhado chega ao `.parse()` e mata a run com
  `tool_use_failed`. Foi o caso de `TemplateItemSchema.headcountOverride`/`sortOrder`.
- **Não converter `.optional()` de campo de escrita em `.nullish()`.** `update_template.items` é
  substituição destrutiva (`if (items !== undefined) delete all + reinsert`); aceitar `null` ali
  transforma "o modelo não mexeu nos itens" em "apague os itens do template".

Guarda: `model-args.test.ts` nos dois lados varre todas as tools, tanto o `null` que vaza para o
handler quanto o opcional dentro de array que não aceita `null`.
