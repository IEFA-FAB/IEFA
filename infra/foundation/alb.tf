resource "aws_lb" "this" {
  name               = substr("${local.name_prefix}-alb", 0, 32)
  load_balancer_type = "application"
  internal           = false
  security_groups    = [aws_security_group.alb.id]
  subnets            = [for subnet in aws_subnet.public : subnet.id]

  # Um ALB só para todos os serviços: recriá-lo derruba todos os apps de uma vez e troca o
  # DNS dele, e os CNAMEs de cada host (*.iefa.com.br, app.previsaosisub.com.br) estão no
  # Registro.br, à mão, fora do Terraform (ver apps/pdf/README.md). Com a proteção, um
  # `destroy` ou uma mudança que force replace (nome, `internal`) falha no apply em vez de
  # apagar o balanceador. Para remover de propósito: PR com `false`, apply, e só então o
  # destroy/replace (passo a passo no README de infra/).
  enable_deletion_protection = true

  # Âncora dos timeouts do monorepo: tudo o que fala com o ALB é calibrado contra estes
  # 60 s. Mudou aqui, revise cada um:
  #   - idle da origem MAIOR que este, para quem corta a conexão ociosa ser sempre o ALB
  #     (senão ele reusa socket morto e devolve 502 sem 5xx no target):
  #     docker/bun-serve-idle-timeout.ts (120 s, piso de todo Bun.serve dos apps Nitro),
  #     apps/api/src/index.ts (idleTimeout 120), apps/alpha/src/index.ts (idleTimeout 240),
  #     apps/sisub-mcp/src/index.ts (keepAliveTimeout 65 s, headersTimeout 66 s);
  #   - heartbeat de SSE MENOR que este, para o stream nunca ficar ocioso: 15 s em
  #     apps/alpha/src/api/chats.ts e nas rotas SSE do sucont (sacdgc, auditor).
  #     LACUNA: os chats SSE do sisub (routes/api/module-chat, routes/api/analytics) e do
  #     portal (routes/api/comunicacoes/chat.post.ts) não mandam heartbeat; mais de 60 s sem
  #     byte (tool call, primeiro token lento) é cortado aqui, com ou sem drenagem;
  #   - resposta síncrona (server function, JSON) termina ANTES disto ou vira 504; o que
  #     passa de 60 s vira SSE ou job assíncrono (ex.: o orçamento de geração em
  #     apps/sucont/src/server/document-ai.fn.ts).
  idle_timeout = 60

  # Header com nome inválido (fora de [A-Za-z0-9-], ex.: `x_forwarded_for`) é
  # descartado no ALB em vez de chegar ao app: é o vetor clássico de smuggling e de
  # confusão de header entre proxy e backend.
  drop_invalid_header_fields = true

  # Access logs por-request → visibilidade de 502/504, status por path e
  # target_processing_time (ver alb_logs.tf). depends_on garante a bucket policy
  # antes do LB tentar a primeira entrega.
  access_logs {
    bucket  = aws_s3_bucket.alb_logs.bucket
    enabled = true
  }

  depends_on = [aws_s3_bucket_policy.alb_logs]
}

# The listener default action returns a fixed 404. Every service adds its own
# host-based listener rule (see the `service` module), so no service owns the
# default action and services can be applied/destroyed independently.
resource "aws_lb_listener" "http" {
  count = var.certificate_arn == "" ? 1 : 0

  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "fixed-response"

    fixed_response {
      content_type = "text/plain"
      message_body = "No matching service."
      status_code  = "404"
    }
  }
}

resource "aws_lb_listener" "http_redirect" {
  count = var.certificate_arn == "" ? 0 : 1

  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  count = var.certificate_arn == "" ? 0 : 1

  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  certificate_arn   = var.certificate_arn
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"

  default_action {
    type = "fixed-response"

    fixed_response {
      content_type = "text/plain"
      message_body = "No matching service."
      status_code  = "404"
    }
  }
}

locals {
  application_listener_arn = var.certificate_arn == "" ? aws_lb_listener.http[0].arn : aws_lb_listener.https[0].arn
}
