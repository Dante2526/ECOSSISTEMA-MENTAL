import { useEffect, useRef } from 'react';

type BackStackEntry = {
    id: symbol;
    handler: () => void;
};

const backStack: BackStackEntry[] = [];

/**
 * Executa o manipulador de "Voltar" da camada mais alta aberta no momento.
 * Retorna true se algum modal/overlay tratou o evento, false se a pilha está vazia.
 */
export function dispatchCapacitorBackButton(): boolean {
    if (backStack.length === 0) {
        return false;
    }
    const topEntry = backStack[backStack.length - 1];
    topEntry.handler();
    return true;
}

/**
 * Registra um callback na pilha LIFO do botão Voltar do Android enquanto `isActive` for true.
 * Garante que modais aninhados fechem na ordem exata em que foram abertos.
 */
export function useBackButtonHandler(isActive: boolean, onBack: () => void): void {
    const onBackRef = useRef(onBack);
    onBackRef.current = onBack;

    useEffect(() => {
        if (!isActive) return;

        const id = Symbol('back-handler');
        backStack.push({
            id,
            handler: () => onBackRef.current(),
        });

        return () => {
            const index = backStack.findIndex(entry => entry.id === id);
            if (index !== -1) {
                backStack.splice(index, 1);
            }
        };
    }, [isActive]);
}
