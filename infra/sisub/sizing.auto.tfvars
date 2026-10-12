# Tamanho do sisub. Versionado: sobrepõe o terraform.tfvars que o CI monta do segredo
# TF_TFVARS_JSON. Medição e teste de carga que embasam os números: PR do scale-down.
#
# 0,25 vCPU com 1 GB: a CPU sobra (média de 1%, máx. de 0,23 vCPU em 21 dias), a memória não
# desce, porque em 2026-09-13 o serviço chegou a 87% de 1 GB.
cpu    = 256
memory = 1024

# Duas tasks sempre (sobrevive à perda de uma task Spot); o autoscaling sobe até 6 quando a
# média de CPU passa de 50% ou a de memória de 70%. Para um evento conhecido, suba o
# desired_count: ele é o mínimo do autoscaling.
desired_count         = 2
autoscaling_max_count = 6
