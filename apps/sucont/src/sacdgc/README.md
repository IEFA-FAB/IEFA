# SAC-DGC — Análise Crítica do Demonstrativo Gerencial de Custos

Rota: `/sac-dgc`. Sucessor do aplicativo `sacdgccomaer` (AI Studio + Gemini + Firestore),
reescrito sobre a stack do monorepo.

## Como funciona

1. A tela recebe os quatro painéis do DGC exportados do Tesouro Gerencial (CSV ou XLSX).
2. `files.ts` → `parser.ts` decodificam e **recortam a base por Unidade Gestora**, tudo no
   navegador. O servidor nunca guarda a base.
3. Ao pedir a análise de uma UG, só o recorte dela (mais um resumo das UGs do mesmo grupo,
   para comparação) vai para `POST /api/sacdgc/analyze`.
4. A rota monta o prompt (`prompt.ts`), chama o modelo com saída estruturada
   (`schema.ts`) e devolve a análise normalizada por SSE.
5. `DgcReport` mostra os alertas de criticidade, o Checklist AEC (20 itens) e o raciocínio
   por painel.
6. A análise é gravada em `sucont.dgc_analysis` (`src/server/sacdgc.fn.ts`), sob a rodada
   `sucont.analysis_run` (`tool = 'sac-dgc'`). Reabrir uma competência lê do banco em vez
   de repetir ~69 chamadas ao modelo.

## Banco

Mesmo projeto Supabase do sisub e dos demais apps, separado por schema — clientes em
`#/lib/supabase.server` (`sucont` para dados, `access_control` para PBAC, `core` só leitura
de perfil). Migration: `packages/database/supabase/migrations/20260818160000_sucont_dgc_analysis.sql`.

- `alert_count` e `finding_count` são colunas GERADAS do próprio jsonb: a lista ordena por
  elas, e um número vindo da aplicação poderia discordar do conteúdo.
- `period` é o dia 1 do mês, ou `null` quando a carga misturou meses — inventar uma data
  atribuiria achados de agosto a julho.
- Chave natural `(run_id, ug_codigo)`: reanálise da mesma UG na mesma rodada sobrescreve.
- As planilhas do DGC **não** são armazenadas. O que fica é o resultado.

Gate: leitura exige `sucont` nível 1; gravação, nível 2. Conta sem nível 2 analisa e vê o
resultado, com aviso de que ele não fica gravado.

## Por que SSE e não uma server function

O `idle_timeout` do ALB compartilhado é de 60 s. A geração de uma análise completa passa
disso com frequência, e uma resposta única seria cortada como 502 sem mensagem. A rota
envia um comentário de keep-alive a cada 15 s enquanto o modelo trabalha.

Rota Nitro **só existe se estiver declarada** em `handlers` no `nitro()` do
`vite.config.ts`. Um arquivo em `routes/` sem essa declaração é compilado e nunca
registrado: o pedido cai no catch-all do SSR e volta 307 para `/auth`.

## O que foi corrigido em relação à versão anterior

| Defeito | Efeito | Onde |
|---|---|---|
| CSV windows-1252 lido como UTF-8 | "Diárias" chegava ao modelo como "Di<?>rias" | `parser.ts` (`decodeSpreadsheet`) |
| Coluna da UG com índice fixo | Linha do Painel 4 ia para a UG emitente, não a beneficiada | `parser.ts` (`ugColumnIndex`) |
| Modelo `gemini-3.5-flash` (inexistente) | Toda chamada falhava | Bedrock via `@iefa/ai-provider` |
| Exemplo numérico em padrão inglês no prompt | Valores reportados 1000× errados | `prompt.ts` |
| Painel não enviado tratado como custo ausente | Alerta de "ausência de apropriação" sobre dado não carregado | `prompt.ts` |
| Truncagem silenciosa do recorte | Modelo concluía ausência de custo sobre o que foi cortado | `parser.ts` + `prompt.ts` |
| Saída do modelo aceita sem validar | Checklist pela metade e indicadores contados pelo próprio modelo | `schema.ts` (`normalizeDgcAnalysis`) |
| `logger` ausente no `TextOptions` | Provider de reserva morria em `logger.request` e escondia o erro real | `#/lib/ai-logger` |
| `model` ausente no `TextOptions` | Reserva com API key respondia `400 'model' is missing` | `@iefa/ai-provider` (`withAdapterModel`) |
| Saída estruturada do Bedrock por system prompt | Schema grande fazia o modelo narrar em markdown; JSON não fechava | `@iefa/ai-provider` (tool use no Converse) |
| Sem `maxTokens` na chamada | Análise cortada no meio da string, erro "falha ao parsear" | `routes/api/sacdgc/analyze.post.ts` |
| Rota Nitro não declarada em `handlers` | `/api/chat/stream` e a análise respondiam 307 para /auth | `vite.config.ts` |

## Testes

```bash
cd apps/sucont && bun test src/sacdgc
```

`parser.integration.test.ts` roda contra a base REAL e fica em skip por padrão: as
planilhas do DGC não moram no repositório. Para rodá-lo, ponha os CSVs da competência em
`apps/sucont/data_test/` (a pasta é ignorada pelo git).

### E2E (Playwright)

```bash
cd apps/sucont && bun run test:e2e
```

Precisa de `.env` com Supabase, `E2E_TEST_USER_*` e — para o `sac-dgc-ia.spec.ts`, que faz
uma chamada real ao modelo e confere a gravação — `SUCONT_AI_*`. Sem as vars de IA esse
spec fica em skip; os demais rodam.

As fixtures em `e2e/fixtures/` são **windows-1252 com CRLF** de propósito: é o formato do
export do Tesouro Gerencial, e é o que faz o teste exercitar a decodificação de verdade.

#### Faxina (o E2E escreve no banco de produção)

`sac-dgc-ia.spec.ts` é o único spec que grava. A convenção é a do sisub:

- `makePanelFixtures()` copia as planilhas para nomes com `[TEST]` **e** o token da
  execução (`<base36><hex8>-<seq>`). O nome do arquivo chega a
  `sucont.analysis_run.filename` pelo caminho normal do app — nenhum código de produção
  sabe que existe teste.
- `[TEST]` prova a intenção; o token prova a origem. Só o marcador não bastaria: uma
  rodada real batizada de "[TEST]" seria apagada junto.
- `afterAll` apaga por token e **confere que sobrou zero** — falha de limpeza reprova o
  teste. As análises saem por `on delete cascade` da rodada.
- `globalSetup` varre antes de começar: `afterAll` não roda quando o processo morre de
  repente (job cancelado, Ctrl+C), e o que ficou está em produção.

Rede de segurança manual/CI:

```bash
bun run purge:test-fixtures                       # dry-run: só relata
bun run purge:test-fixtures -- --apply
bun run purge:test-fixtures -- --apply --force    # inclui as suspeitas (sem token)
```

Rodada marcada sem token é **suspeita**: só é relatada, e só sai com `--force` — nunca no
CI. Freios: `--max-rows` (padrão 200) e `--min-age-minutes` abortam antes de apagar.
