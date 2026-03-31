
**Ministério da Gestão e da Inovação em Serviços Públicos – MGI**

**Ministra:** Esther Dweck

**Secretaria de Gestão e Inovação – Seges**

**Secretário:** Roberto Seara Machado Pojo Rego

**Secretária Adjunta:** Regina Lemos de Andrade

**Diretoria de Normas e Sistemas de Logística – D elog**

**Diretor:** Everton Batista dos Santos

**Coordenação-Geral de Gestão Estratégica - CGGES**

**Coordenador-Geral:** Alexandre Augusto Villain da Silva

**Coordenação de Transparência e informações Gerenciais - C otin**

**Coordenador:** Magnum Costa de Oliveira

**Equipe:**

Guilherme Fonseca De Noronha Rocha

Stefano Terci Gasperazzo

José Maria De Melo Junior

Páblio de Sousa Lourenço

Flavio Henrique Martins


## Sumário



- VERSÃO 2 0 – Fev/2
- 1. Introdução __________________________________________________________
- 2. Objetivos ___________________________________________________________
- 3. Outros tópicos relevantes _____________________________________________
- 4. Módulo Material _____________________________________________________
- 4.1. Grupo _____________________________________________________________
- 4.2. Classe ___________________________________________________________
- 4.3. Produto Descritivo Básico – PDM ____________________________________
- 4.4. Item ______________________________________________________________
- 4.5. Natureza da Despesa _______________________________________________
- 4.6. Unidade de Fornecimento _________________________________________
- 4.7. Características ____________________________________________________
- 5. Módulo Serviço _____________________________________________________
- 5.1. Seção ____________________________________________________________
- 5.2. Divisão ___________________________________________________________
- 5.3. Grupo ____________________________________________________________
- 5.4. Classe ___________________________________________________________
- 5.5. Subclasse ________________________________________________________
- 5.6. Item ______________________________________________________________
- 5.7. Unidade de Medida _______________________________________________
- 5.8. Natureza da Despesa ______________________________________________
- 6. Módulo Pesquisa de Preço ___________________________________________
- 6.1. Material __________________________________________________________
- 6.2. Detalhe do Material ________________________________________________
- 6.3. Serviço __________________________________________________________
- 6.4. Detalhe do Serviço ________________________________________________
- 7. Módulo PGC - Planejamento e Gerenciamento de Contratações _________
- 7.1. PGC Detalhe ______________________________________________________
- 7.2. PGC Detalhe Catálogo _____________________________________________
- 7.3. PGC Agregação ___________________________________________________
- 8. Módulo UASG - Unidade Administrativa de Serviços Gerais ______________
- 8.1. UASG ____________________________________________________________
- 8.2. Órgão ____________________________________________________________
- 9. Módulo Legado _____________________________________________________
- 9.1. Licitação _________________________________________________________
- 9.2. Itens de Licitações ________________________________________________
- 9.3. Pregão ___________________________________________________________
- 9.4. Itens de Pregões __________________________________________________
- 9.5. Compra sem Licitação _____________________________________________
- 9.6. Itens de Compras sem Licitação ____________________________________
- 9.7. RDC _____________________________________________________________
- 10. Módulo Contratações ______________________________________________
- 10.1. Indicadores de Modalidade da Compra ____________________________
- 10.2. Modos de Disputa _______________________________________________
- 10.3. Critérios de Julgamento __________________________________________
- 10.4. Amparos Legais _________________________________________________
- 10.5. Contratações PNCP 14133 ________________________________________
- 10.6. Itens das Contratações PNCP 14133 _______________________________
- 10.7. Resultado dos Itens das Contratações PNCP 14133 _________________
- 11. Módulo ARP _____________________________________________________
- 11.1. ARP ___________________________________________________________
- 11.2. Itens da ARP ____________________________________________________
- 11.3. Consultar Unidades do Item ______________________________________
- 11.4. Consultar Empenhos e Saldo do Item ______________________________
- 11.5. Consultar Adesões do Item _______________________________________
- 12. Módulo Contratos _________________________________________________
- 12.1. Contratos _______________________________________________________
- 12.2. Itens de contrato _______________________________________________
- 13. Módulo Fornecedor ______________________________________________
- 13.1. Consultar Fornecedor ___________________________________________
- 14. Módulo OCDS (Open Contracting Data Standard) ____________________
- 14.1. Releases ______________________________________________________


**Voltar ao sumário**

# Histórico de Versões

## DATA VERSÃO DESCRIÇÃO

## 01 /2026 2.

## Módulo ARP (Principal Mudança): Correção dos

## parâmetros de vigência (adoção de intervalos

## Min/Max) e inclusão de três novos endpoints

## para consulta de unidades participantes,

## empenhos e adesões ("caronas").

## Novos Filtros: Inclusão do parâmetro

## pertence14133 no módulo Legado (para filtrar a

## Nova Lei de Licitações) e do filtro

## orgaoEntidadeCnpj no módulo Contratações.

## Limpeza de Parâmetros: Remoção de campos

## inexistentes na implementação técnica do

## módulo Catálogo de Material (ex: statusPdm) e

## simplificação da documentação de relatórios

## CSV em Pesquisa de Preço.

## 04/2025 1.

## Versão original


**Voltar ao sumário**

# 1. Introdução

## O Sistema Integrado de Administração de Serviços Gerais – Siasg,

## instituído pelo art. 7º do Decreto nº 1.094, de 23 de março de 1994, é o sistema

## informatizado de apoio às atividades operacionais do Sistema de Serviços

## Gerais – Sisg. A finalidade do Siasg é integrar os órgãos da Administração

## Pública Federal direta, autárquica e fundacional. Após a reestruturação do Sisg

## (nova releitura), o SIASG passa a receber o sistema de contratações do

## governo federal, Compras.gov.br. O novo Compras.gov.br é composto por

## diversos módulos responsáveis pela operacionalização de cada uma das várias

## etapas da cadeia da contratação pública: Sicaf, PGC, ETP Digital, Matriz de

## risco, Catálogo, Divulgação de compras, Sala de disputa, Contratos,

## AntecipaGov, Doações GOV.BR.

## O ecossistema Compras.gov.br deverá ser um sistema único e

## integrado, permitindo a operacionalização e controle de diversas etapas ao

## longo do ciclo de vida da compra pública. Será possível aos servidores

## públicos, gestores de governo, fornecedores, órgãos de controle e cidadãos

## interagirem entre si no sistema, e com o sistema, extraindo, dele, seu objetivo

## final.

## Dessa forma, o Compras.gov.br ganha relevância estratégica, passando

## a ser visto como um instrumento de apoio, transparência e controle na

## execução das atividades do Sisg, por meio da informatização e

## operacionalização do conjunto de suas atividades, bem como no

## gerenciamento de todos os seus processos.

# 2. Objetivos

## A transparência desempenha um papel fundamental na gestão pública,

## permitindo maior controle social e aprimorando a eficiência dos processos

## governamentais.

## A disponibilização de dados como um serviço governamental beneficia

## toda a sociedade, incluindo o próprio governo. O Ministério da Gestão e da


**Voltar ao sumário**

## Inovação em Serviços Públicos está otimizando recursos ao publicar essas

## informações na internet, tornando-as acessíveis e reutilizáveis.

## Além disso, a abertura dos dados de Compras Governamentais é um

## compromisso assumido pelo governo brasileiro na Parceria para Governo Aberto

## (Open Government Partnership - OGP). Esse compromisso reforça a transparência

## dos gastos públicos, fornece informações de valor agregado à sociedade e

## incentiva a pesquisa e a inovação tecnológica por meio da implementação da

## Política Brasileira de Dados Abertos.

# 3. Outros tópicos relevantes

## O acesso aos dados é feito através de URLs, o protocolo de

## comunicação utilizado é o REST - Representational State Transfer/ HTTP 1.1 e

## os dados trafegados utilizam a notação JSON - JavaScript Object Notation.

## Em cada consulta é possível especificar uma série de parâmetros de

## filtro, que devem compor a URL. Você (ser humano ou máquina) pode navegar

## através de todos os recursos apenas utilizando os links disponíveis. O acesso à

## API é realizado através do seguinte endereço: Swagger UI - Dados Abertos

## Compras


**Voltar ao sumário**

# 4. Módulo Material

## O Catálogo de Materiais (CATMAT) e o Catálogo de Serviços (CATSER), do

## Sistema Integrado de Administração e Serviços Gerais – SIASG, são as bases de

## dados que identificam todos os materiais licitados e adquiridos e todos os

## serviços licitados contratados pela Administração Pública Federal. Todas as

## operações realizadas por meio do SIASG/Compras Governamentais utilizam

## esses catálogos para definir os objetos das respectivas licitações e contratações.

## A organização dos dados nos catálogos tem impacto direto na qualidade da

## informação proveniente do SIASG e no cruzamento de informações sobre o gasto

## público.

## Ferramenta de auxiliar: https://catalogo.compras.gov.br/cnbs-web/busca

## 4.1. Grupo

## Serviço que permite consultar os dados de um grupo de material pelo código

## do grupo de material e/ou status do grupo.

```
Endpoint Método
HTTP
https://dadosabertos.compras.gov.br/modulo--
material/1_consultarGrupoMaterial?pagina={valor}/{parametro1=valor1}&{parametr
oN=valorN}
```
### GET

```
Exemplo Requisição (cURL)
curl -X 'GET' \
'https://dadosabertos.compras.gov.br/modulo-material/1_consultarGrupoMaterial' \
```
- H 'accept: */*'

## Parâmetros da solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a paginação dos
resultados, permite ao usuário
navegar entre as páginas de
resultados
```
```
codigoGrupo Inteiro Não Código do grupo do material
```

**Voltar ao sumário**

```
statusGrupo Booleano Não Status do grupo
0 - False/Inativo
1 - True/Ativo
```
Dados de Retorno

```
Campo tipo Descrição
```
```
codigoGrupo Texto Código do grupo do material
```
```
nomeGrupo Texto Nome do grupo do material
```
```
statusGrupo Booleano Status do grupo
0 - False/Inativo
1 - True/Ativo
```
```
dataHoraAtualizacao Data Data de atualização do registro
```
Exemplo de Retorno
{
"resultado": [
{
"codigoGrupo": 0,
"nomeGrupo": "string",
"statusGrupo": true,
"dataHoraAtualizacao": "2023-09-05T13:44:08.584Z"
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0
}

4.2. Classe

```
Serviço que permite consultar os dados de uma classe de material pelo código
do grupo de material, código da classe e/ou status do grupo.
```
```
Endpoint Método
HTTP
https://dadosabertos.compras.gov.br/modulo-
material/2_consultarClasseMaterial?pagina={valor}/{parametro1=valor1}&{paramet
roN=valorN}
```
### GET


**Voltar ao sumário**

```
Exemplo Requisição (cURL)
curl -X 'GET' \
'https://dadosabertos.compras.gov.br/modulo-material/2_consultarClasseMaterial' \
```
- H 'accept: */*'

Parâmetros da solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a paginação dos
resultados, permite ao usuário
navegar entre as páginas de
resultados
```
```
codigoGrupo Inteiro Não Código do grupo do material
```
```
codigoClasse Inteiro Não Código da classe do material
```
```
statusClasse Booleano Não Status da Classe
0 - False/Inativo
1 - True/Ativo
```
```
bps Booleano Não Indica se a classe de material
está vinculada ao Banco de
Preços em Saúde (BPS) (Valor
padrão: false)
0 – False/Não
1 – True/Sim
```
Dados de Retorno

```
Campo tipo Descrição
```
```
codigoGrupo Texto Código do grupo do material
```
```
nomeGrupo Texto Nome do grupo do material
```
```
codigoClasse Inteiro Código da classe do material
```
```
nomeClasse Texto Nome da classe do material
```
```
statusClasse Booleano Status da Classe
```

**Voltar ao sumário**

```
0 - False/Inativo
1 - True/Ativo
```
```
dataHoraAtualizacao Data Data de atualização do registro
```
Exemplo de Retorno
{
"resultado": [
{
"codigoGrupo": 0,
"nomeGrupo": "string",
"codigoClasse": 0,
"nomeClasse": "string",
"statusClasse": true,
"dataHoraAtualizacao": "2023-09-06T11:56:08.499Z"
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0
}

4.3. Produto Descritivo Básico – PDM

```
Serviço que permite consultar os dados de um Produto Descritivo Básico -
PDM de material pelo código de PDM, código do grupo de material, código da
classe e/ou status do PDM.
```
```
Endpoint Método
HTTP
https://dadosabertos.compras.gov.br/modulo-
material/3_consultarPdmMaterial?pagina={valor}/{parametro1=valor1}&{parametro
N=valorN}
```
### GET

```
Exemplo Requisição (cURL)
curl -X 'GET' \
'https://dadosabertos.compras.gov.br/modulo-material/3_consultarPdmMaterial' \
-H 'accept: */*'
```

**Voltar ao sumário**

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a paginação dos
resultados, permite ao usuário
navegar entre as páginas de
resultados
```
```
codigoPdm Inteiro Não Código do produto descritivo
básico - PDM
```
```
codigoGrupo Inteiro Não Código do grupo
```
```
codigoClasse Inteiro Não Código da classe
```
```
statusPdm Booleano Não Status do PDM
0 - False/Inativo
1 - True/Ativo
```
```
bps Booleano Não Indica se o PDM está
relacionado ao Banco de Preços
em Saúde (BPS) (Valor padrão:
false)
0 – False/Não
1 – True/Sim
```
Dados de Retorno

```
Campo tipo Descrição
```
```
codigoGrupo Texto Código do Grupo
```
```
nomeGrupo Texto Nome do Grupo
```
```
codigoClasse Inteiro Código da classe
```
```
nomeClasse Texto Nome da classe
```
```
codigoPdm Inteiro Código do PDM
```
```
nomePdm Texto Nome do PDM
```
```
statusPdm Booleano Status do PDM
0 - False/Inativo
```

**Voltar ao sumário**

```
1 - True/Ativo
```
```
dataHoraAtualizacao Data Data de atualização do registro
```
Exemplo de Retorno
{
"resultado": [
{
"codigoGrupo": 0,
"nomeGrupo": "string",
"codigoClasse": 0,
"nomeClasse": "string",
"codigoPdm": 0,
"nomePdm": "string",
"statusPdm": true,
"dataHoraAtualizacao": "2023-09-06T17:23:09.075Z"
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0
}

4.4. Item

```
Serviço que permite consultar os dados de um item de material pelo código
do grupo de material, código da classe, código do PDM, código do item e/ou
status do grupo.
```
```
Endpoint Método
HTTP
https://dadosabertos.compras.gov.br/modulo-
material/4_consultarItemMaterial?pagina={valor}/{parametro1=valor1}&{parametro
N=valorN}
```
### GET

```
Exemplo Requisição (cURL)
curl -X 'GET' \
'https://dadosabertos.compras.gov.br/modulo-material/4_consultarItemMaterial' \
-H 'accept: */*'
```

**Voltar ao sumário**

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a paginação dos
resultados, permite ao usuário
navegar entre as páginas de
resultados
```
```
tamanhoPagina Inteiro Não Ajustar o tamanho de registros
por página (limite máx. de 500
registros por página)
```
```
codigoItem Inteiro Não Código do item do material
```
```
codigoGrupo Inteiro Não Código do grupo do material
```
```
codigoClasse Inteiro Não Código da classe do material
```
```
codigoPdm Inteiro Não Código do produto descritivo
básico - PDM
```
```
descricaoItem Texto Não Descrição do item
```
```
statusItem Booleano Não Status do item
0 - False/Inativo
1 - True/Ativo
```
```
bps Booleano Não Indica se o item está
relacionado ao Banco de
Preços em Saúde (BPS) (Valor
padrão: false)
0 – False/Não
1 – True/Sim
```
```
codigo_ncm Texto Não Código de NCM -
Nomenclatura Comum do
Mercosul
```
Dados de Retorno

```
Campo tipo Descrição
```
```
codigoGrupo Inteiro Código do Grupo
```

**Voltar ao sumário**

```
nomeGrupo Texto Nome do Grupo
```
```
codigoClasse Inteiro Código da classe
```
```
nomeClasse Texto Nome da classe
```
```
codigoPdm Inteiro Código do PDM
```
```
nomePdm Texto Nome do PDM
```
```
codigoItem Inteiro Código do item
```
```
descricaoItem Texto Descrição do item
```
```
statusItem Booleano Status do item
0 - False/Inativo
1 - True/Ativo
```
```
itemSustentavel Booleano Indica se o item é sustentável
0 - False/não
1 - True/sim
```
```
codigo_ncm Texto Código de NCM - Nomenclatura Comum do
Mercosul
```
```
descricao_ncm Texto Descrição do NCM
```
```
aplica_margem_preferencia Booleano Indica se o item aplica margem de preferência
0 - False/Não, 1 - True/Sim
```
```
dataHoraAtualizacao Data Data de atualização do registro
```
Exemplo de Retorno
{
"resultado": [
{
"codigoGrupo": 0,
"nomeGrupo": "string",
"codigoClasse": 0,
"nomeClasse": "string",
"codigoPdm": 0,
"nomePdm": "string",
"codigoItem": 0,
"descricaoItem": "string",
"statusItem": true,
"itemSustentavel": true,


**Voltar ao sumário**

```
"codigo_ncm": "string",
"descricao_ncm": "string",
"aplica_margem_preferencia": true,
"dataHoraAtualizacao": "2025-02-06T17:24:15.719Z"
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0
}
```
4.5. Natureza da Despesa

```
Serviço que permite consultar os dados de uma natureza de material pelo
código do PDM e/ou código da natureza de despesa.
```
```
Endpoint Método
HTTP
https://dadosabertos.compras.gov.br/modulo-
material/5_consultarMaterialNaturezaDespesa?pagina={valor}/{parametro1=valor
}&{parametroN=valorN}
```
### GET

```
Exemplo Requisição (cURL)
curl -X 'GET' \
'https://dadosabertos.compras.gov.br/modulo-
material/5_consultarMaterialNaturezaDespesa' \
```
- H 'accept: */*'

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a paginação dos
resultados, permite ao
usuário navegar entre as
páginas de resultados
```
```
codigoPdm Inteiro Não Código do produto
descritivo básico - PDM
```
```
codigoNaturezaDespesa Texto Não Não obrigatório: Código da
natureza de despesa
```

**Voltar ao sumário**

```
statusNaturezaDespesa Booelano Não Não obrigatório: Status da
natureza de despesa
0 - False/Inativo
1 - True/Ativo
```
Dados de Retorno

```
Campo tipo Descrição
```
```
codigoPdm Inteiro Código do PDM
```
```
codigoNaturezaDespesa Texto Código da natureza de despesa
```
```
nomeNaturezaDespesa Texto Descrição da natureza de despesa
```
```
statusNaturezaDespesa Booleano Status da natureza de despesa
0 - False/Inativo
1 - True/Ativo
```
Exemplo de Retorno
{
"resultado": [
{
"codigoPdm": 0,
"codigoNaturezaDespesa": "string",
"nomeNaturezaDespesa": "string",
"statusNaturezaDespesa": true
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0
}

4.6. Unidade de Fornecimento

```
Serviço que permite consultar os dados de unidade de fornecimento de
material pelo código do PDM.
```
```
Endpoint Método
HTTP
https://dadosabertos.compras.gov.br/modulo-
material/6_consultarMaterialUnidadeFornecimento?pagina={valor}/{parametro1=
valor1}&{parametroN=valorN}
```
### GET


**Voltar ao sumário**

```
Exemplo Requisição (cURL)
curl -X 'GET' \
'https://dadosabertos.compras.gov.br/modulo-
material/6_consultarMaterialUnidadeFornecimento' \
```
- H 'accept: */*'

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a paginação
dos resultados,
permite ao usuário
navegar entre as
páginas de resultados
```
```
codigoPdm Inteiro Não Código do produto
descritivo básico -
PDM
```
```
statusUnidadeFornecimentoPdm Booelano Não Não obrigatório: Status
da unidade de
fornecimento do PDM
0 - False/Inativo
1 - True/Ativo
```
Dados de Retorno

```
Campo tipo Descrição
```
```
codigoPdm Inteiro Código do PDM
```
```
siglaUnidadeFornecimento Texto Sigla da unidade de fornecimento
```
```
nomeUnidadeFornecimento Texto Nome da unidade de fornecimento
```
```
descricaoUnidadeFornecimento Texto Descrição da unidade de fornecimento
```
```
siglaUnidadeMedida Texto Sigla da unidade de medida
```
```
capacidadeUnidadeFornecimento Inteiro Capaciade da unidade de
fornecimento
```

**Voltar ao sumário**

```
numeroSequencialUnidadeFornecimento Inteiro N° sequencial da unidade de
fornecimento
```
```
statusUnidadeFornecimentoPdm Booleano Status da unidade de fornecimento do
PDM
0 - False/Inativo
1 - True/Ativo
```
```
dataHoraAtualizacao Data Data da atualização
```
Exemplo de Retorno
{
"resultado": [
{
"codigoPdm": 0,
"siglaUnidadeFornecimento": "string",
"nomeUnidadeFornecimento": "string",
"descricaoUnidadeFornecimento": "string",
"siglaUnidadeMedida": "string",
"capacidadeUnidadeFornecimento": 0,
"numeroSequencialUnidadeFornecimento": 0,
"statusUnidadeFornecimentoPdm": true,
"dataHoraAtualizacao": "2025-02-11T19:47:09.470Z"
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0
}

4.7. Características

```
Serviço que permite consultar os dados de características de material pelo
código do PDM do item.
```
```
Endpoint Método
HTTP
https://dadosabertos.compras.gov.br/modulo-
material/7_consultarMaterialCaracteristicas?pagina={valor}/{parametro1=valor1}&{
parametroN=valorN}
```
### GET

```
Exemplo Requisição (cURL)
```

**Voltar ao sumário**

```
curl -X 'GET' \
'https://dadosabertos.compras.gov.br/modulo-material/7_consultarMaterialCaracteristicas' \
```
- H 'accept: */*'

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a paginação
dos resultados, permite
ao usuário navegar
entre as páginas de
resultados
```
```
codigoItem Inteiro Não Código do item do
material.
```
Dados de Retorno

```
Campo tipo Descrição
```
```
codigoItem Inteiro Código do item
```
```
itemSustentavel Booleano Indica se o item é sustentável
0 - False/não
1 - True/sim
```
```
statusItem Booleano Status do item
0 - False/Inativo
1 - True/Ativo
```
```
codigoCaracteristica Texto Código da característica
```
```
nomeCaracteristica Texto Nome da característica
```
```
statusCaracteristica Booleano Status da característica
0 - False/Inativo
1 - True/Ativo
```
```
codigoValorCaracteristica Texto Código do valor da característica
```
```
nomeValorCaracteristica Texto Nome do valor da característica
```
```
statusValorCaracteristica Booleano Status do valor da característica
```

**Voltar ao sumário**

```
0 - False/Inativo
1 - True/Ativo
```
```
numeroCaracteristica Inteiro Número sequencial da característica
```
```
siglaUnidadeMedida Texto Sigla da unidade de medida
```
```
dataHoraAtualizacao Data Data da atualização
```
## Exemplo de Retorno

```
{
"resultado": [
{
"codigoItem": 0,
"itemSustentavel": true,
"statusItem": true,
"codigoCaracteristica": "string",
"nomeCaracteristica": "string",
"statusCaracteristica": true,
"codigoValorCaracteristica": "string",
"nomeValorCaracteristica": "string",
"statusValorCaracteristica": true,
"numeroCaracteristica": 0,
"siglaUnidadeMedida": "string",
"dataHoraAtualizacao": "2025-02-12T18:44:01.627Z"
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0
}
```
# 5. Módulo Serviço

## O Catálogo de Materiais (CATMAT) e o Catálogo de Serviços (CATSER), do

## Sistema Integrado de Administração e Serviços Gerais – SIASG, são as bases de

## dados que identificam todos os materiais licitados e adquiridos e todos os

## serviços licitados contratados pela Administração Pública Federal. Todas as

## operações realizadas por meio do SIASG/Compras Governamentais utilizam

## esses catálogos para definir os objetos das respectivas licitações e contratações.

## A organização dos dados nos catálogos tem impacto direto na qualidade da

## informação proveniente do SIASG e no cruzamento de informações sobre o gasto

## público.


**Voltar ao sumário**

Ferramenta de auxiliar: https://catalogo.compras.gov.br/cnbs-

web/busca

5.1. Seção

```
Serviço que permite consultar os dados de uma seção de serviço pelo código
da seção e/ou status da seção.
```
```
Endpoint Método
HTTP
https://dadosabertos.compras.gov.br/modulo-
servico/1_consultarSecaoServico?pagina={valor}/{parametro1=valor1}&{parametro
N=valorN}
```
### GET

```
Exemplo Requisição (cURL)
curl -X 'GET' \
'https://dadosabertos.compras.gov.br/modulo-servico/1_consultarSecaoServico' \
-H 'accept: */*'
```
Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a paginação
dos resultados, permite
ao usuário navegar
entre as páginas de
resultados
```
```
codigoSecao Inteiro Não Código do item do
material.
```
```
statusSecao Booleano Não Status da seção
0 - False/Inativo
1 - True/Ativo
```
Dados de Retorno

```
Campo tipo Descrição
```
```
codigoSecao Inteiro Código da seção
```

**Voltar ao sumário**

```
nomeSecao Booleano Nome da seção
```
```
statusSecao Booleano Status da seção
0 - False/Inativo
1 - True/Ativo
```
```
dataHoraAtualizacao Data Data da atualização
```
Exemplo de Retorno
{
"resultado": [
{
"codigoSecao": 0,
"nomeSecao": "string",
"statusSecao": true,
"dataHoraAtualizacao": "2025-02-12T18:59:08.128Z"
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0
}

5.2. Divisão

```
Serviço que permite consultar os dados de uma divisão de serviço pelo código
da seção, da divisão e/ou status da divisão.
```
```
Endpoint Método
HTTP
```
```
https://dadosabertos.compras.gov.br/modulo-
servico/2_consultarDivisaoServico?pagina={valor}/{parametro1=valor1}&{parametr
oN=valorN}
```
### GET

```
Exemplo Requisição (cURL)
curl -X 'GET' \
'https://dadosabertos.compras.gov.br/modulo-servico/2_consultarDivisaoServico' \
-H 'accept: */*'
```

**Voltar ao sumário**

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a paginação
dos resultados, permite
ao usuário navegar
entre as páginas de
resultados
```
```
codigoSecao Inteiro Não Código de seção do
serviço
```
```
codigoDivisao Inteiro Não Código de divisão do
serviço
```
```
statusDivisao Booleano Não Status da divisão do
serviço
0 - False/Inativo
1 - True/Ativo
```
Dados de Retorno

```
Campo tipo Descrição
```
```
codigoSecao Inteiro Código da seção
```
```
nomeSecao Texto Nome da seção
```
```
codigoDivisao Inteiro Código da divisão
```
```
nomeDivisao Texto Nome da divisão
```
```
statusDivisao Booleano Status da divisão
0 - False/Inativo
1 - True/Ativo
```
```
dataHoraAtualizacao Data Data da atualização
```
Exemplo de Retorno
{
"resultado": [
{
"codigoSecao": 0,
"nomeSecao": "string",


**Voltar ao sumário**

```
"codigoDivisao": 0,
"nomeDivisao": "string",
"statusDivisao": true,
"dataHoraAtualizacao": "2025-02-12T19:24:36.065Z"
}
],
"totalRegistros": 0,
"totalPaginas": 0,
" paginasRestantes": 0
}
```
5.3. Grupo

```
Serviço que permite consultar os dados de um grupo de serviço pelo código
da divisão, do grupo e/ou status do grupo.
```
```
Endpoint Método
HTTP
```
```
https://dadosabertos.compras.gov.br/modulo-
servico/3_consultarGrupoServico?pagina={valor}/{parametro1=valor1}&{pa
rametroN=valorN}
```
```
GET
```
```
Exemplo Requisição (cURL)
```
```
curl -X 'GET' \
```
```
'https://dadosabertos.compras.gov.br/modulo-servico/3_consultarGrupoServico' \
```
- H 'accept: */*'

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a
paginação dos
resultados, permite
ao usuário navegar
entre as páginas de
resultados
```

**Voltar ao sumário**

```
codigoDivisao Inteiro Não Código de divisão do
serviço
```
```
codigoGrupo Inteiro Código de grupo do
serviço
statusGrupo Booleano Status de grupo do
serviço
0 - False/Inativo
1 - True/Ativo
```
Dados de Retorno

```
Campo tipo Descrição
```
```
nomeSecao Texto Nome da seção
```
```
codigoDivisao Inteiro Código da divisão
```
```
nomeDivisao Texto Nome da divisão
```
```
codigoGrupo Inteiro Código do grupo
```
```
nomeGrupo Texto Nome do grupo
```
```
statusDivisao Booleano Status da divisão
0 - False/Inativo
1 - True/Ativo
```
```
dataHoraAtualizacao Data Data da atualização
```
Exemplo de Retorno
{
"resultado": [
{
"nomeSecao": "string",
"codigoDivisao": 0,
"nomeDivisao": "string",
"codigoGrupo": 0,
"nomeGrupo": "string",
"statusGrupo": true,
"dataHoraAtualizacao": "2025-02-12T19:45:33.301Z"
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0


**Voltar ao sumário**

```
}
```
5.4. Classe

```
Serviço que permite consultar os dados de uma classe de serviço pelo código
do grupo, da classe e/ou status da classe.
```
```
Endpoint Método
HTTP
```
```
https://dadosabertos.compras.gov.br/modulo-
servico/4_consultarClasseServico?pagina={valor}/{parametro1=valor1}&{pa
rametroN=valorN}
```
```
GET
```
```
Exemplo Requisição (cURL)
```
```
curl -X 'GET' \
```
```
'https://dadosabertos.compras.gov.br/modulo-servico/4_consultarClasseServico' \
```
- H 'accept: */*'

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a
paginação dos
resultados, permite
ao usuário navegar
entre as páginas de
resultados
```
```
codigoGrupo Inteiro Não Código de grupo do
serviço
codigoClasse Inteiro Não Código de classe do
serviço
statusGrupo Booleano Não Status de grupo do
serviço
0 - False/Inativo
1 - True/Ativo
```

**Voltar ao sumário**

Dados de Retorno

```
Campo tipo Descrição
```
```
codigoGrupo Inteiro Código do grupo
```
```
nomeGrupo Texto Nome do grupo
```
```
codigoClasse Inteiro Código da classe
```
```
nomeClasse Texto Nome da classe
```
```
statusGrupo Booleano Status do grupo
0 - False/Inativo
1 - True/Ativo
```
```
dataHoraAtualizacao Data Data da atualização
```
Exemplo de Retorno
{
"resultado": [
{
"codigoGrupo": 0,
"nomeGrupo": "string",
"codigoClasse": 0,
"nomeClasse": "string",
"statusGrupo": true,
"dataHoraAtualizacao": "2025-02-12T19:54:04.861Z"
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0
}

5.5. Subclasse

```
Serviço que permite consultar os dados de uma subclasse de serviço pelo
código da classe, da subclasse e/ou status da subclasse.
```
```
Endpoint Método
HTTP
```

**Voltar ao sumário**

```
https://dadosabertos.compras.gov.br/modulo-
servico/5_consultarSubClasseServico?pagina={valor}/{parametro1=valor1}
&{parametroN=valorN}
```
```
GET
```
```
Exemplo Requisição (cURL)
```
```
curl -X 'GET' \
```
```
'https://dadosabertos.compras.gov.br/modulo-
servico/5_consultarSubClasseServico' \
```
- H 'accept: */*'

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a
paginação dos
resultados, permite
ao usuário navegar
entre as páginas de
resultados
```
```
codigoClasse Inteiro Não Código de classe do
serviço
codigoSubclasse Inteiro Não Código de subclasse
do serviço
statusSubclasse Booleano Não Status de subclasse
do serviço
0 - False/Inativo
1 - True/Ativo
```
Dados de Retorno

```
Campo tipo Descrição
```
```
codigoClasse Inteiro Código da classe
```
```
nomeClasse Texto Nome da classe
```
```
codigoSubclasse Inteiro Código da subclasse
```
```
nomeSubclasse Texto Nome da subclasse
```

**Voltar ao sumário**

```
statusSubclasse Booleano Status da subclasse
0 - False/Inativo
1 - True/Ativo
```
```
dataHoraAtualizacao Data Data da atualização
```
Exemplo de Retorno
{
"resultado": [
{
"codigoClasse": 0,
"nomeClasse": "string",
"codigoSubclasse": 0,
"nomeSubclasse": "string",
"statusSubclasse": true,
"dataHoraAtualizacao": "2025-02-12T20:38:01.676Z"
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0
}

5.6. Item

```
Serviço que permite consultar os dados de um item de serviço pelo código da
subclasse, do cpc, do serviço do e/ou status do serviço.
```
```
Endpoint Método
HTTP
```
```
https://dadosabertos.compras.gov.br/modulo-
servico/6_consultarItemServico?pagina={valor}/{parametro1=valor1}&{para
metroN=valorN}
```
```
GET
```
```
Exemplo Requisição (cURL)
```
```
curl -X 'GET' \
```
```
'https://dadosabertos.compras.gov.br/modulo-servico/6_consultarItemServico' \
```
- H 'accept: */*'


**Voltar ao sumário**

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a
paginação dos
resultados, permite
ao usuário navegar
entre as páginas de
resultados
```
```
tamanhoPagina Inteiro Ajustar o tamanho de
registros por página
(limite máx. de 500
registros por página)
codigoSecao Inteiro Código de seção do
serviço
codigoDivisao Inteiro Código de divisão do
serviço
codigoGrupo Inteiro Código de grupo do
serviço
codigoClasse Inteiro Não Código de classe do
serviço
codigoSubclasse Inteiro Não Código de subclasse
do serviço
codigoCpc Inteiro Código de SCP
codigoServico Inteiro Código de serviço
exclusivoCentralCompras Booleano Indica se o serviço é
exclusivo da central
de compras
0 - False/Inativo
1 - True/Ativo
statusServico Booleano Não Status do serviço
0 - False/Inativo
1 - True/Ativo
```
Dados de Retorno

```
Campo tipo Descrição
```
```
codigoSecao Inteiro Código da seção
```

**Voltar ao sumário**

```
nomeSecao Texto Nome da seção
```
```
codigoDivisao Inteiro Código da divisão
```
```
nomeDivisao Texto Nome da divisão
```
```
codigoGrupo Inteiro Código do grupo
```
```
nomeGrupo Texto Nome do grupo
```
```
codigoClasse Inteiro Código da classe
```
```
nomeClasse Texto Nome da classe
```
```
codigoSubclasse Inteiro Código da subclasse
```
```
nomeSubclasse Texto Nome da subclasse
```
```
codigoServico Inteiro Código do serviço
```
```
nomeServico Texto Nome do serviço
```
```
codigoCpc Inteiro Código CPC é formado dígitos
posicionais para representar SEÇÃO,
DIVISÃO, GRUPO, CLASSE, SUB-CLASSE
E SERVIÇO da Estrutura de Classificação
do CPC. Cada item da estrutura pode ter
valores de 1 a 9, exceto o SERVIÇO que
tem 2 (duas) posições e seus valores vão
de 00 a 99. Desta forma, o 1° dígito
representa a SEÇÃO, o 2º a DIVISÃO, o 3º
o GRUPO, o 4º a CLASSE, o 5º a SUB-
CLASSE e o 6º e 7º SERVIÇO.
```
```
exclusivoCentralCompras Booleano Indica se o serviço é exclusivo da central
de compras
0 - False/Inativo
1 - True/Ativo
```
```
statusServico Booleano Status do serviço
0 - False/Inativo
1 - True/Ativo
```
```
dataHoraAtualizacao Data Data da atualização
```

**Voltar ao sumário**

Exemplo de Retorno
{
"resultado": [
{
"codigoSecao": 0,
"nomeSecao": "string",
"codigoDivisao": 0,
"nomeDivisao": "string",
"codigoGrupo": 0,
"nomeGrupo": "string",
"codigoClasse": 0,
"nomeClasse": "string",
"codigoSubclasse": 0,
"nomeSubclasse": "string",
"codigoServico": 0,
"nomeServico": "string",
"codigoCpc": 0,
"exclusivoCentralCompras": true,
"statusServico": true,
"dataHoraAtualizacao": "2025-02-12T20:53:56.427Z"
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0
}

5.7. Unidade de Medida

```
Serviço que permite consultar os dados de unidade de medida pelo código do
serviço e/ou status da unidade e medida.
```
```
Endpoint Método
HTTP
```
```
https://dadosabertos.compras.gov.br/modulo-
servico/7_consultarUndMedidaServico?pagina={valor}/{parametro1=valor1
}&{parametroN=valorN}
```
```
GET
```
```
Exemplo Requisição (cURL)
```
```
curl -X 'GET' \
```
```
'https://dadosabertos.compras.gov.br/modulo-
servico/7_consultarUndMedidaServico' \
```

**Voltar ao sumário**

- H 'accept: */*'

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a
paginação dos
resultados, permite
ao usuário navegar
entre as páginas de
resultados
```
```
codigoServico Inteiro Não Código de serviço
statusUnidadeMedida Booleano Não Status da unidade de
medida de serviço
0 - False/Inativo
1 - True/Ativo
```
Dados de Retorno

```
Campo tipo Descrição
```
```
codigoServico Inteiro Código de serviço
```
```
siglaUnidadeMedida Texto Sigla da unidade de medida
```
```
nomeUnidadeMedida Texto Nome da unidade de medida
```
```
statusUnidadeMedida Booleano Status da unidade de medida
0 - False/Inativo
1 - True/Ativo
```
Exemplo de Retorno
{
"resultado": [
{
"codigoServico": 0,
"siglaUnidadeMedida": "string",
"nomeUnidadeMedida": "string",
"statusUnidadeMedida": true
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0


**Voltar ao sumário**

```
}
```
5.8. Natureza da Despesa

```
Serviço que permite consultar os dados de natureza de despesa pelo código
do serviço, da natureza de despesa e/ou status da natureza de despesa.
```
```
Endpoint Método
HTTP
```
```
https://dadosabertos.compras.gov.br/modulo-
servico/8_consultarNaturezaDespesaServico?pagina={valor}/{parametro1
=valor1}&{parametroN=valorN}
```
```
GET
```
```
Exemplo Requisição (cURL)
```
```
curl -X 'GET' \
```
```
'https://dadosabertos.compras.gov.br/modulo-
servico/8_consultarNaturezaDespesaServico' \
```
- H 'accept: */*'

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a
paginação dos
resultados, permite
ao usuário navegar
entre as páginas de
resultados
```
```
codigoServico Inteiro Não Código de serviço
codigoNaturezaDespesa Texto Não Código da natureza
de despesa do
serviço
statusNaturezaDespesa Booleano Não Status da natureza de
despesa do serviço
0 - False/Inativo
1 - True/Ativo
```

**Voltar ao sumário**

## Dados de Retorno

```
Campo tipo Descrição
```
```
codigoServico Inteiro Código de serviço
```
```
codigoNaturezaDespesa Texto Código da natureza de despesa
```
```
nomeNaturezaDespesa Texto Nome da natureza de despesa
```
```
statusNaturezaDespesa Booleano Status da natureza de despesa
0 - False/Inativo
1 - True/Ativo
```
## Exemplo de Retorno

```
{
"resultado": [
{
"codigoServico": 0,
"codigoNaturezaDespesa": "string",
"nomeNaturezaDespesa": "string",
"statusNaturezaDespesa": true
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0
}
```
# 6. Módulo P esquisa de Preço

## O serviço de consulta permite acesso aos dados e informações de itens

## comprados por meio da Administração, o qual tem como objetivo auxiliar os

## órgãos governamentais na etapa de pesquisa de preços, que é um passo crucial

## no planejamento de compras e contratações públicas.

## 6.1. Material

## Serviço que permite consultar os dados de preços praticados na aquisição de

## materiais pelo sistema Compras.gov.br.


**Voltar ao sumário**

```
Endpoint Método
HTTP
```
```
https://dadosabertos.compras.gov.br/modulo-pesquisa-
preco/1_consultarMaterial?pagina={valor}/{parametro1=valor1}&{parametr
oN=valorN}
```
```
GET
```
```
Exemplo Requisição (cURL)
```
```
curl -X 'GET' \
```
```
'https://dadosabertos.compras.gov.br/modulo-pesquisa-preco/1_consultarMaterial’
\
```
- H 'accept: */*'

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a
paginação dos
resultados, permite
ao usuário navegar
entre as páginas de
resultados
```
```
tamanhoPagina Inteiro Não Ajustar o tamanho de
registros por página
(limite máx. de 500
registros por página).
codigoItemCatalogo Inteiro Sim Código do item do
material
codigoUasg Texto Não Código identificador
da UASG (Unidade
Administrativa de
Serviços Gerais)
estado Texto Não Sigla do estado
codigoMunicipio Inteiro Não Código do município
dataResultado Booleano Não Data do resultado
0 - False/Inativo
1 - True/Ativo
codigoClasse Inteiro Não Código da classe
```

**Voltar ao sumário**

Dados de Retorno

```
Campo tipo Descrição
```
```
idCompra Texto Código da compra
```
```
idItemCompra Inteiro Código do item da compra
```
```
forma Texto Adquirir bens e contratar serviços
seguindo o SISPP (preços praticados) ou
o SISRP (menor preço)
```
```
modalidade Inteiro Código da modalidade
```
```
criterioJulgamento Texto Código do critério de julgamento
```
```
numeroItemCompra Inteiro Número do item da compra
```
```
descricaoItem Texto Descrição do item
```
```
codigoItemCatalogo Inteiro Código do item do catálogo (material)
```
```
nomeUnidadeMedida Texto Nome da unidade de medida
```
```
siglaUnidadeMedida Texto Sigla da unidade de medida
```
```
nomeUnidadeFornecimento Texto Nome da unidade de fornecimento
```
```
siglaUnidadeFornecimento Texto Sigla da unidade de fornecimento
```
```
capacidadeUnidadeFornecimento Inteiro Capacidade de fornecimento
```
```
quantidade Inteiro Quantidade adquirida
```
```
precoUnitario Inteiro Valor unitário do item
```
```
percentualMaiorDesconto Inteiro Maior percentual de desconto aplicado
```
```
niFornecedor Texto Código do fornecedor
(CPF/CNPJ/Estrangeiro)
```
```
nomeFornecedor Texto Nome do fornecedor
```
```
marca Texto Marca do produto (caso exista)
```
```
codigoUasg Texto Código da UASG (Unidade
Administrativa de Serviços Gerais)
```
```
nomeUasg Texto Nome da UASG
```

**Voltar ao sumário**

```
codigoMunicipio Inteiro Código do município (IBGE)
```
```
municipio Texto Nome do município
```
```
estado Texto Unidade Federativa (UF)
```
```
codigoOrgao Inteiro Código do órgão responsável
```
```
nomeOrgao Texto Nome do órgão
```
```
poder Texto Poder da federação
E - Executivo
L - Legislativo
J - Judiciário
```
```
esfera Texto Esfera governamental
F - Federal
E - Estadual
M - Municipal
```
```
dataCompra Data Data da compra
```
```
dataHoraAtualizacaoCompra Data Data e hora da última atualização da
compra
```
```
dataHoraAtualizacaoItem Data Data da última atualização do item da
compra
```
```
dataResultado Data Data do resultado da compra
```
```
dataHoraAtualizacaoUasg Data Data e hora da última atualização da
UASG
```
Exemplo de Retorno
{
"resultado": [
{
"idCompra": "string",
"idItemCompra": 0,
"forma": "string",
"modalidade": 0,
"criterioJulgamento": "string",
"numeroItemCompra": 0,
"descricaoItem": "string",
"codigoItemCatalogo": 0,


**Voltar ao sumário**

```
"nomeUnidadeMedida": 0,
"siglaUnidadeMedida": "string",
"nomeUnidadeFornecimento": "string",
"siglaUnidadeFornecimento": "string",
"capacidadeUnidadeFornecimento": 0,
"quantidade": 0,
"precoUnitario": 0,
"percentualMaiorDesconto": 0,
"niFornecedor": "string",
"nomeFornecedor": "string",
"marca": "string",
"codigoUasg": "string",
"nomeUasg": "string",
"codigoMunicipio": 0,
"municipio": "string",
"estado": "string",
"codigoOrgao": 0,
"nomeOrgao": "string",
"poder": "string",
"esfera": "string",
"dataCompra": "2025-02-14T18:09:27.525Z",
"dataHoraAtualizacaoCompra": "2025-02-14T18:09:27.526Z",
"dataHoraAtualizacaoItem": "2025-02-14T18:09:27.526Z",
"dataResultado": "2025-02-14T18:09:27.526Z",
"dataHoraAtualizacaoUasg": "2025- 02 -14T18:09:27.526Z",
"codigoClasse": 0,
"nomeClasse": "string"
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0,
"dataHoraConsulta": "2025-02-14T18:09:27.526Z",
" timeZoneAtual": "string"
}
```
6.2. Detalhe do Material

Serviço que permite consultar os dados das descrições dos itens de materiais.

```
Endpoint Método
HTTP
```
```
https://dadosabertos.compras.gov.br/modulo-pesquisa-
preco/2_consultarMaterialDetalhe?pagina={valor}/{parametro1=valor1}&{p
arametroN=valorN}
```
```
GET
```

**Voltar ao sumário**

```
Exemplo Requisição (cURL)
```
```
curl -X 'GET' \
```
```
'https://dadosabertos.compras.gov.br/modulo-pesquisa-
preco/2_consultarMaterialDetalhe’ \
```
- H 'accept: */*'

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a
paginação dos
resultados, permite
ao usuário navegar
entre as páginas de
resultados
```
```
tamanhoPagina Inteiro Não Ajustar o tamanho de
registros por página
(limite máx. de 500
registros por página)
idCompra Texto Sim Código da compra
codigoItemCatalogo Inteiro Não Código do item do
material
```
Dados de Retorno

```
Campo tipo Descrição
```
```
idCompra Texto Código da compra
```
```
idItemCompra Inteiro Código do item da compra
```
```
numeroItemCompra Inteiro Número do item da compra
```
```
codigoItemCatalogo Inteiro Código do item no catálogo
```
```
objetoCompra Texto Descrição do objeto da compra
```
```
descricaoDetalhadaItem Texto Descrição detalhada do item
```
Exemplo de Retorno
{
"resultado": [


**Voltar ao sumário**

```
{
"idCompra": "string",
"idItemCompra": 0,
"forma": "string",
"modalidade": 0,
"criterioJulgamento": "string",
"numeroItemCompra": 0,
"descricaoItem": "string",
"codigoItemCatalogo": 0,
"nomeUnidadeMedida": "string",
"siglaUnidadeMedida": "string",
"quantidade": 0,
"precoUnitario": 0,
"percentualMaiorDesconto": 0,
"niFornecedor": "string",
"nomeFornecedor": "string",
"codigoUasg": "string",
"nomeUasg": "string",
"codigoMunicipio": 0,
"municipio": "string",
"estado": "string",
"codigoOrgao": 0,
"nomeOrgao": "string",
"poder": "string",
"esfera": "string",
"dataCompra": "2025-02-14T19:21:19.290Z",
"dataHoraAtualizacaoCompra": "2025-02-14T19:21:19.290Z",
"dataHoraAtualizacaoItem": "2025-02-14T19:21:19.290Z",
"dataResultado": "2025-02-14T19:21:19.290Z",
"dataHoraAtualizacaoUasg": "2025-02-14T19:21:19.290Z"
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0,
"dataHoraConsulta": "2025-02-14T19:21:19.290Z",
"timeZoneAtual": "string"
}
```
6.3. Serviço

```
Serviço que permite consultar os dados de preços praticados na contração de
serviços pelo sistema Compras.gov.br.
```
```
Endpoint Método
HTTP
```

**Voltar ao sumário**

```
https://dadosabertos.compras.gov.br/modulo-pesquisa-
preco/3_consultarServico?pagina={valor}/{parametro1=valor1}&{parametro
N=valorN}
```
```
GET
```
```
Exemplo Requisição (cURL)
```
```
curl -X 'GET' \
```
```
'https://dadosabertos.compras.gov.br/modulo-pesquisa-preco/3_consultarServico'
\
```
- H 'accept: */*'

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a
paginação dos
resultados, permite
ao usuário navegar
entre as páginas de
resultados
```
```
codigoItemCatalogo Inteiro Sim Código do item do
material
codigoUasg Texto Não Código identificador
da UASG (Unidade
Administrativa de
Serviços Gerais)
estado Texto Não Sigla do estado
codigoMunicipio Inteiro Não Código do município
dataResultado Booleano Não Data do resultado
0 - False/Inativo
1 - True/Ativo
```
Dados de Retorno

```
Campo tipo Descrição
```
```
idCompra Texto Código da compra
```
```
idItemCompra Inteiro Código do item da compra
```

**Voltar ao sumário**

```
forma Texto Adquirir bens e contratar serviços
seguindo o SISPP (preços praticados) ou
o SISRP (menor preço)
```
```
modalidade Inteiro Código da modalidade
```
```
criterioJulgamento Texto Código do critério de julgamento
```
```
numeroItemCompra Inteiro Número do item da compra
```
```
descricaoItem Texto Descrição do item
```
```
codigoItemCatalogo Inteiro Código do item no catálogo (serviço)
```
```
nomeUnidadeMedida Texto Nome da unidade de medida
```
```
siglaUnidadeMedida Texto Sigla da unidade de medida
```
```
quantidade Inteiro Quantidade adquirida
```
```
precoUnitario Texto Valor unitário do item
```
```
percentualMaiorDesconto Texto Maior percentual de desconto aplicado
```
```
niFornecedor Texto Código do fornecedor
(CPF/CNPJ/Estrangeiro)
```
```
nomeFornecedor Texto Nome do fornecedor
```
```
codigoUasg Texto Código da UASG (Unidade
Administrativa de Serviços Gerais)
```
```
nomeUasg Texto Nome da UASG
```
```
codigoMunicipio Inteiro Código do município (IBGE)
```
```
municipio Texto Nome do município
```
```
estado Texto Unidade Federativa (UF)
```
```
codigoOrgao Inteiro Código do órgão responsável
```
```
nomeOrgao Texto Nome do órgão
```
```
poder Texto Poder da federação
E - Executivo
L - Legislativo
```

**Voltar ao sumário**

```
J - Judiciário
```
```
esfera Texto Esfera governamental
U - União
E - Estado
M - Município
```
```
dataCompra Data Data da compra
```
```
dataHoraAtualizacaoCompra Data Data e hora da última atualização da
compra
```
```
dataHoraAtualizacaoItem Data Data da última atualização do item da
compra
```
```
dataResultado Data Data do resultado da compra
```
```
dataHoraAtualizacaoUasg Data Data e hora da última atualização da
UASG
```
Exemplo de Retorno
{
"resultado": [
{
"idCompra": "string",
"idItemCompra": 0,
"forma": "string",
"modalidade": 0,
"criterioJulgamento": "string",
"numeroItemCompra": 0,
"descricaoItem": "string",
"codigoItemCatalogo": 0,
"nomeUnidadeMedida": "string",
"siglaUnidadeMedida": "string",
"quantidade": 0,
"precoUnitario": 0,
"percentualMaiorDesconto": 0,
"niFornecedor": "string",
"nomeFornecedor": "string",
"codigoUasg": "string",
"nomeUasg": "string",
"codigoMunicipio": 0,
"municipio": "string",
"estado": "string",
"codigoOrgao": 0,
"nomeOrgao": "string",
"poder": "string",
"esfera": "string",


**Voltar ao sumário**

```
"dataCompra": "2025- 02 - 14T19:30:50.384Z",
"dataHoraAtualizacaoCompra": "2025- 02 -14T19:30:50.384Z",
"dataHoraAtualizacaoItem": "2025-02-14T19:30:50.384Z",
"dataResultado": "2025-02-14T19:30:50.384Z",
"dataHoraAtualizacaoUasg": "2025-02-14T19:30:50.384Z"
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0,
"dataHoraConsulta": "2025-02-14T19:30:50.384Z",
"timeZoneAtual": "string"
}
```
6.4. Detalhe do Serviço

Serviço que permite consultar os dados das descrições dos itens de serviços.

```
Endpoint Método
HTTP
```
```
https://dadosabertos.compras.gov.br/ modulo-pesquisa-
preco/4_consultarServicoDetalhe?pagina={valor}/{parametro1=valor1}&{pa
rametroN=valorN}
```
```
GET
```
```
Exemplo Requisição (cURL)
```
```
curl -X 'GET' \
```
```
'https://dadosabertos.compras.gov.br/modulo-pesquisa-
preco/4_consultarServicoDetalhe' \
```
- H 'accept: */*'

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a
paginação dos
resultados, permite
ao usuário navegar
entre as páginas de
resultados
```
```
idCompra Texto Sim Código da compra
```

**Voltar ao sumário**

```
codigoItemCatalogo Inteiro Não Código do item do
serviço
```
Dados de Retorno

```
Campo tipo Descrição
```
```
idCompra Texto Código da compra
```
```
idItemCompra Inteiro Código do item da compra
```
```
numeroItemCompra Inteiro Número do item da compra
```
```
codigoItemCatalogo Inteiro Código do item no catálogo
```
```
objetoCompra Texto Descrição do objeto da compra
```
```
descricaoDetalhadaItem Texto Descrição detalhada do item
```
Exemplo de Retorno
{
"resultado": [
{
"idCompra": "string",
"idItemCompra": 0,
"numeroItemCompra": 0,
"codigoItemCatalogo": 0,
"objetoCompra": "string",
"descricaoDetalhadaItem": "string"
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0,
"dataHoraConsulta": "2025-02-14T20:27:41.434Z",
"timeZoneAtual": "string"
}


**Voltar ao sumário**

# 7. Módulo PGC - Planejamento e Gerenciamento de

# Contratações

## O PGC, no contexto da administração pública brasileira, refere-se ao planejamento e

## gerenciamento de contratações. Esse plano é uma ferramenta estratégica utilizada por

## órgãos e entidades do governo para planejar, organizar e controlar suas contratações e

## aquisições. O objetivo do PGC é otimizar os processos de compras e contratações,

## garantindo maior eficiência, economicidade e transparência.

## 7.1. PGC Detalhe

## Serviço que permite consultar os dados dos itens do plano de contratação de

## um órgão.

```
Endpoint Método
HTTP
```
```
https://dadosabertos.compras.gov.br/modulo-
pgc/1_consultarPgcDetalhe?pagina={valor}/{parametro1=valor1}&{paramet
roN=valorN}
```
```
GET
```
```
Exemplo Requisição (cURL)
```
```
curl -X 'GET' \
```
```
'https://dadosabertos.compras.gov.br/modulo-pgc/1_consultarPgcDetalhe' \
```
- H 'accept: */*'

## Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a
paginação dos
resultados, permite
ao usuário navegar
entre as páginas de
resultados
```

**Voltar ao sumário**

```
tamanhoPagina Inteiro Não Ajustar o tamanho de
registros por página.
(Default value : 10).
orgao Texto Sim CNPJ do Órgão (sem
uso de máscara)
```
```
anoPcaProjetoCompra Inteiro Sim Ano do projeto
```
```
codigoUasg Texto Não Código da UASG
(unidade
administrativa da
contratação)
```
Dados de Retorno

```
Campo tipo Descrição
```
```
codigoUasg Texto Código da UASG
```
```
nomeUasg Texto Nome da UASG
```
```
orgao Texto CNPJ do órgão
```
```
numeroArtefato Inteiro Número do artefato digital
```
```
anoArtefato Inteiro Ano do artefato
```
```
codigoEstadoArtefato Inteiro Código do estado do artefato
```
```
codigoCategoriaArtefato Inteiro Código da categoria do artefato
```
```
descricaoArtefato Texto Descrição do artefato
```
```
codigoTipoArtefato Inteiro Código do tipo de artefato
```
```
ordemDfd Inteiro Ordem do DFD
```
```
descricaoObjetoDfd Texto Descrição do DFD
```
```
nivelPrioridadeDfd Inteiro Nível de prioridade do DFD
```
```
dataPrevistaFormalizacaoDemanda Data Data prevista para formalização da
demanda
```
```
codigoAreaDfd Texto Código da área do DFD
```

**Voltar ao sumário**

```
tipoItem Texto Indica o tipo do item
M - Material
S - Serviço
```
```
itemSustentavel Booleano Indica se o item é sustentável
0 - False/Não
1 - True/Sim
```
```
codigoGrupoMaterial Inteiro Código do grupo de material
```
```
nomeGrupoMaterial Texto Nome do grupo de material
```
```
codigoClasseMaterial Inteiro Código da classe do material
```
```
nomeClasseMaterial Texto Nome da classe do material
```
```
codigoPdmMaterial Inteiro Código do PDM do material
```
```
nomePdmMaterial Texto Nome do PDM do material
```
```
codigoSecaoServico Inteiro Código da seção do serviço
```
```
nomeSecaoServico Texto Nome da seção do serviço
```
```
codigoDivisaoServico Inteiro Código da divisão do serviço
```
```
nomeDivisaoServico Texto Nome da divisão do serviço
```
```
codigoGrupoServico Inteiro Código do grupo do serviço
```
```
nomeGrupoServico Texto Nome do grupo do serviço
```
```
codigoClasseServico Inteiro Código da classe do serviço
```
```
nomeClasseServico Texto Nome da classe do serviço
```
```
codigoSubclasseServico Inteiro Código da subclasse do serviço
```
```
nomeSubclasseServico Texto Nome da subclasse do serviço
```
```
codigoItemCatalogo Texto Código do item no catálogo
```
```
descricaoItemCatalogo Texto Descrição do item no catálogo
```
```
siglaUnidadeFornecimento Texto Sigla da unidade de fornecimento
```
```
nomeUnidadeFornecimento Texto Nome da unidade de fornecimento
```

**Voltar ao sumário**

```
quantidadeItem Inteiro Quantidade do item
```
```
valorUnitarioItem Inteiro Valor unitário do item
```
```
valorTotalItem Inteiro Valor total do item
```
```
tituloProjetoCompra Texto Título do projeto de compra
```
```
descricaoProjetoCompra Texto Descrição do projeto de compra
```
```
anoPcaProjetoCompra Inteiro Ano do projeto de compra
```
```
dataInicioProcessoCompra Data Data de início do processo de compra
```
```
dataFimProcessoCompra Data Data de fim do processo de compra
```
```
duracaoProcessoCompra Inteiro Duração do processo de compra (em
dias)
```
```
numeroItemPncp Inteiro Número do item divulgado no PNCP
```
```
statusContratacaoExecucao Booleano Status da contratação em execução
0 - False/Inativo
1 - True/Ativo
```
```
dataHoraPublicacaoPncp Data Data e hora da publicação no PNCP
```
```
dataHoraAtualizacaoArtefato Data Data e hora da atualização do artefato
```
```
dataHoraAtualizacaoProjetoCompra Data Data e hora da atualização do projeto
de compra
```
```
dataHoraAtualizacaoDfd Data Data e hora da atualização do DFD
```
```
dataHoraAtualizacaoItem Data Data e hora da atualização do item
```
Exemplo de Retorno
{
"resultado": [
{
"codigoUasg": "string",
"nomeUasg": "string",
"orgao": "string",
"numeroArtefato": 0,
"anoArtefato": 0,
"codigoEstadoArtefato": 0,
"codigoCategoriaArtefato": 0,


**Voltar ao sumário**

```
"descricaoArtefato": "string",
"codigoTipoArtefato": 0,
"ordemDfd": 0,
"descricaoObjetoDfd": "string",
"nivelPrioridadeDfd": 0,
"dataPrevistaFormalizacaoDemanda": "2025-02-14T20:45:41.858Z",
"codigoAreaDfd": "string",
"tipoItem": "string",
"itemSustentavel": true,
"codigoGrupoMaterial": 0,
"nomeGrupoMaterial": "string",
"codigoClasseMaterial": 0,
"nomeClasseMaterial": "string",
"codigoPdmMaterial": 0,
"nomePdmMaterial": "string",
"codigoSecaoServico": 0,
"nomeSecaoServico": "string",
"codigoDivisaoServico": 0,
"nomeDivisaoServico": "string",
"codigoGrupoServico": 0,
"nomeGrupoServico": "string",
"codigoClasseServico": 0,
"nomeClasseServico": "string",
"codigoSubclasseServico": 0,
"nomeSubclasseServico": "string",
"codigoItemCatalogo": "string",
"descricaoItemCatalogo": "string",
"siglaUnidadeFornecimento": "string",
"nomeUnidadeFornecimento": "string",
"quantidadeItem": 0,
"valorUnitarioItem": 0,
"valorTotalItem": 0,
"tituloProjetoCompra": "string",
"descricaoProjetoCompra": "string",
"anoPcaProjetoCompra": 0,
"dataInicioProcessoCompra": "2025-02-14T20:45:41.858Z",
"dataFimProcessoCompra": "2025-02-14T20:45:41.858Z",
"duracaoProcessoCompra": 0,
"numeroItemPncp": 0,
"statusContratacaoExecucao": 0,
"dataHoraPublicacaoPncp": "2025-02-14T20:45:41.858Z",
"dataHoraAtualizacaoArtefato": "2025-02-14T20:45:41.858Z",
"dataHoraAtualizacaoProjetoCompra": "2025-02-14T20:45:41.858Z",
"dataHoraAtualizacaoDfd": "2025-02-14T20:45:41.858Z",
"dataHoraAtualizacaoItem": "2025-02-14T20:45:41.858Z"
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0,
"dataHoraConsulta": "2025-02-14T20:45:41.858Z",
"timeZoneAtual": "string",
"obs": "string"
```

**Voltar ao sumário**

```
}
```
7.2. PGC Detalhe Catálogo

```
Serviço que permite consultar os dados de itens do planejamento da
contratação por código de catmat ou catser.
```
```
Endpoint Método
HTTP
```
```
https://dadosabertos.compras.gov.br/modulo-
pgc/2_consultarPgcDetalheCatalogo?pagina={valor}/{parametro1=valor1}
&{parametroN=valorN}
```
```
GET
```
```
Exemplo Requisição (cURL)
```
```
curl -X 'GET' \
```
```
'https://dadosabertos.compras.gov.br/modulo-
pgc/2_consultarPgcDetalheCatalogo' \
```
- H 'accept: */*'

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a paginação
dos resultados, permite
ao usuário navegar
entre as páginas de
resultados
```
```
tamanhoPagina Inteiro Não Ajustar o tamanho de
registros por página.
(Default value : 10)
anoPcaProjetoCompra Inteiro Sim Ano do projeto
tipo Texto Sim Tipo do item
M - Material
S - Serviço
codigo Inteiro Sim Código de classe para
material ou código do
grupo para serviço
```

**Voltar ao sumário**

Dados de Retorno

```
Campo tipo Descrição
```
```
codigoUasg Texto Código da UASG
```
```
nomeUasg Texto Nome da UASG
```
```
orgao Texto CNPJ do órgão
```
```
numeroArtefato Inteiro Número do artefato digital
```
```
anoArtefato Inteiro Ano do artefato
```
```
codigoEstadoArtefato Inteiro Código do estado do artefato
```
```
codigoCategoriaArtefato Inteiro Código da categoria do artefato
```
```
descricaoArtefato Texto Descrição do artefato
```
```
codigoTipoArtefato Inteiro Código do tipo de artefato
```
```
ordemDfd Inteiro Ordem do DFD
```
```
descricaoObjetoDfd Texto Descrição do DFD
```
```
nivelPrioridadeDfd Inteiro Nível de prioridade do DFD
```
```
dataPrevistaFormalizacaoDemanda Data Data prevista para formalização da
demanda
```
```
codigoAreaDfd Texto Código da área do DFD
```
```
tipoItem Texto Indica o tipo do item
M - Material
S - Serviço)
```
```
itemSustentavel Booleano Indica se o item é sustentável
0 - False/Não
1 - True/Sim
```
```
codigoGrupoMaterial Inteiro Código do grupo de material
```
```
nomeGrupoMaterial Texto Nome do grupo de material
```
```
codigoClasseMaterial Inteiro Código da classe do material
```
```
nomeClasseMaterial Texto Nome da classe do material
```

**Voltar ao sumário**

```
codigoPdmMaterial Inteiro Código do PDM do material
```
```
nomePdmMaterial Texto Nome do PDM do material
```
```
codigoSecaoServico Inteiro Código da seção do serviço
```
```
nomeSecaoServico Texto Nome da seção do serviço
```
```
codigoDivisaoServico Inteiro Código da divisão do serviço
```
```
nomeDivisaoServico Texto Nome da divisão do serviço
```
```
codigoGrupoServico Inteiro Código do grupo do serviço
```
```
nomeGrupoServico Texto Nome do grupo do serviço
```
```
codigoClasseServico Inteiro Código da classe do serviço
```
```
nomeClasseServico Texto Nome da classe do serviço
```
```
codigoSubclasseServico Inteiro Código da subclasse do serviço
```
```
nomeSubclasseServico Texto Nome da subclasse do serviço
```
```
codigoItemCatalogo Texto Código do item no catálogo
```
```
descricaoItemCatalogo Texto Descrição do item no catálogo
```
```
siglaUnidadeFornecimento Texto Sigla da unidade de fornecimento
```
```
nomeUnidadeFornecimento Texto Nome da unidade de fornecimento
```
```
quantidadeItem Inteiro Quantidade do item
```
```
valorUnitarioItem Inteiro Valor unitário do item
```
```
valorTotalItem Inteiro Valor total do item
```
```
tituloProjetoCompra Texto Título do projeto de compra
```
```
descricaoProjetoCompra Texto Descrição do projeto de compra
```
```
anoPcaProjetoCompra Inteiro Ano do projeto de compra
```
```
dataInicioProcessoCompra Data Data de início do processo de compra
```
```
dataFimProcessoCompra Data Data de fim do processo de compra
```
```
duracaoProcessoCompra Inteiro Duração do processo de compra
```

**Voltar ao sumário**

```
numeroItemPncp Inteiro Número do item divulgado no PNCP
```
```
statusContratacaoExecucao Booleano Status da contratação em execução
0 - False/Inativo
1 - True/Ativo
```
```
dataHoraPublicacaoPncp Data Data de publicação no PNCP
```
```
dataHoraAtualizacaoArtefato Data Data de atualização do artefato
```
```
dataHoraAtualizacaoProjetoCompra Data Data de atualização do projeto de
compra
```
```
dataHoraAtualizacaoDfd Data Data de atualização do DFD
```
```
dataHoraAtualizacaoItem Data Data de atualização do item
```
Exemplo de Retorno
{
"resultado": [
{
"codigoUasg": "string",
"nomeUasg": "string",
"orgao": "string",
"numeroArtefato": 0,
"anoArtefato": 0,
"codigoEstadoArtefato": 0,
"codigoCategoriaArtefato": 0,
"descricaoArtefato": "string",
"codigoTipoArtefato": 0,
"ordemDfd": 0,
"descricaoObjetoDfd": "string",
"nivelPrioridadeDfd": 0,
"dataPrevistaFormalizacaoDemanda": "2025-02-17T14:17:20.696Z",
"codigoAreaDfd": "string",
"tipoItem": "string",
"itemSustentavel": true,
"codigoGrupoMaterial": 0,
"nomeGrupoMaterial": "string",
"codigoClasseMaterial": 0,
"nomeClasseMaterial": "string",
"codigoPdmMaterial": 0,
"nomePdmMaterial": "string",
"codigoSecaoServico": 0,
"nomeSecaoServico": "string",
"codigoDivisaoServico": 0,
"nomeDivisaoServico": "string",
"codigoGrupoServico": 0,


**Voltar ao sumário**

```
"nomeGrupoServico": "string",
"codigoClasseServico": 0,
"nomeClasseServico": "string",
"codigoSubclasseServico": 0,
"nomeSubclasseServico": "string",
"codigoItemCatalogo": "string",
"descricaoItemCatalogo": "string",
"siglaUnidadeFornecimento": "string",
"nomeUnidadeFornecimento": "string",
"quantidadeItem": 0,
"valorUnitarioItem": 0,
"valorTotalItem": 0,
"tituloProjetoCompra": "string",
"descricaoProjetoCompra": "string",
"anoPcaProjetoCompra": 0,
"dataInicioProcessoCompra": "2025-02-17T14:17:20.696Z",
"dataFimProcessoCompra": "2025-02-17T14:17:20.696Z",
"duracaoProcessoCompra": 0,
"numeroItemPncp": 0,
"statusContratacaoExecucao": 0,
"dataHoraPublicacaoPncp": "2025-02-17T14:17:20.696Z",
"dataHoraAtualizacaoArtefato": "2025-02-17T14:17:20.696Z",
"dataHoraAtualizacaoProjetoCompra": "2025-02-17T14:17:20.696Z",
"dataHoraAtualizacaoDfd": "2025-02-17T14:17:20.696Z",
"dataHoraAtualizacaoItem": "2025-02-17T14:17:20.696Z"
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0,
"dataHoraConsulta": "2025-02-17T14:17:20.696Z",
"timeZoneAtual": "string",
"obs": "string"
}
```
7.3. PGC Agregação

```
Serviço que permite consultar os dados de quantidade total de um item e
valor total planejado do plano de contratação de um órgão.
```
```
Endpoint Método
HTTP
```
```
https://dadosabertos.compras.gov.br/modulo-
pgc/3_consultarPgcAgregacao?pagina={valor}/{parametro1=valor1}&{para
metroN=valorN}
```
```
GET
```
```
Exemplo Requisição (cURL)
```

**Voltar ao sumário**

```
curl -X 'GET' \
```
```
'https://dadosabertos.compras.gov.br/modulo-pgc/3_consultarPgcAgregacao' \
```
- H 'accept: */*'

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a
paginação dos
resultados, permite
ao usuário navegar
entre as páginas de
resultados
```
```
orgao Texto Sim CNPJ do Órgão (sem
uso de máscara)
ano Inteiro Sim Ano do plano (YYYY)
```
Dados de Retorno

```
Campo tipo Descrição
```
```
orgao Texto CNPJ do órgão
```
```
ano Inteiro Ano do plano
```
```
poder Texto Poder ao qual o órgão pertence
F - Federal
E - Estadual
D - Distrital
M - Municipal
```
```
esfera Texto Esfera governamental
E - Executivo
L - Legislativo
J - Judiciário
```

**Voltar ao sumário**

```
dataHoraPublicacaoPncp Data Data e hora da publicação no PNCP
```
```
dataHoraAtualizacao Data Data e hora da última atualização
```
```
quantidadeTotalItens Inteiro Quantidade total de itens do plano de
compras
```
```
valorTotalEstimado Inteiro Valor total estimado para as compras
planejadas
```
## Exemplo de Retorno

```
{
"resultado": [
{
"orgao": "string",
"ano": 0,
"poder": "string",
"esfera": "string",
"dataHoraPublicacaoPncp": "2025-02-17T18:20:45.048Z",
"dataHoraAtualizacao": "2025-02-17T18:20:45.048Z",
"quantidadeTotalItens": 0,
"valorTotalEstimado": 0
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0,
"dataHoraConsulta": "2025-02-17T18:20:45.048Z",
"timeZoneAtual": "string",
"obs": "string"
}
```
# 8. Módulo UASG - Unidade Administrativa de Serviços

# Gerais

## UASG é a sigla para Unidade Administrativa de Serviços Gerais, uma

## denominação utilizada no contexto do SISG, que é o Sistema Integrado de

## Serviços Gerais. As UASGs são, portanto, unidades operacionais dentro de

## diversos órgãos e entidades do governo federal que executam atividades de

## serviços gerais. Estas atividades incluem, entre outras coisas, a contratação de

## serviços, aquisições de materiais, gestão de contratos, administração de

## patrimônio e outras funções de suporte administrativo.


**Voltar ao sumário**

8.1. UASG

Serviço que permite consultar dados de uma Uasg.

```
Endpoint e Exemplo Método
HTTP
```
```
https://dadosabertos.compras.gov.br/modulo-
uasg/1_consultarUasg?pagina={valor}/{parametro1=valor1}&{parametroN=v
alorN}
```
```
GET
```
```
https://dadosabertos.compras.gov.br/modulo-
uasg/1_consultarUasg?pagina=1&codigoUasg=200005&statusUasg=true
```
```
GET
```
```
Exemplo Requisição (cURL)
```
```
curl -X 'GET' \
```
```
'https://dadosabertos.compras.gov.br/modulo-uasg/1_consultarUasg ' \
```
- H 'accept: */*'

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a paginação
dos resultados, permite
ao usuário navegar
entre as páginas de
resultados
```
```
codigoUasg Texto Não Código da UASG
(unidade administrativa
da contratação)
usoSisg Booleano Não Uso do SISG
0 - False
1 - True
cnpjCpfOrgao Texto Não CNPJ do órgão (sem
uso de máscara)
```
```
cnpjCpfOrgaoVinculado Texto Não CNPJ do órgão
vinculado (sem uso de
máscara)
cnpjCpfOrgaoSuperior Texto Não CNPJ do órgão superior
(sem uso de máscara)
```

**Voltar ao sumário**

```
siglaUf Texto Não Sigla do estado (UF)
statusUasg Booleano Sim Status da Uasg.
0 - False/Inativo
1 - True/Ativo
```
Dados de Retorno

```
Campo tipo Descrição
```
```
codigoUasg Texto Código da UASG
```
```
nomeUasg Texto Nome da UASG
```
```
usoSisg Booleano Indica se a UASG utiliza o SISG
0 - False/Não
1 - True/Sim
```
```
adesaoSiasg Booleano Indica se a UASG aderiu ao SIASG
0 - Não
1 - Sim
```
```
siglaUf Texto Sigla da Unidade Federativa (UF)
```
```
codigoMunicipio Inteiro Código do município no SIASG
```
```
codigoMunicipioIbge Inteiro Código do município no IBGE
```
```
nomeMunicipioIbge Texto Nome do município conforme o IBGE
```
```
codigoUnidadePolo Inteiro Código da unidade polo
```
```
nomeUnidadePolo Texto Nome da unidade polo
```
```
codigoUnidadeEspelho Inteiro Código da unidade espelho
```
```
nomeUnidadeEspelho Texto Nome da unidade espelho
```
```
uasgCadastradora Booleano Indica se a UASG é cadastradora
0 - False/Não
1 - True/Sim
```
```
cnpjCpfUasg Texto CNPJ da UASG
```
```
codigoOrgao Inteiro Código do órgão
```

**Voltar ao sumário**

```
cnpjCpfOrgao Texto CNPJ do órgão
```
```
cnpjCpfOrgaoVinculado Texto CNPJ do órgão vinculado
```
```
cnpjCpfOrgaoSuperior Texto CNPJ do órgão superior
```
```
codigoSiorg Texto Código do SIORG
```
```
statusUasg Booleano Status da UASG
0 - False/Inativo
1 - True/Ativo
```
```
dataImplantacaoSidec Data Data de implantação no SIDEC
```
```
dataHoraMovimento Data Data e hora da última movimentação
```
Exemplo de Retorno

```
{
"resultado": [
{
"codigoUasg": "string",
"nomeUasg": "string",
"usoSisg": true,
"adesaoSiasg": true,
"siglaUf": "string",
"codigoMunicipio": 0,
"codigoMunicipioIbge": 0,
"nomeMunicipioIbge": "string",
"codigoUnidadePolo": 0,
"nomeUnidadePolo": "string",
"codigoUnidadeEspelho": 0,
"nomeUnidadeEspelho": "string",
"uasgCadastradora": true,
"cnpjCpfUasg": "string",
"codigoOrgao": 0,
"cnpjCpfOrgao": "string",
"cnpjCpfOrgaoVinculado": "string",
"cnpjCpfOrgaoSuperior": "string",
"codigoSiorg": "string",
"statusUasg": true,
"dataImplantacaoSidec": "2025-02-17T18:50:23.048Z",
"dataHoraMovimento": "2025-02-17T18:50:23.048Z"
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0
}
```

**Voltar ao sumário**

8.2. Órgão

Serviço que permite consultar os dados dos Órgãos pertencentes ao sistema

Compras.gov.br.

```
Endpoint Método
HTTP
```
```
https://dadosabertos.compras.gov.br/modulo-
uasg/2_consultarOrgao?pagina={valor}/{parametro1=valor1}&{parametroN
=valorN}
```
```
GET
```
```
Exemplo Requisição (cURL)
```
```
curl -X 'GET' \
```
```
'https://dadosabertos.compras.gov.br/modulo-uasg/2_consultarOrgao' \
```
- H 'accept: */*'

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a paginação
dos resultados, permite
ao usuário navegar
entre as páginas de
resultados
```
```
cnpjCpfOrgao Texto Não CNPJ do órgão (sem
uso de máscara)
```
```
cnpjCpfOrgaoVinculado Texto Não CNPJ do órgão
vinculado (sem uso de
máscara)
cnpjCpfOrgaoSuperior Texto Não CNPJ do órgão superior
(sem uso de máscara)
```
```
codigoOrgao Inteiro Não Código do órgão
statusOrgao Booleano Sim Status do órgão
0 - False/Inativo
1 - True/Ativo
```

**Voltar ao sumário**

```
usoSisg Booleano Não Uso do SISG
0 - False
1 - True
```
Dados de Retorno

```
Campo tipo Descrição
```
```
codigoOrgao Inteiro Código do órgão
```
```
nomeOrgao Texto Nome do órgão
```
```
nomeMnemonicoOrgao Texto Mnemonico do órgão
```
```
cnpjCpfOrgao Texto CNPJ do órgão
```
```
codigoOrgaoVinculado Inteiro Código do órgão vinculado
```
```
cnpjCpfOrgaoVinculado Texto CNPJ do órgão vinculado
```
```
nomeOrgaoVinculado Texto Nome do órgão vinculado
```
```
codigoOrgaoSuperior Inteiro Código do órgão superior
```
```
cnpjCpfOrgaoSuperior Texto CNPJ do órgão superior
```
```
nomeOrgaoSuperior Texto Nome do órgão superior
```
```
codigoTipoAdministracao Inteiro Código do tipo de administração do
órgão
```
```
nomeTipoAdministracao Texto Nome do tipo de administração do órgão
```
```
poder Texto Poder ao qual o órgão pertence
E - Executivo
L - Legislativo
J - Judiciário
```
```
esfera Texto Esfera governamental
F - Federal
E - Estadual
M - Municipal
```
```
usoSisg Booleano Indica se o órgão utiliza o SISG
0 - False/Não
```

**Voltar ao sumário**

```
1 - True/Sim
```
```
statusOrgao Booleano Status do órgão
0 - False/Inativo
1 - True/Ativo
```
```
dataHoraMovimento Data Data e hora da última movimentação do
órgão
```
## Exemplo de Retorno

```
{
"resultado": [
{
"codigoOrgao": 0,
"nomeOrgao": "string",
"nomeMnemonicoOrgao": "string",
"cnpjCpfOrgao": "string",
"codigoOrgaoVinculado": 0,
"cnpjCpfOrgaoVinculado": "string",
"nomeOrgaoVinculado": "string",
"codigoOrgaoSuperior": 0,
"cnpjCpfOrgaoSuperior": "string",
"nomeOrgaoSuperior": "string",
"codigoTipoAdministracao": 0,
"nomeTipoAdministracao": "string",
"poder": "string",
"esfera": "string",
"usoSisg": true,
"statusOrgao": true,
"dataHoraMovimento": "2025-02-17T19:16:57.547Z"
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0
}
```
# 9. Módulo Legado

## Possibilita a obtenção de dados sobre as licitações realizadas pelo Governo

## Federal de acordo com a Lei 8.666/93. Tradicionalmente, os dados das compras

## públicas podem ser encontrados no site:

## https://compras.dados.gov.br/docs/home.html. Por isso, o nome deste módulo


**Voltar ao sumário**

é "LEGADO", pois os métodos de consulta utilizam a mesma fonte de dados da

tradicional API de Compras.

9.1. Licitação

Possibilita a obtenção de dados sobre as Licitações realizadas pelo Governo

Federal.

```
Endpoint Método
HTTP
```
```
https://dadosabertos.compras.gov.br/modulo-
legado/1_consultarLicitacao?pagina={valor}/{parametro1=valor1}&{parame
troN=valorN}
```
```
GET
```
```
Exemplo Requisição (cURL)
```
```
curl -X 'GET' \
```
```
'https://dadosabertos.compras.gov.br/modulo-legado/1_consultarLicitacao' \
```
- H 'accept: */*'

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a paginação
dos resultados, permite
ao usuário navegar
entre as páginas de
resultados. (Default
value : 1)
```
```
tamanhoPagina Inteiro Não Ajustar o tamanho de
registros por página
(limite máx. de 500
registros por página)
(Default value : 10)
uasg Inteiro Não Código da UASG
(unidade administrativa
da contratação)
numero_aviso Inteiro Não Número da licitação
```

**Voltar ao sumário**

```
modalidade Inteiro Não Código da modalidade
de licitação
data_publicacao_inicial Texto Sim Data início da
publicação
```
```
data_publicacao_final Texto Sim Data final da publicação
(limitado a 365 dias)
```
```
pertence14133 Booleano Não Indica se a licitação
pertence ao regime da
Lei nº 14.133/2021.
0 - False
1 - True
```
Dados de Retorno

```
Campo tipo Descrição
```
```
id_compra Texto Código da Compra
```
```
identificador Texto Identificador da Compra
```
```
numero_processo Texto Número do processo
```
```
uasg Inteiro Código da UASG
```
```
modalidade Inteiro Código da modalidade da licitação
```
```
nome_modalidade Texto Nome da modalidade da licitação
```
```
numero_aviso Inteiro Número da licitação
```
```
situacao_aviso Texto Situação do aviso
```
```
tipo_pregao Texto Tipo do Pregão
```
```
tipo_recurso Texto Tipo do Recurso
```
```
nome_responsavel Texto Nome do responsável pela licitação
```
```
funcao_responsavel Texto Função do responsável pela licitação
```
```
numero_itens Inteiro Número de itens da licitação
```
```
valor_estimado_total Inteiro Valor total estimado da licitação
```
```
valor_homologado_total Inteiro Valor total homologado da licitação
```

**Voltar ao sumário**

```
informacoes_gerais Texto Informações gerais sobre a licitação
```
```
objeto Texto Objeto da licitação
```
```
endereco_entrega_edital Texto Endereço de entrega do edital
```
```
codigo_municipio_uasg Inteiro Código do município da UASG
```
```
data_abertura_proposta Data Data de abertura da proposta
```
```
data_entrega_edital Data Data de entrega do edital
```
```
data_entrega_proposta Data Data de entrega da proposta
```
```
data_publicacao Data Data da publicação da licitação
```
```
dt_alteracao Data Data da última alteração
```
Exemplo de Retorno
{
"resultado": [
{
"id_compra": "string",
"identificador": "string",
"numero_processo": "string",
"uasg": 0,
"modalidade": 0,
"nome_modalidade": "string",
"numero_aviso": 0,
"situacao_aviso": "string",
"tipo_pregao": "string",
"tipo_recurso": "string",
"nome_responsavel": "string",
"funcao_responsavel": "string",
"numero_itens": 0,
"valor_estimado_total": 0,
"valor_homologado_total": 0,
"informacoes_gerais": "string",
"objeto": "string",
"endereco_entrega_edital": "string",
"codigo_municipio_uasg": 0,
"data_abertura_proposta": "2025-02-17",
"data_entrega_edital": "2025-02-17",
"data_entrega_proposta": "2025-02-17",
"data_publicacao": "2025-02-17",
"dt_alteracao": "2025-02-17T20:41:07.960Z"
}
],
"totalRegistros": 0,


**Voltar ao sumário**

```
"totalPaginas": 0,
"paginasRestantes": 0
}
```
9.2. Itens de Licitações

Possibilita a obtenção de dados sobre os itens de licitações realizadas pelo

Governo Federal.

```
Endpoint Método
HTTP
```
```
https://dadosabertos.compras.gov.br/modulo-
legado/2_consultarItemLicitacao?pagina={valor}/{parametro1=valor1}&{par
ametroN=valorN}
```
```
GET
```
```
Exemplo Requisição (cURL)
```
```
curl -X 'GET' \
```
```
'https://dadosabertos.compras.gov.br/modulo-legado/2_consultarItemLicitacao' \
```
- H 'accept: */*'

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a paginação
dos resultados, permite
ao usuário navegar
entre as páginas de
resultados. (Default
value : 1)
```
```
tamanhoPagina Inteiro Não Ajustar o tamanho de
registros por página
(limite máx. de 500
registros por página)
(Default value : 10)
uasg Inteiro Não Código da UASG
(unidade administrativa
da contratação)
```

**Voltar ao sumário**

```
numero_aviso Inteiro Não Número da licitação
```
```
modalidade Inteiro Sim Código da modalidade
de licitação
decreto_7174 Não Decreto 7174
codigo_item_material Não Código do item -
Material
codigo_item_servico Não Código do item -
Serviço
cnpj_fornecedor Texto Não Número do CNPJ do
vencedor
```
```
cpfVencedor Texto Não Número do CPF do
vencedor
```
Dados de Retorno

```
Campo tipo Descrição
```
```
id_compra Texto Código da compra
```
```
id_compra_item Texto Identificador do item da compra
```
```
numero_licitacao Texto Identificador da licitação associada
```
```
numero_item_licitacao Inteiro Número do item de licitação
```
```
uasg Inteiro Código da UASG
```
```
criterio_julgamento Texto Critério de Julgamento
```
```
decreto_7174 Booleano Decreto 7174
False (0) - Inativo
True (1) - Ativo
```
```
codigo_item_material Inteiro Código do Material
```
```
nome_material Texto Nome do Material
```
```
codigo_item_servico Inteiro Código do Serviço
```
```
nome_servico Texto Nome do Serviço
```
```
descricao_item Texto Descrição do item
```

**Voltar ao sumário**

```
unidade Texto Unidade
```
```
quantidade Texto Quantidade de itens de licitação
```
```
valor_estimado Inteiro Valor estimado
```
```
sustentavel Booleano Indicador de sustentabilidade
False (0) - Não Sustentável
True (1) - Sustentável
```
```
cnpj_fornecedor Texto CNPJ Vencedor
```
```
cpfVencedor Texto CPF Vencedor
```
```
beneficio Texto Benefício
```
```
dt_alteracao Data Data de alteração
```
Exemplo de Retorno
{
"resultado": [
{
"id_compra": "string",
"id_compra_item": "string",
"numero_licitacao": "string",
"numero_item_licitacao": 0,
"uasg": 0,
"criterio_julgamento": "string",
"decreto_7174": true,
"codigo_item_material": 0,
"nome_material": "string",
"codigo_item_servico": 0,
"nome_servico": "string",
"descricao_item": "string",
"unidade": "string",
"quantidade": "string",
"valor_estimado": 0,
"sustentavel": true,
"cnpj_fornecedor": "string",
"cpfVencedor": "string",
"beneficio": "string",
"dt_alteracao": "2025-02-18T15:30:45.043Z"
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0
}


**Voltar ao sumário**

9.3. Pregão

```
Possibilita a obtenção de dados sobre os pregões realizados pelo Governo
Federal.
```
```
Endpoint Método
HTTP
```
```
https://dadosabertos.compras.gov.br/modulo-
legado/3_consultarPregoes?pagina={valor}/{parametro1=valor1}&{paramet
roN=valorN}
```
```
GET
```
```
Exemplo Requisição (cURL)
```
```
curl -X 'GET' \
```
```
'https://dadosabertos.compras.gov.br/modulo-legado/3_consultarPregoes ' \
```
- H 'accept: */*'

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a paginação
dos resultados, permite
ao usuário navegar
entre as páginas de
resultados. (Default
value : 1)
```
```
tamanhoPagina Inteiro Não Ajustar o tamanho de
registros por página
(limite máx. de 500
registros por página)
(Default value : 10)
co_uasg Inteiro^ Não^ Número da UASG que
registrou o aviso de
licitação
co_orgao Inteiro^ Não^ Número do orgão^
```
```
numero Inteiro^ Não^ Número do pregão^
ds_tipo_pregao_compra Texto^ Não^ Tipo de compra^
```

**Voltar ao sumário**

```
dt_data_edital_inicial Texto^ Sim^ Informa data incial de
disponibilização do
edital
dt_data_edital_final Texto^ Sim^ Informa data final de
disponibilização do
edital
pertence14133 Booleano^ Não^ Indica se a licitação
pertence ao regime da
Lei nº 14.133/2021.
0 - False
1 - True
```
Dados de Retorno

```
Campo tipo Descrição
```
```
id_compra Texto Código da compra
```
```
co_processo Texto Informa número do processo
```
```
co_portaria Texto Informa código da portaria
```
```
co_uasg Inteiro Número da UASG que registrou o aviso
de licitação
```
```
no_ausg Texto Nome da UASG
```
```
co_orgao Inteiro Código do órgão
```
```
no_orgao Texto Nome do órgão
```
```
numero Inteiro Número do pregão
```
```
ds_situacao_pregao Texto Informação da situação do pregão
```
```
ds_tipo_pregao Texto Tipo de pregão
```
```
ds_tipo_pregao_compra Texto Tipo de compra
```
```
tx_objeto Texto Descrição do objeto da licitação
```
```
valorEstimadoTotal Texto Valor estimado total
```
```
valorHomologadoTotal Texto Valor homologado total
```
```
dt_portaria Data Data da portaria
```

**Voltar ao sumário**

```
dt_data_edital Data Informa data de disponibilização do
edital
```
```
dt_inicio_proposta Data Informa data de início da proposta
```
```
dt_fim_proposta Data Informa data de fim da proposta
```
```
dt_alteracao Data Data de alteração
```
```
dt_encerramento Data Data de encerramento
```
```
dt_resultado Data Data do resultado
```
Exemplo de Retorno
{
"resultado": [
{
"id_compra": "string",
"co_processo": "string",
"co_portaria": "string",
"co_uasg": 0,
"no_ausg": "string",
"co_orgao": 0,
"no_orgao": "string",
"numero": 0,
"ds_situacao_pregao": "string",
"ds_tipo_pregao": "string",
"ds_tipo_pregao_compra": "string",
"tx_objeto": "string",
"valorEstimadoTotal": "string",
"valorHomologadoTotal": "string",
"dt_portaria": "2025-02-18T16:12:55.161Z",
"dt_data_edital": "2025-02-18",
"dt_inicio_proposta": "2025-02-18T16:12:55.161Z",
"dt_fim_proposta": "2025-02-18T16:12:55.161Z",
"dt_alteracao": "2025-02-18T16:12:55.161Z",
"dt_encerramento": "2025-02-18",
"dt_resultado": "2025-02-18"
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0
}


**Voltar ao sumário**

9.4. Itens de Pregões

```
Possibilita a obtenção de dados sobre os itens de pregões realizados pelo
Governo Federal.
```
```
Endpoint Método
HTTP
```
```
https://dadosabertos.compras.gov.br/modulo-
legado/4_consultarItensPregoes?pagina={valor}/{parametro1=valor1}&{par
ametroN=valorN}
```
```
GET
```
```
Exemplo Requisição (cURL)
```
```
curl -X 'GET' \
```
```
'https://dadosabertos.compras.gov.br/modulo-legado/4_consultarItensPregoes' \
```
- H 'accept: */*'

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a paginação
dos resultados, permite
ao usuário navegar
entre as páginas de
resultados. (Default
value : 1)
```
```
tamanhoPagina Inteiro Não Ajustar o tamanho de
registros por página
(limite máx. de 500
registros por página)
(Default value : 10)
co_uasg Inteiro^ Não^ Número da UASG que
registrou o aviso de
licitação
decreto_7174 Inteiro^ Não^ Decreto 7174^
```
```
fornecedor_vencedor Inteiro^ Não^ Nome do fornecedor
vencedor
dt_hom_inicial Texto^ Sim^ Data de homologação
inicial
```

**Voltar ao sumário**

```
dt_hom_final Texto^ Sim^ Data de homologação
final
```
Dados de Retorno

```
Campo tipo Descrição
```
```
id_compra Texto Código da Compra.
```
```
id_compra_item Texto Identificador do item da compra.
```
```
decreto_7174 Texto Decreto 7174
False (0) - Inativo
True (1) - Ativo.
```
```
situacao_item Texto Descrição da situação do item
```
```
descricao_item Texto Descrição do item
```
```
descricao_detalhada_item Texto Descrição complementar do item
```
```
margem_preferencial Texto Margem Preferencial
```
```
tratamento_diferenciado Texto Tratamento diferenciado
```
```
quantidade_item Texto Quantidade do item
```
```
unidade_fornecimento Texto Unidade de fornecimento
```
```
valor_estimado_item Texto Valor estimado do item
```
```
menor_lance Texto Valor do melhor lance
```
```
valor_negociado Texto Valor negociado do item
```
```
valorHomologadoItem Texto Valor homologado do item
```
```
fornecedor_vencedor Texto Nome do fornecedor vencedor
```
```
no_adjudic Texto Nome da adjudicação
```
```
no_hom Texto Nome da homologação
```
```
dt_encerramento Data Data de encerramento
```
```
dt_adjudic Data Data da adjudicação
```

**Voltar ao sumário**

```
dt_hom Data Data da homologação
```
```
dt_alteracao Data Data de alteração
```
Exemplo de Retorno
{
"resultado": [
{
"id_compra": "string",
"id_compra_item": "string",
"decreto_7174": "string",
"situacao_item": "string",
"descricao_item": "string",
"descricao_detalhada_item": "string",
"margem_preferencial": "string",
"tratamento_diferenciado": "string",
"quantidade_item": "string",
"unidade_fornecimento": "string",
"valor_estimado_item": "string",
"menor_lance": "string",
"valor_negociado": "string",
"valorHomologadoItem": "string",
"fornecedor_vencedor": "string",
"no_adjudic": "string",
"no_hom": "string",
"dt_encerramento": "2025-02-18",
"dt_adjudic": "2025-02-18",
"dt_hom": "2025-02-18",
"dt_alteracao": "2025-02-18T16:29:18.975Z"
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0
}

9.5. Compra sem Licitação

```
Possibilita a obtenção de dados sobre as compras sem licitação realizadas
pelo Governo Federal.
```
```
Endpoint Método
HTTP
```

**Voltar ao sumário**

```
https://dadosabertos.compras.gov.br/modulo-
legado/5_consultarComprasSemLicitacao?pagina={valor}/{parametro1=va
lor1}&{parametroN=valorN}
```
```
GET
```
```
Exemplo Requisição (cURL)
```
```
curl -X 'GET' \
```
```
'https://dadosabertos.compras.gov.br/modulo-
legado/5_consultarComprasSemLicitacao' \
```
- H 'accept: */*'

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a paginação
dos resultados, permite
ao usuário navegar
entre as páginas de
resultados. (Default
value : 1)
```
```
tamanhoPagina Inteiro Não Ajustar o tamanho de
registros por página
(limite máx. de 500
registros por página)
(Default value : 10)
dt_ano_aviso Inteiro^ Sim^ Ano da compra sem
licitação
nu_aviso_licitacao Inteiro^ Não^ Número da compra
correspondente a
compra sem licitação
co_modalidade_licitacao Inteiro^ Não^ Indica qual o tipo de
compra sem licitação
co_orgao Texto^ Não^ Órgão responsável pela
realização da compra
sem licitação
co_orgao_superior Texto^ Não^ Órgão Superior^
co_uasg Inteiro^ Não^ Número da UASG
responsável pela
compra sem licitação
dtDeclaracaoDispensaInicial Texto^ Não^ Data inicial referente ao
reconhecimento da
```

**Voltar ao sumário**

```
compra feita sem
licitação
dtDeclaracaoDispensaFinal Texto^ Não^ Data final referente ao
reconhecimento da
compra feita sem
licitação
dtRatificacao Texto^ Não^ Data referente à
ratificação da compra
feita sem licitação
dtPublicacao Texto^ Não^ Data referente à
publicação da compra
feita sem licitação
pertence14133 Booleano^ Não^ Indica se a licitação
pertence ao regime da
Lei nº 14.133/2021.
0 - False
1 - True
```
Dados de Retorno

```
Campo tipo Descrição
```
```
idCompra Texto Código da compra
```
```
co_orgao Texto Órgão responsável pela realização da
compra sem licitação
```
```
co_orgao_superior Texto Órgão Superior
```
```
co_uasg Inteiro Número da UASG responsável pela
compra sem licitação
```
```
no_ausg Texto Nome da UASG
```
```
co_modalidade_licitacao Inteiro Indica qual o tipo de compra sem
licitação
```
```
ds_lei Texto Lei que determina a aplicação da
modalidade escolhida para o objeto
pretendido
```
```
nu_processo Texto Número do processo correspondente à
forma de compra sem licitação
```
```
qt_total_item Inteiro Quantidade de itens da compra
realizada
```

**Voltar ao sumário**

```
vr_estimado Inteiro Valor total do quantitativo do item
```
```
nu_aviso_licitacao Inteiro Número da compra correspondente a
compra sem licitação
```
```
ds_objeto_licitacao Texto Descrição geral do objeto da compra
```
```
ds_fundamento_legal Texto Descrição geral do fundamento legal
para aquisição do objeto pretendido
```
```
ds_justificativa Texto Descrição geral da justificativa para
realização da compra sem licitação
```
```
no_responsavel_decl_disp Texto Nome do responsável pela declaração
de dispensa
```
```
no_cargo_resp_decl_disp Texto Cargo do responsável pela declaração
de dispensa
```
```
no_responsavel_ratificacao Texto Nome do responsável pela ratificação
```
```
no_cargo_resp_ratificacao Texto Cargo do responsável pela ratificação
```
```
dtDeclaracaoDispensa Data Data referente ao reconhecimento da
compra feita sem licitação
```
```
dtRatificacao Data Data referente à ratificação da compra
feita sem licitação
```
```
dtPublicacao Data Data referente à publicação da compra
feita sem licitação
```
```
dt_ano_aviso Inteiro Ano da compra sem licitação
```
```
dt_alteracao Data Data de alteração
```
Exemplo de Retorno
{
"resultado": [
{
"idCompra": "string",
"co_orgao": "string",
"co_orgao_superior": "string",
"co_uasg": 0,
"no_ausg": "string",
"co_modalidade_licitacao": 0,
"ds_lei": "string",
"nu_processo": "string",


**Voltar ao sumário**

```
"qt_total_item": 0,
"vr_estimado": 0,
"nu_aviso_licitacao": 0,
"ds_objeto_licitacao": "string",
"ds_fundamento_legal": "string",
"ds_justificativa": "string",
"no_responsavel_decl_disp": "string",
"no_cargo_resp_decl_disp": "string",
"no_responsavel_ratificacao": "string",
"no_cargo_resp_ratificacao": "string",
"dtDeclaracaoDispensa": "2025-02-18",
"dtRatificacao": "2025-02-18",
"dtPublicacao": "2025-02-18",
"dt_ano_aviso": 0,
"dt_alteracao": "2025-02-18"
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0
}
```
9.6. Itens de Compras sem Licitação

```
Possibilita a obtenção de dados sobre os itens de compra sem licitação
realizadas pelo Governo Federal.
```
```
Endpoint Método
HTTP
```
```
https://dadosabertos.compras.gov.br/modulo-
legado/6_consultarCompraItensSemLicitacao?pagina={valor}/{parametro
1=valor1}&{parametroN=valorN}
```
```
GET
```
```
Exemplo Requisição (cURL)
```
```
curl -X 'GET' \
```
```
'https://dadosabertos.compras.gov.br/modulo-
legado/6_consultarCompraItensSemLicitacao' \
```
- H 'accept: */*'

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```

**Voltar ao sumário**

```
pagina Inteiro Não Referente a paginação
dos resultados, permite
ao usuário navegar
entre as páginas de
resultados. (Default
value : 1)
```
```
tamanhoPagina Inteiro Não Ajustar o tamanho de
registros por página
(limite máx. de 500
registros por página)
(Default value : 10)
co_uasg Inteiro^ Não^ Número da UASG
responsável pela
compra sem licitação
co_orgao Texto^ Não^ Órgão responsável pela
realização da compra
sem licitação
dt_ano_aviso_licitacao Inteiro^ Sim^ Ano da compra sem
licitação
co_modalidade_licitacao Inteiro^ Não^ Indica qual o tipo de
compra sem licitação
co_conjunto_materiais Inteiro^ Não^ Código do item -^
Material
co_servico Inteiro^ Não^ Código do item -^
Serviço
nu_cpf_cnpj_fornecedor Texto^ Não^ Número do CNPJ/CPF
do fornecedor
```
Dados de Retorno

```
Campo tipo Descrição
```
```
idCompra Texto Código da compra
```
```
idCompraItem Texto Identificador do item da compra
```
```
co_uasg Inteiro Número da UASG responsável pela
compra
```
```
co_modalidade_licitacao Inteiro Código da modalidade da licitação
```
```
no_modalidade_licitacao Texto Nome da modalidade da licitação
```
```
nu_aviso_licitacao Inteiro Número do aviso de licitação
```
```
dt_ano_aviso_licitacao Inteiro Ano da licitação
```

**Voltar ao sumário**

```
nu_inciso Texto Número do inciso legal utilizado na
compra
```
```
nu_processo Texto Número do processo correspondente à
licitação
```
```
vr_estimado Inteiro Valor total estimado para a compra
```
```
qt_total_item Inteiro Quantidade total de itens na compra
```
```
ds_objeto_licitacao Texto Descrição geral do objeto da licitação
```
```
ds_fundamento_legal Texto Fundamento legal para realização da
compra
```
```
ds_justificativa Texto Justificativa para aquisição do objeto da
licitação
```
```
nu_cpf_resp_decl_disp Texto CPF do responsável pela declaração de
dispensa
```
```
nu_cpf_resp_ratificacao Texto CPF do responsável pela ratificação da
compra
```
```
nu_cpf_resp_publicacao Texto CPF do responsável pela publicação da
compra
```
```
no_responsavel_decl_disp Texto Nome do responsável pela declaração
de dispensa
```
```
no_cargo_resp_decl_disp Texto Cargo do responsável pela declaração
de dispensa
```
```
no_responsavel_ratificacao Texto Nome do responsável pela ratificação
```
```
no_cargo_resp_ratificacao Texto Cargo do responsável pela ratificação
```
```
nu_item_material Inteiro Número do item no material
```
```
in_material_servico Texto Indica se o item é material ou serviço
```
```
co_conjunto_materiais Inteiro Código do conjunto de materiais
```
```
no_conjunto_materiais Texto Nome do conjunto de materiais
```
```
co_servico Inteiro Código do serviço
```
```
no_servico Texto Nome do serviço
```

**Voltar ao sumário**

```
ds_detalhada Texto Descrição detalhada do item
```
```
qt_material_alt Inteiro Quantidade alternativa do
material/serviço
```
```
no_unidade_medida Texto Unidade de medida do item
```
```
vr_estimado_item Inteiro Valor estimado por item
```
```
ds_fabricante Texto Nome do fabricante do item
```
```
no_marca_material Texto Marca do material
```
```
in_tipo_fornecedor_vencedor Texto Tipo de fornecedor vencedor
```
```
nu_cnpj_vencedor Texto CNPJ do fornecedor vencedor
```
```
nu_cpf_vencedor Texto CPF do fornecedor vencedor
```
```
no_fornecedor_vencedor Texto Nome do fornecedor vencedor
```
```
dt_alteracao Data Data de última alteração do registro
```
Exemplo de Retorno
{
"resultado": [
{
"idCompra": "string",
"idCompraItem": "string",
"co_uasg": 0,
"co_modalidade_licitacao": 0,
"no_modalidade_licitacao": "string",
"nu_aviso_licitacao": 0,
"dt_ano_aviso_licitacao": 0,
"nu_inciso": "string",
"nu_processo": "string",
"vr_estimado": 0,
"qt_total_item": 0,
"ds_objeto_licitacao": "string",
"ds_fundamento_legal": "string",
"ds_justificativa": "string",
"nu_cpf_resp_decl_disp": "string",
"nu_cpf_resp_ratificacao": "string",
"nu_cpf_resp_publicacao": "string",
"no_responsavel_decl_disp": "string",
"no_cargo_resp_decl_disp": "string",
"no_responsavel_ratificacao": "string",
"no_cargo_resp_ratificacao": "string",
"nu_item_material": 0,


**Voltar ao sumário**

```
"in_material_servico": "string",
"co_conjunto_materiais": 0,
"no_conjunto_materiais": "string",
"co_servico": 0,
"no_servico": "string",
"ds_detalhada": "string",
"qt_material_alt": 0,
"no_unidade_medida": "string",
"vr_estimado_item": 0,
"ds_fabricante": "string",
"no_marca_material": "string",
"in_tipo_fornecedor_vencedor": "string",
"nu_cnpj_vencedor": "string",
"nu_cpf_vencedor": "string",
"no_fornecedor_vencedor": "string",
"dt_alteracao": "2025-02-18T18:38:19.360Z"
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0
}
```
9.7. RDC

```
Possibilita a obtenção de dados sobre licitações do tipo RDC realizadas pelo
Governo Federal.
```
```
Endpoint Método
HTTP
```
```
https://dadosabertos.compras.gov.br/modulo-
legado/7_consultarRdc?pagina={valor}/{parametro1=valor1}&{parametroN=
valorN}
```
```
GET
```
```
Exemplo Requisição (cURL)
```
```
curl -X 'GET' \
```
```
'https://dadosabertos.compras.gov.br/modulo-legado/7_consultarRdc ' \
```
- H 'accept: */*'

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```

**Voltar ao sumário**

```
pagina Inteiro Não Referente a paginação
dos resultados,
permite ao usuário
navegar entre as
páginas de resultados.
(Default value : 1)
```
```
tamanhoPagina Inteiro Não Ajustar o tamanho de
registros por página
(limite máx. de 500
registros por página)
(Default value : 10)
data_publicacao_max Texto^ Sim^ Data máxima da
publicação da licitação
```
```
data_publicacao_min Texto^ Sim^ Data mínima da
publicação da licitação
```
```
endereco_entrega_edital Texto^ Não^ Endereço de entrega
do edital
forma_de_realizacao Texto^ Não^ Presencial ou
Eletrônico
funcao_responsavel Texto^ Não^ Função do
Responsável pela
Licitação
modalidade Inteiro^ Não^ Código da Modalidade
da Licitação
nome_responsavel Texto^ Não^ Nome do Responsável
pela Licitação
numero_aviso Inteiro^ Não^ Número do Aviso da
Licitação
objeto Texto^ Não^ Objeto da Licitação^
orgao Inteiro^ Não^ Órgão ao qual
pertence a UASG da
licitação
situacao_aviso Texto^ Não^ Situação do aviso^
uasg Inteiro^ Não^ Código da UASG^
uf_uasg Texto^ Não^ Unidade Federativa da
UASG
valor_estimado_total_max Decimal^ Não^ Valor máximo da soma
dos valores estimados
dos itens da licitação
valor_estimado_total_min Decimal^ Não^ Valor mínimo da soma
dos valores estimados
dos itens da licitação
```

**Voltar ao sumário**

```
valor_homologado_total_max Decimal^ Não^ Valor máximo da soma
dos valores
homologados dos itens
da licitação
valor_homologado_total_min Decimal^ Não^ Valor mínimo da soma
dos valores
homologados dos itens
da licitação.
```
Dados de Retorno

```
Campo tipo Descrição
```
```
data_abertura_proposta Data Data de abertura da proposta
```
```
data_entrega_edital Data Data de entrega do edital
```
```
data_entrega_proposta Data Data de entrega da proposta
```
```
data_publicacao Data Data da publicação da licitação
```
```
endereco_entrega_edital Texto Endereço de entrega do edital
```
```
forma_de_realizacao_licitacao Texto Presencial ou Eletrônico
```
```
funcao_responsavel Texto Função do responsável pela licitação
```
```
identificador Texto Identificador da licitação
```
```
informacoes_gerais Texto Informações gerais sobre a licitação
```
```
modalidade Inteiro Código da modalidade da licitação
```
```
nome_responsavel Texto Nome do responsável pela licitação
```
```
numero_aviso Inteiro Número do aviso da licitação
```
```
numero_itens Inteiro Número de itens
```
```
numero_processo Texto Número do processo
```
```
objeto Texto Objeto da licitação
```
```
situacao_aviso Texto Situação do aviso
```
```
tipo_recurso Texto Tipo do recurso
```
```
uasg Inteiro Código da UASG
```

**Voltar ao sumário**

```
orgao_uasg Inteiro Órgão da UASG
```
```
uf_uasg Texto Unidade Federativa da UASG
```
## Exemplo de Retorno

```
{
"resultado": [
{
"data_abertura_proposta": "2025-02-18T19:12:22.643Z",
"data_entrega_edital": "2025-02-18T19:12:22.643Z",
"data_entrega_proposta": "2025-02-18T19:12:22.643Z",
"data_publicacao": "2025-02-18",
"endereco_entrega_edital": "string",
"forma_de_realizacao_licitacao": "string",
"funcao_responsavel": "string",
"identificador": "string",
"informacoes_gerais": "string",
"modalidade": 0,
"nome_responsavel": "string",
"numero_aviso": 0,
"numero_itens": 0,
"numero_processo": "string",
"objeto": "string",
"situacao_aviso": "string",
"tipo_recurso": "string",
"uasg": 0,
"orgao_uasg": 0,
"uf_uasg": "string"
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0
}
```
# 10. Módulo Contratações

## O Módulo Contratações oferece acesso a informações detalhadas sobre os

## procedimentos de contratação realizados pelos órgãos públicos, garantindo

## transparência e conformidade com a legislação vigente, incluindo a Lei nº

## 14.133/2021. Os dados disponíveis abrangem desde a abertura do processo de

## contratação até a divulgação dos resultados de cada item, permitindo um

## acompanhamento preciso das aquisições governamentais.


**Voltar ao sumário**

10.1. Indicadores de Modalidade da Compra

Cada procedimento de contratação pode ser classificado conforme a sua

modalidade, seguindo os códigos abaixo:

- **01** -CONVITE;
- **02** -TOMADA DE PREÇOS;
- **03** -CONCORRÊNCIA;
- **04** -CONCORRÊNCIA INTERNACIONAL;
- **05** -PREGÃO;
- **06** -DISPENSA DE LICITAÇÃO;
- **07** -INEXIGIBILIDADE DE LICITAÇÃO;
- **12** -CREDENCIAMENTO
- **20** -CONCURSO;
- **22** - TOMADA DE PREÇOS POR TÉCNICA E PREÇO;
- **33** - CONCORRÊNCIA POR TÉCNICA E PREÇO;
- **44** - CONCORRÊNCIA INTERNACIONAL POR TÉCNICA E PREÇO;
- **57** -CONVÊNIO

10.2. Modos de Disputa

O modo de disputa define a forma como os concorrentes competem em um

certame público. Os principais modos são:

- **1** - ABERTO
- **2** - FECHADO
- **3** - ABERTO-FECHADO
- **4** - DISPENSA COM DISPUTA
- **5** - NÃO SE APLICA
- **6** - FECHADO-ABERTO

10.3. Critérios de Julgamento

Os critérios de julgamento estabelecem como a melhor proposta será escolhida,

podendo seguir as seguintes regras:

- **1** - MENOR PREÇO


**Voltar ao sumário**

- **2** - MAIOR DESCONTO
- **3** - MELHOR TÉCNICA OU CONTEÚDO ARTÍSTICO (INDISPONÍVEL)
- **4** - TÉCNICA E PREÇO
- **5** - MAIOR LANCE
- **6** - MAIOR RETORNO ECONÔMICO
- **7** - NÃO SE APLICA
- **8** - MELHOR TÉCNICA
- **9** - CONTEÚDO ARTÍSTICO

10.4. Amparos Legais

A legislação aplicável às contratações pode ser consultada através da

documentação oficial do **PNCP (Portal Nacional de Contratações Públicas)** :

**Documentação Oficial: PNCP - Item 5.15 Amparo Legal**

**Extração de Dados via JSON: API de Amparos Legais**

**Visualização via Web: PNCP - Entidades de Domínio**

10.5. Contratações PNCP 14133

Serviço que permite acessar informações detalhadas sobre contratações

realizadas com base na Lei 14.133/2021.

```
Endpoint Método
HTTP
```
```
https://dadosabertos.compras.gov.br/modulo-
contratacoes/1_consultarContratacoes_PNCP_14133?pagina={valor}/{para
metro1=valor1}&{parametroN=valorN}
```
```
GET
```
```
Exemplo Requisição (cURL)
```
```
curl -X 'GET' \
```
```
'https://dadosabertos.compras.gov.br/modulo-
contratacoes/1_consultarContratacoes_PNCP_14133' \
```
- H 'accept: */*'


**Voltar ao sumário**

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a paginação
dos resultados, permite
ao usuário navegar entre
as páginas de resultados.
(Default value : 1)
```
```
tamanhoPagina Inteiro Não Ajustar o tamanho de
registros por página
(limite máx. de 500
registros por página)
(Default value : 10)
unidadeOrgaoCodigoUnidade Texto^ Não^ Código da unidade do
órgão
```
```
codigoOrgao Inteiro^ Não^ Código do órgão^
```
```
orgaoEntidadeCnpj Texto^ Não^ Número do CNPJ da
entidade do órgão
dataPublicacaoPncpInicial Texto^ Sim^ Data inicial da publicação
no PNCP
dataPublicacaoPncpFinal Texto^ Sim^ Data final da publicação
no PNCP
codigoModalidade Inteiro^ Sim^ Código da modalidade
da licitação
unidadeOrgaoCodigoIbge Inteiro^ Não^ Código do IBGE da
unidade do órgão
unidadeOrgaoUfSigla Texto^ Não^ Sigla da unidade
federativa do órgão
dataAualizacaoPncp Texto^ Não^ Data de atualização no
PNCP
amparoLegalCodigoPncp Inteiro^ Não^ Código que indica o
amparo legal específico
no PNCP
contratacaoExcluida Booleano^ Não^ Indica se a contratação
foi
desconsiderada/excluída
0 – False/Não
1 – True/Sim
```
Dados de Retorno

```
Campo tipo Descrição
```

**Voltar ao sumário**

```
idCompra Texto Identificador único da compra
```
```
numeroControlePNCP Texto Número de controle no PNCP
```
```
anoCompraPncp Inteiro Ano da compra no PNCP
```
```
sequencialCompraPncp Inteiro Sequencial da compra no ano no
PNCP
```
```
orgaoEntidadeCnpj Texto CNPJ do órgão ou entidade
responsável pela compra
```
```
orgaoSubrogadoCnpj Texto CNPJ do órgão sub-rogado
```
```
codigoOrgao Inteiro Código do órgão responsável
```
```
orgaoEntidadeRazaoSocial Texto Razão social do órgão ou entidade
```
```
orgaoSubrogadoRazaoSocial Texto Razão social do órgão sub-rogado
```
```
orgaoEntidadeEsferaId Texto Identificador da esfera do órgão
```
```
orgaoSubrogadoEsferaId Texto Identificador da esfera do órgão sub-
rogado
```
```
orgaoEntidadePoderId Texto Identificador do poder do órgão
```
```
orgaoSubrogadoPoderId Texto Identificador do poder do órgão sub-
rogado
```
```
unidadeOrgaoCodigoUnidade Texto Código da unidade do órgão
```
```
unidadeSubrogadaCodigoUnidade Texto Código da unidade subrogada
```
```
unidadeOrgaoNomeUnidade Texto Nome da unidade do órgão
```
```
unidadeSubrogadaNomeUnidade Texto Nome da unidade subrogada
```
```
unidadeOrgaoUfSigla Texto Sigla da unidade federativa da
unidade do órgão
```
```
unidadeSubrogadaUfSigla Texto Sigla da unidade federativa da
unidade subrogada
```
```
unidadeOrgaoMunicipioNome Texto Nome do município da unidade do
órgão
```
```
unidade_subrogada_municipio_nome Texto Nome do município da unidade
subrogada
```

**Voltar ao sumário**

```
unidadeOrgaoCodigoIbge Inteiro Código IBGE do município da unidade
do órgão
```
```
unidadeSubrogadaCodigoIbge Inteiro Código IBGE do município da unidade
subrogada
```
```
numeroCompra Texto Número da compra
```
```
modalidadeIdPncp Inteiro Identificador da modalidade de
compra no PNCP
```
```
codigoModalidade Inteiro Código da modalidade de compra
```
```
modalidadeNome Texto Nome da modalidade de compra
```
```
srp Booleano Indicador se a compra é por Sistema
de Registro de Preços (SRP)
0 – False/Não
1 – True/Sim
```
```
modoDisputaIdPncp Inteiro Identificador do modo de disputa no
PNCP
```
```
codigoModoDisputa Inteiro Código do modo de disputa
```
```
amparoLegalCodigoPncp Inteiro Código do amparo legal no PNCP
```
```
amparoLegalNome Texto Nome do amparo legal
```
```
amparoLegalDescricao Texto Descrição do amparo legal
```
```
informacaoComplementar Texto Informações complementares sobre a
compra
```
```
processo Texto Número do processo administrativo
relacionado
```
```
objetoCompra Texto Descrição do objeto da compra
```
```
existeResultado Booleano Indicador se há resultado da compra
0 – False/Não
1 – True/Sim
```
```
orcamentoSigilosoCodigo Inteiro Código do orçamento sigiloso
```
```
orcamentoSigilosoDescricao Texto Descrição do orçamento sigiloso
```

**Voltar ao sumário**

```
situacaoCompraIdPncp Inteiro Identificador da situação da compra
no PNCP
```
```
situacaoCompraNomePncp Texto Nome da situação da compra no
PNCP
```
```
tipoInstrumentoConvocatorioCodigoPncp Inteiro Código do tipo de instrumento
convocatório no PNCP
```
```
tipoInstrumentoConvocatorioNome Texto Nome do tipo de instrumento
convocatório
```
```
modoDisputaNomePncp Texto Nome do modo de disputa no PNCP
```
```
valorTotalEstimado Inteiro Valor total estimado para a compra
```
```
valorTotalHomologado Inteiro Valor total homologado para a
compra
```
```
dataInclusaoPncp Data Data de inclusão da compra no PNCP
```
```
dataAtualizacaoPncp Data Data da última atualização da compra
no PNCP
```
```
dataPublicacaoPncp Data Data de publicação da compra no
PNCP
```
```
dataAberturaPropostaPncp Data Data de abertura das propostas no
PNCP
```
```
dataEncerramentoPropostaPncp Data Data de encerramento das propostas
no PNCP
```
```
contratacaoExcluida Booleano Indica se a contratação foi
desconsiderada/excluída
0 – False/Não
1 – True/Sim
```
Exemplo de Retorno
{
"resultado": [
{
"idCompra": "string",
"numeroControlePNCP": "string",
"anoCompraPncp": 0,
"sequencialCompraPncp": 0,


**Voltar ao sumário**

```
"orgaoEntidadeCnpj": "string",
"orgaoSubrogadoCnpj": "string",
"codigoOrgao": 0,
"orgaoEntidadeRazaoSocial": "string",
"orgaoSubrogadoRazaoSocial": "string",
"orgaoEntidadeEsferaId": "string",
"orgaoSubrogadoEsferaId": "string",
"orgaoEntidadePoderId": "string",
"orgaoSubrogadoPoderId": "string",
"unidadeOrgaoCodigoUnidade": "string",
"unidadeSubrogadaCodigoUnidade": "string",
"unidadeOrgaoNomeUnidade": "string",
"unidadeSubrogadaNomeUnidade": "string",
"unidadeOrgaoUfSigla": "string",
"unidadeSubrogadaUfSigla": "string",
"unidadeOrgaoMunicipioNome": "string",
"unidade_subrogada_municipio_nome": "string",
"unidadeOrgaoCodigoIbge": 0,
"unidadeSubrogadaCodigoIbge": 0,
"numeroCompra": "string",
"modalidadeIdPncp": 0,
"codigoModalidade": 0,
"modalidadeNome": "string",
"srp": true,
"modoDisputaIdPncp": 0,
"codigoModoDisputa": 0,
"amparoLegalCodigoPncp": 0,
"amparoLegalNome": "string",
"amparoLegalDescricao": "string",
"informacaoComplementar": "string",
"processo": "string",
"objetoCompra": "string",
"existeResultado": true,
"orcamentoSigilosoCodigo": 0,
"orcamentoSigilosoDescricao": "string",
"situacaoCompraIdPncp": 0,
"situacaoCompraNomePncp": "string",
"tipoInstrumentoConvocatorioCodigoPncp": 0,
"tipoInstrumentoConvocatorioNome": "string",
"modoDisputaNomePncp": "string",
"valorTotalEstimado": 0,
"valorTotalHomologado": 0,
"dataInclusaoPncp": "2025-02-19T17:52:26.534Z",
"dataAualizacaoPncp": "2025-02-19T17:52:26.534Z",
"dataPublicacaoPncp": "2025-02-19T17:52:26.534Z",
"dataAberturaPropostaPncp": "2025-02-19T17:52:26.534Z",
"dataEncerramentoPropostaPncp": "2025-02-19T17:52:26.534Z",
"contratacaoExcluida": true
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0
```

**Voltar ao sumário**

```
}
```
10.6. Itens das Contratações PNCP 14133

Serviço que oferece acesso aos dados específicos de itens vinculados às

contratações regidas pela Lei 14.133/2021.

```
Endpoint Método
HTTP
```
```
https://dadosabertos.compras.gov.br/modulo-
contratacoes/2_consultarItensContratacoes_PNCP_14133?pagina={valor}/
{parametro1=valor1}&{parametroN=valorN}
```
```
GET
```
```
Exemplo Requisição (cURL)
```
```
curl -X 'GET' \
```
```
'https://dadosabertos.compras.gov.br/modulo-
contratacoes/2_consultarItensContratacoes_PNCP_14133' \
```
- H 'accept: */*'

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a paginação
dos resultados, permite
ao usuário navegar entre
as páginas de resultados.
(Default value : 1)
```
```
tamanhoPagina Inteiro Não Ajustar o tamanho de
registros por página
(limite máx. de 500
registros por página)
(Default value : 10)
unidadeOrgaoCodigoUnidade Inteiro^ Não^ Código da unidade do
órgão
```
```
orgaoEntidadeCnpj Texto^ Não^ Código do órgão^
```
```
situacaoCompraItem Texto^ Não^ Número do CNPJ da
entidade do órgão
```

**Voltar ao sumário**

```
materialOuServico Texto^ Sim^ Data inicial da publicação
no PNCP
codigoClasse Inteiro^ Sim^ Data final da publicação
no PNCP
codigoGrupo Inteiro^ Sim^ Código da modalidade
da licitação
codItemCatalogo Inteiro^ Não^ Código do IBGE da
unidade do órgão
temResultado Booleano^ Não^ Sigla da unidade
federativa do órgão
codFornecedor Texto^ Não^ Data de atualização no
PNCP
dataInclusaoPncpInicial Texto Não Código que indica o
amparo legal específico
no PNCP
dataInclusaoPncpFinal Texto Não Indica se a contratação
foi
desconsiderada/excluída
0 – False/Não
1 – True/Sim
dataAtualizacaoPncp Texto Não Data de atualização no
PNCP
```
bps Booleano Não (^) Indica se o item da
contratação está
vinculado ao Banco de
Preços em Saúde (BPS)
(Valor padrão: false)
0 – False/Não
1 – True/Sim
margemPreferenciaNormal Booleano Não Indica se a compra
possui margem de
preferência normal
conforme a legislação
vigente
0 – False/Não
1 – True/Sim
codigoNCM Texto Não Código de NCM -
Nomenclatura Comum
do Mercosul
Dados de Retorno
Campo tipo Descrição


**Voltar ao sumário**

```
idCompra Texto Identificador único da compra
```
```
idCompraItem Texto Identificador único do item da
compra
```
```
idContratacaoPNCP Texto Identificador único da contratação
no PNCP
```
```
unidadeOrgaoCodigoUnidade Inteiro Código da unidade do órgão
```
```
orgaoEntidadeCnpj Texto CNPJ do órgão ou entidade
responsável pela compra
```
```
numeroItemPncp Inteiro Número do item no PNCP
```
```
numeroItemCompra Inteiro Número do item na compra
```
```
numeroGrupo Inteiro Número do grupo ao qual o item
pertence
```
```
descricaoResumida Texto Descrição resumida do item
```
```
materialOuServico Texto Indica se é um material ou serviço
(M - Material, S - Serviço)
```
```
materialOuServicoNome Texto Nome do material ou serviço
```
```
codigoClasse Inteiro Código da classe do item
```
```
codigoGrupo Inteiro Código do grupo do item
```
```
codItemCatalogo Inteiro Código do item no catálogo
```
```
descricaodetalhada Texto Descrição detalhada do item
```
```
unidadeMedida Texto Unidade de medida do item
```
```
orcamentoSigiloso Booleano Indicador se o orçamento é
sigiloso 0 – False/Não
1 – True/Sim
```
```
itemCategoriaIdPncp Inteiro Identificador da categoria do item
no PNCP
```
```
itemCategoriaNome Texto Nome da categoria do item
```
```
criterioJulgamentoIdPncp Inteiro Identificador do critério de
julgamento no PNCP
```

**Voltar ao sumário**

```
criterioJulgamentoNome Texto Nome do critério de julgamento
```
```
situacaoCompraItem Texto Situação do item da compra
```
```
situacaoCompraItemNome Texto Nome da situação do item da
compra
```
```
tipoBeneficio Texto Tipo de benefício associado ao
item
```
```
tipoBeneficioNome Texto Nome do tipo de benefício
associado
```
```
incentivoProdutivoBasico Booleano Indicador de incentivo produtivo
básico
0 – False/Não
1 – True/Sim
```
```
quantidade Inteiro Quantidade do item
```
```
valorUnitarioEstimado Inteiro Valor unitário estimado do item
```
```
valorTotal Inteiro Valor total estimado do item
```
```
temResultado Booleano Indicador se há resultado para o
item
0 – False/Não
1 – True/Sim
```
```
codFornecedor Texto Código do fornecedor do item
```
```
nomeFornecedor Texto Nome do fornecedor do item
```
```
quantidadeResultado Inteiro Quantidade do item no resultado
```
```
valorUnitarioResultado Inteiro Valor unitário do item no resultado
```
```
valorTotalResultado Inteiro Valor total do item no resultado
```
```
dataInclusaoPncp Data Data de inclusão do item no PNCP
```
```
dataAtualizacaoPncp Data Data da última atualização do item
no PNCP
```
```
dataResultado Texto Data do resultado para o item
```

**Voltar ao sumário**

```
margemPreferenciaNormal Booleano Indicador de margem de
preferência normal
0 – False/Não
1 – True/Sim
```
```
percentualMargemPreferenciaNormal Inteiro Percentual da margem de
preferência normal
```
```
margemPreferenciaAdicional Booleano Indicador de margem de
preferência adicional
0 – False/Não
1 – True/Sim
```
```
percentualMargemPreferenciaAdicional Inteiro Percentual da margem de
preferência adicional
```
```
codigoNCM Texto Código da Nomenclatura Comum
do Mercosul (NCM)
```
```
descricaoNCM Texto Descrição da Nomenclatura
Comum do Mercosul (NCM)
```
Exemplo de Retorno
{
"resultado": [
{
"idCompra": "string",
"idCompraItem": "string",
"idContratacaoPNCP": "string",
"unidadeOrgaoCodigoUnidade": 0,
"orgaoEntidadeCnpj": "string",
"numeroItemPncp": 0,
"numeroItemCompra": 0,
"numeroGrupo": 0,
"descricaoResumida": "string",
"materialOuServico": "string",
"materialOuServicoNome": "string",
"codigoClasse": 0,
"codigoGrupo": 0,
"codItemCatalogo": 0,
"descricaodetalhada": "string",
"unidadeMedida": "string",
"orcamentoSigiloso": true,
"itemCategoriaIdPncp": 0,
"itemCategoriaNome": "string",
"criterioJulgamentoIdPncp": 0,
"criterioJulgamentoNome": "string",


**Voltar ao sumário**

```
"situacaoCompraItem": "string",
"situacaoCompraItemNome": "string",
"tipoBeneficio": "string",
"tipoBeneficioNome": "string",
"incentivoProdutivoBasico": true,
"quantidade": 0,
"valorUnitarioEstimado": 0,
"valorTotal": 0,
"temResultado": true,
"codFornecedor": "string",
"nomeFornecedor": "string",
"quantidadeResultado": 0,
"valorUnitarioResultado": 0,
"valorTotalResultado": 0,
"dataInclusaoPncp": "2025-02-19T18:42:11.992Z",
"dataAtualizacaoPncp": "2025-02-19T18:42:11.992Z",
"dataResultado": "string",
"margemPreferenciaNormal": true,
"percentualMargemPreferenciaNormal": 0,
"margemPreferenciaAdicional": true,
"percentualMargemPreferenciaAdicional": 0,
"codigoNCM": "string",
"descricaoNCM": "string"
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0
}
```
10.7. Resultado dos Itens das Contratações PNCP 14133

Serviço que permite consultar os resultados associados aos itens contratados,

incluindo detalhes de desempenho e conformidade com a Lei 14.133/2021.

```
Endpoint Método
HTTP
```
```
https://dadosabertos.compras.gov.br/modulo-
contratacoes/3_consultarResultadoItensContratacoes_PNCP_14133?pagi
na={valor}/{parametro1=valor1}&{parametroN=valorN}
```
```
GET
```
```
Exemplo Requisição (cURL)
```
```
curl -X 'GET' \
```

**Voltar ao sumário**

```
'https://dadosabertos.compras.gov.br/modulo-
contratacoes/3_consultarResultadoItensContratacoes_PNCP_14133' \
```
- H 'accept: */*'

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a
paginação dos
resultados, permite
ao usuário navegar
entre as páginas de
resultados. (Default
value : 1)
```
```
tamanhoPagina Inteiro Não Ajustar o tamanho de
registros por página
(limite máx. de 500
registros por página)
(Default value : 10)
unidadeOrgaoCodigoUnidade Texto^ Não^ Código da unidade
do órgão
```
```
orgaoEntidadeCnpj Texto^ Não^ Número do CNPJ da
entidade do órgão
```
```
niFornecedor Texto^ Não^ Número de
Identificação Fiscal
do fornecedor
codigoPais Texto^ Não^ Código do país do
fornecedor
porteFornecedorId Inteiro^ Não^ Código do país do
fornecedor
naturezaJuridicaId Texto^ Não^ Código que identifica
a natureza jurídica do
fornecedor
situacaoCompraItemResultadoId Inteiro^ Não^ Identificador da
situação do item na
compra
valorUnitarioHomologadoInicial Decimal^ Não^ Valor unitário inicial
homologado para o
item
valorUnitarioHomologadoFinal Decimal^ Não^ Valor unitário final
homologado para o
item
```

**Voltar ao sumário**

```
valorTotalHomologadoInicial Decimal^ Não^ Valor total inicial
homologado para o
item
valorTotalHomologadoFinal Decimal^ Não^ Valor total final
homologado para o
item
dataResultadoPncpInicial Texto^ Sim^ Data inicial do
resultado no PNCP
dataResultadoPncpFinal Texto^ Sim^ Data final do
resultado no PNCP
aplicacaoMargemPreferencia Booleano^ Não^ Indica se foi aplicada
a margem de
preferência na
contratação
0 – False/Não
1 – True/Sim
aplicacaoBeneficioMeepp Booleano^ Não^ Indica se foi
concedido benefício
específico para
ME/EPP (Micro e
Pequenas Empresas)
0 – False/Não
1 – True/Sim
aplicacaoCriterioDesempate Booleano^ Não^ Indica se foi aplicado
algum critério de
desempate conforme
a legislação
0 – False/Não
1 – True/Sim
```
Dados de Retorno

```
Campo tipo Descrição
```
```
idCompraItem Texto Identificador único do item da
compra
```
```
idCompra Texto Identificador único da compra
```
```
idContratacaoPNCP Texto Identificador único da contratação
no PNCP
```
```
unidadeOrgaoCodigoUnidade Texto Código da unidade do órgão
```
```
numeroItemPncp Inteiro Número do item no PNCP
```

**Voltar ao sumário**

```
sequencialResultado Inteiro Número sequencial do resultado
```
```
niFornecedor Texto Identificador nacional do
fornecedor
```
```
tipoPessoa Texto Tipo de pessoa do fornecedor
(física ou jurídica)
```
```
nomeRazaoSocialFornecedor Texto Nome ou razão social do
fornecedor
```
```
codigoPais Texto Código do país do fornecedor
```
```
indicadorSubcontratacao Booleano Indicador se há subcontratação
0 – False/Não
1 – True/Sim
```
```
ordemClassificacaoSrp Inteiro Ordem de classificação no
Sistema de Registro de Preços
(SRP)
```
```
quantidadeHomologada Inteiro Quantidade homologada
```
```
valorUnitarioHomologado Inteiro Valor unitário homologado
```
```
valorTotalHomologado Inteiro Valor total homologado
```
```
percentualDesconto Inteiro Percentual de desconto oferecido
```
```
situacaoCompraItemResultadoId Inteiro Identificador da situação do item
do resultado de compra
```
```
situacaoCompraItemResultadoNome Texto Nome da situação do item do
resultado de compra
```
```
motivoCancelamento Texto Motivo do cancelamento
```
```
porteFornecedorId Inteiro Identificador do porte do
fornecedor
```
```
porteFornecedorNome Texto Nome do porte do fornecedor
```
```
naturezaJuridicaNome Texto Nome da natureza jurídica do
fornecedor
```
```
naturezaJuridicaId Texto Identificador da natureza jurídica
do fornecedor
```

**Voltar ao sumário**

```
dataInclusaoPncp Data Data de inclusão do item no PNCP
```
```
dataAtualizacaoPncp Data Data da última atualização do item
no PNCP
```
```
dataCancelamentoPncp Data Data de cancelamento do item no
PNCP
```
```
dataResultadoPncp Data Data do resultado para o item no
PNCP
```
Exemplo de Retorno
{
"resultado": [
{
"idCompraItem": "string",
"idCompra": "string",
"idContratacaoPNCP": "string",
"unidadeOrgaoCodigoUnidade": "string",
"numeroItemPncp": 0,
"sequencialResultado": 0,
"niFornecedor": "string",
"tipoPessoa": "string",
"nomeRazaoSocialFornecedor": "string",
"codigoPais": "string",
"indicadorSubcontratacao": true,
"ordemClassificacaoSrp": 0,
"quantidadeHomologada": 0,
"valorUnitarioHomologado": 0,
"valorTotalHomologado": 0,
"percentualDesconto": 0,
"situacaoCompraItemResultadoId": 0,
"situacaoCompraItemResultadoNome": "string",
"motivoCancelamento": "string",
"porteFornecedorId": 0,
"porteFornecedorNome": "string",
"naturezaJuridicaNome": "string",
"naturezaJuridicaId": "string",
"dataInclusaoPncp": "2025-02-19T19:31:56.237Z",
"dataAtualizacaoPncp": "2025-02-19T19:31:56.237Z",
"dataCancelamentoPncp": "2025-02-19T19:31:56.237Z",
"dataResultadoPncp": "2025-02-19T19:31:56.237Z",
"aplicacaoMargemPreferencia": true,
"amparoLegalMargemPreferenciaId": 0,
"amparoLegalMargemPreferenciaNome": "string",
"aplicacaoBeneficioMeepp": true,
"aplicacaoCriterioDesempate": true,
"amparoLegalCriterioDesempateId": 0,
"amparoLegalCriterioDesempateNome": "string",
"moedaEstrangeiraId": 0,


**Voltar ao sumário**

```
"dataCotacaoMoedaEstrangeira": "2025- 02 - 19T19:31:56.237Z",
"valorNominalMoedaEstrangeira": 0,
"paisOrigemProdutoServicoId": "string",
"timezoneCotacaoMoedaEstrangeira": "string"
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0
}
```
# 11. Módulo ARP

## As Atas de Registro de Preços (ARP) são documentos que estabelecem

## condições e quantidades para futuras aquisições de bens e serviços. Por meio

## deste módulo, obtêm-se detalhes das ARPs vigentes e de suas especificidades, o

## que facilita o planejamento, a gestão e o monitoramento das compras,

## contribuindo para maior eficiência e economicidade no uso dos recursos

## públicos.

## 11.1. ARP

## Consulta as Atas de Registro de Preços vigentes ou cadastradas, listando

## informações como número da ata, objeto, órgão gerenciador e período de

## validade.

```
Endpoint Método
HTTP
```
```
https://dadosabertos.compras.gov.br/modulo-
arp/1_consultarARP?pagina={valor}/{parametro1=valor1}&{parametroN=val
orN}
```
```
GET
```
```
Exemplo Requisição (cURL)
```
```
curl -X 'GET' \
```
```
'https://dadosabertos.compras.gov.br/modulo-arp/1_consultarARP' \
```
- H 'accept: */*'


**Voltar ao sumário**

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a paginação
dos resultados, permite
ao usuário navegar
entre as páginas de
resultados. (Default
value : 1)
```
```
tamanhoPagina Inteiro Não Ajustar o tamanho de
registros por página
(limite máx. de 500
registros por página)
(Default value : 10)
codigoUnidadeGerenciadora Inteiro Não Código da unidade
responsável
```
```
codigoModalidadeCompra Texto Não Código da modalidade
da compra
```
```
numeroAtaRegistroPreco Texto Não Número da Ata de
Registro de Preço
dataVigenciaInicialMin Texto Sim Data inicial da vigência
dataVigenciaInicialMax Texto Sim Data final da vigência
dataAssinaturaInicial Texto Não Data inicial da
assinatura
dataAssinaturaFinal Texto Não Data final da assinatura
```
Dados de Retorno

```
Campo tipo Descrição
```
```
numeroAtaRegistroPreco Texto Número da Ata de Registro de
Preços
```
```
codigoUnidadeGerenciadora Inteiro Código da unidade gerenciadora
```
```
nomeUnidadeGerenciadora Texto Nome da unidade gerenciadora
```
```
codigoOrgao Inteiro Código do órgão
```
```
nomeOrgao Texto Nome do órgão
```
```
linkAtaPNCP Texto Link para acesso à ata no PNCP
```

**Voltar ao sumário**

```
linkCompraPNCP Texto Link para acesso à compra no
PNCP
```
```
numeroCompra Texto Número da compra associada à
ata
```
```
anoCompra Texto Ano da compra
```
```
codigoModalidadeCompra Texto Código da modalidade de compra
associada à ata
```
```
nomeModalidadeCompra Texto Nome da modalidade de compra
associada à ata
```
```
dataAssinatura Data Data da assinatura
```
```
dataVigenciaInicial Data Data inicial da vigência
```
```
dataVigenciaFinal Data Data final da vigência
```
```
valorTotal Inteiro Valor total registrado
```
```
statusAta Texto Status atual da ata (ex.: ativa,
encerrada, excluída)
```
```
objeto Texto Objeto ou descrição resumida
```
```
quantidadeItens Inteiro Quantidade de itens registrados
```
```
dataHoraAtualizacao Data Data e hora da última atualização
```
```
dataHoraInclusao Data Data e hora de inclusão da ata no
sistema
```
```
dataHoraExclusao Data Data e hora de exclusão
```
```
ataExcluido Booleano Indicador se a ata foi excluída
0 – False/Não
1 – True/Sim
```
```
numeroControlePncpAta Texto Número de controle da ata no
PNCP
```
```
numeroControlePncpCompra Texto Número de controle da compra
no PNCP
```
```
idCompra Texto Identificador único da compra
associada
```

**Voltar ao sumário**

Exemplo de Retorno
{
"resultado": [
{
"numeroAtaRegistroPreco": "string",
"codigoUnidadeGerenciadora": 0,
"nomeUnidadeGerenciadora": "string",
"codigoOrgao": 0,
"nomeOrgao": "string",
"linkAtaPNCP": "string",
"linkCompraPNCP": "string",
"numeroCompra": "string",
"anoCompra": "string",
"codigoModalidadeCompra": "string",
"nomeModalidadeCompra": "string",
"dataAssinatura": "2025-02-19T20:00:53.814Z",
"dataVigenciaInicial": "2025-02-19T20:00:53.814Z",
"dataVigenciaFinal": "2025-02-19T20:00:53.814Z",
"valorTotal": 0,
"statusAta": "string",
"objeto": "string",
"quantidadeItens": 0,
"dataHoraAtualizacao": "2025-02-19T20:00:53.814Z",
"dataHoraInclusao": "2025-02-19T20:00:53.814Z",
"dataHoraExclusao": "2025-02-19T20:00:53.814Z",
"ataExcluido": true,
"numeroControlePncpAta": "string",
"numeroControlePncpCompra": "string",
"idCompra": "string"
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0
}

11.2. Itens da ARP

Retorna a lista de itens associados a uma ARP, incluindo descrição, quantidades

registradas e condições de fornecimento.

```
Endpoint Método
HTTP
```

**Voltar ao sumário**

```
https://dadosabertos.compras.gov.br/modulo-
arp/2_consultarARPItem?pagina={valor}/{parametro1=valor1}&{parametro
N=valorN}
```
```
GET
```
```
Exemplo Requisição (cURL)
```
```
curl -X 'GET' \
```
```
'https://dadosabertos.compras.gov.br/modulo-arp/2_consultarARPItem ' \
```
- H 'accept: */*'

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a paginação
dos resultados, permite
ao usuário navegar
entre as páginas de
resultados. (Default
value : 1)
```
```
tamanhoPagina Inteiro Não Ajustar o tamanho de
registros por página
(limite máx. de 500
registros por página)
(Default value : 10)
codigoUnidadeGerenciadora Inteiro^ Não^ Código da unidade
responsável
```
```
codigoModalidadeCompra Texto^ Não^ Código da modalidade
da compra
```
```
dataVigenciaInicialMin Texto^ Sim^ Data inicial da vigência^
dataVigenciaInicialMax Texto^ Sim^ Data final da vigência^
dataAssinaturaInicial Texto^ Não^ Data inicial da
assinatura
dataAssinaturaFinal Texto^ Não^ Data final da assinatura^
numeroItem Texto^ Não^ Número do item^
codigoItem Inteiro^ Não^ Código do item^
tipoItem Texto^ Não^ Tipo do item (ex.:
material ou serviço)
```

**Voltar ao sumário**

```
niFornecedor Texto^ Não^ Número de
identificação do
fornecedor
codigoPdm Inteiro^ Não^ Código do PDM (Padrão
Descritivo de Materiais)
numeroCompra Texto^ Não^ Número da compra^
```
Dados de Retorno

```
Campo tipo Descrição
```
```
numeroAtaRegistroPreco Texto Número da Ata de Registro de
Preços associada ao item
```
```
codigoUnidadeGerenciadora Inteiro Código da unidade gerenciadora
```
```
numeroCompra Texto Número da compra associada ao
item
```
```
anoCompra Texto Ano da compra
```
```
codigoModalidadeCompra Texto Código da modalidade de compra
```
```
dataAssinatura Data Data de assinatura
```
```
dataVigenciaInicial Data Data inicial da vigência
```
```
dataVigenciaFinal Data Data final da vigência
```
```
numeroItem Texto Número do item
```
```
codigoItem Inteiro Código do item no catálogo
```
```
descricaoItem Texto Descrição do item
```
```
tipoItem Texto Tipo do item (ex.: material ou
serviço)
```
```
quantidadeHomologadaItem Inteiro Quantidade homologada para o
item
```
```
classificacaoFornecedor Texto Classificação do fornecedor (ex.:
ME/EPP)
```
```
niFornecedor Texto Número de identificação do
fornecedor
```

**Voltar ao sumário**

```
nomeRazaoSocialFornecedor Texto Nome ou razão social do
fornecedor
```
```
quantidadeHomologadaVencedor Inteiro Quantidade homologada para o
fornecedor vencedor
```
```
valorUnitario Inteiro Valor unitário
```
```
valorTotal Inteiro Valor total
```
```
maximoAdesao Inteiro Quantidade máxima permitida
para adesão ao item
```
```
nomeUnidadeGerenciadora Texto Nome da unidade gerenciadora
```
```
nomeModalidadeCompra Texto Nome da modalidade de compra
```
```
idCompra Texto Identificador único da compra
```
```
numeroControlePncpCompra Texto Número de controle da compra
no PNCP
```
```
dataHoraInclusao Data Data e hora de inclusão no
sistema
```
```
dataHoraAtualizacao Data Data e hora da última atualização
```
```
quantidadeEmpenhada Inteiro Quantidade empenhada do item
```
```
percentualMaiorDesconto Inteiro Percentual de maior desconto
```
```
situacaoSicaf Texto Situação do fornecedor no SICAF
```
```
dataHoraExclusao Data Data e hora de exclusão
```
```
itemExcluido Booleano Indicador se o item foi excluído
0 – False/Não
1 – True/Sim
```
```
numeroControlePncpAta Texto Número de controle da ata no
PNCP
```
```
codigoPdm Inteiro Código do PDM (Padrão Descritivo
de Material)
```
```
nomePdm Texto Nome do PDM
```

**Voltar ao sumário**

Exemplo de Retorno
{
"resultado": [
{
"numeroAtaRegistroPreco": "string",
"codigoUnidadeGerenciadora": 0,
"numeroCompra": "string",
"anoCompra": "string",
"codigoModalidadeCompra": "string",
"dataAssinatura": "2025-02-19T20:09:49.384Z",
"dataVigenciaInicial": "2025-02-19T20:09:49.384Z",
"dataVigenciaFinal": "2025-02-19T20:09:49.384Z",
"numeroItem": "string",
"codigoItem": 0,
"descricaoItem": "string",
"tipoItem": "string",
"quantidadeHomologadaItem": 0,
"classificacaoFornecedor": "string",
"niFornecedor": "string",
"nomeRazaoSocialFornecedor": "string",
"quantidadeHomologadaVencedor": 0,
"valorUnitario": 0,
"valorTotal": 0,
"maximoAdesao": 0,
"nomeUnidadeGerenciadora": "string",
"nomeModalidadeCompra": "string",
"idCompra": "string",
"numeroControlePncpCompra": "string",
"dataHoraInclusao": "2025-02-19T20:09:49.384Z",
"dataHoraAtualizacao": "2025-02-19T20:09:49.384Z",
"quantidadeEmpenhada": 0,
"percentualMaiorDesconto": 0,
"situacaoSicaf": "string",
"dataHoraExclusao": "2025-02-19T20:09:49.384Z",
"itemExcluido": true,
"numeroControlePncpAta": "string",
"codigoPdm": 0,
"nomePdm": "string"
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0
}


**Voltar ao sumário**

11.3. Consultar Unidades do Item

Serviço que permite consultar os dados das unidades participantes e saldos de

um item específico de uma Ata de Registro de Preços.

```
Endpoint Método
HTTP
```
```
https://dadosabertos.compras.gov.br/modulo-
arp/3_consultarUnidadesItem?pagina={valor}&{parametroN=valorN}
```
```
GET
```
```
Exemplo Requisição (cURL)
```
```
curl -X 'GET' \
```
```
'https://dadosabertos.compras.gov.br/modulo-
arp/3_consultarUnidadesItem?numeroAta=12345&unidadeGerenciadora=123456&num
eroItem=1' \
```
- H 'accept: */*'

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a paginação
dos resultados, permite
ao usuário navegar
entre as páginas de
resultados. (Default
value : 1)
```
```
tamanhoPagina Inteiro Não Ajustar o tamanho de
registros por página
(limite máx. de 500
registros por página)
(Default value : 10)
codigoUnidadeGerenciadora Inteiro^ Não^ Código da unidade
responsável
```

**Voltar ao sumário**

```
numeroAta Texto^ Sim^ Número da Ata de
Registro de Preços.
```
```
unidadeGerenciadora Texto^ Sim^ Código da unidade
gerenciadora (UASG).
numeroItem Texto^ Sim^ Número do item na ata.^
dataAtualizacao Texto^ Não^ Data de atualização.^
```
Dados de Retorno

```
Campo tipo Descrição
```
```
numeroAta Texto Número da Ata de Registro de
Preços.
```
```
unidadeGerenciadora Texto Código da unidade
gerenciadora
```
```
numeroItem Texto Número do item.
```
```
codigoPdm Texto Código do PDM.
```
```
descricaoItem Texto Descrição do item.
```
```
fornecedor Texto Identificação do fornecedor.
```
```
quantidadeRegistrada Inteiro Quantidade registrada do item.
```
```
saldoAdesao Inteiro Saldo disponível para adesão.
```
```
saldoRemanejamentoEmpenho Inteiro Saldo disponível para
remanejamento de empenho.
```
```
qtdLimiteAdesao Inteiro Quantidade limite para adesão.
```
```
qtdLimiteRemanejamentoCompra Inteiro Quantidade limite para
remanejamento na compra.
```
```
excluida Booleano Indica se a unidade/item foi
excluída (True/False).
```
```
dataHoraInclusao Data Data e hora da inclusão.
```
```
dataHoraAtualizacao Data Data e hora da última
atualização.
```

**Voltar ao sumário**

```
dataHoraExclusao Data Data e hora da exclusão (se
houver).
```
Exemplo de Retorno
{
"resultado": [
{
"numeroAta": "string",
"unidadeGerenciadora": "string",
"numeroItem": "string",
"codigoPdm": "string",
"descricaoItem": "string",
"fornecedor": "string",
"quantidadeRegistrada": 0,
"saldoAdesao": 0,
"saldoRemanejamentoEmpenho": 0,
"qtdLimiteAdesao": 0,
"qtdLimiteRemanejamentoCompra": 0,
"excluida": true,
"dataHoraInclusao": "2025-01-06T15:15:03.773Z",
"dataHoraAtualizacao": "2025-01-06T15:15:03.773Z",
"dataHoraExclusao": "2025-01-06T15:15:03.773Z"
}
],
" totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0
}

11.4. Consultar Empenhos e Saldo do Item

Serviço que permite consultar os saldos e quantidades empenhadas de um item

em uma Ata de Registro de Preços.

```
Endpoint Método
HTTP
```
```
https://dadosabertos.compras.gov.br/modulo-
arp/4_consultarEmpenhosSaldoItem?pagina={valor}&{parametroN=valorN}
```
```
GET
```
```
Exemplo Requisição (cURL)
```
```
curl -X 'GET' \
```

**Voltar ao sumário**

```
'https://dadosabertos.compras.gov.br/modulo-
arp/4_consultarEmpenhosSaldoItem?numeroAta=12345&unidadeGerenciadora=12345
6' \
```
- H 'accept: */*'

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a paginação
dos resultados, permite
ao usuário navegar
entre as páginas de
resultados. (Default
value : 1)
```
```
tamanhoPagina Inteiro Não Ajustar o tamanho de
registros por página
(limite máx. de 500
registros por página)
(Default value : 10)
```
```
numeroAta Texto Sim
Número da Ata de
Registro de Preços.
```
```
unidadeGerenciadora Texto Sim
Código da unidade
gerenciadora (UASG).
```
```
dataAtualizacao Texto Não
Data de atualização
(YYYY-MM-DD).
```
Dados de Retorno

```
Campo tipo Descrição
numeroItem
Texto Número do item.
unidade
Texto
Unidade relacionada ao
empenho.
tipo
Texto
Tipo de registro (ex: empenho,
saldo).
quantidadeRegistrada
Inteiro Quantidade total registrada.
```
```
quantidadeEmpenhada
Inteiro Quantidade que já foi
empenhada.
saldoEmpenho Inteiro Saldo restante para empenho.
```

**Voltar ao sumário**

```
dataHoraInclusao
Data^
```
```
Data e hora da inclusão do
registro.
dataHoraAtualizacao
Data
Data e hora da última
atualização.
```
Exemplo de Retorno
{
"resultado": [
{
"numeroItem": "string",
"unidade": "string",
"tipo": "string",
"quantidadeRegistrada": 0,
"quantidadeEmpenhada": 0,
"saldoEmpenho": 0,
"dataHoraInclusao": "2025-01-06T15:15:03.773Z",
"dataHoraAtualizacao": "2025-01-06T15:15:03.773Z"
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0
}

11.5. Consultar Adesões do Item

Serviço que permite consultar as adesões realizadas (caronas) a um item

específico de uma Ata de Registro de Preços.

```
Endpoint Método
HTTP
```
```
https://dadosabertos.compras.gov.br/modulo-
arp/5_consultarAdesoesItem?pagina={valor}&{parametroN=valorN}
```
```
GET
```
```
Exemplo Requisição (cURL)
```
```
curl -X 'GET' \
```
```
'https://dadosabertos.compras.gov.br/modulo-
arp/5_consultarAdesoesItem?numeroAta=12345&unidadeGerenciadora=123456&nume
roItem=1' \
```

**Voltar ao sumário**

- H 'accept: */*'

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a paginação
dos resultados, permite
ao usuário navegar
entre as páginas de
resultados. (Default
value : 1)
```
```
tamanhoPagina Inteiro Não Ajustar o tamanho de
registros por página
(limite máx. de 500
registros por página)
(Default value : 10)
```
```
numeroAta Texto Sim
Número da Ata de
Registro de Preços.
```
```
unidadeGerenciadora Texto Sim
Código da unidade
gerenciadora (UASG).
```
```
numeroItem
Texto Sim Número do item na ata.
```
```
unidade
Texto Não Código da unidade
solicitante da adesão.
dataAtualizacao
Texto Não Data de atualização.
```
Dados de Retorno

```
Campo tipo Descrição
```
```
numeroAta Texto Número da Ata de Registro de
Preços.
```
```
unidadeGerenciadora Texto
Código da unidade
gerenciadora.
unidadeNaoParticipante Texto
Código da unidade não
participante (órgão carona).
dataAprovacaoAnalise Data
Data da aprovação da análise
da adesão.
quantidadeAprovadaAdesao Inteiro
Quantidade aprovada para a
adesão.
```

**Voltar ao sumário**

## Exemplo de Retorno

```
{
"resultado": [
{
"numeroAta": "string",
"unidadeGerenciadora": "string",
"unidadeNaoParticipante": "string",
"dataAprovacaoAnalise": "2025-01-06T15:15:03.773Z",
"quantidadeAprovadaAdesao": 1073741824
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0
}
```
# 12. Módulo Contratos

## Reúne dados referentes aos contratos firmados no âmbito público, abrangendo

## informações como objeto, valor, prazo de vigência e partes envolvidas. Este

## módulo permite acompanhar a execução contratual, promovendo maior

## transparência e possibilitando o controle efetivo das obrigações estabelecidas

## entre órgãos governamentais e fornecedores.

## 12.1. Contratos

## Retorna um conjunto de contratos registrados, incluindo dados como número do

## contrato, objeto, vigência e órgãos participantes.

```
Endpoint Método
HTTP
```
```
https://dadosabertos.compras.gov.br/modulo-
contratos/1_consultarContratos?pagina={valor}/{parametro1=valor1}&{para
metroN=valorN}
```
```
GET
```
```
Exemplo Requisição (cURL)
```
```
curl -X 'GET' \
```
```
'https://dadosabertos.compras.gov.br/modulo-contratos/1_consultarContratos' \
```
- H 'accept: */*'


**Voltar ao sumário**

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a
paginação dos
resultados,
permite ao usuário
navegar entre as
páginas de
resultados.
(Default value : 1)
```
```
tamanhoPagina Inteiro Não Ajustar o tamanho
de registros por
página (limite máx.
de 500 registros
por página)
(Default value : 10)
codigoOrgao Inteiro^ Não^ Código do órgão^
codigoUnidadeGestora Inteiro^ Não^ Código da unidade
gestora
responsável
codigoUnidadeGestoraOrigemContrato Inteiro^ Não^ Código da unidade
gestora que deu
origem ao
contrato
codigoUnidadeRealizadoraCompra Inteiro^ Não^ Código da unidade
responsável pela
realização da
compra
numeroContrato Texto^ Não^ Número do
contrato
codigoModalidadeCompra Texto^ Não^ Código da
modalidade de
compra
codigoTipo Inteiro^ Não^ Código do tipo^
codigoCategoria Inteiro^ Não^ Código da
categoria do
contrato
niFornecedor Texto^ Não^ Número de
identificação do
fornecedor
dataVigenciaInicialMin Texto^ Sim^ Data inicial da
vigência
```

**Voltar ao sumário**

```
dataVigenciaInicialMax Texto^ Sim^ Data final da
vigência
```
Dados de Retorno

```
Campo Tipo Descrição
```
```
codigoOrgao Inteiro Código do órgão responsável
```
```
nomeOrgao Texto Nome do órgão responsável
```
```
codigoUnidadeGestora Inteiro Código da unidade gestora
```
```
nomeUnidadeGestora Texto Nome da unidade gestora
```
```
codigoUnidadeGestoraOrigemContrato Inteiro Código da unidade gestora de
origem do contrato
```
```
nomeUnidadeGestoraOrigemContrato Texto Nome da unidade gestora de
origem do contrato
```
```
receitaDespesa Texto Indica se o contrato é de receita
ou despesa
```
```
numeroContrato Texto Número do contrato
```
```
codigoUnidadeRealizadoraCompra Inteiro Código da unidade realizadora da
compra
```
```
nomeUnidadeRealizadoraCompra Texto Nome da unidade realizadora da
compra
```
```
numeroCompra Texto Número da compra associada ao
contrato
```
```
codigoModalidadeCompra Texto Código da modalidade de compra
```
```
nomeModalidadeCompra Texto Nome da modalidade de compra
```
```
codigoUnidadeRequisitante Inteiro Código da unidade requisitante
```
```
nomeUnidadeRequisitante Texto Nome da unidade requisitante
```
```
codigoTipo Inteiro Código do tipo do contrato
```
```
nomeTipo Texto Nome do tipo do contrato
```
```
codigoCategoria Texto Código da categoria do contrato
```

**Voltar ao sumário**

```
nomeCategoria Texto Nome da categoria do contrato
```
```
codigoSubcategoria Texto Código da subcategoria do
contrato
```
```
nomeSubcategoria Texto Nome da subcategoria do
contrato
```
```
niFornecedor Texto Identificação do fornecedor (CNPJ
ou CPF)
```
```
nomeRazaoSocialFornecedor Texto Nome ou razão social do
fornecedor
```
```
processo Texto Número do processo
administrativo do contrato
```
```
objeto Texto Descrição do objeto do contrato
```
```
informacoesComplementares Texto Informações complementares do
contrato
```
```
dataVigenciaInicial Data Data inicial da vigência do
contrato
```
```
dataVigenciaFinal Data Data final da vigência do contrato
```
```
valorGlobal Inteiro Valor total do contrato
```
```
numeroParcelas Inteiro Número total de parcelas do
contrato
```
```
valorParcela Inteiro Valor de cada parcela do contrato
```
```
valorAcumulado Inteiro Valor acumulado do contrato até
o momento
```
```
totalDespesasAcessorias Inteiro Valor total das despesas
acessórias relacionadas ao
contrato
```
```
dataHoraInclusao Data Data e hora de inclusão do
contrato no sistema
```
```
numeroControlePncpContrato Texto Número de controle do contrato
no PNCP
```

**Voltar ao sumário**

```
idCompra Texto Identificador único da compra
associada ao contrato
```
```
dataHoraExclusao Data Data e hora de exclusão do
contrato (se aplicável)
```
```
contratoExcluido Booleano Indicador se o contrato foi
excluído
0 – False/Não
1 – True/Sim
```
Exemplo de Retorno
{
"resultado": [
{
"codigoOrgao": 0,
"nomeOrgao": "string",
"codigoUnidadeGestora": 0,
"nomeUnidadeGestora": "string",
"codigoUnidadeGestoraOrigemContrato": 0,
"nomeUnidadeGestoraOrigemContrato": "string",
"receitaDespesa": "string",
"numeroContrato": "string",
"codigoUnidadeRealizadoraCompra": 0,
"nomeUnidadeRealizadoraCompra": "string",
"numeroCompra": "string",
"codigoModalidadeCompra": "string",
"nomeModalidadeCompra": "string",
"codigoUnidadeRequisitante": 0,
"nomeUnidadeRequisitante": "string",
"codigoTipo": 0,
"nomeTipo": "string",
"codigoCategoria": "string",
"nomeCategoria": "string",
"codigoSubcategoria": "string",
"nomeSubcategoria": "string",
"niFornecedor": "string",
"nomeRazaoSocialFornecedor": "string",
"processo": "string",
"objeto": "string",
"informacoesComplementares": "string",
"dataVigenciaInicial": "2025-02-24T17:55:16.316Z",
"dataVigenciaFinal": "2025-02-24T17:55:16.316Z",
"valorGlobal": 0,
"numeroParcelas": 0,
"valorParcela": 0,
"valorAcumulado": 0,
"totalDespesasAcessorias": 0,
"dataHoraInclusao": "2025-02-24T17:55:16.316Z",
"numeroControlePncpContrato": "string",


**Voltar ao sumário**

```
"idCompra": "string",
"dataHoraExclusao": "2025-02-24T17:55:16.316Z",
"contratoExcluido": true
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0
}
```
12.2. Itens de contrato

Lista ou detalha os itens vinculados a cada contrato, exibindo quantidades,

valores e eventuais atualizações contratuais (aditivos, por exemplo).

```
Endpoint Método
HTTP
```
```
https://dadosabertos.compras.gov.br/modulo-
contratos/2_consultarContratosItem?pagina={valor}/{parametro1=valor1}&{
parametroN=valorN}
```
```
GET
```
```
Exemplo Requisição (cURL)
```
```
curl -X 'GET' \
```
```
'https://dadosabertos.compras.gov.br/modulo-contratos/2_consultarContratosItem'
\
```
- H 'accept: */*'

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a
paginação dos
resultados,
permite ao usuário
navegar entre as
páginas de
resultados.
(Default value : 1)
```

**Voltar ao sumário**

```
tamanhoPagina Inteiro Não Ajustar o tamanho
de registros por
página (limite máx.
de 500 registros
por página)
(Default value : 10)
codigoOrgao Inteiro^ Não^ Código do órgão^
codigoUnidadeGestora Inteiro^ Não^ Código da unidade
gestora
responsável
codigoUnidadeGestoraOrigemContrato Inteiro^ Não^ Código da unidade
gestora que deu
origem ao
contrato
codigoUnidadeRealizadoraCompra Inteiro^ Não^ Código da unidade
responsável pela
realização da
compra
numeroContrato Texto^ Não^ Número do
contrato
codigoModalidadeCompra Texto^ Não^ Código da
modalidade de
compra
tipoItem Inteiro^ Não^ Código do tipo do
item
codigoItem Inteiro^ Não^ Código do item^
niFornecedor Texto^ Não^ Número de
identificação do
fornecedor
dataVigenciaInicialMin Texto^ Sim^ Data inicial da
vigência
dataVigenciaInicialMax Texto^ Sim^ Data final da
vigência
```
Dados de Retorno

```
Campo Tipo Descrição
```
```
codigoOrgao Inteiro Código do órgão responsável
```
```
nomeOrgao Texto Nome do órgão responsável
```
```
codigoUnidadeGestora Inteiro Código da unidade gestora do
contrato
```

**Voltar ao sumário**

```
nomeUnidadeGestora Texto Nome da unidade gestora do
contrato
```
```
codigoUnidadeGestoraOrigemContrato Inteiro Código da unidade gestora de
origem do contrato
```
```
nomeUnidadeGestoraOrigemContrato Texto Nome da unidade gestora de
origem do contrato
```
```
codigoUnidadeRealizadoraCompra Inteiro Código da unidade realizadora da
compra
```
```
nomeUnidadeRealizadoraCompra Texto Nome da unidade realizadora da
compra
```
```
codigoModalidadeCompra Texto Código da modalidade de compra
associada ao contrato
```
```
nomeModalidadeCompra Texto Nome da modalidade de compra
associada ao contrato
```
```
numeroContrato Texto Número do contrato
```
```
niFornecedor Texto Identificação do fornecedor (CNPJ
ou CPF)
```
```
nomeRazaoSocialFornecedor Texto Nome ou razão social do
fornecedor
```
```
processo Texto Número do processo
administrativo do contrato
```
```
dataVigenciaInicial Data Data inicial da vigência do
contrato
```
```
dataVigenciaFinal Data Data final da vigência do contrato
```
```
valorGlobal Decimal Valor total do contrato
```
```
tipoItem Texto Tipo do item do contrato (ex.:
material ou serviço)
```
```
codigoItem Inteiro Código do item do contrato no
catálogo
```
```
descricaoIitem Texto Descrição detalhada do item do
contrato
```

**Voltar ao sumário**

```
quantidadeItem Inteiro Quantidade total do item
contratado
```
```
valorUnitarioItem Decimal Valor unitário do item contratado
```
```
valorTotalItem Decimal Valor total do item no contrato
```
```
dataHoraInclusao Data Data e hora de inclusão do
contrato no sistema
```
```
numeroControlePncpContrato Texto Número de controle do contrato
no PNCP
```
```
idCompra Texto Identificador único da compra
associada ao contrato
```
```
dataHoraExclusaoContrato Data Data e hora de exclusão do
contrato (se aplicável)
```
```
contratoExcluido Booleano Indicador se o contrato foi
excluído
0 – False/Não
1 – True/Sim
```
```
numeroCompra Texto Número da compra associada ao
contrato
```
```
dataHoraExclusaoItem Data Data e hora de exclusão do item
no contrato (se aplicável)
```
```
contratoItemExcluido Booleano Indicador se o item do contrato foi
excluído
0 – False/Não
1 – True/Sim
```
```
numeroItem Texto Número do item no contrato
```
Exemplo de Retorno
{
"resultado": [
{
"codigoOrgao": 0,
"codigoUnidadeGestora": 0,
"codigoUnidadeGestoraOrigemContrato": 0,
"codigoUnidadeRealizadoraCompra": 0,
"codigoModalidadeCompra": "string",


**Voltar ao sumário**

```
"numeroContrato": "string",
"niFornecedor": "string",
"nomeRazaoSocialFornecedor": "string",
"processo": "string",
"dataVigenciaInicial": "2025-02-24T19:02:32.415Z",
"dataVigenciaFinal": "2025-02-24T19:02:32.415Z",
"valorGlobal": 0,
"tipoItem": "string",
"codigoItem": 0,
"descricaoIitem": "string",
"quantidadeItem": 0,
"valorUnitarioItem": 0,
"valorTotalItem": 0,
"dataHoraInclusao": "2025-02-24T19:02:32.415Z",
"numeroControlePncpContrato": "string",
"idCompra": "string",
"dataHoraExclusaoContrato": "2025-02-24T19:02:32.415Z",
"contratoExcluido": true,
"nomeOrgao": "string",
"nomeUnidadeGestora": "string",
"nomeUnidadeGestoraOrigemContrato": "string",
"nomeUnidadeRealizadoraCompra": "string",
"nomeModalidadeCompra": "string",
"numeroCompra": "string",
"dataHoraExclusaoItem": "2025-02-24T19:02:32.415Z",
"contratoItemExcluido": true,
"numeroItem": "string"
}
],
"totalRegistros": 0,
"totalPaginas": 0,
"paginasRestantes": 0
}
```
# 13. Módulo Fornecedor

## Este módulo permite a consulta de dados cadastrais de fornecedores registrados

## no sistema, possibilitando a verificação de status, porte e natureza jurídica. É

## essencial para a qualificação das empresas nas etapas de seleção.

## 13.1. Consultar Fornecedor

## Serviço que permite consultar a lista de fornecedores registrados, oferecendo

## filtros por CNPJ, CPF, natureza jurídica, porte da empresa e situação cadastral

## (ativo/inativo).


**Voltar ao sumário**

```
Endpoint Método
HTTP
```
```
https://dadosabertos.compras.gov.br/modulo-
fornecedor/1_consultarFornecedor?pagina={valor}
```
```
GET
```
```
Exemplo Requisição (cURL)
```
```
curl -X 'GET' \
```
```
' https://dadosabertos.compras.gov.br/modulo-fornecedor/1_consultarFornecedor'\
```
- H 'accept: */*'

Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
pagina Inteiro Não Referente a
paginação dos
resultados, permite
ao usuário navegar
entre as páginas de
resultados. (Default
value : 1)
```
```
tamanhoPagina Inteiro Não Ajustar o tamanho de
registros por página
(limite máx. de 500
registros por página)
(Default value : 10)
cnpj Texto^ Não^ Filtro por CNPJ do
fornecedor
```
```
cpf Texto^ Não^ Filtro por CPF do
fornecedor
naturezaJuridicaId Inteiro^ Não^ Código identificador
da natureza jurídica
```
```
porteEmpresaId Inteiro^ Não^ Código identificador
do porte da empresa
```
```
codigoCnae Inteiro^ Não^ Código da
Classificação
Nacional de
Atividades
Econômicas
```

**Voltar ao sumário**

```
ativo Booleano^ Sim^ Filtra fornecedores
ativos ou inativos
```
Dados de Retorno

```
Campo Tipo Descrição
```
```
ativo Booleano Indica se o fornecedor está ativo
no cadastro
```
```
cnpj Texto Número do CNPJ
```
```
codigoCnae Inteiro Código CNAE principal
```
```
municipio Texto Nome do município do fornecedor
```
```
naturezaJuridica Texto Descrição da natureza jurídica
```
```
porteEmpresaNome Texto Descrição do porte da empresa
(ex: ME/EPP)
```
```
nomeRazaoSocialFornecedor Texto Razão social ou nome do
fornecedor
```
Exemplo de Retorno
{
"resultado": [
{
"ativo": true,
"cnpj": "string",
"codigoCnae": 0,
"municipio": "string",
"naturezaJuridicaId": 0,
"naturezaJuridica": "string",
"porteEmpresaId": 0,
"porteEmpresaNome": "string",
"nomeRazaoSocialFornecedor": "string"
}
],
"totalPaginas": 0,
"paginasRestantes": 0
} "paginasRestantes": 0
}


**Voltar ao sumário**

# 14. Módulo OCDS (Open Contracting Data Standard)

## O OCDS é um padrão global de dados abertos para contratações públicas. Este

## módulo entrega os dados estruturados conforme normas internacionais,

## facilitando a interoperabilidade e a análise comparativa de gastos públicos.

## 14.1. Releases

## Serviço que permite consultar as contratações ("releases") formatadas segundo o

## padrão Open Contracting Data Standard, possibilitando a extração de todo o ciclo

## de vida da contratação em um formato universalmente aceito.

```
Endpoint Método
HTTP
```
```
https://dadosabertos.compras.gov.br/modulo-
ocds/1_releases?page={valor}
```
```
GET
```
```
Exemplo Requisição (cURL)
```
```
curl -X 'GET' \
'https://dadosabertos.compras.gov.br/modulo-ocds/1_releases' \
-H 'accept: */*'
```
## Parâmetros da Solicitação

```
Campo tipo Obrigatório Descrição
```
```
page Inteiro Não Referente a
paginação dos
resultados, permite
ao usuário navegar
entre as páginas de
resultados. (Default
value : 1)
```
```
offset Inteiro Não Ajustar o tamanho de
registros por página
(limite máx. de 500
registros por página)
(Default value : 10)
buyerID Texto^ Sim^ Identificador do
comprador
```

**Voltar ao sumário**

```
releaseStartDate Texto^ Sim^ Data inicial da
publicação
releaseEndDate Texto^ Sim^ Data final da
publicação
```
Dados de Retorno

O retorno segue o padrão internacional OCDS. Abaixo estão listados os principais

objetos estruturantes. Para a definição detalhada de todos os subcampos,

consulte a Documentação Oficial OCDS**.**

```
Campo Tipo Descrição
```
```
publisherDTO Objeto Informações sobre a entidade que
publica os dados (MGI)
```
```
releases Lista Lista de lançamentos
(contratações) contendo todo o
ciclo de vida
```
```
releases.ocid Texto Identificador Open Contracting ID
(Único globalmente)
```
```
releases.buyer Objeto Informações do órgão comprador
(ID e Nome)
```
```
releases.tender Objeto Detalhes da licitação (Objeto,
datas, valores, itens)
```
```
releases.awards Lista Detalhes da adjudicação e
fornecedores vencedores
```
```
releases.parties Lista Lista de todas as partes
envolvidas (comprador,
fornecedor, pagador)
```
Exemplo de Retorno (Simplificado)
{
"publisherDTO": {
"name": "Ministério da Gestão e da Inovação",
"uri": "https://www.gov.br/mgi"
},
"releases": [
{
"ocid": "ocds-76916x-00000000",


**Voltar ao sumário**

```
"buyer": {
"id": "BR-CNPJ-00000000",
"name": "Órgão Exemplo"
},
"tender": {
"id": "123456",
"title": "Aquisição de Material de Escritório",
"status": "complete"
},
"awards": [
{
"id": "award-1",
"status": "active",
"suppliers": [
{
"name": "Empresa Vencedora LTDA"
}
]
}
],
"parties": [
{
"id": "BR-CNPJ-00000000",
"name": "Órgão Exemplo",
"roles": ["buyer"]
},
{
"id": "BR-CNPJ-11111111",
"name": "Empresa Vencedora LTDA",
"roles": ["supplier"]
}
]
}
]
}
```

