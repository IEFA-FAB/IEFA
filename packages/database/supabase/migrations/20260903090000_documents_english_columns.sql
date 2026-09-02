-- documents_english_columns
-- Renomeia as colunas do schema `documents` para inglês, seguindo a convenção do repo:
-- identificador em inglês, valor de domínio na língua da norma. As colunas continuam
-- guardando os MESMOS valores (`oficio-comaer`, `ostensivo`, `interno-om`) — o que muda é
-- só o nome da coluna.
--
-- Feito agora porque as duas tabelas estão vazias: o schema entrou em produção ontem e a
-- ferramenta ainda depende de env que não existe lá. Renomear coluna com linha dentro
-- exigiria migrar o `payload` de cada documento salvo, cujas chaves mudam junto.

alter table documents.official_document rename column especie to kind;
alter table documents.official_document rename column ambito to scope;
alter table documents.official_document rename column sigilo to classification;
alter table documents.official_document rename column titulo to title;

alter table documents.ai_generation rename column modo to mode;
alter table documents.ai_generation rename column especie to kind;
alter table documents.ai_generation rename column rascunho to draft;
alter table documents.ai_generation rename column resultado to result;
alter table documents.ai_generation rename column erro to error;

-- O CHECK acompanha o nome da coluna automaticamente; os valores permitidos não mudam.
