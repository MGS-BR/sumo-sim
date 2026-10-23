# Análise da lâmina — comprimento, largura e ângulo

Reproduzir: `npm run analise` (≈1 min). Código em `analysis/blade.test.ts`.

## Como foi medido

- **Duelos em espelho:** a variante enfrenta o mesmo preset original, então só a lâmina muda.
- **Round de verdade:** passa por `Match` + juiz, incluindo a iniciativa do Art. 13. Os dois robôs acionam 100% para a frente a partir do bip.
- **Repetições:** 9 largadas por configuração, combinando deslocamentos de −4, 0 e +4 mm com giros de −1,7°, 0 e +1,7°.
- **Colunas:**
  - **pontos**: Yuko da variante;
  - **entraPorBaixo**: nos primeiros 150 ms de contato, a variante ficou com mais peso nas rodas que o rival, ou seja, entrou por baixo;
  - **carga**: fração média do peso nas rodas durante o contato (1,00 = todo o peso; abaixo disso, o robô está sendo levantado);
  - **levanta**: elevação máxima do rival.
- **Ruído:** com 9 repetições, diferenças de até 2–3 vitórias são ruído. Só vale tendência forte.

## Geometria: por que só dois dos três (ângulo, comprimento, altura) são livres

A lâmina é uma rampa. Por isso, **altura = comprimento × sen(ângulo)** e **profundidade = comprimento × cos(ângulo)**. No editor você ajusta **ângulo, comprimento e largura**, e a altura acompanha. Também dá para digitar a altura, e aí o comprimento é recalculado.

**Custo do comprimento:** a profundidade sai do comprimento total de 100 mm. Com 20°, uma lâmina de 52 mm ocupa 49 mm e deixa menos de 30 mm de chassi. A inspeção reprova ("Lâmina longa demais").

## Resultados — Trator (4 rodas, todo o peso nas rodas): os mais limpos

| Variável | Variante | Pontos | Entra por baixo | Leitura |
|---|---|---|---|---|
| Ângulo | 12° (original 20°) | **9/9** | 9/9 | Rampa mais deitada entra por baixo sempre |
| Ângulo | 30° e 40° | **0/9** | 0/9 | Rampa íngreme vira rampa para o rival |
| Comprimento | 11,7 / 17,5 / 29,2 mm | 4/9 | 4/9 | Mesmo ângulo e mesma aresta: cara ou coroa |
| Comprimento | **40,9 mm** | **9/9** | 9/9 | Com aresta empatada, a rampa mais longa vence a "disputa de rampas" |
| Comprimento | 52,6 mm | 0/9 (6 Torinaoshi) | — | Reprovado na inspeção; robô vira só lâmina |
| Largura, frontal | 99 / 80 / 60 / 40 mm | 4 / 3 / 6 / 6 | ~4/9 | De frente, lâmina contra lâmina: pouca diferença |
| Largura, desalinhado 3 cm | 99 → 60 mm | 2/9 → **0/9** | 3/9 → **0/9** | Lâmina estreita erra o rival; a lâmina dele pega a quina/roda exposta (carga cai para 0,10) |

Na defesa, com a quina atacada a 4,5 cm, as lâminas estreitas (60 e 40 mm) sofreram menos pontos. A carga delas também caiu para 0,39–0,63, ou seja, foram levantadas. A explicação é que o atacante pega a roda e o canto, gira o defensor e os dois escorregam de lado em vez de um empurrar o outro para fora. Isso depende do roteiro "acelerador no fundo, sem mira". **Não leia como "lâmina estreita defende melhor".**

## Resultados — Kunai (2 rodas, cunha contínua): mais caótico

A cunha inteira já é uma rampa de 45 mm de altura. Por isso, o rival muitas vezes **sobe e passa por cima**, e quem levantou segue reto para fora.

- **Desalinhado 3 cm, largura total:** entra por baixo em 8/9, levanta o rival 37 mm e mesmo assim faz **0/9 pontos**. Levantar demais sem controle não fecha o ponto.
- **Ângulo 38–48°:** nunca entra por baixo, mas pontua 8/9 e 5/9. O original sobe na frente íngreme e cai sozinho do outro lado.
- **Comprimento:** quase não muda nada (3–6/9), porque o corpo já continua a rampa.

## Conclusões práticas

1. **Ângulo e aresta decidem quem entra por baixo.** É a alavanca mais forte. Rampa deitada (12–20°) com aresta rente (0–0,3 mm) entra por baixo de lâminas mais íngremes ou mais altas.
2. **Comprimento é desempate e alcance.** Com o mesmo ângulo e a mesma aresta, a lâmina mais longa vence porque o rival sobe nela, não o contrário. O limite é o chassi que sobra dentro de 100 mm.
3. **Largura total é a escolha segura no ataque.** Lâmina estreita só funciona se o golpe for sempre centralizado. Fora do centro, expõe quinas e rodas.
4. **Robô de cunha contínua precisa de controle depois de levantar** (aliviar ou mirar a borda). Senão, o rival passa por cima. Isso é bom para quem pilota, ruim para bot de roteiro fixo.

## Limitações

- O roteiro de acelerador fixo não representa pilotagem humana.
- A lâmina é rígida (sem flexão nem desgaste) e o atrito de contato é simplificado.
- 9 repetições por configuração.
- Os números servem para comparar tendências dentro do simulador, não para prever um robô real sem calibrar massa, CG e atritos com medidas reais.
