## Contexto

Ver `proposal.md`. O desenho reaproveita o caminho que já existe na ACI (submissão → extração →
verificação → triagem → parecer) em vez de criar outro: a demanda gera documentos, e os documentos
entram como qualquer envio.

## Decisões

### Estrutura antes do texto (Value-Focused Thinking)

A ordem dos passos é o método. O problema vem antes do objeto; os objetivos fundamentais, com
atributo e meta, antes das alternativas; e as alternativas são avaliadas objetivo a objetivo. Cada
bloco alimenta um inciso do art. 18, § 1º: problema → necessidade (I); objetivos fundamentais →
resultados pretendidos (IX); objetivos-meio → requisitos (III); alternativas → levantamento de
mercado (V); escolhida → descrição da solução (VII). As conferências cobram a rede meios-fins
(objetivo-meio sem fundamental, objetivo sem requisito que o realize, alternativa escolhida que
não atende um fundamental).

### Peças por regra, não por modelo de linguagem

As peças saem de funções puras sobre a estrutura. Motivos: previsibilidade (o mesmo dado gera o
mesmo texto), teste, custo zero e a verificação cruzada por construção (objeto, itens e valores
iguais em todas as peças). O que falta sai como `[PREENCHER: o quê]`; orientação fica em `note`,
fora do texto da peça (lição: "peça entregue como versão final").

### Um pacote para os dois lados

`@iefa/alpha-client/demand` é puro e roda no navegador (conferências ao vivo) e no α (geração do
que vai à ACI). O que a pessoa viu na tela é o que a ACI confere.

### Persistência

`alpha.demand` com `payload jsonb` validado por `DemandPayloadSchema`. Tabelas por bloco não
compensam: a forma é do método e muda com ele; o banco guarda o rascunho, a OM (que decide quem
enxerga) e o estado. Leitura: a regra da submissão (autor ou papel de leitura na OM). Edição: autor
ou requisitante da OM (`decideDemandEdit`); licitações e ACI só leem.

Gravação automática com concorrência otimista: o `PATCH` leva o `updated_at` lido e o α recusa
com 409 se outra pessoa gravou. A tela para de gravar e oferece recarregar. O CORS do α libera
`PATCH` (não `PUT`), então a rota é `PATCH`.

### Documento para a ACI

`.docx` mínimo com `fflate` (já dependência do α): títulos em `HeadingN`, parágrafos, e tabela
linha a linha ("Coluna: valor; …"), porque o leitor lê cada célula como parágrafo e célula curta
em caixa alta viraria título de seção na comparação com o modelo da AGU. Mesmo bucket, mesmo MIME,
mesma extração.

### Schema do banco

```sql
create table alpha.demand (id uuid pk, user_id uuid, unit_id bigint fk core.units, title text,
  payload jsonb, status text check ('rascunho','enviada'), submitted_at, created_at, updated_at,
  updated_by);
alter table alpha.submission add column demand_id uuid references alpha.demand on delete set null;
```

RLS ligada sem policy (só service_role), como o resto do schema `alpha`. Teto de 1 MiB no payload.

## Riscos

- **Deploy do α antes da migration** quebra a lista de submissões (`demand_id` inexistente).
  Mitigação: PR espera o mantenedor; migration aplicada antes do merge.
- **Texto gerado genérico demais**: as peças dependem da qualidade do que a pessoa escreve nos
  passos. Mitigação: perguntas de apoio em cada campo e conferências de redação (travessão,
  frases que admitem falha).
