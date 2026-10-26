# Baterias 2S, 3S e 4S — catálogo, presets e alertas

Reproduzir:
- `npm run analise:baterias` (cerca de 10 min). Código em `analysis/battery.test.ts`.
- Testes: `tests/battery.test.ts`, que roda dentro do `npm test`.

## Modelo

- **Bateria:** LiPo 2S, 3S ou 4S. Ela **não descarrega** durante a luta, como pedido.
- **Tensões por célula:** 3,7 V nominal, 4,2 V cheia e 3,0 V mínima.

| Bateria | Nominal | Cheia | Pack de referência (Tattu 450 mAh 75C) |
|---|---|---|---|
| 2S | 7,4 V | 8,4 V | 29 g · 44 × 25 × 14 mm |
| 3S | 11,1 V | 12,6 V | 42 g · 45 × 24 × 21 mm |
| 4S | 14,8 V | 16,8 V | 58 g · 64,5 × 16,5 × 27 mm |

- **Corrente do pack:** 0,45 Ah × 75C = 33,75 A contínuos, igual nos três.
- **Massa:** a do pack é só informativa. A massa do robô continua sendo a que você define no editor, com a bateria dentro.

**Motor na bateria.** Num motor CC de ímã permanente:
- a rotação livre (ω₀ = V/Kₑ), o torque de travamento (T₀ = Kₜ·V/R) e a corrente de travamento (V/R) crescem na mesma proporção da tensão;
- a constante de tempo mecânica não muda.

A simulação multiplica rotação, torque e corrente por **k = V_bateria nominal ÷ V_motor**. Como torque e rotação sobem juntos, a inércia refletida do rotor (J = τ·T₀/ω₀) não muda com a bateria.

A spec guarda os valores da ficha, na tensão nominal do motor. A bateria escolhida só entra na conta: trocar de bateria nunca reescreve o motor.

## Compatibilidade

**Como o nível é calculado:**
- Sobretensão usa a bateria **cheia**: é a tensão que o motor recebe na 1ª luta depois de carregar.
- Subtensão usa a **nominal**: é a que a simulação usa.

| Nível | Condição | O que significa |
|---|---|---|
| Compatível | cheia ≤ 1,15× e nominal ≥ 0,9× | dentro da tolerância usual de tensão |
| Atenção (sobretensão moderada) | cheia 1,15–1,5× | comum em competição (motor de 6 V na 2S); até 2,25× o calor travado, vida útil menor |
| Risco (sobretensão alta) | cheia 1,5–2× | 2,25–4× o calor travado; empurrões longos podem queimar o motor |
| Crítico | cheia > 2× | mais de 4× o calor travado; escovas, enrolamento e engrenagens em risco |
| Atenção (subtensão) | nominal 0,6–0,9× | seguro para o motor, mas rende menos |
| Risco (subtensão forte) | nominal < 0,6× | rende menos de 60% da rotação e do torque |

**Calor:** com o motor travado, a perda no cobre é I²R, e a corrente é proporcional à tensão. Então o calor cresce com **k²**.

**Outros alertas** (só sinalizam, nunca bloqueiam):
- **Caixa N20:** o torque travado com a bateria cheia passa de 2 kgf·cm, o máximo instantâneo que a Pololu recomenda para a caixa N20.
- **Corrente acima da bateria:** os motores travados juntos puxam mais que os 33,75 A do pack.
- **Ponte H, tensão** (informativo):

  | Bateria | DRV8833 (máx. 10,8 V) | TB6612FNG (13,5 V de operação, 15 V absoluto) |
  |---|---|---|
  | 2S (8,4 V cheia) | cabe | cabe |
  | 3S (12,6 V cheia) | não cabe | cabe |
  | 4S (16,8 V cheia) | não cabe | não cabe |

- **Ponte H, corrente** (informativo): a corrente travada de cada motor passa do pico da ponte (DRV8833 2 A, TB6612FNG 3,2 A).

**Nada é bloqueado.** Qualquer combinação pode ser salva, passa na inspeção (que só olha dimensões, massa e CG) e luta normalmente. Um teste confirma isso com um N20 de 6 V na 4S, 2,8× a nominal.

## Catálogo: o que ficou e o que saiu

**Regra:** uma linha de motor fica no catálogo se ao menos uma bateria a deixa com sobretensão no máximo moderada (cheia ≤ 1,5×).

| Linha | V do motor | 2S (nominal/cheia) | 3S | 4S | Indicada | Fica? |
|---|---|---|---|---|---|---|
| N20 HP 6 V | 6 | 1,23/1,40 · atenção | 1,85/2,10 · crítico | 2,47/2,80 · crítico | 2S | sim |
| N20 comum (MP) 6 V | 6 | 1,23/1,40 · atenção | 1,85/2,10 · crítico | 2,47/2,80 · crítico | 2S | sim |
| **N20 HPCB 12 V** (nova) | 12 | 0,62/0,70 · atenção (subtensão) | 0,92/1,05 · **compatível** | 1,23/1,40 · atenção | 3S | sim |
| N30 12 V | 12 | 0,62/0,70 · atenção (subtensão) | 0,92/1,05 · **compatível** | 1,23/1,40 · atenção | 3S | sim |
| JGA16-050 6 V | 6 | 1,23/1,40 · atenção | 1,85/2,10 · crítico | 2,47/2,80 · crítico | 2S | sim |
| **JGA16-050 12 V** (nova) | 12 | 0,62/0,70 · atenção (subtensão) | 0,92/1,05 · **compatível** | 1,23/1,40 · atenção | 3S | sim |
| ~~N30 5 V~~ | 5 | 1,48/**1,68** · risco | 2,22/2,52 · crítico | 2,96/3,36 · crítico | — | **não** |

**Leitura:**
- **Saiu o N30 5 V** (KS-GM12-N30). Nem a 2S serve: cheia, ela dá 8,4 V, 1,68× a tensão do motor, e travado ele esquentaria 2,8× mais.
- **As linhas de 6 V ficam,** só com a 2S. Rodar 6 V na 2S é comum em mini sumô, mas cai sempre em "atenção".
- **Entraram as versões de 12 V do N20 e do JGA16-050.** Sem elas, a 3S, a única bateria "compatível" com motores de 12 V, só teria o N30.
  - N20 HPCB 12 V (Pololu): 10:1 a 210:1, 0,75 A travado, escovas de carvão, de vida longa.
  - JGA16-050 12 V (NFP-JGA16-050-12120): mesma rotação e torque da versão de 6 V, metade da corrente.
- **Não há motor "compatível" com a 4S** neste catálogo. Ela só faz sentido com motores de 12 V, em sobretensão moderada (1,40× cheia), ou com motores de tensão nominal maior que você digitar no editor.
- **Tensão de 4S e ponte H:** a 4S passa das duas pontes comuns, DRV8833 e TB6612FNG, e o editor avisa.

## Bateria de cada preset

**Como foi escolhido:**
- **Candidatos:** cada preset manteve a família e a redução escolhidas antes (ver [ANALISE-ROBOS.md](ANALISE-ROBOS.md)) e testou todas as combinações linha × bateria que não passam de "atenção". A JGA16 de 12 V na 4S rende igual à de 6 V na 2S (mesma k = 1,23); só a corrente muda, então ficou de fora.
- **Torneio:** bot difícil × bot difícil, largada sorteada, 5 sementes × 2 lados por par. Cada candidato enfrentou os candidatos dos outros corpos e os do próprio corpo (confronto direto).
- **Escolha:** a maior taxa de vitória. Se um candidato "compatível" fica a até 10 pontos do melhor, ele ganha, porque essa diferença é ruído com estas amostras.

**Triagem:**

| Candidato | Nível | RPM na bateria | kgf·cm | v máx. | Força ÷ tração | Empinar (estimativa) | 2 motores travados, cheia |
|---|---|---|---|---|---|---|---|
| Kunai JGA16 6 V 32:1 · 2S | atenção | 463 | 1,02 | 0,77 m/s | 3,5× | 5° | 5,6 A |
| **Kunai JGA16 12 V 32:1 · 3S** | compatível | 347 | 0,77 | 0,58 m/s | 2,6× | 3° | 2,1 A |
| Kunai JGA16 12 V 32:1 · 2S | atenção | 231 | 0,51 | 0,39 m/s | 1,7× | 1° | 1,4 A |
| Tora N30 12 V 50:1 · 2S | atenção | 197 | 0,99 | 0,27 m/s | 3,9× | 1° | 0,8 A |
| **Tora N30 12 V 50:1 · 3S** | compatível | 296 | 1,48 | 0,40 m/s | 5,8× | 2° | 1,3 A |
| Tora N30 12 V 50:1 · 4S | atenção | 395 | 1,97 | 0,54 m/s | 7,8× | 3° | 1,7 A |
| Fuji N20 HP 6 V 50:1 · 2S | atenção | 728 | 1,06 | 0,84 m/s | 4,9× | 2° | 4,5 A |
| Fuji N20 HPCB 12 V 50:1 · 2S | atenção | 401 | 0,41 | 0,46 m/s | 1,9× | 1° | 1,1 A |
| **Fuji N20 HPCB 12 V 50:1 · 3S** | compatível | 601 | 0,62 | 0,69 m/s | 2,9× | 1° | 1,6 A |
| Fuji N20 HPCB 12 V 50:1 · 4S | atenção | 802 | 0,83 | 0,92 m/s | 3,8× | 3° | 2,1 A |

**Taxa de vitória contra os candidatos dos outros corpos:**

| Robô | Candidatos (taxa) | Escolhido |
|---|---|---|
| Kunai | JGA16 6 V 2S **9%** · 12 V 3S 4% · 12 V 2S 7% | **12 V 3S**: compatível, a 4 pontos do melhor |
| Tora | 2S 77% · **3S 83%** · 4S 76% | **3S**: a maior taxa |
| Fuji | HP 6 V 2S 62% · HPCB 2S 55% · **HPCB 3S 68%** · HPCB 4S 67% | **HPCB 12 V 3S**: a maior taxa |

**Confronto direto, no mesmo corpo** (10 partidas por par):

| Robô | A × B | Vitórias A × B |
|---|---|---|
| Kunai | 6 V 2S × **12 V 3S** | 2 × **8** |
| Kunai | 6 V 2S × **12 V 2S** | 2 × **8** |
| Tora | **3S** × 4S | **7** × 3 |
| Tora | 2S × 3S | 5 × 5 |
| Fuji | HP 6 V 2S × HPCB 3S | 5 × 5 |
| Fuji | **HPCB 3S** × HPCB 4S | **6** × 4 |

**Leitura:**
- **Os três presets ficaram na 3S, com motor de 12 V, todos "compatíveis"** (1,05× cheia). Nenhum preset mostra alerta de tensão.
  - Kunai trocou a JGA16 de 6 V pela de 12 V.
  - Fuji trocou o N20 HP 6 V pelo N20 HPCB 12 V.
  - Tora já usava o N30 12 V.
- **Mais tensão não é mais vitória.** A 4S deixou o Tora e o Fuji mais rápidos, e eles perderam no confronto direto para a 3S: 3 × 7 e 4 × 6. O Tora tem 7,8× mais força de motor que tração na 4S; o excesso só patina.
- **O Kunai continua o corpo mais fraco** com qualquer bateria (4–9%, dentro do ruído). No confronto direto, a JGA16 12 V na 3S venceu a 6 V na 2S por 8 × 2, e ainda tira o alerta de sobretensão.
- **A 2S com motor de 12 V** (subtensão, 62%) é a pior opção do Fuji e não melhora o Tora (empate no confronto direto, menos vitórias no torneio).

**O que mudou para o jogador:**
- **Kunai:** 375 → 347 RPM e 0,83 → 0,77 kgf·cm, 92,5% da ficha.
- **Tora:** 320 → 296 RPM e 1,6 → 1,48 kgf·cm.
- **Fuji:** 590 → 601 RPM e 0,86 → 0,62 kgf·cm. A rotação ficou parecida e o torque caiu; o Fuji continua limitado por tração (2,9×).
- **Hierarquia:** veja a tabela de bot × bot em [ANALISE-ROBOS.md](ANALISE-ROBOS.md).

## Interface

**Editor, grupo Motor:**
- **Bateria LiPo:** escolha entre 2S, 3S e 4S.
- **Motor do catálogo:** cada linha diz, no rótulo do grupo, como combina com a bateria escolhida. Ex.: "N20 HP 6 V · crítico: sobretensão 2,10× na 3S (ideal 2S)".
- **Tensão nominal do motor:** campo editável, para motores fora do catálogo.
- **Corrente de travamento:** campo editável; 0 = não informada, sem alertas de corrente.
- **Painel "Motor × bateria":**
  - rotação e torque na bateria;
  - razão de tensão e calor travado (k²);
  - corrente dos motores travados contra a do pack;
  - massa do pack;
  - todos os alertas, com cor por nível.
- **Caixa de inspeção:** a 1ª linha resume a compatibilidade.

**Tela de seleção:**
- a linha Motor mostra os valores na bateria ("na 3S");
- uma linha Bateria;
- um selo colorido com o resumo (o texto completo aparece ao passar o mouse).

**Segurança:**
- Só 2, 3 ou 4 células são aceitas. Texto, 1S, 6S, NaN ou um objeto viram 2S, e chaves extras são descartadas.
- A tensão do motor fica entre 3 e 24 V, e a corrente entre 0,01 e 10 A.
- Uma opção injetada no `<select>` da bateria é ignorada.
- Os textos dos alertas só usam números e frases fixas.

**Robôs salvos antes das baterias** passam a usar 2S, com a tensão do motor igual à da bateria (7,4 V). Assim k = 1, e eles rendem exatamente o que rendiam antes. Como a tensão salva (7,4 V) não bate com nenhum motor do catálogo, o editor mostra "Personalizado" até você escolher o motor de novo.

## Limitações

- **A bateria não cai de tensão sob carga.** Com 75C e 450 mAh, a resistência interna é pequena perto da dos motores, mas uma queda de alguns décimos de volt no travamento fica de fora.
- **O driver não limita corrente na física.** Os alertas de ponte H são só informativos.
- **A constante de tempo do N20 HPCB 12 V (18 ms) é estimada**, igual à do N20 MP: motor de corrente baixa, com mais espiras e mais inércia relativa.
- **Ruído:** com 60–70 partidas por candidato, diferenças menores que ~10 pontos são ruído. A escolha do Kunai é praticamente empate; o confronto direto e o alerta de sobretensão desempataram.

## Fontes

- Tensões de LiPo (3,7 V nominal, 4,2 V cheia): [SkyRC — o padrão de 4,2 V](https://blog.skyrc.com/understanding-the-4-2v-standard-in-lipo-batteries/)
- Packs Tattu 450 mAh 75C:
  - [2S](https://wrekd.com/products/tattu-7-4v-2s-450mah-75c-lipo-micro-battery-jst-syp)
  - [3S](https://www.rotorama.com/product/tattu-gens-ace-450mah-3s-75c)
  - [4S](https://ca.wrekd.com/products/tattu-14-8v-4s-450mah-75c-lipo-micro-battery-xt30)
- Pololu Micro Metal Gearmotors: linhas HP/MP/HPCB, torque máximo de 2 kgf·cm na caixa e vida útil com sobretensão. [pololu.com/product/2217](https://www.pololu.com/product/2217)
- TB6612FNG: VM 13,5 V de operação e 15 V absoluto, 1,2 A contínuos, 3,2 A de pico. [Folha de dados (Toshiba, via MSOE)](https://faculty-web.msoe.edu/johnsontimoj/Common/FILES/TB6612FNG.pdf)
- DRV8833: 2,7–10,8 V, 1,5 A RMS e 2 A de pico. [Folha de dados (TI)](https://www.ti.com/document-viewer/DRV8833/datasheet)
- JGA16-050, versões de 6 V e 12 V: [NFP Motor](https://microdcmotors.com/product/6v-12v-micro-metal-gearmotor-model-nfp-gm16-050sh)
- N30 5 V, linha removida: [KS-GM12-N30](https://www.motormicro.com/product/12-20mm-n30-gear-motor-5-12v-dc-10200-17000rpm-gearbox-27-567rpm-d-shaft-ks-gm12-n30)
