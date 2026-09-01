import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { X, RotateCcw, Pencil, Check, Sparkles } from "lucide-react";
import { getGameConfig as getStaticTableConfig } from "@/components/game/gameConfig";
import { getGameConfig, updateCellOdds, resetCellOdds, resetAllCellOdds, subscribeGameStore, getEffectiveGameOdds } from "@/lib/gameStore";
import { useToast } from "@/components/ui/use-toast";

// Mô phỏng lại đúng bàn chơi THẬT mà người chơi nhìn thấy (đồng bộ layout & màu sắc với
// GamePlayScreen.jsx) nhưng thu nhỏ vừa khung điện thoại, gắn TRỰC TIẾP vào từng thẻ sảnh ở
// trang Quản Lý Sảnh Chơi (không còn ẩn sau nút bấm mở popup) — cho phép Admin bấm thẳng vào
// từng ô cược để chỉnh tỷ lệ trả thưởng riêng của ô đó, khác với "Cấu hình nâng cao" vốn chỉ
// gộp chung 4 nhóm (Tài/Xỉu, Chẵn/Lẻ, Hòa, Cặp số).
export default function GameTableSimulator({ game }) {
  const { toast } = useToast();
  const gameId = game?.gameId || game?.id;
  const staticConfig = useMemo(() => getStaticTableConfig(gameId || "may-man-28"), [gameId]);

  const [activeTabId, setActiveTabId] = useState(staticConfig.tabs[0]?.id);
  const [cellOdds, setCellOdds] = useState({});
  // Tỷ lệ gộp THẬT đang áp dụng (gồm cả BẬT/TẮT 2.1 và khung giờ khuyến mãi đang chạy nếu
  // có) — khác với cellOdds (chỉ áp dụng cho ô admin đã tuỳ chỉnh thủ công riêng lẻ).
  const [aggOdds, setAggOdds] = useState({ tai_xiu: 1.98, chan_le: 1.98, hoa: 95, cap_so: 12 });
  const [editingKey, setEditingKey] = useState(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [editValue, setEditValue] = useState("");
  const [resetAllConfirm, setResetAllConfirm] = useState(false);

  const refresh = () => {
    if (!gameId) return;
    setCellOdds(getGameConfig(gameId).cellOdds || {});
    setAggOdds(getEffectiveGameOdds(gameId).odds || { tai_xiu: 1.98, chan_le: 1.98, hoa: 95, cap_so: 12 });
  };

  // Ô nào tương ứng với 1 trong 4 nhóm gộp (Tài/Xỉu, Chẵn/Lẻ, Hòa, Cặp số) thì phản ánh
  // tỷ lệ THẬT đang áp dụng (kể cả khi Admin vừa bấm BẬT/TẮT 2.1) — chỉ rơi về tỷ lệ tĩnh
  // mặc định trong gameConfig.js với những ô không thuộc 4 nhóm này (vd "Cực Lớn", "Báo"...).
  const resolveOdds = (item) => {
    const key = item.key || item.label;
    if (cellOdds[key] !== undefined) return { value: cellOdds[key], boosted: false };

    if (key === "LON_NORMAL" || key === "NHO_NORMAL" || item.label === "Lớn" || item.label === "Nhỏ") {
      return { value: aggOdds.tai_xiu, boosted: Number(aggOdds.tai_xiu) !== 1.98 };
    }
    if (key === "DON_NORMAL" || key === "DOI_NORMAL" || item.label === "Đơn" || item.label === "Đôi") {
      return { value: aggOdds.chan_le, boosted: Number(aggOdds.chan_le) !== 1.98 };
    }
    if (key === "HOA" || item.label === "Hòa" || item.label === "Tie") {
      return { value: aggOdds.hoa, boosted: Number(aggOdds.hoa) !== 95 };
    }
    if (key === "CAP_SO" || item.label === "Cặp số") {
      return { value: aggOdds.cap_so, boosted: Number(aggOdds.cap_so) !== 12 };
    }
    return { value: item.odds, boosted: false };
  };

  useEffect(() => {
    setActiveTabId(staticConfig.tabs[0]?.id);
    setEditingKey(null);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  useEffect(() => {
    const unsub = subscribeGameStore(() => refresh());
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  if (!gameId) return null;

  const activeTab = staticConfig.tabs.find((t) => t.id === activeTabId) || staticConfig.tabs[0];
  const customizedCount = Object.keys(cellOdds).length;

  const openEditor = (item) => {
    const key = item.key || item.label;
    setEditingKey(key);
    setEditingLabel(item.label);
    setEditValue(String(resolveOdds(item).value));
  };

  const closeEditor = () => setEditingKey(null);

  const saveEdit = () => {
    const num = Number(editValue);
    if (!editingKey || isNaN(num) || num <= 0) {
      toast({ title: "Tỷ lệ không hợp lệ", description: "Vui lòng nhập một số lớn hơn 0", variant: "destructive" });
      return;
    }
    updateCellOdds(gameId, editingKey, editingLabel, num, { adminId: "Admin_Principal", ip: "192.168.1.10" });
    refresh();
    toast({
      title: `Đã cập nhật tỷ lệ: ${editingLabel}`,
      description: `Áp dụng ngay tới bàn chơi thật của người chơi: 1:${num}`,
      variant: "success",
    });
    setEditingKey(null);
  };

  const resetEdit = () => {
    if (!editingKey) return;
    resetCellOdds(gameId, editingKey, editingLabel, { adminId: "Admin_Principal", ip: "192.168.1.10" });
    refresh();
    toast({ title: `Đã đưa "${editingLabel}" về tỷ lệ mặc định` });
    setEditingKey(null);
  };

  const doResetAll = () => {
    resetAllCellOdds(gameId, { adminId: "Admin_Principal", ip: "192.168.1.10" });
    refresh();
    setResetAllConfirm(false);
    toast({ title: "Đã khôi phục toàn bộ ô cược về tỷ lệ mặc định" });
  };

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-0.5">
        <span className="flex items-center gap-1.5 text-[11px] text-emerald-300">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
          </span>
          {customizedCount > 0 ? `${customizedCount} ô đã tuỳ chỉnh` : "Chạm ô cược để sửa tỷ lệ"}
        </span>
        {customizedCount > 0 && (
          <button
            onClick={() => setResetAllConfirm(true)}
            className="flex items-center gap-1 text-[11px] text-red-300 hover:text-red-200 font-semibold"
          >
            <RotateCcw className="w-3 h-3" /> Khôi phục tất cả
          </button>
        )}
      </div>

      {/* ── Phone frame ── */}
      <div className="mx-auto w-full max-w-[240px] rounded-[22px] border-4 border-[#2a2f4a] bg-[#05070f] shadow-[0_0_0_2px_rgba(189,156,89,0.25),0_6px_18px_rgba(0,0,0,0.45)] overflow-hidden">
        {/* Notch */}
        <div className="h-2.5 flex items-center justify-center bg-[#05070f]">
          <div className="w-12 h-1.5 rounded-full bg-black/70" />
        </div>

        {/* Mini status bar (mô phỏng, không cần dữ liệu thật) */}
        <div className="px-2 py-1 bg-[#0A0E1A] border-b border-white/10 flex items-center justify-between">
          <span className="text-[8px] text-[#d99]">Kỳ 100088</span>
          <span className="text-[8px] px-1 py-[1px] rounded bg-[#cc0000] text-white font-bold tabular-nums">04:59</span>
        </div>

        {/* Betting matrix — same structure as real player screen */}
        <div className="flex bg-[#f4f4f4] h-[210px]">
          <aside className="w-[42px] shrink-0 flex flex-col bg-[#f0f0f0] border-r border-[#e0e0e0]">
            {staticConfig.tabs.map((t) => {
              const active = t.id === activeTabId;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTabId(t.id)}
                  className={`flex-1 min-h-[30px] flex items-center justify-center transition-colors ${active ? "bg-[#ff6600]" : "hover:bg-[#e8e8e8]"}`}
                >
                  <p className={`text-[8px] font-semibold leading-tight text-center px-0.5 ${active ? "text-white" : "text-[#8c8c8c]"}`}>{t.label}</p>
                </button>
              );
            })}
          </aside>

          <div className="flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:hidden">
            <div className="h-4 flex items-center justify-center bg-[#e8e8e8] border-b border-[#dcdcdc] sticky top-0 z-10">
              <p className="text-[9px] font-bold text-[#b62d34]">{activeTab?.label}</p>
            </div>
            {activeTab?.sections?.map((sec, si) => (
              <div key={si} className="grid gap-[1px] bg-[#ececec]" style={{ gridTemplateColumns: `repeat(${Math.min(sec.columns, 5)},minmax(0,1fr))` }}>
                {sec.items.map((item, i) => {
                  const key = item.key || item.label;
                  const isCustom = cellOdds[key] !== undefined;
                  const { value: displayOdds, boosted: isBoosted } = resolveOdds(item);
                  const isEditing = editingKey === key;
                  return (
                    <button
                      key={i}
                      onClick={() => openEditor(item)}
                      className={`relative flex flex-col items-center justify-center h-[30px] bg-white transition-colors ${
                        isEditing ? "bg-[#fff3e0] ring-2 ring-[#ff6600] z-10" : isBoosted ? "bg-amber-50" : "hover:bg-[#fafafa]"
                      }`}
                    >
                      {isCustom && (
                        <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500" title="Đã tuỳ chỉnh thủ công" />
                      )}
                      {!isCustom && isBoosted && (
                        <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" title="Đang khuyến mãi/boost" />
                      )}
                      <p className="text-[9px] font-semibold leading-tight text-[#333]">{item.label}</p>
                      <p className={`text-[8px] mt-0.5 font-bold ${isCustom ? "text-emerald-600" : isBoosted ? "text-amber-600" : "text-[#999] font-normal"}`}>{displayOdds}</p>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Footer mô phỏng — chỉ hiển thị, không thao tác cược thật */}
        <div className="bg-[#ff6600] px-2 py-0.5 flex items-center justify-center">
          <p className="text-white text-[8px] font-medium flex items-center gap-1">
            <Sparkles className="w-2.5 h-2.5" /> Xem trước
          </p>
        </div>
      </div>

      {/* Inline editor for selected cell */}
      {editingKey && (
        <div className="bg-white/5 border border-[#ff6600]/40 rounded-xl p-3 space-y-2 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-white flex items-center gap-1.5">
              <Pencil className="w-3.5 h-3.5 text-[#ff6600]" /> Sửa tỷ lệ: {editingLabel}
            </p>
            <button onClick={closeEditor} className="text-white/50 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/60">Trả thưởng 1 :</span>
            <input
              type="number"
              step="0.01"
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveEdit()}
              className="flex-1 h-9 px-2 rounded-lg bg-[#0A0E1A] border border-white/15 text-white font-mono text-center outline-none focus:border-[#ff6600]"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={resetEdit}
              variant="outline"
              size="sm"
              className="flex-1 border-white/15 text-white/70 hover:bg-white/10 text-xs"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Mặc định
            </Button>
            <Button
              onClick={saveEdit}
              size="sm"
              className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:brightness-110 text-white font-bold text-xs"
            >
              <Check className="w-3.5 h-3.5 mr-1" /> Áp dụng ngay
            </Button>
          </div>
        </div>
      )}

      {resetAllConfirm && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 space-y-2">
          <p className="text-xs text-white/85">Khôi phục toàn bộ {customizedCount} ô cược đã tuỳ chỉnh về tỷ lệ mặc định?</p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setResetAllConfirm(false)} className="flex-1 text-white/70 text-xs">Huỷ</Button>
            <Button variant="destructive" size="sm" onClick={doResetAll} className="flex-1 text-xs">Xác nhận khôi phục</Button>
          </div>
        </div>
      )}
    </div>
  );
}
