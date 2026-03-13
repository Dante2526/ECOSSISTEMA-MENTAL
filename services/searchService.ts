
import { OrbitalSystem, SearchItem } from '../types';

export function normalizeText(text: string | null | undefined): string {
    if (!text) return '';
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/<br>/g, '') // remove html tags from satellite names
        .replace(/[^a-z0-9]/g, ''); // remove all non-alphanumeric chars
}

export function applyPhoneticCorrections(transcript: string): string {
    let corrected = transcript.toLowerCase()
        .replace(/[,.]/g, ' ') // Remove vírgulas e pontos das alucinações
        .replace(/\s+/g, ' ')
        .trim();
    
    // Mapeamento de números por extenso para dígitos (comum no Whisper)
    const numberMap: { [key: string]: string } = {
        'um': '1', 'dois': '2', 'tres': '3', 'quatro': '4', 'cinco': '5',
        'seis': '6', 'sete': '7', 'oito': '8', 'nove': '9', 'zero': '0',
        'duzentos e um': '201', 'duzentos e dois': '202'
    };

    Object.keys(numberMap).forEach(key => {
        const regex = new RegExp(`\\b${key}\\b`, 'g');
        corrected = corrected.replace(regex, numberMap[key]);
    });

    // Correções fonéticas específicas
    corrected = corrected.replace(/\bpiau\b/g, 'pial');
    corrected = corrected.replace(/\bpiaui\b/g, 'pial');
    corrected = corrected.replace(/\btrangulo\b/g, 'triangulo');

    return corrected;
}

export function buildSearchCache(systems: OrbitalSystem[]): SearchItem[] {
    const cache: SearchItem[] = [];
    systems.forEach(system => {
        // Use the full, less-normalized text for fulltext search to allow multi-word matching
        const fullSystemName = system.name
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/<br>/g, ' ');
            
        cache.push({
            systemId: system.id,
            text: fullSystemName,
            imageUrls: system.modalUrls,
            type: 'fulltext'
        });
        
        system.satellites.forEach(satellite => {
            const satelliteName = normalizeText(satellite.name);
            if (satelliteName) {
                cache.push({
                    systemId: system.id,
                    text: satelliteName,
                    imageUrls: system.modalUrls,
                    type: 'keyword'
                });
            }
        });
    });
    return cache;
}


// Helper function to return unique results based on systemId
function getUniqueResults(items: SearchItem[]): SearchItem[] {
    const uniqueSystems = new Map<string, SearchItem>();
    items.forEach(item => {
        if (!uniqueSystems.has(item.systemId)) {
            uniqueSystems.set(item.systemId, item);
        }
    });
    return Array.from(uniqueSystems.values());
}

export function findMatchingItems(transcript: string, cache: SearchItem[]): SearchItem[] {
    // --- Phonetic/Correction Layer ---
    // Corrects common speech-to-text errors before normalization
    const correctedTranscript = applyPhoneticCorrections(transcript);

    const searchTerm = normalizeText(correctedTranscript);
    if (!searchTerm) return [];

    // --- Tier 1: Exact Keyword Match (Highest Priority) ---
    // This is for exact satellite codes like "201a".
    const exactKeywordMatches = cache.filter(item =>
        item.type === 'keyword' && item.text === searchTerm
    );

    if (exactKeywordMatches.length > 0) {
        // If we find an exact match for a satellite code, we trust it completely
        // and don't need to look for other, less precise matches.
        return getUniqueResults(exactKeywordMatches);
    }

    // --- Tier 2: Full Text Search (for system names) ---
    // This is for searches like "oficina central" or "pial".
    // We search using the corrected transcript (but un-normalized for spaces) to allow partial matches
    const fullTextMatches = cache.filter(item =>
        item.type === 'fulltext' && item.text.includes(correctedTranscript.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
    );

    // --- Tier 3: Flexible Multi-word Search (Fallback) ---
    const ignoreWords = ['de', 'da', 'do', 'em', 'no', 'na', 'por', 'para', 'o', 'a', 'os', 'as', 'um', 'uma', 'linhas', 'linha', 'dos'];
    
    // Correctly split transcript into words using the corrected version
    const searchKeywords = correctedTranscript
        .split(/\s+/) // Split by spaces
        .map(k => normalizeText(k)) // Normalize each word individually
        .filter(k => k && k.length > 0 && !ignoreWords.includes(k));

    let flexibleMatches: SearchItem[] = [];
    if (searchKeywords.length > 0) {
        flexibleMatches = cache.filter(item => {
            // All keywords must be present in the item's text for it to be a match.
            const itemTextForFlex = item.type === 'fulltext' ? item.text : normalizeText(item.text);
            return searchKeywords.every(keyword => itemTextForFlex.includes(keyword));
        });
    }

    // Combine results from Tier 2 and Tier 3, as they can overlap in relevance
    const combinedResults = [...fullTextMatches, ...flexibleMatches];

    return getUniqueResults(combinedResults);
}
