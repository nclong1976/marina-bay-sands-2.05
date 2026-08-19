import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Upload, Settings, History, Clock, ArrowUp, ArrowDown, Zap, Power, CalendarClock, Search, Info } from "lucide-react";
import { Panel, TableWrap, Th, Td, inputCls, ConfirmDialog } from "../ui";
import { GAMES } from "@/components/home/homeData";
import { getGameConfigs, updateGameConfig, formatMMSS, subscribeGameStore, getCustomGames, saveCustomGames, setGameBoostMode, getEffectiveGameOdds } from "@/lib/gameStore";
import GameConfigModal from "@/components/admin/GameConfigModal";
import AuditLogModal from "@/components/admin/AuditLogModal";

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

  // Tìm kiếm & lọc — giúp admin mới nhanh chóng tìm đúng sảnh giữa danh sách dài
  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

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

  // Handle Bật/Tắt (2.05 / 1.98 Odds Toggle)
  const handleToggleBoost = (gameId, targetMode, title) => {
    setGameBoostMode(gameId, targetMode, { adminId: "Admin_Principal", ip: "192.168.1.10" });
    setGameConfigs(getGameConfigs());
    if (targetMode === "ON") {
      toast({
        title: `⚡ Đã BẬT Tỷ Lệ 2.05: ${title}`,
        description: "Tỉ lệ Tài/Xỉu đã tự động chuyển sang 2,05. Ván cược hiện tại sẽ chạy nhanh hơn một chút để khởi động ván mới đúng thời gian thực!",
      });
    } else {
      toast({
        title: `🔒 Đã TẮT Tỷ Lệ 2.05: ${title}`,
        description: "Tỉ lệ trả thưởng Cửa Tài / Xỉu đã trở về mức mặc định 1,98.",
      });
    }
  };

  const onUpload = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file: f });
      setEdit((s) => ({ ...s, bg: file_url }));
      toast({ title: "Đã tải ảnh lên thành công" });
    } catch {
      toast({ title: "Tải ảnh lỗi", variant: "destructive" });
    }
  };

  const save = () => {
    if (!edit.title) return toast({ title: "Vui lòng nhập tên trò chơi/sảnh", variant: "destructive" });
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

  // Tìm kiếm & lọc theo tên/mã, danh mục, trạng thái — không đổi thứ tự thật của
  // gameList nên các nút di chuyển lên/xuống vẫn hoạt động đúng khi đang lọc.
  const filteredGameList = useMemo(() => {
    return gameList.filter((g) => {
      const gameKey = g.gameId || g.id;
      const cfg = gameConfigs[gameKey];
      const status = cfg?.status || g.status || "active";

      if (categoryFilter !== "all" && g.category !== categoryFilter) return false;
      if (statusFilter !== "all" && status !== statusFilter) return false;

      if (q.trim()) {
        const query = q.toLowerCase().trim();
        const titleMatch = (g.title || "").toLowerCase().includes(query);
        const idMatch = (gameKey || "").toLowerCase().includes(query);
        if (!titleMatch && !idMatch) return false;
      }
      return true;
    });
  }, [gameList, gameConfigs, q, categoryFilter, statusFilter]);

  // Thống kê nhanh theo trạng thái — giúp admin mới nắm tổng quan hệ thống trong 1 giây
  const statusCounts = useMemo(() => {
    const counts = { active: 0, maintenance: 0, disabled: 0 };
    gameList.forEach((g) => {
      const gameKey = g.gameId || g.id;
      const status = gameConfigs[gameKey]?.status || g.status || "active";
      if (counts[status] !== undefined) counts[status] += 1;
    });
    return counts;
  }, [gameList, gameConfigs]);

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

      {/* Chú thích ngắn cho admin mới: giải thích khái niệm 3 trạng thái & chế độ thưởng 2.05 */}
      <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl bg-[#7033ff]/10 border border-[#7033ff]/20 text-xs text-white/70">
        <Info className="w-4 h-4 text-[#bd9c59] shrink-0 mt-0.5" />
        <p>
          <strong className="text-white/90">🟢 Active</strong> = sảnh hiển thị bình thường cho người chơi ·{" "}
          <strong className="text-white/90">🟡 Bảo trì</strong> / <strong className="text-white/90">🔴 Tắt</strong> = ẩn sảnh khỏi người chơi ngay lập tức ·{" "}
          Bấm <strong className="text-white/90">Sửa tỷ lệ</strong> để đổi tỷ lệ trả thưởng thật ngay lập tức, hoặc <strong className="text-white/90">Hẹn giờ</strong> để tự động đổi tỷ lệ theo nhiều khung giờ trong ngày.
        </p>
      </div>

      {/* Thống kê nhanh theo trạng thái */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
          <span className="text-xs text-white/70">Đang hoạt động</span>
          <span className="ml-auto text-base font-bold text-emerald-300">{statusCounts.active}</span>
        </div>
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
          <span className="text-xs text-white/70">Đang bảo trì</span>
          <span className="ml-auto text-base font-bold text-amber-300">{statusCounts.maintenance}</span>
        </div>
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-red-500/10 border border-red-500/25">
          <span className="w-2.5 h-2.5 rounded-full bg-red-400 shrink-0" />
          <span className="text-xs text-white/70">Đã tắt</span>
          <span className="ml-auto text-base font-bold text-red-300">{statusCounts.disabled}</span>
        </div>
      </div>

      {/* Tìm kiếm & lọc — dễ tìm đúng sảnh khi danh sách dài */}
      <div className="flex flex-col sm:flex-row gap-2.5 items-center justify-between bg-[#121633] p-3 rounded-2xl border border-white/10">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            className={`${inputCls} pl-10 bg-[#0c0f26]`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm theo tên sảnh hoặc mã Game ID..."
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            className={`${inputCls} sm:w-44 bg-[#0c0f26]`}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all" className="bg-[#12142d]">Tất cả danh mục</option>
            <option value="lucky28" className="bg-[#12142d]">Lucky28</option>
            <option value="xoso" className="bg-[#12142d]">Xổ Số</option>
            <option value="pk10" className="bg-[#12142d]">PK10</option>
            <option value="slot" className="bg-[#12142d]">Slot</option>
            <option value="casino" className="bg-[#12142d]">Casino</option>
          </select>
          <select
            className={`${inputCls} sm:w-44 bg-[#0c0f26]`}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all" className="bg-[#12142d]">Tất cả trạng thái</option>
            <option value="active" className="bg-[#12142d]">🟢 Hoạt động</option>
            <option value="maintenance" className="bg-[#12142d]">🟡 Bảo trì</option>
            <option value="disabled" className="bg-[#12142d]">🔴 Đã tắt</option>
          </select>
        </div>
      </div>

      {/* Main Table: Game Status, Countdown Timers, Payout Odds & Actions */}
      <Panel className="overflow-hidden">
        <TableWrap>
          <thead className="bg-white/[0.03]">
            <tr>
              <Th>#</Th>
              <Th>Trò chơi / Sảnh</Th>
              <Th>Danh mục</Th>
              <Th>Trạng thái (3-State)</Th>
              <Th>Thời gian cược</Th>
              <Th>Tỷ lệ trả thưởng (Live)</Th>
              <Th>Khuyến Mãi Nhanh &amp; Hẹn Giờ</Th>
              <Th className="text-right">Hành động</Th>
            </tr>
          </thead>
          <tbody>
            {filteredGameList.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-white/40 text-sm">
                  Không tìm thấy sảnh/trò chơi nào khớp bộ lọc
                </td>
              </tr>
            ) : filteredGameList.map((g) => {
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
                <tr key={g.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <Td className="text-white/40">
                    <div className="flex items-center gap-1">
                      <span>{i + 1}</span>
                      <div className="flex flex-col">
                        <button onClick={() => move(i, -1)} disabled={i === 0} className="text-white/40 hover:text-white disabled:opacity-20"><ArrowUp size={12} /></button>
                        <button onClick={() => move(i, 1)} disabled={i === gameList.length - 1} className="text-white/40 hover:text-white disabled:opacity-20"><ArrowDown size={12} /></button>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      {g.bg ? (
                        <img src={g.bg} alt="" className="w-9 h-9 rounded-lg object-cover" />
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#7033ff] to-[#4b00ff]" />
                      )}
                      <div>
                        <p className="font-medium text-white text-sm">{g.title || "(Không có tên)"}</p>
                        <p className="text-[10px] text-white/40 font-mono">ID: {gameKey} {g.badge ? `· [${g.badge.toUpperCase()}]` : ""}</p>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <span className="px-2 py-0.5 rounded bg-white/10 text-white/80 text-xs font-mono uppercase">
                      {g.category}
                    </span>
                  </Td>
                  <Td>
                    {/* 3-State Status Selector */}
                    <select
                      value={cfg.status || g.status || "active"}
                      onChange={(e) => requestStatusChange(gameKey, e.target.value, g.title)}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-lg outline-none border cursor-pointer ${statusInfo.cls}`}
                    >
                      <option value="active" className="bg-[#12142d] text-emerald-400">🟢 Active (Hoạt động)</option>
                      <option value="maintenance" className="bg-[#12142d] text-amber-400">🟡 Maintenance (Bảo trì)</option>
                      <option value="disabled" className="bg-[#12142d] text-red-400">🔴 Disabled (Tắt hoàn toàn)</option>
                    </select>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1.5 font-mono text-xs text-white/80">
                      <Clock className="w-3.5 h-3.5 text-[#bd9c59]" />
                      <span>{formatMMSS(cfg.timerDuration || 299)}</span>
                    </div>
                  </Td>
                  <Td>
                    <div className="text-xs font-mono space-y-0.5">
                      <p>
                        Tài/Xỉu:{" "}
                        <span className={effective.isBoosted ? "text-amber-300 font-extrabold text-sm" : "text-[#bd9c59] font-bold"}>
                          1:{effective.odds.tai_xiu}
                        </span>
                      </p>
                      <p className="text-[10px] text-white/50">Đơn/Đôi: 1:{effective.odds.chan_le}</p>
                      {effective.isBoosted && (
                        <p className="text-[10px] text-amber-400 font-sans font-semibold flex items-center gap-1">
                          <Zap className="w-3 h-3" /> {effective.activeRule?.badgeText || effective.activeRule?.name || "Đang khuyến mãi"}
                        </p>
                      )}
                    </div>
                  </Td>
                  <Td>
                    {/* Bật/Tắt nhanh 1 chạm + lối vào Hẹn giờ nhiều khung (Scheduler) */}
                    <div className="space-y-1.5 min-w-[190px] py-1">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setBoostConfirm({ gameKey, targetMode: "ON", title: g.title })}
                          className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1 active:scale-95 ${
                            isBoostActive
                              ? "bg-gradient-to-r from-amber-400 to-emerald-400 text-slate-950 shadow-[0_0_12px_rgba(255,215,0,0.5)] ring-1 ring-amber-300"
                              : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          }`}
                          title="Bật ngay tỷ lệ 2,05 và chạy nhanh ván cược hiện tại"
                        >
                          <Zap className="w-3.5 h-3.5" /> BẬT
                        </button>

                        <button
                          onClick={() => setBoostConfirm({ gameKey, targetMode: "OFF", title: g.title })}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 active:scale-95 ${
                            !isBoostActive
                              ? "bg-slate-700 text-white/90 border border-white/20 font-bold"
                              : "bg-white/5 hover:bg-red-500/20 text-red-400 border border-red-500/30"
                          }`}
                          title="Tắt ngay, trở về mặc định 1,98"
                        >
                          <Power className="w-3.5 h-3.5" /> TẮT
                        </button>
                      </div>

                      <button
                        onClick={() => openConfig(g, cfg, "scheduler")}
                        className="w-full px-2 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                      >
                        <CalendarClock className="w-3.5 h-3.5" />
                        Hẹn giờ nhiều khung {scheduleCount > 0 && `(${scheduleCount})`}
                      </button>

                      {/* Status indicator */}
                      <div className="text-[11px] font-mono">
                        {effective.isBoosted ? (
                          <span className="text-amber-400 font-black flex items-center gap-1">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                            </span>
                            ⏰ Đang trong khung giờ
                          </span>
                        ) : isBoostActive ? (
                          <span className="text-amber-300 font-semibold">⚡ Đã bật thủ công</span>
                        ) : (
                          <span className="text-white/40">🔒 Tỷ lệ mặc định</span>
                        )}
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-1.5">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => openConfig(g, cfg, "general")}
                        className="bg-[#bd9c59]/10 text-[#bd9c59] border-[#bd9c59]/30 hover:bg-[#bd9c59]/20 text-xs px-2 py-1 flex items-center gap-1"
                        title="Sửa tỷ lệ trả thưởng & thời gian ván cược"
                      >
                        <Settings className="w-3.5 h-3.5" /> Sửa tỷ lệ
                      </Button>
                      <button className="p-1.5 rounded-lg hover:bg-white/10 text-white/70" onClick={() => openEdit(g)} title="Sửa thông tin">
                        <Pencil size={15} />
                      </button>
                      <button className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400" onClick={() => setDel(g)} title="Xoá">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      </Panel>

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

      {/* Xác nhận Bật/Tắt chế độ thưởng 2.05 — thay đổi tỷ lệ trả thưởng thật ngay lập tức */}
      <ConfirmDialog
        open={!!boostConfirm}
        onOpenChange={(v) => !v && setBoostConfirm(null)}
        title={boostConfirm?.targetMode === "ON" ? "Bật chế độ thưởng 2.05" : "Tắt chế độ thưởng 2.05"}
        desc={
          boostConfirm?.targetMode === "ON"
            ? `Tăng tỷ lệ trả thưởng Tài/Xỉu của "${boostConfirm?.title}" lên 2,05 ngay lập tức?`
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