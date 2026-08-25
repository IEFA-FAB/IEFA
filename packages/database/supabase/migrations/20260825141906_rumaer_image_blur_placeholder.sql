-- ============================================================================
-- RUMAER — blur_placeholder (LQIP das ilustrações de uniforme)
-- ============================================================================
-- As ilustrações moram num bucket PRIVADO: o cliente precisa de uma URL assinada
-- antes de sequer começar a baixar o arquivo. Até aqui o intervalo inteiro — round
-- trip da assinatura + download de uma imagem grande — era uma caixa vazia com
-- spinner, e o grid do catálogo mostrava dezenas dessas caixas ao mesmo tempo.
--
-- Esta coluna guarda um data URL de ~1,5 KB gerado por `Bun.Image#placeholder()`
-- (ThumbHash rasterizado como PNG de ≤32px). Ele vem junto da linha no MESMO select que
-- já traz image_path — sem round trip novo, sem decoder no cliente — e serve de prévia
-- borrada com a cor média, o aspecto e a silhueta certos até a imagem real chegar.
--
-- Nullable de propósito: linha sem placeholder (anterior a esta migration, formato que
-- o decoder não abre, geração que falhou) apenas cai no estado de carregamento antigo.
-- A prévia é melhoria progressiva, nunca requisito da ilustração.
-- ============================================================================

alter table rumaer.uniform_variant add column blur_placeholder text;
alter table rumaer.uniform_variant_image add column blur_placeholder text;

comment on column rumaer.uniform_variant.blur_placeholder is
	'LQIP da imagem base: data URL PNG (thumbhash ≤32px) gerado por Bun.Image#placeholder(). Null = sem prévia, cai no estado de carregamento.';
comment on column rumaer.uniform_variant_image.blur_placeholder is
	'LQIP da imagem alternativa (look): data URL PNG (thumbhash ≤32px) gerado por Bun.Image#placeholder(). Null = sem prévia.';

-- O valor é derivado da imagem e escrito SÓ pelo servidor (service_role, a partir dos
-- bytes do bucket). Cliente nunca envia este campo — a leitura pública já existente das
-- duas tabelas cobre o select; nenhum grant novo é necessário.
--
-- Teto de tamanho no banco: o campo entra no `src` de toda linha de toda listagem do
-- catálogo, então um data URL fora de escala aqui vira payload em massa em todas as
-- telas de uma vez. 4 KB deixa ~1,5x de folga sobre o pior caso medido (2.742) — ele
-- existe para pegar "a imagem inteira foi embutida por engano", não para apertar o LQIP.
alter table rumaer.uniform_variant
	add constraint uniform_variant_blur_placeholder_len check (blur_placeholder is null or length(blur_placeholder) <= 4096);
alter table rumaer.uniform_variant_image
	add constraint uniform_variant_image_blur_placeholder_len check (blur_placeholder is null or length(blur_placeholder) <= 4096);
