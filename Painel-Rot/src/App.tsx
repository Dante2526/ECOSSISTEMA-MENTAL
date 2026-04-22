
import React, { useState, useEffect, useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine 
} from 'recharts';
import { 
  AlertCircle, Train, Settings, FileText, Activity, ShieldCheck, Gauge, Clock, LayoutDashboard, Database, ChevronRight, CheckCircle2, History
} from 'lucide-react';

import { parseWabtecBinary, TelemetryData } from './utils/parser';
import { auditConduction, AuditResult } from './utils/auditor';
import FileUploader from './components/FileUploader';
import InfractionModal from './components/InfractionModal';
import rulesData from './rules.json';

const BIAS = 54;

const CHANNEL_NAMES: Record<string, string> = {
  eg: "Encanamento Geral (EG)",
  bc: "Cilindro de Freio (BC)",
  velocidade: "Velocidade (km/h)",
  notch: "Acelerador (Notch)",
  buzina: "Buzina (Horn)",
  sino: "Sino (Bell)",
  direcao: "Sentido (Reversora)"
};


const App = () => {
  const [fileData, setFileData] = useState<TelemetryData | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [selectedOffset, setSelectedOffset] = useState('offset_1');
  const [viewMode, setViewMode] = useState<'single' | 'multi'>('multi');
  const [activeTab, setActiveTab] = useState<'telemetry' | 'compliance'>('telemetry');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [auditResults, setAuditResults] = useState<AuditResult | null>(null);
  
  // Novos estados para controle de tempo e auditoria
  const [fileStartTime, setFileStartTime] = useState("00:00:00");
  const [auditWindow, setAuditWindow] = useState({ start: "06:57:00", end: "09:11:00" });

  const CHANNEL_CONFIG: Record<string, { bias: number, mult: number }> = {
    eg: { bias: 0, mult: 1 },         // Já corrigido no parser (-64)
    bc: { bias: 0, mult: 0.3 },      // 240 -> 72 PSI (BC)
    velocidade: { bias: 0, mult: 1 }, 
    notch: { bias: 0, mult: 1 },      
    direcao: { bias: 0, mult: 1 }     
  };


  const handleFileLoaded = (buffer: ArrayBuffer, name: string) => {
    const telemetry = parseWabtecBinary(buffer);
    setFileData(telemetry);
    setFileName(name);
    
    // Executa auditoria inicial
    const results = auditConduction(telemetry);
    setAuditResults(results);
    
    setIsModalOpen(true);
    setSelectedOffset('eg');
  };

  // Função para converter segundos em HH:mm:ss baseado no horário de início
  const formatTime = (seconds: number, startStr: string) => {
    const [h, m, s] = startStr.split(':').map(Number);
    const totalSeconds = (h * 3600 + m * 60 + s + seconds) % 86400;
    const hh = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
    const mm = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
    const ss = (totalSeconds % 60).toString().padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  };

  // Helper para converter HH:mm:ss em segundos desde meia-noite
  const timeToSeconds = (timeStr: string) => {
    const [h, m, s] = timeStr.split(':').map(Number);
    return (h * 3600 + m * 60 + (s || 0));
  };

  // Prepara dados formatados para múltiplos canais, filtrados pela janela de auditoria
  const syncedData = useMemo(() => {
    if (!fileData) return [];
    
    // Tenta usar a maior contagem de amostras disponível entre os canais
    const totalSamples = Math.max(...Object.values(fileData).map(arr => arr.length));
    if (totalSamples === 0) return [];

    const logStart = timeToSeconds(fileStartTime);
    const winStart = timeToSeconds(auditWindow.start);
    const winEnd = timeToSeconds(auditWindow.end);
    
    // Calcula índices relativos ao início do log
    let startIndex = winStart - logStart;
    let endIndex = winEnd - logStart;
    
    // LÓGICA DE SEGURANÇA: Se a janela estiver fora do arquivo, mostra tudo por padrão
    if (startIndex < 0 || startIndex >= totalSamples || endIndex <= startIndex) {
      startIndex = 0;
      endIndex = totalSamples;
    } else {
      // Garante que o endIndex não estoure o arquivo
      endIndex = Math.min(totalSamples, endIndex);
    }

    const result = [];
    for (let i = startIndex; i < endIndex; i++) {
      const entry: any = { 
        index: i,
        timestamp: formatTime(i, fileStartTime)
      };
      
      Object.keys(fileData).forEach(offset => {
        const channelData = fileData[offset];
        const raw = channelData[i] ?? 0;
        const config = CHANNEL_CONFIG[offset] || { bias: 0, mult: 1 };
        let converted = (raw - (config.bias || 0)) * (config.mult || 1);
        
        if (offset === 'eg') converted = Math.min(100, Math.max(0, converted));
        entry[offset] = Math.round(converted);
      });
      
      result.push(entry);
    }
    return result;
  }, [fileData, fileStartTime, auditWindow]);

  // Auditoria filtrada por janela
  useEffect(() => {
    if (!fileData) return;
    
    // Converte auditWindow para índices
    const [hS, mS, sS] = auditWindow.start.split(':').map(Number);
    const [hF, mF, sF] = fileStartTime.split(':').map(Number);
    const startSecs = (hS * 3600 + mS * 60 + sS) - (hF * 3600 + mF * 60 + sF);
    
    const [hE, mE, sE] = auditWindow.end.split(':').map(Number);
    const endSecs = (hE * 3600 + mE * 60 + sE) - (hF * 3600 + mF * 60 + sF);

    // Ajusta para ciclos de 24h se necessário
    const startIndex = Math.max(0, startSecs);
    const endIndex = Math.min(fileData['offset_11']?.length || 0, endSecs);

    const filteredTelemetry: TelemetryData = {};
    Object.keys(fileData).forEach(key => {
      filteredTelemetry[key] = fileData[key].slice(startIndex, endIndex);
    });

    const results = auditConduction(filteredTelemetry);
    setAuditResults(results);
  }, [fileData, auditWindow, fileStartTime]);


  if (!fileData) {
    return (
      <div className="min-h-screen bg-[#020617] text-slate-100 flex items-center justify-center p-8 font-sans overflow-hidden">
        <div className="max-w-xl w-full text-center">
          <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center shadow-2xl mx-auto mb-8 shadow-blue-600/30">
            <Train size={44} className="text-white" />
          </div>
          <h1 className="text-5xl font-black mb-4 tracking-tighter italic text-transparent bg-clip-text bg-gradient-to-r from-white to-blue-400">PAINEL-ROT</h1>
          <p className="text-slate-400 mb-12 text-lg font-medium leading-relaxed">
            Auditoria avançada de telemetria Wabtec. <br/>
            Carregue os dados da locomotiva para iniciar.
          </p>
          <div className="h-[300px]">
            <FileUploader onFileLoaded={handleFileLoaded} />
          </div>
        </div>
      </div>
    );
  }



  const ESSENTIAL_CHANNELS = ['eg', 'bc', 'velocidade', 'notch', 'buzina', 'sino'];
  const COLORS: Record<string, string> = {
    eg: "#38bdf8", // Sky Blue
    bc: "#f87171",  // Red
    velocidade: "#fbbf24",  // Amber
    notch: "#2dd4bf", // Teal
    buzina: "#818cf8",    // Indigo
    sino: "#fb923c"       // Orange
  };

  const getUnit = (offset: string) => {
    if (['eg', 'bc'].includes(offset)) return 'PSI';
    if (offset === 'velocidade') return 'km/h';
    if (offset === 'notch') return 'PTA';
    return '';
  };

  const SyncedChartRow = ({ offset, height = 220, showX = false }: { offset: string, height?: number, showX?: boolean }) => {
    const isBinary = ['buzina', 'sino', 'offset_21'].includes(offset);
    const currentValue = syncedData[syncedData.length - 1]?.[offset] || 0;
    
    // Escalas fixas para pressões
    const domain = (['offset_11', 'offset_3', 'offset_7', 'offset_14'].includes(offset)) ? [0, 100] : 
                   (offset === 'offset_4') ? [0, 120] : ['auto', 'auto'];
    return (
      <div className={`multi-chart-grid ${isBinary ? 'h-[120px]' : 'h-[240px]'}`}>
        <div className="chart-label-container" style={{ borderLeftColor: COLORS[offset] || '#475569' }}>
          <p className="text-[10px] text-slate-500 uppercase font-black mb-1">CANAL</p>
          <h3 className="text-sm font-bold text-white mb-2">{CHANNEL_NAMES[offset] || offset.toUpperCase()}</h3>
          <div className="flex items-baseline gap-2 mt-auto">
            {isBinary ? (
              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${currentValue === 1 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                {currentValue === 1 ? 'LIGADO' : 'DESLIGADO'}
              </span>
            ) : (
              <>
                <span className="text-2xl font-black leading-none" style={{ color: COLORS[offset] }}>
                  {currentValue}
                </span>
                <span className="text-[10px] text-slate-500 font-bold uppercase">{getUnit(offset)}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex-1 bg-slate-900/40 rounded-[1.5rem] p-4 relative overflow-hidden">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={syncedData} syncId="wabtec">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.02)" vertical={false} />
              <XAxis 
                dataKey="timestamp" 
                hide={!showX} 
                stroke="rgba(255,255,255,0.1)" 
                tick={{fill: 'rgba(255,255,255,0.3)', fontSize: 9}}
                minTickGap={60}
              />
              <YAxis 
                stroke="rgba(255,255,255,0.1)" 
                tick={{fill: 'rgba(255,255,255,0.3)', fontSize: 10}} 
                domain={domain as any}
                width={35}
                hide={isBinary}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                itemStyle={{ color: COLORS[offset] || '#fff', fontWeight: 'bold', fontSize: '12px' }}
                labelStyle={{ color: '#64748b', fontSize: '10px', marginBottom: '4px' }}
              />
              <Line 
                type={isBinary ? "stepAfter" : "monotone"} 
                dataKey={offset} 
                stroke={COLORS[offset] || '#475569'} 
                strokeWidth={isBinary ? 2 : 3} 
                dot={false}
                activeDot={{ r: 6, fill: COLORS[offset] || '#fff', stroke: '#020617', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 p-8 font-sans scroll-smooth">
      <InfractionModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        infractions={auditResults?.events || []}
        totalSamples={syncedData.length}
      />

      {/* Header Premium */}
      <header className="flex justify-between items-center mb-10 border-b border-white/5 pb-8">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-500/20 cursor-pointer" onClick={() => setFileData(null)}>
            <Train size={36} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] font-bold uppercase tracking-widest rounded-full border border-blue-500/20">
                Monitoramento em Tempo Real
              </span>
            </div>
            <h1 className="text-4xl font-black tracking-tight text-white uppercase italic">Painel-Rot</h1>
            {fileData && (
              <p className="text-[10px] text-emerald-400 font-mono mt-1">
                MODO DAS III: {Object.values(fileData)[0]?.length || 0} AMOSTRAS DETECTADAS
              </p>
            )}
          </div>
        </div>
        
        {/* Navigation Tabs */}
        <nav className="flex bg-slate-900/50 p-1.5 rounded-2xl border border-white/5 mx-8">
          <button 
            onClick={() => setActiveTab('telemetry')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'telemetry' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:text-white'}`}
          >
            <Activity size={18} /> Telemetria
          </button>
          <button 
            onClick={() => setActiveTab('compliance')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'compliance' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:text-white'}`}
          >
            <ShieldCheck size={18} /> Auditoria de Condução
          </button>
        </nav>

        <div className="flex gap-4">
           {/* Seletores de Tempo */}
           <div className="flex bg-white/5 p-1 rounded-xl border border-white/5 items-center px-3 gap-4">
             <div className="flex items-center gap-2">
               <Clock size={14} className="text-blue-400" />
               <span className="text-[10px] font-bold text-slate-500 uppercase">Início do Log:</span>
               <input 
                 type="text" 
                 value={fileStartTime} 
                 onChange={(e) => setFileStartTime(e.target.value)}
                 className="bg-transparent border-b border-blue-500/30 text-xs font-mono w-20 focus:outline-none focus:border-blue-500"
               />
             </div>
             <div className="w-px h-4 bg-white/10" />
             <div className="flex items-center gap-2">
               <History size={14} className="text-emerald-400" />
               <span className="text-[10px] font-bold text-slate-500 uppercase">Janela:</span>
               <input 
                 type="text" 
                 value={auditWindow.start} 
                 onChange={(e) => setAuditWindow({...auditWindow, start: e.target.value})}
                 className="bg-transparent border-b border-emerald-500/30 text-xs font-mono w-20 focus:outline-none focus:border-emerald-500"
               />
               <span className="text-[10px] text-slate-600">até</span>
               <input 
                 type="text" 
                 value={auditWindow.end} 
                 onChange={(e) => setAuditWindow({...auditWindow, end: e.target.value})}
                 className="bg-transparent border-b border-emerald-500/30 text-xs font-mono w-20 focus:outline-none focus:border-emerald-500"
               />
             </div>
           </div>

           {/* View Mode Switcher */}
          <div className="flex bg-white/5 p-1 rounded-xl border border-white/5 mr-4">
            <button 
              onClick={() => setViewMode('single')}
              className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${viewMode === 'single' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Único
            </button>
            <button 
              onClick={() => setViewMode('multi')}
              className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${viewMode === 'multi' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Multi
            </button>
          </div>

          <button className="bg-white/5 border border-white/10 hover:bg-white/10 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-3 transition-all">
            <FileText size={20} />
            Gerar Parecer
          </button>
        </div>
      </header>

      {activeTab === 'telemetry' ? (
        <div className="animate-in fade-in duration-500">
          {viewMode === 'multi' ? (
            <div className="space-y-6">
              {ESSENTIAL_CHANNELS.map((offset, idx) => (
                <SyncedChartRow 
                  key={offset} 
                  offset={offset} 
                  showX={idx === ESSENTIAL_CHANNELS.length - 1} 
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-12 gap-8">
               <div className="col-span-3 space-y-8">
                <div className="bg-slate-900/40 border border-white/5 rounded-3xl p-6 backdrop-blur-xl">
                  <h2 className="font-bold mb-6 flex items-center gap-2 opacity-80 uppercase tracking-tighter">
                    <LayoutDashboard size={18} /> Sumário de Dados
                  </h2>
                  <div className="space-y-4">
                    <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                      <p className="text-[10px] text-slate-500 uppercase font-black mb-1">Amostras</p>
                      <p className="text-2xl font-black">{syncedData.length}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900/40 border border-white/5 rounded-3xl p-6">
                  <h2 className="font-bold mb-4 flex items-center gap-2 opacity-80 uppercase tracking-tighter">
                    <Database size={18} /> Seletor de Sinal
                  </h2>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {Object.keys(fileData).map(offset => (
                      <button 
                        key={offset}
                        onClick={() => setSelectedOffset(offset)}
                        className={`w-full text-left px-4 py-2.5 rounded-xl text-xs font-bold transition-all border ${selectedOffset === offset ? 'bg-blue-600/20 border-blue-500/50 text-white' : 'bg-white/5 border-transparent text-slate-400 hover:border-white/10 hover:text-white'}`}
                      >
                        {CHANNEL_NAMES[offset] || `Canal ${offset.split('_')[1]}`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="col-span-9">
                 <SyncedChartRow offset={selectedOffset} height={500} showX={true} />
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Aba de Conformidade de Condução */
        <div className="grid grid-cols-12 gap-8 animate-in slide-in-from-bottom duration-500">
           <div className="col-span-4 space-y-8">
              <div className="bg-slate-900/40 border border-white/5 rounded-[2.5rem] p-8">
                <h2 className="text-2xl font-black mb-8 flex items-center gap-3">
                  <ShieldCheck size={28} className="text-emerald-500" />
                  Conformidade Operacional
                </h2>
                
                <div className="space-y-4">
                  {[
                    { id: 'arrancada', name: 'Arrancada Segura', desc: 'Buzina+Sino obrigatórios antes do Ponto 3.', ok: auditResults?.compliance.arrancada_segura },
                    { id: 'abastecimento', name: 'Abastecimento', desc: 'EG abaixo de 90 PSI por > 60s parado.', ok: auditResults?.compliance.abastecimento_correto },
                    { id: 'reducao_forte', name: 'Redução Strong (<18 PSI)', desc: 'Evita choques bruscos na composição.', ok: auditResults?.compliance.reducao_forte },
                    { id: 'emergencia', name: 'Procedimento Emergência', desc: 'Siga o protocolo de 6 pontos de segurança.', ok: auditResults?.compliance.emergencia_correta }
                  ].map(item => (
                    <div key={item.id} className={`p-5 rounded-3xl border transition-all ${item.ok ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20 shadow-lg shadow-red-500/5'}`}>
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-3">
                           <h3 className={`font-bold ${item.ok ? 'text-emerald-500' : 'text-red-500'}`}>{item.name}</h3>
                        </div>
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${item.ok ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'}`}>
                           {item.ok ? 'Conforme' : 'Violação'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 font-medium mb-3">{item.desc}</p>
                      
                      {/* Detalhamento do Checklist de Emergência se houver erro */}
                      {item.id === 'emergencia' && !item.ok && (
                        <div className="grid grid-cols-2 gap-2 mt-2 pt-3 border-t border-red-500/10">
                          {[
                            { label: 'EG 0 PSI', pass: auditResults?.events.find(e => (e as any).checklist)?.checklist?.eg_zero },
                            { label: 'Amp 0', pass: auditResults?.events.find(e => (e as any).checklist)?.checklist?.amp_zero },
                            { label: 'Indep. 72', pass: auditResults?.events.find(e => (e as any).checklist)?.checklist?.indep_ok },
                            { label: 'Rev. Neutro', pass: auditResults?.events.find(e => (e as any).checklist)?.checklist?.rev_neutro },
                            { label: 'Sino Off', pass: auditResults?.events.find(e => (e as any).checklist)?.checklist?.sino_off },
                            { label: 'Notch 0', pass: auditResults?.events.find(e => (e as any).checklist)?.checklist?.notch_zero },
                          ].map((check, i) => (
                            <div key={i} className="flex items-center gap-1.5">
                              <div className={`w-1.5 h-1.5 rounded-full ${check.pass ? 'bg-emerald-500' : 'bg-red-500'}`} />
                              <span className={`text-[9px] ${check.pass ? 'text-emerald-500/70' : 'text-red-500 font-bold'}`}>{check.label}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
           </div>

           {/* Timeline de Eventos */}
           <div className="col-span-8 bg-slate-900/40 border border-white/5 rounded-[2.5rem] p-10 backdrop-blur-xl">
             <div className="flex justify-between items-center mb-10">
                <h2 className="text-2xl font-black flex items-center gap-3 italic">
                  <History size={26} className="text-blue-500" />
                  Timeline de Eventos Detectados
                </h2>
                <span className="text-xs text-slate-500 font-mono">Total: {auditResults?.events.length || 0} eventos encontrados</span>
             </div>

             <div className="space-y-4 max-h-[600px] overflow-y-auto px-4 custom-scrollbar">
                {auditResults?.events.length ? auditResults.events.map((event, idx) => (
                  <div key={idx} className="group relative flex gap-6 p-6 bg-white/5 hover:bg-white/10 border border-white/5 rounded-[1.8rem] transition-all cursor-crosshair">
                     <div className="flex flex-col items-center">
                        <div className={`w-3 h-3 rounded-full mt-2 ${event.severity === 'INFRAÇÃO' ? 'bg-red-500' : 'bg-blue-500'}`} />
                        <div className="w-px h-full bg-white/10 mt-2" />
                     </div>
                     <div className="flex-1">
                        <div className="flex justify-between items-center mb-2">
                           <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Amostra {event.timestamp}s</span>
                           <span className={`text-[9px] font-black px-2 py-0.5 rounded shadow-sm ${event.severity === 'INFRAÇÃO' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'}`}>
                              {event.type.replace('_', ' ')}
                           </span>
                        </div>
                        <p className="text-sm font-bold text-slate-200 group-hover:text-white transition-colors">{event.description}</p>
                     </div>
                     <ChevronRight size={20} className="text-slate-800 group-hover:text-blue-500 transition-all self-center" />
                  </div>
                )) : (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-600">
                     <ShieldCheck size={64} className="opacity-10 mb-4" />
                     <p className="text-lg font-black uppercase tracking-tighter italic">Nenhuma anomalia crítica na condução</p>
                  </div>
                )}
             </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;
