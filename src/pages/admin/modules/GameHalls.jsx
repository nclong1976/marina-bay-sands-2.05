import React, { useEffect, useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { spUploadFile } from "@/lib/supabaseService";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Upload, History, Clock, ArrowUp, ArrowDown, Zap, Power, CalendarClock, Eye, EyeOff } from "lucide-react";
import { Panel, inputCls, ConfirmDialog } from "../ui";
import { GAMES } from "@/components/home/homeData";
import { getGameConfigs, updateGameConfig, formatMMSS, subscribeGameStore, getCustomGames, saveCustomGames, setGameBoostMode, getEffectiveGameOdds } from "@/lib/gameStore";
import GameConfigModal from "@/components/admin/GameConfigModal";
import AuditLogModal from "@/components/admin/AuditLogModal";
import GameTableSimulator from "@/components/admin/GameTableSimulator";

const STATUS_BADGES = {
  active: { label: "Hoạt động", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  maintenance: { label: "Bảo trì", cls: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  disabled: { label: "Tắt hoàn toàn", cls: "bg-red-500/20 text-red-300 border-red-500/30" },
};

export default function GameHalls() {
  const { toast } = useToast();
  const [gameList, setGameList] = useState(() => getCustomGames(GAMES));
  const [gameConfigs, setGameConfigs] = useState(() => getGameConfigs());
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);

  // Modal states for Config and Audit Log — configInitialTab điều hướng thẳng tới đúng
  // tab (Sửa tỷ lệ hoặc Hẹn giờ nhiều khung) tuỳ nút admin bấm từ bảng.
  const [configGame, setConfigGame] = useState(null);
  const [configInitialTab, setConfigInitialTab] = useState("general");
  const [openAuditLog, setOpenAuditLog] = useState(false);

  const openConfig = (g, cfg, tab = "general") => {
    setConfigGame({ ...g, ...cfg });
    setConfigInitialTab(tab);
  };

  // Xác nhận trước khi thao tác ảnh hưởng trực tiếp tới người chơi đang cược thật —
  // tránh admin mới bấm nhầm làm tắt sảnh hoặc đổi tỷ lệ thưởng ngoài ý muốn.
  const [boostConfirm, setBoostConfirm] = useState(null); // { gameKey, targetMode, title }
  const [statusConfirm, setStatusConfirm] = useState(null); // { gameKey, newStatus, title }

  const load = () => {
    setGameList(getCustomGames(GAMES));
    setGameConfigs(getGameConfigs());
  };

  useEffect(() => {
    load();
    const unsub = subscribeGameStore(() => {
      setGameConfigs(getGameConfigs());
    });
    const handleListUpdate = (e) => {
      if (e.detail) setGameList(e.detail);
    };
    window.addEventListener("GAMES_LIST_UPDATED", handleListUpdate);
    return () => {
      unsub();
      window.removeEventListener("GAMES_LIST_UPDATED", handleListUpdate);
    };
  }, []);

  const openNew = () => setEdit({
    id: "g_" + Date.now().toString(36),
    gameId: "may-man-28",
    title: "Trò chơi mới",
    category: "lucky28",
    badge: "hot",
    status: "active",
    bg: "https://media.base44.com/images/public/6a729d033f9d0f63f381a6c6/3b2df2e2c_4c343a3c4_2f02652a8036143883dbcb8537a0c05f42aa1f0e.png",
    titleClass: "text-figma-12 font-bold text-white",
  });

  const openEdit = (g) => setEdit({ ...g });

  // Handle Bật/Tắt (2.1 / 1.98 Odds Toggle)
  const handleToggleBoost = (gameId, targetMode, title) => {
    setGameBoostMode(gameId, targetMode, { adminId: "Admin_Principal", ip: "192.168.1.10" });
    setGameConfigs(getGameConfigs());
    if (targetMode === "ON") {
      toast({
        title: `⚡ Đã BẬT Tỷ Lệ 2.1: ${title}`,
        description: "Tỉ lệ Tài/Xỉu (Lớn/Nhỏ) đã tự động tăng lên 2,1. Ván cược hiện tại sẽ chạy nhanh hơn một chút để khởi động ván mới đúng thời gian thực!",
      });
    } else {
      toast({
        title: `🔒 Đã TẮT Tỷ Lệ 2.1: ${title}`,
        description: "Tỉ lệ trả thưởng Cửa Tài / Xỉu (Lớn/Nhỏ) đã trở về mức mặc định 1,98.",
      });
    }
  };

  const onUpload = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const file_url = await spUploadFile(f, "games");
    if (file_url) {
      setEdit((s) => ({ ...s, bg: file_url }));
      toast({ title: "Đã tải ảnh lên thành công" });
    } else {
      toast({ title: "Tải ảnh lỗi", variant: "destructive" });
    }
  };

  const save = () => {
    if (!edit.title) return toast({ title: "Vui lòng nhập tên trò chơi/sảnh", variant: "destructive" });

    // Chặn tạo/đổi thành mã Game ID đã dùng ở dòng khác — mỗi trò chơi thật (1 ván chơi
    // trực tiếp duy nhất) chỉ nên có đúng 1 thẻ, tránh tái tạo tình trạng bật/tắt tỷ lệ
    // ở 1 thẻ bị đồng bộ nhầm sang các thẻ trùng gameId khác.
    const gameIdTaken = gameList.some((g) => g.id !== edit.id && (g.gameId || g.id) === (edit.gameId || edit.id));
    if (gameIdTaken) {
      return toast({
        title: "Mã Game ID đã được dùng",
        description: `Mã "${edit.gameId}" đã gắn với 1 sảnh khác. Mỗi trò chơi thật chỉ nên có 1 thẻ điều khiển duy nhất.`,
        variant: "destructive",
      });
    }

    const exists = gameList.findIndex((g) => g.id === edit.id);
    let next;
    if (exists >= 0) {
      next = [...gameList];
      next[exists] = edit;
    } else {
      next = [edit, ...gameList];
    }
    saveCustomGames(next);
    setGameList(next);
    toast({ title: "Đã lưu thay đổi sảnh chơi thành công" });
    setEdit(null);
  };

  // Change 3-state Game status (Active / Maintenance / Disabled)
  const handleStatusChange = (gameId, newStatus) => {
    const targetGame = gameList.find((g) => g.gameId === gameId || g.id === gameId) || { gameId, title: gameId };
    updateGameConfig(
      gameId,
      { status: newStatus },
      { adminId: "Admin_Principal", ip: "192.168.1.10" }
    );
    // Also update in gameList status
    const next = gameList.map((g) => (g.gameId === gameId || g.id === gameId ? { ...g, status: newStatus } : g));
    saveCustomGames(next);
    setGameList(next);
    setGameConfigs(getGameConfigs());
    toast({
      title: `Cập nhật trạng thái: ${targetGame.title || gameId}`,
      description: "Đã cập nhật cấu hình và áp dụng tới toàn bộ người chơi thời gian thực!",
      variant: newStatus === "active" ? "success" : "default",
    });
  };

  // Chuyển trạng thái sang Active thì áp dụng ngay (an toàn) — chuyển sang Bảo trì/Tắt
  // thì hỏi xác nhận trước vì sẽ ẩn sảnh khỏi người chơi ngay lập tức.
  const requestStatusChange = (gameKey, newStatus, title) => {
    if (newStatus === "active") {
      handleStatusChange(gameKey, newStatus);
    } else {
      setStatusConfirm({ gameKey, newStatus, title });
    }
  };

  const confirmStatusChange = () => {
    if (!statusConfirm) return;
    handleStatusChange(statusConfirm.gameKey, statusConfirm.newStatus);
    setStatusConfirm(null);
  };

  const confirmBoostToggle = () => {
    if (!boostConfirm) return;
    handleToggleBoost(boostConfirm.gameKey, boostConfirm.targetMode, boostConfirm.title);
    setBoostConfirm(null);
  };

  const move = (idx, dir) => {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= gameList.length) return;
    const next = [...gameList];
    const temp = next[idx];
    next[idx] = next[targetIdx];
    next[targetIdx] = temp;
    saveCustomGames(next);
    setGameList(next);
  };

  // Ẩn/hiện thẻ khỏi trang chủ mà không tắt hẳn game (khác trạng thái Bảo trì/Tắt vốn
  // chặn cả việc chơi). Chỉ tác động đúng 1 dòng theo id, không ảnh hưởng các trò chơi khác.
  const toggleTileVisible = (row) => {
    const nextVisible = row.tileVisible === false;
    const next = gameList.map((g) => (g.id === row.id ? { ...g, tileVisible: nextVisible } : g));
    saveCustomGames(next);
    setGameList(next);
    toast({
      title: nextVisible ? `Đã hiện thẻ trên trang chủ: ${row.title}` : `Đã ẩn thẻ khỏi trang chủ: ${row.title}`,
      description: nextVisible ? undefined : "Thẻ này sẽ không còn xuất hiện ở Sảnh Chơi trang chủ. Các trò chơi khác không bị ảnh hưởng.",
    });
  };

  const remove = () => {
    if (!del) return;
    const next = gameList.filter((g) => g.id !== del.id);
    saveCustomGames(next);
    setGameList(next);
    toast({ title: "Đã xoá sảnh/trò chơi" });
    setDel(null);
  };

  return (
    <div className="space-y-4">
      {/* Header with buttons and Realtime Sync Indicator */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold text-white">Quản Lý Sảnh Chơi & Trò Chơi (User Flow)</h1>
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Realtime Sync Active
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-white/20 text-white/80 hover:bg-white/10"
            onClick={() => setOpenAuditLog(true)}
          >
            <History className="w-4 h-4 mr-1 text-[#bd9c59]" /> Nhật ký thao tác (Audit Log)
          </Button>
          <Button
            size="sm"
            className="bg-gradient-to-r from-[#7033ff] to-[#4b00ff] text-white"
            onClick={openNew}
          >
            <Plus className="w-4 h-4 mr-1" /> Thêm sảnh/trò chơi
          </Button>
        </div>
      </div>

      {/* Lưới thẻ Sảnh Chơi — mỗi thẻ mô phỏng TRỰC TIẾP bàn chơi thật thu nhỏ, Admin chỉnh
          tỷ lệ trả thưởng từng ô cược ngay tại đây thay vì phải mở popup riêng. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {gameList.length === 0 ? (
          <Panel className="col-span-full px-3 py-10 text-center text-white/40 text-sm">
            Chưa có sảnh/trò chơi nào
          </Panel>
        ) : gameList.map((g) => {
          const i = gameList.findIndex((x) => x.id === g.id);
          const gameKey = g.gameId || g.id;
          const cfg = gameConfigs[gameKey] || {
            gameId: gameKey,
            status: g.status || "active",
            timerDuration: 299,
            odds: { tai_xiu: 1.98, chan_le: 1.98, hoa: 95, cap_so: 12 },
          };
          const statusInfo = STATUS_BADGES[cfg.status || g.status] || STATUS_BADGES.active;
          const currentTaiXiuOdds = cfg.odds?.tai_xiu ?? 1.98;
          const isBoostActive = cfg.boostMode === "ON" || Number(currentTaiXiuOdds) >= 2.0;

          // Tỷ lệ THẬT đang áp dụng cho người chơi ngay lúc này (gồm cả khung giờ
          // khuyến mãi đang chạy, nếu có) — không chỉ tỷ lệ mặc định đã lưu.
          const effective = getEffectiveGameOdds(gameKey);
          const scheduleCount = (cfg.oddsSchedules || []).length;

          return (
            <Panel key={g.id} className={`p-2.5 flex flex-col gap-2 ${g.tileVisible === false ? "opacity-55" : ""}`}>
              {/* Header: thứ tự, ảnh, tên, danh mục, ẩn/hiện, sửa/xoá */}
              <div className="flex items-start gap-2">
                <div className="flex flex-col items-center shrink-0 pt-0.5 gap-0.5">
                  <span className="text-[10px] text-white/40">{i + 1}</span>
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="text-white/40 hover:text-white disabled:opacity-20"><ArrowUp size={11} /></button>
                  <button onClick={() => move(i, 1)} disabled={i === gameList.length - 1} className="text-white/40 hover:text-white disabled:opacity-20"><ArrowDown size={11} /></button>
                </div>
                {g.bg ? (
                  <img src={g.bg} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#7033ff] to-[#4b00ff] shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-medium text-white text-sm truncate">{g.title || "(Không có tên)"}</p>
                    <span className="shrink-0 px-1.5 py-0.5 rounded bg-white/10 text-white/80 text-[9px] font-mono uppercase">{g.category}</span>
                  </div>
                  <p className="text-[10px] text-white/40 font-mono truncate">ID: {gameKey} {g.badge ? `· [${g.badge.toUpperCase()}]` : ""}</p>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    onClick={() => toggleTileVisible(g)}
                    title={g.tileVisible === false ? "Đang ẩn khỏi trang chủ — bấm để hiện lại" : "Đang hiện trên trang chủ — bấm để ẩn riêng thẻ này"}
                    className={`p-1.5 rounded-lg transition-colors ${
                      g.tileVisible === false
                        ? "bg-white/5 text-white/30 hover:text-white/60 hover:bg-white/10"
                        : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                    }`}
                  >
                    {g.tileVisible === false ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button className="p-1.5 rounded-lg hover:bg-white/10 text-white/70" onClick={() => openEdit(g)} title="Sửa thông tin">
                    <Pencil size={13} />
                  </button>
                  <button className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400" onClick={() => setDel(g)} title="Xoá">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Trạng thái 3-state + thời gian ván cược */}
              <div className="flex items-center gap-1.5">
                <select
                  value={cfg.status || g.status || "active"}
                  onChange={(e) => requestStatusChange(gameKey, e.target.value, g.title)}
                  className={`flex-1 min-w-0 text-[11px] font-semibold px-2 py-1 rounded-lg outline-none border cursor-pointer ${statusInfo.cls}`}
                >
                  <option value="active" className="bg-[#12142d] text-emerald-400">🟢 Active (Hoạt động)</option>
                  <option value="maintenance" className="bg-[#12142d] text-amber-400">🟡 Maintenance (Bảo trì)</option>
                  <option value="disabled" className="bg-[#12142d] text-red-400">🔴 Disabled (Tắt hoàn toàn)</option>
                </select>
                <div className="flex items-center gap-1 font-mono text-[11px] text-white/80 shrink-0">
                  <Clock className="w-3 h-3 text-[#bd9c59]" />
                  {formatMMSS(cfg.timerDuration || 299)}
                </div>
              </div>

              {/* Bật/Tắt nhanh 2.1 + Hẹn giờ nhiều khung */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => setBoostConfirm({ gameKey, targetMode: "ON", title: g.title })}
                  className={`px-2 py-1 rounded-lg text-[11px] font-black transition-all flex items-center gap-1 active:scale-95 ${
                    isBoostActive
                      ? "bg-gradient-to-r from-amber-400 to-emerald-400 text-slate-950 shadow-[0_0_10px_rgba(255,215,0,0.5)] ring-1 ring-amber-300"
                      : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  }`}
                  title="Bật ngay tỷ lệ 2,1 và chạy nhanh ván cược hiện tại"
                >
                  <Zap className="w-3 h-3" /> BẬT
                </button>
                <button
                  onClick={() => setBoostConfirm({ gameKey, targetMode: "OFF", title: g.title })}
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 active:scale-95 ${
                    !isBoostActive
                      ? "bg-slate-700 text-white/90 border border-white/20 font-bold"
                      : "bg-white/5 hover:bg-red-500/20 text-red-400 border border-red-500/30"
                  }`}
                  title="Tắt ngay, trở về mặc định 1,98"
                >
                  <Power className="w-3 h-3" /> TẮT
                </button>
                <button
                  onClick={() => openConfig(g, cfg, "scheduler")}
                  className="px-2 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[11px] font-semibold flex items-center gap-1 transition-colors ml-auto"
                >
                  <CalendarClock className="w-3 h-3" />
                  Hẹn giờ {scheduleCount > 0 && `(${scheduleCount})`}
                </button>
                {effective.isBoosted ? (
                  <span className="text-amber-400 font-black text-[10px] flex items-center gap-1 basis-full">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
                    </span>
                    Đang khuyến mãi
                  </span>
                ) : isBoostActive ? (
                  <span className="text-amber-300 font-semibold text-[10px] basis-full">⚡ Bật thủ công</span>
                ) : null}
              </div>

              {/* Bàn chơi mô phỏng — chỉnh tỷ lệ từng ô cược trực tiếp trên giao diện thật thu nhỏ */}
              <div className="pt-1.5 border-t border-white/10">
                <GameTableSimulator game={g} />
              </div>
            </Panel>
          );
        })}
      </div>

      {/* Game Edit Modal */}
      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent className="bg-[#161936] border-white/15 text-white max-w-lg">
          <DialogHeader><DialogTitle>{edit?.title ? "Sửa Sảnh / Trò Chơi" : "Thêm Sảnh / Trò Chơi"}</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-white/60 mb-1 block">Tên sảnh / trò chơi</label>
                <input className={inputCls} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="VD: Hàn Quốc may mắn 28" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-white/60 mb-1 block">Mã Game ID</label>
                  <input className={inputCls} value={edit.gameId || ""} onChange={(e) => setEdit({ ...edit, gameId: e.target.value })} placeholder="VD: may-man-28" />
                </div>
                <div>
                  <label className="text-xs text-white/60 mb-1 block">Danh mục (Category)</label>
                  <select
                    className={inputCls + " cursor-pointer"}
                    value={edit.category}
                    onChange={(e) => setEdit({ ...edit, category: e.target.value })}
                  >
                    <option value="lucky28" className="bg-[#12142d]">Lucky28</option>
                    <option value="xoso" className="bg-[#12142d]">Xổ Số (Xoso)</option>
                    <option value="pk10" className="bg-[#12142d]">PK10</option>
                    <option value="slot" className="bg-[#12142d]">Slot</option>
                    <option value="casino" className="bg-[#12142d]">Casino</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-white/60 mb-1 block">Huy hiệu (Badge)</label>
                  <select
                    className={inputCls + " cursor-pointer"}
                    value={edit.badge || ""}
                    onChange={(e) => setEdit({ ...edit, badge: e.target.value })}
                  >
                    <option value="" className="bg-[#12142d]">Không có</option>
                    <option value="hot" className="bg-[#12142d]">HOT</option>
                    <option value="new" className="bg-[#12142d]">NEW</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-white/60 mb-1 block">Trạng thái mặc định</label>
                  <select
                    className={inputCls + " cursor-pointer"}
                    value={edit.status || "active"}
                    onChange={(e) => setEdit({ ...edit, status: e.target.value })}
                  >
                    <option value="active" className="bg-[#12142d]">Active (Hoạt động)</option>
                    <option value="maintenance" className="bg-[#12142d]">Maintenance (Bảo trì)</option>
                    <option value="disabled" className="bg-[#12142d]">Disabled (Tắt)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-white/60 mb-1 block">Ảnh nền Sảnh (URL hoặc Tải lên)</label>
                <div className="flex gap-2">
                  <input className={inputCls} value={edit.bg || ""} onChange={(e) => setEdit({ ...edit, bg: e.target.value })} placeholder="https://..." />
                  <label className="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-sm flex items-center gap-1 cursor-pointer whitespace-nowrap"><Upload size={16} /> Tải lên<input type="file" className="hidden" accept="image/*" onChange={onUpload} /></label>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEdit(null)} className="text-white/70 hover:text-white">Huỷ</Button>
            <Button className="bg-gradient-to-r from-[#7033ff] to-[#4b00ff] text-white" onClick={save}>Lưu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!del} onOpenChange={(v) => !v && setDel(null)} title="Xoá trò chơi / sảnh" desc={`Xoá "${del?.title}" khỏi danh sách sảnh chơi?`} confirmText="Xoá" onConfirm={remove} />

      {/* Xác nhận đổi trạng thái sang Bảo trì / Tắt — ẩn sảnh khỏi người chơi ngay lập tức */}
      <ConfirmDialog
        open={!!statusConfirm}
        onOpenChange={(v) => !v && setStatusConfirm(null)}
        title={statusConfirm?.newStatus === "disabled" ? "Tắt hoàn toàn sảnh chơi" : "Chuyển sang Bảo trì"}
        desc={`Sảnh "${statusConfirm?.title}" sẽ bị ẩn khỏi người chơi ngay lập tức. Bạn có chắc chắn không?`}
        confirmText="Xác nhận"
        onConfirm={confirmStatusChange}
      />

      {/* Xác nhận Bật/Tắt chế độ thưởng 2.1 — thay đổi tỷ lệ trả thưởng thật ngay lập tức */}
      <ConfirmDialog
        open={!!boostConfirm}
        onOpenChange={(v) => !v && setBoostConfirm(null)}
        title={boostConfirm?.targetMode === "ON" ? "Bật chế độ thưởng 2.1" : "Tắt chế độ thưởng 2.1"}
        desc={
          boostConfirm?.targetMode === "ON"
            ? `Tăng tỷ lệ trả thưởng Tài/Xỉu (Lớn/Nhỏ) của "${boostConfirm?.title}" lên 2,1 ngay lập tức?`
            : `Đưa tỷ lệ trả thưởng của "${boostConfirm?.title}" về mặc định 1,98?`
        }
        confirmText="Xác nhận"
        tone={boostConfirm?.targetMode === "ON" ? "primary" : "danger"}
        onConfirm={confirmBoostToggle}
      />

      {/* Game Config & Diff Confirmation Modal */}
      <GameConfigModal
        open={!!configGame}
        onOpenChange={(v) => !v && setConfigGame(null)}
        game={configGame}
        initialTab={configInitialTab}
        onSaved={() => load()}
      />

      {/* Audit Log Modal */}
      <AuditLogModal
        open={openAuditLog}
        onOpenChange={setOpenAuditLog}
      />
    </div>
  );
}