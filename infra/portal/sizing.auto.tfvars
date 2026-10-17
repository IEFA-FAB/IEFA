# Versionado: sobrepõe o terraform.tfvars que o CI monta do segredo TF_TFVARS_JSON. CPU,
# memória e tasks continuam lá; aqui só o que precisa passar por PR.
#
# A redação assistida de comunicações oficiais (routes/api/comunicacoes/chat.post.ts) é SSE
# sem prazo próprio. 90 s deixam terminar o turno típico quando a task sai de rotação
# (deploy); com os 30 s do default, a resposta era cortada no meio. Não cobre troca de Spot
# (ver "Drenagem" no README de infra/).
#
# LACUNA: a rota não manda heartbeat. Mais de 60 s sem byte (tool call, primeiro token lento)
# cai no idle_timeout do ALB, com ou sem drenagem (ver infra/foundation/alb.tf).
deregistration_delay = 90
