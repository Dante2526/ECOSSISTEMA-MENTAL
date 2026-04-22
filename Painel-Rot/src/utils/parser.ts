
/**
 * Parser para os binários proprietários da Wabtec (DAS III / Evolution)
 * Baseado em busca de tags e frames por segundo (0xEB).
 */

export interface TelemetryData {
  [key: string]: number[];
}

export const parseWabtecBinary = (buffer: ArrayBuffer): TelemetryData => {
  const data = new Uint8Array(buffer);
  
  // Detecção de Arquivo Misto (ASCII/IFCDATA)
  const header = new TextDecoder().decode(data.slice(0, 7));
  if (header === 'IFCDATA') {
    return parseIFCDATAText(new TextDecoder().decode(data));
  }

  const channels: TelemetryData = {};
  
  // Inicialização de canais conforme especificação DAS III
  const keys = ['eg', 'bc', 'notch', 'buzina', 'sino', 'direcao', 'velocidade', 'reversora'];
  keys.forEach(k => channels[k] = []);

  const TAGS = {
    EG: [0x26, 0x82, 0x80],
    BC: [0x84, 0xA8, 0x8A], // Corrigido de E8 para A8 conforme feedback
    NOTCH: [0x82],         // Corrigido de C2 para 82 (C2 - 64)
    HORN: [0x81, 0x82],    // Corrigido de C1 C2 para 81 82
    BELL: [0x81, 0x84],    // Corrigido de C1 C4 para 81 84
    HORN_BELL: [0x81, 0x86], // Corrigido de C1 C6 para 81 86 (БЖ)
    FWD: [0x8C, 0x84, 0x80, 0x80, 0x80], // Corrigido com offset -64 (CC C4 C0...)
    REV: [0x8C, 0x84, 0x80, 0x80, 0x90], // Corrigido com offset -64 (CC C4 C0...D0)
    TIME_SYNC: 0xEB
  };

  let currentSecond = 0;
  let lastValues: { [key: string]: number } = {
    eg: 90, bc: 0, notch: 0, buzina: 0, sino: 0, direcao: 1, velocidade: 0
  };

  const fillSecond = () => {
    channels['eg'].push(lastValues.eg);
    channels['bc'].push(lastValues.bc);
    channels['notch'].push(lastValues.notch);
    channels['buzina'].push(lastValues.buzina);
    channels['sino'].push(lastValues.sino);
    channels['direcao'].push(lastValues.direcao);
    channels['velocidade'].push(lastValues.velocidade);
  };

  for (let i = 0; i < data.length; i++) {
    // Sincronia de Tempo (0xEB ou Início de Tag EG)
    const isEG = data[i] === TAGS.EG[0] && data[i+1] === TAGS.EG[1] && data[i+2] === TAGS.EG[2];
    
    if (data[i] === TAGS.TIME_SYNC || isEG) {
      // Evita duplicar o primeiro segundo se começar com EG
      if (i > 0 || data[i] === TAGS.TIME_SYNC) {
        fillSecond();
        currentSecond++;
        // Reset de flags momentâneas
        lastValues.buzina = 0;
        lastValues.sino = 0;
      }
      
      if (data[i] === TAGS.TIME_SYNC) continue;
      // Se for EG, continua o processamento abaixo para ler o valor
    }

    // Busca por Tags
    // EG (&BA)
    if (data[i] === TAGS.EG[0] && data[i+1] === TAGS.EG[1] && data[i+2] === TAGS.EG[2]) {
      lastValues.eg = data[i+3] - 64; // Fórmula: Byte - 64
      i += 3;
    }
    // BC (ДиК)
    else if (data[i] === TAGS.BC[0] && data[i+1] === TAGS.BC[1] && data[i+2] === TAGS.BC[2]) {
      lastValues.bc = data[i+3]; // Assumindo valor bruto por enquanto
      i += 3;
    }
    // HORN+BELL (БЖ)
    else if (data[i] === TAGS.HORN_BELL[0] && data[i+1] === TAGS.HORN_BELL[1]) {
      lastValues.buzina = 1;
      lastValues.sino = 1;
      i += 1;
    }
    // HORN (БВ)
    else if (data[i] === TAGS.HORN[0] && data[i+1] === TAGS.HORN[1]) {
      lastValues.buzina = 1;
      i += 1;
    }
    // BELL (БД)
    else if (data[i] === TAGS.BELL[0] && data[i+1] === TAGS.BELL[1]) {
      lastValues.sino = 1;
      i += 1;
    }
    // NOTCH (В)
    else if (data[i] === TAGS.NOTCH[0]) {
      const nextByte = data[i+1];
      // Mapeamento simplificado de Notch (0xB0 = P0, 0xB3 = P3, etc)
      if (nextByte >= 0xB0 && nextByte <= 0xB8) {
        lastValues.notch = nextByte - 0xB0;
      }
      i += 1;
    }
    // SENTIDO (FWD/REV)
    else if (data[i] === TAGS.FWD[0] && data[i+1] === TAGS.FWD[1] && data[i+2] === TAGS.FWD[2]) {
      if (data[i+4] === 0xC0) lastValues.direcao = 1; // FWD
      else if (data[i+4] === 0xD0) lastValues.direcao = -1; // REV
      i += 4;
    }
  }

  // Se o arquivo não tiver 0xEB, fazemos um fill final para garantir que temos dados
  if (channels['eg'].length === 0) {
    fillSecond();
  }

  console.log(`[Parser DAS III] Scan Finalizado: ${channels['eg'].length} segundos processados.`);
  return channels;
};

/**
 * Parser para logs DAS III em formato texto (ASCII/IFCDATA)
 */
const parseIFCDATAText = (text: string): TelemetryData => {
  const channels: TelemetryData = {
    eg: [], bc: [], notch: [], buzina: [], sino: [], direcao: [], velocidade: []
  };

  const lines = text.split('\n');
  lines.forEach(line => {
    if (line.includes('BP:') || line.includes('BC:')) {
      // Exemplo de linha: BP: 90 BC: 0 V: 0 N: 0
      const bpMatch = line.match(/BP:\s*(\d+)/);
      const bcMatch = line.match(/BC:\s*(\d+)/);
      const vMatch = line.match(/V:\s*(\d+)/);
      const nMatch = line.match(/N:\s*(\d+)/);

      channels.eg.push(bpMatch ? parseInt(bpMatch[1]) : 90);
      channels.bc.push(bcMatch ? parseInt(bcMatch[1]) : 0);
      channels.velocidade.push(vMatch ? parseInt(vMatch[1]) : 0);
      channels.notch.push(nMatch ? parseInt(nMatch[1]) : 0);
      channels.buzina.push(0);
      channels.sino.push(0);
      channels.direcao.push(1);
    }
  });

  console.log(`[Parser IFCDATA] Texto processado: ${channels.eg.length} amostras.`);
  return channels;
};
