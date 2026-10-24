# Análise da lâmina — comprimento, largura e ângulo

Reproduzir: `npm run analise` (≈1 min). Código em `analysis/blade.test.ts`.
O Trator deixou de ser preset, mas continua como robô de teste (`tests/fixtures.ts`) com os mesmos valores. Rodada de novo depois da troca de presets: resultados idênticos.
A análise dos presets atuais (Kunai, Tora, Fuji) está em [ANALISE-ROBOS.md](ANALISE-ROBOS.md).
Resultados atualizados com as **rodas embutidas na chassi** (caixas de roda). A seção "O que mudou com as rodas embutidas" compara com a versão anterior.

## Como foi medido

- **Duelos em espelho:** a variante enfrenta o mesmo preset original, então só a lâmina muda.
- **Round de verdade:** passa por `Match` + juiz, incluindo a iniciativa do Art. 13. Os dois robôs acionam 100% para a frente a partir do bip.
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

| Variável | Variante | Pontos | Entra por baixo | Leitura |
|---|---|---|---|---|
| Ângulo | 12° (original 20°) | **8/9** | 8/9 | Rampa mais deitada entra por baixo |
| Ângulo | 30° e 40° | **0/9** | 0/9 | Rampa íngreme vira rampa para o rival |
| Comprimento | 11,7 / 17,5 / 29,2 mm | 5 / 4 / 5 | ~5/9 | Mesmo ângulo e mesma aresta: cara ou coroa |
| Comprimento | **40,9 mm** | **9/9** | 9/9 | Com aresta empatada, a rampa mais longa vence a "disputa de rampas" |
| Comprimento | 52,6 mm | 7/9 | 7/9 | Funciona, mas é reprovado na inspeção |
| Largura, frontal | 99 → 40 mm | 3–6/9 | ~4/9 | Pouca diferença |
| Largura, desalinhado 3 cm | 99 / 80 / 60 / 40 mm | 3 / 4 / 4 / 4 | 3–4/9 | Sem diferença clara (ver abaixo) |

## Kunai (2 rodas, cunha contínua): caótico

Em espelho, dois Kunai iguais ficam travados com frequência: até 7 Torinaoshi em 9. A cunha inteira já é uma rampa de 45 mm, então o rival sobe e passa por cima.

- **Comprimento:** lâminas curtas fizeram 0–1/9; as de 36–46 mm entraram por baixo em 6/9, mas só fecharam 3–4/9.
- **Ângulo:** 20° entra por baixo em 8/9, porém é reprovado (a lâmina rouba chassi). Já 38–48° nunca entram por baixo.
- Levantar sem controle não fecha o ponto. Esse tipo de robô depende de pilotagem.

## O que mudou com as rodas embutidas

| Teste (Trator, desalinhado 3 cm) | Rodas por fora | Rodas embutidas |
|---|---|---|
| Lâmina de 60 mm | 0/9, nunca entra por baixo (carga 0,10) | 4/9 |
| Lâmina de 40 mm | 2/9 | 4/9 |

Com as rodas por fora, um golpe desalinhado pegava a quina e a roda expostas da lâmina estreita. Agora a lateral da chassi cobre a roda e o rival encontra chassi, não pneu. **A lâmina estreita deixou de ser um ponto fraco grave**, pelo menos neste modelo. Os resultados de ângulo e comprimento praticamente não mudaram (diferenças de 1/9, dentro do ruído).

## Conclusões práticas

1. **Ângulo e aresta decidem quem entra por baixo.** É a alavanca mais forte: 12° contra 20° faz 8/9, e 30° ou mais faz 0/9.
2. **Comprimento é desempate e alcance.** Com o mesmo ângulo e a mesma aresta, a lâmina mais longa vence porque o rival sobe nela. O limite é o chassi que sobra.
3. **Largura importa menos do que parecia** quando a chassi envolve as rodas. Com rodas expostas, prefira lâmina larga.
4. **Cunha contínua de 2 rodas precisa de pilotagem** depois de levantar; senão o rival passa por cima.

## Limitações

- O roteiro de acelerador fixo não representa pilotagem humana.
- A lâmina é rígida e o atrito é simplificado.
- O arco das caixas de roda vira fatias convexas na física, com erro da corda abaixo de 0,6 mm.
- 9 repetições por configuração.
- Serve para comparar tendências dentro do simulador; para prever um robô real, calibre massa, CG e atritos com medidas reais.
