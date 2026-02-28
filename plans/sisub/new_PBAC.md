# Manual de Implementação: Migração de RBAC Cumulativo para Scoped PBAC (Policy-Based Access Control)

**Objetivo:** Substituir o modelo antigo de papéis (Roles) cumulativos por um sistema de permissões granulares baseadas em Módulo, Nível e Escopo (Localidade), otimizado para TanStack Start (Router + Query + Server Functions).

## Fase 1: Banco de Dados (PostgreSQL)

**1.1. Criar a nova tabela de permissões**
Execute o seguinte script SQL para criar a tabela `user_permissions` no schema `sisub`. Esta tabela substitui qualquer coluna antiga de `role` na tabela `user_data`.

```sql
CREATE TABLE sisub.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- O Quê (Módulo e Nível)
  module text NOT NULL, -- Valores esperados: 'diner', 'messhall', 'local', 'global', 'analytics', 'storage'
  level int NOT NULL DEFAULT 1, -- 0 = Acesso Negado (Deny explícito), > 0 = Níveis de acesso
  
  -- Onde (Escopo - Exclusive Arcs)
  mess_hall_id int8 REFERENCES sisub.mess_halls(id) ON DELETE CASCADE,
  kitchen_id int8 REFERENCES sisub.kitchens(id) ON DELETE CASCADE,
  unit_id int8 REFERENCES sisub.units(id) ON DELETE CASCADE,
  
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Restrição: Garante que no máximo 1 escopo seja preenchido (se todos nulos = Global)
  CONSTRAINT exclusive_scope CHECK (
      num_nonnulls(mess_hall_id, kitchen_id, unit_id) <= 1
  )
);

CREATE INDEX idx_user_permissions_user_id ON sisub.user_permissions(user_id);
```

**1.2. Limpeza (Opcional/Posterior)**
Após a migração dos dados, remover a coluna antiga de `role` da tabela `user_data` (se existir).

---

## Fase 2: Backend (Server Functions & Tipagem)

**2.1. Definir as Tipagens (TypeScript)**
Crie as interfaces para o novo modelo de permissões:

```typescript
export type AppModule = 'diner' | 'messhall' | 'local' | 'global' | 'analytics' | 'storage';

export interface UserPermission {
  module: AppModule;
  level: number;
  mess_hall_id: number | null;
  kitchen_id: number | null;
  unit_id: number | null;
}
```

**2.2. Criar a Server Function de Busca de Permissões (`getUserPermissions`)**
Crie uma Server Function que busca as permissões do usuário no banco. 
**Regra de Negócio Importante (Implicit Allow):** Se o banco não retornar nenhuma linha para o módulo `diner`, a função deve injetar artificialmente uma permissão `{ module: 'diner', level: 1, ...null }`. Se retornar `level: 0`, o acesso continua negado.

```typescript
// Exemplo lógico da Server Function
export const fetchUserPermissions = createServerFn(async (userId: string) => {
  const dbPermissions = await db.query('SELECT * FROM sisub.user_permissions WHERE user_id = $1', [userId]);
  
  const permissions: UserPermission[] = [...dbPermissions];

  // Regra de Exceção: Todo usuário válido é comensal, a menos que tenha level 0 explícito
  const hasDinerRule = permissions.find(p => p.module === 'diner');
  if (!hasDinerRule) {
    permissions.push({
      module: 'diner',
      level: 1,
      mess_hall_id: null,
      kitchen_id: null,
      unit_id: null
    });
  }

  // Filtra as permissões com level 0 (pois servem apenas para negar o implicit allow)
  return permissions.filter(p => p.level > 0);
});
```

---

## Fase 3: Frontend (TanStack Query Caching)

**3.1. Configurar a Query de Permissões**
Crie uma `queryOptions` para armazenar as permissões no cliente com um `staleTime` longo para garantir navegação instantânea.

```typescript
export const userPermissionsQueryOptions = (userId: string) => queryOptions({
  queryKey: ['userPermissions', userId],
  queryFn: () => fetchUserPermissions(userId),
  staleTime: 1000 * 60 * 30, // 30 minutos de cache no cliente
  gcTime: 1000 * 60 * 60, // 1 hora
});
```

---

## Fase 4: Roteamento e Autorização (TanStack Router)

**4.1. Atualizar o `beforeLoad` das Rotas**
Substitua a verificação antiga baseada em `role` por uma função utilitária que checa o módulo, o nível mínimo e o escopo.

```typescript
// Função utilitária para checar permissão no frontend
export const hasPermission = (
  permissions: UserPermission[], 
  targetModule: AppModule, 
  minLevel: number = 1,
  scope?: { type: 'unit' | 'mess_hall' | 'kitchen', id: number }
) => {
  return permissions.some(p => {
    if (p.module !== targetModule || p.level < minLevel) return false;
    
    // Se a permissão for global (todos escopos nulos), permite acesso a qualquer escopo local
    const isGlobal = p.unit_id === null && p.mess_hall_id === null && p.kitchen_id === null;
    if (isGlobal) return true;

    // Se um escopo específico foi exigido na checagem, valida se bate com a permissão
    if (scope) {
      if (scope.type === 'unit' && p.unit_id === scope.id) return true;
      if (scope.type === 'mess_hall' && p.mess_hall_id === scope.id) return true;
      if (scope.type === 'kitchen' && p.kitchen_id === scope.id) return true;
      return false;
    }

    return true;
  });
};
```

**4.2. Aplicação no Router (`beforeLoad`)**
```typescript
// Exemplo na rota /local
beforeLoad: async ({ context, location }) => {
  const permissions = await context.queryClient.ensureQueryData(
    userPermissionsQueryOptions(context.auth.userId)
  );

  // Verifica se tem acesso ao módulo 'local' (nível 1+)
  if (!hasPermission(permissions, 'local', 1)) {
    throw redirect({ to: '/hub', replace: true });
  }
}
```

---

## Fase 5: Segurança Real (Backend Mutations)

**Regra de Ouro:** O cache do frontend (30 min) é apenas para UX. A segurança real ocorre nas Server Functions que executam ações (POST/PUT/DELETE).

**5.1. Validação nas Server Functions de Ação**
Toda Server Function que altera dados **deve** consultar o banco de dados (ou contexto de auth atualizado no servidor) para validar a permissão no momento da execução.

```typescript
export const createDailyMenu = createServerFn(async (data: MenuData) => {
  const userId = getAuthUserId(); // Pega do contexto da requisição
  
  // 1. Busca permissão direto no banco (ignora cache do frontend)
  const dbPermissions = await getPermissionsFromDB(userId);
  
  // 2. Valida se o usuário tem nível 2 (escrita) no módulo 'local' para a kitchen específica
  const canEdit = hasPermission(dbPermissions, 'local', 2, { type: 'kitchen', id: data.kitchenId });
  
  if (!canEdit) {
    throw new Error('FORBIDDEN_403'); // Lança erro de autorização
  }

  // 3. Executa a inserção no banco...
});
```

**5.2. Tratamento de Erro no Frontend (Invalidação de Cache)**
Configure o seu cliente HTTP (ou o `onError` das Mutations do React Query) para observar erros `403`. Se ocorrer um `403`, force a invalidação do cache de permissões para que o frontend se atualize imediatamente.

```typescript
// No setup do React Query ou interceptor
onError: (error) => {
  if (error.message === 'FORBIDDEN_403') {
    queryClient.invalidateQueries({ queryKey: ['userPermissions'] });
    // Opcional: Redirecionar para /hub ou mostrar Toast "Permissão revogada"
  }
}
```

---
**Instrução final para o Claude:** Leia este documento, crie a migration SQL primeiro, atualize as tipagens, implemente a Server Function de busca com a regra do `diner`, e por fim refatore os `beforeLoad` do TanStack Router.