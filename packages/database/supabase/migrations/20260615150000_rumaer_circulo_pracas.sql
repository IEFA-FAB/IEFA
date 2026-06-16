-- Adiciona o círculo hierárquico "Praças" (cabos e soldados), abaixo dos demais.
alter type rumaer.circulo_hierarquico add value if not exists 'pracas' after 'alunos';
