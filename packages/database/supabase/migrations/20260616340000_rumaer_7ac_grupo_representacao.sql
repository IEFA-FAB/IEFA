-- Corrige o grupo do 7º Uniforme "A" e "C" para 'representacao' (apenas o 7º "B" é 'servicos').
-- O 7A vinha do seed como 'servicos' e o 7C foi criado como 'servicos' por engano.
update rumaer.uniform
set grupo = 'representacao', updated_at = now()
where numero = 7 and letra in ('A', 'C') and deleted_at is null;
