# Config da redacao assistida das comunicacoes oficiais — NAO-SECRETA, versionada.
#
# Por que este arquivo existe, e nao mais o bloco dentro de `environment_variables`
# do terraform.tfvars: os tfvars reais moram no secret TF_TFVARS_JSON, fora do repo.
# O codigo da redacao assistida entrou em 02-03/set (#264, #265) e o secret nao foi
# atualizado junto — a task definition do portal ficou na revisao 1 (03/jul/2026, so
# PORT e NODE_ENV), o capability gate viu `PORTAL_AI_*` ausente e a ferramenta
# respondeu 503 em producao desde o primeiro dia. Nenhum gate pega isso: config em
# secret nao aparece em diff, em plan de PR nem em review.
#
# Valores nao-secretos (provider, model, regiao, tetos) ficam AQUI, versionados e
# aplicados pelo mesmo merge que traz o codigo: mudar este arquivo dispara o
# terraform-plan no PR e o terraform-apply no merge, sem depender de ninguem lembrar
# de editar o secret. O secret segue guardando so o que e de fato secreto, e nao ha
# colisao — o merge do main.tf mantem a precedencia do que vier de la.
#
# Os valores foram VERIFICADOS na conta 103256050857 (2026-09-02, reconferido em
# 2026-09-09), nao copiados:
#   1. habilitacao (perfil ACTIVE NAO basta) — `bedrock-runtime converse` de verdade:
#      opus-4-6 e sonnet-4-6 respondem; opus-4-8 e opus-5 devolvem
#      `AccessDeniedException: not available for this account`, mesmo listados ACTIVE;
#   2. autorizacao da task role `iefa-prod-ecs-task` — a policy inline
#      `iefa-prod-ecs-task-extra` concede `bedrock:InvokeModel*` em
#      `inference-profile/global.anthropic.*` e `foundation-model/openai.gpt-oss-*`,
#      que cobrem o primario e a reserva abaixo. Simular a acao `bedrock:Converse`
#      da implicitDeny e isso e ESPERADO: e por InvokeModel* que a Converse autoriza;
#   3. ponta a ponta com o schema real — `cd apps/portal && bun run test:ai`.
#
# A FORMA do ARN muda com o TIPO do id — `global.anthropic.*` e inference profile
# (ARN COM conta) e `openai.gpt-oss-*` e foundation model (ARN SEM conta). Detalhes e
# os comandos prontos estao em infra/sucont/terraform.tfvars.example e no AI-PROVIDERS.md.
locals {
  # Injetadas em `environment_variables` pelo merge do main.tf.
  ai_environment_variables = {
    PORTAL_AI_PROVIDER = "bedrock"
    PORTAL_AI_MODEL    = "global.anthropic.claude-opus-4-6-v1"
    PORTAL_AI_REGION   = "sa-east-1"

    # Reserva: so entra ANTES do primeiro conteudo e so em falha TRANSITORIA.
    # AccessDenied e erro de schema propagam — trocar de provider repetiria a falha.
    PORTAL_FALLBACK_AI_PROVIDER = "bedrock"
    PORTAL_FALLBACK_AI_MODEL    = "openai.gpt-oss-120b-1:0"
    PORTAL_FALLBACK_AI_REGION   = "sa-east-1"

    # Tetos por usuario, exceto TOKENS_PER_DAY, que e por PROCESSO: o portal roda com
    # desired_count = 2, entao o teto diario efetivo e o DOBRO do numero abaixo.
    # Dimensionado pela carga real desta ferramenta: uma redacao e ~1,5k tokens de
    # entrada + ~1,5k de saida, entao 500k/dia/processo cabe ~160 documentos por
    # processo (~320 no total) — folga larga para um formulario que gera um documento
    # por clique, e teto de CUSTO com primario da familia Opus.
    PORTAL_AI_MAX_REQUESTS_PER_MINUTE = "10"
    PORTAL_AI_MAX_TOKENS_PER_MINUTE   = "60000"
    PORTAL_AI_MAX_TOKENS_PER_DAY      = "500000"
  }
}
