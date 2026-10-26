# Análise dos presets — Kunai, Tora e Fuji

Reproduzir: `npm run analise` (cerca de 7 min para as três análises). Código em `analysis/robots.test.ts`.

**Tora** (laranja) e **Fuji** (roxo) foram montados com os valores exatos das telas do editor enviadas pelo usuário; um teste automatizado confere campo a campo. Bloco e Trator saíram da lista de presets. Eles continuam só como robôs de teste (`tests/fixtures.ts`), porque cobrem casos que o editor ainda permite: 4 rodas e lâmina de 20°.

> **Atualizado para o modelo de roda com inércia** ([ANALISE-RODAS-MOTORES.md](ANALISE-RODAS-MOTORES.md)).
> - Os duelos agora usam **partida suave**: 0 → 100% em ~70 ms, como o teclado no modo realista e o bot.
> - Com a inércia do rotor, uma largada seca (0 → 100% num passo) faz robô de motor forte empinar, e a análise mediria só isso.

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

| Robô | Vel. máx. | 90% da vel. | 20 cm em | Peso nas rodas | Tração | Motores | Nariz, partida suave (máx. / mín.) | Empina na largada seca | Estimativa do editor | Giro no eixo |
|---|---|---|---|---|---|---|---|---|---|---|
| Kunai | 1,34 m/s | 0,21 s | 0,25 s | 0,72 | 3,6 N | 29 N | +12° / −17° | 16° | 17° | 205 RPM |
| Tora | 0,91 m/s | 0,30 s | 0,43 s | 0,75 | 3,8 N | 66 N | **+42°** / 0° | **90° (fica em pé)** | 53° | 162 RPM |
| Fuji | 0,46 m/s | 0,20 s | 0,56 s | 0,75 | 3,9 N | 66 N | +23° / 0° | 33° | 34° | 99 RPM |

**Leitura:**
- **Tração:** os três são limitados pela tração. Os motores do Tora e do Fuji rendem ~17 vezes o que o pneu passa ao chão.
- **Empinar (novo):** o torque que acelera rotor e roda volta para o chassi. Com 4,4 kgf·cm por motor e o CG 14 mm atrás, o Tora empina ~42° mesmo com partida suave. Esse torque é 5 a 10 vezes o de motores reais da mesma rotação (ver [ANALISE-RODAS-MOTORES.md](ANALISE-RODAS-MOTORES.md), seção 5).
- **Velocidade:** o Tora ainda chega ao meio do dohyo antes, mas leva 0,43 s para fazer 20 cm, porque parte da largada é gasta empinado.

## Duelo frontal (100% desde o bip, partida suave)

São 9 largadas por linha. A sai do lado azul, levemente deslocado (±4 mm) e girado (±1,7°); B sai alinhado.

| A | B | Pontos A | Pontos B | Torinaoshi |
|---|---|---|---|---|
| Tora | Fuji | 0/9 | 1/9 | 8 |
| Fuji | Tora | **3/9** | 0/9 | 6 |
| Tora | Kunai | 0/9 | **6/9** | 3 |
| Fuji | Kunai | 1/9 | **4/9** | 4 |
| Tora | Tora | 5/9 | 4/9 | 0 |
| Fuji | Fuji | 6/9 | 3/9 | 0 |

**Leitura:**
- **Tora × Fuji:** o Tora não pontua contra o Fuji (0 em 18 largadas). A maioria trava em Torinaoshi.
- **Kunai de frente:** a cunha baixa do Kunai entra por baixo dos dois quando eles chegam com o nariz levantado. Isso é novo; no modelo antigo o Kunai perdia.

### O que decide Tora × Fuji

Cada linha muda um único fator e enfrenta o outro preset original:

| Variante | Pontos da variante × do rival |
|---|---|
| Tora com a velocidade do Fuji | 2 × 5 |
| Tora com frente a 60° | 0 × 1 (8 Torinaoshi) |
| Tora com altura 60 mm | 2 × 7 |
| Tora com CG −15,5 mm | 0 × 4 |
| Tora com rodas de 22 mm | 2 × 7 |
| Fuji com a velocidade do Tora | **7 × 0** |

**Não é mais a velocidade:** o Fuji com a velocidade do Tora vence ainda mais. O que pesa é quanto cada um empina no choque: o Tora levanta mais o nariz e a lâmina do Fuji entra por baixo. No modelo antigo, sem inércia, a velocidade explicava tudo.

## Bot difícil × bot difícil, largada sorteada

São 10 sementes, e cada uma é jogada com as cores trocadas: 20 partidas por par.

| Par | Vitórias |
|---|---|
| Tora × Fuji | 3 – **17** |
| Tora × Kunai | 10 – 10 |
| Fuji × Kunai | **20** – 0 |

Hierarquia com o bot atual: **Fuji > Tora ≈ Kunai**.
- **Sorteio × duelo frontal:** com largada sorteada, o bot manobra e quase nunca chega de frente perfeito, por isso o Kunai não repete o resultado do duelo frontal.
- **Bot com partida suave:** o bot agora usa a mesma rampa do teclado.

## Lado da arena

Em espelho perfeito (mesma pose, só girada 180°), quem sobe na rampa é decidido por arredondamento numérico do motor de física. Com largadas realistas (±1 cm, ±3°, 30 largadas por linha, partida suave):

| Espelho | Vermelho (+x) | Azul (−x) | Torinaoshi |
|---|---|---|---|
| Tora × Tora | 17 | 13 | 0 |
| Fuji × Fuji | 13 | 9 | 8 |
| Kunai × Kunai | 6 | 15 | 9 |

- **Tora e Fuji:** as diferenças cabem no ruído.
- **Kunai:** 6 × 15 está no limite do ruído (21 decididas). Vale acompanhar, mas não muda a hierarquia.
- **Tora × Fuji:** Tora de vermelho contra Fuji de azul deu Fuji 27 a 1.

## Limitações

- **Desvio em linha reta:** robôs de 2 rodas que arrastam a frente no chão desviam um pouco andando a 100%. Com o novo modelo de roda: Kunai 1,7° em 53 cm, Tora 0,2° em 26 cm, Fuji 0,3° em 18 cm.
  - A geometria é simétrica; foi conferida vértice a vértice. O desvio vem do contato deslizante no solver.
- **Pilotagem:** o roteiro de acelerador fixo e o bot de treino não representam pilotagem humana.
- **Alcance:** os números comparam tendências dentro do simulador. Para prever o robô real, calibre massa, CG e atritos com medidas reais.
