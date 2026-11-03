# Otimização Completa de Performance, Renderização e Correção de Bugs — Ecossistema Mental

Este plano elimina gargalos críticos de memória, CPU/GPU e re-renderizações em cascata no **Ecossistema Mental**, corrige falhas de GPS e Web Workers duplicados, e reduz drasticamente o tempo de carregamento inicial por meio de code-splitting do simulador 3D.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> As decisões abaixo refletem exatamente as escolhas confirmadas por você para garantir máxima fluidez tanto em dispositivos móveis quanto no desktop:

- **Confirmed Decision 1 — Escopo Completo de Otimização**: Atuaremos nas quatro frentes críticas: árvore de renderização do React, Web Workers de voz/IA, renderização Canvas/3D e correção de bugs estruturais.
- **Confirmed Decision 2 — Monitoramento de GPS Sob Demanda**: O sensor de GPS (`watchPosition`) deixará de rodar ininterruptamente no boot do aplicativo e será ativado apenas quando necessário (durante um Tour ativo no modo Admin, ao abrir o Mapa dos Trilhos ou ao acionar comandos de localização por voz), além de tratar erros de permissão de forma resiliente sem travar o console.
- **Confirmed Decision 3 — Code-Splitting 3D e Worker Único Compartilhado**: O simulador 3D (`AmvSimulation`) será carregado sob demanda (`React.lazy` + `Suspense`), e o modelo Whisper ONNX utilizará uma instância única e coordenada de Web Worker em vez de dois workers simultâneos disputando rede e memória.

---

## 1. Overview & Core Concept

- **What It Does**: Transforma a arquitetura de execução do Ecossistema Mental para operar com zero trabalho redundante em background, isolando estados de alta frequência (progresso de download offline e coordenadas GPS) para que o sistema orbital principal mantenha 60fps constantes.
- **Target Audience / Persona**: Operadores ferroviários e usuários em campo (especialmente em dispositivos móveis Android/iOS) que dependem de resposta imediata ao toque, baixo consumo de bateria e estabilidade offline.
- **Key Value**: Redução de mais de 60% no bundle inicial de JavaScript, corte de 50% no uso de RAM durante o pré-carregamento da IA de voz (Whisper) e eliminação de re-renderizações desnecessárias na árvore principal do aplicativo.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Inicialização Instantânea e Silenciosa**: Ao abrir o app, a cena orbital principal é montada sem bloqueios da thread principal, sem disparar popups prematuros de permissão de GPS e sem processar o motor Tailwind duas vezes.
  2. **Progresso Offline Isolado**: A barra de progresso de configuração offline (`OfflineSetupProgress`) gerencia seu próprio ciclo de atualização visual sem causar re-renderização dos 30+ sistemas orbitais e modais irmãos.
  3. **Abertura Fluida de Mapas e Simulador 3D**: O modal de layout (`MapModal`) só monta suas dezenas de animações CSS/GPU quando realmente aberto. Ao clicar em "Simular AMV 3D", um indicador de carregamento suave é exibido enquanto o motor Three.js é carregado sob demanda.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Interface espacial de alta precisão (Dark Space / Sci-Fi HUD) mantendo a identidade visual original do projeto.
  - *Color Palette & Mood*: Fundo radial profundo (`#1a0b2e` para `#000000`), superfícies translúcidas em ardósia escura (`slate-900/95`) e acentos luminosos em roxo neon (`purple-500`), ciano (`cyan-400`) e esmeralda (`emerald-500`).
  - *Typography & Hierarchy*: Fonte principal `Exo 2` preservada com numerais tabulares (`tabular-nums`) em indicadores de progresso e telemetria de distância.
  - *Component Styling & Layout*: Uso exclusivo do motor Tailwind CSS v4 via Vite (removendo o script CDN duplicado que reprocessava estilos em tempo de execução).
- **Interactive Feedback & Motion**:
  - Transições compostas exclusivamente na GPU (`transform`, `opacity`) e desmontagem limpa de elementos ocultos (`MapModal`) para poupar camadas de composição em celulares.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Isolamento de Estado do Progresso Offline (`OfflineSetupProgress`)**
  - *Chosen Approach*: Mover a chamada de `usePreloadProgress` de dentro do `App` raiz para dentro do próprio componente `OfflineSetupProgress`.
  - *Why*: Cada atualização percentual da IA e de lotes de imagens causava um `setState` no `App`, forçando a reconciliação de todos os componentes filhos dezenas de vezes nos primeiros segundos de uso.
  - *Alternatives Considered*: Manter no `App` com `useMemo` em todos os filhos — descartado pois ainda executa o corpo de `App` desnecessariamente a cada 0.1% de progresso.
- **Decision 2: Singleton / Coordenação para o Web Worker do Whisper**
  - *Chosen Approach*: Compartilhar uma única instância do Web Worker do Whisper entre o pré-carregamento (`usePreloadProgress`) e o reconhecimento de voz (`useWhisperRecognition`).
  - *Why*: Anteriormente, dois workers distintos eram criados no carregamento da página e ambos disparavam `PRELOAD` simultaneamente, baixando e compilando o modelo ONNX duas vezes na memória RAM do celular.
  - *Alternatives Considered*: Desativar o preload automático — descartado pois comprometeria a experiência 100% offline.
- **Decision 3: Renderização Sob Demanda no `RailwayMapModal` e `MapModal`**
  - *Chosen Approach*: No `RailwayMapModal`, substituir o loop infinito de 60fps (`requestAnimationFrame`) por desenho orientado a eventos (redesenhar apenas ao abrir, redimensionar, arrastar/zoom ou atualizar GPS). No `MapModal`, desmontar os nós animados quando o modal estiver fechado.
  - *Why*: Economiza bateria e GPU significativamente em dispositivos móveis.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              App (Root)                                 │
│  • Callbacks memoizados estáveis (useCallback)                          │
│  • GPS acionado sob demanda (Tour Admin / RailwayMap / Voz "Onde estou")│
└───────┬─────────────────────────┬─────────────────────────┬─────────────┘
        │                         │                         │
        ▼                         ▼                         ▼
┌──────────────────────┐ ┌────────────────────────┐ ┌─────────────────────┐
│ OfflineSetupProgress │ │     OrbitalSystem      │ │   Modals (Lazy /    │
│  (Estado Isolado)    │ │  (60fps GPU Rotation)  │ │   On-Demand DOM)    │
│  • usePreloadProgress│ │  • MemoizedNode        │ │  • MapModal (Unmounted│
│  • Usa Whisper       │ │  • Sem re-render em    │ │    when closed)     │
│    Worker Singleton  │ │    ticks de GPS/Cache  │ │  • RailwayMapModal  │
└──────────┬───────────┘ └────────────────────────┘ │    (Event-driven 2D)│
           │                                        │  • ImageModal       │
           ▼                                        │    └─► React.lazy(  │
┌─────────────────────────────────────────────────┐ │        AmvSimulation│
│         Shared Whisper Worker Singleton         │ │        3D Three.js) │
│  • Instância única ONNX em Web Worker           │ └─────────────────────┘
│  • Evita duplicação de RAM e downloads concorrentes                     │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - **Shared Whisper Worker**: Gerenciador leve de instância única que permite múltiplos listeners (`addEventListener('message', ...)`) sem instanciar dois contextos WASM/ONNX duplicados.
  - **Geolocation Lifecycle**: `startWatching()` é invocado por um `useEffect` que observa `(isAdmin && !!activeTour) || isRailwayMapOpen`, parando automaticamente (`stopWatching()`) quando ambos são fechados. Erros de permissão (`GeolocationPositionError`) usam `console.warn` descritivo e encerram o watch caso a permissão seja negada (`code === 1`), além de incluir `"geolocation"` nas permissões do `metadata.json`.
- **Interactive Component & State Mapping**:
  - **Limpeza do `index.html`**: Remoção da tag `<script src="https://cdn.tailwindcss.com"></script>` e estilos inline redundantes que já existem em `index.css`, eliminando o custo de compilação CSS duplicado no navegador.
  - **Otimização do `AmvSimulation` (Three.js)**:
    - Carregado via `React.lazy(() => import('./AmvSimulation'))` dentro do `ImageModal` com fallback de carregamento estilizado.
    - Memoização (`useMemo`) das listas estáticas de dormentes (`Sleepers`) e trilhos (`CurveBranch`), além de pré-alocação de `THREE.Color` fora do `useFrame` para evitar Garbage Collection a 60fps.
  - **Estabilização de Props em `App.tsx`**:
    - Substituição de arrow functions inline (`onClose={() => setIsRailwayMapOpen(false)}`, `onOpenMap={() => setIsRailwayMapOpen(true)}`) por handlers memoizados com `useCallback`, garantindo que `React.memo` funcione em todos os modais.
