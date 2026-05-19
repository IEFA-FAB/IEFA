-- Seed v1 — Termos de Uso e Política de Privacidade (pt-BR)
-- Sistema interno IEFA/FAB — Vigência: 2026-05-19

INSERT INTO iefa.legal_documents (doc_type, version, locale, content_md, effective_date, published_at)
VALUES
(
  'terms_of_use',
  '1.0.0',
  'pt-BR',
  E'# Termos de Uso\n\n## 1. Objeto\n\nEste documento regula o uso dos sistemas digitais do Instituto de Economia, Finanças e Administração da Aeronáutica (IEFA), vinculado à Secretaria de Economia, Finanças e Administração da Aeronáutica (SEFA) do Comando da Aeronáutica.\n\n## 2. Aceitação\n\nO acesso ao sistema implica a aceitação integral e irrestrita destes Termos de Uso. Caso não concorde com as condições aqui estabelecidas, o usuário deve abster-se de utilizar a plataforma.\n\n## 3. Acesso e Cadastro\n\nO acesso é restrito a militares e servidores civis autorizados pelo IEFA. O usuário é responsável pela confidencialidade de suas credenciais e por todas as ações realizadas com sua conta.\n\n## 4. Uso Permitido\n\nO sistema destina-se exclusivamente ao suporte às atividades institucionais do IEFA e da SEFA. É vedado o uso para fins pessoais, comerciais ou que contrariem as normas do Comando da Aeronáutica.\n\n## 5. Propriedade Intelectual\n\nTodo o conteúdo disponibilizado — incluindo textos, dados, software e interfaces — é de titularidade da União Federal e protegido pela legislação vigente. É proibida a reprodução ou distribuição não autorizada.\n\n## 6. Limitação de Responsabilidade\n\nO IEFA não se responsabiliza por danos decorrentes do uso indevido do sistema, indisponibilidades técnicas ou ações de terceiros não autorizados.\n\n## 7. Alterações\n\nEstes Termos poderão ser atualizados a qualquer momento. O uso continuado após a publicação de nova versão constitui aceitação das alterações.\n\n## 8. Foro\n\nFica eleito o foro da Justiça Federal da Seção Judiciária do Rio de Janeiro para dirimir quaisquer questões decorrentes destes Termos.',
  '2026-05-19',
  now()
),
(
  'privacy_policy',
  '1.0.0',
  'pt-BR',
  E'# Política de Privacidade\n\n## 1. Dados Coletados\n\nO IEFA coleta dados cadastrais (nome, e-mail institucional, posto/graduação) e dados de uso da plataforma (registros de acesso, ações realizadas e preferências de configuração).\n\n## 2. Finalidade\n\nOs dados são utilizados exclusivamente para: autenticação e controle de acesso; personalização da experiência do usuário; geração de relatórios de uso institucional; e cumprimento de obrigações legais e regulatórias.\n\n## 3. Compartilhamento\n\nAs informações não são compartilhadas com terceiros, salvo quando exigido por determinação legal, judicial ou por autoridade competente. Dentro do COMAER, o acesso é restrito às áreas com necessidade funcional.\n\n## 4. Segurança\n\nAdotamos medidas técnicas e administrativas para proteger os dados contra acesso não autorizado, perda ou alteração indevida, em conformidade com as normas de segurança do Comando da Aeronáutica e com a LGPD (Lei nº 13.709/2018).\n\n## 5. Direitos do Usuário\n\nO usuário pode solicitar acesso, correção ou exclusão de seus dados pessoais mediante requerimento à Seção responsável do IEFA, observadas as restrições legais aplicáveis a órgãos militares.\n\n## 6. Cookies\n\nO sistema utiliza cookies de sessão estritamente necessários para autenticação e funcionamento. Não são utilizados cookies de rastreamento ou publicidade.\n\n## 7. Alterações\n\nEsta Política poderá ser atualizada para refletir mudanças normativas ou operacionais. A data de vigência constará sempre no topo do documento.\n\n## 8. Contato\n\nDúvidas ou solicitações relacionadas a esta Política devem ser encaminhadas à Direção do IEFA pelo e-mail institucional disponível no Portal.',
  '2026-05-19',
  now()
)
ON CONFLICT (doc_type, version, locale) DO NOTHING;
