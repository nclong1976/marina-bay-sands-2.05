import React from "react";
import CasinoChip from "./CasinoChip";

export default function BetControlBar({
  chips, selectedChip, onSelectChip, betAmount, setBetAmount,
  onAdd, onReset, onPlace, statusText, ticketCount,
}) {
  return (
    <section className="sticky bottom-0 w-full z-50 flex flex-col mt-auto">
      <div className="absolute inset-0 z-0 pointer-events-none flex flex-col justify-end">
        <img
          className="w-full h-[256px] object-cover absolute bottom-[70px]"
          src="https://media.base44.com/images/public/6a729d033f9d0f63f381a6c6/c34a216e7_8532854d1_1df8f73191a40277e2c4044f14ec80e3d5d4e3a1.png"
          alt=""
        />
        <img
          className="w-full h-[185px] object-cover absolute bottom-[70px]"
          src="https://media.base44.com/images/public/6a729d033f9d0f63f381a6c6/adc1da8dd_64c469046_bcb1eb015c9df954855d3abc8b77414052fc81c2.png"
          alt=""
        />
      </div>

      <div className="relative z-10 flex flex-col pt-6 pb-4 px-2.5 gap-5">
        <div className="absolute -top-[18px] left-1/2 -translate-x-1/2 bg-figma-color-14 rounded-[16px] shadow-[inset_0_0_0_1px_#c83727] w-full max-w-[267px] min-h-[37px] flex items-center justify-center z-20 px-3">
          <p className="text-figma-23 font-normal font-figma-inter leading-figma-25 text-[#e1aaab] text-center truncate">{statusText}</p>
        </div>

        <div className="flex justify-between items-center px-1 mt-2">
          <p className="text-figma-22 font-normal font-figma-inter leading-figma-25 text-[#f1c195]">
            Đặt cược nhanh {ticketCount > 0 ? `(${ticketCount})` : ""}
          </p>
        </div>

        <div className="flex justify-between items-center px-4 gap-2">
          {chips.map((c) => {
            const isSelected = selectedChip === c;

            return (
              <button
                key={c}
                onClick={() => onSelectChip(c)}
                className={`relative w-[58px] h-[58px] flex items-center justify-center hover:-translate-y-1 transition-transform active:scale-95 ${
                  isSelected ? "scale-110 z-10" : ""
                }`}
              >
                <CasinoChip
                  value={c}
                  className={`absolute inset-0 w-full h-full pointer-events-none transition-transform ${
                    isSelected ? "drop-shadow-[0_0_14px_rgba(255,215,0,0.9)] scale-105" : "drop-shadow-[0_2px_5px_rgba(0,0,0,0.6)]"
                  }`}
                />
                {isSelected && (
                  <span className="absolute inset-0 rounded-full ring-2 ring-[#FFD700] ring-offset-1 ring-offset-black/50 animate-pulse pointer-events-none" />
                )}
                <span className={`relative z-10 text-[13px] font-black tracking-tight ${
                  isSelected ? "text-[#FFD700] drop-shadow-[0_2px_3px_rgba(0,0,0,1)] scale-110" : "text-white drop-shadow-[0_1.5px_2px_rgba(0,0,0,0.95)]"
                }`}>
                  {c}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between mt-1">
          <p className="text-figma-21 font-normal font-figma-roboto-flex leading-figma-27 text-[#f3cda5] shrink-0 ml-1">Số tiền cược:</p>
          <input
            type="number"
            min="0"
            value={betAmount}
            onChange={(e) => setBetAmount(Math.max(0, Number(e.target.value)))}
            className="bg-figma-primary-2 rounded-[22px] shadow-[inset_0_0_0_1px_#f7dfc6] w-[145px] h-[46px] mx-2 px-4 text-center text-white outline-none focus:ring-2 focus:ring-[#f7dfc6]/50"
          />
          <button onClick={onAdd} className="bg-[#4a097f] rounded-[22px] shadow-[inset_0_0_0_1px_#6a145b] w-[176px] h-[46px] flex items-center justify-center shrink-0 hover:bg-[#5a109a] transition-colors">
            <p className="text-[clamp(14px,4.2vw,26px)] font-semibold font-figma-inter leading-[1.1923] text-[#ddcee4]">Mua hàng</p>
          </button>
          <button onClick={onReset} className="bg-[#c9101b] rounded-[22px] shadow-[inset_0_0_0_1px_#d92812] w-[109px] h-[47px] flex items-center justify-center shrink-0 ml-2 hover:bg-[#e01522] transition-colors">
            <p className="text-[clamp(18px,5.17vw,32px)] font-normal font-figma-gabarito leading-[0.875] text-[#e7bbbc]">Đặt lại</p>
          </button>
        </div>
      </div>

      <div className="relative z-20 w-full min-h-[70px] bg-figma-surface flex items-center justify-center pb-2">
        <button onClick={onPlace} className="bg-figma-border rounded-[28px] shadow-[inset_0_0_0_1px_#c73213] w-[505px] max-w-[90%] h-[60px] flex items-center justify-center hover:brightness-110 transition-all active:scale-[0.98]">
          <p className="text-figma-22 font-normal font-figma-gabarito leading-figma-27 text-figma-text-7-5">Đặt cược</p>
        </button>
      </div>
    </section>
  );
}