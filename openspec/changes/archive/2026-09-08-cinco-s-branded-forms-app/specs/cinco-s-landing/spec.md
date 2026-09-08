## ADDED Requirements

### Requirement: Landing page institucional do programa 5S
Quando o tenant é `"cinco-s"`, a rota `/` DEVE exibir uma landing page institucional dedicada ao programa 5S, substituindo a landing page genérica "Formulários IEFA".

#### Scenario: Acesso à landing no tenant cinco-s
- **WHEN** um usuário acessa `/` com tenant `"cinco-s"`
- **THEN** a página exibe conteúdo institucional do programa 5S com explicação dos 5 sensos, metodologia e CTA para acessar os checklists

#### Scenario: Acesso à landing no tenant forms
- **WHEN** um usuário acessa `/` com tenant `"forms"`
- **THEN** a landing page genérica atual ("Formulários IEFA") é exibida sem alteração

### Requirement: Conteúdo dos 5 sensos na landing
A landing page DEVE apresentar a base 5S com os 5 sensos da metodologia, cada um com nome e descrição.

#### Scenario: Exibição dos 5 sensos
- **WHEN** a landing page 5S é renderizada
- **THEN** são exibidos os 5 sensos: 1° S Utilização, 2° S Ordenação, 3° S Limpeza, 4° S Padronização, 5° S Disciplina — cada um com ícone e descrição breve

### Requirement: Ciclo VETOR de 7 fases
A landing page DEVE apresentar o ciclo contínuo VETOR com as 7 fases do programa: Nivelar (N), Implementar (I), Tornar Padrão (T), Inspecionar (I), Demonstrar (D), Utilizar (U), Sofisticar (S).

#### Scenario: Exibição das 7 fases
- **WHEN** a landing page 5S é renderizada
- **THEN** são exibidas as 7 fases do ciclo VETOR em formato circular/sequencial, com nome, letra identificadora e objetivo de cada fase

### Requirement: Seção de contexto institucional
A landing page DEVE conter branding SEFA e propósito do programa: "Promover ambientes organizados, padronizados e sustentáveis, impulsionando a eficiência, a qualidade e a melhoria contínua em todas as unidades."

#### Scenario: Seção institucional visível
- **WHEN** a landing page 5S é renderizada
- **THEN** são exibidos: nome "Programa VETOR 5S — Melhoria Contínua", slogan "Direção clara. Esforços alinhados. Excelência contínua.", propósito, benefícios (Mais Eficiência, Menos Desperdícios, Mais Qualidade, Engajamento, Melhoria Contínua) e princípios (Simplicidade, Disciplina, Continuidade)

### Requirement: Rodapé institucional SEFA
A landing page DEVE exibir rodapé com "Secretaria de Economia, Finanças e Administração da Aeronáutica — Gestão com Eficiência, Disciplina e Inovação".

#### Scenario: Rodapé SEFA
- **WHEN** a landing page 5S é renderizada
- **THEN** o rodapé exibe a identificação institucional da SEFA

### Requirement: Navegação para autenticação
A landing page 5S DEVE ter botões de ação para login/cadastro, análogos à landing genérica.

#### Scenario: CTA de login
- **WHEN** o usuário clica em "Entrar" ou "Criar conta" na landing 5S
- **THEN** é redirecionado para `/auth` (mesmo fluxo de autenticação do forms)

### Requirement: Lazy loading do componente da landing 5S
O componente da landing page 5S DEVE ser carregado via `React.lazy` para que o bundle do tenant `"forms"` não inclua código da landing 5S.

#### Scenario: Bundle forms não inclui landing 5S
- **WHEN** o tenant é `"forms"` e a rota `/` é acessada
- **THEN** o chunk da landing 5S NÃO é carregado pelo browser

#### Scenario: Landing 5S carregada sob demanda
- **WHEN** o tenant é `"cinco-s"` e a rota `/` é acessada
- **THEN** o chunk da landing 5S é carregado e renderizado
