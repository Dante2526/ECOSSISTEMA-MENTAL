
import React from 'react';

interface FeedbackMessageProps {
    message: string;
}

export const FeedbackMessage: React.FC<FeedbackMessageProps> = React.memo(({ message }) => {
    if (!message) {
        return null;
    }

    return (
        <div className="fixed bottom-[calc(1.25rem+var(--app-safe-bottom))] left-1/2 -translate-x-1/2 max-w-[90vw] text-center bg-black/80 text-white border border-white/30 px-6 py-3 rounded-full z-50 transition-all duration-300 shadow-[0_0_20px_rgba(255,255,255,0.2)] font-bold tracking-wider text-sm">
            {message}
        </div>
    );
});
