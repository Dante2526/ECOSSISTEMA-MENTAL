
/**
 * Motor de Auditoria de Condução
 * Analisa padrões de pressão e tempo para detectar infrações de condução.
 */

export interface AuditEvent {
  type: 'REDUCAO_FORTE' | 'CICLICA' | 'ALIVIO_RODAGEM' | 'FRACIONADA';
  timestamp: number;
  description: string;
  severity: 'ALERTA' | 'INFRAÇÃO';
}

export interface AuditResult {
  events: AuditEvent[];
  compliance: {
    [key: string]: boolean;
  };
}

interface TelemetryData {
  [key: string]: number[];
}

export const auditConduction = (data: TelemetryData): AuditResult => {
  const events: AuditEvent[] = [];
  const compliance = {
    reducao_forte: true,
    ciclica: true,
    alivio_rodagem: true,
    fracionada: true,
    arrancada_segura: true,
    emergencia_correta: true,
    abastecimento_correto: true,
    teste_marcha: false
  };

  const eg = data['eg'] || [];
  const vel = data['velocidade'] || [];
  const bc = data['bc'] || [];
  const notch = data['notch'] || [];
  const buzina = data['buzina'] || [];
  const sino = data['sino'] || [];

  let lastPressure = eg[0] || 0;
  let lastReleaseTime = -1;
  let isReleased = true;
  let lowPressureStartTime = -1;

  for (let i = 1; i < eg.length; i++) {
    const currentSpeed = vel[i] || 0;
    const currentP = eg[i];
    const currentNotch = notch[i] || 0;

    // --- Regra: Abastecimento (EG < 90 PSI por > 60s parado) ---
    if (currentSpeed <= 0 && currentP < 90) {
      if (lowPressureStartTime === -1) lowPressureStartTime = i;
      const duration = i - lowPressureStartTime;
      if (duration > 60) {
        if (compliance.abastecimento_correto) {
          compliance.abastecimento_correto = false;
          events.push({
            timestamp: i,
            type: 'ABASTECIMENTO_IRREGULAR',
            severity: 'INFRAÇÃO',
            description: `Abastecimento prolongado: EG abaixo de 90 PSI por mais de 60s com trem parado.`
          });
        }
      }
    } else {
      lowPressureStartTime = -1;
    }

    // --- Regra: Arrancada Segura (Buzina + Sino antes de P3) ---
    if (i > 5 && (vel[i-1] <= 0) && (vel[i] > 0)) {
      // Verifica se houve buzina e sino nos últimos 10 segundos antes de atingir Notch 3
      let safeStart = false;
      for (let j = Math.max(0, i - 10); j <= i; j++) {
        if (buzina[j] === 1 && sino[j] === 1) {
          safeStart = true;
          break;
        }
      }

      if (currentNotch >= 3 && !safeStart) {
        compliance.arrancada_segura = false;
        events.push({
          timestamp: i,
          type: 'ARRANCADA_IRREGULAR',
          severity: 'INFRAÇÃO',
          description: `Arrancada sem Buzina+Sino antes do Ponto 3.`
        });
      }
    }

    // --- Outras regras existentes atualizadas para os novos nomes de canais ---
    const drop = lastPressure - currentP;
    if (drop > 18 && currentP > 40) {
      compliance.reducao_forte = false;
      events.push({
        timestamp: i,
        type: 'REDUCAO_FORTE',
        severity: 'ALERTA',
        description: `Queda brusca de pressão no EG (${drop.toFixed(1)} PSI).`
      });
    }

    if (currentP < (lastPressure - 5) && isReleased) {
      if (lastReleaseTime !== -1 && (i - lastReleaseTime) < 20) {
        events.push({
          type: 'CICLICA',
          timestamp: i,
          description: `Frenagem cíclica detectada.`,
          severity: 'INFRAÇÃO'
        });
        compliance.ciclica = false;
      }
      isReleased = false;
    }

    if (currentP > (lastPressure + 3) && !isReleased) {
      isReleased = true;
      lastReleaseTime = i;
    }

    lastPressure = currentP;
  }

  return { events, compliance };
};

const auditEmergencyCheck = (index: number, data: any) => {
  const windowEnd = Math.min(data.eg.length, index + 30);
  
  const results = {
    amp_zero: data.amps[index] <= 128, 
    indep_ok: data.bc.slice(index, windowEnd).some((p: number) => p >= 60) || 
              data.indep.slice(index, windowEnd).some((p: number) => p >= 60), 
    rev_neutro: data.reverser[index] === 0 || data.reverser[index] === 136 || data.reverser[index] === 128,
    throttle_zero: data.throttle[index] === 0 || data.throttle[index] === 128,
    sino_off: data.sino[index] === 0,
    buzina_off: data.buzina[index] === 0
  };

  const fails = [];
  if (!results.amp_zero) fails.push("Acelerador não cortado (Amperagem)");
  if (!results.indep_ok) fails.push("Falta Freio Independente");
  if (!results.rev_neutro) fails.push("Reversora fora do neutro");
  if (!results.throttle_zero) fails.push("Ponto do acelerador > 0");

  return {
    isPerfect: Object.values(results).every(v => v === true),
    details: results,
    fails
  };
};
