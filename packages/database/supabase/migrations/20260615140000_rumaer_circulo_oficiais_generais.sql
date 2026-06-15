-- Adiciona o círculo hierárquico "Oficiais-Generais" (acima de Oficiais).
alter type rumaer.circulo_hierarquico add value if not exists 'oficiais_generais' before 'oficiais';
