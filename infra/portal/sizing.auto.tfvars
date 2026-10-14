# Versionado: sobrepõe o terraform.tfvars que o CI monta do segredo TF_TFVARS_JSON. CPU,
# memória e tasks continuam lá; aqui só o que precisa passar por PR.
#
# A redação assistida de comunicações oficiais (routes/api/comunicacoes/chat.post.ts) é SSE
# sem teto de tempo próprio. 90 s deixam terminar o turno em andamento quando a task sai de
# rotação (deploy); com os 30 s do default, a resposta era cortada no meio.
deregistration_delay = 90
