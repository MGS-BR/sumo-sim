# Simulador Mini Sumô 500g — Requisitos e decisões (v0.1)

Simulador web de luta de robôs da categoria **Mini Sumô (500 g)**, com física 3D em escala real e juiz automático baseado no **Regulamento RoboCore Sumô de Robôs v3.1 (11/08/2025)**. Referência de experiência: arena.tapout.gg (menu → seleção → luta → resultado → revanche).

Legenda: ✅ implementado · 🔜 previsto na arquitetura, não implementado

---

## 1. Escopo decidido

| Decisão | Escolha |
|---|---|
| Plataforma | Projeto Vite + TypeScript, Three.js (render) + Rapier 3D (física, build determinística) |
| Jogadores | Local: 2 jogadores no mesmo teclado ou jogador × bot de treino. Online fica para depois |
| Modos | **Realista** (tempo real) e **Arcade** (mesma física a 50% do tempo + entrada mais suave) |
| Robôs | 3 presets inspirados nas fotos + editor de robôs com validação pela caixa de inspeção |
| Bot | Bot de treino agora; bot autônomo com sensores simulados no futuro |

## 2. Requisitos funcionais

| ID | Requisito | Status |
|---|---|---|
| RF01 | Dohyo de 77 cm × 2,5 cm, tawara de 2,5 cm (conta como dentro), shikiri-sen 1 × 10 cm a 5 cm do centro, yochi 180 × 180 cm | ✅ |
| RF02 | Robôs em escala real: até 100 × 100 mm, altura livre, até 500 g | ✅ |
| RF03 | Física 3D: tração limitada por μ·N em cada roda; rampa da lâmina reduz a carga nas rodas do rival | ✅ |
| RF04 | Controle por teclado, P1 (WASD) e P2 (setas), com ajuste fino (Shift) e rampa de aceleração (simula PWM) | ✅ |
| RF05 | Fase de posicionamento (shikiri) com validação do Art. 10, pelo teclado ou arrastando com o mouse (roda gira; toque também funciona) | ✅ |
| RF06 | Juiz automático: rounds, Yuko, Shinitai, Torinaoshi, Hansoku, Keikoku, Yusei, prorrogação | ✅ |
| RF07 | HUD: placar de Yuko, Keikoku, round, relógio, contagem do juiz (1-2-3), mensagens | ✅ |
| RF08 | Presets prontos (Kunai, Bloco, Trator) | ✅ |
| RF09 | Editor de robô: dimensões, lâmina (ângulo, comprimento, largura, altura ligada, aresta), rodas, motor, massa e CG; inspeção ao vivo; câmera controlada pelo mouse com vistas prontas; salvo no navegador | ✅ |
| RF10 | Câmeras: transmissão, de cima, rente ao dohyo, livre (mouse) | ✅ |
| RF11 | Replay em câmera lenta do lance do Yuko. Quando o ponto é por tocar fora, o replay congela no instante do toque, aproxima a câmera rente ao chão e marca o ponto | ✅ |
| RF17 | Sons: motor de cada robô (tom pela rotação, volume pela corrente), raspagem no contato, batida proporcional ao impacto, chiado de pneu patinando; volume ajustável | ✅ |
| RF12 | Modo debug: carga e tração por roda, patinação, CG, % do peso nas rodas | ✅ |
| RF13 | Bot de treino (fácil/médio/difícil) | ✅ |
| RF14 | Bot autônomo programável com sensores simulados (oponente, linha) | 🔜 |
| RF15 | Multijogador online | 🔜 |
| RF16 | Controles por toque (celular) | 🔜 |

## 3. Requisitos não funcionais

| ID | Requisito | Como foi atendido |
|---|---|---|
| RNF01 | Simulação independente da taxa de quadros | Passo fixo de 480 Hz; acumulador de tempo |
| RNF02 | Determinismo (base do online) | Rapier `deterministic-compat`; entrada só por `ControlFrame` por tick; teste automatizado confirma |
| RNF03 | Simulação sem DOM | `src/sim/` roda no navegador e no Node (testes) |
| RNF04 | Geometria única | A mesma spec gera colisores e malhas 3D |
| RNF05 | Desempenho | 10 s de luta simulam em ~0,4 s no Node (~25× tempo real). `?gfx=low` desliga sombras/antialias |

## 4. Modelo físico

**Por que 3D:** o mecanismo central do sumô é a lâmina entrando por baixo, levantando o rival e tirando peso das rodas dele. Isso só existe com corpo rígido 3D e tração dependente da carga.

- **Escala:** 1 unidade = 1 m. `lengthUnit = 0,01` no Rapier para tolerância de penetração de ~0,1 mm.
- **Chassi e lâmina:** cascos convexos gerados da spec. Lâmina com atrito baixo (aço ~0,2), chassi ~0,4.
- **Rodas (modelo próprio, não colisores):** raycast por roda contra o dohyo/chão. Suspensão rígida (9000 N/m por roda, com pré-carga compensando a deflexão estática). Isso dá a carga **N** em cada roda.
- **Motor DC:** τ = τ_travamento · (u − ω/ω_livre), com u = PWM. Com u = 0 o motor freia (curto), e o atrito da redução segura o robô parado.
- **Pneu:** círculo de atrito, |F| ≤ μ·N, com atrito cinético de 85% do estático ao patinar.
- **Rodas como colisores só contra o outro robô:** um rival pode bater na sua roda, mas o contato com o chão é do modelo de pneu.
- **Detecção de "tocar fora":** qualquer colisor tocando o chão de fora, ou uma roda apoiada fora do dohyo.

**Validação (testes automatizados):**
- Velocidade máxima de cada preset dentro de 90–105% da teórica (RPM × raio).
- Todos os presets são limitados por tração, não por motor. Exemplo do Bloco: 4 motores somam ~100 N, mas a tração máxima é ~5,4 N.
- Trator (aresta a 0,2 mm, 20°) contra Bloco (aresta a 0,5 mm): durante o contato, o Bloco fica com menos de 90% do peso nas rodas e o Trator com mais de 100%; o Bloco sai primeiro.
- Robô parado não escorrega (< 1 mm em 3 s).

**Ímãs:** não se aplicam ao Mini Sumô. O dohyo é de madeira com fórmica, e o regulamento proíbe fixação ao dohyo.

## 5. Juiz — mapeamento do regulamento

| Regra | Implementação |
|---|---|
| Art. 8: 3 rounds de 1 min, vence quem fizer 2 Yuko | ✅ |
| Art. 8: com 1 Yuko no fim, vence quem tem | ✅ |
| Art. 8 / 15: sem vencedor → Yusei; sem decisão → prorrogação de 3 min, morte súbita | ✅ Yusei por métrica de domínio (tempo empurrando + posição central). Diferença < 15% → prorrogação |
| Art. 10: posicionamento atrás da shikiri-sen, tocando a faixa | ✅ Basta uma parte do robô na faixa. O robô pode ficar sobre a linha marrom, sem passar da borda dela voltada ao centro. Pedidos fora da regra são corrigidos para a pose válida mais próxima (o robô recua ao girar encostado na linha) |
| Art. 12: Torinaoshi (saída simultânea, travados por 3 s) | ✅ Janela de simultaneidade de 50 ms. Só vale quando nenhum dos dois (ou ambos) tinha a iniciativa |
| Art. 13: Yuko quando o rival toca fora | ✅ |
| Art. 13 (3º item): atacante que conduz o rival para fora vence mesmo saindo antes | ✅ Exige que tenha empurrado nos últimos 0,5 s e que o rival não estivesse empurrando. Vale também para saídas simultâneas |
| Art. 13: qualquer parte tocando fora já é Yuko | ✅ Chassi, lâmina ou roda tocando o chão de fora. O replay congela no instante do toque e aproxima a câmera do ponto |
| Art. 14: Shinitai (roda além da borda por 3 s) | ✅ |
| Art. 16: Keikoku (mexer antes do início; atraso > 30 s); 2 Keikoku = Yuko | ✅ No Realista os motores ficam ligados na contagem: queimar a largada dá Keikoku |
| Art. 17: robô parado por 3 s → Hansoku | ✅ Motor desligado conta como parado mesmo encostado no rival (prevalece sobre o Art. 12) |
| Art. 17: ambos se movendo sem contato por 3 s → Hansoku para os dois | ✅ Configurável. A contagem pausa enquanto os robôs se aproximam |
| Art. 22–23: lado direito do juiz vermelho; adesivo de cor | ✅ |

**Interpretações a revisar com a equipe:**

1. **1×1 ao fim dos 3 rounds:** tratado como empate e decidido por Yusei/prorrogação. O texto só cobre "um ponto" ou "nenhum".
2. **Art. 17, não-combate:** aplicado ao pé da letra, com 3 s e ponto para os dois, mas só conta enquanto a distância não está diminuindo. Pode ser desligado no menu.
3. **"Parado":** velocidade < 8 mm/s e giro < 0,15 rad/s, medidos pela variação de pose.
4. **"Correndo na mesma órbita" (Art. 12):** ainda não detectado automaticamente.
5. **"Não exceder a shikiri-sen" (Art. 10):** o limite é a borda da linha voltada para o centro, ou seja, encostar ou ficar sobre a linha marrom é permitido. Se a equipe entender que o robô precisa ficar inteiro atrás da linha, basta trocar `PLACEMENT_LINE_X` em `src/sim/placement.ts`.

## 6. Controles

| | Vermelho (P1) | Azul (P2) |
|---|---|---|
| Andar / girar | W A S D | ↑ ← ↓ → |
| Ajuste fino | Shift esquerdo | Shift direito ou ; |
| Posicionamento: deslizar | Q / E | , / . (ou Delete / PgDn) |
| Pronto | Espaço | Enter |

Mouse no posicionamento: arraste o robô para mover, use a roda para girar (7,5° por clique, 1° com Shift) e o botão **Pronto** no painel do jogador.

Gerais: **C** câmera · **F2** debug · **Esc** pausa · qualquer tecla pula o replay.

## 7. Arquitetura

```
src/
  sim/            ← sem DOM; roda no navegador, Node e (futuro) servidor
    arena.ts        dimensões oficiais
    types.ts        RobotSpec, ControlFrame, SimSnapshot
    geometry.ts     spec → cascos convexos + rodas (física e render)
    drive.ts        motor DC + pneu (μ·N)
    physics.ts      SumoWorld: Rapier, rodas por raycast, detecção de saída
    referee.ts      Juiz: máquina de estados pura
    placement.ts    Art. 10
    match.ts        física + juiz + posicionamento por tick
    inspection.ts   caixa de inspeção + parâmetros do editor
    presets.ts      Kunai, Bloco, Trator
  control/        ← Controller: teclado, bot (e futuro: rede)
  render/         ← Three.js (só desenha)
  ui/             ← HUD, telas, CSS, persistência
  game.ts         laço: tempo real → ticks fixos, eventos, replay
  app.ts          telas: menu, seleção, editor, pausa, resultado
tests/            vitest (física, juiz, partidas bot × bot, determinismo)
```

## 8. Roadmap

### Bot autônomo (RF14)
- `SensorModel` em `src/sim/sensors.ts`:
  - sensores de oponente como raycasts com alcance (~60–80 cm), cone e ruído configuráveis;
  - sensores de linha (detectam a tawara branca sob o robô).
- O bot recebe só `ctx.sensors`, nunca `snapshot`, e devolve `ControlFrame`. A interface `Controller` não muda.
- Módulo de start seguindo o controle IR do juiz (Pronto / Start / Stop, Art. 10).
- Editor de "estratégia": código JS em sandbox (Web Worker) com tempo de CPU limitado.

### Online (RF15)
- `Match` já é um servidor autoritativo em miniatura: recebe `ControlFrame` por tick e é determinístico.
- Caminho sugerido: lockstep com atraso de entrada (2 jogadores, 480 Hz agrupados em pacotes de 60 Hz), ou servidor Node autoritativo rodando `src/sim` e enviando snapshots.
- Novo `RemoteController implements Controller`.

### Outros
- Controles por toque.
- Rapier não-compat com `.wasm` separado (bundle de 5 MB → ~2 MB).
- Torneio/chaveamento.
- Exportar/importar robôs (JSON).
- Mega Sumô e Sumô LEGO reaproveitando a mesma base (dimensões e limites já isolados).

Análise detalhada de comprimento, largura e ângulo da lâmina: [ANALISE-LAMINA.md](ANALISE-LAMINA.md).

## 9. Limitações conhecidas
- O modelo de pneu é simplificado: sem inércia própria da roda e sem curva de atrito por escorregamento.
- O bot de treino "vê" a posição real do rival (não usa sensores).
- Não há dano nem quebra de lâmina (Nota 14). Ela não se aplica a uma lâmina indestrutível.
- Detecção de "mesma órbita" (Art. 12) não implementada.
