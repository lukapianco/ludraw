# SPLASH_SPEC.md — Splash Screen do OpenDraw (Chat 03 · Pré-tarefa)

> Fonte: animação criada pelo usuário (`splash-reference.html`, na mesma pasta). **Mantenha o conceito e a física**; adapte ao Design System. **Não altere tokens nem componentes-base.**

## O que é
Tela de abertura do app: logo (ladrilho verde-floresta com a curva e a bolinha) cuja bolinha é puxada por uma mola amortecida, desenha a linha, é lançada no final e volta, com *squash & stretch* pela velocidade. Fundo e cores seguem o tema (claro/escuro) do OpenDraw.

## Regras de adaptação
1. **Cores só por tokens** (`--od-*` de `tokens.css`; marca `#194B32` + `#D0E4AE`). Nada de fundo escuro fixo: claro = canvas `#F5F6F8`, escuro = `#16161A`. Brilho de fundo suave (verde no claro, pistache no escuro, baixa opacidade).
2. **Movimento:** easing/duração dos tokens para entrada/saída (120–260 ms; saída ~420 ms com `cubic-bezier(0.22,1,0.36,1)`). **Respeitar "Reduzir movimento"** (preferência do app `prefs` + `prefers-reduced-motion`): mostrar o logo **completo e estático** (bolinha no topo) e só fazer fade.
3. **Quando aparece/some:** monta por cima do app na abertura (não a cada troca de rota). Some quando: (a) tempo mínimo ~1,1 s **e** (b) app pronto (store `persist` reidratado + `document.fonts.ready`) **e** (c) a animação terminar com o logo completo (`settleAtEnd`). **Failsafe de 4 s** sempre remove. Não bloqueia o carregamento (o app monta por baixo).
4. **Acessibilidade:** `role="status"`, texto só para leitor de tela "Carregando o OpenDraw…", SVG `aria-hidden`; ao sair, remover do DOM (`unmount`) e devolver o foco normalmente.
5. **Desempenho:** `requestAnimationFrame` com **subpassos de física** (já na referência), pausa com `visibilitychange`, cancelar no `unmount`. Sem libs novas.
6. **Wordmark** "opendraw" abaixo do logo com fade-in (mesma tipografia do Login).
7. **Logo único:** reutilize o componente de logo existente (cores/geometria). Se o logo atual do app **diferir** do SVG da referência, mantenha o do app nas telas e use a referência só na splash — e avise o usuário da diferença.

## Entrega esperada (Chat 03 · Pré-tarefa)
- `src/components/splash/SplashScreen.tsx` (+ hook `useSplashGate`), montado em `App.tsx` acima das rotas; lógica da animação em `src/utils/logoAnimation.ts` (porte de `startLogoAnimation` para TypeScript estrito, sem DOM global solto).
- **Boot splash estático** em `index.html` (logo completo + fundo pelo `prefers-color-scheme`, sem JS pesado) para eliminar o flash branco antes do React; removido quando a `SplashScreen` monta, sem salto visual (mesma posição/tamanho).
- Exemplo no `#/design-system` (frame 23: splash estática + botão "Reproduzir") e entrada no `DESIGN_SYSTEM.md` (+ cópia em `docs/`).
- Opção em Configurações para **desativar a splash**? **Não** nesta etapa (apenas respeitar Reduzir movimento).
- Reaproveitável no Tauri (Chat 09).
