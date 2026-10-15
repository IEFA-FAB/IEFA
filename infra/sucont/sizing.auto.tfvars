# Versionado: sobrepõe o terraform.tfvars que o CI monta do segredo TF_TFVARS_JSON. CPU,
# memória e tasks continuam lá; aqui só o que precisa passar por PR.
#
# As análises do sucont são SSE longos com prazo próprio: SAC-DGC até 300 s
# (routes/api/sacdgc/analyze.post.ts) e relatório do auditor até 180 s
# (routes/api/auditor/report.post.ts), contados depois do parse do corpo, da auth e da
# montagem do prompt. 330 s = maior prazo + folga, para a rota emitir o próprio erro de prazo
# antes de o ALB cortar. Com os 30 s do default, o deploy cortava a análise e o consumo de
# Bedrock dela se perdia. O custo é o deploy do sucont esperar até 5,5 min pela task antiga
# (o `deploy` do _release.yml dá até 20 min para estabilizar). Não cobre troca de Spot (ver
# "Drenagem" no README de infra/).
deregistration_delay = 330
