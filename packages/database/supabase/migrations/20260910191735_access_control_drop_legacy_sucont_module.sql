-- APLICADA em prod em 2026-09-10 via MCP `apply_migration` (versão remota 20260910191735).
-- O arquivo nasceu como 20260910200000 e foi renomeado para casar com a versão registrada.
--
-- Remove as linhas `module = 'sucont'`, obsoletas desde o split por divisão
-- (`20260910184943`).
--
-- O split deixou as linhas antigas de pé de propósito: enquanto o container velho podia
-- voltar, elas eram o que faria um rollback devolver o acesso de todo mundo. A versão nova
-- está em produção e verificada, então elas agora são só ruído — `AppModule` não tem mais o
-- valor `sucont`, nenhum código as lê, e um grant que a tela de acessos não mostra e ninguém
-- consegue revogar é pior que ausência: parece acesso concedido numa auditoria da tabela.
--
-- O DELETE é CONDICIONADO À COBERTURA, e é isso que o torna seguro de reaplicar num banco
-- que não seja este: só sai a linha cujo titular já tem as três divisões — e, se ela era
-- nível 3, também o `sucont-admin`. Um `delete ... where module = 'sucont'` cru destruiria o
-- acesso de quem estivesse num banco onde o backfill não rodou (uma restauração parcial, um
-- ambiente novo montado fora de ordem), e não haveria caminho de volta pela interface.
--
-- A migration `20260705190000_sucont_access_grant` continua criando essas linhas — é
-- história aplicada e não se reescreve. Num rebuild a partir do zero a sequência resolve
-- sozinha: o seed cria, o `20260910184943` espelha nos quatro módulos, e esta apaga.

delete from access_control.user_permissions s
where s.module = 'sucont'
  and (
    select count(distinct d.module)
    from access_control.user_permissions d
    where d.user_id = s.user_id
      and d.module in ('sucont-1', 'sucont-3', 'sucont-4')
  ) = 3
  and (
    s.level < 3
    or exists (
      select 1
      from access_control.user_permissions a
      where a.user_id = s.user_id
        and a.module = 'sucont-admin'
        and a.level >= 3
    )
  );

-- Mesmo critério para os statements de política. Nenhum existe hoje (a consulta volta
-- vazia), mas uma política criada entre o split e esta limpeza cairia aqui — e deixá-la
-- emprestando um módulo morto seria acesso que a tela de acessos lista e não explica.
delete from access_control.policy_statement s
where s.module = 'sucont'
  and (
    select count(distinct d.module)
    from access_control.policy_statement d
    where d.policy_id = s.policy_id
      and d.module in ('sucont-1', 'sucont-3', 'sucont-4')
  ) = 3
  and (
    s.level < 3
    or exists (
      select 1
      from access_control.policy_statement a
      where a.policy_id = s.policy_id
        and a.module = 'sucont-admin'
        and a.level >= 3
    )
  );
