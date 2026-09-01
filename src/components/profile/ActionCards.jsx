import React from "react";
import { motion } from "framer-motion";

export default function ActionCards({ onSupport, onDeposit, onWithdraw, unreadSupport = 0 }) {
  return (
    <div className="px-4 w-full flex flex-col gap-4.5 mt-4.5 box-border">
      {/* 1. Hỗ Trợ Trực Tuyến */}
      <motion.div
        onClick={onSupport}
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.1 }}
        whileTap={{ scale: 0.98 }}
        className="relative flex items-center justify-between w-full min-h-[155px] sm:min-h-[170px] rounded-2xl p-4 sm:p-5 overflow-hidden cursor-pointer border border-[#bd9c59]/40 shadow-lg bg-[#121020]"
      >
        <img
          src="https://cempartner.com/FileUpload/Images/giaodichnhanhchong_copy.jpg"
          alt="Hỗ Trợ Trực Tuyến"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover object-center border-0 outline-none pointer-events-none"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col justify-center max-w-[70%]">
          <p className="text-white font-bold leading-snug tracking-tight text-lg sm:text-2xl" style={{ fontFamily: "Mulish, sans-serif" }}>
            Hỗ Trợ Trực Tuyến
          </p>
          <p className="text-white/80 text-xs sm:text-sm mt-1" style={{ fontFamily: "Roboto, sans-serif" }}>
            CSKH 24/7 · Nhấn để chat ngay
          </p>
        </div>
        {unreadSupport > 0 && (
          <span className="absolute top-3 right-3 z-20 min-w-[22px] h-[22px] px-1.5 flex items-center justify-center text-[11px] font-bold text-white bg-red-500 rounded-full border-2 border-[#121020] animate-bounce">
            {unreadSupport > 99 ? "99+" : unreadSupport}
          </span>
        )}
      </motion.div>

      {/* 2. Nạp Tiền */}
      <motion.div
        onClick={onDeposit}
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.15 }}
        whileTap={{ scale: 0.98 }}
        className="relative flex items-center justify-between w-full min-h-[155px] sm:min-h-[170px] rounded-2xl p-4 sm:p-5 overflow-hidden cursor-pointer border border-[#bd9c59]/40 shadow-lg bg-[#121020]"
      >
        <img
          src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSgFS0OIJWM3B7DMGQZsyq2IaD1qHxhYSU_gf9vT4TpTw&s=10"
          alt="Nạp Tiền"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover object-center border-0 outline-none pointer-events-none"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/40 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col justify-center max-w-[70%]">
          <p className="text-white font-bold leading-snug tracking-tight text-lg sm:text-2xl" style={{ fontFamily: "Mulish, sans-serif" }}>
            Nạp Tiền
          </p>
          <p className="text-amber-300/90 text-xs sm:text-sm mt-1 font-medium" style={{ fontFamily: "Roboto, sans-serif" }}>
            Nạp tiền thả ga · Nhận ngay quà lớn
          </p>
        </div>
      </motion.div>

      {/* 3. Rút Tiền */}
      <motion.div
        onClick={onWithdraw}
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.2 }}
        whileTap={{ scale: 0.98 }}
        className="relative flex items-center justify-between w-full min-h-[155px] sm:min-h-[170px] rounded-2xl p-4 sm:p-5 overflow-hidden cursor-pointer border border-[#bd9c59]/40 shadow-lg bg-[#121020]"
      >
        <img
          src="https://img.magnific.com/free-photo/closeup-golden-usd-coins-dropping-dark-background-dollar-is-main-currency-exchange-payment-world-by-3d-render_616485-2.jpg?semt=ais_hybrid&w=740&q=80"
          alt="Rút Tiền"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover object-center border-0 outline-none pointer-events-none"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/40 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col justify-center max-w-[70%]">
          <p className="text-white font-bold leading-snug tracking-tight text-lg sm:text-2xl" style={{ fontFamily: "Mulish, sans-serif" }}>
            Rút Tiền
          </p>
          <p className="text-amber-300/90 text-xs sm:text-sm mt-1 font-medium" style={{ fontFamily: "Roboto, sans-serif" }}>
            Rút tiền nhanh chóng · An toàn 100%
          </p>
        </div>
      </motion.div>
    </div>
  );
}

