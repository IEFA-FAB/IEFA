# Schema

WARNING: This schema is for context only and is not meant to be run.
Table order and constraints may not be valid for execution.

```sql

CREATE TABLE public.ceafa (
  id_ceafa integer NOT NULL,
  quantidade numeric NOT NULL,
  descricao character varying NOT NULL,
  CONSTRAINT ceafa_pkey PRIMARY KEY (id_ceafa)
);
CREATE TABLE public.embalagem (
  id_embalagem integer NOT NULL,
  embalagem character varying NOT NULL,
  fator_multiplicativo numeric NOT NULL,
  id_usuario_responsavel integer NOT NULL,
  id_unidade_medida integer NOT NULL,
  CONSTRAINT embalagem_pkey PRIMARY KEY (id_embalagem),
  CONSTRAINT fka5a83b3345576c96 FOREIGN KEY (id_unidade_medida) REFERENCES public.unidade_medida(id_unidade_medida)
);
CREATE TABLE public.ingrediente_preparacao (
  id bigint NOT NULL,
  tipo character varying,
  id_produto bigint,
  id_preparacao bigint,
  valor_absorcao numeric DEFAULT 1,
  quantidadeliquida numeric NOT NULL,
  CONSTRAINT ingrediente_preparacao_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ingrediente_preparacao_original (
  id bigint NOT NULL,
  tipo character varying,
  quantidade_substituto numeric,
  id_produto bigint,
  id_preparacao bigint,
  id_produto_substituto bigint,
  valor_absorcao numeric DEFAULT 1,
  quantidadeliquida numeric NOT NULL,
  CONSTRAINT ingrediente_preparacao_original_pkey PRIMARY KEY (id),
  CONSTRAINT fk_ingrediente_preparacao_original_id_preparacao FOREIGN KEY (id_preparacao) REFERENCES public.preparacao_original(id_preparacao),
  CONSTRAINT fk_ingrediente_preparacao_original_id_produto FOREIGN KEY (id_produto) REFERENCES public.produto(id_produto),
  CONSTRAINT fk_ingrediente_preparacao_original_id_produto_substituto FOREIGN KEY (id_produto_substituto) REFERENCES public.produto(id_produto)
);
CREATE TABLE public.insumo (
  id_insumo bigint NOT NULL,
  descricao character varying NOT NULL,
  id_grupo_produto integer NOT NULL,
  id_unidade_medida integer NOT NULL,
  fator_conversao_quilo numeric NOT NULL DEFAULT 0,
  id_ceafa integer,
  fator_correcao numeric,
  validade integer DEFAULT 0,
  porcao numeric NOT NULL DEFAULT 0,
  contem_gluten character varying DEFAULT 'NAO'::character varying,
  custo_unitario_medio numeric,
  CONSTRAINT insumo_id_unidade_medida_fkey FOREIGN KEY (id_unidade_medida) REFERENCES public.unidade_medida(id_unidade_medida)
);
CREATE TABLE public.insumo_original (
  id_insumo bigint NOT NULL,
  descricao character varying NOT NULL UNIQUE,
  id_grupo_produto integer NOT NULL,
  id_unidade_medida integer NOT NULL,
  minimo integer,
  operacional integer,
  fator_conversao_quilo numeric,
  custo_unitario_medio numeric,
  fator_correcao numeric,
  validade integer,
  porcao numeric NOT NULL,
  contem_gluten character varying,
  id_ceafa integer,
  CONSTRAINT insumo_original_pkey PRIMARY KEY (id_insumo)
);
CREATE TABLE public.item_produto (
  id_item_produto integer NOT NULL,
  codigo_barras character varying NOT NULL,
  item_produto character varying NOT NULL,
  preco_medio numeric NOT NULL,
  local_armazenamento character varying,
  id_produto bigint NOT NULL,
  id_embalagem integer NOT NULL,
  id_usuario_responsavel integer
);
CREATE TABLE public.preparacao_base (
  id_preparacao bigint NOT NULL,
  rendimento numeric NOT NULL,
  modo_preparo text,
  codigo_barra character varying NOT NULL,
  observacoes text,
  equipamentos_necessarios text,
  sugestoes_acompanhamento text,
  nutricionista_cadastro character varying,
  nutricionista_aprovacao character varying,
  modo_convencional boolean,
  forno_combinado boolean
);
CREATE TABLE public.preparacao_original (
  id_preparacao bigint NOT NULL,
  rendimento numeric,
  modo_preparo character varying,
  observacoes character varying,
  equipamentos_necessarios character varying,
  sugestoes_acompanhamento character varying,
  nutricionista_cadastro character varying,
  nutricionista_aprovacao character varying,
  modo_convencional boolean,
  forno_combinado boolean,
  CONSTRAINT preparacao_original_pkey PRIMARY KEY (id_preparacao),
  CONSTRAINT fk_preparacao_original_id_insumo FOREIGN KEY (id_preparacao) REFERENCES public.insumo_original(id_insumo)
);
CREATE TABLE public.produto (
  id_produto bigint NOT NULL,
  fator_correcao numeric DEFAULT 1,
  ativo boolean DEFAULT true,
  CONSTRAINT produto_pkey PRIMARY KEY (id_produto)
);
CREATE TABLE public.unidade_medida (
  id_unidade_medida integer NOT NULL,
  unidade_medida character varying NOT NULL,
  abreviacao_unidade_medida character varying NOT NULL,
  fracionaria boolean NOT NULL,
  CONSTRAINT unidade_medida_pkey PRIMARY KEY (id_unidade_medida)
);
```