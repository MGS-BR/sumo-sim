# Análise dos presets — Kunai, Tora e Fuji

Reproduzir: `npm run analise` (cerca de 1,5 min). Código em `analysis/robots.test.ts`.

**Tora** (laranja) e **Fuji** (roxo) foram montados com os valores exatos das telas do editor enviadas pelo usuário; um teste automatizado confere campo a campo. Bloco e Trator saíram da lista de presets. Eles continuam só como robôs de teste (`tests/fixtures.ts`), porque cobrem casos que o editor ainda permite: 4 rodas e lâmina de 20°.

## Ficha

| | Tora | Fuji |
|---|---|---|
| Corpo | 99 × 99 × 50 mm, frente a 80° | 99 × 99 × 60 mm, frente a 60° |
| Lâmina | 15°, 20,5 × 99,5 mm, aresta a 0,2 mm (altura 5,3 mm) | 15°, 20 × 99 mm, aresta a 0,2 mm (altura 5,2 mm) |
| Rodas | 2 × Ø26 mm, embutidas, folga 2 mm | 2 × Ø22 mm, embutidas, folga 3 mm |
| Motor | 670 RPM · 4,4 kgf·cm | 400 RPM · 3,7 kgf·cm |
| Massa / CG | 498 g · x −14 mm, y 20 mm | 498 g · x −15,5 mm, y 20 mm |
| Cores | corpo laranja, pneu amarelo | corpo roxo, pneu azul |

Os dois passam na inspeção (≤ 100 mm, ≤ 500 g). A lâmina de 99,5 mm do Tora é a peça mais larga do robô e ainda cabe no limite.

## Sozinho

| Robô | Vel. máx. | 90% da vel. | 20 cm em | Peso nas rodas | Tração | Força dos motores | Nariz (máx. / mín. no arranque e na ré) | Giro no eixo |
|---|---|---|---|---|---|---|---|---|
| Kunai | 1,34 m/s | 0,165 s | 0,242 s | 0,72 | 3,6 N | 29 N | +1,0° / −15,5° | 153 RPM |
| Tora | 0,91 m/s | 0,094 s | 0,273 s | 0,76 | 3,8 N | 66 N | 0,0° / −0,3° | 157 RPM |
| Fuji | 0,46 m/s | 0,048 s | 0,462 s | 0,76 | 3,9 N | 66 N | 0,0° / −0,3° | 100 RPM |

**Leitura:**
- **Tração:** os dois são limitados pela tração. Os motores rendem cerca de 17 vezes o que o pneu consegue passar ao chão (μ·N ≈ 3,8 N), então o torque extra não vira força de empurrar.
- **Estabilidade:** Tora e Fuji não empinam nem afundam o nariz ao arrancar ou inverter a 100%. Variam menos de 0,5°, contra até −15,5° do Kunai.
- **Velocidade:** o Tora chega ao meio do dohyo quase duas vezes mais rápido.

## Duelo frontal (100% desde o bip)

São 9 largadas por linha. A sai do lado azul, levemente deslocado (±4 mm) e girado (±1,7°); B sai alinhado.

| A | B | Pontos A | Pontos B | A entra por baixo |
|---|---|---|---|---|
| Tora | Fuji | 1/9 | **8/9** | 1/9 |
| Fuji | Tora | **7/9** | 2/9 | 7/9 |
| Tora | Kunai | **7/9** | 0/9 (2 Torinaoshi) | 6/9 |
| Fuji | Kunai | **6/9** | 1/9 (2 Torinaoshi) | 6/9 |

**O Fuji vence o Tora dos dois lados.**

### O que decide Tora × Fuji

Cada linha muda um único fator e enfrenta o outro preset original:

| Variante | Resultado |
|---|---|
| Tora com a velocidade do Fuji | **5/9 a 4/9**: empate técnico |
| Fuji com a velocidade do Tora | 2/9 a 6/9: passa a perder |
| Tora com frente a 60°, altura 60 mm, CG −15,5 mm ou rodas de 22 mm | 0–1/9: nada muda |

**Velocidade é o fator.** As lâminas são iguais (15°, aresta a 0,2 mm), então nenhum dos dois tem vantagem de altura. Quem chega mais rápido sobe na rampa do outro: no impacto, o nariz do Tora levanta ~2,5 mm e ~4°, o peso sai das rodas e ele perde a disputa de empurrar.

**Na prática:**
- **Contra lâmina igual:** o Tora não deve chegar a 100% de frente. Reduzir antes do contato ou atacar de lado aproveita a velocidade sem subir na rampa.
- **Contra lâmina pior:** a velocidade continua sendo vantagem.

## Bot difícil × bot difícil, largada sorteada

São 10 sementes, e cada uma é jogada com as cores trocadas: 20 partidas por par.

| Par | Vitórias |
|---|---|
| Tora × Fuji | 0 – **20** |
| Tora × Kunai | **19** – 1 |
| Fuji × Kunai | **20** – 0 |

Hierarquia com o bot atual: **Fuji > Tora > Kunai**. O bot de treino ataca sempre a 100% de frente, que é justamente o cenário em que o Tora perde.

## Lado da arena

Em espelho perfeito (mesma pose, só girada 180°), quem sobe na rampa é decidido por arredondamento numérico do motor de física. Com largadas realistas (±1 cm, ±3°, 30 largadas por linha), não sobra vantagem de lado:

| Espelho | Vermelho (+x) | Azul (−x) |
|---|---|---|
| Tora × Tora | 17 | 13 |
| Fuji × Fuji | 18 | 12 |
| Kunai × Kunai | 6 | 8 (16 Torinaoshi) |
| Trator × Trator (teste) | 12 | 18 |

As diferenças cabem no ruído de 30 largadas (±3). Tora (vermelho) × Fuji (azul) deu Fuji 23 a 7.

## Limitações

- **Desvio em linha reta:** robôs de 2 rodas com CG atrás arrastam a frente no chão e desviam um pouco andando a 100%. O Tora desvia 1,6° em 32 cm, o Fuji 0,5° em 17 cm e o Kunai 0,3° em 41 cm.
  - A geometria é simétrica; foi conferida vértice a vértice. O desvio vem do contato deslizante no solver.
  - Com o CG no eixo, ou andando de ré, some.
  - Robôs reais também desviam, mas aqui o desvio é sempre para o mesmo lado.
- **Pilotagem:** o roteiro de acelerador fixo e o bot de treino não representam pilotagem humana.
- **Alcance:** os números comparam tendências dentro do simulador. Para prever o robô real, calibre massa, CG e atritos com medidas reais.
