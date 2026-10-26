# Análise dos presets — Kunai, Tora e Fuji

Reproduzir:
- `npm run analise` (cerca de 8 min): ficha, duelos e partidas. Código em `analysis/robots.test.ts`.
- `npm run analise:motores` (cerca de 35 min): a escolha dos motores. Código em `analysis/motorFit.test.ts`.
- `npm run analise:baterias` (cerca de 10 min): a bateria de cada preset. Código em `analysis/battery.test.ts`; resultados em [ANALISE-BATERIAS.md](ANALISE-BATERIAS.md).

**Tora** (laranja) e **Fuji** (roxo) foram montados com os valores das telas do editor enviadas pelo usuário; um teste automatizado confere campo a campo. Depois, a pedido, **cada preset recebeu um motor real do catálogo, um de cada família**. Com as baterias, **os três usam a versão de 12 V do motor numa LiPo 3S**, a combinação "compatível" e de melhor resultado (ver [ANALISE-BATERIAS.md](ANALISE-BATERIAS.md)). Bloco e Trator continuam só como robôs de teste (`tests/fixtures.ts`), porque cobrem casos que o editor ainda permite: 4 rodas e lâmina de 20°.

Os duelos usam **partida suave**: 0 → 100% em ~70 ms, como o teclado no modo realista e o bot.

## Ficha

| | Kunai | Tora | Fuji |
|---|---|---|---|
| Corpo | cunha 99 × 98 × 45 mm, frente a 28° | 99 × 99 × 50 mm, frente a 80° | 99 × 99 × 60 mm, frente a 60° |
| Lâmina | 28°, 25,6 mm, aresta no chão | 15°, 20,5 × 99,5 mm, aresta a 0,2 mm | 15°, 20 × 99 mm, aresta a 0,2 mm |
| Rodas | 2 × Ø32 mm | 2 × Ø26 mm | 2 × Ø22 mm |
| **Motor** (ficha, 12 V) | **JGA16-050 12 V 32:1** (375 RPM, 0,83 kgf·cm) | **N30 12 V 50:1** (320 RPM, 1,6 kgf·cm) | **N20 HPCB 12 V 50:1** (650 RPM, 0,67 kgf·cm) |
| **Bateria** | **LiPo 3S** | **LiPo 3S** | **LiPo 3S** |
| Motor na 3S (× 0,925) | 347 RPM, 0,77 kgf·cm | 296 RPM, 1,48 kgf·cm | 601 RPM, 0,62 kgf·cm |
| Compatibilidade | compatível (1,05× cheia) | compatível | compatível |
| Motor na v10 (sem bateria) | JGA16 6 V: 375 RPM, 0,83 kgf·cm | 320 RPM, 1,6 kgf·cm | N20 HP 6 V: 590 RPM, 0,86 kgf·cm |
| Motor original | 800 RPM, 2,4 kgf·cm | 670 RPM, 4,4 kgf·cm | 400 RPM, 3,7 kgf·cm |
| Massa / CG | 495 g · x −9 mm | 498 g · x −14 mm | 498 g · x −15,5 mm |

Os três passam na inspeção. Os motores de antes eram de 5 a 10 vezes mais fortes que qualquer motor real da mesma rotação (ver [ANALISE-RODAS-MOTORES.md](ANALISE-RODAS-MOTORES.md)).

## Motor de cada preset

**Como foi escolhido** (`analysis/motorFit.test.ts`, refeito com baterias):
1. **Candidatos:** 3 reduções por família em cada robô, todas as versões de 12 V na 3S (a bateria compatível com elas): N20 HPCB 30/50/75:1, N30 20/30/50:1 e JGA16-050 16/25/32:1.
2. **Torneio:** cada combinação enfrentou um painel fixo de 9 robôs (os 3 corpos × 1 redução média de cada família). Bot difícil × bot difícil, largada sorteada, 2 sementes × 2 lados: 36 partidas por combinação, 972 no total.
3. **Atribuição:** um motor diferente por robô. Das 6 combinações possíveis, ficou a de maior soma de vitórias.
4. **Confirmação:** onde a 1ª e a 2ª atribuição diferiam, o mesmo corpo com cada motor se enfrentou.

**Taxa de vitória contra o painel (melhor redução de cada família):**

| Robô | N20 HPCB 12 V | N30 12 V | JGA16-050 12 V |
|---|---|---|---|
| Kunai | 19% (75:1) | 25% (50:1) | **31% (32:1)** |
| Tora | 78% (75:1) | **89% (30:1 e 50:1)** | 67% (25:1) |
| Fuji | **67% (50:1)** | 78% (20:1) | 72% (16:1) |

**Atribuições, por soma das taxas:**

| Kunai | Tora | Fuji | Soma |
|---|---|---|---|
| JGA16 32:1 | N20 HPCB 75:1 | N30 20:1 | 186 |
| **JGA16 32:1** | **N30 30:1 (ou 50:1)** | **N20 HPCB 50:1** | **186** |
| N20 HPCB 75:1 | N30 30:1 | JGA16 16:1 | 181 |

**Confirmação** (as duas primeiras empatam e diferem no Tora e no Fuji):
- Tora com N30 × Tora com N20 HPCB 75:1: **12 a 4**.
- Fuji com N20 HPCB 50:1 × Fuji com N30 20:1: **12 a 4**.

**Leitura:**
- **A atribuição se manteve com as baterias:** Kunai com JGA16-050, Tora com N30 e Fuji com N20, agora todos de 12 V na 3S.
- **O Tora pede o N30.** O 30:1 e o 50:1 empataram em 89%; ficou o 50:1, que já era o do preset e foi o usado na análise de baterias. É a escolha mais folgada.
- **O Fuji vai bem com qualquer um** (67–78%). No confronto direto, o N20 HPCB 50:1 venceu o N30 20:1 por 12 a 4. É também o motor mais leve: 9,5 g, contra 30 g do JGA16.
- **O Kunai é o corpo mais fraco** com qualquer motor (6–31%). O JGA16 32:1 é o melhor dele em todas as atribuições.
- **Ruído:** com 36 partidas, diferenças menores que ~10 pontos percentuais são ruído.

**Na versão anterior, sem baterias**, com as linhas de 6 V a k = 1, o resultado foi o mesmo: JGA16 32:1, N30 50:1 e N20 HP 50:1.

**Montagem real do JGA16-050:** o corpo tem ~40 mm de comprimento. Dois motores no mesmo eixo, mais as rodas, passam dos 98 mm de largura do Kunai. No robô real eles teriam que ficar desencontrados (um à frente do outro). O simulador considera as rodas no mesmo eixo.

## Sozinho

| Robô | Vel. máx. | 90% da vel. | 20 cm em | Peso nas rodas | Tração | Motores | Nariz, partida suave | Empina, largada seca | Giro no eixo |
|---|---|---|---|---|---|---|---|---|---|
| Kunai | 0,58 m/s | 0,18 s | 0,45 s | 0,72 | 3,6 N | 9,4 N | 0° | 0° | 111 RPM |
| Tora | 0,40 m/s | 0,09 s | 0,56 s | 0,75 | 3,8 N | 22,3 N | 0° | 6° | 87 RPM |
| Fuji | 0,69 m/s | 0,18 s | 0,39 s | 0,75 | 3,9 N | 11,1 N | 0° | 3° | 132 RPM |

**Leitura:**
- **Empinar:** com motor real, nenhum empina com partida suave. Com os motores antigos, o Tora empinava ~42°.
- **Tração:** os três continuam limitados pela tração; a força dos motores é de 2,6 a 5,8 vezes a tração.
- **Na 3S** os motores rendem 92,5% da ficha: Kunai e Tora ficaram ~8% mais lentos que na v10. O Fuji trocou o N20 de 6 V pelo de 12 V e ficou praticamente na mesma velocidade, com menos torque e menos empino na largada seca (3°, antes 6°).

## Duelo frontal (100% desde o bip, partida suave)

São 9 largadas por linha. A sai do lado azul, levemente deslocado (±4 mm) e girado (±1,7°); B sai alinhado.

| A | B | Pontos A | Pontos B | Torinaoshi |
|---|---|---|---|---|
| Tora | Fuji | **7/9** | 2/9 | 0 |
| Fuji | Tora | 0/9 | **9/9** | 0 |
| Tora | Kunai | **7/9** | 2/9 | 0 |
| Fuji | Kunai | **9/9** | 0/9 | 0 |
| Tora | Tora | 3/9 | 6/9 | 0 |
| Fuji | Fuji | 4/9 | 5/9 | 0 |

**O que decide Tora × Fuji:** cada linha muda um único fator e enfrenta o outro preset original.

| Variante | Pontos da variante × do rival |
|---|---|
| Tora com a velocidade do Fuji | 6 × 3 |
| Tora com frente a 60° | 7 × 2 |
| Tora com altura 60 mm | 6 × 3 |
| Tora com CG −15,5 mm | 7 × 2 |
| Tora com rodas de 22 mm | 0 × 2 (7 Torinaoshi) |
| Fuji com a velocidade do Tora | 4 × 3 (2 Torinaoshi) |

**Leitura:**
- **Frente, altura, CG e velocidade, sozinhos, não tiram a vantagem do Tora.**
- **A roda pesa:** com a roda de 22 mm do Fuji, o Tora não pontua; 7 das 9 largadas travam em Torinaoshi.

## Bot difícil × bot difícil, largada sorteada

São 10 sementes, e cada uma é jogada com as cores trocadas: 20 partidas por par.

| Par | Vitórias |
|---|---|
| Tora × Fuji | **14** – 6 |
| Tora × Kunai | **16** – 4 |
| Fuji × Kunai | **19** – 1 |

Hierarquia com o bot atual e as baterias 3S: **Tora > Fuji > Kunai**, a mesma da v10 (13–7, 17–3, 19–1). Com os motores originais era Fuji > Tora ≈ Kunai.

## Lado da arena

Em espelho perfeito (mesma pose, só girada 180°), quem sobe na rampa é decidido por arredondamento numérico do motor de física. Com largadas realistas (±1 cm, ±3°, 30 largadas por linha), as medições anteriores não mostraram vantagem de lado além do ruído. Esse teste não foi refeito com os motores novos.

## Limitações

- **Desvio em linha reta:** robôs de 2 rodas que arrastam a frente no chão desviam um pouco andando a 100%. A geometria é simétrica; o desvio vem do contato deslizante no solver.
- **Pilotagem:** o roteiro de acelerador fixo e o bot de treino não representam pilotagem humana.
- **Alcance:** os números comparam tendências dentro do simulador. Para prever o robô real, calibre massa, CG e atritos com medidas reais.
