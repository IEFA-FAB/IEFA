-- Limpa categorias órfãs do 7º Uniforme "B" (Art. 34 = apenas oficiais, suboficiais, sargentos).
-- O rebuild do 7B (20260616360000) removeu as variantes do stub do seed mas não as categorias antigas
-- (cadetes, alunos_formacao, pracas), que ficaram sem variante correspondente.
delete from rumaer.uniform_category uc
using rumaer.uniform u
where uc.uniform_id = u.id and u.numero = 7 and u.letra = 'B'
  and uc.categoria in ('cadetes','alunos_formacao','pracas');
