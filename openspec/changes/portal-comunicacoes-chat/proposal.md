## Why

A tela de comunicações oficiais (`/facilities/comunicacoes-oficiais`, NSCA 5-3/2026) faz **geração de um tiro**: o usuário descreve o que quer, a IA devolve o documento pronto. Quem sabe exatamente o que quer é bem servido; quem não sabe fica sem saída — a ferramenta não pergunta o que falta, não explica por que o fecho de cortesia sumiu, e um segundo pedido reescreveria o documento inteiro, apagando o que já tinha sido ajustado à mão.

Falta também o começo real do trabalho. Dois fatos do dia a dia que a ferramenta ignora:

1. **Os dados fixos se repetem em todo documento** — OM, sigla, endereço, posto e cargo do signatário são digitados de novo a cada ofício.
2. **A maioria dos ofícios não é o primeiro** — nasce de uma minuta ou da alteração de um documento antigo, que hoje não tem por onde entrar.

## What Changes

- **Modo conversa**, convivendo com o formulário na mesma rota e sobre o mesmo documento: alternador entre os dois, mesmo preview, mesmo estado.
- A IA passa a **editar por remendo** (`patch`), não por reescrita: cada turno altera só o que foi tratado, e o que o usuário digitou entre turnos sobrevive.
- A IA passa a **perguntar antes de agir** quando falta dado, em vez de preencher por conta própria. A pauta das perguntas sai da lista de pendências que a montagem do documento já produz.
- **Preview em painel lateral redimensionável**, com **destaque do que mudou no turno** e **desfazer por turno**.
- **Perfil do redator por usuário**: OM, contato, signatário e localidade padrão preenchem o documento novo. Sequencial do setor fica de fora de propósito — é contador vivo, e sugerir número errado é pior do que não sugerir.
- **Importação de minuta** por texto colado, PDF e foto/digitalização, para partir de um documento existente. Numeração, NUP e data entram **em branco**: copiar o número do ofício antigo é o erro clássico de quem parte de minuta.
- **`@iefa/ai-provider` passa a enviar anexo de documento ao Bedrock.** Hoje o adapter mapeia apenas as partes `text` e `image` e **descarta as demais em silêncio** — um PDF anexado sumiria sem erro nenhum. Beneficia sisub e sucont pelo mesmo commit.

Nada do que já existe é removido: a geração de um tiro continua sendo o caminho mais rápido para quem já sabe o que quer.

## Capabilities

### New Capabilities

- `comunicacoes-chat`: conversa que ajusta o documento por remendos, pergunta o que falta, e apresenta o resultado num preview com destaque de alteração e desfazer por turno.
- `perfil-do-redator`: dados fixos por usuário, aplicados ao documento novo, sem que a IA os invente quando ausentes.
- `importacao-de-minuta`: partir de um ofício existente — texto colado, PDF ou digitalização — preservando o conteúdo e zerando a identidade do documento.
- `anexo-de-documento-no-provider`: `@iefa/ai-provider` envia anexos ao Bedrock (blocos `document`) e falha alto quando o anexo não pode ser enviado, em vez de descartá-lo em silêncio.

### Modified Capabilities

Nenhuma: o repositório ainda não tem specs de baseline em `openspec/specs/`.

## Impact

**Código**

- `apps/portal`: rota `/api/comunicacoes/chat` (Nitro, SSE) e sua declaração em `handlers` no `vite.config.ts`; tools de remendo; modo conversa e painel lateral; perfil do redator; importação de minuta.
- `packages/ai-provider`: mapeamento de anexo (`DocumentBlock`) no adapter do Bedrock e erro explícito para parte não suportada.
- `packages/database`: schema `documents` ganha `writer_profile` (e, na última fatia, o histórico de conversa).

**Restrições que o desenho herda e não pode violar**

- Rota Nitro só existe se declarada em `handlers`; sem isso o pedido cai no SSR e responde 307 em vez de SSE.
- O teto de requisições é aplicado **antes** de abrir o SSE — depois do stream não há mais status HTTP.
- Documento classificado não vai a provider nenhum, e o gate passa a cobrir **também o arquivo anexado**.
- Toda tool nova entra na regra de `null` vindo do modelo e no orçamento de resultado de tool.
- O dono é sempre o da sessão; `documents` continua sem policy permissiva e acessível só por `service_role`.

**Custo e limites externos**

- Bedrock aceita até 5 documentos de 4,5 MB e 20 imagens de 3,75 MB por mensagem, apenas em mensagem do usuário, e **todo bloco de documento exige um bloco de texto junto**.
- O nome do arquivo é vetor de injeção de prompt — a própria AWS documenta isso no campo.
