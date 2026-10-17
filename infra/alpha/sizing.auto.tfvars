# Tamanho do alpha. Versionado: sobrepõe o terraform.tfvars que o CI monta do segredo
# TF_TFVARS_JSON. Medição que embasa os números: PR #618.
#
# Mesmo tamanho de task de antes, uma task a menos. Em 21 dias: CPU média de 0,4%, picos
# diários de 0,22 vCPU (job agendado). A memória fica em 1 GB, e não em 512 MB, porque a
# leitura de PDF roda em até 2 subprocessos de 256 MB além do processo principal (~120 MB).
cpu    = 512
memory = 1024

# Uma task, em Spot: uma reclamação deixa o alpha fora por ~1–2 min até a substituta subir.
# Para não ter essa janela, `fargate_on_demand_base = 1` no tfvars (task sob demanda, ~2× o
# preço). O autoscaling sobe até 3 quando a média de CPU passa de 40%.
desired_count         = 1
autoscaling_max_count = 3

# Deploy e scale-in esperam o turno em andamento terminar. O chat do contrate
# (/api/v1/chats/:id/messages/stream, SSE) tem teto de 180 s (TURN_TIMEOUT_MS em
# apps/alpha/src/api/chats.ts), contado depois de auth e leitura do histórico; o ChatRADA, de
# 60 s. 200 s = prazo + folga, para a rota emitir o próprio erro de prazo antes de o ALB
# cortar. Com os 30 s do default, o stream morria no meio sem mensagem. Não cobre troca de
# Spot (ver "Drenagem" no README de infra/).
deregistration_delay = 200
