import React, { useState, useRef, useEffect, useCallback } from 'react';
import { OrbitalSystem } from '../types';
import { motion, useMotionValue } from 'motion/react';

interface MapModalProps {
    isOpen: boolean;
    onClose: () => void;
    systems: OrbitalSystem[];
    isAdmin: boolean;
    onSaveCoordinates: (systemId: string, x: number, y: number) => void;
    onOpenSystemImages: (imageUrls: string[]) => void;
    onExport?: () => void;
}

export const MapModal: React.FC<MapModalProps> = React.memo(({
    isOpen,
    onClose,
    systems,
    isAdmin,
    onSaveCoordinates,
    onOpenSystemImages,
    onExport
}) => {
    // Motion values for performant updates
    const scale = useMotionValue(0.5);
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [selectedSystemToPlace, setSelectedSystemToPlace] = useState<string | null>(null);
    const [isMapLoading, setIsMapLoading] = useState(true);

    const containerRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);

    // Refs for gesture handling
    const evCache = useRef<Map<number, { x: number, y: number }>>(new Map());
    const prevDiff = useRef<number>(-1);

    const getClampedPan = useCallback((panX: number, panY: number, currentScale: number) => {
        if (!containerRef.current || !imageRef.current) return { x: panX, y: panY };

        const containerRect = containerRef.current.getBoundingClientRect();
        const imgW = imageRef.current.offsetWidth;
        const imgH = imageRef.current.offsetHeight;

        if (!imgW || !imgH) return { x: panX, y: panY };

        const contW = containerRect.width;
        const contH = containerRect.height;

        const scaledW = imgW * currentScale;
        const scaledH = imgH * currentScale;

        let newX = panX;
        let newY = panY;

        if (scaledW < contW) {
            newX = (contW - scaledW) / 2;
        } else {
            const minX = contW - scaledW;
            const maxX = 0;
            newX = Math.min(Math.max(panX, minX), maxX);
        }

        if (scaledH < contH) {
            newY = (contH - scaledH) / 2;
        } else {
            const minY = contH - scaledH;
            const maxY = 0;
            newY = Math.min(Math.max(panY, minY), maxY);
        }

        return { x: newX, y: newY };
    }, []);

    useEffect(() => {
        if (isOpen) {
            scale.set(0.5);
            x.set(0);
            y.set(0);
            setSelectedSystemToPlace(null);

            // Initial clamp after a short delay to ensure layout is ready
            setTimeout(() => {
                const clamped = getClampedPan(0, 0, 0.5);
                x.set(clamped.x);
                y.set(clamped.y);
            }, 100);
        }
    }, [isOpen, getClampedPan, scale, x, y]);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        const currentScale = scale.get();
        const currentX = x.get();
        const currentY = y.get();

        const delta = e.deltaY * -0.001;
        const newScale = Math.min(Math.max(0.2, currentScale + delta), 4);

        // Adjust pan to zoom towards mouse cursor
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const scaleRatio = newScale / currentScale;

            const rawX = mouseX - (mouseX - currentX) * scaleRatio;
            const rawY = mouseY - (mouseY - currentY) * scaleRatio;

            const clamped = getClampedPan(rawX, rawY, newScale);
            x.set(clamped.x);
            y.set(clamped.y);
        }

        scale.set(newScale);
    }, [scale, x, y, getClampedPan]);

    const handlePointerDown = (e: React.PointerEvent) => {
        // Don't drag if clicking buttons or pin elements
        if ((e.target as HTMLElement).closest('button, [data-pin]')) return;

        // Allow touch (button 0) and left click (button 0)
        if (e.pointerType === 'mouse' && e.button !== 0) return;

        e.currentTarget.setPointerCapture(e.pointerId);
        evCache.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (evCache.current.size === 1) {
            setIsDragging(true);
            setDragStart({ x: e.clientX - x.get(), y: e.clientY - y.get() });
        } else if (evCache.current.size === 2) {
            setIsDragging(false);
            prevDiff.current = -1;
        }
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (evCache.current.has(e.pointerId)) {
            evCache.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        }

        if (evCache.current.size === 2) {
            const points = Array.from(evCache.current.values()) as { x: number; y: number }[];
            const curDiff = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);

            if (prevDiff.current > 0) {
                const curScale = scale.get();
                const curX = x.get();
                const curY = y.get();

                // Use multiplicative zoom for more natural feel
                const ratio = curDiff / prevDiff.current;
                const newScale = Math.min(Math.max(0.2, curScale * ratio), 4);

                if (newScale !== curScale && containerRef.current) {
                    const effectiveRatio = newScale / curScale;
                    const rect = containerRef.current.getBoundingClientRect();

                    // Calculate midpoint relative to container
                    const midX = ((points[0].x + points[1].x) / 2) - rect.left;
                    const midY = ((points[0].y + points[1].y) / 2) - rect.top;

                    const rawX = midX - (midX - curX) * effectiveRatio;
                    const rawY = midY - (midY - curY) * effectiveRatio;

                    const clamped = getClampedPan(rawX, rawY, newScale);

                    x.set(clamped.x);
                    y.set(clamped.y);
                    scale.set(newScale);
                }
            }
            prevDiff.current = curDiff;
        } else if (evCache.current.size === 1 && isDragging) {
            const newX = e.clientX - dragStart.x;
            const newY = e.clientY - dragStart.y;
            const clamped = getClampedPan(newX, newY, scale.get());
            x.set(clamped.x);
            y.set(clamped.y);
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        evCache.current.delete(e.pointerId);
        e.currentTarget.releasePointerCapture(e.pointerId);

        if (evCache.current.size < 2) {
            prevDiff.current = -1;
        }

        if (evCache.current.size === 1) {
            const remaining = evCache.current.values().next().value as { x: number; y: number };
            setDragStart({ x: remaining.x - x.get(), y: remaining.y - y.get() });
            setIsDragging(true);
        } else {
            setIsDragging(false);
        }
    };

    const handleConfirmPlacement = () => {
        if (selectedSystemToPlace && imageRef.current && containerRef.current) {
            const containerRect = containerRef.current.getBoundingClientRect();
            const imageRect = imageRef.current.getBoundingClientRect();

            // Calculate center of the container in viewport coordinates
            const centerX = containerRect.left + containerRect.width / 2;
            const centerY = containerRect.top + containerRect.height / 2;

            // Calculate relative position on the image
            const imageX = ((centerX - imageRect.left) / imageRect.width) * 100;
            const imageY = ((centerY - imageRect.top) / imageRect.height) * 100;

            onSaveCoordinates(selectedSystemToPlace, imageX, imageY);
            setSelectedSystemToPlace(null);
        }
    };

    const zoomIn = () => {
        const currentScale = scale.get();
        const newScale = Math.min(currentScale + 0.5, 4);
        scale.set(newScale);
        const clamped = getClampedPan(x.get(), y.get(), newScale);
        x.set(clamped.x);
        y.set(clamped.y);
    };

    const zoomOut = () => {
        const currentScale = scale.get();
        const newScale = Math.max(currentScale - 0.5, 0.2);
        scale.set(newScale);
        const clamped = getClampedPan(x.get(), y.get(), newScale);
        x.set(clamped.x);
        y.set(clamped.y);
    };

    const resetMap = () => {
        scale.set(0.5);
        const clamped = getClampedPan(0, 0, 0.5);
        x.set(clamped.x);
        y.set(clamped.y);
    };

    return (
        <div
            className={`fixed inset-0 z-[9990] bg-black/95 flex flex-col md:flex-row overflow-hidden font-sans transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
            style={{ display: isOpen ? 'flex' : 'none' }}
        >
            {/* Map Area */}
            <div
                ref={containerRef}
                className={`relative flex-1 overflow-hidden ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                onWheel={handleWheel}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                style={{ touchAction: 'none' }}
            >
                <motion.div
                    className="absolute origin-top-left w-max h-max"
                    style={{ x, y, scale }}
                >
                    {isMapLoading && (
                        <div className="absolute inset-0 flex items-center justify-center z-50 min-w-[300px] min-h-[300px]">
                            <div className="flex flex-col items-center gap-3">
                                <div className="w-12 h-12 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin"></div>
                                <span className="text-white/70 text-sm font-medium">Carregando mapa...</span>
                            </div>
                        </div>
                    )}
                    <img
                        ref={imageRef}
                        src="https://i.ibb.co/fzpVkfb1/Layout-1-page-0001.jpg"
                        alt="Layout Map"
                        className={`max-w-none pointer-events-none select-none transition-opacity duration-300 ${isMapLoading ? 'opacity-0' : 'opacity-100'}`}
                        draggable={false}
                        decoding="async"
                        onLoad={() => {
                            setIsMapLoading(false);
                            const clamped = getClampedPan(x.get(), y.get(), scale.get());
                            x.set(clamped.x);
                            y.set(clamped.y);
                        }}
                    />

                    {/* Render Pins */}
                    {systems.map(system => {
                        if (system.mapCoordinates) {
                            return (
                                <div
                                    key={system.id}
                                    data-pin="true"
                                    className="absolute -translate-x-1/2 -translate-y-1/2 z-10 cursor-pointer group"
                                    style={{
                                        left: `${system.mapCoordinates.x}%`,
                                        top: `${system.mapCoordinates.y}%`
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onOpenSystemImages(system.modalUrls);
                                    }}
                                >
                                    {/* Pulse Effect */}
                                    <div className="absolute inset-0 -m-2 rounded-full bg-purple-500/30 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite]"></div>

                                    {/* Static Glow */}
                                    <div className="absolute inset-0 rounded-full bg-purple-500/40 blur-md"></div>

                                    {/* Spinning Tech Rings */}
                                    <div className="absolute inset-0 -m-1 md:-m-1.5 rounded-full border border-dashed border-purple-400/80 animate-[spin_10s_linear_infinite] pointer-events-none"></div>
                                    <div className="absolute inset-0 -m-2 md:-m-3 rounded-full border border-dotted border-purple-300/50 animate-[spin_15s_linear_infinite_reverse] pointer-events-none"></div>

                                    {/* Main Orb */}
                                    <div className="relative w-12 h-12 md:w-16 md:h-16 rounded-full border-2 border-purple-300 shadow-[0_0_20px_rgba(168,85,247,0.8)] bg-black overflow-hidden group-hover:scale-110 transition-transform duration-300 ease-out z-10">
                                        <img src={system.iconUrl} alt={system.name} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
                                    </div>

                                    {/* Hover Tooltip */}
                                    <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-slate-900/95 border border-purple-500/50 text-purple-100 text-xs font-bold rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-[0_4px_15px_rgba(0,0,0,0.5)] z-20 hidden md:block backdrop-blur-sm">
                                        {system.name}
                                    </div>
                                </div>
                            );
                        }
                        return null;
                    })}
                </motion.div>

                {/* Center Crosshair for Placement */}
                {selectedSystemToPlace && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20 flex flex-col items-center justify-center">
                        <div className="w-8 h-8 border-2 border-cyan-400 rounded-full flex items-center justify-center relative shadow-[0_0_15px_rgba(34,211,238,0.6)] bg-cyan-400/10">
                            <div className="w-1 h-1 bg-cyan-400 rounded-full"></div>
                            {/* Crosshair lines */}
                            <div className="absolute top-0 bottom-0 left-1/2 w-[2px] -translate-x-1/2 bg-cyan-400/50"></div>
                            <div className="absolute left-0 right-0 top-1/2 h-[2px] -translate-y-1/2 bg-cyan-400/50"></div>
                        </div>
                    </div>
                )}

                {/* Placement Controls */}
                {selectedSystemToPlace && (
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3 z-30">
                        <button
                            onClick={() => setSelectedSystemToPlace(null)}
                            className="px-4 py-3 bg-slate-800 text-white font-bold rounded-full border border-slate-600 shadow-lg"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleConfirmPlacement}
                            className="px-6 py-3 bg-cyan-600 text-white font-bold rounded-full border border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.4)]"
                        >
                            Confirmar Posição
                        </button>
                    </div>
                )}
            </div>

            {/* Admin Sidebar */}
            {isAdmin && (
                <div className="w-full h-1/3 md:w-80 md:h-full bg-slate-900 border-t md:border-t-0 md:border-l border-white/10 flex flex-col z-20 shadow-2xl">
                    <div className="p-3 md:p-4 border-b border-white/10 bg-slate-800 flex-shrink-0">
                        <div className="flex justify-between items-center">
                            <h2 className="text-white font-bold text-base md:text-lg">Posicionar Orbes</h2>
                            {onExport && (
                                <button
                                    onClick={onExport}
                                    className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-500 transition-colors"
                                    title="Exportar dados para JSON"
                                >
                                    Exportar
                                </button>
                            )}
                        </div>
                        <p className="text-slate-400 text-xs md:text-sm mt-1">
                            {selectedSystemToPlace
                                ? "Arraste o mapa para centralizar o alvo e confirme."
                                : "Selecione um sistema abaixo para posicioná-lo."}
                        </p>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {systems.map(system => (
                            <div
                                key={system.id}
                                className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors border ${selectedSystemToPlace === system.id
                                    ? 'bg-cyan-500/20 border-cyan-400'
                                    : system.mapCoordinates
                                        ? 'bg-slate-800 border-white/10 hover:bg-slate-700'
                                        : 'bg-slate-800/50 border-dashed border-white/20 hover:bg-slate-700'
                                    }`}
                                onClick={() => setSelectedSystemToPlace(system.id === selectedSystemToPlace ? null : system.id)}
                            >
                                <img src={system.iconUrl} alt="" className="w-8 h-8 rounded-full object-cover border border-white/20" />
                                <div className="flex-1 min-w-0">
                                    <div className="text-white text-sm font-medium truncate">{system.name}</div>
                                    <div className="text-xs text-slate-400">
                                        {system.mapCoordinates ? 'Posicionado' : 'Não posicionado'}
                                    </div>
                                </div>
                                {system.mapCoordinates && (
                                    <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]"></div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Close Button */}
            <button
                onClick={onClose}
                className="absolute top-4 right-4 w-12 h-12 bg-black/60 text-white border border-white/30 rounded-full grid place-items-center text-xl z-30 hover:bg-white/20 transition-colors"
            >
                ✕
            </button>

            {/* Zoom Controls */}
            <div className={`absolute right-4 hidden md:flex flex-col gap-2 z-30 ${isAdmin ? 'bottom-[35%] md:bottom-6' : 'bottom-6'}`}>
                <button onClick={zoomIn} className="w-10 h-10 bg-black/80 text-white rounded-full border border-white/20 hover:bg-white/20 flex items-center justify-center text-xl">+</button>
                <button onClick={zoomOut} className="w-10 h-10 bg-black/80 text-white rounded-full border border-white/20 hover:bg-white/20 flex items-center justify-center text-xl">-</button>
                <button onClick={resetMap} className="w-10 h-10 bg-black/80 text-white rounded-full border border-white/20 hover:bg-white/20 text-xs flex items-center justify-center">Reset</button>
            </div>
        </div>
    );
});
