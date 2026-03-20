import React, { useEffect, useRef, useCallback, useState } from 'react';
import { OrbitalSystem, LocationData } from '../types';

interface RailwayMapModalProps {
    isOpen: boolean;
    systems: OrbitalSystem[];
    userLocation: LocationData | null;
    activeTourSystemId?: string | null;
    onClose: () => void;
}

// Converts GPS coordinates to canvas (x, y) based on bounding box
function gpsToCanvas(
    lat: number,
    lon: number,
    bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number },
    canvasW: number,
    canvasH: number,
    padding: number
): { x: number; y: number } {
    const usableW = canvasW - padding * 2;
    const usableH = canvasH - padding * 2;
    const x = padding + ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon || 1)) * usableW;
    const y = padding + (1 - (lat - bounds.minLat) / (bounds.maxLat - bounds.minLat || 1)) * usableH;
    return { x, y };
}

function getAllPoints(systems: OrbitalSystem[]): LocationData[] {
    const pts: LocationData[] = [];
    systems.forEach(s => {
        if (s.path && s.path.length > 0) {
            pts.push(...s.path);
        } else if (s.locationData) {
            pts.push(s.locationData);
        }
    });
    return pts;
}

function getBounds(points: LocationData[]) {
    if (points.length === 0) return { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 };
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    points.forEach(p => {
        if (p.latitude < minLat) minLat = p.latitude;
        if (p.latitude > maxLat) maxLat = p.latitude;
        if (p.longitude < minLon) minLon = p.longitude;
        if (p.longitude > maxLon) maxLon = p.longitude;
    });
    // Small buffer so lines don't touch edges
    const latBuffer = (maxLat - minLat) * 0.12 || 0.0003;
    const lonBuffer = (maxLon - minLon) * 0.12 || 0.0003;
    return {
        minLat: minLat - latBuffer,
        maxLat: maxLat + latBuffer,
        minLon: minLon - lonBuffer,
        maxLon: maxLon + lonBuffer,
    };
}

// Color palette for different railway lines
const LINE_COLORS = [
    '#3b82f6', // blue
    '#f59e0b', // amber
    '#10b981', // emerald
    '#f43f5e', // rose
    '#a78bfa', // violet
    '#06b6d4', // cyan
    '#fb923c', // orange
    '#84cc16', // lime
];

export const RailwayMapModal: React.FC<RailwayMapModalProps> = ({
    isOpen,
    systems,
    userLocation,
    activeTourSystemId,
    onClose,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animRef = useRef<number>(0);
    const [isRendered, setIsRendered] = useState(false);
    const [isVisible, setIsVisible] = useState(false);

    // Zoom/pan state
    const scaleRef = useRef(1);
    const offsetRef = useRef({ x: 0, y: 0 });
    const isDraggingRef = useRef(false);
    const lastPointerRef = useRef({ x: 0, y: 0 });

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const W = canvas.width;
        const H = canvas.height;
        const PADDING = 48;

        // Background
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#0a0a12';
        ctx.fillRect(0, 0, W, H);

        // Draw grid
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;
        const gridSize = 60;
        for (let x = 0; x < W; x += gridSize) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
        for (let y = 0; y < H; y += gridSize) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

        const allPoints = getAllPoints(systems);
        if (allPoints.length === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.font = '16px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Nenhuma linha mapeada ainda.', W / 2, H / 2);
            ctx.fillText('Use o Admin Panel para gravar caminhos.', W / 2, H / 2 + 28);
            return;
        }

        // Include user location in bounds if present
        const boundsPoints = userLocation ? [...allPoints, userLocation] : allPoints;
        const bounds = getBounds(boundsPoints);

        ctx.save();
        ctx.translate(offsetRef.current.x, offsetRef.current.y);
        ctx.scale(scaleRef.current, scaleRef.current);

        // Draw each system
        systems.forEach((system, idx) => {
            const color = system.id === activeTourSystemId
                ? '#60a5fa'
                : LINE_COLORS[idx % LINE_COLORS.length];

            const isActive = system.id === activeTourSystemId;

            if (system.path && system.path.length > 1) {
                // Draw track line
                ctx.beginPath();
                ctx.strokeStyle = color;
                ctx.lineWidth = isActive ? 5 : 3;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';

                if (isActive) {
                    // Glow effect for active tour line
                    ctx.shadowColor = color;
                    ctx.shadowBlur = 16;
                }

                system.path.forEach((pt, i) => {
                    const { x, y } = gpsToCanvas(pt.latitude, pt.longitude, bounds, W, H, PADDING);
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                });
                ctx.stroke();
                ctx.shadowBlur = 0;

                // Draw start/end dots
                const start = gpsToCanvas(system.path[0].latitude, system.path[0].longitude, bounds, W, H, PADDING);
                const end = gpsToCanvas(system.path[system.path.length - 1].latitude, system.path[system.path.length - 1].longitude, bounds, W, H, PADDING);

                [start, end].forEach(pt => {
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
                    ctx.fillStyle = color;
                    ctx.fill();
                    ctx.strokeStyle = '#1e1e2a';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                });

                // System name label (midpoint of path)
                const mid = system.path[Math.floor(system.path.length / 2)];
                const midPt = gpsToCanvas(mid.latitude, mid.longitude, bounds, W, H, PADDING);
                ctx.fillStyle = color;
                ctx.font = `bold ${isActive ? 13 : 11}px Inter, sans-serif`;
                ctx.textAlign = 'center';
                ctx.shadowColor = 'rgba(0,0,0,0.8)';
                ctx.shadowBlur = 6;
                ctx.fillText(system.name, midPt.x, midPt.y - 12);
                ctx.shadowBlur = 0;

            } else if (system.locationData) {
                // Single point
                const pt = gpsToCanvas(system.locationData.latitude, system.locationData.longitude, bounds, W, H, PADDING);
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, isActive ? 10 : 7, 0, Math.PI * 2);
                ctx.fillStyle = color;
                if (isActive) { ctx.shadowColor = color; ctx.shadowBlur = 16; }
                ctx.fill();
                ctx.shadowBlur = 0;
                ctx.strokeStyle = '#1e1e2a';
                ctx.lineWidth = 2;
                ctx.stroke();

                ctx.fillStyle = color;
                ctx.font = `bold 11px Inter, sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillText(system.name, pt.x, pt.y - 14);
            }
        });

        // Draw user location
        if (userLocation) {
            const { x, y } = gpsToCanvas(userLocation.latitude, userLocation.longitude, bounds, W, H, PADDING);

            // Accuracy ring
            if (userLocation.accuracy && userLocation.accuracy > 0) {
                const metersPerDeg = 111000;
                const latRange = bounds.maxLat - bounds.minLat;
                const pxPerMeter = ((H - PADDING * 2) / latRange) / metersPerDeg;
                const accuracyR = userLocation.accuracy * pxPerMeter;
                ctx.beginPath();
                ctx.arc(x, y, accuracyR, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(96,165,250,0.12)';
                ctx.fill();
                ctx.strokeStyle = 'rgba(96,165,250,0.3)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            // Pulse ring
            ctx.beginPath();
            ctx.arc(x, y, 18, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(96,165,250,0.2)';
            ctx.fill();

            // User dot
            ctx.beginPath();
            ctx.arc(x, y, 10, 0, Math.PI * 2);
            ctx.fillStyle = '#3b82f6';
            ctx.shadowColor = '#3b82f6';
            ctx.shadowBlur = 20;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2.5;
            ctx.stroke();

            // Arrow inside dot (north-pointing)
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('▲', x, y);
            ctx.textBaseline = 'alphabetic';
        }

        ctx.restore();
    }, [systems, userLocation, activeTourSystemId]);

    // Animation loop
    useEffect(() => {
        if (!isOpen) return;
        const loop = () => {
            draw();
            animRef.current = requestAnimationFrame(loop);
        };
        animRef.current = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(animRef.current);
    }, [isOpen, draw]);

    // Resize canvas to fit container
    useEffect(() => {
        if (!isOpen) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const resize = () => {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
        };
        resize();
        window.addEventListener('resize', resize);
        return () => window.removeEventListener('resize', resize);
    }, [isOpen]);

    // Open/close animation
    useEffect(() => {
        if (isOpen) {
            setIsRendered(true);
            requestAnimationFrame(() => requestAnimationFrame(() => setIsVisible(true)));
        } else {
            setIsVisible(false);
            const t = setTimeout(() => setIsRendered(false), 300);
            return () => clearTimeout(t);
        }
    }, [isOpen]);

    // Center/fit (reset zoom on initial open)
    useEffect(() => {
        if (isOpen) {
            scaleRef.current = 1;
            offsetRef.current = { x: 0, y: 0 };
        }
    }, [isOpen]);

    // Mouse / touch pan
    const onPointerDown = (e: React.PointerEvent) => {
        isDraggingRef.current = true;
        lastPointerRef.current = { x: e.clientX, y: e.clientY };
        (e.target as Element).setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: React.PointerEvent) => {
        if (!isDraggingRef.current) return;
        const dx = e.clientX - lastPointerRef.current.x;
        const dy = e.clientY - lastPointerRef.current.y;
        offsetRef.current = { x: offsetRef.current.x + dx, y: offsetRef.current.y + dy };
        lastPointerRef.current = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = () => { isDraggingRef.current = false; };

    // Wheel zoom
    const onWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.12 : 0.88;
        scaleRef.current = Math.max(0.5, Math.min(10, scaleRef.current * factor));
    };

    if (!isRendered) return null;

    return (
        <div
            className={`fixed inset-0 z-[9000] flex flex-col transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
            style={{ background: '#0a0a12' }}
        >
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#0d0d1a]/80 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                    <span className="text-white font-bold tracking-widest text-sm uppercase">Mapa dos Trilhos</span>
                    {userLocation && (
                        <span className="text-xs text-blue-400 font-mono bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/30">
                            GPS ativo
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => { scaleRef.current = 1; offsetRef.current = { x: 0, y: 0 }; }}
                        className="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-md border border-white/10 hover:border-white/30 transition-all"
                    >
                        Centralizar
                    </button>
                    <button
                        onClick={onClose}
                        className="px-4 py-1.5 bg-red-600/80 hover:bg-red-500 text-white text-sm rounded-lg font-bold border border-red-400 transition-all"
                    >
                        Fechar
                    </button>
                </div>
            </div>

            {/* Legend */}
            <div className="shrink-0 flex flex-wrap gap-2 px-4 py-2 border-b border-white/5 bg-[#0d0d1a]/60">
                {systems.filter(s => s.path?.length || s.locationData).map((system, idx) => (
                    <div key={system.id} className="flex items-center gap-1.5">
                        <div
                            className="w-4 h-1.5 rounded-full"
                            style={{ background: system.id === activeTourSystemId ? '#60a5fa' : LINE_COLORS[idx % LINE_COLORS.length] }}
                        />
                        <span className="text-xs text-gray-400 max-w-[100px] truncate">{system.name}</span>
                    </div>
                ))}
            </div>

            {/* Canvas */}
            <canvas
                ref={canvasRef}
                className="flex-1 w-full cursor-grab active:cursor-grabbing touch-none"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
                onWheel={onWheel}
            />

            {/* Bottom info */}
            <div className="shrink-0 flex items-center justify-between px-4 py-2 border-t border-white/5 bg-[#0d0d1a]/60 text-xs text-gray-500">
                <span>🖱️ Arraste para mover · Scroll para zoom</span>
                {userLocation && (
                    <span className="font-mono">
                        {userLocation.latitude.toFixed(6)}, {userLocation.longitude.toFixed(6)}
                        {userLocation.accuracy ? ` · ±${Math.round(userLocation.accuracy)}m` : ''}
                    </span>
                )}
            </div>
        </div>
    );
};
