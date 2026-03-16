
import { OrbitalSystem, SearchItem } from '../types';

export function normalizeText(text: string | null | undefined): string {
    if (!text) return '';
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/<br>/g, '') // remove html tags from satellite names
        .replace(/[^a-z0-9]/g, '') // remove all non-alphanumeric chars
        .replace(/([a-z]+)0+([1-9]\d*)/g, '$1$2') // tp04 -> tp4, tp010 -> tp10
        .replace(/([a-z]+)0+$/g, '$10'); // tp000 -> tp0
}

export function applyPhoneticCorrections(transcript: string): string {
    // Mapeamento exaustivo de números por extenso para dígitos
        // Mapeamento exaustivo de números por extenso para dígitos
    const numberMap: { [key: string]: string } = {
        'zero': '0', 'um': '1', 'uma': '1', 'dois': '2', 'duas': '2', 'tres': '3', 'três': '3',
        'quatro': '4', 'cinco': '5', 'seis': '6', 'meia': '6', 'sete': '7',
        'oito': '8', 'nove': '9', 'dez': '10', 'onze': '11', 'doze': '12',
        'treze': '13', 'quatorze': '14', 'quinze': '15', 'dezesseis': '16',
        'dezessete': '17', 'dezoito': '18', 'dezenove': '19', 'vinte': '20',
        'trinta': '30', 'quarenta': '40', 'cinquenta': '50', 'sessenta': '60',
        'setenta': '70', 'oitenta': '80', 'noventa': '90', 'cem': '100',
        'cento': '100', 'duzentos': '200', 'trezentos': '300',
        // Casos Compostos e Específicos do Usuário
        'cento e cinquenta e um': '151', 'cento e cinquenta': '150', 'cento cinquenta e um': '151',
        'um cinco um': '151', 'um cinco 1': '151',
        'duzentos e um': '201', 'duzentos e dois': '202',
        'cento e oitenta e sete': '187', 'oitenta e sete': '187', 'cento oitenta e sete': '187',
        'cento e cinquenta e nove': '159', 'cento cinquenta e nove': '159',
        '150 y 50': '151', '150 e 50': '151', 'zero um': '01', 'zero 1': '01',
        'hum': 'um', 'em': '1', 'hum um': '01', 'hum 1': '01', 'zero hum': '01',
        'dos': '2', 'doix': '2', 'mea': '6', 'ocho': '8', 'oi': '8', 'seche': '7', 'sechi': '7', 'cincu': '5', 'sim': '5', 'trex': '3',
        // Códigos de Orbe (TP2B, etc)
        'tp dois b': 'tp2b', 'tp 2 b': 'tp2b', 'tp 02b': 'tp2b',
        'tp doisb': 'tp2b', 'tepe': 'tp', 'te pe': 'tp', 'tp2 b': 'tp2b',
        'tep dois b': 'tp2b', 'tepê': 'tp', 'tp dois bê': 'tp2b',
        'tp zero um': 'tp01', 'tepe zero um': 'tp01', 'tepe 01': 'tp01',
        'tp zero quatro': 'tp04', 'tepe zero quatro': 'tp04', 'tp 4': 'tp4', 'tepe 4': 'tp4',
        'dois zero um b': '201b', 'dois zero um bê': '201b',
        'um meia sete': '167', 'um meia set': '167', 'um me sete': '167',
        'cento e sessenta e sete': '167', 'cento sessenta e sete': '167',
        'um oito sete': '187', '87': '187',
        'um seis um': '161', '11': '161',
        'um seis dois': '162', '12': '162',
        'um seis tres': '163', '13': '163',
        'um seis quatro': '164', '14': '164',
        'um seis cinco': '165', '15': '165',
        'um seis seis': '166', '16': '166',
        'um seis sete': '167', '17': '167',
        'um seis oito': '168', '18': '168',
        'meio': '6', 'mei': '6',
        // Confusões Fonéticas T/D e P/B (Offline Whisper)
        'dp': 'tp', 'depe': 'tp', 'de pe': 'tp', 'dp01': 'tp01', 'dp1': 'tp1',
        'b13': 'p13', 'b 13': 'p13', 'be 13': 'p13', 'b13b': 'p13b', 'b13 b': 'p13b',
        'beire': 'p', 'beireh': 'p', 'beire 3': 'p13', '3 e b': '13b', 'p 13 b': 'p13b',
        // Casos de Falha do Número 1 (TP01) - Apenas transcrições específicas confirmadas
        'atepeu': 'tp01', 'tepeu': 'tp01', 'tep eu': 'tp01', 'depele': 'tp01', 'tem pesarum': 'tp01', 'tem pezaram': 'tp01'
    };

    const fillerWords = ['então', 'tipo', 'eh', 'ah', 'hmm', 'quero', 'procurar', 'ir', 'no', 'na', 'para', 'veja', 'mostre', 'me', 'por', 'favor', 'linhas', 'dos', 'das', 'a', 'o', 'e'];

    let corrected = transcript.toLowerCase()
        .replace(/½/g, ' meia ')
        .replace(/\b1\/2\b/g, ' um meia ') 
        // Política Anti-Matemática: 1,5 -> 165, 1,3 -> 163, etc.
        // O Whisper entende "um meia X" como "1,X"
        .replace(/\b1[,.](\d)\b/g, '16$1')
        // Remove qualquer ponto ou vírgula entre números (ex: 20.1 -> 201)
        .replace(/(\d)[,.](\d)/g, '$1$2')
        // Remove "a", "e", "o" entre dígitos
        .replace(/(\d)\s+[aeo]\s+(\d)/g, '$1 $2')
        .replace(/[、]/g, ' ') 
        .replace(/\by\b/g, ' e ') 
        .replace(/\s+/g, ' ')
        .trim();

    // 1. Aplicar mapeamento de números
    Object.keys(numberMap).forEach(key => {
        const regex = new RegExp(`\\b${key}\\b`, 'g');
        corrected = corrected.replace(regex, numberMap[key]);
    });

    // 2. Compactação de dígitos final (ex: "1 6 3" -> "163")
    const digitCompaction3 = /\b(\d)[, ]+(\d)[, ]+(\d)\b/g; 
    corrected = corrected.replace(digitCompaction3, '$1$2$3');
    
    const digitCompaction2 = /\b(\d)[, ]+(\d)\b/g;
    corrected = corrected.replace(digitCompaction2, '$1$2');
    
    const digitCompaction4 = /\b(\d)[, ]+(\d)[, ]+(\d)[, ]+(\d)\b/g;
    corrected = corrected.replace(digitCompaction4, '$1$2$3$4');

    // 3. Inteligência de Troca (Swap) para a faixa 160/150
    const invalid150s = ['150', '153', '154', '155', '156', '157', '158']; 
    invalid150s.forEach(num => {
        if (corrected.includes(num)) {
            const mappedNum = num.replace('15', '16');
            corrected = corrected.replace(num, mappedNum);
        }
    });

    // 4. Remover filler words (especialmente no início e conectores soltos)
    fillerWords.forEach(word => {
        // Remove no início
        const startRegex = new RegExp(`^${word}\\s+`, 'i');
        corrected = corrected.replace(startRegex, '');
        // Remove conectores soltos que sobraram entre espaços (mas não partes de palavras)
        const midRegex = new RegExp(`\\s+${word}\\s+`, 'g');
        corrected = corrected.replace(midRegex, ' ');
    });

    // Casos especiais para 151:
    // Whisper repetindo "um, um, um, um..."
    const repeatedUmPattern = /^(um[, ]+){2,4}um\.?$/;
    if (repeatedUmPattern.test(corrected)) {
        corrected = '151';
    }
    // Whisper devolvendo contagem "1, 2, 3, 4, 5, 1"
    const countThenOnePattern = /^1(?:[, ]+2[, ]+3[, ]+4[, ]+5[, ]+1\.?)$/;
    if (countThenOnePattern.test(corrected)) {
        corrected = '151';
    }

    // Casos especiais para 151: fala rápida ou erros fonéticos comuns
    const patternFast151 = /^(um\s+sim\s+comum|um\s+cinco\s+um|um\s+cinco\s+hum)\.?$/i;
    if (patternFast151.test(corrected)) {
        corrected = '151';
    }

    // Casos especiais para 167: fala rápida ou erros fonéticos comuns
    const patternFast167 = /^(um\s+meia\s+sete|um\s+me\s+sete|um\s+meio\s+sete|cento\s+sessenta\s+sete|um\s+6\s+7|um\s+seis\s+sete|minha\s+1\s+5\s+7)\.?$/i;
    if (patternFast167.test(corrected)) {
        corrected = '167';
    }

    // Correções fonéticas de nomes
    corrected = corrected.replace(/\bpiau\b/g, 'pial');
    corrected = corrected.replace(/\bpiaui\b/g, 'pial');
    corrected = corrected.replace(/\btrangulo\b/g, 'triangulo');
    corrected = corrected.replace(/\bmeia\b/g, '6'); // "Meia" freq. usado para 6 no Brasil

    if (corrected === 'meia5p' || corrected === 'meia5' || corrected === 'neia5b') {
        corrected = '65b';
    }

    // 5. Correções de T/D e P/B via Regex para prefixos de códigos
    corrected = corrected
        .replace(/^dp(\d+)/g, 'tp$1') // dp01 -> tp01
        .replace(/^b(\d+)/g, 'p$1')  // b13 -> p13
        .replace(/\bdepe\b/g, 'tp')
        .replace(/\btepe\b/g, 'tp')
        .replace(/\btp\s+(\d+)/g, 'tp$1') // tp 01 -> tp01
        .replace(/\bp\s+(\d+)/g, 'p$1');  // p 13 -> p13

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

export function parseFromToCommand(text: string): { from: string, to: string } | null {
    if (!text) return null;
    
    // Normalizar conectores comuns
    const normalized = text.toLowerCase()
        .replace(/\bpara a\b/g, 'para')
        .replace(/\bpro\b/g, 'para')
        .replace(/\bpra\b/g, 'para')
        .replace(/\bindon\b/g, 'indo')
        .replace(/\bda\b/g, 'de')
        .replace(/\bdo\b/g, 'de');

    // Padrão: "de [ORIGEM] para [DESTINO]" ou "[ORIGEM] para [DESTINO]"
    // O Whisper costuma colocar pontuação no final, então removemos no final se houver.
    const cleanText = normalized.replace(/[.?!]$/, '').trim();
    
    // Regex para capturar os dois grupos
    const fromToRegex = /(?:de\s+)?(.+?)\s+para\s+(.+)/i;
    const match = cleanText.match(fromToRegex);

    if (match) {
        const fromRaw = match[1].trim();
        const toRaw = match[2].trim();

        // Aplicar correções fonéticas em cada parte
        const from = applyPhoneticCorrections(fromRaw);
        const to = applyPhoneticCorrections(toRaw);

        if (from && to) {
            console.log(`🧭 [SearchService] Comando De-Para detectado: "${from}" -> "${to}"`);
            return { from, to };
        }
    }

    return null;
}
