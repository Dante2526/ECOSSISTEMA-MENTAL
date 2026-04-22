
import mammoth from 'mammoth';
import fs from 'fs';

async function extractDocx(filePath) {
    try {
        const result = await mammoth.extractRawText({path: filePath});
        console.log(`--- ${filePath} ---`);
        console.log(result.value.substring(0, 2000)); // Pega os primeiros 2000 caracteres para análise
    } catch (error) {
        console.error(`Error reading ${filePath}:`, error);
    }
}

const files = [
    'classificação_.docx',
    'CTR.docx',
    'Formação_.docx',
    'Manobras diversas.docx',
    'Recepção_.docx'
];

async function run() {
    for (const file of files) {
        await extractDocx(file);
        console.log('\n' + '='.repeat(50) + '\n');
    }
}

run();
