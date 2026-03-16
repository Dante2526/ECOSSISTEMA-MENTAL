
import { useState, useCallback } from 'react';
import { LocationData, OrbitalSystem } from '../types';

export function useGeolocation() {
    const [isLocating, setIsLocating] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
                        timestamp: position.timestamp
                    };
                    setIsLocating(false);
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

    // Cálculo Haversine para distância em metros
    const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
        const R = 6371e3; // Raio da Terra em metros
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

    const findNearestSystem = useCallback((currentLoc: LocationData, systems: OrbitalSystem[], maxDistance: number = 50) => {
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
        error,
        getCurrentPosition,
        findNearestSystem
    };
}
