# Tamanho do sisub. Versionado: sobrepõe o terraform.tfvars que o CI monta do segredo
# TF_TFVARS_JSON. Medição e teste de carga que embasam os números: PR #618.
#
# 0,25 vCPU com 1 GB. A CPU sobra: cada requisição real custa ~14 ms de vCPU, e o pior minuto
# medido (10,5 req/s, ~100 usuários) usa ~29% de 2 × 0,25 vCPU. A memória não desce: em
# 2026-09-13 o serviço chegou a 87% de 1 GB.
cpu    = 256
memory = 1024

# Duas tasks sempre (sobrevive à perda de uma task Spot). O autoscaling sobe até 6 quando a
# média de CPU passa de 40% (~14 req/s). Para um evento conhecido, suba o desired_count: ele é
# o mínimo, e mudar só ajusta as tasks, sem redeploy.
desired_count         = 2
autoscaling_max_count = 6

# Com 0,25 vCPU, uma rajada deixa o /health mais lento antes de o autoscaling reagir (~3 min).
# 10 s de timeout e 3 falhas (~45 s) evitam que o ALB tire de rotação uma task só ocupada, o
# que jogaria toda a carga na outra.
health_check_timeout_seconds     = 10
health_check_unhealthy_threshold = 3

# Os chats (routes/api/module-chat e routes/api/analytics, SSE) não têm teto de tempo, só de
# iterações (AI_CHAT_MAX_ITERATIONS = 8). 90 s deixam terminar o turno típico quando a task sai
# de rotação (deploy, scale-in do autoscaling); com os 30 s do default, a resposta era cortada
# no meio. Não cobre troca de Spot (ver "Drenagem" no README de infra/).
#
# LACUNA: essas rotas não mandam heartbeat. Mais de 60 s sem byte (tool call, primeiro token
# lento, várias das 8 iterações) cai no idle_timeout do ALB, com ou sem drenagem (ver
# infra/foundation/alb.tf).
deregistration_delay = 90
