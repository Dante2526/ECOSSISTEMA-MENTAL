import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { OrbitalSystem as OrbitalSystemType, SearchItem, Tour, OrbitalSystemRef } from './types';
import { orbitalSystemsData as initialSystems } from './data/initialData';
import { useVoiceRecognition } from './hooks/useVoiceRecognition';
import { buildSearchCache, findMatchingItems, applyPhoneticCorrections, normalizeText, parseFromToCommand } from './services/searchService';
import { ParallaxBackground } from './components/ParallaxBackground';
import { OrbitalSystem } from './components/OrbitalSystem';
import { ImageModal } from './components/ImageModal';
import { useWakeLock } from './hooks/useWakeLock';
import { AdminPanel } from './components/AdminPanel';
import { AdminLoginModal } from './components/AdminLoginModal';
import { QuickSearchModal } from './components/QuickSearchModal';
import { TourSelectionModal } from './components/TourSelectionModal';
import { TourDeckModal } from './components/TourDeckModal';
import { FeedbackMessage } from './components/FeedbackMessage';
import { MapModal } from './components/MapModal';
import { UpdatePrompt } from './components/UpdatePrompt';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { FromToModal } from './components/FromToModal';
import { useGeolocation } from './hooks/useGeolocation';
import { usePreloadProgress } from './hooks/usePreloadProgress';

const App: React.FC = () => {
    const [modalImages, setModalImages] = useState<string[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isMapModalOpen, setIsMapModalOpen] = useState(false);
    const [feedbackMessage, setFeedbackMessage] = useState<string>('');
    const [searchCache, setSearchCache] = useState<SearchItem[]>([]);
    const [isAdmin, setIsAdmin] = useState(false);
    const [editingSystem, setEditingSystem] = useState<OrbitalSystemType | '__NEW__' | null>(null);
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
    const [isQuickSearchOpen, setIsQuickSearchOpen] = useState(false);
    const [isTourSelectionOpen, setIsTourSelectionOpen] = useState(false);
    const [isFromToModalOpen, setIsFromToModalOpen] = useState(false);
    const [activeTour, setActiveTour] = useState<Tour | null>(null);
    const [showIconLabels, setShowIconLabels] = useState(true);

    const orbitalSystemRef = useRef<OrbitalSystemRef>(null);

    // Temporizador para sumir os nomes dos ícones após 10 segundos
    useEffect(() => {
        const timer = setTimeout(() => {
            setShowIconLabels(false);
        }, 10000);
        return () => clearTimeout(timer);
    }, []);

    // PWA Service Worker registration
    const {
        offlineReady: [offlineReady],
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegistered(r) {
            console.log('SW Registrado:', r);
        },
        onRegisterError(error) {
            console.error('Erro ao registrar SW:', error);
        },
    });

    const [systems, setSystems] = useState<OrbitalSystemType[]>(() => {
        try {
            const DATA_VERSION = '1.4'; // Increment to force data reset
            const storedVersion = localStorage.getItem('orbitalDataVersion');

            if (storedVersion !== DATA_VERSION) {
                console.log("Versão de dados antiga detectada. Atualizando para", DATA_VERSION);
                localStorage.setItem('orbitalDataVersion', DATA_VERSION);
                localStorage.removeItem('orbitalSystems');
                return initialSystems;
            }

            const storedSystems = localStorage.getItem('orbitalSystems');
            return storedSystems ? JSON.parse(storedSystems) : initialSystems;
        } catch (error) {
            console.error("Falha ao carregar sistemas do localStorage", error);
            localStorage.removeItem('orbitalSystems');
            return initialSystems;
        }
    });

    const DEFAULT_TOURS: Tour[] = [
        {
            id: 'tour-oficina',
            name: 'Vamos para a Oficina Central!',
            steps: [
                { systemId: 'watchSystem19' }, // PIAL X OFICINA 01
                { systemId: 'watchSystem30' }, // PIAL X TANCAGEM
                { systemId: 'watchSystem10' }, // PIAL X OFICINA
                { systemId: 'watchSystem2' }, // PASSAGEM EM NIVEL 201
                { systemId: 'watchSystem33' }, // LINHAS SENTIDO OFICINA
                { systemId: 'watchSystem18' }, // RECLASSIFICAÇÃO E OFICINA
                { systemId: 'watchSystem4' }, // POR BAIXO DO GALPÃO DA OFICINA
                { systemId: 'watchSystem14' }, // LINHAS ABAIXO DO GALPÃO DO PIAL
            ],
        },
        {
            id: 'tour-passageiro',
            name: 'Vamos para o Passageiro!',
            steps: [
                { systemId: 'watchSystem11' }, // PASSAGEIRO 01
                { systemId: 'watchSystem13' }, // PASSAGEIRO 02
                { systemId: 'watchSystem25' }, // LOCOMOTIVA PASSAGEIRO
            ],
        },
        {
            id: 'tour-freio',
            name: 'Vamos para o Freio!',
            steps: [
                { systemId: 'watchSystem3' }, // LINHA DO FREIO
                { systemId: 'watchSystem5' }, // LINHAS DO FREIO 02
            ],
        },
        {
            id: 'tour-reclassificacao',
            name: 'Vamos para a Reclassificação!',
            steps: [
                { systemId: 'watchSystem7' }, // RECLASSIFICAÇÃO
                { systemId: 'watchSystem15' }, // RECLASSIFICAÇÃO 02
                { systemId: 'watchSystem22' }, // RECLASSIFICAÇÃO 03
                { systemId: 'watchSystem18' }, // RECLASSIFICAÇÃO E OFICINA
            ],
        },
        {
            id: 'tour-formacao',
            name: 'Vamos para a Formação!',
            steps: [
                { systemId: 'watchSystem9' }, // PN OFICINA
                { systemId: 'watchSystem12' }, // POR CIMA DO GALPÃO DA OFICINA
                { systemId: 'watchSystem17' }, // OFICINA SENTIDO FORMAÇÃO
                { systemId: 'watchSystem1' }, // LINHAS PROXIMO DO TRIÂNGULO DA OFICINA
                { systemId: 'watchSystem16' }, // LINHAS DO TRIÂNGULO DA OFICINA
                { systemId: 'watchSystem23' }, // LINHAS DO TRIÂNGULO DA OFICINA 02
            ],
        },
    ];

    const [tours, setTours] = useState<Tour[]>(() => {
        try {
            const TOURS_VERSION = '1.0';
            const storedToursVersion = localStorage.getItem('orbitalToursVersion');
            if (storedToursVersion !== TOURS_VERSION) {
                localStorage.setItem('orbitalToursVersion', TOURS_VERSION);
                localStorage.removeItem('orbitalTours');
                return DEFAULT_TOURS;
            }
            const storedTours = localStorage.getItem('orbitalTours');
            return storedTours ? JSON.parse(storedTours) : DEFAULT_TOURS;
        } catch (error) {
            console.error("Falha ao carregar tours do localStorage", error);
            localStorage.removeItem('orbitalTours');
            return DEFAULT_TOURS;
        }
    });

    useWakeLock();

    useEffect(() => {
        try {
            localStorage.setItem('orbitalSystems', JSON.stringify(systems));
            localStorage.setItem('orbitalTours', JSON.stringify(tours));
        } catch (error) {
            console.error("Falha ao salvar no localStorage", error);
        }
    }, [systems, tours]);

    const offlineProgress = usePreloadProgress(systems);

    useEffect(() => {
        setSearchCache(buildSearchCache(systems));
    }, [systems]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                setIsQuickSearchOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);


    const feedbackTimeoutRef = useRef<number>();
    const showFeedback = useCallback((message: string, duration: number = 3000) => {
        clearTimeout(feedbackTimeoutRef.current);
        setFeedbackMessage(message);
        feedbackTimeoutRef.current = window.setTimeout(() => setFeedbackMessage(''), duration);
    }, []);

    const { isListening, isProcessing, isLoadingModel, start, stop, permissionGranted, setPermissionGranted } = useVoiceRecognition({
        onStart: () => {
            showFeedback("OUVINDO...");
            if (!permissionGranted) setPermissionGranted(true);
        },
        onEnd: () => { },
        onError: (error) => {
            if (error === 'not-allowed') {
                setPermissionGranted(false);
                showFeedback("PERMISSÃO DE MICROFONE NEGADA.");
            } else if (error === 'no-speech') {
                showFeedback("NÃO OUVI NADA. TENTE DE NOVO.");
            } else if (error === 'not-supported') {
                showFeedback("RECONHECIMENTO DE VOZ NÃO SUPORTADO.");
            } else {
                showFeedback(`ERRO: ${error.toUpperCase()}`);
            }
        },
        onResult: (transcript) => {
            console.log("🎤 App: Recebido transcript:", transcript);
            
            const lowerTranscript = transcript.toLowerCase();
            if (lowerTranscript.includes("onde estou") || lowerTranscript.includes("qual linha") || lowerTranscript.includes("que linha")) {
                handleWhereAmI();
                return;
            }

            // 0. Check if it's a "From-To" command
            const fromTo = parseFromToCommand(transcript);
            if (fromTo) {
                showFeedback(`NAVEGANDO: ${fromTo.from.toUpperCase()} ➔ ${fromTo.to.toUpperCase()}`);
                handleFromToNavigation(fromTo.from, fromTo.to);
                return;
            }

            const correctedTranscript = applyPhoneticCorrections(transcript);
            
            if (!correctedTranscript || correctedTranscript.trim().length === 0) {
                showFeedback("NÃO CONSEGUI ENTENDER. TENTE NOVAMENTE.");
                return;
            }

            showFeedback(`VOCÊ DISSE: "${correctedTranscript.toUpperCase()}"`);

            // 1. Check if it matches a Tour name first
            const normalizedTranscriptForTour = normalizeText(correctedTranscript);
            const matchingTour = tours.find(t =>
                normalizeText(t.name).includes(normalizedTranscriptForTour) ||
                normalizedTranscriptForTour.includes(normalizeText(t.name))
            );

            if (matchingTour) {
                showFeedback(`INICIANDO TOUR: ${matchingTour.name.toUpperCase()}`);
                setTimeout(() => {
                    startTour(matchingTour);
                }, 1000);
                return; // Stop further search if a tour matched
            }

            // 2. Fallback to normal System/Satellite search
            const found = findMatchingItems(transcript, searchCache);

            const systemIdsToHighlight = found.map(item => item.systemId);
            orbitalSystemRef.current?.highlightSystemsByIds(systemIdsToHighlight);

            if (found.length > 0) {
                const imageUrls = Array.from(new Set(found.flatMap((item: SearchItem) => item.imageUrls)));
                orbitalSystemRef.current?.focusSystem(found[0].systemId);
                setTimeout(() => {
                    setModalImages(imageUrls);
                    setIsModalOpen(true);
                }, 1000);
            } else {
                setTimeout(() => {
                    showFeedback(`NENHUM RESULTADO PARA: "${correctedTranscript.toUpperCase()}"`);
                }, 1500);
            }
        },
    });

    // Feedback visual para o processamento do Whisper
    useEffect(() => {
        if (isLoadingModel) {
            showFeedback("INICIANDO...", 5000);
        } else if (isProcessing) {
            showFeedback("PROCESSANDO...", 15000);
        }
    }, [isLoadingModel, isProcessing, showFeedback]);

    const handleOrbClick = useCallback((systemId: string) => {
        if (activeTour) return;
        const system = systems.find(s => s.id === systemId);
        if (!system) return;

        if (isAdmin) {
            setEditingSystem(system);
        } else {
            setModalImages(system.modalUrls);
            setIsModalOpen(true);
        }
    }, [isAdmin, systems, activeTour]);

    const handleQuickSearchSelect = useCallback((systemId: string) => {
        const system = systems.find(s => s.id === systemId);
        if (system) {
            setIsQuickSearchOpen(false);
            // Use imperative focus instead of state to prevent re-renders
            orbitalSystemRef.current?.focusSystem(system.id);
            setModalImages(system.modalUrls);
            setIsModalOpen(true);
        }
    }, [systems]);

    const handleCloseModal = useCallback(() => {

        setIsModalOpen(false);

        // Delay the heavy orbital system reset until the modal fade-out is done (300ms)
        // This prevents frame drops/flickering on mobile by separating the animations
        if (!activeTour) {
            setTimeout(() => {
                orbitalSystemRef.current?.highlightSystemsByIds([]);
                orbitalSystemRef.current?.focusSystem(null);
            }, 350);
        }
    }, [activeTour]);

    const handleVoiceToggle = useCallback(() => {
        if (isListening) {
            stop();
        } else {
            start();
        }
    }, [isListening, start, stop]);

    const handleAdminToggle = useCallback(() => {
        if (isAdmin) {
            setIsAdmin(false);
            setEditingSystem(null);
            showFeedback("SESSÃO DE ADMIN ENCERRADA");
        } else {
            setIsLoginModalOpen(true);
        }
    }, [isAdmin, showFeedback]);

    const handleAttemptLogin = useCallback((email: string) => {
        if (email === "naylanmoreira350@gmail.com") {
            setIsAdmin(true);
            showFeedback("BEM-VINDO, NEAR!");
        } else if (email) {
            showFeedback("E-MAIL INCORRETO.");
        }
        setIsLoginModalOpen(false);
    }, [showFeedback]);

    const handleSaveSystemCoordinates = useCallback((systemId: string, x: number, y: number) => {
        setSystems(prev => prev.map(s => s.id === systemId ? { ...s, mapCoordinates: { x, y } } : s));
        showFeedback("Posição salva no mapa!");
    }, [showFeedback]);

    const handleSaveSystem = useCallback((systemToSave: OrbitalSystemType) => {
        const systemExists = systems.some(s => s.id === systemToSave.id);

        if (systemExists) {
            setSystems(prev => prev.map(s => s.id === systemToSave.id ? systemToSave : s));
            showFeedback("Sistema atualizado!");
        } else {
            setSystems(prev => [...prev, systemToSave]);
            showFeedback("Sistema adicionado!");
        }
        setEditingSystem(null);
    }, [systems, showFeedback]);

    const handleDeleteSystem = useCallback((systemId: string) => {
        if (window.confirm("Tem certeza de que deseja excluir este sistema? Isso também o removerá de todos os tours.")) {
            setSystems(prev => prev.filter(s => s.id !== systemId));
            setTours(prevTours => prevTours.map(tour => ({
                ...tour,
                steps: tour.steps.filter(step => step.systemId !== systemId)
            })));
            showFeedback("Sistema excluído.");
            setEditingSystem(null);
        }
    }, [showFeedback]);

    const handleAddNewSystem = useCallback(() => {
        setEditingSystem('__NEW__');
    }, []);

    const handleOpenQuickSearch = useCallback(() => setIsQuickSearchOpen(true), []);
    const handleOpenTours = useCallback(() => setIsTourSelectionOpen(true), []);

    // --- Tour Logic ---
    const startTour = useCallback((tour: Tour) => {
        if (tour.steps.length === 0) {
            showFeedback("Este tour não possui etapas.");
            return;
        }
        setIsTourSelectionOpen(false);
        setActiveTour(tour);
    }, [showFeedback]);

    const endTour = useCallback(() => {
        setActiveTour(null);
        // Reset orbital system
        setTimeout(() => {
            orbitalSystemRef.current?.highlightSystemsByIds([]);
            orbitalSystemRef.current?.focusSystem(null);
        }, 100);
    }, []);

    const handleTourSystemFocus = useCallback((systemId: string) => {
        orbitalSystemRef.current?.highlightSystemsByIds([systemId]);
        orbitalSystemRef.current?.focusSystem(systemId);
    }, []);

    const handleExportSystems = useCallback(() => {
        const dataStr = JSON.stringify(systems, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "systems_data.json";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showFeedback("Dados exportados!");
    }, [systems, showFeedback]);

    const handleCloseLoginModal = useCallback(() => setIsLoginModalOpen(false), []);
    const handleCloseQuickSearch = useCallback(() => setIsQuickSearchOpen(false), []);
    const handleCloseTourSelection = useCallback(() => setIsTourSelectionOpen(false), []);
    const handleCloseEditingSystem = useCallback(() => setEditingSystem(null), []);
    const handleOpenMapModal = useCallback(() => setIsMapModalOpen(true), []);
    const handleCloseMapModal = useCallback(() => setIsMapModalOpen(false), []);
    const handleOpenFromToModal = useCallback(() => setIsFromToModalOpen(true), []);
    const handleCloseFromToModal = useCallback(() => setIsFromToModalOpen(false), []);

    const { getCurrentPosition, findNearestSystem, isLocating: isLocatingGPS } = useGeolocation();

    const handleWhereAmI = useCallback(async () => {
        showFeedback("BUSCANDO LOCALIZAÇÃO...");
        try {
            const currentPos = await getCurrentPosition();
            const nearest = findNearestSystem(currentPos, systems);

            if (nearest) {
                showFeedback(`VOCÊ ESTÁ NA: ${nearest.system.name.toUpperCase()}`);
                // Opcional: focar no sistema se necessário
                // focusSystem(nearest.system.id);
            } else {
                showFeedback("LINHA NÃO ENCONTRADA NESSE LOCAL");
            }
        } catch (err) {
            showFeedback("ERRO AO BUSCAR GPS");
            console.error(err);
        }
    }, [getCurrentPosition, findNearestSystem, systems, showFeedback]);

    const handleFromToNavigation = useCallback((from: string, to: string) => {
        setIsFromToModalOpen(false);
        
        // Use our search service to find match for each
        const fromItems = findMatchingItems(from, searchCache);
        const toItems = findMatchingItems(to, searchCache);

        if (fromItems.length === 0 || toItems.length === 0) {
            const missing = fromItems.length === 0 ? from : to;
            showFeedback(`NÃO ENCONTREI: "${missing.toUpperCase()}"`);
            return;
        }

        // Create a temporary tour
        const combinedSteps = [
            ...fromItems.map(item => ({ systemId: item.systemId })),
            ...toItems.map(item => ({ systemId: item.systemId }))
        ];

        // Remove duplicates while keeping order
        const uniqueSteps = combinedSteps.filter((step, index, self) =>
            index === self.findIndex((s) => s.systemId === step.systemId)
        );

        const tempTour: Tour = {
            id: `temp-from-to-${Date.now()}`,
            name: `DE: ${from.toUpperCase()} PARA: ${to.toUpperCase()}`,
            steps: uniqueSteps
        };

        startTour(tempTour);
    }, [searchCache, startTour, showFeedback]);

    const handleOpenSystemImages = useCallback((urls: string[]) => {
        setModalImages(urls);
        setIsModalOpen(true);
    }, []);

    return (
        <div className="relative w-screen h-screen overflow-hidden font-sans cursor-grab touch-none transition-colors duration-500 bg-[radial-gradient(ellipse_at_center,_#1a0b2e_0%,_#000000_100%)]">

            <OfflineSetupProgress progress={offlineProgress} />
            <ParallaxBackground />

            <TourDeckModal
                isOpen={!!activeTour}
                tour={activeTour}
                systems={systems}
                onClose={endTour}
                onSystemFocus={handleTourSystemFocus}
            />

            <div className="relative z-10 flex items-center justify-center w-full h-full min-h-screen">
                    <OrbitalSystem
                    ref={orbitalSystemRef}
                    systems={systems}
                    onOrbClick={handleOrbClick}
                    isListening={isListening}
                    isProcessing={isProcessing || isLoadingModel}
                    onVoiceToggle={handleVoiceToggle}
                    isAdmin={isAdmin}
                    onAddSystem={handleAddNewSystem}
                    isEditing={!!editingSystem}
                    onOpenQuickSearch={handleOpenQuickSearch}
                    onOpenTours={handleOpenTours}
                    showLabels={showIconLabels}
                />
            </div>

            <AdminLoginModal
                isOpen={isLoginModalOpen}
                onClose={handleCloseLoginModal}
                onLogin={handleAttemptLogin}
            />

            <QuickSearchModal
                isOpen={isQuickSearchOpen}
                onClose={handleCloseQuickSearch}
                systems={systems}
                onSelect={handleQuickSearchSelect}
            />

            <TourSelectionModal
                isOpen={isTourSelectionOpen}
                onClose={handleCloseTourSelection}
                tours={tours}
                onSelectTour={startTour}
            />

            {editingSystem && (
                <AdminPanel
                    systemToEdit={editingSystem}
                    systems={systems}
                    tours={tours}
                    setTours={setTours}
                    onSave={handleSaveSystem}
                    onDelete={handleDeleteSystem}
                    onClose={handleCloseEditingSystem}
                />
            )}

            <FromToModal 
                isOpen={isFromToModalOpen}
                onClose={handleCloseFromToModal}
                onNavigate={handleFromToNavigation}
            />

            <FeedbackMessage message={feedbackMessage} />

            <ImageModal
                isOpen={isModalOpen}
                imageUrls={modalImages}
                onClose={handleCloseModal}
            />

            <UpdatePrompt
                offlineReady={offlineReady}
                needRefresh={needRefresh}
                onUpdate={useCallback(() => updateServiceWorker(true), [updateServiceWorker])}
                onClose={useCallback(() => setNeedRefresh(false), [setNeedRefresh])}
            />

            <MapModal
                isOpen={isMapModalOpen}
                onClose={handleCloseMapModal}
                systems={systems}
                isAdmin={isAdmin}
                onSaveCoordinates={handleSaveSystemCoordinates}
                onOpenSystemImages={handleOpenSystemImages}
                onExport={handleExportSystems}
            />

            <div className="fixed bottom-6 left-6 z-50 flex flex-col gap-4">
                {!editingSystem && !activeTour && (
                    <>
                        <button
                            title="Navegação De-Para"
                            onClick={handleOpenFromToModal}
                            className="group relative w-12 h-12 rounded-full bg-black/60 border border-blue-500 flex items-center justify-center text-white transition-all duration-300 hover:scale-110 hover:bg-blue-500/20"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                            <span className={`absolute left-14 whitespace-nowrap bg-black/80 px-2 py-1 rounded text-xs font-bold border border-blue-500/50 transition-all duration-1000 ${showIconLabels ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                                DE-PARA
                            </span>
                        </button>
                        <button
                            title="Ver Mapa do Ecossistema"
                            onClick={handleOpenMapModal}
                            className="group relative w-12 h-12 rounded-full bg-black/60 border border-emerald-500 flex items-center justify-center text-white transition-all duration-300 hover:scale-110 hover:bg-emerald-500/20"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                            </svg>
                            <span className={`absolute left-14 whitespace-nowrap bg-black/80 px-2 py-1 rounded text-xs font-bold border border-emerald-500/50 transition-all duration-1000 ${showIconLabels ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                                LAYOUT
                            </span>
                        </button>
                        <button
                            title={isAdmin ? "Sair do Modo Admin" : "Acesso de Admin"}
                            onClick={handleAdminToggle}
                            className="group relative w-12 h-12 rounded-full bg-black/60 border border-purple-500 flex items-center justify-center text-white transition-all duration-300 hover:scale-110 hover:bg-purple-500/20"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span className={`absolute left-14 whitespace-nowrap bg-black/80 px-2 py-1 rounded text-xs font-bold border border-purple-500/50 transition-all duration-1000 ${showIconLabels ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                                {isAdmin ? 'SAIR' : 'CONFIG'}
                            </span>
                        </button>
                    </>
                )}
            </div>

        </div>
    );
};

export default App;