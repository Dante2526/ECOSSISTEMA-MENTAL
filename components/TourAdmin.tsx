
import React, { useState, useRef } from 'react';
import { Tour, OrbitalSystem } from '../types';

interface TourAdminProps {
    systems: OrbitalSystem[];
    tours: Tour[];
    setTours: React.Dispatch<React.SetStateAction<Tour[]>>;
}

export const TourAdmin: React.FC<TourAdminProps> = ({ systems, tours, setTours }) => {
    const [editingTour, setEditingTour] = useState<Tour | null>(null);
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const draggedOverIndex = useRef<number | null>(null);

    const handleCreateTour = () => {
        const newTour: Tour = {
            id: `tour_${Date.now()}`,
            name: 'Novo Tour',
            steps: [],
        };
        setTours(prev => [...prev, newTour]);
        setEditingTour(newTour);
    };

    const handleUpdateTourName = (tourId: string, name: string) => {
        setTours(prev => prev.map(t => t.id === tourId ? { ...t, name } : t));
        if (editingTour?.id === tourId) {
            setEditingTour(prev => prev ? { ...prev, name } : null);
        }
    };

    const handleDeleteTour = (tourId: string) => {
        if (window.confirm("Tem certeza que deseja excluir este tour?")) {
            setTours(prev => prev.filter(t => t.id !== tourId));
            if (editingTour?.id === tourId) {
                setEditingTour(null);
            }
        }
    };

    const handleDragStart = (e: React.DragEvent<HTMLLIElement>, systemId: string) => {
        // Use dataTransfer to store the ID. This is more reliable than state.
        e.dataTransfer.setData('application/x-system-id', systemId);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDraggingOver(false);
        const systemId = e.dataTransfer.getData('application/x-system-id');

        if (!editingTour || !systemId) return;

        const newStep = { systemId: systemId };
        const newSteps = [...editingTour.steps];

        if (draggedOverIndex.current !== null) {
            newSteps.splice(draggedOverIndex.current, 0, newStep);
        } else {
            newSteps.push(newStep);
        }

        const updatedTour = { ...editingTour, steps: newSteps };
        setEditingTour(updatedTour);
        setTours(prev => prev.map(t => t.id === editingTour.id ? updatedTour : t));
        draggedOverIndex.current = null;
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault(); // Necessary to allow dropping
    };

    const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (e.dataTransfer.types.includes('application/x-system-id')) {
            setIsDraggingOver(true);
        }
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDraggingOver(false);
    };

    const handleStepDragOver = (e: React.DragEvent<HTMLLIElement>, index: number) => {
        e.preventDefault();
        e.stopPropagation(); // Prevent parent dragOver from firing
        draggedOverIndex.current = index;
    };

    const handleStepDragLeave = (e: React.DragEvent<HTMLLIElement>) => {
        e.preventDefault();
        draggedOverIndex.current = null;
    };

    const handleRemoveStep = (indexToRemove: number) => {
        if (!editingTour) return;
        const newSteps = editingTour.steps.filter((_, index) => index !== indexToRemove);
        const updatedTour = { ...editingTour, steps: newSteps };
        setEditingTour(updatedTour);
        setTours(prev => prev.map(t => t.id === editingTour.id ? updatedTour : t));
    };

    const handleAddStep = (systemId: string) => {
        if (!editingTour) return;
        const newStep = { systemId };
        const updatedTour = { ...editingTour, steps: [...editingTour.steps, newStep] };
        setEditingTour(updatedTour);
        setTours(prev => prev.map(t => t.id === editingTour.id ? updatedTour : t));
    };

    const getSystemById = (id: string) => systems.find(s => s.id === id);

    const availableSystems = systems.filter(system =>
        !editingTour?.steps.some(step => step.systemId === system.id)
    );

    const labelClasses = "block text-sm font-bold text-purple-300 mb-2 tracking-wider uppercase";

    if (editingTour) {
        return (
            <div>
                <button onClick={() => setEditingTour(null)} className="text-sm text-purple-300 hover:text-white mb-4">&larr; Voltar para a lista de tours</button>
                <div className='mb-6'>
                    <label htmlFor="tour-name" className={labelClasses}>Nome do Tour</label>
                    <input
                        id="tour-name"
                        type="text"
                        value={editingTour.name}
                        onChange={e => handleUpdateTourName(editingTour.id, e.target.value)}
                        className="w-full bg-slate-800/50 border-b-2 border-slate-600 rounded-t px-3 py-2 text-white placeholder-slate-400 transition-colors focus:outline-none focus:border-purple-500 focus:bg-slate-800"
                    />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex flex-col">
                        <h4 className={labelClasses}>Sistemas Disponíveis</h4>
                        <ul className="h-48 md:h-96 overflow-y-auto bg-slate-800/50 p-2 rounded-md border border-slate-700">
                            {availableSystems.map(system => (
                                <li
                                    key={system.id}
                                    draggable
                                    onDragStart={e => handleDragStart(e, system.id)}
                                    className="p-2 my-1 bg-slate-700 rounded-md flex items-center justify-between transition-opacity hover:opacity-80"
                                >
                                    <div className="flex items-center gap-2 cursor-grab">
                                        <img src={system.iconUrl} className="w-8 h-8 rounded-sm object-cover flex-shrink-0" alt={system.name} />
                                        <span className="text-xs font-semibold">{system.name}</span>
                                    </div>
                                    <button
                                        onClick={() => handleAddStep(system.id)}
                                        className="w-8 h-8 flex items-center justify-center bg-purple-600/50 hover:bg-purple-500 text-white rounded-md flex-shrink-0 md:hidden"
                                        title="Adicionar ao Tour"
                                    >
                                        +
                                    </button>
                                </li>
                            ))}
                        </ul>
                        <p className="text-xs text-slate-400 mt-2 hidden md:block">Arraste os itens para a lista ao lado.</p>
                        <p className="text-xs text-slate-400 mt-2 md:hidden">Toque no "+" para adicionar à lista abaixo.</p>
                    </div>
                    <div className="flex flex-col">
                        <h4 className={labelClasses}>Etapas do Tour</h4>
                        <div
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                            onDragEnter={handleDragEnter}
                            onDragLeave={handleDragLeave}
                            className={`h-48 md:h-96 overflow-y-auto bg-slate-800/50 p-2 rounded-md border transition-all ${isDraggingOver ? 'border-green-500 bg-green-500/10 shadow-[inset_0_0_10px_rgba(74,222,128,0.4)]' : 'border-purple-500/50'
                                }`}
                        >
                            {editingTour.steps.length > 0 ? (
                                <ol className="list-decimal list-inside text-slate-400">
                                    {editingTour.steps.map((step, index) => {
                                        const system = getSystemById(step.systemId);
                                        return (
                                            <li
                                                key={`${step.systemId}-${index}`}
                                                onDragOver={(e) => handleStepDragOver(e, index)}
                                                onDragLeave={handleStepDragLeave}
                                                className="p-2 my-1 bg-slate-900 rounded-md flex items-center justify-between"
                                            >
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <span className='font-bold text-sm'>{index + 1}.</span>
                                                    {system ? (
                                                        <>
                                                            <img src={system.iconUrl} className="w-8 h-8 rounded-sm object-cover flex-shrink-0" alt={system.name} />
                                                            <span className="text-xs text-white truncate">{system.name}</span>
                                                        </>
                                                    ) : (
                                                        <span className="text-xs text-red-400 italic">Sistema removido</span>
                                                    )}
                                                </div>
                                                <button onClick={() => handleRemoveStep(index)} className="text-red-400 hover:text-red-200 text-xs ml-2 flex-shrink-0 bg-red-900/30 px-2 py-1 rounded">Remover</button>
                                            </li>
                                        )
                                    })}
                                </ol>
                            ) : (
                                <div className="h-full flex items-center justify-center text-center text-slate-500 p-4 pointer-events-none">
                                    Adicione sistemas aqui para criar as etapas do tour.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h3 className={labelClasses}>Gerenciar Tours</h3>
                <button onClick={handleCreateTour} className="px-4 py-2 rounded-md font-bold transition-all duration-300 text-sm border-2 bg-purple-600/50 border-purple-500 hover:bg-purple-600 hover:text-white hover:shadow-[0_0_15px_rgba(192,132,252,0.5)]">
                    Criar Novo Tour
                </button>
            </div>
            <div className="space-y-2">
                {tours.map(tour => (
                    <div key={tour.id} className="p-3 bg-slate-800/50 rounded-md border border-slate-700 flex justify-between items-center">
                        <div>
                            <p className="font-bold">{tour.name}</p>
                            <p className="text-xs text-slate-400">{tour.steps.length} {tour.steps.length === 1 ? 'etapa' : 'etapas'}</p>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setEditingTour(tour)} className="px-3 py-1 text-sm bg-blue-600/50 border border-blue-500 rounded-md hover:bg-blue-600">Editar</button>
                            <button onClick={() => handleDeleteTour(tour.id)} className="px-3 py-1 text-sm bg-red-600/50 border border-red-500 rounded-md hover:bg-red-600">Excluir</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
