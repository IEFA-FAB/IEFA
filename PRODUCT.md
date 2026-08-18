# Produto

Quem a suíte IEFA serve, o que cada superfície resolve e qual é a direção de design de
cada uma. O contrato técnico de estilo mora em cada app (ver "Design" abaixo); este
documento é a intenção por trás dele.

## Usuários

Militares e servidores civis do COMAER, em ambiente corporativo, majoritariamente desktop,
com acesso diário. Não é público geral: quase toda tela exige sessão e a autorização é por
política (módulo + nível + escopo), não por papel global.

Três perfis se repetem em quase todos os apps:

- **Operador** — usa o sistema para o trabalho do dia (monta cardápio, registra estoque,
  responde questionário, consulta uniforme). Precisa de caminho curto e erro legível.
- **Gestor** — revisa, aprova e acompanha o que os operadores produziram. Precisa de estado
  agregado e de saber o que está pendente sem procurar.
- **Administrador** — concede acesso, mantém catálogo e corrige dado errado. Precisa de
  operação destrutiva com rastro e sem ambiguidade.

## O que cada app resolve

| App | Tarefa primária | Sucesso é |
|-----|-----------------|-----------|
| **sisub** | Planejar e executar a subsistência — cardápio, receita, produção, estoque, orçamento | O rancho fecha o cardápio da semana sem planilha paralela, e o número que ele vê bate com o do SIAFI |
| **portal** | Publicar e organizar conteúdo institucional; porta de entrada da suíte | O gestor publica sem fricção e o editor revisa sem ambiguidade visual |
| **sucont** | Acompanhamento contábil da SUCONT-4 | O analista encontra a inconsistência antes do fechamento, não depois |
| **rumaer** | Consultar a regulamentação de uniformes da FAB | A pergunta em linguagem natural devolve a prescrição certa, mesmo escrita errado |
| **forms** | Aplicar questionários e pesquisas internas | A pesquisa vai ao ar sem desenvolvedor no caminho |
| **assignment-selection** | Conduzir a escolha de vagas (CPAINT) ao vivo | O telão e o controlador nunca discordam sobre a vaga que acabou de ser escolhida |
| **api** | Expor alimentos, preços e rotinas de sincronização | O consumidor externo integra pela OpenAPI, sem pedir acesso ao banco |
| **alpha** | Verificar conformidade de ETP/TR contra a Lei 14.133/21 e as fontes federais | O parecer aponta o artigo real e o trecho real, com como chegou ali |
| **docs** | Documentar a suíte para quem opera e para quem desenvolve | A resposta está na busca, não no chat com o mantenedor |
| **sisub-mcp** | Dar aos modelos do usuário acesso governado aos dados do sisub | O modelo lê o dado certo dentro do escopo do usuário, e sabe o total do que não leu |

## Princípios de produto

1. **A autorização é o produto, não um detalhe** — o que o usuário pode fazer decorre da
   política dele, e a tela nunca oferece o que a política nega.
2. **Estado vazio não pode mentir** — "nenhum resultado" e "a consulta falhou" são telas
   diferentes. Confundi-las já custou um dia de investigação.
3. **Dado agregado carrega o total** — toda listagem limitada diz de quantos ela é recorte,
   para humano e para modelo. Sem isso, 30 itens viram "o catálogo tem 30".
4. **Toda operação destrutiva deixa rastro** — versão nova é linha nova; exclusão é soft
   delete com autor e horário. A prova do que existia antes não se apaga.
5. **IA nunca é caminho crítico** — sem as variáveis do provider, a tela diz "Em breve" e o
   endpoint responde 503. O app continua de pé.

## Design

sisub e portal têm linguagens visuais **incompatíveis de propósito** — nunca copiar padrão
de um para o outro. Os demais apps ficam entre os dois:

| Superfície | Sistema | `--radius` | Contrato |
|------------|---------|-----------|----------|
| sisub | Flat design técnico-militar, cores sóbrias, hierarquia por tokens | `0.5rem`; o primitivo `<Card>` usa `rounded-xl` | `apps/sisub/docs/STYLE_CONTRACT.md` |
| portal | Pale Brutalism 2026 — border-first, acromático, tracking negativo | `0rem` | `apps/portal/STYLE_CONTRACT.md` |
| rumaer | Contrato próprio | `0.625rem` | `apps/rumaer/STYLE_CONTRACT.md` |
| forms | Sem contrato escrito; segue o portal no radius | `0rem` | — |
| sucont, assignment-selection | Sem contrato escrito; default shadcn/Base UI | `0.625rem` | — |

Os apps sem contrato escrito são dívida conhecida, não licença: valem as proibições globais
abaixo e o princípio de consumir token semântico em vez de valor inventado.

### Personalidade da marca

Técnico, austero, confiável. Referências do portal: adidas.com, greptile.com, Vercel Geist,
Linear 2025.

### Anti-referências

- Interfaces SaaS genéricas com gradientes coloridos e glassmorphism
- Rounded corners excessivos (Notion, shadcn default)
- Hero metrics com números gigantes e gradiente de acento
- Paleta colorida (azul corporativo + verde + teal)
- Dot-grid decorativo no body, glow e blur em navegação
- **Faixa de acento lateral** (`border-l-4` + cantos arredondados do outro lado) para marcar
  grupo, status ou severidade — proibida em todos os apps. Distinguir por borda completa,
  tint de fundo, ícone ou badge

### Acessibilidade e inclusão

WCAG AA no mínimo. Foco explícito visível (`outline: 2px solid var(--ring)`). Nenhum estado
comunicado só por cor. A interface é em português do Brasil; termo em inglês só quando é o
nome próprio da coisa.
