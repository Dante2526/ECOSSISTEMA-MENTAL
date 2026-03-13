
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
    // Palavras de preenchimento (filler words) e comandos irrelevantes para ignorar
    const fillerWords = ['então', 'tipo', 'eh', 'ah', 'hmm', 'quero', 'procurar', 'ir', 'no', 'na', 'para', 'veja', 'mostre', 'me'];
    
    // Mapeamento de números por extenso para dígitos (comum no Whisper)
    const numberMap: { [key: string]: string } = {
        'um': '1', 'dois': '2', 'tres': '3', 'quatro': '4', 'cinco': '5',
        'seis': '6', 'sete': '7', 'oito': '8', 'nove': '9', 'zero': '0',
        'duzentos e um': '201', 'duzentos e dois': '202',
        'cento e cinquenta e um': '151', 'cento e cinquenta': '150',
        '150 y 50': '151', // Alucinação comum do Whisper para 151
        'tp dois b': 'tp2b', 'tp 2 b': 'tp2b', 'tp 02b': 'tp2b',
        'tp doisb': 'tp2b', 'tepe': 'tp', 'te pe': 'tp', 'tp2 b': 'tp2b',
        'tep dois b': 'tp2b', 'tepê': 'tp'
    };

    let corrected = transcript.toLowerCase()
        .replace(/[、,.]/g, ' ') // Remove vírgulas, pontos e separadores orientais
        .replace(/\by\b/g, ' e ') // Corrige "y" para "e" (espanholismo do Whisper)
        .replace(/\s+/g, ' ')
        .trim();

    // Remover filler words no início da frase
    fillerWords.forEach(word => {
        const regex = new RegExp(`^${word}\\s+`, 'i');
        corrected = corrected.replace(regex, '');
    });

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
    const correctedTranscript = applyPhoneticCorrections(transcript);

    // Tentativa 1: Busca Exata (Normalizada)
    const searchTerm = normalizeText(correctedTranscript);
    if (!searchTerm) return [];

    const exactMatches = cache.filter(item =>
        item.type === 'keyword' && item.text === searchTerm
    );

    if (exactMatches.length > 0) return getUniqueResults(exactMatches);

    // Tentativa 2: Extração de Números (Prioridade Segura para códigos)
    const numericMatch = correctedTranscript.match(/\d+/);
    if (numericMatch) {
        const extractedNumber = numericMatch[0];
        const numberMatches = cache.filter(item => 
            item.type === 'keyword' && item.text === extractedNumber
        );
        if (numberMatches.length > 0) return getUniqueResults(numberMatches);
    }

    // Tentativa 3: Busca por Substring no nome do sistema
    const normalizedNoAccents = correctedTranscript.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const fullTextMatches = cache.filter(item =>
        item.type === 'fulltext' && item.text.includes(normalizedNoAccents)
    );
    if (fullTextMatches.length > 0) return getUniqueResults(fullTextMatches);

    // Tentativa 4: Busca de Palavras-chave Individuais (Fuzzy Fallback)
    const ignoreWords = ['de', 'da', 'do', 'em', 'no', 'na', 'por', 'para', 'o', 'a', 'os', 'as', 'um', 'uma', 'linhas', 'linha', 'dos'];
    const searchKeywords = correctedTranscript
        .split(/\s+/)
        .map(k => normalizeText(k))
        .filter(k => k && k.length > 0 && !ignoreWords.includes(k));

    if (searchKeywords.length > 0) {
        const flexibleMatches = cache.filter(item => {
            const itemText = item.type === 'fulltext' ? item.text : normalizeText(item.text);
            return searchKeywords.every(keyword => itemText.includes(keyword));
        });
        if (flexibleMatches.length > 0) return getUniqueResults(flexibleMatches);
    }

    // Tentativa 5: Remoção total de espaços para códigos alfanuméricos (ex: "TP 2B", "Orbe 151")
    const compressedTerm = correctedTranscript.replace(/\s+/g, '').toLowerCase();
    const compressedMatches = cache.filter(item => {
        if (item.type !== 'keyword') return false;
        const normalizedItem = normalizeText(item.text);
        return normalizedItem === normalizeText(compressedTerm) || 
               compressedTerm.includes(normalizedItem);
    });

    return getUniqueResults(compressedMatches);
}
