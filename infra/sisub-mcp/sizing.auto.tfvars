# Versionado: sobrepõe o terraform.tfvars que o CI monta do segredo TF_TFVARS_JSON. CPU,
# memória e tasks continuam lá; aqui só o que precisa passar por PR.
#
# O transporte MCP (Streamable HTTP) mantém stream SSE aberto sem prazo, então nenhum valor o
# cobre inteiro. 90 s deixam terminar a chamada de tool em andamento quando a task sai de
# rotação, e o cliente reconecta na task nova; com os 30 s do default, a chamada caía no meio.
deregistration_delay = 90
