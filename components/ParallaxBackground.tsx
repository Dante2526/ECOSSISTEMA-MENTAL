
import React, { useMemo, useEffect, useRef } from 'react';

interface Star {
    x: number;
    y: number;
    radius: number;
    opacity: number;
}

export const ParallaxBackground: React.FC = React.memo(() => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const starsRef = useRef<Star[]>([]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;

        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            
            // Re-generate stars on resize to fit new dimensions
            const starCount = window.innerWidth < 768 ? 25 : 75;
            starsRef.current = Array.from({ length: starCount }, () => ({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                radius: Math.random() * 1.2,
                opacity: 0.2 + Math.random() * 0.5,
            }));
        };

        const draw = () => {
            if (!ctx) return;
            // Clear canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw nebulae (subtle gradients)
            const gradient1 = ctx.createRadialGradient(canvas.width * 0.2, canvas.height * 0.3, 0, canvas.width * 0.2, canvas.height * 0.3, canvas.width * 0.6);
            gradient1.addColorStop(0, 'hsla(270,30%,15%,0.2)');
            gradient1.addColorStop(1, 'transparent');
            ctx.fillStyle = gradient1;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const gradient2 = ctx.createRadialGradient(canvas.width * 0.8, canvas.height * 0.7, 0, canvas.width * 0.8, canvas.height * 0.7, canvas.width * 0.5);
            gradient2.addColorStop(0, 'hsla(280,20%,10%,0.2)');
            gradient2.addColorStop(1, 'transparent');
            ctx.fillStyle = gradient2;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw stars
            starsRef.current.forEach(star => {
                ctx.beginPath();
                ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
                ctx.fill();
            });
        };

        // We only need to draw once after resizing, not every frame.
        let resizeTimeout: NodeJS.Timeout;
        let lastWidth = window.innerWidth;
        let lastHeight = window.innerHeight;

        const handleResize = () => {
            const newWidth = window.innerWidth;
            const newHeight = window.innerHeight;
            
            // Ignore small height changes (address bar) if width hasn't changed
            if (newWidth === lastWidth && Math.abs(newHeight - lastHeight) < 100) {
                return;
            }

            lastWidth = newWidth;
            lastHeight = newHeight;

            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                resizeCanvas();
                draw();
            }, 200);
        };

        window.addEventListener('resize', handleResize);
        
        // Initial setup
        resizeCanvas();
        draw();

        return () => {
            window.removeEventListener('resize', handleResize);
            clearTimeout(resizeTimeout);
            if(animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
        };
    }, []);

    return (
        <canvas 
            ref={canvasRef} 
            className="absolute inset-0 z-0 pointer-events-none"
        />
    );
});
