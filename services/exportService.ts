import { Clipboard } from '@capacitor/clipboard';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isNativePlatform } from './capacitorPlatform';

export type ExportResult = 'exported' | 'shared' | 'cancelled';

/**
 * Exporta dados JSON via download no navegador ou salva no cache e abre o Share Sheet nativo no Android.
 */
export async function exportJsonFile(filename: string, data: unknown): Promise<ExportResult> {
    const jsonStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

    if (isNativePlatform()) {
        const writeResult = await Filesystem.writeFile({
            path: filename,
            data: jsonStr,
            directory: Directory.Cache,
            encoding: Encoding.UTF8,
        });

        try {
            await Share.share({
                title: filename,
                dialogTitle: `Exportar ${filename}`,
                files: [writeResult.uri],
            });
            return 'shared';
        } catch (err: any) {
            const msg = String(err?.message || err || '').toLowerCase();
            if (msg.includes('cancel')) {
                return 'cancelled';
            }
            throw err;
        }
    }

    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'exported';
}

/**
 * Copia texto para a área de transferência usando @capacitor/clipboard no Android ou Clipboard API na Web.
 */
export async function copyTextToClipboard(text: string): Promise<void> {
    if (isNativePlatform()) {
        await Clipboard.write({ string: text });
        return;
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    await Clipboard.write({ string: text });
}
