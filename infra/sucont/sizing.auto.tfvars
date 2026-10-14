# Versionado: sobrepõe o terraform.tfvars que o CI monta do segredo TF_TFVARS_JSON. CPU,
# memória e tasks continuam lá; aqui só o que precisa passar por PR.
#
# As análises do sucont são SSE longos com teto próprio: SAC-DGC até 300 s
# (routes/api/sacdgc/analyze.post.ts) e relatório do auditor até 180 s
# (routes/api/auditor/report.post.ts). 300 s deixam qualquer uma terminar quando a task sai
# de rotação; com os 30 s do default, o deploy cortava a análise e o consumo de Bedrock dela
# se perdia. O custo é o deploy do sucont esperar até 5 min pela task antiga.
deregistration_delay = 300
