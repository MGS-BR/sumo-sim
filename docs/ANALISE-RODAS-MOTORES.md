# Rodas e motores — pesquisa, modelo e análise

Reproduzir: `npm run analise` (cerca de 8 min). Código em `analysis/wheels.test.ts`.

## 1. Presets de motor

Valores das folhas de dados dos fabricantes, no eixo de saída e **na tensão nominal do motor**. No editor ficam em **Motor → Motor do catálogo**.

**Com bateria:** a simulação multiplica rotação, torque e corrente por V_bateria ÷ V_motor (LiPo a 3,7 V por célula). Exemplos: um motor de 6 V na 2S rende 1,23×; um de 12 V na 3S rende 0,925×. O catálogo só tem linhas que alguma bateria 2S/3S/4S alimenta com no máximo sobretensão moderada (cheia ≤ 1,5×). Por isso o N30 5 V saiu e entraram o N20 HPCB 12 V e o JGA16-050 12 V. Detalhes e alertas em [ANALISE-BATERIAS.md](ANALISE-BATERIAS.md).

### N20

O formato N20 (redução de 10 × 12 mm) não tem uma folha de dados única. Por isso há duas linhas:

**N20 HP 6 V** ([Pololu HP 6V](https://www.pololu.com/product/2217); a Pololu diz que este formato "também é chamado de N20"):

| Redução | Rotação livre | Travamento |
|---|---|---|
| 10:1 | 3100 RPM | 0,22 kgf·cm |
| 15:1 | 2000 RPM | 0,30 kgf·cm |
| 30:1 | 1000 RPM | 0,57 kgf·cm |
| 50:1 | 590 RPM | 0,86 kgf·cm |
| 75:1 | 410 RPM | 1,3 kgf·cm |
| 100:1 | 310 RPM | 1,7 kgf·cm |
| 150:1 | 210 RPM | 2,4 kgf·cm |
| 210:1 | 150 RPM | 3,0 kgf·cm |

- Corrente de travamento: 1,6 A. Massa: 9,5 g ([ficha](https://www.pololu.com/product/1000/specs)).
- A Pololu recomenda não passar de 2 kgf·cm instantâneos na redução, exceto nas de 380:1 e 1000:1.

**N20 comum (MP) 6 V** (linha MP da mesma página):

| Redução | Rotação livre | Travamento |
|---|---|---|
| 30:1 | 720 RPM | 0,33 kgf·cm |
| 50:1 | 420 RPM | 0,54 kgf·cm |
| 100:1 | 220 RPM | 0,94 kgf·cm |
| 150:1 | 150 RPM | 1,3 kgf·cm |

- Corrente de travamento: 0,67 A.
- Representa o N20 genérico: o GA12-N20 da [Handsontec](https://www.handsontec.com/dataspecs/motor_fan/GA12-N20.pdf) também trava com 0,67 A. Os pontos 450 RPM/0,54 kgf·cm e 200 RPM/0,94 kgf·cm dele batem com o 50:1 e o 100:1 desta linha.

**N20 HPCB 12 V** (linha HPCB 12V da mesma página da Pololu; escovas de carvão, de vida longa; para 3S):

| Redução | Rotação livre | Travamento |
|---|---|---|
| 10:1 | 3400 RPM | 0,17 kgf·cm |
| 15:1 | 2200 RPM | 0,25 kgf·cm |
| 30:1 | 1100 RPM | 0,39 kgf·cm |
| 50:1 | 650 RPM | 0,67 kgf·cm |
| 75:1 | 450 RPM | 1,0 kgf·cm |
| 100:1 | 330 RPM | 1,3 kgf·cm |
| 150:1 | 220 RPM | 1,8 kgf·cm |
| 210:1 | 160 RPM | 2,5 kgf·cm |

- Corrente de travamento: 0,75 A. Massa: 9,5 g.
- Constante de tempo: 18 ms, estimada como a da linha MP (corrente baixa, rotor de mais espiras).

### N30

**N30 12 V** ([NFP-GM12-N30-1216](https://nfpmotor.com/12mm-metal-gear-motor-model-nfp-gm12-n30), motor de 16 000 RPM):

| Redução | Rotação livre | Travamento |
|---|---|---|
| 10:1 | 1600 RPM | 0,3 kgf·cm |
| 20:1 | 800 RPM | 0,6 kgf·cm |
| 30:1 | 530 RPM | 1,0 kgf·cm |
| 50:1 | 320 RPM | 1,6 kgf·cm |
| 100:1 | 160 RPM | 3,0 kgf·cm |

- Corrente de travamento: 0,6 A.

**N30 5 V: removido** ([KS-GM12-N30](https://www.motormicro.com/product/12-20mm-n30-gear-motor-5-12v-dc-10200-17000rpm-gearbox-27-567rpm-d-shaft-ks-gm12-n30), 30:1 a 150:1, 1,3 A travado). Nenhuma bateria serve: a menor, 2S, dá 8,4 V cheia, 1,68× a tensão do motor.

**Observações sobre o N30:**
- O fabricante marca os valores como provisórios.
- Massa: ~12 g, estimativa. A ficha não dá; a versão em U pesa ~15 g ([NFP-GM1024-N30](https://nfpmotor.com/12mm-6v-12v-n30-dc-gear-motor-for-robotics-model-nfp-gm1024-n30)).

### JGA16-050

**JGA16-050 6 V e 12 V** ([NFP-JGA16-050-06120 e -12120](https://microdcmotors.com/product/6v-12v-micro-metal-gearmotor-model-nfp-gm16-050sh)). As duas têm a mesma tabela, cada uma na sua tensão:

| Redução | Rotação livre | Travamento |
|---|---|---|
| 13:1 | 923 RPM | 0,37 kgf·cm |
| 16:1 | 750 RPM | 0,46 kgf·cm |
| 25:1 | 480 RPM | 0,65 kgf·cm |
| 32:1 | 375 RPM | 0,83 kgf·cm |
| 45:1 | 266 RPM | 1,0 kgf·cm |
| 63:1 | 190 RPM | 1,4 kgf·cm |
| 100:1 | 120 RPM | 2,3 kgf·cm |

- Corrente de travamento: 2 A na de 6 V e 1 A na de 12 V. Massa: ~30 g.
- As duas estão no catálogo: a de 6 V serve na 2S e a de 12 V na 3S.

**Atenção a anúncios:** lojas anunciam o JGA16-050 com "torque 0,53–5 kg·cm" ([exemplo](https://othoba.com/dc-6v-600rpm-micro-metal-gear-motor-jga16-050-udvabony-bd-474494)). Essa é a faixa da FAMÍLIA inteira, das reduções mais baixas às mais altas, e não de um motor. A ~600 RPM, o travamento real fica perto de 0,5 kgf·cm.

## 2. Presets de roda (RoboCore StickyMAX 32 mm)

| | S20 macia | S30 dura |
|---|---|---|
| Diâmetro × largura | 32 × 21 mm | 32 × 21 mm |
| Pneu | silicone vulcanizado 20 Shore A, "pegajosa" | silicone 30 Shore A, "seca" |
| Cubo | alumínio 6351-T6, Ø25 mm, 12 g, furo de 3 mm | idem |
| Massa da roda | 23 g | 23 g |
| μ de pico usado | **0,75** | **0,55** |
| Escorregamento no pico | 15% | 10% |

Fontes: [pneus S20](https://www.robocore.net/roda/pneus-s20-32mm-para-roda-stickymax-par), [roda S20](https://www.robocore.net/roda/roda-stickymax-s20-32mm), [roda S30](https://www.robocore.net/roda/roda-stickymax-s30-32mm) e [cubo](https://www.robocore.net/roda/cubo-roda-stickymax-32mm).

**Atrito:**
- A RoboCore não publica o coeficiente de atrito; o próprio fórum dela diz que não tem como medir.
- O μ veio do [teste da JSumo em madeira laminada](https://blog.jsumo.com/wheel-report-2015-our-wheels-slt20-slt20p-against-to-banebots-fingertech-wheels/), o mesmo acabamento do dohyo: silicone 20 Shore A deu 0,70–0,75 e 30 Shore A deu 0,55.
- O escorregamento no pico é estimativa: a borracha mais macia deforma mais antes de deslizar.
- **É bem menos que o 1,1 dos presets atuais.** Vale medir o seu pneu na sua arena: incline a arena até o robô escorregar; μ = tan(ângulo).

## 3. O novo modelo de roda

O modelo antigo não tinha inércia da roda nem curva de atrito por escorregamento.

**O que mudou:**
- **Inércia de rotação:** a roda tem rotação própria, que persiste entre passos.
  - A inércia J soma a da roda (≈ 0,55·m·r²) e a do rotor refletida pela redução, que cresce com o quadrado da redução.
  - É calculada pela constante de tempo mecânica: J = τ·T_travamento/ω_livre.
- **Curva de atrito × escorregamento:**
  - Escorregamento: κ = (ω·r − v)/máx(|ω·r|, |v|, 5 cm/s). O lateral é tratado do mesmo jeito.
  - Curva (Pacejka simplificada): μ(σ) = μ_pico·sen(C·atan(B·σ)). Sobe até o pico e cai para 85% do pico patinando.
  - A roda pode patinar na largada, travar arrastada, ou continuar girando no ar.
- **Reação no chassi:** o motor que acelera o rotor empurra o chassi ao contrário. É isso que faz robô empinar.
- **Integração:** a força de cada passo resolve F = F_pneu(κ(F)) com a rotação e a velocidade do fim do passo (Euler implícito, por bisseção). Fica estável com qualquer inércia, de 1e-7 a 5e-4 kg·m², e determinística.
- **Constante de tempo τ:**
  - Não vem nas folhas de dados. Foi estimada pelo tamanho do rotor: N20 ≈ 13–18 ms, N30 ≈ 8–10 ms, JGA16-050 ≈ 19 ms; padrão para motor livre: 15 ms.
  - Dá para medir em casa: filme a roda solta em câmera lenta. τ é o tempo para chegar a 63% da rotação máxima.

**Validação:** testes unitários em `tests/wheel.test.ts`, fora a física completa:
- a força nunca passa de μ·N;
- a roda solta chega a 63% da rotação em t = τ;
- na rotação livre o motor não empurra;
- a largada patina;
- a roda segura com o motor em freio;
- sem drift parado;
- a velocidade final é estável;
- é determinística.

## 4. Resultados

### Motores no mesmo robô

Robô de referência: corpo do Fuji, CG −15,5 mm, roda S20. **Cada motor na bateria indicada para ele:** os de 6 V na 2S (1,23× a ficha) e os de 12 V na 3S (0,925×). A tabela completa, com todas as reduções, sai no `npm run analise`.

| Motor | Bateria | RPM na bateria | Vel. máx. | Força motores / tração | 20 cm em | Empina (suave / seca) |
|---|---|---|---|---|---|---|
| N20 HP 6 V 30:1 | 2S | 1233 | 2,07 m/s | 8,6 / 2,8 N | 0,27 s | 8° / 12° |
| N20 HP 6 V 50:1 | 2S | 728 | 1,22 m/s | 13,0 / 2,8 N | 0,30 s | 13° / 14° |
| N20 HP 6 V 100:1 | 2S | 382 | 0,64 m/s | 25,7 / 2,8 N | 0,41 s | 15° / 20° |
| N20 HP 6 V 210:1 | 2S | 185 | 0,31 m/s | 45,4 / 2,8 N | 0,79 s | 18° / 25° |
| N20 MP 6 V 50:1 | 2S | 518 | 0,87 m/s | 8,2 / 2,8 N | 0,35 s | 1° / 7° |
| N20 HPCB 12 V 30:1 | 3S | 1017 | 1,70 m/s | 4,4 / 2,8 N | 0,32 s | 0° / 0° |
| N20 HPCB 12 V 50:1 | 3S | 601 | 1,01 m/s | 7,6 / 2,8 N | 0,33 s | 1° / 7° |
| N20 HPCB 12 V 100:1 | 3S | 305 | 0,51 m/s | 14,7 / 2,8 N | 0,47 s | 3° / 15° |
| N30 12 V 30:1 | 3S | 490 | 0,82 m/s | 11,3 / 2,8 N | 0,34 s | 2° / 6° |
| N30 12 V 100:1 | 3S | 148 | 0,25 m/s | 34,0 / 2,8 N | 0,87 s | 2° / 14° |
| JGA16 6 V 25:1 | 2S | 592 | 0,99 m/s | 9,8 / 2,8 N | 0,32 s | 5° / 14° |
| JGA16 6 V 45:1 | 2S | 328 | 0,55 m/s | 15,1 / 2,8 N | 0,45 s | 5° / 15° |
| JGA16 12 V 25:1 | 3S | 444 | 0,74 m/s | 7,4 / 2,8 N | 0,39 s | 1° / 4° |
| JGA16 12 V 45:1 | 3S | 246 | 0,41 m/s | 11,3 / 2,8 N | 0,57 s | 0° / 8° |
| JGA16 12 V 100:1 | 3S | 111 | 0,19 m/s | 26,1 / 2,8 N | 1,16 s | 10° / 17° |

**Leitura:**
- **Tração manda:** todos os motores são mais fortes que a tração do pneu (μ·N ≈ 2,8 N), então torque a mais não empurra mais.
- **Sobretensão empina:** a mesma ficha rende 1,23× na 2S (6 V) e 0,925× na 3S (12 V). Na 2S, o rotor gira mais rápido e devolve mais momento ao chassi. O N20 HP 6 V 50:1 empina 13° com partida suave; o HPCB 12 V 50:1, na 3S, só 1°.
- **Redução alta é lenta e empina:** quanto maior a redução, mais lento o robô e maior a inércia refletida (de 0,03 a 1,3 kg equivalentes por roda).
- **Sobra pouco para 20 cm:** acima de ~1 m/s de velocidade máxima, os 20 cm iniciais já não melhoram (~0,3 s). A tração é que limita a aceleração.

### S20 × S30

Mesmo robô, N20 HP 6 V 50:1 na 2S, 9 largadas de cada lado:

| CG | S20 | S30 |
|---|---|---|
| −15,5 mm (como o Fuji) | 0 pontos | **18 pontos** |
| +5 mm (20 mm mais à frente) | **4 pontos**, 14 Torinaoshi | 0 pontos |

**Por que o S20 perde com o CG atrás:** mais aderência acelera mais, e com o CG atrás o nariz levanta na hora do choque. A lâmina do rival (aresta a 0,2 mm) entra por baixo. Com o CG à frente o nariz não levanta, e o S20 deixa de perder: venceu 4 pontos e não cedeu nenhum.

**Em resumo:** aderência só ajuda se o robô não empina.

### Motores frente a frente

Roda S20, cada motor na bateria indicada, 18 largadas por par. Venceu mais quem empina menos no choque, não quem tem mais torque:

| Par | Placar |
|---|---|
| N30 12 V 30:1 × N20 HPCB 12 V 50:1 | 14–4 |
| N20 MP 6 V 50:1 × N20 HPCB 12 V 50:1 | 10–7 |
| N20 HPCB 12 V 50:1 × JGA16 6 V 25:1 | 14–0 |
| N20 MP 6 V 50:1 × N20 HP 6 V 50:1 | 18–0 |
| N20 HPCB 12 V 50:1 × N20 HP 6 V 50:1 | 18–0 |
| JGA16 6 V 45:1 × JGA16 6 V 25:1 | 11–0 |

- **O N20 HP 6 V 50:1 na 2S perdeu todos os confrontos.** É o mais rápido e o que mais empina (13–14°). Na v10, sem bateria (k = 1), o MP já o vencia por 15–0.
- **Com a lâmina igual dos dois lados, o lado que levanta o nariz perde a disputa de lâminas.**

## 5. Motores antigos do Tora e do Fuji, e a troca

Os motores enviados para o Tora (670 RPM, 4,4 kgf·cm) e o Fuji (400 RPM, 3,7 kgf·cm) eram **5 a 10 vezes mais fortes** que qualquer N20, N30 ou JGA16-050 da mesma rotação. O JGA16-050 a ~480–750 RPM trava com 0,46–0,65 kgf·cm.

**Com aqueles motores, no simulador:**
- **Tora:** empinava ~42° na largada mesmo com partida suave, ficava em pé numa largada seca e podia capotar ao soltar o comando vindo de ré a 100%.
- **Fuji:** empinava ~23° com partida suave e ~33° numa largada seca.

**Depois da troca**, cada preset ganhou um motor real, um de cada família. Com as baterias, os três usam a versão de 12 V numa LiPo 3S:
- Kunai: JGA16-050 12 V 32:1;
- Tora: N30 12 V 50:1;
- Fuji: N20 HPCB 12 V 50:1.

Nenhum deles empina com partida suave; a largada seca dá no máximo 6°. A escolha e a análise estão em [ANALISE-ROBOS.md](ANALISE-ROBOS.md), seção "Motor de cada preset". O editor continua avisando a partir de 15° quando um motor personalizado sobra.

## Limitações

- **τ estimado:** é o parâmetro mais incerto e muda muito o quanto o robô empina. Meça o seu motor.
- **μ de um único teste:** o atrito vem de um teste só (JSumo), e o escorregamento no pico é estimativa.
- **Fora do modelo:**
  - a descarga e a queda de tensão da bateria sob carga;
  - o limite de corrente do driver, que só aparece como alerta no editor;
  - a folga e a elasticidade da redução;
  - a quebra da caixa N20 acima de 2 kgf·cm instantâneos (Pololu): o editor avisa, mas a caixa não quebra na simulação.
- **Massa dos motores:** é informativa. A massa do robô continua sendo a que você define.
