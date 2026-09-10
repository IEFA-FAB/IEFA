-- Parâmetros de cocção da ficha técnica (PARTE 04 – TEMPO E EQUIPAMENTOS).
--
-- A folha impressa já reservava quatro campos que o cadastro não tinha: tempo de
-- pré-preparo, tempo de cocção, método de cocção e temperatura. Sem coluna, os quatro
-- saíam SEMPRE em branco — a ficha pedia à mão um dado que a nutricionista já havia
-- definido, e nenhuma tela do sisub tinha onde guardá-lo.
--
-- `preparation_time_minutes` continua sendo o TEMPO TOTAL declarado, e é ele que a folha
-- imprime quando existe. Os dois tempos novos são as parcelas: quando o total não foi
-- declarado, a folha soma pré-preparo + cocção antes de cair na soma das etapas do fluxo.
-- Nessa ordem porque o total é a declaração de quem elaborou a ficha, e derivá-lo por
-- cima apagaria o número escrito.
--
-- `smallint` nos três números pelo mesmo motivo de `preparation_time_minutes`: `numeric`
-- volta STRING pelo PostgREST e reprova o campo salvo na validação do formulário.
--
-- `cooking_method` é texto livre, não enum: o vocabulário varia por norma e por escola
-- ("calor seco", "calor úmido", "calor misto", "fritura por imersão", "forno combinado"),
-- e um enum obrigaria migration a cada preparação que não coubesse nele.

alter table kitchen.recipes
	add column if not exists pre_preparation_time_minutes smallint,
	add column if not exists cooking_time_minutes smallint,
	add column if not exists cooking_method text,
	add column if not exists cooking_temperature_celsius smallint;

-- Faixas: tempo não é negativo; temperatura vai do congelamento (-40 °C, preparação que
-- só é montada e resfriada) ao forno industrial (500 °C). Fora disso é erro de digitação,
-- e a folha impressa levaria o erro para dentro da cozinha.
alter table kitchen.recipes
	drop constraint if exists recipes_pre_preparation_time_nonnegative,
	add constraint recipes_pre_preparation_time_nonnegative
		check (pre_preparation_time_minutes is null or pre_preparation_time_minutes >= 0);

alter table kitchen.recipes
	drop constraint if exists recipes_cooking_time_nonnegative,
	add constraint recipes_cooking_time_nonnegative
		check (cooking_time_minutes is null or cooking_time_minutes >= 0);

alter table kitchen.recipes
	drop constraint if exists recipes_cooking_temperature_range,
	add constraint recipes_cooking_temperature_range
		check (cooking_temperature_celsius is null or cooking_temperature_celsius between -40 and 500);

comment on column kitchen.recipes.pre_preparation_time_minutes is
	'Minutos do pré-preparo (o que antecede a cocção). NULL = não declarado. Parcela de `preparation_time_minutes`, que segue sendo o total declarado.';

comment on column kitchen.recipes.cooking_time_minutes is
	'Minutos de cocção. NULL = não declarado. Parcela de `preparation_time_minutes`, que segue sendo o total declarado.';

comment on column kitchen.recipes.cooking_method is
	'Método de cocção em texto livre (ex.: calor úmido, forno combinado, fritura por imersão). NULL = não declarado.';

comment on column kitchen.recipes.cooking_temperature_celsius is
	'Temperatura de cocção em graus Celsius. NULL = não declarada.';
