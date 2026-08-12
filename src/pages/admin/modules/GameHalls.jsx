import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Upload, Settings, History, Clock, ArrowUp, ArrowDown, Zap, Power, CalendarClock } from "lucide-react";
import { Panel, TableWrap, Th, Td, inputCls, ConfirmDialog } from "../ui";
import { GAMES } from "@/components/home/homeData";
import { getGameConfigs, updateGameConfig, formatMMSS, subscribeGameStore, getCustomGames, saveCustomGames, setGameBoostMode, setGameBoostSchedule } from "@/lib/gameStore";
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
  const [scheduleTimeInput, setScheduleTimeInput] = useState({});

  // Modal states for Config and Audit Log
  const [configGame, setConfigGame] = useState(null);
  const [openAuditLog, setOpenAuditLog] = useState(false);

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

  // Handle Save Schedule Timer for Auto Bật
  const handleSaveSchedule = (gameId, title) => {
    const timeVal = scheduleTimeInput[gameId];
    if (!timeVal) {
      return toast({ title: "Vui lòng chọn giờ hẹn (HH:mm)", variant: "destructive" });
    }
    setGameBoostSchedule(gameId, timeVal, { adminId: "Admin_Principal", ip: "192.168.1.10" });
    setGameConfigs(getGameConfigs());
    toast({
      title: `⏳ Đã hẹn giờ Bật 2.05 lúc ${timeVal}`,
      description: `Đến ${timeVal}, sảnh "${title}" sẽ tự động BẬT tỷ lệ 2,05 và chạy nhanh ván cược cũ để chuyển giao chuẩn xác.`,
    });
  };

  const handleClearSchedule = (gameId, title) => {
    setGameBoostSchedule(gameId, null, { adminId: "Admin_Principal", ip: "192.168.1.10" });
    setScheduleTimeInput((prev) => ({ ...prev, [gameId]: "" }));
    setGameConfigs(getGameConfigs());
    toast({ title: `Đã hủy hẹn giờ cho sảnh ${title}` });
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
              <Th>Cửa Tài/Xỉu (1:x)</Th>
              <Th>Chế Độ Thưởng 2.05 (Bật/Tắt & Hẹn Giờ)</Th>
              <Th className="text-right">Hành động</Th>
            </tr>
          </thead>
          <tbody>
            {gameList.map((g, i) => {
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
                      onChange={(e) => handleStatusChange(gameKey, e.target.value)}
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
                        <span className={isBoostActive ? "text-amber-300 font-extrabold text-sm" : "text-[#bd9c59] font-bold"}>
                          1:{currentTaiXiuOdds}
                        </span>
                      </p>
                      <p className="text-[10px] text-white/50">Đơn/Đôi: 1:{cfg.odds?.chan_le ?? 1.98}</p>
                    </div>
                  </Td>
                  <Td>
                    {/* Bật / Tắt (2.05 Odds Toggle) and Scheduling Controls */}
                    <div className="space-y-1.5 min-w-[210px] py-1">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleToggleBoost(gameKey, "ON", g.title)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1 active:scale-95 ${
                            isBoostActive
                              ? "bg-gradient-to-r from-amber-400 to-emerald-400 text-slate-950 shadow-[0_0_12px_rgba(255,215,0,0.5)] ring-1 ring-amber-300"
                              : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          }`}
                          title="Bật tỷ lệ cược 2,05 và chạy nhanh ván cược hiện tại"
                        >
                          <Zap className="w-3.5 h-3.5" /> BẬT (2.05)
                        </button>

                        <button
                          onClick={() => handleToggleBoost(gameKey, "OFF", g.title)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 active:scale-95 ${
                            !isBoostActive
                              ? "bg-slate-700 text-white/90 border border-white/20 font-bold"
                              : "bg-white/5 hover:bg-red-500/20 text-red-400 border border-red-500/30"
                          }`}
                          title="Tắt tỷ lệ 2,05, trở về mặc định 1,98"
                        >
                          <Power className="w-3.5 h-3.5" /> TẮT (1.98)
                        </button>
                      </div>

                      {/* Schedule Timer Input */}
                      <div className="flex items-center gap-1 text-[11px]">
                        <input
                          type="time"
                          value={scheduleTimeInput[gameKey] ?? cfg.scheduledBoostTime ?? ""}
                          onChange={(e) => setScheduleTimeInput((prev) => ({ ...prev, [gameKey]: e.target.value }))}
                          className="bg-black/50 border border-white/15 rounded px-1.5 py-0.5 text-white font-mono text-xs w-[85px] outline-none focus:border-amber-400"
                        />
                        <button
                          onClick={() => handleSaveSchedule(gameKey, g.title)}
                          className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[10px] font-semibold border border-amber-500/30 flex items-center gap-0.5 active:scale-95 transition-transform"
                        >
                          <CalendarClock className="w-3 h-3" /> Hẹn Giờ
                        </button>
                        {cfg.scheduledBoostTime && (
                          <button
                            onClick={() => handleClearSchedule(gameKey, g.title)}
                            className="text-red-400 hover:text-red-300 text-[10px] font-bold px-1"
                            title="Hủy hẹn giờ"
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      {/* Status indicator */}
                      <div className="text-[11px] font-mono">
                        {isBoostActive ? (
                          <span className="text-amber-400 font-black flex items-center gap-1">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                            </span>
                            ⚡ ĐANG BẬT 2,05
                          </span>
                        ) : cfg.scheduledBoostTime ? (
                          <span className="text-cyan-300 font-semibold flex items-center gap-1">
                            <Clock className="w-3 h-3 text-cyan-400 animate-spin" style={{ animationDuration: '4s' }} />
                            Hẹn Bật lúc: {cfg.scheduledBoostTime}
                          </span>
                        ) : (
                          <span className="text-white/40">🔒 Tỉ lệ 1,98 (Mặc định)</span>
                        )}
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-1.5">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => setConfigGame({ ...g, ...cfg })}
                        className="bg-[#bd9c59]/10 text-[#bd9c59] border-[#bd9c59]/30 hover:bg-[#bd9c59]/20 text-xs px-2 py-1 flex items-center gap-1"
                        title="Cấu hình Đếm ngược & Payout Odds"
                      >
                        <Settings className="w-3.5 h-3.5" /> Cấu hình
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

      {/* Game Config & Diff Confirmation Modal */}
      <GameConfigModal
        open={!!configGame}
        onOpenChange={(v) => !v && setConfigGame(null)}
        game={configGame}
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