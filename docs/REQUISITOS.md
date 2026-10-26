# Simulador Mini Sumô 500g — Requisitos e decisões

Simulador web de luta de robôs da categoria **Mini Sumô (500 g)**, com física 3D em escala real e juiz automático baseado no **Regulamento RoboCore Sumô de Robôs v3.1 (11/08/2025)**. Referência de experiência: arena.tapout.gg (menu → seleção → luta → resultado → revanche).

Legenda: ✅ implementado · 🔜 previsto na arquitetura, não implementado

---

## 1. Escopo decidido

| Decisão | Escolha |
|---|---|
| Plataforma | Projeto Vite + TypeScript, Three.js (render) + Rapier 3D (física, build determinística) |
| Jogadores | Local: 2 jogadores no mesmo teclado, jogador × bot de treino ou treino contra uma caixa. Online fica para depois |
| Modos | **Realista** (tempo real) e **Arcade** (mesma física a 50% do tempo + entrada mais suave) |
| Robôs | 3 presets (Kunai da foto de referência; Tora e Fuji das configurações enviadas), cada um com um motor real do catálogo, + editor de robôs com validação pela caixa de inspeção |
| Bot | Bot de treino agora; bot autônomo com sensores simulados no futuro |

## 2. Requisitos funcionais

| ID | Requisito | Status |
|---|---|---|
| RF01 | Dohyo de 77 cm × 2,5 cm, tawara de 2,5 cm (conta como dentro), shikiri-sen 1 × 10 cm a 5 cm do centro, yochi 180 × 180 cm | ✅ |
| RF02 | Robôs em escala real: até 100 × 100 mm, altura livre, até 500 g | ✅ |
| RF03 | Física 3D: tração limitada por μ·N em cada roda; rampa da lâmina reduz a carga nas rodas do rival | ✅ |
| RF04 | Controle por teclado, P1 (WASD) e P2 (setas), com ajuste fino (Shift) e rampa de aceleração (simula PWM). Contra o bot ou no treino, WASD e setas controlam o mesmo robô | ✅ |
| RF05 | Fase de posicionamento (shikiri) com validação do Art. 10, pelo teclado ou arrastando com o mouse (roda gira; toque também funciona) | ✅ |
| RF06 | Juiz automático: rounds, Yuko, Shinitai, Torinaoshi, Hansoku, Keikoku, Yusei, prorrogação | ✅ |
| RF07 | HUD: placar de Yuko, Keikoku, round, relógio, contagem do juiz (1-2-3), mensagens | ✅ |
| RF08 | Presets prontos: Kunai (JGA16), Tora (N30, laranja) e Fuji (N20, roxo). Tora e Fuji usam a geometria enviada pelo usuário. Cada um tem um motor real do catálogo, um de cada família, escolhido por análise (JGA16-050 32:1, N30 12 V 50:1, N20 HP 50:1). Bloco e Trator ficaram só como robôs de teste. Configuração salva com um robô que não existe mais cai num preset válido, diferente do outro lado | ✅ |
| RF09 | Editor de robô: dimensões, lâmina (ângulo, comprimento, largura, altura ligada, aresta), rodas, motor, massa e CG; inspeção ao vivo; câmera controlada pelo mouse com vistas prontas; salvo no navegador | ✅ |
| RF10 | Câmeras: transmissão, de cima, rente ao dohyo, livre (mouse) | ✅ |
| RF11 | Replay em câmera lenta do lance do Yuko. Quando o ponto é por tocar fora, o replay congela no instante do toque, aproxima a câmera rente ao chão e marca o ponto. Corrigido: a marca podia cair longe do robô, até do lado oposto, quando o Rapier entregava o par de contato invertido. A marca ao vivo agora é a do robô que perdeu o ponto | ✅ |
| RF12 | Modo debug: carga e tração por roda, patinação, CG, % do peso nas rodas | ✅ |
| RF13 | Bot de treino (fácil/médio/difícil), com partida suave (rampa de PWM igual à do teclado no modo realista) | ✅ |
| RF14 | Bot autônomo programável com sensores simulados (oponente, linha) | 🔜 |
| RF15 | Multijogador online | 🔜 |
| RF16 | Pilotagem por toque no celular (hoje o toque só arrasta o robô no posicionamento) | 🔜 |
| RF17 | Sons: motor de cada robô (tom pela rotação, volume pela corrente) e batida proporcional ao impacto quando os robôs se encostam; volume ajustável. Sem ruído contínuo de atrito/raspagem (removido a pedido) | ✅ |
| RF18 | Ícone da página (dohyo) em SVG, `.ico` (16/32/48 px), PNG 32 px, ícone de toque da Apple e manifesto com 192/512 px. O build de arquivo único embute os ícones. Ícones SVG próprios na interface (sem emojis) e som em todos os botões, por tipo (confirmar, voltar, perigo, seleção) | ✅ |
| RF19 | Rodas embutidas na chassi: laterais em largura total com caixas de roda em arco e folga ajustável (padrão 2 mm). Opção de rodas por fora no editor. A física usa fatias convexas da mesma forma (erro < 0,6 mm) | ✅ |
| RF20 | Posicionamento aleatório (opção no menu, desligada por padrão): vale para Realista e Arcade, 2 jogadores, bot e treino. A cada round sorteia giro (0–360°), lateral e distância de cada robô, sempre dentro do Art. 10 e a pelo menos 1 cm do degrau. Os ajustes ficam travados; cada lado só confirma **Pronto**, e o limite de 30 s continua valendo | ✅ |
| RF21 | Presets de motor (N20 HP e comum, N30 12 V e 5 V, JGA16-050 6 V, por redução) e de roda (RoboCore StickyMAX S20 e S30, 32 mm) no editor, com valores de folha de dados. O editor reconhece o preset pelos valores (sem texto salvo na spec); mexer num campo vira "Personalizado". A ficha mostra as peças, e o editor avisa quando a largada seca pode empinar mais de 15° | ✅ |
| RF22 | Modo treino: uma caixa passiva (100 × 100 × 50 mm, 500 g, μ 0,4) no lugar do adversário. Vale nos dois modos e com posicionamento aleatório (a caixa também é sorteada). O juiz não cobra movimento da caixa; o HUD e a tela final mostram o tempo do bip até a caixa encostar fora | ✅ |

## 3. Requisitos não funcionais

| ID | Requisito | Como foi atendido |
|---|---|---|
| RNF01 | Simulação independente da taxa de quadros | Passo fixo de 480 Hz; acumulador de tempo |
| RNF02 | Determinismo (base do online) | Rapier `deterministic-compat`; entrada só por `ControlFrame` por tick; teste automatizado confirma |
| RNF03 | Simulação sem DOM | `src/sim/` roda no navegador e no Node (testes) |
| RNF04 | Geometria única | A mesma spec gera colisores e malhas 3D |
| RNF05 | Desempenho | 10 s de luta simulam em ~1,4 s no Node (~7× tempo real; ~85% do custo é o Rapier, com as laterais em fatias convexas). No navegador, estimado em ~2–3 ms de física por quadro a 60 fps. `?gfx=low` desliga sombras/antialias |
| RNF06 | Sorteio reproduzível | Gerador com semente (mulberry32) dentro de `src/sim`. A partida recebe a semente, e a mesma semente gera as mesmas posições em todos os rounds. Para o online, basta transmitir a semente. Teste automatizado confirma |

## 4. Modelo físico

**Por que 3D:** o mecanismo central do sumô é a lâmina entrando por baixo, levantando o rival e tirando peso das rodas dele. Isso só existe com corpo rígido 3D e tração dependente da carga.

- **Escala:** 1 unidade = 1 m. `lengthUnit = 0,01` no Rapier para tolerância de penetração de ~0,1 mm.
- **Chassi e lâmina:** cascos convexos gerados da spec. Lâmina com atrito baixo (aço ~0,2), chassi ~0,4.
- **Rodas (modelo próprio, não colisores):** raycast por roda contra o dohyo/chão. Suspensão rígida (9000 N/m por roda, com pré-carga compensando a deflexão estática). Isso dá a carga **N** em cada roda.
- **Motor DC:** τ = τ_travamento · (u − ω/ω_livre), com u = PWM e limite de corrente de ±τ_travamento. Com u = 0 o motor freia (curto), e o atrito da redução segura o robô parado.
- **Roda com inércia:**
  - A rotação de cada roda é um estado. A inércia soma a da roda e a do rotor refletida pela redução: J = τ_mecânico·T_travamento/ω_livre.
  - A roda demora para acelerar, patina, é arrastada e gira no ar.
  - O torque que acelera rotor e roda volta para o chassi, e é isso que faz o robô empinar.
- **Pneu:** curva de atrito × escorregamento (Pacejka simplificada). Sobe até μ_pico no escorregamento de pico e cai para 85% patinando, combinando o longitudinal e o lateral.
- **Integração:** a força de cada passo é resolvida de forma implícita (bisseção), estável com qualquer inércia e determinística. Detalhes em [ANALISE-RODAS-MOTORES.md](ANALISE-RODAS-MOTORES.md).
- **Rodas como colisores só contra o outro robô:** um rival pode bater na sua roda, mas o contato com o chão é do modelo de pneu.
- **Detecção de "tocar fora":** qualquer colisor tocando o chão de fora, ou uma roda apoiada fora do dohyo.

**Validação (testes automatizados):**
- Velocidade de regime de cada preset dentro de 90–102% da teórica (RPM × raio), com partida suave.
- Roda solta chega a 63% da rotação livre em t = τ; força nunca passa de μ·N; parado não gera força (sem drift).
- Com partida suave nenhum preset capota; o mesmo robô com motor e roda do catálogo empina menos de 15° mesmo com largada seca.
- Todos os presets são limitados por tração, não por motor: a força dos motores passa da tração μ·N.
- Robôs de teste Trator (aresta a 0,2 mm, 20°) contra Bloco (aresta a 0,5 mm): durante o contato, o Bloco fica com menos de 90% do peso nas rodas e o Trator com mais de 100%; o Bloco sai primeiro.
- Robô parado não escorrega (< 1 mm e < 0,1° em 3 s), para cada preset.
- Caixa do treino: parada não se move; abaixo de μ·m·g não escorrega e acima acelera com (F − μ·m·g)/m (erro < 10%).

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
| Art. 17: robô parado por 3 s → Hansoku | ✅ Motor desligado conta como parado mesmo encostado no rival (prevalece sobre o Art. 12). No treino, a caixa é passiva e não leva Hansoku; o jogador parado continua levando |
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

Contra o bot ou no treino: **WASD ou setas** (e Espaço ou Enter para pronto).

Com **posicionamento aleatório** ligado, teclado e mouse não movem o robô no shikiri; só o Pronto funciona.

Gerais: **C** câmera · **F2** debug · **Esc** pausa · qualquer tecla pula o replay.

## 7. Arquitetura

```
src/
  sim/            ← sem DOM; roda no navegador, Node e (futuro) servidor
    arena.ts        dimensões oficiais
    types.ts        RobotSpec, ControlFrame, SimSnapshot
    geometry.ts     spec → cascos convexos + rodas (física e render)
    drive.ts        motor DC + roda com inércia + curva de atrito × escorregamento
    catalog.ts      presets de motor (N20, N30, JGA16-050) e roda (StickyMAX)
    physics.ts      SumoWorld: Rapier, rodas por raycast, detecção de saída
    referee.ts      Juiz: máquina de estados pura
    placement.ts    Art. 10 + sorteio de pose legal
    rng.ts          gerador pseudoaleatório com semente
    match.ts        física + juiz + posicionamento por tick
    inspection.ts   caixa de inspeção + parâmetros do editor
    presets.ts      Kunai, Tora, Fuji
    training.ts     caixa do modo treino
  control/        ← Controller: teclado, bot, caixa do treino (e futuro: rede)
  render/         ← Three.js (só desenha)
  ui/             ← HUD, telas, CSS, persistência
  game.ts         laço: tempo real → ticks fixos, eventos, replay
  app.ts          telas: menu, seleção, editor, pausa, resultado
tests/            vitest (física, roda, juiz, presets, evidência, treino, partidas bot × bot, determinismo)
analysis/         análises longas (npm run analise): lâmina, presets, motores, rodas, encaixe de motor, treino
```

## 7.1 Posicionamento aleatório — como funciona e análise

**Sorteio de cada robô, por round:**
1. Giro uniforme em 0–360°. O robô pode largar de lado ou de costas para o rival.
2. Posição lateral tal que alguma parte do retângulo do robô ainda cruze a faixa da shikiri-sen (|z| ≤ 5 cm).
3. Distância uniforme entre a linha marrom e a borda do dohyo, com todos os cantos a pelo menos 1 cm do degrau.
4. A pose passa por `placementIssue` (a mesma checagem do modo manual). Se for reprovada, sorteia de novo (até 64 vezes). Se nada servir, o que só acontece com um robô impossível de grande, usa a pose padrão com o giro sorteado.

**Ordem e semente:** o vermelho sorteia antes do azul, e a ordem faz parte do determinismo. A semente sai do gerador criptográfico do navegador no início da partida.

**Por que travar os ajustes:** se desse para mover depois do sorteio, cada jogador voltaria para a posição ideal e a opção não mudaria nada. O bot também sorteia, e não move a própria pose.

**Medições:**
- **Regras:** 3 presets × 2 lados × 400 sorteios saíram sempre legais pela regra do jogo. No navegador, uma checagem independente reimplementa o Art. 10.
- **Tamanhos:** 100 × 100, 60 × 60 e 100 × 60 mm também saíram sempre legais.
- **Variedade:** em 600 sorteios do Trator, o giro caiu nos 4 quadrantes, a lateral variou além de ±6 cm e a distância variou mais de 15 cm. Praticamente nenhuma pose se repetiu.
- **Lado de largada (bot difícil × bot difícil, 30 sementes; medido antes do modelo de roda com inércia, com Trator e Kunai):**
  - Trator × Trator: vermelho 16, azul 14;
  - Kunai × Kunai: vermelho 17, azul 13;
  - Trator × Kunai: vermelho 22, azul 8. Aqui a vantagem é do Trator, não do lado.

  Não houve viés de lado além do ruído de 30 partidas.
- **Ritmo:** cerca de metade das largadas é de costas para o rival, e o 1º contato acontece em ~0,4 s, como na largada padrão. O sorteio muda a estratégia, não o ritmo.

## 7.2 Modo treino — caixa no lugar do adversário

**Como funciona:**
- **Onde:** no menu, Oponente → **Treino (caixa)**. Vale no Realista e no Arcade e com o posicionamento aleatório; nesse caso a caixa também é sorteada, dentro do Art. 10.
- **A caixa:** um bloco de 100 × 100 × 50 mm e 500 g, o tamanho e o peso máximos de um Mini Sumô. É de madeira na fórmica, μ = 0,4 (madeira limpa sobre madeira: 0,25–0,5, segundo a [Engineering ToolBox](https://engineeringtoolbox.com/friction-coefficients-d_778.html)). Para arrastar: 0,4 × 0,5 kg × 9,81 ≈ **2,0 N**.
- **Juiz:** a caixa é passiva. Não leva Hansoku por ficar parada, não queima largada e não acumula Yusei (parada no centro, ela ganharia a decisão por domínio). O jogador continua sujeito a todas as regras: parado por 3 s, sair do dohyo e as demais.
- **Medida do treino:** o tempo do bip até a caixa encostar fora, mostrado no HUD a cada ponto. A tela final mostra a lista, o melhor tempo e a média.
- **Segurança:** a caixa é uma constante congelada no código. Um robô salvo com `passive: true` perde o campo ao carregar.

**Medições** (`analysis/training.test.ts`):

| Preset | Empurrão reto, posição padrão | Bot difícil, posição aleatória (20 sementes) |
|---|---|---|
| Kunai (JGA16) | 0,95 s | 20/20 · média 1,43 s (1,12–1,92) |
| Tora (N30) | 1,19 s | 20/20 · média 1,61 s (1,30–1,84) |
| Fuji (N20) | 0,85 s | 20/20 · média 1,28 s (0,99–1,57) |

- **A física da caixa confere:**
  - abaixo de μ·m·g ela não escorrega (só ~1–2 mm de acomodação do contato);
  - acima, acelera com (F − μ·m·g)/m, com erro abaixo de 10%;
  - parada por 3 s, não sai do lugar.
- **O atrito da caixa quase não muda o tempo:** de μ = 0,25 a 0,5 o empurrão reto varia no máximo 0,06 s. A caixa pede bem menos força (2,0 N) do que os presets têm de tração (3,6–3,9 N), então o tempo depende da velocidade e da mira, não de força.
- **A caixa é mais fácil que um robô desligado.** Com motor em freio e pneu μ 1,1, as rodas travadas seguram ~3,5–3,7 N (estimativa), quase a tração de quem empurra. No empurrão reto, em até 10 s:

  | Robô desligado | Resultado |
  |---|---|
  | Tora | nenhum preset tirou |
  | Fuji | só o Tora tirou, em 4,9 s |
  | Kunai | Kunai tirou em 1,1 s e Tora em 1,3 s; o Fuji não tirou |
- **Conclusão:** o treino mede aproximação e mira, não força de empurrar.

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
- Treino com alvo mais pesado ("robô desligado", ~3,5 N para arrastar), para treinar força de empurrar.
- Exportar/importar robôs (JSON).
- Mega Sumô e Sumô LEGO reaproveitando a mesma base (dimensões e limites já isolados).

Análise detalhada de comprimento, largura e ângulo da lâmina: [ANALISE-LAMINA.md](ANALISE-LAMINA.md). Análise dos presets (Kunai, Tora, Fuji): [ANALISE-ROBOS.md](ANALISE-ROBOS.md). Motores, rodas e o modelo de roda: [ANALISE-RODAS-MOTORES.md](ANALISE-RODAS-MOTORES.md).

## 9. Limitações conhecidas
- A constante de tempo do motor (inércia do rotor) é estimada; ela muda muito o quanto o robô empina. Dá para medir filmando a roda solta em câmera lenta.
- O atrito dos pneus StickyMAX vem de um único teste (JSumo, madeira laminada); o escorregamento no pico é estimativa.
- Fora do modelo: queda de tensão da bateria, limite de corrente do driver e folga da redução.
- O bot de treino "vê" a posição real do rival (não usa sensores).
- Não há dano nem quebra de lâmina (Nota 14). Ela não se aplica a uma lâmina indestrutível.
- Detecção de "mesma órbita" (Art. 12) não implementada.
