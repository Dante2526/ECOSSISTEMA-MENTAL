import { AnalysisResult } from './localTelemetryAnalyzer';

/**
 * OFFLINE GEOMETRIC SCANNER (Zero AI, Zero OCR)
 * Analisa as curvas operacionais (Wabtec/GE) para Padrões complexos:
 * 1. Frenagem Cíclica (Zigue-zague na linha de pressão)
 * 2. Arrancada Padrão (Sino, Buzina, Tração e Alívio do Independente antes do movimento)
 */
export async function scanGraphPixels(imageFile: File, _referenceImage?: File): Promise<AnalysisResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error("Canvas não suportado"));
      
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      const width = canvas.width;
      const height = canvas.height;
      
      // Arrays para guardar as alturas (Y) de diferentes elementos em cada coluna X
      const redLines: number[][] = Array.from({ length: width }, () => []);
      const blueLines: number[][] = Array.from({ length: width }, () => []);
      const blueBlocks: number[][] = Array.from({ length: width }, () => []); // Para Buzina/Sino (Sinais Digitais)

      // Varredura Vertical e Horizontal
      for (let x = 0; x < width; x++) {
        let currentBlueBlockStart = -1;
        
        for (let y = 0; y < height; y++) {
          const i = (y * width + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          // Linhas Vermelhas (Pressões: EG e Independente)
          if (r > 150 && g < 100 && b < 100) {
            redLines[x].push(y);
          }
          // Linhas Azuis e Blocos (Velocidade, Tração, Buzina, Sino)
          if (b > 150 && r < 100 && g < 100) {
            blueLines[x].push(y);
            
            // Lógica para detectar blocos/barras espessas (Sinais digitais como buzina)
            if (currentBlueBlockStart === -1) currentBlueBlockStart = y;
          } else {
            if (currentBlueBlockStart !== -1) {
              const thickness = y - currentBlueBlockStart;
              if (thickness > 4) { // Se a barra azul for grossa, é um evento digital (Buzina/Sino)
                blueBlocks[x].push(currentBlueBlockStart);
              }
              currentBlueBlockStart = -1;
            }
          }
        }
      }

      // 1. ANÁLISE DE FRENAGEM CÍCLICA (Mantida e aprimorada)
      // Pega a linha vermelha mais alta (menor valor de Y) que costuma ser o EG.
      const mainRedLine = redLines.map(ys => ys.length > 0 ? Math.min(...ys) : null);
      let baselineY = 0;
      let yCounts = new Map<number, number>();
      mainRedLine.forEach(y => { if (y !== null) yCounts.set(y, (yCounts.get(y) || 0) + 1); });
      let maxCount = 0;
      yCounts.forEach((count, y) => { if (count > maxCount) { maxCount = count; baselineY = y; }});

      let applications = 0, partialReleases = 0;
      let isCyclic = false;
      let brakeState = 'released'; 
      let cyclicX = -1;
      let cyclicY = -1;
      
      for (let x = 0; x < width; x++) {
        const y = mainRedLine[x];
        if (y !== null) {
          const dropPixels = y - baselineY;
          if (dropPixels > 5 && brakeState === 'released') { brakeState = 'applied'; applications++; } 
          else if (brakeState === 'applied' && Math.abs(dropPixels) <= 2) { brakeState = 'released'; }
          else if (brakeState === 'applied' && dropPixels < 4 && dropPixels > 2) { brakeState = 'partially_released'; partialReleases++; }
          else if (brakeState === 'partially_released' && dropPixels > 5) { 
            isCyclic = true; 
            brakeState = 'applied'; 
            applications++; 
            if (cyclicX === -1) { // Marca o primeiro ponto onde isso acontece
                cyclicX = x;
                cyclicY = y;
            }
          }
        }
      }

      // 2. ANÁLISE DE ARRANCADA (NOVO!)
      // Acha o ponto onde a velocidade sai do zero.
      const mainBlueLine = blueLines.map(ys => ys.length > 0 ? Math.min(...ys) : null);

      let departureX = -1;
      let departureY = -1;
      
      // Para encontrar a velocidade (azul), primeiro filtramos apenas linhas azuis que parecem contínuas para baixo (O Wabtec coloca barras azuis no topo, e a velocidade mais embaixo)
      // Vai pegar o Y máximo da linha azul para não confundir com barras de sinal no topo da imagem
      const speedBlueLine = blueLines.map(ys => ys.length > 0 ? Math.max(...ys) : null);
      
      let speedBaseline = 0;
      let speedYCounts = new Map<number, number>();
      speedBlueLine.forEach(y => { if (y !== null) speedYCounts.set(y, (speedYCounts.get(y) || 0) + 1); });
      let maxSpeedCount = 0;
      speedYCounts.forEach((count, y) => { if (count > maxSpeedCount) { maxSpeedCount = count; speedBaseline = y; }});

      // Procura o Momento da Arrancada (Velocidade sobe / Y desce significativamente em relação ao baseline - Lembrando que Y cresce pra baixo)
      for (let x = 0; x < width; x++) {
        const y = speedBlueLine[x];
        if (y !== null && (speedBaseline - y) > 3) { // Caiu mais de 3 pixels da base (subiu no gráfico)
          departureX = x;
          departureY = y;
          break;
        }
      }

      let hornOrBellDetected = false;
      let tractionStepped = false;
      let indBrakeReleased = false;

      if (departureX !== -1) {
        // Analisa uma janela ANTES do trem andar (ex: 50 pixels antes até o ponto de partida)
        const windowStart = Math.max(0, departureX - 50);
        
        for (let x = windowStart; x <= departureX; x++) {
          // 2.1 Verifica Buzina/Sino (Presença de blocos azuis horizontais)
          if (blueBlocks[x].length > 0) {
            hornOrBellDetected = true;
          }
          
          // 2.2 Verifica Tração (Linha azul formando "escadinha" / steps discretos)
          const blues = blueLines[x];
          // Se tiver múltiplas linhas azuis finas variando em degraus
          if (blues.length > 1) {
             tractionStepped = true;
          }

          // 2.3 Verifica Alívio do Freio Independente (Linha vermelha caindo rapidamente para quase sumir/baseline de baixo)
          // Em Wabtec, pressão do cilindro (independente) alta desce pra zero.
          const reds = redLines[x];
          if (reds.length > 1) {
             indBrakeReleased = true; // Achou uma segunda linha vermelha cruzando/descendo
          }
        }
      }

      const hasDeparture = departureX !== -1;
      const departureOK = hasDeparture && hornOrBellDetected && tractionStepped;

      // 3. ANÁLISE DE EMERGÊNCIA (Pressão zero e Acelerador)
      // O humano aponta que há situações onde o EG cai a 0 com velocidade 0 e precisamos verificar se o acelerador (tração) foi acionado indevidamente nesse momento.
      let emergencyX = -1;
      let emergencyY = -1;
      let maxDropPixels = 0;

      // Descobre qual foi a maior queda do EG (A linha vermelha foi mais pro fundo = Emergency)
      for (let x = 0; x < width; x++) {
        const y = mainRedLine[x];
        if (y !== null) {
          const drop = y - baselineY;
          if (drop > maxDropPixels) maxDropPixels = drop;
        }
      }

      let isEmergency = false;
      let isSpeedZeroInEmergency = false;
      let isThrottleActiveInEmergency = false;

      // Se a queda máxima foi gigante (muito maior que uma aplicação de serviço, ex: > 25 pixels), assumimos Emergência / 0 PSI.
      if (maxDropPixels > 25) {
        isEmergency = true;
        // Pega o momento exato que chegou no fundo
        for (let x = 0; x < width; x++) {
          const y = mainRedLine[x];
          if (y !== null && (y - baselineY) >= maxDropPixels - 2) {
            emergencyX = x;
            emergencyY = y;
            break;
          }
        }
      }

      if (isEmergency && emergencyX !== -1) {
          // Varredura de janela (±10 pixels) sobre a velocidade e acelerador no momento da emergência
          const windowStart = Math.max(0, emergencyX - 10);
          const windowEnd = Math.min(width - 1, emergencyX + 10);
          
          for(let wx = windowStart; wx <= windowEnd; wx++) {
              const speedY = speedBlueLine[wx];
              // Verifica se a velocidade está no baseline (0 km/h +- tolerância visual)
              if (speedY !== null && Math.abs(speedBaseline - speedY) <= 3) {
                isSpeedZeroInEmergency = true;
              }
              
              // Verifica o Acelerador (gráfico de tração / pontos)
              // A Tração são outras linhas azuis que ficam mais "altas" (menor Y) que o eixo da velocidade.
              const otherBlues = blueLines[wx].filter(by => by < speedBaseline - 20); // Pelo menos 20px acima da linha 0 de vel.
              if (otherBlues.length > 0) {
                 isThrottleActiveInEmergency = true;
              }
          }
      }

      const pointsOfAttention = [];
      
      if (isCyclic) {
        pointsOfAttention.push({
            channel: "FRENAGEM CÍCLICA",
            description: `Zigue-Zague detectado na curva de pressão.`,
            severity: "HIGH" as const,
            timestampOrSection: "GEOMETRIA",
            visualX: (cyclicX / width) * 100,
            visualY: (cyclicY / height) * 100
        });
      }

      if (hasDeparture) {
        pointsOfAttention.push({
            channel: "PROTOCOLO DE ARRANCADA",
            description: departureOK 
              ? "Arrancada válida (Sino/Buzina e Tração Mapeados antes de sair de 0 km/h)."
              : "Falha na Arrancada: Sino, Buzina ou Tração Mínima não mapeados antes do movimento.",
            severity: departureOK ? "LOW" as const : "HIGH" as const,
            timestampOrSection: "GEOMETRIA",
            visualX: (departureX / width) * 100,
            visualY: (departureY / height) * 100
        });
      }

      if (isEmergency) {
        pointsOfAttention.push({
            channel: "EMERGÊNCIA (EG=0)",
            description: `EG no fundo do gráfico! Vel. atual: ${isSpeedZeroInEmergency ? '0 km/h' : '> 0 km/h'}. Acelerador: ${isThrottleActiveInEmergency ? 'APLICADO (ALERTA)' : 'RECOLHIDO'}.`,
            severity: isThrottleActiveInEmergency ? "HIGH" as const : "MEDIUM" as const,
            timestampOrSection: "GEOMETRIA",
            visualX: (emergencyX / width) * 100,
            visualY: (emergencyY / height) * 100
        });
      }

      if (pointsOfAttention.length === 0) {
         pointsOfAttention.push({
            channel: "MOTOR GEOMÉTRICO OFFLINE",
            description: `Leitura multicanal concluída: Sem anomalias críticas (Cíclica, Arrancada, Emergência) detectadas nos vetores.`,
            severity: "LOW" as const,
            timestampOrSection: "GEOMETRIA-LOCAL"
         });
      }

      resolve({
        summary: "AUDITORIA VISUAL DETERMINÍSTICA DE MÚLTIPLOS CANAIS. Mapeamento de Cíclica e Protocolo de Arrancada.",
        checklist: [
          { 
            item: "FRENAGEM CÍCLICA (PRESSÃO EG)", 
            status: isCyclic ? "FALHA" : "OK", 
            details: isCyclic 
              ? `ALERTA: Padrão Cíclico plotado. Redução de pressão detectada antes do alívio total.` 
              : `Curva de pressão operada dentro da linearidade.` 
          },
          { 
            item: "PROTOCOLO DE ARRANCADA", 
            status: !hasDeparture ? "NA" : (departureOK ? "OK" : "ATENÇÃO"), 
            details: !hasDeparture 
              ? "Nenhum movimento de saída saindo do repouso detectado na imagem." 
              : `Partida do trem mapeada. Buzina/Sino: ${hornOrBellDetected ? 'SIM' : 'NÃO'}, Tração em Degraus: ${tractionStepped ? 'SIM' : 'NÃO'}` 
          },
          { 
            item: "ANÁLISE DE EMERGÊNCIA (EG = 0)", 
            status: !isEmergency ? "OK" : (isThrottleActiveInEmergency ? "FALHA" : "ATENÇÃO"), 
            details: isEmergency 
              ? `EG despencou para ~0 PSI. Acelerador detectado ATIVO contra o freio de emergência: ${isThrottleActiveInEmergency ? 'SIM' : 'NÃO'}.` 
              : `Nenhuma queda abissal indicando emergência mapeada visualmente.` 
          }
        ],
        pointsOfAttention
      });
    };
    img.onerror = () => reject(new Error("Não foi possível carregar a imagem para rastreamento de pixels."));
    img.src = URL.createObjectURL(imageFile);
  });
}
