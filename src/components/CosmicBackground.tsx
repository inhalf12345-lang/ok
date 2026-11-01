import React, { useEffect, useRef } from 'react';

export const CosmicBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);

    // Generate floating cosmic dust particles
    const particleCount = Math.min(width > 768 ? 45 : 25, 50);
    const particles = Array.from({ length: particleCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 1.8 + 0.6,
      speedX: (Math.random() - 0.5) * 0.25,
      speedY: (Math.random() - 0.5) * 0.25,
      hue: Math.random() > 0.5 ? 260 : 190, // purple or cyan
      alpha: Math.random() * 0.6 + 0.2,
      pulse: Math.random() * Math.PI * 2,
    }));

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Deep space radial gradients
      const radialGradient = ctx.createRadialGradient(
        width / 2,
        height * 0.45,
        10,
        width / 2,
        height * 0.45,
        Math.max(width, height) * 0.8
      );
      radialGradient.addColorStop(0, '#101432');
      radialGradient.addColorStop(0.5, '#0a0d1f');
      radialGradient.addColorStop(1, '#05070f');

      ctx.fillStyle = radialGradient;
      ctx.fillRect(0, 0, width, height);

      // Draw faint orbital guide rings centered at hub
      const centerX = width / 2;
      const centerY = height * 0.45;

      ctx.save();
      ctx.lineWidth = 1;
      const ringRadii = [140, 200, 260];
      ringRadii.forEach((r, idx) => {
        ctx.beginPath();
        ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
        ctx.strokeStyle = idx % 2 === 0 ? 'rgba(99, 102, 241, 0.08)' : 'rgba(56, 189, 248, 0.06)';
        ctx.setLineDash([4, 12]);
        ctx.stroke();
      });
      ctx.restore();

      // Render floating particles
      particles.forEach((p) => {
        p.x += p.speedX;
        p.y += p.speedY;
        p.pulse += 0.02;

        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        const currentAlpha = p.alpha + Math.sin(p.pulse) * 0.15;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 90%, 70%, ${Math.max(0.1, currentAlpha)})`;
        ctx.shadowBlur = 8;
        ctx.shadowColor = `hsla(${p.hue}, 90%, 60%, 0.8)`;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ width: '100%', height: '100%' }}
    />
  );
};
