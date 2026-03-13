
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
    const fillerWords = ['então', 'tipo', 'eh', 'ah', 'hmm', 'quero', 'procurar', 'ir', 'no', 'na', 'para', 'veja', 'mostre', 'me', 'por', 'favor', 'linhas', 'dos', 'das'];
    
    // Mapeamento exaustivo de números por extenso para dígitos
    const numberMap: { [key: string]: string } = {
        'um': '1', 'uma': '1', 'dois': '2', 'duas': '2', 'tres': '3', 'três': '3',
        'quatro': '4', 'cinco': '5', 'seis': '6', 'meia': '6', 'sete': '7',
        'oito': '8', 'nove': '9', 'dez': '10', 'onze': '11', 'doze': '12',
        'treze': '13', 'quatorze': '14', 'quinze': '15', 'dezesseis': '16',
        'dezessete': '17', 'dezoito': '18', 'dezenove': '19', 'vinte': '20',
        'trinta': '30', 'quarenta': '40', 'cinquenta': '50', 'sessenta': '60',
        'setenta': '70', 'oitenta': '80', 'noventa': '90', 'cem': '100',
        'cento': '100', 'duzentos': '200', 'trezentos': '300',
        'cento e cinquenta e um': '151', 'cento e cinquenta': '150',
        'duzentos e um': '201', 'duzentos e dois': '202',
        '150 y 50': '151', '150 e 50': '151', 'zero': '0', 'zero um': '01',
        'tp dois b': 'tp2b', 'tp 2 b': 'tp2b', 'tp 02b': 'tp2b',
        'tp doisb': 'tp2b', 'tepe': 'tp', 'te pe': 'tp', 'tp2 b': 'tp2b',
        'tep dois b': 'tp2b', 'tepê': 'tp', 'tp dois bê': 'tp2b',
        'tp zero um': 'tp01', 'tepe zero um': 'tp01', 'tepe 01': 'tp01',
        'cento e oitenta e sete': '187', 'oitenta e sete': '187', 'cento oitenta e sete': '187',
        '8 7': '187', '87': '187' // Pontes para quando o Whisper "come" o início de 187
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

    // Casos especiais para 151:
    // 1) Whisper repetindo "um, um, um, um..."
    const repeatedUmPattern = /^(um[, ]+){2,4}um\.?$/;
    if (repeatedUmPattern.test(corrected)) {
        corrected = '151';
    }
    // 2) Whisper devolvendo contagem "1, 2, 3, 4, 5, 1"
    //    (padrão observado ao pedir "linha 151")
    const countThenOnePattern = /^1(?:[, ]+2[, ]+3[, ]+4[, ]+5[, ]+1\.?)$/;
    if (countThenOnePattern.test(corrected)) {
        corrected = '151';
    }

    // Casos especiais para 167:
    // Whisper às vezes entende "linha 167" como "minha 1,5,7"
    const pattern157To167 = /^(minha\s+)?1[, ]+5[, ]+7\.?$/;
    if (pattern157To167.test(corrected)) {
        corrected = '167';
    }

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

// Função para detectar alucinações comuns do Whisper (ex: repetições infinitas de números)
export function isLikelyHallucination(text: string): boolean {
    if (!text) return false;

    // 1. Detectar repetições de "1, 2, 1, 2" ou padrões similares
    const numericPatternMatch = text.match(/(\d+[\s,]+){4,}/g);
    if (numericPatternMatch) {
        // Extrair apenas os números
        const numbers = text.match(/\d+/g) || [];
        if (numbers.length > 8) {
            const uniqueNumbers = new Set(numbers);
            // Se tivermos muitos números mas poucos são únicos (ex: 20 números, mas apenas 1 ou 2 diferentes)
            if (uniqueNumbers.size <= 2 || uniqueNumbers.size < numbers.length / 4) {
                console.warn("⚠️ [SearchService] Alucinação numérica detectada e bloqueada.");
                return true;
            }
        }
    }

    // 2. Detectar repetições de palavras curtas (ex: "de de de de")
    const words = text.toLowerCase().split(/\s+/);
    if (words.length > 10) {
        let maxRepetitions = 0;
        let currentWord = "";
        let count = 0;
        for (const word of words) {
            if (word === currentWord) {
                count++;
            } else {
                currentWord = word;
                count = 1;
            }
            maxRepetitions = Math.max(maxRepetitions, count);
        }
        if (maxRepetitions > 5) {
            console.warn("⚠️ [SearchService] Alucinação de texto repetitivo detectada.");
            return true;
        }
    }

    return false;
}

export function findMatchingItems(transcript: string, cache: SearchItem[]): SearchItem[] {
    // --- Camada de Segurança Anti-Alucinação ---
    if (isLikelyHallucination(transcript)) {
        return [];
    }

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
    // Refinamento: Ignorar prefixos comuns que confundem a extração
    const prefixesToIgnore = ['linha', 'orbe', 'sistema', 'ir para', 'ir', 'para', 'estação', 'camera', 'câmera'];
    let textForNumericSearch = correctedTranscript.toLowerCase();
    
    // Remover prefixos se eles existirem no início da frase
    for (const prefix of prefixesToIgnore) {
        if (textForNumericSearch.startsWith(prefix)) {
            textForNumericSearch = textForNumericSearch.substring(prefix.length).trim();
            break;
        }
    }

    const numericMatch = textForNumericSearch.match(/\d+/);
    const hadNumeric = !!numericMatch;
    if (numericMatch) {
        const extractedNumber = numericMatch[0];
        const extractedInt = parseInt(extractedNumber, 10);
        
        const numberMatches = cache.filter(item => {
            if (item.type !== 'keyword') return false;
            // Se o item é numérico (apenas dígitos), comparamos como inteiro
            if (/^\d+$/.test(item.text)) {
                return parseInt(item.text, 10) === extractedInt;
            }
            // Fallback para alfanuméricos exatos (ex: 65B)
            return item.text === extractedNumber;
        });
        if (numberMatches.length > 0) return getUniqueResults(numberMatches);
    }

    // Se havia algum componente numérico e não houve match exato (Tentativa 2),
    // NÃO fazemos buscas fuzzy por texto (Tentativas 3 e 4). Em vez disso,
    // vamos direto para o matching por código comprimido (Tentativa 5),
    // que é seguro para coisas como "TP 2B" ou "Orbe 151".
    if (hadNumeric) {
        const compressedTerm = correctedTranscript.replace(/\s+/g, '').toLowerCase();
        const compressedMatches = cache.filter(item => {
            if (item.type !== 'keyword') return false;
            const normalizedItem = normalizeText(item.text);
            return normalizedItem === normalizeText(compressedTerm) ||
                compressedTerm.includes(normalizedItem);
        });
        return getUniqueResults(compressedMatches);
    }

    // Tentativa 3: Busca por Substring no nome do sistema (apenas quando NÃO há número)
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

    // Tentativa 5 (fallback geral, sem números): termo comprimido
    const compressedTerm = correctedTranscript.replace(/\s+/g, '').toLowerCase();
    const compressedMatches = cache.filter(item => {
        if (item.type !== 'keyword') return false;
        const normalizedItem = normalizeText(item.text);
        return normalizedItem === normalizeText(compressedTerm) ||
            compressedTerm.includes(normalizedItem);
    });

    return getUniqueResults(compressedMatches);
}
