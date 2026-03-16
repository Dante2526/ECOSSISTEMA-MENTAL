
import React, { useState, useEffect, useCallback } from 'react';
import { OrbitalSystem, Satellite, Tour, LocationData } from '../types';
import { TourAdmin } from './TourAdmin';
import { useGeolocation } from '../hooks/useGeolocation';

interface AdminPanelProps {
    systemToEdit: OrbitalSystem | '__NEW__';
// ... rest of props same
    systems: OrbitalSystem[];
    tours: Tour[];
    setTours: React.Dispatch<React.SetStateAction<Tour[]>>;
    onSave: (system: OrbitalSystem) => void;
    onDelete: (systemId: string) => void;
    onClose: () => void;
}

const NEW_SYSTEM_TEMPLATE: Omit<OrbitalSystem, 'id'> = {
    name: "",
    iconUrl: "",
    modalUrls: [],
    satellites: [],
};

export const AdminPanel: React.FC<AdminPanelProps> = React.memo(({ systemToEdit, systems, tours, setTours, onSave, onDelete, onClose }) => {
    const [formState, setFormState] = useState<OrbitalSystem | null>(null);
    const [activeTab, setActiveTab] = useState<'systems' | 'tours'>('systems');
    const { isLocating, getStablePosition } = useGeolocation();

    useEffect(() => {
        if (systemToEdit) {
            setActiveTab('systems'); // Garante que a aba de sistemas esteja ativa ao editar/adicionar
            if (systemToEdit === '__NEW__') {
                setFormState({ id: `sys_${Date.now()}`, ...NEW_SYSTEM_TEMPLATE });
            } else {
                setFormState(JSON.parse(JSON.stringify(systemToEdit)));
            }
        } else {
            setFormState(null);
        }
    }, [systemToEdit]);

    const handleInputChange = (field: keyof OrbitalSystem, value: any) => {
        if (!formState) return;
        setFormState({ ...formState, [field]: value });
    };

    const handleSatelliteChange = (index: number, field: keyof Satellite, value: string | undefined) => {
        if (!formState) return;
        const newSatellites = [...formState.satellites];
        newSatellites[index] = { ...newSatellites[index], [field]: value };
        setFormState({ ...formState, satellites: newSatellites });
    };

    const handleAddSatellite = () => {
        if (!formState) return;
        const newSatellites = [...formState.satellites, { name: 'Novo Satélite' }];
        setFormState({ ...formState, satellites: newSatellites });
    };

    const handleRemoveSatellite = (index: number) => {
        if (!formState) return;
        const newSatellites = formState.satellites.filter((_, i) => i !== index);
        setFormState({ ...formState, satellites: newSatellites });
    };

    const handleSave = () => {
        if (!formState || !formState.name) {
            alert("O nome do sistema não pode estar vazio.");
            return;
        }
        onSave(formState);
    };

    const handleDelete = () => {
        if (!formState || systemToEdit === '__NEW__') return;
        onDelete(formState.id);
    };

    const isEditingOrAddingSystem = activeTab === 'systems' && !!formState;

    const inputClasses = "w-full bg-slate-800/50 border-b-2 border-slate-600 rounded-t px-3 py-2 text-white placeholder-slate-400 transition-colors focus:outline-none focus:border-purple-500 focus:bg-slate-800";
    const labelClasses = "block text-sm font-bold text-purple-300 mb-2 tracking-wider uppercase";

    const TabButton: React.FC<{ tabId: 'systems' | 'tours'; children: React.ReactNode }> = ({ tabId, children }) => (
        <button
            onClick={() => setActiveTab(tabId)}
            className={`px-4 py-2 text-sm font-bold tracking-wider uppercase transition-colors rounded-t-md ${activeTab === tabId
                ? 'bg-slate-900 text-white'
                : 'bg-transparent text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
        >
            {children}
        </button>
    );

    return (
        <div className="fixed inset-0 bg-black/70 z-40 flex items-center justify-center p-2 md:p-4" onClick={onClose}>
            <div
                className="w-full max-w-2xl flex flex-col bg-slate-900/95 border border-purple-500/30 rounded-lg shadow-2xl text-white overflow-hidden max-h-[85dvh] md:max-h-[90vh]"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-3 md:p-4 border-b border-purple-500/20 flex justify-between items-center flex-shrink-0">
                    <h3 className="text-base md:text-lg font-bold tracking-widest truncate pr-2">
                        {isEditingOrAddingSystem ? (systemToEdit === '__NEW__' ? 'ADICIONAR NOVO SISTEMA' : 'EDITAR SISTEMA') : 'PAINEL DE ADMINISTRAÇÃO'}
                    </h3>
                    <button onClick={onClose} className="text-2xl text-slate-400 hover:text-white transition-colors p-1">&times;</button>
                </div>

                <div className="px-4 pt-2 border-b border-purple-500/20 flex items-end gap-2 bg-slate-900/50 justify-between">
                    <div className="flex gap-2">
                        <TabButton tabId="systems">Sistemas</TabButton>
                        <TabButton tabId="tours">Tours</TabButton>
                    </div>
                    <button
                        onClick={() => {
                            const dataStr = JSON.stringify(systems, null, 2);
                            navigator.clipboard.writeText(dataStr).then(() => {
                                alert("Dados copiados para a área de transferência! Cole no chat para a IA atualizar o código-fonte.");
                            }).catch(err => {
                                alert("Erro ao copiar dados. Verifique as permissões do navegador.");
                                console.error(err);
                            });
                        }}
                        className="mb-2 px-3 py-1 text-xs font-bold bg-emerald-600/50 border border-emerald-500 text-emerald-100 rounded hover:bg-emerald-600 hover:text-white transition-colors flex items-center gap-1"
                        title="Exportar dados para salvar no código-fonte"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Exportar Dados
                    </button>
                </div>

                <div className="flex-grow overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-6 bg-slate-900 overscroll-contain">
                    {activeTab === 'tours' ? (
                        <TourAdmin systems={systems} tours={tours} setTours={setTours} />
                    ) : (
                        <>
                            {formState ? (
                                <>
                                    <div className="space-y-4">
                                        <div>
                                            <label htmlFor="sys-name" className={labelClasses}>Nome do Sistema</label>
                                            <input id="sys-name" type="text" value={formState.name} onChange={e => handleInputChange('name', e.target.value)} className={inputClasses} placeholder="Ex: Linhas do Freio" />
                                        </div>
                                        <div>
                                            <label htmlFor="sys-icon" className={labelClasses}>URL do Ícone</label>
                                            <input id="sys-icon" type="text" value={formState.iconUrl} onChange={e => handleInputChange('iconUrl', e.target.value)} className={inputClasses} />
                                        </div>
                                        <div>
                                            <label htmlFor="sys-modals" className={labelClasses}>URLs do Modal (um por linha)</label>
                                            <textarea id="sys-modals" rows={3} value={formState.modalUrls.join('\n')} onChange={e => handleInputChange('modalUrls', e.target.value.split('\n').filter(url => url.trim() !== ''))} className={inputClasses}></textarea>
                                        </div>

                                        <div className="border-t border-purple-500/20 pt-4 mt-2">
                                            <label className={labelClasses}>Localização GPS (Mapeamento)</label>
    const { isLocating, getStablePosition } = useGeolocation();

// ... dentro do return, seção de GPS ...
                                            <div className="flex items-center gap-4 bg-slate-800/30 p-4 rounded-lg border border-slate-700/50">
                                                <div className="flex-grow">
                                                    {formState.locationData ? (
                                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                                            <div className="text-slate-400">Lat: <span className="text-white font-mono">{formState.locationData.latitude.toFixed(6)}</span></div>
                                                            <div className="text-slate-400">Lon: <span className="text-white font-mono">{formState.locationData.longitude.toFixed(6)}</span></div>
                                                            <div className="text-slate-400">Precisão: <span className={`font-mono ${(formState.locationData.accuracy || 0) <= 10 ? 'text-emerald-400' : 'text-amber-400'}`}>±{formState.locationData.accuracy?.toFixed(1)}m</span></div>
                                                            {formState.locationData.altitude && (
                                                                <div className="text-slate-400">Alt: <span className="text-white font-mono">{formState.locationData.altitude.toFixed(2)}m</span></div>
                                                            )}
                                                            <div className="text-purple-400 text-[10px] mt-1 col-span-2">Mapeado em: {new Date(formState.locationData.timestamp).toLocaleString()}</div>
                                                        </div>
                                                    ) : (
                                                        <div className="text-sm text-slate-500 italic">Ponto não mapeado</div>
                                                    )}
                                                </div>
                                                <button 
                                                    onClick={async (e) => {
                                                        e.preventDefault();
                                                        try {
                                                            const loc = await getStablePosition(5); // 5 amostras para mapeamento definitivo
                                                            if (loc.accuracy && loc.accuracy > 15) {
                                                                if (!window.confirm(`Atenção: A precisão do GPS está baixa (${Math.round(loc.accuracy)}m). Deseja mapear assim mesmo? Em campo, tente céu aberto.`)) {
                                                                    return;
                                                                }
                                                            }
                                                            handleInputChange('locationData', loc);
                                                        } catch (err) {
                                                            alert(err);
                                                        }
                                                    }}
                                                    disabled={isLocating}
                                                    className={`px-4 py-2 rounded-md font-bold transition-all duration-300 text-xs border-2 flex items-center gap-2 ${
                                                        isLocating 
                                                        ? 'bg-slate-700 border-slate-600 animate-pulse' 
                                                        : 'bg-indigo-600/50 border-indigo-500 hover:bg-indigo-600'
                                                    }`}
                                                >
                                                    {isLocating ? (
                                                        <>
                                                            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                            </svg>
                                                            Buscando...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                            </svg>
                                                            Mapear Local Atual
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="border-t border-purple-500/20 pt-6">
                                        <h4 className={`${labelClasses} mb-4`}>Satélites</h4>
                                        <div className="space-y-3 max-h-[25vh] overflow-y-auto pr-2 -mr-2">
                                            {formState.satellites.map((sat, index) => (
                                                <div key={index} className="flex items-end gap-3 p-3 bg-slate-800/50 rounded-md border border-slate-700">
                                                    <div className="flex-grow">
                                                        <label className="text-xs text-slate-400 mb-1 block">Nome</label>
                                                        <input type="text" value={sat.name} onChange={e => handleSatelliteChange(index, 'name', e.target.value)} className={inputClasses} />
                                                    </div>
                                                    <div className="w-1/3">
                                                        <label className="text-xs text-slate-400 mb-1 block">Estilo</label>
                                                        <select value={sat.style || 'default'} onChange={e => handleSatelliteChange(index, 'style', e.target.value === 'default' ? undefined : e.target.value)} className={inputClasses}>
                                                            <option value="default">Padrão</option>
                                                            <option value="neon-red">Neon Vermelho</option>
                                                            <option value="neon-yellow">Neon Amarelo</option>
                                                            <option value="neon-green">Neon Verde</option>
                                                        </select>
                                                    </div>
                                                    <button onClick={() => handleRemoveSatellite(index)} className="w-10 h-10 flex-shrink-0 rounded-md bg-red-600/50 border border-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-all duration-300 hover:shadow-[0_0_10px_rgba(239,68,68,0.5)]">
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                        <button onClick={handleAddSatellite} className="px-4 py-2 rounded-md font-bold transition-all duration-300 text-sm border-2 bg-blue-600/50 border-blue-500 hover:bg-blue-600 hover:text-white hover:shadow-[0_0_15px_rgba(59,130,246,0.5)] mt-4">
                                            Adicionar Satélite
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className='text-center text-slate-400 py-10'>
                                    <p>Nenhum sistema selecionado para edição.</p>
                                    <p className='mt-2 text-sm'>Clique em um sistema na visualização principal para editá-lo, ou use o botão (+) para adicionar um novo.</p>
                                </div>
                            )}
                        </>
                    )}
                </div>
                {isEditingOrAddingSystem && (
                    <div className="p-3 md:p-4 border-t border-purple-500/20 flex flex-col sm:flex-row justify-between items-center gap-3 md:gap-4 flex-shrink-0 bg-slate-900/80 safe-area-pb">
                        {systemToEdit !== '__NEW__' && (
                            <button onClick={handleDelete} className="w-full sm:w-auto px-5 py-2 rounded-md font-bold transition-all duration-300 text-sm border-2 bg-red-600/50 border-red-500 hover:bg-red-600 hover:text-white hover:shadow-[0_0_15px_rgba(239,68,68,0.5)] whitespace-nowrap">
                                Excluir Sistema
                            </button>
                        )}
                        <div className="flex gap-4 w-full sm:w-auto sm:ml-auto justify-end">
                            <button onClick={onClose} className="flex-1 sm:flex-none px-5 py-2 rounded-md font-bold transition-all duration-300 text-sm border-2 bg-slate-600/50 border-slate-500 hover:bg-slate-600 hover:text-white whitespace-nowrap">
                                Cancelar
                            </button>
                            <button onClick={handleSave} className="flex-1 sm:flex-none px-5 py-2 rounded-md font-bold transition-all duration-300 text-sm border-2 bg-purple-600/50 border-purple-500 hover:bg-purple-600 hover:text-white hover:shadow-[0_0_15px_rgba(192,132,252,0.5)] whitespace-nowrap">
                                Salvar Alterações
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
});