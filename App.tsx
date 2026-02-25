import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { OrbitalSystem as OrbitalSystemType, SearchItem, Tour, OrbitalSystemRef } from './types';
import { orbitalSystemsData as initialSystems } from './data/initialData';
import { useVoiceRecognition } from './hooks/useVoiceRecognition';
import { buildSearchCache, findMatchingItems, applyPhoneticCorrections } from './services/searchService';
import { ParallaxBackground } from './components/ParallaxBackground';
import { OrbitalSystem } from './components/OrbitalSystem';
import { ImageModal } from './components/ImageModal';
import { useWakeLock } from './hooks/useWakeLock';
import { AdminPanel } from './components/AdminPanel';
import { AdminLoginModal } from './components/AdminLoginModal';
import { QuickSearchModal } from './components/QuickSearchModal';
import { TourSelectionModal } from './components/TourSelectionModal';
import { TourControls } from './components/TourControls';
import { FeedbackMessage } from './components/FeedbackMessage';
import { MapModal } from './components/MapModal';

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
    const [activeTour, setActiveTour] = useState<{ tour: Tour; currentStep: number } | null>(null);

    const orbitalSystemRef = useRef<OrbitalSystemRef>(null);

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

    const [tours, setTours] = useState<Tour[]>(() => {
        try {
            const storedTours = localStorage.getItem('orbitalTours');
            return storedTours ? JSON.parse(storedTours) : [];
        } catch (error) {
            console.error("Falha ao carregar tours do localStorage", error);
            localStorage.removeItem('orbitalTours');
            return [];
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

    useEffect(() => {
        console.log("Pré-carregando todas as imagens do sistema em background...");
        const imageUrlsToPreload = new Set<string>();

        imageUrlsToPreload.add("https://i.ibb.co/DPMyNGvd/MINHA-LOGO.png");
        imageUrlsToPreload.add("https://i.ibb.co/fzpVkfb1/Layout-1-page-0001.jpg"); // Map image
        systems.forEach(system => {
            imageUrlsToPreload.add(system.iconUrl);
            system.modalUrls.forEach(url => imageUrlsToPreload.add(url));
        });

        const urls = Array.from(imageUrlsToPreload);

        // Load images in parallel batches of 4 for fast preloading
        // without overwhelming the browser or network
        const BATCH_SIZE = 4;
        let i = 0;

        const loadBatch = () => {
            if (i >= urls.length) return;

            const batch = urls.slice(i, i + BATCH_SIZE);
            i += BATCH_SIZE;

            let completed = 0;
            batch.forEach(url => {
                const img = new Image();
                img.onload = img.onerror = () => {
                    completed++;
                    if (completed === batch.length) {
                        // Small delay between batches to keep UI responsive
                        setTimeout(loadBatch, 100);
                    }
                };
                img.src = url;
            });
        };

        // Start preloading after a short delay to not interfere with initial render
        setTimeout(loadBatch, 200);

        console.log(`${urls.length} imagens agendadas para pré-carregamento otimizado.`);
    }, [systems]);

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

    const { isListening, start, stop, permissionGranted, setPermissionGranted } = useVoiceRecognition({
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
            const correctedTranscript = applyPhoneticCorrections(transcript);
            showFeedback(`VOCÊ DISSE: "${correctedTranscript.toUpperCase()}"`);

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
    const goToTourStep = useCallback((stepIndex: number) => {
        if (!activeTour) return;

        const step = activeTour.tour.steps[stepIndex];
        if (!step) return;

        const system = systems.find(s => s.id === step.systemId);
        if (!system) return;

        setActiveTour(prev => prev ? { ...prev, currentStep: stepIndex } : null);

        handleCloseModal();

        setTimeout(() => {
            setModalImages(system.modalUrls);
            setIsModalOpen(true);
            orbitalSystemRef.current?.highlightSystemsByIds([system.id]);
            orbitalSystemRef.current?.focusSystem(system.id);
        }, 400);

    }, [activeTour, systems, handleCloseModal]);

    const startTour = useCallback((tour: Tour) => {
        if (tour.steps.length === 0) {
            showFeedback("Este tour não possui etapas.");
            return;
        }
        setIsTourSelectionOpen(false);
        setActiveTour({ tour, currentStep: 0 });
        const step = tour.steps[0];
        const system = systems.find(s => s.id === step.systemId);
        if (system) {
            handleCloseModal();
            setTimeout(() => {
                setModalImages(system.modalUrls);
                setIsModalOpen(true);
                orbitalSystemRef.current?.highlightSystemsByIds([system.id]);
            }, 500);
        }
    }, [systems, handleCloseModal, showFeedback]);

    const endTour = useCallback(() => {
        setActiveTour(null);
        handleCloseModal();
    }, [handleCloseModal]);

    const handleTourNext = useCallback(() => {
        if (activeTour && activeTour.currentStep < activeTour.tour.steps.length - 1) {
            goToTourStep(activeTour.currentStep + 1);
        }
    }, [activeTour, goToTourStep]);

    const handleTourPrev = useCallback(() => {
        if (activeTour && activeTour.currentStep > 0) {
            goToTourStep(activeTour.currentStep - 1);
        }
    }, [activeTour, goToTourStep]);

    const getSystemForTourStep = () => {
        if (!activeTour) return null;
        const currentStep = activeTour.tour.steps[activeTour.currentStep];
        return currentStep ? currentStep.systemId : null;
    }

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
    const handleOpenSystemImages = useCallback((urls: string[]) => {
        setModalImages(urls);
        setIsModalOpen(true);
    }, []);

    return (
        <div className="relative w-screen h-screen overflow-hidden font-sans cursor-grab touch-none transition-colors duration-500 bg-[radial-gradient(ellipse_at_center,_#1a0b2e_0%,_#000000_100%)]">

            <ParallaxBackground />

            {activeTour && (
                <TourControls
                    tourName={activeTour.tour.name}
                    currentStep={activeTour.currentStep + 1}
                    totalSteps={activeTour.tour.steps.length}
                    onNext={handleTourNext}
                    onPrev={handleTourPrev}
                    onExit={endTour}
                />
            )}

            <div className="relative z-10 flex items-center justify-center w-full h-full min-h-screen">
                <OrbitalSystem
                    ref={orbitalSystemRef}
                    systems={systems}
                    onOrbClick={handleOrbClick}
                    isListening={isListening}
                    onVoiceToggle={handleVoiceToggle}
                    isAdmin={isAdmin}
                    onAddSystem={handleAddNewSystem}
                    isEditing={!!editingSystem}
                    onOpenQuickSearch={handleOpenQuickSearch}
                    onOpenTours={handleOpenTours}
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

            <FeedbackMessage message={feedbackMessage} />

            <ImageModal
                isOpen={isModalOpen}
                imageUrls={modalImages}
                onClose={handleCloseModal}
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
                            title="Ver Mapa do Ecossistema"
                            onClick={handleOpenMapModal}
                            className="w-12 h-12 rounded-full bg-black/60 border border-emerald-500 flex items-center justify-center text-white transition-all duration-300 hover:scale-110 hover:bg-emerald-500/20"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                            </svg>
                        </button>
                        <button
                            title={isAdmin ? "Sair do Modo Admin" : "Acesso de Admin"}
                            onClick={handleAdminToggle}
                            className="w-12 h-12 rounded-full bg-black/60 border border-purple-500 flex items-center justify-center text-white transition-all duration-300 hover:scale-110 hover:bg-purple-500/20"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export default App;