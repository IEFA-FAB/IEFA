# STYLE CONTRACT — Portal IEFA
## Pale Brutalism · Edição 2026

> "Bordas falam mais alto que sombras.  
>  Tracking negativo é elegância.  
>  Zero raio é honestidade estrutural."

Referências-chave: **adidas.com** · **greptile.com** · **Vercel Geist** · **Linear 2025**

---

## 1. Princípios

| Princípio | Regra |
|-----------|-------|
| **Border-first** | Toda superfície tem fronteira visível (`1px`). Sombras não definem hierarquia — bordas definem. |
| **Zero radius** | `--radius: 0rem`. Nenhum componente usa `rounded-lg`, `rounded-xl` ou `rounded-full`, exceto pílulas explicitamente solicitadas. |
| **Paleta acromática** | Uma rampa de cinzas neutra (`--gray-50` → `--gray-950`). Sem azul, roxo, verde no sistema. O canvas é off-white quente, não néon. |
| **Tracking negativo em display** | Todo heading ≥ `h2` usa `letter-spacing: var(--tracking-tight)`. `h1` usa `var(--tracking-tighter)`. |
| **Uppercase só em labels** | Tags, badges, cabeçalhos de coluna de tabela: `uppercase + letter-spacing: var(--tracking-label)`. Nunca em body ou headings. |
| **Sombra estrutural** | Se sombra for necessária, é o `box-shadow` hard-offset (`--shadow-hard-md: 4px 4px 0 0 currentColor`) — sem blur. |
| **Duas famílias de fonte** | IBM Plex Sans (UI, body) + Lora (editorial, artigos, pullquotes). |
| **Foco explícito** | `outline: 2px solid var(--ring)` com `outline-offset: 2px`. Nenhum `ring` colorido difuso. |

---

## 2. Paleta de Tokens

### 2.1 Rampa de Cinzas (base)

| Token | Lightness OKLCH | Hex aproximado | Uso |
|-------|----------------|----------------|-----|
| `--gray-50`  | `oklch(0.9900 0 0)` | `#fafafa` | Backgrounds sutis |
| `--gray-100` | `oklch(0.9671 0 0)` | `#f4f4f5` | Secondary, Muted, Sidebar |
| `--gray-150` | `oklch(0.9400 0 0)` | `#ebebec` | Hover muito sutil |
| `--gray-200` | `oklch(0.9127 0 0)` | `#e4e4e7` | Accent (hover) |
| `--gray-300` | `oklch(0.8546 0 0)` | `#d4d4d8` | Border padrão |
| `--gray-400` | `oklch(0.6988 0 0)` | `#a1a1aa` | Ícones, disabled |
| `--gray-500` | `oklch(0.5600 0 0)` | `#71717a` | Muted foreground |
| `--gray-600` | `oklch(0.4401 0 0)` | `#52525b` | Texto secundário |
| `--gray-700` | `oklch(0.3549 0 0)` | `#3f3f46` | Texto de ênfase |
| `--gray-800` | `oklch(0.2447 0 0)` | `#27272a` | Dark: accent, input |
| `--gray-900` | `oklch(0.1770 0 0)` | `#18181b` | Dark: muted |
| `--gray-950` | `oklch(0.1000 0 0)` | `#09090b` | Foreground primário |

### 2.2 Tokens Semânticos (Light)

| Token CSS | Valor | Uso |
|-----------|-------|-----|
| `--background` | `oklch(0.9875 0.003 98)` | Canvas: off-white levemente quente |
| `--foreground` | `oklch(0.1000 0 0)` | Texto primário |
| `--card` | `oklch(1.0000 0 0)` | Superfície de cartão (branco puro sobre canvas) |
| `--primary` | `oklch(0.1000 0 0)` | CTA principal — preto |
| `--primary-foreground` | `oklch(1.0000 0 0)` | Texto sobre primary |
| `--secondary` | `--gray-100` | Botão secundário, pill |
| `--muted` | `--gray-100` | Área muted |
| `--muted-foreground` | `--gray-500` | Texto muted |
| `--accent` | `--gray-200` | Hover de nav, seleções |
| `--border` | `--gray-300` | Todas as bordas padrão |
| `--input` | `--gray-300` | Borda de inputs |
| `--ring` | `oklch(0.1000 0 0)` | Foco — preto explícito |
| `--radius` | `0rem` | **Nenhum arredondamento** |
| `--destructive` | `oklch(0.5771 0.2450 27.33)` | Vermelho — único acento cromático |

### 2.3 Tokens Semânticos (Dark)

| Token CSS | Valor | Descrição |
|-----------|-------|-----------|
| `--background` | `oklch(0.1000 0 0)` | Fundo quase-preto |
| `--foreground` | `oklch(0.9671 0 0)` | Texto quase-branco |
| `--card` | `oklch(0.1500 0 0)` | Superfície elevada |
| `--primary` | `oklch(0.9671 0 0)` | CTA — branco |
| `--primary-foreground` | `oklch(0.1000 0 0)` | Texto sobre primary |
| `--border` | `--gray-800` | Borda dark |
| `--ring` | `oklch(0.9671 0 0)` | Foco — branco explícito |

---

## 3. Tipografia

### 3.1 Famílias

| Variável | Fonte | Uso |
|----------|-------|-----|
| `--font-sans` | **IBM Plex Sans** (Variable) | UI, navegação, formulários, body geral |
| `--font-serif` | **Lora** (Variable) | Artigos científicos, pullquotes, resumos |
| `--font-mono` | **IBM Plex Mono** | Código, DOI, identificadores técnicos |

> IBM Plex Sans é ideal para este aesthetic: técnico, geométrico, com personalidade editorial. Alinha-se perfeitamente com adidas/DIN e Linear/Inter.

### 3.2 Tracking (Letter-spacing)

| Token | Valor | Uso |
|-------|-------|-----|
| `--tracking-tighter` | `-0.04em` | `h1`, display hero |
| `--tracking-tight` | `-0.02em` | `h2`, `h3`, headlines |
| `--tracking-normal` | `-0.01em` | Body padrão (define no `body`) |
| `--tracking-label` | `+0.06em` | Labels, tags, badges uppercase |

> O tracking levemente negativo no body (`-0.01em`) é a assinatura visual mais importante desta estética. Separa de UI genérica.

### 3.3 Escala de Display

```css
/* Uso via classes utilitárias */
.text-display   → clamp(2.5rem, 6vw, 4.5rem) · weight 700 · tracking -0.04em
.text-headline  → clamp(1.75rem, 4vw, 2.5rem) · weight 600 · tracking -0.02em
.text-label     → 0.6875rem (11px) · weight 500 · uppercase · tracking +0.06em
```

---

## 4. Geometria

### 4.1 Radius — Zero

```css
--radius:    0rem;   /* tudo quadrado */
--radius-sm: 0px;
--radius-md: 0px;
--radius-lg: 0rem;
--radius-xl: 0px;
```

**Exceção única**: `outline-offset: 2px` no foco não é radius — é distância.

### 4.2 Bordas

| Espessura | Uso |
|-----------|-----|
| `1px` | Padrão absoluto: cards, inputs, tabelas, separadores, nav |
| `2px` | Ênfase: elemento ativo, selecionado, `.border-hard` |
| `3px` | Brutalista explícito: CTA destaque, `.shadow-hard-*` offset |

### 4.3 Sombras

| Token | Valor | Uso |
|-------|-------|-----|
| `--shadow-none` | `none` | Padrão de tudo |
| `--shadow-xs` | `0 1px 2px oklch(0 0 0 / 0.04)` | Máximo permitido em Pole B |
| `--shadow-hard-sm` | `3px 3px 0 0 currentColor` | Cards brutalistas |
| `--shadow-hard-md` | `4px 4px 0 0 currentColor` | CTAs destacados |
| `--shadow-hard-lg` | `6px 6px 0 0 currentColor` | Heroes, modais especiais |

**Regra**: Nunca `box-shadow` com blur em elementos comuns. Se um componente precisa de elevação, use borda mais escura, não sombra.

---

## 5. Componentes

### 5.1 Botões

```tsx
// PRIMARY — preto total, texto branco, zero radius
<Button variant="default">Submeter Artigo</Button>
// → bg-primary text-primary-foreground border-0 radius-0
// → hover: bg-gray-800 (via accent ajustado)

// OUTLINE — borda 1px preta, fundo transparente
<Button variant="outline">Cancelar</Button>
// → border border-foreground bg-transparent
// → hover: bg-accent

// GHOST — sem borda, fundo transparente
<Button variant="ghost">Ver mais</Button>
// → hover: bg-accent

// BRUTALISTA (modificador)
<Button className="shadow-hard-md brutal-hover">CTA Destaque</Button>
// → sombra offset 4px + hover translada + shadow some
```

**Regra tipográfica nos botões**: sem `uppercase`. Peso `500`. Tamanho `14px` (`text-sm`).

### 5.2 Cards

```tsx
// PADRÃO — borda 1px, fundo branco, zero shadow
<Card className="rounded-none border-border">

// STRONG — borda mais visível
<Card className="rounded-none border-foreground/20">

// BRUTALISTA — borda 2px + shadow offset
<Card className="rounded-none border-hard shadow-hard-md brutal-hover">
```

### 5.3 Inputs

```tsx
// Border visível em repouso (gray-300), escurece no foco
<Input className="rounded-none border-input focus:border-foreground" />
// → placeholder: text-muted-foreground
// → focus: outline-ring (preto, 2px, sem blur)
```

### 5.4 Badges / Tags

```tsx
// Use .tag (utilitário CSS) ou Badge com variante secondary
<Badge variant="secondary" className="rounded-none text-label uppercase tracking-[0.06em]">
  Em Revisão
</Badge>
```

Cores permitidas para badges de status:
- `default` (cinza) → padrão
- `secondary` → cinza-100
- `destructive` → vermelho (status crítico)
- **Evitar**: variantes coloridas custom

### 5.5 Separadores de Seção

```tsx
// Horizontal rule como separador estrutural (greptile-pattern)
<hr className="section-rule" />

// Separador do shadcn
<Separator className="my-0" />
```

### 5.6 Navegação / Header

```tsx
// Nav links: sem rounded, background accent no hover/active
className="px-3 py-2 text-sm font-medium hover:bg-accent [&.active]:bg-accent [&.active]:text-accent-foreground"

// Nenhum efeito glow, gradiente ou blur no header
// backdrop-blur é permitido apenas na barra sticky
```

### 5.7 Tabelas (Editorial/Kanban)

```tsx
// Cabeçalho de coluna: text-label (uppercase + tracking)
<TableHead className="text-label text-muted-foreground h-9">
  Status
</TableHead>

// Linhas: border-bottom, sem zebra colorida
<TableRow className="border-b hover:bg-accent">
```

---

## 6. Layout e Estrutura

### 6.1 Container

```tsx
// Padrão do portal
const container = "w-full mx-auto px-4 sm:px-6 md:px-8 lg:max-w-[1100px] xl:max-w-[1280px] 2xl:max-w-[1400px]"

// Wide (artigos, editorial)
className="container-wide"  // max-w-[1500px]
```

### 6.2 Frame de Página (greptile-pattern)

Para seções que beneficiam de delimitação lateral explícita:
```tsx
<div className="page-frame min-h-screen">
  {/* border-x: 1px solid --border */}
</div>
```

### 6.3 Header

- Sticky: `border-b backdrop-blur`
- Altura: `h-14` (56px)
- Background: `bg-background/95` com `supports-backdrop-filter:bg-background/60`
- Sem gradientes radiais de fundo (remover o `before:bg-[radial-gradient(...)]` do AppLayout)
- Sem dot-grid (`after:bg-[...]`) — estrutura limpa

> **Breaking change vs. atual**: O AppLayout tem gradientes radiais coloridos e dot-grid no `before:`/`after:`. Esses elementos devem ser removidos para consistência com o contrato.

### 6.4 Footer

- `border-t`
- Altura: `h-14`
- Texto: `text-xs text-muted-foreground`
- Conteúdo alinhado ao centro

---

## 7. O que Remover

| Elemento atual | Substituição |
|----------------|--------------|
| `--radius: 1.3rem` | `--radius: 0rem` ✅ já feito |
| Gradientes radiais coloridos no body (`radial-gradient(rgb(52 211 153)...`) | Background `bg-background` simples |
| Dot-grid no body (`after:bg-[radial-gradient(circle_at_1px...])`) | Remover — ruído visual |
| Sombras coloridas (`hsl(202 89% 53% / 0.15)`) | Remover — já zerado em `styles.css` |
| `hero-highlight.tsx` com gradiente ambient | Substituir por seção com border-bottom simples |
| `--font-sans: Open Sans` no dark mode | Uniformizar para IBM Plex Sans em ambos os modos |
| `font-display: swap` com atraso visível | Manter swap, mas priorizar preload em `__root.tsx` |
| Colors oklch com chroma alto (primary `0.1606 244`) | Substituído por cinzas ✅ já feito |

---

## 8. Gradiente de Adoção — O que fazer agora vs. depois

### Agora (styles.css — feito ✅)
- [x] Tokens de cor reformulados
- [x] `--radius: 0rem`
- [x] Sombras zeradas
- [x] Tracking negativo no body/headings
- [x] Classes utilitárias `.text-display`, `.text-headline`, `.text-label`, `.tag`, `.shadow-hard-*`, `.brutal-hover`, `.section-rule`, `.page-frame`

### Próximos — Componentes

1. **AppLayout.tsx**: remover gradientes radiais + dot-grid do body wrapper
2. **AppLayout.tsx**: nav links — remover `rounded-md`, adicionar animação de underline em vez de `bg-accent`
3. **AppCard.tsx / PostCard.tsx**: `rounded-none`, adicionar `shadow-hard-sm` opcional
4. **AuthScreen.tsx**: remover `HeroHighlight`, substituir por layout de duas colunas com `border-r`
5. **hero-highlight.tsx**: deprecar ou converter para seção tipográfica simples
6. **StatusBadge.tsx**: aplicar `.text-label` + `.tag`
7. **KanbanBoard.tsx**: colunas com `border-r` em vez de fundo colorido
8. **SubmissionForm steps**: progress bar como linha `1px` em vez de barra colorida

---

## 9. Cheat Sheet Rápido

```
COR          → cinza-50 até cinza-950 · 1 acento (vermelho/destructive apenas)
RADIUS       → 0 (sempre)
SOMBRA       → none (padrão) · shadow-hard-md (destaque)
BORDER       → 1px solid (padrão) · 2px solid (ênfase)
TRACKING     → -0.04em (h1) · -0.02em (h2-h3) · -0.01em (body) · +0.06em (labels)
UPPERCASE    → apenas labels/tags/badges, não headings ou botões
FONTE        → IBM Plex Sans (UI) · Lora (editorial)
FOCO         → outline: 2px solid ring · outline-offset: 2px
HOVER        → bg-accent (cinza-200) · nunca glow/blur
SEPARADOR    → <hr class="section-rule"> (border-top 1px)
```

---

*Contrato estabelecido em 2026-04-07. Revisão a cada mudança de design system.*
