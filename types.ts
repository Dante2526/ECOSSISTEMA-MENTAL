
export interface Satellite {
    name: string;
    style?: string;
}

export interface LocationData {
    latitude: number;
    longitude: number;
    altitude?: number | null;
    accuracy?: number;
    timestamp: number;
}

export interface OrbitalSystem {
    id: string;
    name: string;
    iconUrl: string;
    modalUrls: string[];
    satellites: Satellite[];
    mapCoordinates?: { x: number, y: number };
    locationData?: LocationData;
    path?: LocationData[];
}

export interface SearchItem {
    systemId: string;
    text: string;
    imageUrls: string[];
    type: 'fulltext' | 'keyword';
}

export interface TourStep {
    systemId: string;
}

export interface Tour {
    id: string;
    name: string;
    steps: TourStep[];
}

export interface OrbitalSystemRef {
    highlightSystemsByIds: (ids: string[]) => void;
    focusSystem: (id: string | null) => void;
}
