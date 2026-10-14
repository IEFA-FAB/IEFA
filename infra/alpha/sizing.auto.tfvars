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
# apps/alpha/src/api/chats.ts); o ChatRADA, de 60 s. Com os 30 s do default, o ALB cortava o
# turno no meio e o usuário via o stream morrer sem mensagem de erro. Na reclamação de Spot o
# teto real é o aviso de 2 min da AWS, não este valor.
deregistration_delay = 180
