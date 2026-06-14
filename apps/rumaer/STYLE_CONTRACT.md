# STYLE CONTRACT — RUMAER
## Institucional Aeronáutico · 2026

> Azul-aeronáutica do RCA 35-2/2023 + dourado discreto.
> Cantos suaves, sombras macias, neutros tintados de navy.
> Linguagem de componentes alinhada ao **sisub** (Manrope, radius, ring-card).

Substitui o antigo contrato Pale Brutalism (herdado do portal). O rumaer **não** segue mais o design system do portal.

---

## 1. Princípios

| Princípio | Regra |
|-----------|-------|
| **Cor com intenção** | Navy (`--primary`) carrega a identidade; dourado é acento ≤10% (CTA, hover, detalhes). Nunca dourado como superfície. |
| **Cantos suaves** | `--radius: 0.625rem`. Cards `rounded-xl`, inputs/botões `rounded-lg`/`rounded-md`, hero `rounded-[1.5rem]`. Sem `rounded-none` (exceto inputs agrupados). |
| **Sombra macia** | Elevação por `shadow-sm`/`shadow-md` tintados de navy. Zero sombra hard-offset (brutalismo removido). |
| **Neutros tintados** | Cinzas puxam para o hue navy (264). Sem cinza morto. |
| **Tarefa primeiro** | A landing serve 4 objetivos: achar rápido (busca), entender, montar, tirar dúvidas. Sem métricas de vitrine. |
| **Listas, não cards repetidos** | Entidades em lista usam linhas com filete (`border-b`), não grid de cards idênticos. Card = seção/entidade isolada. |
| **Fonte única** | **Manrope** (UI + display). Lora reservada a uso editorial pontual. |

---

## 2. Tokens (light)

| Token | Valor | Uso |
|-------|-------|-----|
| `--navy` | `oklch(0.33 0.095 264)` | `--primary`, hero, headings |
| `--navy-2` | `oklch(0.39 0.10 264)` | Gradiente/hover de painel |
| `--navy-deep` | `oklch(0.27 0.085 264)` | Hover de botão primary, sombras |
| `--gold` | `oklch(0.78 0.095 86)` | Acento, eyebrow, CTA |
| `--gold-2` | `oklch(0.70 0.10 82)` | Acento em hover/seta |
| `--background` | `oklch(1 0 0)` | Canvas |
| `--foreground` | `oklch(0.22 0.022 264)` | Texto |
| `--card` | `oklch(0.985 0.003 250)` | Superfície de card (cinza-frio) |
| `--muted-foreground` | `oklch(0.50 0.018 264)` | Texto secundário |
| `--border` | `oklch(0.905 0.008 264)` | Bordas / filetes |
| `--ring` | `var(--navy)` | Foco |

Expostos ao Tailwind via `@theme inline`: `bg-navy`, `text-gold`, `bg-navy-deep`, `fill-gold`, `border-gold`, `text-gold-2`, etc. Dark mode definido em `.dark` (navy escuro, primary azul claro).

---

## 3. Tipografia

- `--font-sans: Manrope`. Headings peso 700; `h1` peso 800.
- Tracking: `--tracking-tighter -0.03em` (h1) · `--tracking-tight -0.02em` (h2/h3) · `--tracking-normal -0.011em` (body) · `--tracking-label 0.05em` (labels uppercase).
- Utilitários: `.text-display`, `.text-headline`, `.text-label`.

---

## 4. Componentes

- **Button** (`ui/button`): primary = navy com `shadow-xs`, hover `bg-navy-deep` + `shadow-md` + lift `-translate-y-0.5`. Sem hard-offset.
- **Card** (`ui/card`): `rounded-xl`, `ring-1 ring-foreground/10`, `bg-card`. Hover de link: `-translate-y-0.5` + `shadow-md`.
- **Hero (landing)**: painel `rounded-[1.5rem]` `bg-primary`, gradiente radial via `var(--navy-2)`, busca branca como ação principal, atalhos de grupo como links com underline dourado.
- **Lista de tarefas/entidades**: linhas `border-b`, ícone em chip `rounded-xl` que vira navy+dourado no hover, seta que desliza. Não usar card.
- **Select**: Base UI (ver memória do projeto). Nunca Radix/nativo.

---

## 5. Banidos (herança impeccable)

- Sombra hard-offset / brutalismo · gradient-text · glassmorphism decorativo · hero-metric template · grid de cards idênticos como navegação principal · chips de "vitrine" sem ação · em dash no copy.

---

*Contrato estabelecido em 2026-06-14. Referência visual: capa e miolo do RCA 35-2/2023.*
