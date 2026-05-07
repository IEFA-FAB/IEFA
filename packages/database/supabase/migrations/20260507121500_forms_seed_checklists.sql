-- Seed dos checklists 5S do app forms.
-- Gerado por packages/database/scripts/generate-forms-checklists-migration.mjs a partir de apps/forms/checklists.json.
-- Total: 2 questionarios, 55 secoes e 243 perguntas.

alter table forms.questionnaire alter column created_by drop not null;

do $$
declare
  questionnaire_id uuid;
  section_id uuid;
begin

  if not exists (select 1 from forms.questionnaire where title = 'Checklist 5S - Área Administrativa') then
    insert into forms.questionnaire (title, description, created_by, status)
    values ('Checklist 5S - Área Administrativa', 'Questionário importado de apps/forms/checklists.json para avaliação 1S, 2S e 3S da área administrativa.', null, 'sent')
    returning id into questionnaire_id;
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '1S • 1.1.1 • Documentos e Arquivos Digitais', '1 QUESTIONÁRIO DE AVALIAÇÃO 1S SENSO DE UTILIZAÇÃO PARA ÁREA ADMINISTRATIVA — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA PARA ÁREA ADMINISTRATIVA', 0)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem e-mails antigos que não são mais relevantes e podem ser deletados?', '1S • 1.1.1 • Documentos e Arquivos Digitais', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Há pastas de e-mails que precisam ser organizadas ou limpas?', '1S • 1.1.1 • Documentos e Arquivos Digitais', 'boolean', true, 1);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem correntes de e-mails de projetos finalizados que podem ser arquivadas ou removidas?', '1S • 1.1.1 • Documentos e Arquivos Digitais', 'boolean', true, 2);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem arquivos digitais antigos que não são mais necessários e podem ser deletados?', '1S • 1.1.1 • Documentos e Arquivos Digitais', 'boolean', true, 3);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem arquivos duplicados no seu sistema que podem serem removidos?', '1S • 1.1.1 • Documentos e Arquivos Digitais', 'boolean', true, 4);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem documentos armazenados que não foram acessados nos últimos 12 meses?', '1S • 1.1.1 • Documentos e Arquivos Digitais', 'boolean', true, 5);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os backups antigos de projetos finalizados já foram removidos ou arquivados?', '1S • 1.1.1 • Documentos e Arquivos Digitais', 'boolean', true, 6);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem versões antigas de software ou ferramentas que não são mais utilizadas e podem ser removidas?', '1S • 1.1.1 • Documentos e Arquivos Digitais', 'boolean', true, 7);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Há discos rígidos ou unidades de armazenamento externo com dados desatualizados?', '1S • 1.1.1 • Documentos e Arquivos Digitais', 'boolean', true, 8);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem manuais ou guias antigos que foram substituídos por versões mais recentes e podem ser descartados?', '1S • 1.1.1 • Documentos e Arquivos Digitais', 'boolean', true, 9);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem listas de contatos desatualizadas ou duplicadas que podem ser atualizadas ou removidas?', '1S • 1.1.1 • Documentos e Arquivos Digitais', 'boolean', true, 10);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem relatórios ou estudos de casos antigos que não são mais relevantes para as operações atuais?', '1S • 1.1.1 • Documentos e Arquivos Digitais', 'boolean', true, 11);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'A área de trabalho digital (desktop) dos militares está cheia de atalhos e arquivos que não são mais necessários?', '1S • 1.1.1 • Documentos e Arquivos Digitais', 'boolean', true, 12);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem aplicativos ou softwares instalados no seu computador que não são mais utilizados e podem ser removidos?', '1S • 1.1.1 • Documentos e Arquivos Digitais', 'boolean', true, 13);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem documentos temporários ou de trabalho que podem ser arquivados ou deletados?', '1S • 1.1.1 • Documentos e Arquivos Digitais', 'boolean', true, 14);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem CDs, DVDs ou pendrives com dados antigos que podem ser descartados ou arquivados?', '1S • 1.1.1 • Documentos e Arquivos Digitais', 'boolean', true, 15);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem materiais impressos que já foram digitalizados e podem ser reciclados?', '1S • 1.1.1 • Documentos e Arquivos Digitais', 'boolean', true, 16);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem pastas físicas ou arquivos de papel que podem ser convertidos para formato digital e removidos do espaço físico?', '1S • 1.1.1 • Documentos e Arquivos Digitais', 'boolean', true, 17);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '1S • 1.1.2 • Papéis e Documentos', '1 QUESTIONÁRIO DE AVALIAÇÃO 1S SENSO DE UTILIZAÇÃO PARA ÁREA ADMINISTRATIVA — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA PARA ÁREA ADMINISTRATIVA', 1)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem relatórios antigos que não são mais necessários?', '1S • 1.1.2 • Papéis e Documentos', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem formulários desatualizados em sua área de trabalho?', '1S • 1.1.2 • Papéis e Documentos', 'boolean', true, 1);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Há cópias extras de documentos já arquivados digitalmente?', '1S • 1.1.2 • Papéis e Documentos', 'boolean', true, 2);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem post-its com informações já processadas que podem ser descartados?', '1S • 1.1.2 • Papéis e Documentos', 'boolean', true, 3);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Há rascunhos de projetos finalizados que não são mais necessários?', '1S • 1.1.2 • Papéis e Documentos', 'boolean', true, 4);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem materiais de marketing para eventos passados que podem ser descartados?', '1S • 1.1.2 • Papéis e Documentos', 'boolean', true, 5);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '1S • 1.1.3 • Equipamentos e Materiais de Escritório', '1 QUESTIONÁRIO DE AVALIAÇÃO 1S SENSO DE UTILIZAÇÃO PARA ÁREA ADMINISTRATIVA — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA PARA ÁREA ADMINISTRATIVA', 2)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem computadores, monitores ou impressoras antigos e não funcionais em sua área?', '1S • 1.1.3 • Equipamentos e Materiais de Escritório', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Há teclados ou mouses quebrados que precisam ser descartados?', '1S • 1.1.3 • Equipamentos e Materiais de Escritório', 'boolean', true, 1);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem máquinas de fax ou telefones antigos que não são mais utilizados?', '1S • 1.1.3 • Equipamentos e Materiais de Escritório', 'boolean', true, 2);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Há cabos e carregadores antigos e não utilizados?', '1S • 1.1.3 • Equipamentos e Materiais de Escritório', 'boolean', true, 3);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Há disquetes, CDs ou DVDs obsoletos que podem ser descartados?', '1S • 1.1.3 • Equipamentos e Materiais de Escritório', 'boolean', true, 4);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem roteadores ou modems antigos que não são mais necessários?', '1S • 1.1.3 • Equipamentos e Materiais de Escritório', 'boolean', true, 5);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem canetas ou marcadores secos que podem ser descartados?', '1S • 1.1.3 • Equipamentos e Materiais de Escritório', 'boolean', true, 6);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem grampeadores ou perfuradores quebrados que não podem ser consertados?', '1S • 1.1.3 • Equipamentos e Materiais de Escritório', 'boolean', true, 7);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Há clips de papel enferrujados ou danificados em sua área?', '1S • 1.1.3 • Equipamentos e Materiais de Escritório', 'boolean', true, 8);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '1S • 1.1.4 • Mobiliário e Decorações', '1 QUESTIONÁRIO DE AVALIAÇÃO 1S SENSO DE UTILIZAÇÃO PARA ÁREA ADMINISTRATIVA — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA PARA ÁREA ADMINISTRATIVA', 3)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem cadeiras com rodas quebradas ou estofamento rasgado?', '1S • 1.1.4 • Mobiliário e Decorações', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem mesas com superfícies danificadas em sua área de trabalho?', '1S • 1.1.4 • Mobiliário e Decorações', 'boolean', true, 1);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Há armários que não fecham corretamente e precisam ser descartados?', '1S • 1.1.4 • Mobiliário e Decorações', 'boolean', true, 2);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem cartazes e avisos desatualizados no escritório?', '1S • 1.1.4 • Mobiliário e Decorações', 'boolean', true, 3);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Há plantas artificiais antigas e empoeiradas?', '1S • 1.1.4 • Mobiliário e Decorações', 'boolean', true, 4);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '1S • 1.1.5 • Utensílios de Cozinha e Descartáveis', '1 QUESTIONÁRIO DE AVALIAÇÃO 1S SENSO DE UTILIZAÇÃO PARA ÁREA ADMINISTRATIVA — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA PARA ÁREA ADMINISTRATIVA', 4)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem cafeteiras, micro-ondas ou geladeiras que não funcionam?', '1S • 1.1.5 • Utensílios de Cozinha e Descartáveis', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem utensílios de cozinha quebrados que precisam ser descartados?', '1S • 1.1.5 • Utensílios de Cozinha e Descartáveis', 'boolean', true, 1);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '1S • 1.1.6 • Itens Pessoais', '1 QUESTIONÁRIO DE AVALIAÇÃO 1S SENSO DE UTILIZAÇÃO PARA ÁREA ADMINISTRATIVA — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA PARA ÁREA ADMINISTRATIVA', 5)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem uniformes desgastados e não mais utilizados em sua área?', '1S • 1.1.6 • Itens Pessoais', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem sapatos ou acessórios de trabalho danificados?', '1S • 1.1.6 • Itens Pessoais', 'boolean', true, 1);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Há equipamentos de proteção individual (EPI) fora do prazo de validade?', '1S • 1.1.6 • Itens Pessoais', 'boolean', true, 2);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '1S • 1.1.7 • Diversos', '1 QUESTIONÁRIO DE AVALIAÇÃO 1S SENSO DE UTILIZAÇÃO PARA ÁREA ADMINISTRATIVA — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA PARA ÁREA ADMINISTRATIVA', 6)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem manuais de instruções para equipamentos que não são mais usados?', '1S • 1.1.7 • Diversos', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem guias e catálogos de produtos desatualizados que podem ser descartados?', '1S • 1.1.7 • Diversos', 'boolean', true, 1);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '2S • 4.1.1 • Acesso e Utilização de Objetos', '4 QUESTIONÁRIO DE AVALIAÇÃO 2S SENSO DE ORDENAÇÃO PARA ÁREA ADMINISTRATIVA — IDENTIFICAÇÃO DE ITENS PARA ÁREA ADMINISTRATIVA', 7)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os objetos e documentos utilizados com frequência estão facilmente acessíveis?', '2S • 4.1.1 • Acesso e Utilização de Objetos', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem objetos ou documentos que são difíceis de acessar devido à sua localização?', '2S • 4.1.1 • Acesso e Utilização de Objetos', 'boolean', true, 1);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os itens utilizados diariamente estão posicionados de maneira conveniente?', '2S • 4.1.1 • Acesso e Utilização de Objetos', 'boolean', true, 2);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os itens raramente utilizados estão armazenados de forma a não interferir com os itens de uso frequente?', '2S • 4.1.1 • Acesso e Utilização de Objetos', 'boolean', true, 3);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '2S • 4.1.2 • Layout e Utilização de Espaço', '4 QUESTIONÁRIO DE AVALIAÇÃO 2S SENSO DE ORDENAÇÃO PARA ÁREA ADMINISTRATIVA — IDENTIFICAÇÃO DE ITENS PARA ÁREA ADMINISTRATIVA', 8)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'O layout do espaço de trabalho permite uma melhor utilização do espaço disponível?', '2S • 4.1.2 • Layout e Utilização de Espaço', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existe espaço suficiente para movimentação segura e confortável no ambiente de trabalho?', '2S • 4.1.2 • Layout e Utilização de Espaço', 'boolean', true, 1);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'O layout do espaço de trabalho torna o trabalho mais seguro e menos desgastante fisicamente?', '2S • 4.1.2 • Layout e Utilização de Espaço', 'boolean', true, 2);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Estão sendo utilizados móveis e equipamentos ergonômicos para minimizar o desgaste físico?', '2S • 4.1.2 • Layout e Utilização de Espaço', 'boolean', true, 3);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '2S • 4.1.3 • Organização e Sistematização', '4 QUESTIONÁRIO DE AVALIAÇÃO 2S SENSO DE ORDENAÇÃO PARA ÁREA ADMINISTRATIVA — IDENTIFICAÇÃO DE ITENS PARA ÁREA ADMINISTRATIVA', 9)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Cada objeto ou documento tem um local determinado para ser guardado?', '2S • 4.1.3 • Organização e Sistematização', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Todos sabem e seguem a sistemática de guarda de objetos e documentos?', '2S • 4.1.3 • Organização e Sistematização', 'boolean', true, 1);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os itens são retirados de sobre a mesa imediatamente após seu uso?', '2S • 4.1.3 • Organização e Sistematização', 'boolean', true, 2);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existe um local específico para colocar itens temporariamente enquanto estão em uso?', '2S • 4.1.3 • Organização e Sistematização', 'boolean', true, 3);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '2S • 1.4 • Manutenção da Ordem', '4 QUESTIONÁRIO DE AVALIAÇÃO 2S SENSO DE ORDENAÇÃO PARA ÁREA ADMINISTRATIVA — IDENTIFICAÇÃO DE ITENS PARA ÁREA ADMINISTRATIVA', 10)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'As mesas, arquivos e prateleiras estão mantidas em ordem?', '2S • 1.4 • Manutenção da Ordem', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem verificações regulares para garantir a manutenção da ordem?', '2S • 1.4 • Manutenção da Ordem', 'boolean', true, 1);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os locais e objetos estão identificados e sinalizados de maneira compreensível?', '2S • 1.4 • Manutenção da Ordem', 'boolean', true, 2);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Há identificação no lado externo sobre o conteúdo do lado interno de gavetas, armários e pastas?', '2S • 1.4 • Manutenção da Ordem', 'boolean', true, 3);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '2S • 4.1.5 • Otimização de Recursos', '4 QUESTIONÁRIO DE AVALIAÇÃO 2S SENSO DE ORDENAÇÃO PARA ÁREA ADMINISTRATIVA — IDENTIFICAÇÃO DE ITENS PARA ÁREA ADMINISTRATIVA', 11)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existe uma otimização dos recursos disponíveis, como espaço, tempo e materiais?', '2S • 4.1.5 • Otimização de Recursos', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os recursos estão sendo utilizados de maneira eficiente, sem desperdício?', '2S • 4.1.5 • Otimização de Recursos', 'boolean', true, 1);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '2S • 4.1.6 • Implementação e Monitoramento', '4 QUESTIONÁRIO DE AVALIAÇÃO 2S SENSO DE ORDENAÇÃO PARA ÁREA ADMINISTRATIVA — IDENTIFICAÇÃO DE ITENS PARA ÁREA ADMINISTRATIVA', 12)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'O efetivo recebe treinamento sobre os princípios de ordenação e organização?', '2S • 4.1.6 • Implementação e Monitoramento', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os arquivos (físicos e digitais) estão organizados de acordo com um sistema lógico e de fácil acesso?', '2S • 4.1.6 • Implementação e Monitoramento', 'boolean', true, 1);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '2S • 4.1.7 • Materiais e Componentes', '4 QUESTIONÁRIO DE AVALIAÇÃO 2S SENSO DE ORDENAÇÃO PARA ÁREA ADMINISTRATIVA — IDENTIFICAÇÃO DE ITENS PARA ÁREA ADMINISTRATIVA', 13)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os documentos físicos estão organizados em pastas e arquivos rotulados corretamente?', '2S • 4.1.7 • Materiais e Componentes', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem áreas específicas designadas para documentos de diferentes categorias (ex.: manuais, relatórios, contratos)?', '2S • 4.1.7 • Materiais e Componentes', 'boolean', true, 1);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os arquivos físicos são facilmente acessíveis e bem ordenados por data, tipo ou importância?', '2S • 4.1.7 • Materiais e Componentes', 'boolean', true, 2);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existe um sistema de nomeação padronizado para documentos e arquivos digitais que todos os membros da equipe utilizam?', '2S • 4.1.7 • Materiais e Componentes', 'boolean', true, 3);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os nomes dos arquivos contêm informações suficientes para identificá-los rapidamente (ex.: data, tipo de documento, autor)?', '2S • 4.1.7 • Materiais e Componentes', 'boolean', true, 4);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Há inconsistências na nomeação de arquivos que precisam ser corrigidas?', '2S • 4.1.7 • Materiais e Componentes', 'boolean', true, 5);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os manuais de manutenção estão armazenados em locais designados e etiquetados corretamente?', '2S • 4.1.7 • Materiais e Componentes', 'boolean', true, 6);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existe uma biblioteca digital de manuais e procedimentos atualizada e organizada?', '2S • 4.1.7 • Materiais e Componentes', 'boolean', true, 7);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os procedimentos de manutenção estão facilmente acessíveis para todos os técnicos?', '2S • 4.1.7 • Materiais e Componentes', 'boolean', true, 8);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem ferramentas de pesquisa e indexação que ajudam a localizar documentos e arquivos rapidamente?', '2S • 4.1.7 • Materiais e Componentes', 'boolean', true, 9);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os metadados dos arquivos estão preenchidos corretamente para facilitar a busca e a recuperação?', '2S • 4.1.7 • Materiais e Componentes', 'boolean', true, 10);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'O efetivo está treinado para utilizar as ferramentas de pesquisa e indexação de documentos?', '2S • 4.1.7 • Materiais e Componentes', 'boolean', true, 11);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existe um cronograma regular para revisar e organizar documentos físicos e digitais?', '2S • 4.1.7 • Materiais e Componentes', 'boolean', true, 12);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'O efetivo dedica tempo específico para a organização de seus arquivos e documentos?', '2S • 4.1.7 • Materiais e Componentes', 'boolean', true, 13);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Todos os documentos físicos e digitais são etiquetados ou rotulados de forma clara e consistente?', '2S • 4.1.7 • Materiais e Componentes', 'boolean', true, 14);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem diretrizes específicas para a rotulação de arquivos e pastas?', '2S • 4.1.7 • Materiais e Componentes', 'boolean', true, 15);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem pastas ou áreas designadas para documentos que precisam ser acessados com frequência?', '2S • 4.1.7 • Materiais e Componentes', 'boolean', true, 16);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os documentos de referência rápida estão organizados e facilmente acessíveis para todos os membros da equipe?', '2S • 4.1.7 • Materiais e Componentes', 'boolean', true, 17);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Há uma sistemática para garantir que esses documentos sejam mantidos atualizados?', '2S • 4.1.7 • Materiais e Componentes', 'boolean', true, 18);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existe um procedimento claro para arquivar documentos após serem utilizados?', '2S • 4.1.7 • Materiais e Componentes', 'boolean', true, 19);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os documentos são arquivados imediatamente após o uso para evitar acúmulo desorganizado?', '2S • 4.1.7 • Materiais e Componentes', 'boolean', true, 20);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Há uma verificação periódica para garantir que os procedimentos de arquivamento estão sendo seguidos corretamente?', '2S • 4.1.7 • Materiais e Componentes', 'boolean', true, 21);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '3S • 7.1.1 • Identificação e Pintura das Instalações', '7 QUESTIONÁRIO DE AVALIAÇÃO 3S SENSO DE LIMPEZA PARA ÁREA ADMINISTRATIVA — IDENTIFICAÇÃO DE ITENS PARA ÁREA ADMINISTRATIVA', 14)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'As instalações estão devidamente identificadas e pintadas?', '3S • 7.1.1 • Identificação e Pintura das Instalações', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'As placas de identificação e sinalização estão limpas e legíveis?', '3S • 7.1.1 • Identificação e Pintura das Instalações', 'boolean', true, 1);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '3S • 7.1.2 • Limpeza de Paredes, Pisos e Tetos', '7 QUESTIONÁRIO DE AVALIAÇÃO 3S SENSO DE LIMPEZA PARA ÁREA ADMINISTRATIVA — IDENTIFICAÇÃO DE ITENS PARA ÁREA ADMINISTRATIVA', 15)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'As paredes estão limpas e isentas de poeira?', '3S • 7.1.2 • Limpeza de Paredes, Pisos e Tetos', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os pisos estão limpos e sem manchas?', '3S • 7.1.2 • Limpeza de Paredes, Pisos e Tetos', 'boolean', true, 1);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os tetos estão limpos e livres de teias de aranha e poeira?', '3S • 7.1.2 • Limpeza de Paredes, Pisos e Tetos', 'boolean', true, 2);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '3S • 7.1.3 • Limpeza de Mobiliário e Equipamentos', '7 QUESTIONÁRIO DE AVALIAÇÃO 3S SENSO DE LIMPEZA PARA ÁREA ADMINISTRATIVA — IDENTIFICAÇÃO DE ITENS PARA ÁREA ADMINISTRATIVA', 16)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'As mesas e cadeiras são limpas rotineiramente?', '3S • 7.1.3 • Limpeza de Mobiliário e Equipamentos', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem resíduos ou sujeiras visíveis nas mesas e cadeiras?', '3S • 7.1.3 • Limpeza de Mobiliário e Equipamentos', 'boolean', true, 1);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os objetos, computadores e demais equipamentos estão limpos?', '3S • 7.1.3 • Limpeza de Mobiliário e Equipamentos', 'boolean', true, 2);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os monitores, teclados e mouses estão livres de poeira e sujeira?', '3S • 7.1.3 • Limpeza de Mobiliário e Equipamentos', 'boolean', true, 3);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existe etiqueta de controle de limpeza dos filtros e da manutenção geral de ar-condicionado?', '3S • 7.1.3 • Limpeza de Mobiliário e Equipamentos', 'boolean', true, 4);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '3S • 7.1.4 • Distribuição de Tarefas de Limpeza', '7 QUESTIONÁRIO DE AVALIAÇÃO 3S SENSO DE LIMPEZA PARA ÁREA ADMINISTRATIVA — IDENTIFICAÇÃO DE ITENS PARA ÁREA ADMINISTRATIVA', 17)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'As tarefas de limpeza são distribuídas entre os membros do setor?', '3S • 7.1.4 • Distribuição de Tarefas de Limpeza', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Todo efetivo sabe de suas responsabilidades em relação a limpeza?', '3S • 7.1.4 • Distribuição de Tarefas de Limpeza', 'boolean', true, 1);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '3S • 7.1.5 • Limpeza de Lixeiras', '7 QUESTIONÁRIO DE AVALIAÇÃO 3S SENSO DE LIMPEZA PARA ÁREA ADMINISTRATIVA — IDENTIFICAÇÃO DE ITENS PARA ÁREA ADMINISTRATIVA', 18)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'No final do expediente, as lixeiras são deixadas limpas?', '3S • 7.1.5 • Limpeza de Lixeiras', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'As lixeiras estão sendo esvaziadas regularmente ao longo do dia?', '3S • 7.1.5 • Limpeza de Lixeiras', 'boolean', true, 1);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '3S • 7.1.6 • Limpeza do Chão', '7 QUESTIONÁRIO DE AVALIAÇÃO 3S SENSO DE LIMPEZA PARA ÁREA ADMINISTRATIVA — IDENTIFICAÇÃO DE ITENS PARA ÁREA ADMINISTRATIVA', 19)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'A limpeza do chão é feita rotineiramente?', '3S • 7.1.6 • Limpeza do Chão', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem áreas do chão que são negligenciadas durante a limpeza?', '3S • 7.1.6 • Limpeza do Chão', 'boolean', true, 1);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '3S • 7.1.7 • Limpeza de Janelas e Vidros', '7 QUESTIONÁRIO DE AVALIAÇÃO 3S SENSO DE LIMPEZA PARA ÁREA ADMINISTRATIVA — IDENTIFICAÇÃO DE ITENS PARA ÁREA ADMINISTRATIVA', 20)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'As janelas e vidros estão limpos e sem manchas?', '3S • 7.1.7 • Limpeza de Janelas e Vidros', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'A limpeza das janelas e vidros é feita regularmente?', '3S • 7.1.7 • Limpeza de Janelas e Vidros', 'boolean', true, 1);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '3S • 7.1.8 • Limpeza de Equipamentos Específicos', '7 QUESTIONÁRIO DE AVALIAÇÃO 3S SENSO DE LIMPEZA PARA ÁREA ADMINISTRATIVA — IDENTIFICAÇÃO DE ITENS PARA ÁREA ADMINISTRATIVA', 21)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'As impressoras, máquinas de café e outros equipamentos específicos são limpos regularmente?', '3S • 7.1.8 • Limpeza de Equipamentos Específicos', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem áreas desses equipamentos que são frequentemente negligenciadas durante a limpeza?', '3S • 7.1.8 • Limpeza de Equipamentos Específicos', 'boolean', true, 1);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '3S • 7.1.9 • Monitoramento e Melhoria Contínua', '7 QUESTIONÁRIO DE AVALIAÇÃO 3S SENSO DE LIMPEZA PARA ÁREA ADMINISTRATIVA — IDENTIFICAÇÃO DE ITENS PARA ÁREA ADMINISTRATIVA', 22)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existe um cronograma de limpeza estabelecido e seguido?', '3S • 7.1.9 • Monitoramento e Melhoria Contínua', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'As tarefas de limpeza são monitoradas e verificadas regularmente?', '3S • 7.1.9 • Monitoramento e Melhoria Contínua', 'boolean', true, 1);
  end if;

  if not exists (select 1 from forms.questionnaire where title = 'Checklist 5S - Áreas Comuns') then
    insert into forms.questionnaire (title, description, created_by, status)
    values ('Checklist 5S - Áreas Comuns', 'Questionário importado de apps/forms/checklists.json para avaliação 1S, 2S e 3S de áreas comuns.', null, 'sent')
    returning id into questionnaire_id;
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '1S • 3.1.1 • Alojamentos', '3 QUESTIONÁRIO DE AVALIAÇÃO 1S SENSO DE UTILIZAÇÃO PARA ÁREAS COMUNS — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA EM ÁREAS COMUNS, ALOJAMENTOS, BANHEIROS E SALAS DE ESTAR', 0)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem roupas de cama (lençóis, cobertores, travesseiros) que não são mais usadas?', '1S • 3.1.1 • Alojamentos', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem almofadas ou colchas em excesso ou danificadas?', '1S • 3.1.1 • Alojamentos', 'boolean', true, 1);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem roupas ou sapatos deixados para trás ou não utilizados há muito tempo?', '1S • 3.1.1 • Alojamentos', 'boolean', true, 2);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem móveis (camas, mesas, cadeiras) que estão quebrados ou em mau estado?', '1S • 3.1.1 • Alojamentos', 'boolean', true, 3);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem itens decorativos (quadros, vasos) que estão desgastados, danificados ou fora de lugar?', '1S • 3.1.1 • Alojamentos', 'boolean', true, 4);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem objetos pessoais que foram deixados para trás e não são reclamados há muito tempo?', '1S • 3.1.1 • Alojamentos', 'boolean', true, 5);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem itens de armazenamento (caixas, gavetas) que estão cheios de itens sem utilidade?', '1S • 3.1.1 • Alojamentos', 'boolean', true, 6);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem materiais de limpeza antigos ou não utilizados que ocupam espaço?', '1S • 3.1.1 • Alojamentos', 'boolean', true, 7);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem produtos de limpeza vencidos ou em mau estado que podem ser descartados?', '1S • 3.1.1 • Alojamentos', 'boolean', true, 8);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '1S • 3.1.2 • Banheiros De Uso Comum', '3 QUESTIONÁRIO DE AVALIAÇÃO 1S SENSO DE UTILIZAÇÃO PARA ÁREAS COMUNS — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA EM ÁREAS COMUNS, ALOJAMENTOS, BANHEIROS E SALAS DE ESTAR', 1)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem sabonetes, shampoos, condicionadores ou outros produtos de higiene que não são mais utilizados?', '1S • 3.1.2 • Banheiros De Uso Comum', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem produtos de higiene vencidos ou em mau estado?', '1S • 3.1.2 • Banheiros De Uso Comum', 'boolean', true, 1);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem embalagens vazias ou quase vazias de produtos de higiene que podem ser descartadas?', '1S • 3.1.2 • Banheiros De Uso Comum', 'boolean', true, 2);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem toalhas desgastadas ou em excesso que não são mais utilizadas?', '1S • 3.1.2 • Banheiros De Uso Comum', 'boolean', true, 3);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem acessórios de banheiro (porta-sabonetes, escovas de dente) que estão quebrados ou não são mais utilizados?', '1S • 3.1.2 • Banheiros De Uso Comum', 'boolean', true, 4);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem materiais de limpeza (esponjas, escovas, panos) que estão desgastados e não são mais eficazes?', '1S • 3.1.2 • Banheiros De Uso Comum', 'boolean', true, 5);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem produtos de limpeza vencidos ou não utilizados?', '1S • 3.1.2 • Banheiros De Uso Comum', 'boolean', true, 6);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem armários, prateleiras ou estantes que estão danificados ou não são mais necessários?', '1S • 3.1.2 • Banheiros De Uso Comum', 'boolean', true, 7);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem caixas ou cestos de armazenamento que estão quebrados ou em mau estado?', '1S • 3.1.2 • Banheiros De Uso Comum', 'boolean', true, 8);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem tapetes antiderrapantes ou barras de apoio que estão desgastados ou não são mais seguros?', '1S • 3.1.2 • Banheiros De Uso Comum', 'boolean', true, 9);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem itens de segurança que não estão sendo utilizados e ocupam espaço desnecessário?', '1S • 3.1.2 • Banheiros De Uso Comum', 'boolean', true, 10);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '1S • 3.1.3 • Aparelhos Eletrônicos', '3 QUESTIONÁRIO DE AVALIAÇÃO 1S SENSO DE UTILIZAÇÃO PARA ÁREAS COMUNS — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA EM ÁREAS COMUNS, ALOJAMENTOS, BANHEIROS E SALAS DE ESTAR', 2)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem aparelhos eletrônicos (televisões, rádios, consoles de jogos) que estão quebrados ou não funcionam mais?', '1S • 3.1.3 • Aparelhos Eletrônicos', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem cabos ou acessórios eletrônicos que não são mais necessários ou estão em mau estado?', '1S • 3.1.3 • Aparelhos Eletrônicos', 'boolean', true, 1);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem aparelhos eletrônicos que não são utilizados frequentemente e podem ser removidos?', '1S • 3.1.3 • Aparelhos Eletrônicos', 'boolean', true, 2);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '1S • 3.1.4 • Livros, Revistas e Materiais de Leitura', '3 QUESTIONÁRIO DE AVALIAÇÃO 1S SENSO DE UTILIZAÇÃO PARA ÁREAS COMUNS — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA EM ÁREAS COMUNS, ALOJAMENTOS, BANHEIROS E SALAS DE ESTAR', 3)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem livros ou revistas desatualizados ou em excesso que podem ser removidos?', '1S • 3.1.4 • Livros, Revistas e Materiais de Leitura', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem jogos de tabuleiro, DVDs ou outros materiais de entretenimento que não são mais utilizados?', '1S • 3.1.4 • Livros, Revistas e Materiais de Leitura', 'boolean', true, 1);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem prateleiras ou estantes com itens acumulados que podem ser organizados ou descartados?', '1S • 3.1.4 • Livros, Revistas e Materiais de Leitura', 'boolean', true, 2);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '1S • 3.1.5 • Plantas e Itens Naturais', '3 QUESTIONÁRIO DE AVALIAÇÃO 1S SENSO DE UTILIZAÇÃO PARA ÁREAS COMUNS — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA EM ÁREAS COMUNS, ALOJAMENTOS, BANHEIROS E SALAS DE ESTAR', 4)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem plantas que estão mortas, em mau estado ou que não são mais desejadas?', '1S • 3.1.5 • Plantas e Itens Naturais', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem vasos ou suportes de plantas que estão quebrados ou desnecessários?', '1S • 3.1.5 • Plantas e Itens Naturais', 'boolean', true, 1);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '1S • 3.1.6 • Acessórios de Sala de estar', '3 QUESTIONÁRIO DE AVALIAÇÃO 1S SENSO DE UTILIZAÇÃO PARA ÁREAS COMUNS — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA EM ÁREAS COMUNS, ALOJAMENTOS, BANHEIROS E SALAS DE ESTAR', 5)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem almofadas, cobertores ou mantas que estão desgastados ou em excesso?', '1S • 3.1.6 • Acessórios de Sala de estar', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem porta-retratos, relógios ou outros acessórios que estão quebrados ou não são mais necessários?', '1S • 3.1.6 • Acessórios de Sala de estar', 'boolean', true, 1);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem cestos, caixas ou outros itens de armazenamento que não são utilizados?', '1S • 3.1.6 • Acessórios de Sala de estar', 'boolean', true, 2);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '1S • 3.1.7 • Itens de Segurança e Conforto', '3 QUESTIONÁRIO DE AVALIAÇÃO 1S SENSO DE UTILIZAÇÃO PARA ÁREAS COMUNS — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA EM ÁREAS COMUNS, ALOJAMENTOS, BANHEIROS E SALAS DE ESTAR', 6)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem itens de segurança (extintores de incêndio, kits de primeiros socorros) que estão vencidos ou não são mais utilizados?', '1S • 3.1.7 • Itens de Segurança e Conforto', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem itens de conforto (ventiladores, aquecedores, condicionadores de ar) que não funcionam ou não são mais necessários?', '1S • 3.1.7 • Itens de Segurança e Conforto', 'boolean', true, 1);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '1S • 3.1.8 • Outros Itens Diversos', '3 QUESTIONÁRIO DE AVALIAÇÃO 1S SENSO DE UTILIZAÇÃO PARA ÁREAS COMUNS — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA EM ÁREAS COMUNS, ALOJAMENTOS, BANHEIROS E SALAS DE ESTAR', 7)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem itens pessoais ou de uso comum que foram deixados para trás por longos períodos?', '1S • 3.1.8 • Outros Itens Diversos', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem objetos decorativos de temporadas anteriores (natal, páscoa, etc.) que não foram guardados adequadamente?', '1S • 3.1.8 • Outros Itens Diversos', 'boolean', true, 1);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '1S • 3.1.9 • Utensílios de Cozinha', '3 QUESTIONÁRIO DE AVALIAÇÃO 1S SENSO DE UTILIZAÇÃO PARA ÁREAS COMUNS — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA EM ÁREAS COMUNS, ALOJAMENTOS, BANHEIROS E SALAS DE ESTAR', 8)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem utensílios de cozinha (pratos, talheres, copos) que estão quebrados ou em mau estado?', '1S • 3.1.9 • Utensílios de Cozinha', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem utensílios duplicados ou em excesso que não são utilizados regularmente?', '1S • 3.1.9 • Utensílios de Cozinha', 'boolean', true, 1);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem utensílios específicos (panelas, frigideiras, espátulas) que não são mais utilizados?', '1S • 3.1.9 • Utensílios de Cozinha', 'boolean', true, 2);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '1S • 3.1.10 • Aparelhos Eletrônicos', '3 QUESTIONÁRIO DE AVALIAÇÃO 1S SENSO DE UTILIZAÇÃO PARA ÁREAS COMUNS — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA EM ÁREAS COMUNS, ALOJAMENTOS, BANHEIROS E SALAS DE ESTAR', 9)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem aparelhos eletrônicos (micro-ondas, cafeteiras, torradeiras) que estão quebrados ou não funcionam mais?', '1S • 3.1.10 • Aparelhos Eletrônicos', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem aparelhos eletrônicos que não são utilizados frequentemente e podem ser removidos?', '1S • 3.1.10 • Aparelhos Eletrônicos', 'boolean', true, 1);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem cabos ou acessórios eletrônicos que não são mais necessários ou estão em mau estado?', '1S • 3.1.10 • Aparelhos Eletrônicos', 'boolean', true, 2);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '1S • 3.1.11 • Alimentos e Bebidas', '3 QUESTIONÁRIO DE AVALIAÇÃO 1S SENSO DE UTILIZAÇÃO PARA ÁREAS COMUNS — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA EM ÁREAS COMUNS, ALOJAMENTOS, BANHEIROS E SALAS DE ESTAR', 10)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem alimentos ou bebidas que estão vencidos ou não são mais consumíveis?', '1S • 3.1.11 • Alimentos e Bebidas', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem itens alimentares duplicados ou em excesso que ocupam espaço desnecessário?', '1S • 3.1.11 • Alimentos e Bebidas', 'boolean', true, 1);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem embalagens vazias ou quase vazias que podem ser descartadas?', '1S • 3.1.11 • Alimentos e Bebidas', 'boolean', true, 2);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '1S • 3.1.12 • Equipamentos de Refrigeração e Armazenamento', '3 QUESTIONÁRIO DE AVALIAÇÃO 1S SENSO DE UTILIZAÇÃO PARA ÁREAS COMUNS — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA EM ÁREAS COMUNS, ALOJAMENTOS, BANHEIROS E SALAS DE ESTAR', 11)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem geladeiras ou freezers que estão em mau estado ou não funcionam corretamente?', '1S • 3.1.12 • Equipamentos de Refrigeração e Armazenamento', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem prateleiras ou compartimentos de armazenamento que estão quebrados ou não são mais utilizados?', '1S • 3.1.12 • Equipamentos de Refrigeração e Armazenamento', 'boolean', true, 1);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem itens armazenados na geladeira ou no freezer que estão vencidos ou não são mais necessários?', '1S • 3.1.12 • Equipamentos de Refrigeração e Armazenamento', 'boolean', true, 2);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '2S • 6.1.1 • Alojamentos', '6 QUESTIONÁRIO DE AVALIAÇÃO 2S SENSO DE ORDENAÇÃO PARA ÁREAS COMUNS — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA EM ÁREAS COMUNS, ALOJAMENTOS, BANHEIROS E SALAS DE ESTAR', 12)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os lençóis, cobertores e travesseiros têm locais designados e organizados?', '2S • 6.1.1 • Alojamentos', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'As almofadas e colchas estão organizadas de forma acessível e eficiente?', '2S • 6.1.1 • Alojamentos', 'boolean', true, 1);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem sistemas de armazenamento para roupas de cama que não estão em uso?', '2S • 6.1.1 • Alojamentos', 'boolean', true, 2);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os móveis (camas, mesas, cadeiras) estão dispostos de maneira a otimizar o espaço e facilitar a circulação?', '2S • 6.1.1 • Alojamentos', 'boolean', true, 3);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'A disposição dos móveis permite fácil acesso a todas as áreas do alojamento?', '2S • 6.1.1 • Alojamentos', 'boolean', true, 4);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os objetos pessoais dos usuários estão organizados em locais específicos?', '2S • 6.1.1 • Alojamentos', 'boolean', true, 5);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Há sistemas de armazenamento (gavetas, caixas, estantes, armários) para facilitar a organização dos objetos pessoais?', '2S • 6.1.1 • Alojamentos', 'boolean', true, 6);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os materiais de limpeza estão organizados e armazenados em locais apropriados?', '2S • 6.1.1 • Alojamentos', 'boolean', true, 7);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existe um sistema para garantir que os materiais de limpeza sejam mantidos em boas condições e facilmente localizáveis?', '2S • 6.1.1 • Alojamentos', 'boolean', true, 8);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '2S • 6.1.2 • Banheiros de Uso Comum', '6 QUESTIONÁRIO DE AVALIAÇÃO 2S SENSO DE ORDENAÇÃO PARA ÁREAS COMUNS — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA EM ÁREAS COMUNS, ALOJAMENTOS, BANHEIROS E SALAS DE ESTAR', 13)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os produtos de higiene (sabonetes, shampoos, condicionadores) estão organizados e de fácil acesso?', '2S • 6.1.2 • Banheiros de Uso Comum', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existe um sistema de rotatividade para garantir que os produtos mais antigos sejam usados primeiro?', '2S • 6.1.2 • Banheiros de Uso Comum', 'boolean', true, 1);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem embalagens vazias ou quase vazias de produtos de higiene que podem ser descartadas?', '2S • 6.1.2 • Banheiros de Uso Comum', 'boolean', true, 2);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'As toalhas estão organizadas e armazenadas de maneira higiênica?', '2S • 6.1.2 • Banheiros de Uso Comum', 'boolean', true, 3);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existe um local específico para toalhas sujas e limpas?', '2S • 6.1.2 • Banheiros de Uso Comum', 'boolean', true, 4);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os acessórios de banheiro (porta-sabonetes, suportes para escova de dente) estão dispostos de forma organizada?', '2S • 6.1.2 • Banheiros de Uso Comum', 'boolean', true, 5);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os itens de segurança (tapetes antiderrapantes, barras de apoio) estão corretamente instalados e acessíveis?', '2S • 6.1.2 • Banheiros de Uso Comum', 'boolean', true, 6);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'O layout do banheiro facilita o acesso e o uso de todos os itens armazenados?', '2S • 6.1.2 • Banheiros de Uso Comum', 'boolean', true, 7);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '2S • 6.1.3 • Aparelhos Eletrônicos', '6 QUESTIONÁRIO DE AVALIAÇÃO 2S SENSO DE ORDENAÇÃO PARA ÁREAS COMUNS — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA EM ÁREAS COMUNS, ALOJAMENTOS, BANHEIROS E SALAS DE ESTAR', 14)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os aparelhos eletrônicos (televisões, rádios, consoles de jogos) estão organizados e em locais de fácil acesso?', '2S • 6.1.3 • Aparelhos Eletrônicos', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os aparelhos eletrônicos (micro-ondas, cafeteiras, torradeiras) estão organizados e em locais de fácil acesso?', '2S • 6.1.3 • Aparelhos Eletrônicos', 'boolean', true, 1);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem aparelhos eletrônicos que não são utilizados frequentemente e podem ser removidos ou armazenados em outro local?', '2S • 6.1.3 • Aparelhos Eletrônicos', 'boolean', true, 2);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os cabos e acessórios eletrônicos estão organizados e não estão emaranhados?', '2S • 6.1.3 • Aparelhos Eletrônicos', 'boolean', true, 3);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '2S • 6.1.4 • Itens de Armazenamento', '6 QUESTIONÁRIO DE AVALIAÇÃO 2S SENSO DE ORDENAÇÃO PARA ÁREAS COMUNS — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA EM ÁREAS COMUNS, ALOJAMENTOS, BANHEIROS E SALAS DE ESTAR', 15)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os itens de armazenamento (caixas, estantes, prateleiras) estão organizados de maneira eficiente?', '2S • 6.1.4 • Itens de Armazenamento', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Há um sistema claro para o armazenamento e recuperação de itens armazenados?', '2S • 6.1.4 • Itens de Armazenamento', 'boolean', true, 1);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '2S • 6.1.5 • Itens de Segurança e Conforto', '6 QUESTIONÁRIO DE AVALIAÇÃO 2S SENSO DE ORDENAÇÃO PARA ÁREAS COMUNS — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA EM ÁREAS COMUNS, ALOJAMENTOS, BANHEIROS E SALAS DE ESTAR', 16)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os livros e revistas estão organizados em prateleiras ou estantes de maneira lógica?', '2S • 6.1.5 • Itens de Segurança e Conforto', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem livros ou revistas desatualizados ou em excesso que podem ser removidos?', '2S • 6.1.5 • Itens de Segurança e Conforto', 'boolean', true, 1);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os jogos de tabuleiro, DVDs e outros materiais de entretenimento estão organizados de forma acessível?', '2S • 6.1.5 • Itens de Segurança e Conforto', 'boolean', true, 2);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os itens de segurança (extintores de incêndio, kits de primeiros socorros) estão localizados de maneira acessível e organizada?', '2S • 6.1.5 • Itens de Segurança e Conforto', 'boolean', true, 3);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os itens de conforto (ventiladores, aquecedores, condicionadores de ar) estão organizados e funcionando adequadamente?', '2S • 6.1.5 • Itens de Segurança e Conforto', 'boolean', true, 4);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '2S • 6.1.6 • Plantas e Itens Naturais', '6 QUESTIONÁRIO DE AVALIAÇÃO 2S SENSO DE ORDENAÇÃO PARA ÁREAS COMUNS — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA EM ÁREAS COMUNS, ALOJAMENTOS, BANHEIROS E SALAS DE ESTAR', 17)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'As plantas estão dispostas de maneira organizada e são regularmente cuidadas?', '2S • 6.1.6 • Plantas e Itens Naturais', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem plantas que estão mortas, em mau estado ou que não são mais desejadas?', '2S • 6.1.6 • Plantas e Itens Naturais', 'boolean', true, 1);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os vasos ou suportes de plantas estão organizados e em boas condições?', '2S • 6.1.6 • Plantas e Itens Naturais', 'boolean', true, 2);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '2S • 6.1.7 • Decoração e Acessórios', '6 QUESTIONÁRIO DE AVALIAÇÃO 2S SENSO DE ORDENAÇÃO PARA ÁREAS COMUNS — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA EM ÁREAS COMUNS, ALOJAMENTOS, BANHEIROS E SALAS DE ESTAR', 18)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os itens decorativos (quadros, vasos, tapetes) estão organizados de maneira harmoniosa e sem excesso?', '2S • 6.1.7 • Decoração e Acessórios', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os porta-retratos, relógios ou outros acessórios estão organizados e em boas condições?', '2S • 6.1.7 • Decoração e Acessórios', 'boolean', true, 1);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '2S • 6.1.8 • Utensílios de Cozinha', '6 QUESTIONÁRIO DE AVALIAÇÃO 2S SENSO DE ORDENAÇÃO PARA ÁREAS COMUNS — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA EM ÁREAS COMUNS, ALOJAMENTOS, BANHEIROS E SALAS DE ESTAR', 19)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os pratos, talheres e copos estão organizados de maneira lógica e de fácil acesso?', '2S • 6.1.8 • Utensílios de Cozinha', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existe um local designado para cada tipo de utensílio (pratos, copos, talheres) na cozinha?', '2S • 6.1.8 • Utensílios de Cozinha', 'boolean', true, 1);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os utensílios de cozinha (panelas, frigideiras, espátulas) estão organizados e armazenados adequadamente?', '2S • 6.1.8 • Utensílios de Cozinha', 'boolean', true, 2);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '2S • 6.1.9 • Alimentos e Bebidas', '6 QUESTIONÁRIO DE AVALIAÇÃO 2S SENSO DE ORDENAÇÃO PARA ÁREAS COMUNS — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA EM ÁREAS COMUNS, ALOJAMENTOS, BANHEIROS E SALAS DE ESTAR', 20)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os alimentos e bebidas estão organizados de maneira lógica e fácil de acessar?', '2S • 6.1.9 • Alimentos e Bebidas', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existe um sistema de rotatividade para garantir que os alimentos mais antigos sejam usados primeiro?', '2S • 6.1.9 • Alimentos e Bebidas', 'boolean', true, 1);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os itens alimentares estão armazenados em locais designados e apropriados?', '2S • 6.1.9 • Alimentos e Bebidas', 'boolean', true, 2);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '2S • 6.1.10 • Acessórios de Refeitório', '6 QUESTIONÁRIO DE AVALIAÇÃO 2S SENSO DE ORDENAÇÃO PARA ÁREAS COMUNS — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA EM ÁREAS COMUNS, ALOJAMENTOS, BANHEIROS E SALAS DE ESTAR', 21)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os acessórios de refeitório (porta-guardanapos, saleiros, açucareiros) estão organizados e de fácil acesso?', '2S • 6.1.10 • Acessórios de Refeitório', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem cestos, caixas ou outros itens de armazenamento que não são utilizados ou que poderiam ser melhor organizados?', '2S • 6.1.10 • Acessórios de Refeitório', 'boolean', true, 1);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os itens decorativos no refeitório estão organizados de maneira harmoniosa e sem excesso?', '2S • 6.1.10 • Acessórios de Refeitório', 'boolean', true, 2);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '2S • 6.1.11 • Equipamentos de Refrigeração e Armazenamento', '6 QUESTIONÁRIO DE AVALIAÇÃO 2S SENSO DE ORDENAÇÃO PARA ÁREAS COMUNS — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA EM ÁREAS COMUNS, ALOJAMENTOS, BANHEIROS E SALAS DE ESTAR', 22)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'As geladeiras e freezers estão organizados e de fácil acesso?', '2S • 6.1.11 • Equipamentos de Refrigeração e Armazenamento', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'As prateleiras e compartimentos de armazenamento dentro das geladeiras e freezers estão organizados de maneira lógica?', '2S • 6.1.11 • Equipamentos de Refrigeração e Armazenamento', 'boolean', true, 1);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existe um sistema para garantir que os itens armazenados na geladeira ou no freezer sejam mantidos em boas condições?', '2S • 6.1.11 • Equipamentos de Refrigeração e Armazenamento', 'boolean', true, 2);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '3S • 9.1.1 • Identificação e Pintura das Instalações', '9 QUESTIONÁRIO DE AVALIAÇÃO 3S SENSO DE LIMPEZA PARA ÁREAS COMUNS — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA EM ÁREAS COMUNS, ALOJAMENTOS, BANHEIROS E SALAS DE ESTAR', 23)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'As camas e colchões são limpos e higienizados regularmente?', '3S • 9.1.1 • Identificação e Pintura das Instalações', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'As superfícies de contato frequente (mesas de cabeceira, puxadores de portas, interruptores) são desinfetadas regularmente?', '3S • 9.1.1 • Identificação e Pintura das Instalações', 'boolean', true, 1);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'As estantes, prateleiras e outras superfícies horizontais são limpas de poeira e sujeira regularmente?', '3S • 9.1.1 • Identificação e Pintura das Instalações', 'boolean', true, 2);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os estofados (poltronas, cadeiras) são aspirados e limpos regularmente?', '3S • 9.1.1 • Identificação e Pintura das Instalações', 'boolean', true, 3);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os móveis de madeira ou metal são limpos e polidos conforme necessário?', '3S • 9.1.1 • Identificação e Pintura das Instalações', 'boolean', true, 4);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem móveis que precisam de limpeza profunda ou manutenção?', '3S • 9.1.1 • Identificação e Pintura das Instalações', 'boolean', true, 5);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os cestos de lixo são esvaziados regularmente e os sacos de lixo são trocados?', '3S • 9.1.1 • Identificação e Pintura das Instalações', 'boolean', true, 6);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Há lixeiras suficientes e bem distribuídas pelos alojamentos?', '3S • 9.1.1 • Identificação e Pintura das Instalações', 'boolean', true, 7);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os resíduos são segregados adequadamente (orgânicos, recicláveis, não recicláveis)?', '3S • 9.1.1 • Identificação e Pintura das Instalações', 'boolean', true, 8);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os produtos de higiene (sabonetes, desinfetantes) estão armazenados de maneira higiênica e de fácil acesso?', '3S • 9.1.1 • Identificação e Pintura das Instalações', 'boolean', true, 9);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os materiais de limpeza (esponjas, panos, esfregões) são substituídos regularmente para garantir a eficácia da limpeza?', '3S • 9.1.1 • Identificação e Pintura das Instalações', 'boolean', true, 10);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem produtos de limpeza que estão vencidos ou não são mais utilizados?', '3S • 9.1.1 • Identificação e Pintura das Instalações', 'boolean', true, 11);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os pisos são varridos e esfregados regularmente?', '3S • 9.1.1 • Identificação e Pintura das Instalações', 'boolean', true, 12);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os carpetes são aspirados e limpos com frequência?', '3S • 9.1.1 • Identificação e Pintura das Instalações', 'boolean', true, 13);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem áreas do piso ou carpete que precisam de reparos ou limpeza profunda?', '3S • 9.1.1 • Identificação e Pintura das Instalações', 'boolean', true, 14);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '3S • 9.1.2 • Banheiros de Uso Comum', '9 QUESTIONÁRIO DE AVALIAÇÃO 3S SENSO DE LIMPEZA PARA ÁREAS COMUNS — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA EM ÁREAS COMUNS, ALOJAMENTOS, BANHEIROS E SALAS DE ESTAR', 24)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'As pias e bancadas são limpas e desinfetadas regularmente?', '3S • 9.1.2 • Banheiros de Uso Comum', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os espelhos e superfícies de vidro são limpos frequentemente?', '3S • 9.1.2 • Banheiros de Uso Comum', 'boolean', true, 1);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'As superfícies de contato frequente (puxadores de portas, torneiras) são desinfetadas regularmente?', '3S • 9.1.2 • Banheiros de Uso Comum', 'boolean', true, 2);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os vasos sanitários são limpos e desinfetados diariamente?', '3S • 9.1.2 • Banheiros de Uso Comum', 'boolean', true, 3);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os chuveiros e box são limpos e desinfetados regularmente?', '3S • 9.1.2 • Banheiros de Uso Comum', 'boolean', true, 4);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os ralos e áreas de drenagem são limpos para evitar entupimentos?', '3S • 9.1.2 • Banheiros de Uso Comum', 'boolean', true, 5);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os pisos e azulejos são varridos e esfregados regularmente?', '3S • 9.1.2 • Banheiros de Uso Comum', 'boolean', true, 6);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem áreas do piso ou azulejos que precisam de reparos ou limpeza profunda?', '3S • 9.1.2 • Banheiros de Uso Comum', 'boolean', true, 7);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '3S • 9.1.3 • Limpeza de Aparelhos Eletrônicos', '9 QUESTIONÁRIO DE AVALIAÇÃO 3S SENSO DE LIMPEZA PARA ÁREAS COMUNS — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA EM ÁREAS COMUNS, ALOJAMENTOS, BANHEIROS E SALAS DE ESTAR', 25)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os aparelhos eletrônicos (televisões, rádios, consoles de jogos) são limpos regularmente?', '3S • 9.1.3 • Limpeza de Aparelhos Eletrônicos', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os controles remotos e outros acessórios eletrônicos são desinfetados regularmente?', '3S • 9.1.3 • Limpeza de Aparelhos Eletrônicos', 'boolean', true, 1);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem aparelhos eletrônicos que precisam de manutenção ou limpeza profunda?', '3S • 9.1.3 • Limpeza de Aparelhos Eletrônicos', 'boolean', true, 2);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existe etiqueta de controle de limpeza dos filtros e da manutenção geral de ar-condicionado?', '3S • 9.1.3 • Limpeza de Aparelhos Eletrônicos', 'boolean', true, 3);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '3S • 9.1.4 • Limpeza de Janelas e Vidros', '9 QUESTIONÁRIO DE AVALIAÇÃO 3S SENSO DE LIMPEZA PARA ÁREAS COMUNS — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA EM ÁREAS COMUNS, ALOJAMENTOS, BANHEIROS E SALAS DE ESTAR', 26)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'As janelas são limpas regularmente para remover sujeira e manchas?', '3S • 9.1.4 • Limpeza de Janelas e Vidros', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os vidros das portas e divisórias são limpos e desinfetados frequentemente?', '3S • 9.1.4 • Limpeza de Janelas e Vidros', 'boolean', true, 1);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem janelas ou vidros que precisam de limpeza ou manutenção adicional?', '3S • 9.1.4 • Limpeza de Janelas e Vidros', 'boolean', true, 2);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '3S • 9.1.5 • Itens de Segurança e Conforto', '9 QUESTIONÁRIO DE AVALIAÇÃO 3S SENSO DE LIMPEZA PARA ÁREAS COMUNS — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA EM ÁREAS COMUNS, ALOJAMENTOS, BANHEIROS E SALAS DE ESTAR', 27)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os itens de segurança (extintores de incêndio, kits de primeiros socorros) estão localizados de maneira acessível e verificados regularmente?', '3S • 9.1.5 • Itens de Segurança e Conforto', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'As saídas de emergência e áreas de circulação estão livres de obstruções e limpas regularmente?', '3S • 9.1.5 • Itens de Segurança e Conforto', 'boolean', true, 1);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem tapetes antiderrapantes, ou outros itens de segurança que precisam de limpeza ou substituição?', '3S • 9.1.5 • Itens de Segurança e Conforto', 'boolean', true, 2);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '3S • 9.1.6 • Limpeza de Superfícies', '9 QUESTIONÁRIO DE AVALIAÇÃO 3S SENSO DE LIMPEZA PARA ÁREAS COMUNS — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA EM ÁREAS COMUNS, ALOJAMENTOS, BANHEIROS E SALAS DE ESTAR', 28)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'As bancadas e áreas de preparo de alimentos são higienizadas diariamente?', '3S • 9.1.6 • Limpeza de Superfícies', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'As superfícies de contato frequente (puxadores de portas, interruptores) são desinfetadas regularmente?', '3S • 9.1.6 • Limpeza de Superfícies', 'boolean', true, 1);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '3S • 9.1.7 • Limpeza de Utensílios de Cozinha', '9 QUESTIONÁRIO DE AVALIAÇÃO 3S SENSO DE LIMPEZA PARA ÁREAS COMUNS — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA EM ÁREAS COMUNS, ALOJAMENTOS, BANHEIROS E SALAS DE ESTAR', 29)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os pratos, talheres e copos são lavados e desinfetados adequadamente após cada uso?', '3S • 9.1.7 • Limpeza de Utensílios de Cozinha', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os utensílios de cozinha (panelas, frigideiras, espátulas) são limpos e armazenados em locais apropriados?', '3S • 9.1.7 • Limpeza de Utensílios de Cozinha', 'boolean', true, 1);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '3S • 9.1.8 • Limpeza de Aparelhos Eletrônicos', '9 QUESTIONÁRIO DE AVALIAÇÃO 3S SENSO DE LIMPEZA PARA ÁREAS COMUNS — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA EM ÁREAS COMUNS, ALOJAMENTOS, BANHEIROS E SALAS DE ESTAR', 30)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os aparelhos eletrônicos (micro-ondas, cafeteiras, torradeiras) são limpos regularmente?', '3S • 9.1.8 • Limpeza de Aparelhos Eletrônicos', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Os filtros e componentes removíveis dos aparelhos eletrônicos são limpos e substituídos conforme necessário?', '3S • 9.1.8 • Limpeza de Aparelhos Eletrônicos', 'boolean', true, 1);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existem aparelhos eletrônicos que precisam de manutenção ou limpeza profunda?', '3S • 9.1.8 • Limpeza de Aparelhos Eletrônicos', 'boolean', true, 2);
    insert into forms.section (questionnaire_id, title, description, sort_order)
    values (questionnaire_id, '3S • 9.1.9 • Limpeza de Alimentos e Bebidas', '9 QUESTIONÁRIO DE AVALIAÇÃO 3S SENSO DE LIMPEZA PARA ÁREAS COMUNS — IDENTIFICAÇÃO DE ITENS SEM SERVENTIA EM ÁREAS COMUNS, ALOJAMENTOS, BANHEIROS E SALAS DE ESTAR', 31)
    returning id into section_id;
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'As áreas de armazenamento de alimentos e bebidas (geladeiras, armários) são limpas regularmente?', '3S • 9.1.9 • Limpeza de Alimentos e Bebidas', 'boolean', true, 0);
    insert into forms.question (section_id, text, description, type, required, sort_order)
    values (section_id, 'Existe um sistema para garantir que os alimentos e bebidas sejam armazenados de maneira higiênica e organizada?', '3S • 9.1.9 • Limpeza de Alimentos e Bebidas', 'boolean', true, 1);
  end if;
end $$;

