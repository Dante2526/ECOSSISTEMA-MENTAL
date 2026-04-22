
import { useState, useCallback, useRef, useEffect } from 'react';
import { LocationData, OrbitalSystem } from '../types';

export function useGeolocation() {
    const [isLocating, setIsLocating] = useState(false);
    const [isWatching, setIsWatching] = useState(false);
    const [lastLocation, setLastLocation] = useState<LocationData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const watchId = useRef<number | null>(null);

    const stopWatching = useCallback(() => {
        if (watchId.current !== null) {
            navigator.geolocation.clearWatch(watchId.current);
            watchId.current = null;
            setIsWatching(false);
            console.log("📡 GPS: Monitoramento parado.");
        }
    }, []);

    const startWatching = useCallback((highAccuracy: boolean = true) => {
        if (!navigator.geolocation) return;
        
        stopWatching();
        setIsWatching(true);
        console.log("📡 GPS: Iniciando monitoramento contínuo (Quente)...");

        watchId.current = navigator.geolocation.watchPosition(
            (position) => {
                const data: LocationData = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    altitude: position.coords.altitude,
                    accuracy: position.coords.accuracy,
                    timestamp: position.timestamp
                };
                setLastLocation(data);
                setError(null);
                // console.log(`📡 GPS Quente: Accuracy=${data.accuracy}m`);
            },
            (err) => {
                console.error("📡 GPS Watch Error:", err);
                setError("Erro no monitoramento contínuo.");
            },
            {
                enableHighAccuracy: highAccuracy,
                timeout: 15000,
                maximumAge: 0
            }
        );
    }, [stopWatching]);

    // Limpeza automática ao desmontar
    useEffect(() => {
        return () => stopWatching();
    }, [stopWatching]);

    const getCurrentPosition = useCallback((): Promise<LocationData> => {
        setIsLocating(true);
        setError(null);

        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                const err = "Geolocalização não é suportada pelo seu navegador.";
                setError(err);
                setIsLocating(false);
                reject(err);
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const data: LocationData = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        altitude: position.coords.altitude,
                        accuracy: position.coords.accuracy,
                        timestamp: position.timestamp
                    };
                    setIsLocating(false);
                    setLastLocation(data);
                    resolve(data);
                },
                (err) => {
                    let msg = "Erro ao capturar localização.";
                    if (err.code === 1) msg = "Permissão de GPS negada.";
                    else if (err.code === 2) msg = "Sinal de GPS indisponível.";
                    else if (err.code === 3) msg = "Tempo esgotado ao buscar GPS.";
                    
                    setError(msg);
                    setIsLocating(false);
                    reject(msg);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        });
    }, []);

    const getStablePosition = useCallback(async (samples: number = 5): Promise<LocationData> => {
        setIsLocating(true);
        setError(null);

        const posSamples: LocationData[] = [];
        
        // Se já estamos assistindo, usamos a última localização como primeira amostra
        if (lastLocation) posSamples.push(lastLocation);
        
        for (let i = 0; i < samples; i++) {
            try {
                const pos = await getCurrentPosition();
                posSamples.push(pos);
                await new Promise(r => setTimeout(r, 500));
            } catch (e) {
                console.warn(`Amostra ${i+1} falhou, continuando...`);
            }
        }

        setIsLocating(false);

        if (posSamples.length === 0) {
            throw new Error("Não foi possível obter nenhuma amostra de GPS estável.");
        }

        return posSamples.reduce((best, current) => {
            if (!best.accuracy) return current;
            if (!current.accuracy) return best;
            return current.accuracy < best.accuracy ? current : best;
        });
    }, [getCurrentPosition, lastLocation]);

    const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
        const R = 6371e3; 
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    };

    /**
     * Calcula a distância mínima de um ponto a um segmento de reta (A-B)
     * usando uma aproximação planar para pequenas distâncias.
     */
    const distanceToSegment = (p: LocationData, a: LocationData, b: LocationData): number => {
        const R = 6371e3;
        const toRad = Math.PI / 180;
        
        // Converte para coordenadas planas locais (metros) centradas em A
        const latRef = a.latitude * toRad;
        const xA = 0;
        const yA = 0;
        const xB = (b.longitude - a.longitude) * toRad * Math.cos(latRef) * R;
        const yB = (b.latitude - a.latitude) * toRad * R;
        const xP = (p.longitude - a.longitude) * toRad * Math.cos(latRef) * R;
        const yP = (p.latitude - a.latitude) * toRad * R;

        const l2 = xB * xB + yB * yB;
        if (l2 === 0) return Math.sqrt(xP * xP + yP * yP);
        
        // Projeção do ponto P na reta AB
        let t = ((xP - xA) * (xB - xA) + (yP - yA) * (yB - yA)) / l2;
        t = Math.max(0, Math.min(1, t));
        
        const projX = xA + t * (xB - xA);
        const projY = yA + t * (yB - yA);
        
        return Math.sqrt((xP - projX) ** 2 + (yP - projY) ** 2);
    };

    const calculateDistanceToPath = useCallback((currentLoc: LocationData, path: LocationData[]): number => {
        if (path.length === 0) return Infinity;
        if (path.length === 1) return calculateDistance(currentLoc.latitude, currentLoc.longitude, path[0].latitude, path[0].longitude);

        let minDistance = Infinity;
        for (let i = 0; i < path.length - 1; i++) {
            const dist = distanceToSegment(currentLoc, path[i], path[i + 1]);
            if (dist < minDistance) minDistance = dist;
        }
        return minDistance;
    }, []);

    const findNearestSystem = useCallback((currentLoc: LocationData, systems: OrbitalSystem[], maxDistance: number = 20) => {
        const matches: { system: OrbitalSystem; distance: number }[] = [];

        systems.forEach(system => {
            let dist = Infinity;

            // 1. Tenta por caminho (path) primeiro
            if (system.path && system.path.length > 0) {
                dist = calculateDistanceToPath(currentLoc, system.path);
            } 
            // 2. Se não tem caminho, tenta por ponto único (locationData)
            else if (system.locationData) {
                dist = calculateDistance(
                    currentLoc.latitude,
                    currentLoc.longitude,
                    system.locationData.latitude,
                    system.locationData.longitude
                );
            }

            if (dist <= maxDistance) {
                matches.push({ system, distance: dist });
            }
        });

        if (matches.length === 0) return null;

        // Ordena por proximidade absoluta
        matches.sort((a, b) => a.distance - b.distance);

        return {
            nearest: matches[0],
            others: matches.slice(1),
            // Se a segunda linha mais próxima estiver a menos de 4 metros de diferença da primeira,
            // marcamos como "baixa confiança" (ambiguidade lateral)
            lowConfidence: matches.length > 1 && (matches[1].distance - matches[0].distance) < 4
        };
    }, [calculateDistanceToPath]);

    return {
        isLocating,
        isWatching,
        lastLocation,
        error,
        startWatching,
        stopWatching,
        getCurrentPosition,
        getStablePosition,
        findNearestSystem
    };
}
