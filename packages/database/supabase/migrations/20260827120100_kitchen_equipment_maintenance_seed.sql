-- Baseline do catálogo global de rotinas de manutenção.
--
-- O que é semeado e por quê: rotinas ancoradas no PAPEL, com periodicidade conservadora, para
-- que a matriz de manutenção da cozinha nasça com conteúdo em vez de vazia. Uma tela de rotinas
-- vazia é uma tela que ninguém preenche.
--
-- O que NÃO é semeado, deliberadamente:
--   - Rotina de tipo `legal`. A periodicidade de obrigação regulada varia por norma, por
--     capacidade do equipamento e por classificação da instalação. Semear um número errado numa
--     obrigação legal é pior que não tê-la: vira "em dia" falso num relatório que alguém vai
--     usar para dizer que está conforme. Quem cadastra a rotina legal é a OM, com a norma na mão.
--   - Rotina de modelo. Guarnição, filtro e kit de revisão são de manual de fabricante, que muda
--     por versão. Mesmo raciocínio do seed de 20260825120100, que semeou capacidade e nenhuma
--     ficha técnica: um número errado no catálogo vira premissa que ninguém revisa.
--
-- Os intervalos abaixo são PONTO DE PARTIDA editável pela cozinha, não recomendação técnica.
-- `tolerance_days` existe para que a rotina não fique vermelha por um fim de semana.
--
-- Idempotente: `code` é a chave natural, tudo com `on conflict do nothing`.

begin;

-- ── Papel que faltava ────────────────────────────────────────────────────────
-- A coifa não estava na taxonomia (20260825120100 cobriu cocção, preparo e conservação, e em
-- apoio só lava-louças e carro-rack). Ela precisa existir como papel para que a unidade seja
-- cadastrável e a rotina de limpeza tenha onde se ancorar.

insert into kitchen.equipment_role (code, name, description, category, sort_order)
values
	('exhaust_hood', 'Coifa / sistema de exaustão', 'Captação e exaustão de gases e gordura sobre a linha de cocção.', 'apoio', 430)
on conflict (code) do nothing;

-- ── Rotinas globais por papel ────────────────────────────────────────────────

insert into kitchen.equipment_maintenance_plan (code, role_id, title, kind, interval_days, tolerance_days, instructions, sort_order)
select
	x.code,
	r.id,
	x.title,
	x.kind,
	x.interval_days,
	x.tolerance_days,
	x.instructions,
	x.sort_order
from (
	values
		('hood-cleaning',              'exhaust_hood',           'Limpeza de coifa, filtros e dutos',                      'cleaning',    30,  5,  'Remover e lavar os filtros, limpar a calha de gordura e inspecionar o duto quanto a acúmulo.', 10),
		('combi-door-seal',            'combi_oven',             'Inspeção da guarnição da porta e da sonda',              'inspection',  90,  15, 'Verificar ressecamento e trincas na guarnição, vedação com a porta fechada e integridade do cabo da sonda.', 20),
		('multifunction-lid-seal',     'multifunction_cooking',  'Inspeção da vedação da tampa e do sistema de pressão',   'inspection',  90,  15, 'Verificar a guarnição da tampa, o travamento e a válvula de alívio.', 30),
		('fryer-deep-clean',           'deep_fryer',             'Limpeza profunda da cuba e verificação do termostato',   'preventive',  30,  5,  'Esvaziar, remover resíduo carbonizado da cuba e confirmar que o corte por temperatura atua.', 40),
		('kettle-safety-valve',        'kettle',                 'Inspeção da válvula de segurança e da camisa de vapor',  'inspection',  180, 30, 'Verificar acionamento da válvula, nível e estanqueidade da camisa. NÃO substitui a inspeção regulada, que a OM cadastra à parte.', 50),
		('burner-gas-check',           'stove_burner',           'Inspeção de queimadores, registros e mangueiras',        'inspection',  180, 15, 'Verificar chama, ressecamento de mangueira, validade da conexão e vazamento com solução detectora.', 60),
		('refrigerator-condenser',     'refrigerator',           'Limpeza do condensador e verificação da vedação',        'preventive',  90,  15, 'Limpar as aletas do condensador, verificar borracha da porta e dreno.', 70),
		('refrigerator-thermometer',   'refrigerator',           'Aferição do termômetro',                                 'calibration', 180, 30, 'Comparar a leitura do painel com termômetro de referência e registrar o desvio.', 80),
		('freezer-condenser',          'freezer',                'Limpeza do condensador e verificação da vedação',        'preventive',  90,  15, 'Limpar as aletas do condensador, verificar borracha da porta e dreno.', 90),
		('freezer-thermometer',        'freezer',                'Aferição do termômetro',                                 'calibration', 180, 30, 'Comparar a leitura do painel com termômetro de referência e registrar o desvio.', 100),
		('blast-chiller-probe',        'blast_chiller',          'Aferição da sonda de temperatura',                       'calibration', 180, 30, 'Aferir a sonda de núcleo contra referência — o ciclo de resfriamento rápido depende dela.', 110),
		('holding-cabinet-thermostat', 'holding_cabinet',        'Aferição do termostato',                                 'calibration', 180, 30, 'Confirmar que a estufa mantém a temperatura de serviço declarada.', 120),
		('dishwasher-descaling',       'dishwasher',             'Descalcificação e limpeza dos braços de lavagem',        'cleaning',    30,  5,  'Desincrustar os bicos, limpar filtros e verificar a temperatura de enxágue.', 130),
		('slicer-blade',               'slicer',                 'Afiação da lâmina e inspeção das proteções',             'inspection',  90,  15, 'Afiar a lâmina e confirmar que a proteção e o intertravamento operam.', 140),
		('grinder-plates',             'meat_grinder',           'Inspeção de facas, discos e proteções',                  'inspection',  90,  15, 'Verificar corte das facas, desgaste dos discos e funcionamento da proteção do funil.', 150),
		('mixer-lubrication',          'planetary_mixer',        'Lubrificação e inspeção da transmissão',                 'preventive',  180, 30, 'Lubrificar conforme o manual e verificar folga e ruído da transmissão.', 160)
) as x(code, role_code, title, kind, interval_days, tolerance_days, instructions, sort_order)
join kitchen.equipment_role r on r.code = x.role_code
-- O índice único de `code` é PARCIAL (só code não nulo): a inferência exige repetir o predicado.
on conflict (code) where code is not null do nothing;

commit;
