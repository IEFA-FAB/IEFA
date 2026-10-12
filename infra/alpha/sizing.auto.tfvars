# Tamanho do alpha. Versionado: sobrepõe o terraform.tfvars que o CI monta do segredo
# TF_TFVARS_JSON. Medição que embasa os números: PR do scale-down.
#
# Em 21 dias: memória máx. de ~120 MB e CPU máx. de 0,22 vCPU (picos diários de um job); a
# média de CPU é 0,4%. Cabe em 0,25 vCPU com 512 MB, com os picos mais lentos.
cpu    = 256
memory = 512

# Uma task; o autoscaling sobe até 3 quando a média de CPU passa de 50% ou a de memória de 70%.
desired_count         = 1
autoscaling_max_count = 3
