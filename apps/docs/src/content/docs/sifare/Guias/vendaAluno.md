---
title: Baixa de Venda Aluno
description: Resolver a baixa de venda aluno.
---

## Por que ?

A venda aluno é um tipo de venda que ocorre para aqueles militares que ainda não tem SARAM. Esse tipo de venda acaba sendo mais sucetível à erros, se for o caso, para corrigir erros insanáveis pelo sistema normal e referentes a compras que **já foram pagas** deve se seguir o seguinte procedimento para resolução.

## Passo a Passo (Alteração no Banco)
### Acessar o Servidor
1. Acessar o `10.140.48.14` por meio do XOA ou SSH
2. Entrar no Usuário **postgres** 

```` bash
 su - postgres 
````

### Acessar o Banco de Dados
4. Acessar o banco **sifare** no `10.140.48.8`

```` bash
 psql -h 10.140.48.8 -d sifare 
````

### Baixa da Venda com erro
5. Alterar o `status_venda` da tabela `venda` para `EFETUADA` com um `id_venda` especificado

:::danger[Perigo]
Não Esqueça o WHERE
:::
```` SQL
 UPDATE venda SET status_venda = 'EFETUADA' WHERE id_venda=0000000
````