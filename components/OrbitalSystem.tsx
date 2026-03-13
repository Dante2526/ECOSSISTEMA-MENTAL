import React, { useState, useEffect, useCallback, useRef, memo, useMemo, forwardRef, useImperativeHandle } from 'react';
import { OrbitalSystem as OrbitalSystemType, Satellite, OrbitalSystemRef } from '../types';

// White/Monochrome Palette for Structure
const COLORS = [
    { name: 'white', hex: '#FFFFFF', shadow: 'rgba(255, 255, 255, 0.6)' },
    { name: 'silver', hex: '#E5E7EB', shadow: 'rgba(229, 231, 235, 0.6)' },
    { name: 'gray', hex: '#D1D5DB', shadow: 'rgba(209, 213, 219, 0.6)' },
];

const MainOrb = memo(({ isListening, onVoiceClick }: { isListening: boolean, onVoiceClick: () => void }) => (
    <div className="relative z-30 flex items-center justify-center">
        {/* Camada externa brilho extra de Voice Ativo */}
        {isListening && (
            <div className="absolute inset-[-40px] rounded-full bg-cyan-500/20 blur-xl animate-pulse pointer-events-none"></div>
        )}

        {/* Orbe Central Principal */}
        <div
            data-interaction-target="main-orb"
            className={`relative w-[160px] h-[160px] md:w-[220px] md:h-[220px] rounded-full flex items-center justify-center cursor-pointer transition-all duration-500 transform-gpu
            border-[4px] ${isListening ? 'border-cyan-400 shadow-[0_0_80px_rgba(34,211,238,0.8),inset_0_0_30px_rgba(34,211,238,0.5)] scale-[1.08]' : 'border-gray-300 shadow-[0_0_50px_rgba(255,255,255,0.3)]'}
            bg-orange-500 hover:scale-[1.02] overflow-hidden group`}
            style={{ WebkitBackfaceVisibility: 'hidden', backfaceVisibility: 'hidden', transform: isListening ? 'translateZ(0) scale(1.08)' : 'translateZ(0)' }}
            onClickCapture={(e) => {
                e.stopPropagation();
                onVoiceClick();
            }}
        >
            {/* Wrapper isolado para logo garantir recorte circular sempre e fixar layout box */}
            <div
                className={`relative w-full h-full bg-white rounded-full overflow-hidden transition-opacity duration-500 transform-gpu ${isListening ? 'opacity-80' : 'opacity-100'}`}
                style={{ WebkitBackfaceVisibility: 'hidden', backfaceVisibility: 'hidden', transform: 'translateZ(0)' }}
            >
                <img
                    src="https://i.ibb.co/DPMyNGvd/MINHA-LOGO.png"
                    onError={(e) => { e.currentTarget.src = 'https://placehold.co/200/ff8800/ffffff?text=KAIZEN%0ANAYLAN'; }}
                    alt="KAIZEN POR: NAYLAN"
                    className="w-full h-full object-cover rounded-full pointer-events-none select-none transform-gpu"
                    draggable="false"
                />
            </div>

            {/* Ícone de Microfone e Overlay Escuro quando ativo */}
            {isListening && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px] z-10">
                    <div className="w-16 h-16 rounded-full bg-cyan-500/30 flex items-center justify-center mb-2 animate-pulse">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-cyan-300 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                    </div>
                    <span className="text-cyan-300 font-bold tracking-widest text-xs md:text-sm animate-pulse shadow-black">OUVINDO</span>
                </div>
            )}
        </div>

        {/* Decorative Rings - Ficam atrás do Orbe  */}
        <div className={`absolute inset-[-10px] rounded-full border border-white/30 pointer-events-none transition-all duration-300 ${isListening ? 'border-cyan-400/60 animate-ping opacity-50 scale-125' : 'opacity-10'}`}></div>
        <div className={`absolute inset-[-20px] rounded-full border border-dashed pointer-events-none transition-all duration-300 ${isListening ? 'border-cyan-300/40 animate-[spin_10s_linear_infinite] scale-110' : 'animate-[spin_60s_linear_infinite] border-white/10'}`}></div>

        {/* Sonar Pura Energia quando ativo */}
        {isListening && (
            <div className="absolute inset-[-30px] z-[1] pointer-events-none rounded-full">
                <div className="absolute inset-0 border-[3px] border-cyan-400 rounded-full animate-sonar-pulse opacity-70"></div>
                <div className="absolute inset-[-20px] border-[2px] border-blue-400 rounded-full animate-sonar-pulse opacity-40" style={{ animationDelay: '0.4s' }}></div>
            </div>
        )}
    </div>
));

const SatelliteNode: React.FC<{
    system: OrbitalSystemType,
    x: number,
    y: number,
    color: typeof COLORS[0],
    isHighlighted: boolean,
    isDuplicate: boolean,
    isAdmin: boolean;
    onNodeClick: (id: string) => void;
}> = ({ system, x, y, color, isHighlighted, isDuplicate, isAdmin, onNodeClick }) => {

    const totalSatellites = system.satellites.length;
    const satelliteOrbitRadius = totalSatellites > 6 ? 72 : 60;

    const satellitePositions = useMemo(() => {
        return system.satellites.map((sat, i) => {
            const angleStep = 360 / (totalSatellites || 1);
            const angle = -90 + (i * angleStep);
            const rad = (angle * Math.PI) / 180;
            return {
                ...sat,
                x: Math.cos(rad) * satelliteOrbitRadius,
                y: Math.sin(rad) * satelliteOrbitRadius
            };
        });
    }, [system.satellites, totalSatellites, satelliteOrbitRadius]);

    return (
        <div
            className="absolute"
            style={{ left: x, top: y, width: 0, height: 0 }}
        >
            {/* Tether Lines to Satellites */}
            <svg className="absolute top-0 left-0 w-1 h-1 overflow-visible pointer-events-none z-10">
                {satellitePositions.map((sat, i) => (
                    <line
                        key={`line-${i}`}
                        x1={0}
                        y1={0}
                        x2={sat.x}
                        y2={sat.y}
                        stroke={isHighlighted ? "white" : "rgba(255, 255, 255, 0.6)"}
                        strokeWidth={isHighlighted ? "2" : "1.5"}
                        vectorEffect="non-scaling-stroke"
                    />
                ))}
            </svg>

            {/* The System Orb (Node) which clips its own image */}
            <div
                data-interaction-target="system-orb"
                data-system-id={system.id}
                className={`absolute w-14 h-14 -translate-x-1/2 -translate-y-1/2 rounded-full cursor-pointer transition-all duration-300 z-20 group
                border-2 bg-black overflow-hidden flex items-center justify-center
                ${isAdmin ? 'ring-2 ring-offset-2 ring-offset-black ring-purple-500/80 hover:ring-purple-400' : 'hover:scale-125'}`}
                style={{
                    borderColor: isHighlighted ? '#ffffff' : color.hex,
                    boxShadow: isHighlighted ? '0 0 25px rgba(255,255,0,0.9)' : `0 0 15px ${color.shadow}, inset 0 0 10px ${color.shadow}`,
                }}
                onClickCapture={(e) => {
                    e.stopPropagation();
                    onNodeClick(system.id);
                }}
            >
                {isDuplicate && (
                    <div title="Link Duplicado" className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full z-30 grid place-items-center border-2 border-white">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                    </div>
                )}
                <img
                    src={system.iconUrl}
                    alt={system.name}
                    className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                />
                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            </div>

            {/* Satellites Container - sibling to the orb, so it isn't clipped */}
            <div className="absolute top-0 left-0 w-0 h-0 pointer-events-none z-30">
                {satellitePositions.map((sat, i) => {
                    const formattedName = sat.name.includes(' - ')
                        ? sat.name.replace(' - ', '<br/>')
                        : sat.name;

                    return (
                        <div
                            key={i}
                            data-interaction-target="system-orb"
                            data-system-id={system.id}
                            className={`absolute w-11 h-11 rounded-full flex items-center justify-center bg-black transition-all duration-300 border cursor-pointer pointer-events-auto ${isHighlighted ? 'border-white bg-white/20 shadow-[0_0_10px_rgba(255,255,255,0.5)]' :
                                sat.style === 'neon-red' ? 'border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.4)]' :
                                    sat.style === 'neon-yellow' ? 'border-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.4)]' :
                                        sat.style === 'neon-green' ? 'border-lime-400 shadow-[0_0_10px_rgba(163,230,53,0.4)]' :
                                            'border-white shadow-[0_0_10px_rgba(255,255,255,0.5)]'
                                }`}
                            style={{
                                left: sat.x,
                                top: sat.y,
                                transform: 'translate(-50%, -50%)',
                            }}
                            onClickCapture={(e) => {
                                e.stopPropagation();
                                onNodeClick(system.id);
                            }}
                        >
                            <span
                                className={`text-[9px] font-bold text-center leading-[0.9rem] block px-0.5 w-full break-words ${isHighlighted ? 'text-white' : 'text-gray-100'}`}
                                dangerouslySetInnerHTML={{ __html: formattedName }}
                                style={{
                                    // translateZ(0) promotes the text to its own GPU compositing layer
                                    // so the counter-rotation never causes sub-pixel CPU jitter
                                    transform: 'rotate(calc(-1 * var(--system-rotation, 0deg))) translateZ(0)',
                                    willChange: 'transform',
                                }}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const MemoizedNode = memo(SatelliteNode);

interface OrbitalSystemProps {
    systems: OrbitalSystemType[];
    onOrbClick: (systemId: string) => void;
    isListening: boolean;
    onVoiceToggle: () => void;
    isAdmin: boolean;
    onAddSystem: () => void;
    isEditing: boolean;
    onOpenQuickSearch: () => void;
    onOpenTours: () => void;
}

// Helper function moved outside component for performance
const getAngle = (cx: number, cy: number, ex: number, ey: number) => (Math.atan2(ey - cy, ex - cx) * 180) / Math.PI;
const getResponsiveDefaultZoom = () => window.innerWidth < 768 ? 0.35 : 0.5;

const OrbitalSystemComponent: React.ForwardRefRenderFunction<OrbitalSystemRef, OrbitalSystemProps> = ({
    systems,
    onOrbClick,
    isListening,
    onVoiceToggle,
    isAdmin,
    onAddSystem,
    isEditing,
    onOpenQuickSearch,
    onOpenTours,
}, ref) => {
    const [highlightedSystems, setHighlightedSystems] = useState<Set<string>>(new Set());
    const [isFocused, setIsFocused] = useState(false);
    const focusedSystemIdRef = useRef<string | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const rotationContainerRef = useRef<HTMLDivElement>(null);
    const rafPendingRef = useRef(false);

    const velocityRef = useRef(0.03);
    const animationFrameId = useRef<number | null>(null);
    const animationPausedRef = useRef(false);

    const viewStateRef = useRef({ pan: { x: 0, y: 0 }, zoom: getResponsiveDefaultZoom(), rotation: 0 });

    const onOrbClickRef = useRef(onOrbClick);
    useEffect(() => { onOrbClickRef.current = onOrbClick; }, [onOrbClick]);
    const onVoiceToggleRef = useRef(onVoiceToggle);
    useEffect(() => { onVoiceToggleRef.current = onVoiceToggle; }, [onVoiceToggle]);

    const updateTransform = useCallback((animate = false) => {
        if (containerRef.current) {
            // Use a near-instant transition for drag/pan (feels instantaneous)
            // and a smooth transition for animated resets — no force reflow needed.
            containerRef.current.style.transition = animate
                ? 'transform 0.8s cubic-bezier(0.33, 1, 0.68, 1)'
                : 'transform 0ms linear';
            const { pan, zoom } = viewStateRef.current;
            // Use translate3d to force hardware acceleration on mobile
            containerRef.current.style.transform = `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`;
        }
    }, []);

    const getLayoutConfig = useCallback(() => {
        const width = window.innerWidth;
        const baseRadius = width > 1024 ? 550 : width > 768 ? 450 : 320;
        return { baseRadius };
    }, []);

    const [config, setConfig] = useState(getLayoutConfig());

    const duplicateSystems = useMemo(() => {
        const urlMap = new Map<string, string[]>();
        systems.forEach(system => {
            system.modalUrls.forEach(url => {
                if (!urlMap.has(url)) {
                    urlMap.set(url, []);
                }
                urlMap.get(url)!.push(system.id);
            });
        });

        const systemsWithDuplicates = new Set<string>();
        urlMap.forEach((systemIds) => {
            if (systemIds.length > 1) {
                systemIds.forEach(id => systemsWithDuplicates.add(id));
            }
        });
        return systemsWithDuplicates;
    }, [systems]);

    // Effect for handling focus changes is now moved to imperative handle
    // We keep the resize effect
    useEffect(() => {
        const handleResize = () => {
            setConfig(prev => {
                const newConfig = getLayoutConfig();
                if (prev.baseRadius === newConfig.baseRadius) return prev;
                return newConfig;
            });
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [getLayoutConfig]);

    const nodesData = useMemo(() => {
        const layoutPattern = [
            { angleDeg: 355, radiusMult: 1.9, curveOffset: 0.4 },
            { angleDeg: 30, radiusMult: 1.5, curveOffset: 0.6 },
            { angleDeg: 325, radiusMult: 1.5, curveOffset: 0.3 },

            { angleDeg: 90, radiusMult: 1.9, curveOffset: 0.5 },
            { angleDeg: 60, radiusMult: 1.4, curveOffset: 0.4 },
            { angleDeg: 120, radiusMult: 1.4, curveOffset: 0.6 },

            { angleDeg: 180, radiusMult: 1.9, curveOffset: -0.5 },
            { angleDeg: 150, radiusMult: 2.0, curveOffset: -0.4 },
            { angleDeg: 210, radiusMult: 1.5, curveOffset: -0.6 },

            { angleDeg: 270, radiusMult: 1.8, curveOffset: 0.3 },
            { angleDeg: 240, radiusMult: 1.4, curveOffset: -0.3 },
            { angleDeg: 300, radiusMult: 1.4, curveOffset: 0.3 },

            { angleDeg: 45, radiusMult: 2.0, curveOffset: 0.5 },
            { angleDeg: 135, radiusMult: 1.8, curveOffset: -0.5 },
            { angleDeg: 225, radiusMult: 1.8, curveOffset: -0.5 },
            { angleDeg: 315, radiusMult: 1.8, curveOffset: 0.5 },

            { angleDeg: 15, radiusMult: 2.1, curveOffset: 0.7 },
            { angleDeg: 195, radiusMult: 2.1, curveOffset: -0.7 },
        ];

        return systems.map((system, index) => {
            let r, theta, cpX, cpY;
            let color = COLORS[index % COLORS.length];

            if (index < layoutPattern.length) {
                const layout = layoutPattern[index];
                r = config.baseRadius * layout.radiusMult;
                theta = (layout.angleDeg * Math.PI) / 180;

                const cpRad = r * 0.55;
                const cpTh = theta + layout.curveOffset;
                cpX = cpRad * Math.cos(cpTh);
                cpY = cpRad * Math.sin(cpTh);
            } else {
                const extraIndex = index - layoutPattern.length;
                const spiralAngle = (extraIndex * 37 + 100) % 360;
                const spiralExpansion = Math.floor(extraIndex / 8) * 0.4;
                const radiusMult = 2.2 + spiralExpansion + ((extraIndex % 3) * 0.1);
                r = config.baseRadius * radiusMult;
                theta = (spiralAngle * Math.PI) / 180;

                const cpRad = r * 0.6;
                const cpTh = theta + (index % 2 === 0 ? 0.4 : -0.4);
                cpX = cpRad * Math.cos(cpTh);
                cpY = cpRad * Math.sin(cpTh);
            }

            const x = r * Math.cos(theta);
            const y = r * Math.sin(theta);

            return { system, x, y, cpX, cpY, color };
        });
    }, [systems, config]);

    useImperativeHandle(ref, () => ({
        highlightSystemsByIds: (ids: string[]) => {
            setHighlightedSystems(prev => {
                if (prev.size === ids.length && ids.every(id => prev.has(id))) {
                    return prev;
                }
                return new Set(ids);
            });
        },
        focusSystem: (id: string | null) => {
            if (focusedSystemIdRef.current === id) return;
            focusedSystemIdRef.current = id;
            setIsFocused(id !== null);

            if (id) {
                animationPausedRef.current = true;
                const node = nodesData.find(n => n.system.id === id);
                if (node) {
                    const targetZoom = window.innerWidth < 768 ? 1.2 : 1.0;
                    const rotationAngle = viewStateRef.current.rotation;
                    const rad = (rotationAngle * Math.PI) / 180;

                    const rotatedX = node.x * Math.cos(rad) - node.y * Math.sin(rad);
                    const rotatedY = node.x * Math.sin(rad) + node.y * Math.cos(rad);

                    viewStateRef.current.zoom = targetZoom;
                    viewStateRef.current.pan = { x: -rotatedX * targetZoom, y: -rotatedY * targetZoom };
                    updateTransform(true); // Animate during tour focus
                }
            } else {
                viewStateRef.current.zoom = getResponsiveDefaultZoom();
                viewStateRef.current.pan = { x: 0, y: 0 };
                velocityRef.current = 0.03;
                updateTransform(true);

                // Resume rotation after zoom transition finishes to prevent stuttering
                setTimeout(() => {
                    animationPausedRef.current = false;
                }, 800);
            }
        }
    }), [nodesData, updateTransform]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        // Initialize default transform without animation
        updateTransform(false);

        const animate = () => {
            if (!animationPausedRef.current) {
                velocityRef.current *= 0.98;
                if (Math.abs(velocityRef.current) < 0.03) {
                    velocityRef.current = 0.03;
                }

                // Round to 2 decimal places to prevent floating-point noise accumulation
                // which causes the satellite text counter-rotation to tremble each frame
                const newRotation = Math.round((viewStateRef.current.rotation + velocityRef.current) % 360 * 100) / 100;
                viewStateRef.current.rotation = newRotation;

                if (rotationContainerRef.current) {
                    rotationContainerRef.current.style.transform = `rotate(${newRotation}deg)`;
                }
                el.style.setProperty('--system-rotation', `${newRotation}deg`);
            }
            animationFrameId.current = requestAnimationFrame(animate);
        };
        animationFrameId.current = requestAnimationFrame(animate);
        return () => {
            if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
        };
    }, [updateTransform]);

    const activePointers = useRef<Map<number, { x: number; y: number }>>(null as any);
    if (activePointers.current === null) {
        activePointers.current = new Map();
    }
    const gestureState = useRef({
        interacting: false,
        interactionTarget: null as string | null,
        isDrag: false,
        startX: 0,
        startY: 0,
        panStartX: 0,
        panStartY: 0,
        orbitStartRotation: 0,
        orbitStartAngle: 0,
        orbitLastTime: 0,
        systemId: null as string | null,
        initialPinchDistance: 0,
        zoomOnPinchStart: 1,
        containerRect: null as DOMRect | null,
    });

    const checkIsDrag = useCallback(() => {
        return gestureState.current.isDrag || gestureState.current.interactionTarget === 'pinch-zoom';
    }, []);

    const handleNodeClick = useCallback((id: string) => {
        if (!checkIsDrag()) {
            onOrbClickRef.current(id);
        }
    }, [checkIsDrag]);

    const handleVoiceClick = useCallback(() => {
        if (!checkIsDrag()) {
            onVoiceToggleRef.current();
        }
    }, [checkIsDrag]);

    useEffect(() => {
        const el = containerRef.current;
        // Check ref instead of prop
        if (!el || !!focusedSystemIdRef.current) return;

        const panLimit = config.baseRadius * 3;

        const handlePointerMove = (e: PointerEvent) => {
            if (!gestureState.current.interacting || !activePointers.current.has(e.pointerId)) return;

            activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

            if (activePointers.current.size === 2 && gestureState.current.interactionTarget === 'pinch-zoom') {
                gestureState.current.isDrag = true;
                const pointers = [...activePointers.current.values()];
                const currentDist = Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y);

                if (gestureState.current.initialPinchDistance > 0) {
                    const scale = currentDist / gestureState.current.initialPinchDistance;
                    const newZoom = Math.min(Math.max(gestureState.current.zoomOnPinchStart * scale, 0.2), 3);

                    const midpoint = { x: (pointers[0].x + pointers[1].x) / 2, y: (pointers[0].y + pointers[1].y) / 2 };
                    const currentRect = containerRef.current!.getBoundingClientRect();
                    const centerX = currentRect.left + currentRect.width / 2;
                    const centerY = currentRect.top + currentRect.height / 2;

                    const panAdjX = -(midpoint.x - centerX) * (newZoom / viewStateRef.current.zoom - 1);
                    const panAdjY = -(midpoint.y - centerY) * (newZoom / viewStateRef.current.zoom - 1);

                    const newPanX = viewStateRef.current.pan.x + panAdjX;
                    const newPanY = viewStateRef.current.pan.y + panAdjY;

                    viewStateRef.current.pan.x = Math.max(-panLimit, Math.min(panLimit, newPanX));
                    viewStateRef.current.pan.y = Math.max(-panLimit, Math.min(panLimit, newPanY));
                    viewStateRef.current.zoom = newZoom;

                    if (!rafPendingRef.current) {
                        rafPendingRef.current = true;
                        requestAnimationFrame(() => {
                            updateTransform(false);
                            rafPendingRef.current = false;
                        });
                    }
                }
            } else if (activePointers.current.size === 1) {
                const dx = e.clientX - gestureState.current.startX;
                const dy = e.clientY - gestureState.current.startY;
                if (!gestureState.current.isDrag && Math.hypot(dx, dy) > 20) {
                    gestureState.current.isDrag = true;
                }

                if (gestureState.current.isDrag) {
                    if (gestureState.current.interactionTarget === 'pan-container') {
                        const newX = gestureState.current.panStartX + dx;
                        const newY = gestureState.current.panStartY + dy;

                        viewStateRef.current.pan.x = Math.max(-panLimit, Math.min(panLimit, newX));
                        viewStateRef.current.pan.y = Math.max(-panLimit, Math.min(panLimit, newY));

                        if (!rafPendingRef.current) {
                            rafPendingRef.current = true;
                            requestAnimationFrame(() => {
                                updateTransform(false);
                                rafPendingRef.current = false;
                            });
                        }
                    } else { // Orbiting
                        const rect = gestureState.current.containerRect!;
                        const centerX = rect.left + rect.width / 2;
                        const centerY = rect.top + rect.height / 2;
                        const currentAngle = getAngle(centerX, centerY, e.clientX, e.clientY);
                        const delta = currentAngle - gestureState.current.orbitStartAngle;
                        const newRot = gestureState.current.orbitStartRotation + delta;

                        viewStateRef.current.rotation = newRot;

                        if (!rafPendingRef.current) {
                            rafPendingRef.current = true;
                            requestAnimationFrame(() => {
                                if (rotationContainerRef.current) {
                                    rotationContainerRef.current.style.transform = `rotate(${viewStateRef.current.rotation}deg)`;
                                }
                                el.style.setProperty('--system-rotation', `${viewStateRef.current.rotation}deg`);
                                rafPendingRef.current = false;
                            });
                        }

                        const now = performance.now();
                        const dt = now - gestureState.current.orbitLastTime;
                        if (dt > 16) {
                            velocityRef.current = (delta / dt) * 30;
                            gestureState.current.orbitLastTime = now;
                            gestureState.current.orbitStartAngle = currentAngle;
                            gestureState.current.orbitStartRotation = newRot;
                        }
                    }
                }
            }
        };

        const handlePointerEnd = (e: PointerEvent) => {
            const target = e.target as HTMLElement;
            try {
                target.releasePointerCapture(e.pointerId);
            } catch (err) { }

            if (!gestureState.current.interacting) return;

            activePointers.current.delete(e.pointerId);

            if (activePointers.current.size === 0) {
                gestureState.current.interacting = false;
                animationPausedRef.current = false;
                el.style.cursor = 'grab';

                gestureState.current.containerRect = null;

                window.removeEventListener('pointermove', handlePointerMove);
                window.removeEventListener('pointerup', handlePointerEnd);
                window.removeEventListener('pointercancel', handlePointerEnd);
            } else if (activePointers.current.size === 1) {
                const remainingPointer = [...activePointers.current.values()][0];
                const docTarget = document.elementFromPoint(remainingPointer.x, remainingPointer.y) as HTMLElement;
                const interactionTargetEl = docTarget?.closest('[data-interaction-target]') as HTMLElement | null;
                const targetType = interactionTargetEl ? interactionTargetEl.dataset.interactionTarget : 'pan-container';

                gestureState.current.interactionTarget = targetType || 'pan-container';
                gestureState.current.isDrag = false;
                gestureState.current.startX = remainingPointer.x;
                gestureState.current.startY = remainingPointer.y;

                if (targetType === 'main-orb' || targetType === 'system-orb') {
                    const rect = gestureState.current.containerRect!;
                    const centerX = rect.left + rect.width / 2;
                    const centerY = rect.top + rect.height / 2;
                    gestureState.current.orbitStartAngle = getAngle(centerX, centerY, remainingPointer.x, remainingPointer.y);
                    gestureState.current.orbitStartRotation = viewStateRef.current.rotation;
                    gestureState.current.orbitLastTime = performance.now();
                } else {
                    gestureState.current.panStartX = viewStateRef.current.pan.x;
                    gestureState.current.panStartY = viewStateRef.current.pan.y;
                }
            }
        };

        const handlePointerDown = (e: PointerEvent) => {
            const target = e.target as HTMLElement;
            try {
                target.setPointerCapture(e.pointerId);
            } catch (err) { }

            const interactionTargetEl = target.closest('[data-interaction-target]') as HTMLElement | null;

            activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

            if (!gestureState.current.containerRect) {
                gestureState.current.containerRect = containerRef.current!.getBoundingClientRect();
            }

            if (activePointers.current.size === 1) {
                gestureState.current.interacting = true;
                const targetType = interactionTargetEl ? interactionTargetEl.dataset.interactionTarget : 'pan-container';
                gestureState.current.interactionTarget = targetType || 'pan-container';
                gestureState.current.isDrag = false;
                gestureState.current.startX = e.clientX;
                gestureState.current.startY = e.clientY;

                if (targetType === 'system-orb') {
                    gestureState.current.systemId = interactionTargetEl?.dataset.systemId || null;
                }

                animationPausedRef.current = true;
                velocityRef.current = 0;

                const rect = gestureState.current.containerRect;
                if (targetType === 'main-orb' || targetType === 'system-orb') {
                    const centerX = rect.left + rect.width / 2;
                    const centerY = rect.top + rect.height / 2;
                    gestureState.current.orbitStartAngle = getAngle(centerX, centerY, e.clientX, e.clientY);
                    gestureState.current.orbitStartRotation = viewStateRef.current.rotation;
                    gestureState.current.orbitLastTime = performance.now();
                } else {
                    gestureState.current.panStartX = viewStateRef.current.pan.x;
                    gestureState.current.panStartY = viewStateRef.current.pan.y;
                    el.style.cursor = 'grabbing';
                }

                window.addEventListener('pointermove', handlePointerMove);
                window.addEventListener('pointerup', handlePointerEnd);
                window.addEventListener('pointercancel', handlePointerEnd);

            } else if (activePointers.current.size === 2) {
                gestureState.current.interactionTarget = 'pinch-zoom';
                const pointers = [...activePointers.current.values()];
                gestureState.current.initialPinchDistance = Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y);
                gestureState.current.zoomOnPinchStart = viewStateRef.current.zoom;
            }
        };

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            const delta = e.deltaY * -0.001;

            const prevZoom = viewStateRef.current.zoom;
            const newZoom = Math.min(Math.max(prevZoom + delta, 0.2), 3);
            viewStateRef.current.zoom = newZoom;

            const rect = containerRef.current!.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            const panAdjX = -(e.clientX - centerX) * (newZoom / prevZoom - 1);
            const panAdjY = -(e.clientY - centerY) * (newZoom / prevZoom - 1);

            const newPanX = viewStateRef.current.pan.x + panAdjX;
            const newPanY = viewStateRef.current.pan.y + panAdjY;

            viewStateRef.current.pan.x = Math.max(-panLimit, Math.min(panLimit, newPanX));
            viewStateRef.current.pan.y = Math.max(-panLimit, Math.min(panLimit, newPanY));

            if (!rafPendingRef.current) {
                rafPendingRef.current = true;
                requestAnimationFrame(() => {
                    updateTransform(false);
                    rafPendingRef.current = false;
                });
            }
        };

        el.addEventListener('pointerdown', handlePointerDown);
        el.addEventListener('wheel', handleWheel, { passive: false });

        return () => {
            el.removeEventListener('pointerdown', handlePointerDown);
            el.removeEventListener('wheel', handleWheel);
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerEnd);
            window.removeEventListener('pointercancel', handlePointerEnd);
        };
    }, [updateTransform, config]); // Removed focusedSystemId dependency

    const handleResetView = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();

        viewStateRef.current.zoom = getResponsiveDefaultZoom();
        viewStateRef.current.pan = { x: 0, y: 0 };
        velocityRef.current = 0.03;

        updateTransform(true); // Animate the reset explicitly
    }, [updateTransform]);

    const size = config.baseRadius * 6;

    const connectionLines = useMemo(() => (
        <svg className="absolute top-1/2 left-1/2 w-1 h-1 overflow-visible z-0">
            {nodesData.map((node, i) => (
                <path
                    key={i}
                    d={`M 0 0 Q ${node.cpX} ${node.cpY} ${node.x} ${node.y}`}
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.8)"
                    strokeWidth="4"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                />
            ))}
        </svg>
    ), [nodesData]);

    return (
        <>
            <div
                className="relative flex items-center justify-center"
                style={{
                    width: `${size}px`,
                    height: `${size}px`
                }}
            >
                <div
                    ref={containerRef}
                    className="absolute inset-0 flex items-center justify-center cursor-grab touch-none"
                    style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                >

                    <MainOrb isListening={isListening} onVoiceClick={handleVoiceClick} />

                    <div
                        ref={rotationContainerRef}
                        className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    >
                        {/* Main Connection Lines */}
                        {connectionLines}

                        {/* Container for all system nodes */}
                        <div className="absolute top-1/2 left-1/2 w-0 h-0 pointer-events-auto z-20">
                            {nodesData.map((node) => (
                                <MemoizedNode
                                    key={node.system.id}
                                    system={node.system}
                                    x={node.x}
                                    y={node.y}
                                    color={node.color}
                                    isHighlighted={highlightedSystems.has(node.system.id)}
                                    isDuplicate={duplicateSystems.has(node.system.id)}
                                    isAdmin={isAdmin}
                                    onNodeClick={handleNodeClick}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-4">
                {isAdmin && !isEditing && (
                    <button
                        title="Adicionar Novo Sistema"
                        onClick={onAddSystem}
                        className="w-12 h-12 rounded-full bg-black/60 border border-green-500 flex items-center justify-center text-white transition-all duration-300 hover:scale-110 hover:bg-green-500/20"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                    </button>
                )}
                {!isFocused && (
                    <button
                        title="Iniciar Tour Guiado"
                        onClick={onOpenTours}
                        className="w-12 h-12 rounded-full bg-black/60 border border-yellow-500 flex items-center justify-center text-white transition-all duration-300 hover:scale-110 hover:bg-yellow-500/20"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </button>
                )}
                <button
                    title="Busca Rápida (Ctrl+K)"
                    onClick={onOpenQuickSearch}
                    className="w-12 h-12 rounded-full bg-black/60 border border-cyan-500 flex items-center justify-center text-white transition-all duration-300 hover:scale-110 hover:bg-cyan-500/20"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </button>
                <button
                    title="Resetar Visão"
                    onClick={handleResetView}
                    className="w-12 h-12 rounded-full bg-black/60 border border-blue-500 flex items-center justify-center text-white transition-all duration-300 hover:scale-110 hover:bg-blue-500/20"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                </button>
            </div>
        </>
    );
};

export const OrbitalSystem = memo(forwardRef(OrbitalSystemComponent));