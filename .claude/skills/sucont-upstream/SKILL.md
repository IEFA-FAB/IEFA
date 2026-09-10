---
name: sucont-upstream
description: Confere os repositórios de origem das ferramentas portadas para apps/sucont (sucont32sau-debug, lsantosnels) — o que mudou lá desde a última conferência e se a lógica nova existe no app. Use quando o pedido for "ver o que mudou no upstream do sucont", "conferir o repo <nome> contra o sucont", "atualizações do sacdgccomaer" ou equivalente.
---

# Upstream do sucont

O `apps/sucont` nasceu de ~9 ferramentas escritas fora do monorepo (AI Studio/Gemini/Firestore,
Vite solto, scripts). Os repositórios originais **continuam recebendo commits** — quem mantém
as ferramentas não trabalha na `main` do IEFA. Esta skill responde uma pergunta só: *o que
mudou lá que ainda não existe aqui?*

Estado fica em `sources.json` (ao lado deste arquivo): mapeamento repo → caminhos do
monorepo, mais o `checkpoint` (último commit upstream **já conferido**) por repositório.

## Procedimento

### 1. Panorama

```bash
bash .claude/skills/sucont-upstream/scan.sh
```

Lista todo repo dos owners com data do último push e quantos commits há além do checkpoint.
Repo que aparece com `⚠ FORA do sources.json` é ferramenta nova ou renomeada — mapeie antes
de seguir, senão ela some da próxima varredura.

### 2. Detalhe de um repositório

```bash
bash .claude/skills/sucont-upstream/scan.sh sacdgccomaer            # commits + arquivos desde o checkpoint
bash .claude/skills/sucont-upstream/scan.sh sacdgccomaer --patch <sha>
bash .claude/skills/sucont-upstream/scan.sh sacdgccomaer --files <sha>
bash .claude/skills/sucont-upstream/scan.sh sacdgccomaer --cat <sha> src/services/gemini.ts
```

Sem checkpoint gravado, o detalhe mostra os últimos 30 commits — nesse caso o corte é você
que decide (a data do PR de port costuma ser o marco; `portedIn` no `sources.json` diz qual PR).

### 3. Conferir contra o app

Para **cada** mudança upstream, classifique em uma destas quatro, e diga qual:

| Classe | Significado |
|---|---|
| **Já existe** | A mesma regra está nos `targets`. Cite arquivo:linha do sucont. |
| **Divergência deliberada** | O port mudou de propósito. `apps/sucont/src/sacdgc/README.md` tem a tabela dos defeitos corrigidos — mudança upstream que reintroduz um deles **não é pendência, é regressão de lá**. Diga isso. |
| **Pendente** | Regra de negócio nova (conta, UG, limiar, texto de norma, campo do relatório) que o app não tem. Vira trabalho. |
| **Não se aplica** | Infra do upstream que o monorepo já resolve de outro jeito: Firestore, chave de API do Gemini no cliente, deploy do AI Studio, retry/quota do Gemini, `.env` do Vite solto. Não portar. |

Regra de leitura: o que interessa é a **regra de domínio**, não o código. Upstream é
React+Gemini+Firestore; aqui é TanStack Start + Bedrock (`@iefa/ai-provider`) + Supabase.
Diff textual sempre vai parecer "tudo diferente" — ignore forma, procure: constantes de UG,
códigos de conta, itens de checklist, limiares, prompt do modelo, colunas de planilha,
regras de parsing (encoding, índice de coluna, separador decimal).

Atenção ao prompt: no SAC-DGC o prompt **é** a regra de negócio. Mudança em `prompt.ts`
upstream quase sempre é pendência real.

### 4. Fechar

- Achado que vira trabalho: proposta OpenSpec ou issue — **não** implemente junto com a
  varredura, a menos que peçam.
- Atualize `sources.json`: `checkpoint` = SHA do último commit upstream conferido,
  `checkpointDate` = data dele, `lastReviewed` = data de hoje. Sem isso a próxima varredura
  relê tudo e você não sabe o que já foi julgado.
- Mova o checkpoint **só do que foi conferido de fato**. Checkpoint adiantado é pior que
  checkpoint ausente: some com a pendência em silêncio. Conferência parcial (só assunto de
  commit, sem diff) deixa o checkpoint em `null` e diz "parcial" no `lastReviewed`.
- O que ficou pendente vai para o array `pending` do repositório, com o SHA de origem. É ele
  que sobrevive ao avanço do checkpoint — sem isso, mover o marcador apaga o achado. Item
  resolvido sai do `pending` no mesmo PR que o resolve.
- O commit dessa atualização entra por PR como qualquer outra mudança.

## Limites conhecidos

- O token do `gh` precisa de `repo` — os repositórios são privados e o acesso é por convite
  individual. Repo mapeado que passa a responder "inacessível" no panorama = convite
  revogado, não repo apagado.
- `analistacriticodgc` e `sacdgccomaer3` são públicos e parecem variantes abandonadas do
  SAC-DGC. Confirme atividade antes de tratar achado ali como pendência.
- A comparação é por leitura, não automática: `scan.sh` só entrega os commits, os arquivos e
  o conteúdo. Julgar equivalência é trabalho de leitura dos dois lados.
