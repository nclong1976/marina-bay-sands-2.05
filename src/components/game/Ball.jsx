import React, { useState, useEffect } from "react";
import { BALL_COLORS } from "./gameConfig";

export default function Ball({ number, size = 36, isSpinning = false, index = 0 }) {
  const [displayNum, setDisplayNum] = useState(number);

  useEffect(() => {
    if (!isSpinning) {
      setDisplayNum(number);
      return;
    }

    // Rapidly change number while spinning
    const interval = setInterval(() => {
      setDisplayNum(Math.floor(Math.random() * 10));
    }, 70 + (index * 15));

    return () => clearInterval(interval);
  }, [isSpinning, number, index]);

  const activeNum = isSpinning ? displayNum : number;
  const color = BALL_COLORS[activeNum % BALL_COLORS.length];

  return (
    <div
      className={`rounded-full flex items-center justify-center text-white font-black shadow-md shrink-0 relative transition-transform duration-150 ${
        isSpinning
          ? "animate-bounce scale-105 ring-2 ring-amber-400/80 shadow-[0_0_12px_rgba(255,215,0,0.6)]"
          : "scale-100 hover:scale-110 active:scale-95"
      }`}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.45) 0%, ${color} 70%, rgba(0,0,0,0.4) 100%)`,
        fontSize: size * 0.45,
        boxShadow: isSpinning
          ? "0 0 15px rgba(255,215,0,0.8), inset -2px -2px 4px rgba(0,0,0,0.5)"
          : "0 2px 5px rgba(0,0,0,0.3), inset -2px -2px 4px rgba(0,0,0,0.4)",
      }}
    >
      <span className={isSpinning ? "animate-pulse" : ""}>
        {activeNum}
      </span>
      {/* 3D Glass shine highlight */}
      <span className="absolute top-[10%] left-[18%] w-[35%] h-[35%] rounded-full bg-white/40 blur-[0.5px] pointer-events-none" />
    </div>
  );
}
