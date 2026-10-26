# Sumô 500g — simulador de Mini Sumô

Luta de robôs **Mini Sumô (500 g)** no navegador, com física 3D em escala real (dohyo de 77 cm, robôs de 10 × 10 cm) e juiz automático pelo **regulamento RoboCore v3.1**.

## Rodar

Requer Node 20+.

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # 143 testes: física, roda, juiz, presets, evidência, treino, partidas bot × bot, sorteio, determinismo
npm run analise      # lâmina, presets, motores, rodas e treino (docs/ANALISE-*.md), ~7 min
npm run analise:motores # qual motor do catálogo combina com cada preset, ~35 min
npm run build        # dist/ para hospedar
npm run build:single # dist-single/index.html — um arquivo só, abre direto no navegador
```

Máquina fraca? Abra com `?gfx=low` (sem sombras e sem antialias).

## Controles

| | Vermelho (P1) | Azul (P2) |
|---|---|---|
| Andar / girar | W A S D | setas |
| Ajuste fino | Shift esq. | Shift dir. |
| Posicionar: deslizar | Q / E | , / . |
| Pronto | Espaço | Enter |

Contra o bot ou no treino, **WASD ou setas** controlam o seu robô. No posicionamento também dá para **arrastar o robô com o mouse** (roda gira, Shift = giro fino) e clicar em **Pronto**.

Com **Posicionamento aleatório** ligado no menu, cada round sorteia posição e giro dos dois lados, inclusive do bot e da caixa do treino. Aí é só confirmar **Pronto**.

**C** câmera · **F2** forças (debug) · **Esc** pausa

## Como funciona

- **Modos:**
  - **Realista**: tempo real, e mexer antes do bip é Keikoku.
  - **Arcade**: a mesma física a 50% da velocidade.
- **Robôs:** três presets, cada um com um motor real: Kunai (JGA16-050), Tora (N30) e Fuji (N20). O editor valida a caixa de inspeção (100 mm, 500 g) e mostra velocidade, peso nas rodas e tração.
- **Treino:** em Oponente → Treino (caixa), uma caixa de 500 g fica no lugar do adversário. O jogo cronometra quanto tempo você leva para tirá-la do dohyo.
- **Física:** cada roda tem inércia (roda + rotor pela redução) e atrito que depende do escorregamento: patina, trava e faz o robô empinar se o motor sobrar. Quando a lâmina do rival entra por baixo, N cai e o robô perde força. Ligue o debug (F2) para ver.
- **Peças reais:** o editor tem presets de motor (N20, N30, JGA16-050) e de roda (RoboCore StickyMAX S20/S30).

- **Som:** motores e batidas de contato sintetizados no navegador; volume no menu.
- **Evidência:** quando um robô encosta fora, o replay congela no toque e aproxima a câmera do ponto.

Detalhes, decisões e interpretações do regulamento: [docs/REQUISITOS.md](docs/REQUISITOS.md).
