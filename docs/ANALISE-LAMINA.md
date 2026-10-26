# Análise da lâmina — comprimento, largura e ângulo

Reproduzir: `npm run analise` (cerca de 7 min). Código em `analysis/blade.test.ts`.
O Trator deixou de ser preset, mas continua como robô de teste (`tests/fixtures.ts`) com os mesmos valores.
A análise dos presets atuais (Kunai, Tora, Fuji) está em [ANALISE-ROBOS.md](ANALISE-ROBOS.md).

> **Rodada de novo com o modelo de roda com inércia e curva de atrito** ([ANALISE-RODAS-MOTORES.md](ANALISE-RODAS-MOTORES.md)), com partida suave.
> A seção "O que mudou com o novo modelo de roda" compara com a versão anterior. **Só a tendência do ângulo se manteve**; comprimento e largura mudaram de lado e não devem ser lidos como regra.

## Como foi medido

- **Duelos em espelho:** a variante enfrenta o mesmo preset original, então só a lâmina muda.
- **Round de verdade:** passa por `Match` + juiz, incluindo a iniciativa do Art. 13. Os dois robôs vão a 100% para a frente a partir do bip, com partida suave (0 → 100% em ~70 ms).
- **Repetições:** 9 largadas por configuração, combinando deslocamentos de −4, 0 e +4 mm com giros de −1,7°, 0 e +1,7°.
- **Colunas:**
  - **pontos**: Yuko da variante;
  - **entraPorBaixo**: nos primeiros 150 ms de contato, a variante ficou com mais peso nas rodas que o rival;
  - **carga**: fração média do peso nas rodas durante o contato (1,00 = todo o peso).
- **Ruído:** com 9 repetições, diferenças de até 2–3 são ruído. Só vale tendência forte.

## Geometria: só dois dos três (ângulo, comprimento, altura) são livres

A lâmina é uma rampa. Por isso, **altura = comprimento × sen(ângulo)** e **profundidade = comprimento × cos(ângulo)**. No editor você ajusta ângulo, comprimento e largura, e a altura acompanha. Se digitar a altura, o comprimento é recalculado.

**Custo do comprimento:** a profundidade sai dos 100 mm do robô. Com 20°, uma lâmina de 52 mm deixa menos de 30 mm de chassi, e a inspeção reprova.

## Trator (4 rodas, todo o peso nas rodas)

| Variável | Variante | Pontos | Entra por baixo | Antes (modelo sem inércia) |
|---|---|---|---|---|
| Ângulo | **12°** (original 20°) | **7/9** | 7/9 | 8/9 |
| Ângulo | 30° / 40° | 3/9 / 2/9 | 3/9 / 2/9 | 0/9 / 0/9 |
| Comprimento | 11,7 / 17,5 / 29,2 mm | 5 / 7 / 6 | 5–7/9 | 5 / 4 / 5 |
| Comprimento | 40,9 mm | **0/9** | 0/9 | 9/9 |
| Comprimento | 52,6 mm (reprovado) | 0/9 | 0/9 | 7/9 |
| Largura, frontal | 99 / 80 / 60 / 40 mm | 6 / 6 / 6 / 4 | 4–6/9 | 3–6/9 |
| Largura, desalinhado 3 cm | 99 / 80 / 60 / 40 mm | 2 / 3 / 8 / 8 | 2–8/9 | 3 / 4 / 4 / 4 |
| Largura na defesa (quina atacada) | 99 / 80 / 60 / 40 mm | 1 / 4 / 9 / 1 | — | 5 / 4 / 6 / 6 |

## Kunai (2 rodas, cunha contínua)

> Rodado de novo com o motor real do preset (JGA16-050 32:1, 375 RPM). Antes ele tinha 800 RPM e 2,4 kgf·cm, e a maioria das largadas terminava em Torinaoshi.

| Variável | Variante | Pontos | Entra por baixo |
|---|---|---|---|
| Ângulo | 20° (original 28°; reprovado: a lâmina rouba chassi) | **9/9** | 9/9 |
| Ângulo | 38° / 48° | 3/9 / 2/9 | 3/9 / 2/9 |
| Comprimento | 10,2 / 15,4 mm | 4 / 2 | 4 / 2 |
| Comprimento | 25,6 (original) / 35,8 / 46,1 mm | 6 / 6 / 6 | 6/9 |
| Largura, frontal | 99 / 80 / 60 / 40 mm | **6** / 3 / 2 / **0** | 6 / 3 / 2 / 0 |
| Largura, desalinhado 3 cm | 99 / 80 / 60 / 40 mm | 6 / 7 / 3 / 3 | 3–7/9 |
| Largura na defesa (quina atacada) | 99 / 80 / 60 / 40 mm | 3 / 3 / 3 / 0 | — |

**Com o motor real, o Kunai deixou de ser caótico:** quase não há Torinaoshi. Duas tendências aparecem:
- **Ângulo:** rampa deitada entra por baixo (20° fez 9/9; 48° fez 2/9).
- **Largura:** na cunha contínua, lâmina larga é melhor. Com 40 mm, a variante não entrou por baixo nenhuma vez.

## O que mudou com o novo modelo de roda

- **Mais incerteza:** o robô agora pode chegar ao choque com o nariz levantado. O torque que acelera rotor e roda volta para o chassi, e quem acelera mais forte levanta a frente alguns milímetros. Isso entra na "disputa de rampas" e muda resultados que antes dependiam só da geometria.
- **Comprimento:** a lâmina longa de 40,9 mm, que vencia 9/9, passou a perder 9/9. A causa exata não foi isolada; o resultado mostra que o comprimento, sozinho, não decide.
- **Ângulo:** foi o único resultado que se manteve. Rampa deitada (12°) entra por baixo; íngreme (30° ou mais) quase não entra.

## Conclusões práticas

1. **Ângulo e aresta decidem quem entra por baixo.** É a alavanca mais forte e a única que se manteve nos dois modelos, no Trator e no Kunai.
2. **Não empinar no choque vale tanto quanto a lâmina.** CG à frente, partida suave e motor sem torque sobrando (ver [ANALISE-RODAS-MOTORES.md](ANALISE-RODAS-MOTORES.md)).
3. **Comprimento e largura dependem do resto do robô.** No Trator, os resultados viraram quando a dinâmica da roda mudou. Na cunha do Kunai, lâmina larga venceu com clareza. Teste no seu robô antes de tirar regra.
4. **O motor muda o resultado da lâmina.** O Kunai com o motor antigo (800 RPM, 2,4 kgf·cm) travava em Torinaoshi; com o JGA16-050 real as tendências aparecem.

## Limitações

- O roteiro de acelerador fixo não representa pilotagem humana.
- A lâmina é rígida e o atrito é simplificado.
- O arco das caixas de roda vira fatias convexas na física, com erro da corda abaixo de 0,6 mm.
- 9 repetições por configuração.
- A constante de tempo do motor (inércia do rotor) é estimada e muda quanto o robô empina.
- Serve para comparar tendências dentro do simulador; para prever um robô real, calibre massa, CG e atritos com medidas reais.
