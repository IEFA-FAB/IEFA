# Versionado: sobrepõe o terraform.tfvars que o CI monta do segredo TF_TFVARS_JSON. CPU,
# memória e tasks continuam lá; aqui só o que precisa passar por PR.
#
# 90 s deixam terminar a chamada de tool (POST) em andamento quando a task sai de rotação.
# Não salvam a sessão: ela vive na memória da task (SessionRegistry em
# apps/sisub-mcp/src/index.ts), o Mcp-Session-Id antigo não existe na task nova e o cliente
# precisa refazer o `initialize`. O GET SSE do Streamable HTTP nunca termina sozinho, então
# com cliente conectado todo deploy ou scale-in espera os 90 s inteiros e corta esse stream
# do mesmo jeito. Não cobre troca de Spot (ver "Drenagem" no README de infra/).
deregistration_delay = 90
