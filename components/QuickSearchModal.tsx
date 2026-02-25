
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { OrbitalSystem } from '../types';
import { normalizeText } from '../services/searchService';

interface QuickSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    systems: OrbitalSystem[];
    onSelect: (systemId: string) => void;
}

export const QuickSearchModal: React.FC<QuickSearchModalProps> = ({ isOpen, onClose, systems, onSelect }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const resultsRef = useRef<HTMLUListElement>(null);

    useEffect(() => {
        if (isOpen) {
            setSearchTerm('');
            setActiveIndex(0);
            // Focus removido para não abrir o teclado automaticamente no mobile
            // setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    const filteredSystems = useMemo(() => {
        if (!searchTerm) {
            return systems;
        }
        const normalizedSearch = normalizeText(searchTerm);
        return systems.filter(system => {
            const normalizedSystemName = normalizeText(system.name);
            const satelliteNames = system.satellites.map(s => normalizeText(s.name)).join(' ');
            return normalizedSystemName.includes(normalizedSearch) || satelliteNames.includes(normalizedSearch);
        });
    }, [searchTerm, systems]);

    useEffect(() => {
        setActiveIndex(0);
    }, [filteredSystems]);

    // Scroll active item into view
    useEffect(() => {
        if (resultsRef.current) {
            const activeElement = resultsRef.current.children[activeIndex] as HTMLLIElement;
            if (activeElement) {
                activeElement.scrollIntoView({
                    block: 'nearest',
                    behavior: 'smooth',
                });
            }
        }
    }, [activeIndex]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            onClose();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(prev => (prev + 1) % filteredSystems.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(prev => (prev - 1 + filteredSystems.length) % filteredSystems.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (filteredSystems[activeIndex]) {
                onSelect(filteredSystems[activeIndex].id);
            }
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 z-[9990] flex items-start justify-center pt-[15vh] p-4" onClick={onClose}>
            <div 
                className="w-full max-w-2xl bg-slate-900/80 border border-purple-500/30 rounded-lg shadow-2xl flex flex-col text-white overflow-hidden"
                onClick={e => e.stopPropagation()}
                onKeyDown={handleKeyDown}
            >
                <div className="p-3 border-b border-purple-500/20 flex items-center gap-3">
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        ref={inputRef}
                        type="text"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="Buscar por sistema ou satélite..."
                        className="w-full bg-transparent text-lg text-white placeholder-slate-500 focus:outline-none"
                    />
                </div>

                <ul ref={resultsRef} className="max-h-[50vh] overflow-y-auto">
                    {filteredSystems.length > 0 ? (
                        filteredSystems.map((system, index) => (
                            <li
                                key={system.id}
                                onClick={() => onSelect(system.id)}
                                onMouseEnter={() => setActiveIndex(index)}
                                className={`p-4 flex items-center gap-4 border-b border-slate-800 cursor-pointer transition-colors duration-150 ${
                                    index === activeIndex ? 'bg-purple-600/30' : 'hover:bg-slate-800/60'
                                }`}
                                role="option"
                                aria-selected={index === activeIndex}
                            >
                                <img src={system.iconUrl} alt={system.name} className="w-12 h-12 object-cover rounded-md flex-shrink-0 bg-slate-800" />
                                <div className="flex-grow">
                                    <p className="font-bold text-white">{system.name}</p>
                                    <p className="text-xs text-slate-400">{system.satellites.length} {system.satellites.length === 1 ? 'satélite' : 'satélites'}</p>
                                </div>
                            </li>
                        ))
                    ) : (
                        <li className="p-8 text-center text-slate-400">Nenhum resultado encontrado.</li>
                    )}
                </ul>
            </div>
        </div>
    );
};