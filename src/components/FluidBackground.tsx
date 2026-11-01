import React from 'react';

export const FluidBackground: React.FC = () => {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none overflow-hidden z-0"
    >
      {/* 
        Reference Backdrop: 
        Left: soft sky blue / cyan
        Center: pale lavender / white
        Right: vibrant pink / coral / magenta
        Bottom: lavender / blue / pink blend
      */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(circle at 10% 45%, #60c5f8 0%, #a0e1ff 35%, transparent 65%),
            radial-gradient(circle at 90% 30%, #ff4b7d 0%, #ff7ea7 35%, transparent 65%),
            radial-gradient(circle at 85% 75%, #a855f7 0%, #ec4899 35%, transparent 60%),
            radial-gradient(circle at 50% 50%, #f5f3ff 0%, #faf8ff 50%, transparent 80%),
            linear-gradient(135deg, #7ad1f9 0%, #d8b4fe 40%, #f472b6 75%, #fb7185 100%)
          `,
        }}
      />

      {/* Gentle soft ambient blooms */}
      <div className="absolute inset-0 opacity-40">
        <div className="absolute top-[5%] left-[2%] w-[500px] h-[500px] rounded-full bg-cyan-300 filter blur-[100px]" />
        <div className="absolute top-[20%] right-[5%] w-[550px] h-[550px] rounded-full bg-pink-400 filter blur-[110px]" />
        <div className="absolute bottom-[5%] right-[20%] w-[500px] h-[500px] rounded-full bg-purple-400 filter blur-[120px]" />
      </div>
    </div>
  );
};
