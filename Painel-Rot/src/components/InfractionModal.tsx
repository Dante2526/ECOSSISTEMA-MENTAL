
import React from 'react';
import { AlertCircle, CheckCircle, ChevronRight, X } from 'lucide-react';

interface Rule {
  id: string;
  name: string;
  limit?: number;
  violation_limit?: number;
  unit: string;
}

interface InfractionModalProps {
  isOpen: boolean;
  onClose: () => void;
  infractions: any[];
  totalSamples: number;
}

const InfractionModal = ({ isOpen, onClose, infractions, totalSamples }: InfractionModalProps) => {
  if (!isOpen) return null;

  const hasInfractions = infractions.length > 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="relative w-full max-w-lg bg-slate-900 border border-white/10 rounded-[2.5rem] p-8 shadow-2xl">
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 p-2 hover:bg-white/5 rounded-full transition-all"
        >
          <X size={20} className="text-slate-500" />
        </button>

        <div className="flex flex-col items-center text-center mb-10">
          <div className={`p-4 rounded-3xl mb-6 shadow-xl ${hasInfractions ? 'bg-red-500/20 text-red-500 shadow-red-500/10' : 'bg-emerald-500/20 text-emerald-500 shadow-emerald-500/10'}`}>
            {hasInfractions ? <AlertCircle size={48} /> : <CheckCircle size={48} />}
          </div>
          <h2 className="text-3xl font-black mb-2">
            {hasInfractions ? 'Infrações Detectadas' : 'Operação Limpa'}
          </h2>
          <p className="text-slate-400 text-sm">
            {totalSamples} amostras analisadas conforme as normas ROF/MÓD1.
          </p>
        </div>

        <div className="space-y-4 mb-8 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
          {hasInfractions ? (
            infractions.map((inf, idx) => (
              <div key={idx} className="p-4 bg-red-500/5 border border-red-500/10 rounded-2xl">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-black uppercase text-red-500 tracking-wider">
                    {inf.type.replace('_', ' ')}
                  </span>
                  <span className="text-[10px] text-slate-500">Amostra #{inf.timestamp}</span>
                </div>
                <p className="text-xs text-slate-300 font-medium">{inf.description}</p>
              </div>
            ))
          ) : (
            <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl">
              <p className="text-sm text-emerald-400 font-medium leading-relaxed">
                Parabéns! Nenhuma irregularidade técnica foi encontrada nos canais monitorados para este arquivo.
              </p>
            </div>
          )}
        </div>


        <button 
          onClick={onClose}
          className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
        >
          Ver Gráfico Detalhado
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
};

export default InfractionModal;
