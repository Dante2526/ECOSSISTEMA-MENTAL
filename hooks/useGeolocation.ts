
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

    const findNearestSystem = useCallback((currentLoc: LocationData, systems: OrbitalSystem[], maxDistance: number = 20) => {
        let nearest: { system: OrbitalSystem; distance: number } | null = null;

        systems.forEach(system => {
            if (system.locationData) {
                const dist = calculateDistance(
                    currentLoc.latitude,
                    currentLoc.longitude,
                    system.locationData.latitude,
                    system.locationData.longitude
                );

                if (dist <= maxDistance) {
                    if (!nearest || dist < nearest.distance) {
                        nearest = { system, distance: dist };
                    }
                }
            }
        });

        return nearest;
    }, []);

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
