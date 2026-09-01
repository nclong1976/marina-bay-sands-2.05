import React from "react";

// Bộ màu chip theo mệnh giá — phối theo quy ước casino thật (chip cao hơn = màu càng đậm/
// sang), đồng bộ với tông vàng-tím thương hiệu Marina Bay Sands của app thay vì ảnh ngoài.
const CHIP_THEMES = {
  50: { base: "#1d4ed8", baseDark: "#1e3a8a", edge: "#eff6ff", ring: "#fbbf24" }, // Xanh dương
  100: { base: "#18181b", baseDark: "#000000", edge: "#e4e4e7", ring: "#fbbf24" }, // Đen
  500: { base: "#6d28d9", baseDark: "#4c1d95", edge: "#fde68a", ring: "#fbbf24" }, // Tím - vàng
};
const FIFTY_PERCENT_THEME = { base: "#047857", baseDark: "#064e3b", edge: "#fde68a", ring: "#fbbf24" }; // Xanh ngọc

const NOTCH_COUNT = 8;

// Chip casino vẽ bằng SVG (không phụ thuộc ảnh ngoài) — viền răng cưa, vòng nhẫn vàng,
// mặt trong có gradient nổi khối để trông giống chip thật thay vì hình tròn phẳng.
export default function CasinoChip({ value, className = "" }) {
  const theme = value === "50%" ? FIFTY_PERCENT_THEME : (CHIP_THEMES[value] || CHIP_THEMES[50]);
  const gradId = `chipGrad_${String(value).replace("%", "pct")}`;

  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <defs>
        <radialGradient id={gradId} cx="38%" cy="32%" r="70%">
          <stop offset="0%" stopColor={theme.base} stopOpacity="1" />
          <stop offset="70%" stopColor={theme.base} stopOpacity="1" />
          <stop offset="100%" stopColor={theme.baseDark} stopOpacity="1" />
        </radialGradient>
      </defs>

      {/* Viền ngoài + răng cưa xen kẽ */}
      <circle cx="50" cy="50" r="48" fill={theme.edge} />
      {Array.from({ length: NOTCH_COUNT }).map((_, i) => {
        const angle = (360 / NOTCH_COUNT) * i;
        return (
          <rect
            key={i}
            x="47"
            y="2"
            width="6"
            height="14"
            rx="2"
            fill={theme.base}
            transform={`rotate(${angle} 50 50)`}
          />
        );
      })}

      {/* Thân chip */}
      <circle cx="50" cy="50" r="40" fill={`url(#${gradId})`} stroke={theme.edge} strokeWidth="1.5" />

      {/* Vòng nhẫn vàng trang trí */}
      <circle cx="50" cy="50" r="31" fill="none" stroke={theme.ring} strokeWidth="2.5" strokeDasharray="5 4" opacity="0.9" />
      <circle cx="50" cy="50" r="24" fill="none" stroke={theme.edge} strokeWidth="1" opacity="0.5" />

      {/* Ánh sáng hắt (glossy highlight) */}
      <ellipse cx="38" cy="34" rx="16" ry="9" fill="#ffffff" opacity="0.18" />
    </svg>
  );
}
