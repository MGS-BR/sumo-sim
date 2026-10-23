# Sumô 500g — simulador de Mini Sumô

Luta de robôs **Mini Sumô (500 g)** no navegador, com física 3D em escala real (dohyo de 77 cm, robôs de 10 × 10 cm) e juiz automático pelo **regulamento RoboCore v3.1**.

## Rodar

Requer Node 20+.

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # 58 testes: física, juiz, partidas bot × bot, determinismo
npm run analise      # duelos de comprimento/largura/ângulo da lâmina (docs/ANALISE-LAMINA.md)
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

No posicionamento também dá para **arrastar o robô com o mouse** (roda gira, Shift = giro fino) e clicar em **Pronto**.

**C** câmera · **F2** forças (debug) · **Esc** pausa

## Como funciona

- **Modos:**
  - **Realista**: tempo real, e mexer antes do bip é Keikoku.
  - **Arcade**: a mesma física a 50% da velocidade.
- **Robôs:** três presets e um editor. O editor valida a caixa de inspeção (100 mm, 500 g) e mostra velocidade, peso nas rodas e tração.
- **Física:** a tração de cada roda é limitada por μ·N. Quando a lâmina do rival entra por baixo, N cai e o robô perde força. Ligue o debug (F2) para ver.

- **Som:** motores, atrito e batidas sintetizados no navegador; volume no menu.
- **Evidência:** quando um robô encosta fora, o replay congela no toque e aproxima a câmera do ponto.

Detalhes, decisões e interpretações do regulamento: [docs/REQUISITOS.md](docs/REQUISITOS.md).
