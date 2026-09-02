import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { getGameConfig, CHIPS, computeDrawLabels } from "./gameConfig";
import { getGameConfig as getStoreConfig, subscribeGameStore, getEffectiveGameOdds } from "@/lib/gameStore";
import { getTier } from "@/components/lobby/lobbyData";
import Ball from "./Ball";
import CasinoChip from "./CasinoChip";
import NotificationBell from "@/components/NotificationBell";
import { useNotifications } from "@/lib/NotificationContext";
import { ChevronLeft, History, Search, User, Lock, ChevronDown, ShieldAlert, CheckCircle2, X, Dices } from "lucide-react";
import { Image } from "@/components/ui/image";
import { getGameById } from "@/components/home/homeData";
import { useAuth } from "@/lib/AuthContext";
import { useUserData, getUserData, updateUserData as setGlobalUserData, resolveUserId } from "@/lib/userData";
import { getCurrentRoundInfo, getPeriodDraw, settlePendingBets } from "@/lib/gameRoundManager";
import { isSupabaseConfigured } from "@/lib/supabase";
import { spSyncGameBet, spGetUserProfile } from "@/lib/supabaseService";

export default function GamePlayScreen({ gameId, tier, variantId }) {
  const config = useMemo(() => getGameConfig(gameId), [gameId]);
  const variant = useMemo(() => (variantId ? getGameById(variantId) : undefined), [variantId]);
  const displayTitle = variant?.title || config.name;
  const thumb = variant?.bg;
  const tierLabel = getTier(tier)?.label;
  const { toast } = useToast();
  const { push } = useNotifications();
  const navigate = useNavigate();

  const { user } = useAuth();
  const { data: userData } = useUserData(user?.id);
  const balance = userData?.balance ?? 0;

  // Real-time store configuration sync
  const [liveStoreConfig, setLiveStoreConfig] = useState(() => getStoreConfig(gameId));
  useEffect(() => {
    setLiveStoreConfig(getStoreConfig(gameId));
    const unsub = subscribeGameStore(() => {
      setLiveStoreConfig(getStoreConfig(gameId));
    });
    return unsub;
  }, [gameId]);

  // Real-time Automated Odds Scheduler Engine sync
  const [effectiveOddsState, setEffectiveOddsState] = useState(() =>
    getEffectiveGameOdds(gameId, user?.id, user?.account || user?.email)
  );

  useEffect(() => {
    const refreshOdds = () => {
      setEffectiveOddsState(getEffectiveGameOdds(gameId, user?.id, user?.account || user?.email));
    };
    refreshOdds();
    const timer = setInterval(refreshOdds, 2000);
    const unsub = subscribeGameStore(refreshOdds);
    return () => {
      clearInterval(timer);
      unsub();
    };
  }, [gameId, user?.id, user?.account, user?.email]);

  // Admin Maintenance/Disabled Kick & Redirect Logic
  const isMaintenanceOrDisabled = liveStoreConfig?.status === "maintenance" || liveStoreConfig?.status === "disabled";
  const [redirectCount, setRedirectCount] = useState(3);

  useEffect(() => {
    if (isMaintenanceOrDisabled) {
      setRedirectCount(3);
      let count = 3;
      const interval = setInterval(() => {
        count -= 1;
        setRedirectCount(count);
        if (count <= 0) {
          clearInterval(interval);
          navigate("/", { replace: true });
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isMaintenanceOrDisabled, navigate]);

  // Dynamic Odds Resolver
  const getEffectiveOdds = useCallback(
    (item) => {
      const k = item.key || item.label;

      // Ưu tiên cao nhất: tỷ lệ ô cược riêng lẻ Admin đã chỉnh qua Mô phỏng Bàn Chơi
      // (khác với 4 nhóm gộp odds.tai_xiu/chan_le/hoa/cap_so bên dưới).
      const cellOverride = liveStoreConfig?.cellOdds?.[k];
      if (cellOverride !== undefined && cellOverride !== null) return `${cellOverride}`;

      const oddsObj = effectiveOddsState?.odds || liveStoreConfig?.odds;
      if (!oddsObj) return item.odds;

      if (k === "LON_NORMAL" || k === "NHO_NORMAL" || item.label === "Lớn" || item.label === "Nhỏ") {
        return oddsObj.tai_xiu !== undefined ? `${oddsObj.tai_xiu}` : item.odds;
      }
      if (k === "DON_NORMAL" || k === "DOI_NORMAL" || item.label === "Đơn" || item.label === "Đôi") {
        return oddsObj.chan_le !== undefined ? `${oddsObj.chan_le}` : item.odds;
      }
      if (k === "HOA" || item.label === "Hòa" || item.label === "Tie") {
        return oddsObj.hoa !== undefined ? `${oddsObj.hoa}` : item.odds;
      }
      if (k === "CAP_SO" || item.label === "Cặp số") {
        return oddsObj.cap_so !== undefined ? `${oddsObj.cap_so}` : item.odds;
      }
      return item.odds;
    },
    [effectiveOddsState?.odds, liveStoreConfig?.odds, liveStoreConfig?.cellOdds]
  );

  const [activeTabId, setActiveTabId] = useState(() => config.tabs[0]?.id || "");
  useEffect(() => {
    if (config.tabs && config.tabs.length > 0) {
      if (!config.tabs.some((t) => t.id === activeTabId)) {
        setActiveTabId(config.tabs[0].id);
      }
    }
  }, [config, activeTabId]);

  const activeTab = useMemo(
    () => config.tabs.find((t) => t.id === activeTabId) || config.tabs[0],
    [config, activeTabId]
  );

  const [selectedCells, setSelectedCells] = useState([]);
  const [tickets, setTickets] = useState([]);
  const tierChips = useMemo(() => getTier(tier)?.chips || CHIPS, [tier]);
  const [selectedChip, setSelectedChip] = useState(tierChips[0]);
  const [betAmount, setBetAmount] = useState(() => tierChips[0] || 10);
  useEffect(() => {
    setSelectedChip(tierChips[0]);
    setBetAmount(tierChips[0]);
  }, [tierChips]);

  const initialRound = useMemo(() => getCurrentRoundInfo(gameId), [gameId]);
  const [period, setPeriod] = useState(initialRound.currentPeriod);
  const [countdown, setCountdown] = useState(initialRound.remainingSeconds);
  const [isFastForwarding, setIsFastForwarding] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [drawn, setDrawn] = useState(() => getPeriodDraw(gameId, initialRound.currentPeriod - 1));
  const [showHistory, setShowHistory] = useState(false);

  const bettingClosed = countdown <= 3; // Lock 3s before round end

  useEffect(() => {
    const updateLoop = () => {
      if (user?.id) {
        settlePendingBets(user.id);
      }
      const info = getCurrentRoundInfo(gameId);
      setPeriod(info.currentPeriod);
      setCountdown(info.remainingSeconds);
      setIsFastForwarding(!!info.isFastForwarding);
      setDrawn(getPeriodDraw(gameId, info.currentPeriod - 1));
    };

    const handleNetworkRecovered = () => {
      if (user?.id) {
        settlePendingBets(user.id);
      }
    };
    window.addEventListener("NETWORK_RECOVERED", handleNetworkRecovered);

    updateLoop();
    const interval = setInterval(updateLoop, isFastForwarding ? 250 : 1000);
    return () => {
      clearInterval(interval);
      window.removeEventListener("NETWORK_RECOVERED", handleNetworkRecovered);
    };
  }, [gameId, user?.id, isFastForwarding]);

  // Generate recent 10 historical draws based on past periods
  const history = useMemo(() => {
    const list = [];
    for (let i = 1; i <= 15; i++) {
      const p = period - i;
      list.push({
        period: p,
        drawn: getPeriodDraw(gameId, p),
      });
    }
    return list;
  }, [gameId, period]);

  const labels = computeDrawLabels(drawn, config.bigThreshold);
  const mm = String(Math.floor(countdown / 60)).padStart(2, "0");
  const ss = String(countdown % 60).padStart(2, "0");

  const toggleCell = useCallback((tabId, tabLabel, item) => {
    const itemKey = item.key || item.label;
    const currentOdds = getEffectiveOdds(item);
    setSelectedCells((prev) => {
      const exists = prev.find((s) => s.tabId === tabId && (s.key ? s.key === itemKey : s.label === item.label));
      if (exists) return prev.filter((s) => !(s.tabId === tabId && (s.key ? s.key === itemKey : s.label === item.label)));
      return [...prev, { tabId, tabLabel, key: itemKey, label: item.label, odds: currentOdds }];
    });
  }, [getEffectiveOdds]);

  const statusText = tickets.length > 0
    ? `Đã thêm ${tickets.length} vé cược`
    : selectedCells.length > 0
      ? `Đã chọn ${selectedCells.length} cách chơi`
      : "Vui lòng chọn cách chơi";

  const handleAdd = () => {
    if (bettingClosed) return;
    if (selectedCells.length === 0) { toast({ title: "Chưa chọn cách chơi", variant: "destructive" }); return; }
    if (!betAmount || betAmount <= 0) { toast({ title: "Chưa nhập tiền cược", variant: "destructive" }); return; }
    setTickets((prev) => [...prev, ...selectedCells.map((s) => ({ ...s, amount: betAmount }))]);
    setSelectedCells([]);
    toast({ title: "Thêm vé thành công", description: `+${selectedCells.length} lựa chọn` });
  };

  const handleSelectFiftyPercent = () => {
    const minBet = tierChips[0] || 1;
    const freshData = getUserData(user?.id);
    const availableBalance = freshData?.balance ?? balance;

    if (!availableBalance || availableBalance <= 0) {
      setBetAmount(0);
      setSelectedChip("50%");
      toast({ title: "Số dư không đủ", variant: "destructive" });
      return;
    }

    let calculated = Math.floor(availableBalance * 0.5);

    if (calculated < minBet) {
      if (availableBalance >= minBet) {
        calculated = minBet;
      } else {
        setBetAmount(0);
        setSelectedChip("50%");
        toast({ title: "Số dư không đủ", description: `Cần tối thiểu $${minBet} USD`, variant: "destructive" });
        return;
      }
    }

    setBetAmount(calculated);
    setSelectedChip("50%");
    toast({ title: "Đã chọn cược 50% số dư", description: `Mức cược: $${calculated} USD` });
  };

  const [confirmModalData, setConfirmModalData] = useState(null);

  const handleReset = () => {
    setSelectedCells([]);
    setTickets([]);
    setSelectedChip(tierChips[0]);
    setBetAmount(tierChips[0] || 10);
  };

  const handlePlace = () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      toast({ title: "Mất kết nối mạng", description: "Không thể gửi vé cược khi ngoại tuyến. Vui lòng kiểm tra kết nối mạng!", variant: "destructive" });
      return;
    }

    const uid = resolveUserId(user?.id);

    // 1. Realtime Validation: Game Hall Status (Admin intervention check)
    const latestConfig = getStoreConfig(gameId);
    if (latestConfig?.status === "maintenance") {
      toast({ title: "Sảnh đang bảo trì", description: "Admin đang bảo trì sảnh cược này. Lệnh đặt cược bị từ chối!", variant: "destructive" });
      return;
    }
    if (latestConfig?.status === "disabled") {
      toast({ title: "Sảnh tạm ngưng", description: "Sảnh trò chơi hiện đang tạm dừng hoạt động!", variant: "destructive" });
      return;
    }

    // 2. Realtime Validation: User Account Status (Admin lock check)
    const freshUserData = getUserData(uid);
    if (freshUserData?.status === "locked" || freshUserData?.isLocked || freshUserData?.status === "banned") {
      toast({ title: "Tài khoản bị khóa", description: "Tài khoản của bạn đã bị Admin khóa hoặc tạm dừng giao dịch!", variant: "destructive" });
      return;
    }

    // 3. Realtime Validation: Period Countdown & Intermission Phase (Chốt cược)
    const freshRound = getCurrentRoundInfo(gameId);
    const intermissionSecs = latestConfig?.intermission ?? 3;
    const remSecs = freshRound?.remainingSeconds ?? 0;
    if (remSecs <= intermissionSecs) {
      toast({ title: "Đã chốt kỳ cược", description: "Kỳ cược đã đóng để quay thưởng. Vui lòng đặt cược ở kỳ tiếp theo!", variant: "destructive" });
      return;
    }

    // 4. Realtime Validation: Ticket Selection & Amounts
    const toSubmit = tickets.length > 0 ? tickets : selectedCells.map((s) => ({ ...s, amount: betAmount }));
    if (toSubmit.length === 0) {
      toast({ title: "Vui lòng chọn cách chơi", variant: "destructive" });
      return;
    }

    const minBetLimit = latestConfig?.minBet || 1;
    const maxBetLimit = latestConfig?.maxBet || 50000;

    for (const t of toSubmit) {
      const amt = Number(t.amount || 0);
      if (amt < minBetLimit) {
        toast({ title: "Hạn mức không hợp lệ", description: `Mức cược tối thiểu cho mỗi vé là $${minBetLimit} USD`, variant: "destructive" });
        return;
      }
      if (amt > maxBetLimit) {
        toast({ title: "Hạn mức không hợp lệ", description: `Mức cược tối đa cho mỗi vé là $${maxBetLimit} USD`, variant: "destructive" });
        return;
      }
    }

    const total = toSubmit.reduce((a, t) => a + (Number(t.amount) || 0), 0);
    if (!total || total <= 0) {
      toast({ title: "Chưa nhập tiền cược", variant: "destructive" });
      return;
    }

    // 5. Realtime Validation: Fresh balance check
    const availableBalance = freshUserData?.balance ?? balance;
    if (total > availableBalance) {
      toast({ title: "Số dư không đủ", description: `Số dư hiện tại: $${availableBalance} USD`, variant: "destructive" });
      return;
    }

    const activePeriod = freshRound?.period || period;

    // Trigger Bet Confirmation Modal instead of immediate placement
    setConfirmModalData({
      toSubmit,
      total,
      activePeriod,
      uid,
      gameTitle: displayTitle,
      currentBalance: availableBalance,
    });
  };

  const executeBetSubmission = async () => {
    if (!confirmModalData || isSubmitting) return;

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      toast({ title: "Mất kết nối mạng", description: "Không thể gửi vé cược khi ngoại tuyến. Vui lòng kiểm tra lại mạng!", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const { toSubmit, total, activePeriod, uid } = confirmModalData;

      // Lấy số dư THẬT từ Supabase ngay trước khi trừ tiền — không được chỉ dựa vào cache
      // cục bộ (freshUserData ở bước xác nhận phía trên có thể đã lỗi thời vài giây, ví dụ
      // Admin vừa cộng/trừ tiền hoặc cùng tài khoản đang mở ở thiết bị khác), nếu không số
      // dư thật trên Supabase sẽ bị ghi đè bằng 1 con số sai ngay khi trừ tiền đặt cược —
      // cùng dạng lỗi đã xác nhận ở luồng tất toán vé (settlePendingBets).
      let authoritativeBalance = null;
      if (isSupabaseConfigured()) {
        try {
          const spProfile = await spGetUserProfile(uid);
          if (spProfile && typeof spProfile.balance === "number") {
            authoritativeBalance = spProfile.balance;
          }
        } catch { /* ignore — rơi về cache cục bộ nếu Supabase lỗi/mất mạng */ }
      }

      const newBets = toSubmit.map((t, idx) => {
        const snapOdds = Number(t.odds || getEffectiveOdds(t) || 1.98);
        const bId = `${Date.now()}_${idx}`;
        return {
          betId: bId,
          id: bId,
          userId: uid,
          gameId,
          game: displayTitle,
          period: activePeriod,
          amount: Number(t.amount),
          itemKey: t.key || t.label,
          key: t.key || t.label,
          label: t.label,
          lockedOdds: snapOdds,
          odds: snapOdds,
          status: "PENDING",
          created_date: new Date().toISOString(),
          timestamp: new Date().toISOString(),
          tabId: t.tabId,
          tabLabel: t.tabLabel,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
      });

      const newTx = {
        id: `tx_bet_${Date.now()}`,
        type: "bet",
        title: `Đặt cược kỳ ${activePeriod}`,
        body: `-$${total} USD (${displayTitle} · ${toSubmit.length} cược)`,
        amount: -total,
        method: "Đặt cược",
        status: "completed",
        time: new Date().toLocaleString("vi-VN"),
      };

      let betSuccess = false;
      let failureMsg = "";

      setGlobalUserData(uid, (latestDB) => {
        if (latestDB?.status === "locked" || latestDB?.isLocked || latestDB?.status === "banned") {
          failureMsg = "Tài khoản của bạn đã bị Admin khóa!";
          return latestDB;
        }

        const dbBal = authoritativeBalance !== null ? authoritativeBalance : (latestDB?.balance ?? 0);
        if (dbBal < total) {
          failureMsg = `Số dư CSDL không đủ ($${dbBal} USD)!`;
          return latestDB;
        }

        betSuccess = true;
        return {
          ...latestDB,
          balance: +(dbBal - total).toFixed(2),
          turnover: +((latestDB?.turnover || 0) + total).toFixed(2),
          bets: [...(latestDB?.bets || []), ...newBets],
          txs: [newTx, ...(latestDB?.txs || [])],
        };
      });

      if (!betSuccess) {
        toast({ title: "Đặt cược thất bại", description: failureMsg || "Không thể thực hiện giao dịch", variant: "destructive" });
        setConfirmModalData(null);
        return;
      }

      try {
        window.dispatchEvent(new CustomEvent("FORCE_BALANCE_SYNC", { detail: { userId: uid } }));
      } catch { /* ignore */ }

      // Đẩy vé cược mới lên Supabase để thiết bị khác cùng tài khoản thấy đúng vé đang chờ
      if (isSupabaseConfigured()) {
        newBets.forEach((b) => { spSyncGameBet(b).catch(() => {}); });
      }

      setTickets([]);
      setSelectedCells([]);
      setBetAmount(typeof selectedChip === "number" ? selectedChip : (tierChips[0] || 10));
      toast({ title: "Đặt cược thành công", description: `${toSubmit.length} vé · $${total} USD · Kỳ ${activePeriod}` });
      push({ type: "balance", title: "Đặt cược thành công", body: `-$${total} USD · Kỳ ${activePeriod}` });
      setConfirmModalData(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="max-w-[619px] w-full mx-auto h-[100dvh] relative flex flex-col overflow-hidden bg-[#0A0E1A] font-sans select-none">
      {/* Deep-space overlay */}
      <div className="absolute inset-0 z-0 pointer-events-none bg-[radial-gradient(circle_at_18%_8%,rgba(124,199,255,0.10),transparent_40%),radial-gradient(circle_at_84%_16%,rgba(255,215,0,0.06),transparent_42%)]" />

      {/* Top header */}
      <header className="relative z-20 shrink-0 h-11 flex items-center justify-between px-3 bg-[#0A0E1A]/90 backdrop-blur-md border-b border-white/10">
        <button onClick={() => navigate(-1)} className="shrink-0"><ChevronLeft className="w-6 h-6 text-white/85" /></button>
        <div className="flex-1 flex items-center justify-center gap-2 px-2 min-w-0">
          {thumb && (
            <div className="w-7 h-7 rounded-md overflow-hidden shrink-0 ring-1 ring-white/15">
              <Image src={thumb} alt="" fittingType="fill" className="w-full h-full" />
            </div>
          )}
          <h1 className="text-white font-bold text-[15px] truncate">{displayTitle}</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <NotificationBell />
          <button className="hover:opacity-80"><Search className="w-5 h-5 text-white/85" /></button>
          <button className="hover:opacity-80"><User className="w-5 h-5 text-white/85" /></button>
        </div>
      </header>



      {/* Live status bar */}
      <section className="relative z-10 shrink-0 px-3 py-1.5 bg-transparent border-b border-white/10">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[#d99] text-[11px] shrink-0">{tierLabel ? `${tierLabel} · ` : ""}Kỳ {period - 1}</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {drawn.map((n, i) => (
              <Ball key={i} number={n} size={22} isSpinning={bettingClosed} index={i} />
            ))}
            {bettingClosed && (
              <span className="text-[10px] text-amber-300 font-bold animate-pulse ml-1">
                Đang quay...
              </span>
            )}
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-[11px] shrink-0">
            <span className="text-white/55">Tổng</span>
            <span className="bg-[#e4b060] text-[#7a3a1a] font-bold px-1.5 py-0.5 rounded">{labels.sum}</span>
            <span className="text-[#FFD700] font-semibold">{labels.big}</span>
            <span className="text-white/70">{labels.parity}</span>
          </div>
        </div>
        <div className="flex justify-end mt-1">
          <span className="text-[#f0a0a4] text-[11px]">Số dư: <b className="text-[#FFD700]">${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</b></span>
        </div>
      </section>

      {/* Active draw bar */}
      <section className="relative z-20 shrink-0 h-10 flex items-center px-3 bg-transparent border-b border-white/10">
        <p className="text-[#f0a0a4] text-[13px] font-semibold">Kỳ {period}</p>
        <div className="ml-2 px-2 py-0.5 rounded-md bg-[#cc0000] text-white text-[13px] font-bold tabular-nums">
          {mm}:{ss}
        </div>
        <p className="ml-2 text-white/70 text-[12px]">Đặt cược</p>
        <button onClick={() => setShowHistory((v) => !v)} className="ml-auto flex items-center gap-1 text-[#ffb070] text-[12px]">
          Lịch sử mở thưởng
          <History className="w-4 h-4" />
        </button>

        {showHistory && (
          <div className="absolute top-11 right-2 z-30 w-[260px] max-h-[240px] overflow-y-auto bg-[#1b1b3a]/95 rounded-lg border border-white/10 p-2 space-y-1.5 backdrop-blur-md [&::-webkit-scrollbar]:hidden">
            {history.map((h, i) => {
              const l = computeDrawLabels(h.drawn, config.bigThreshold);
              return (
                <div key={i} className="flex items-center gap-2 bg-white/5 rounded-md p-1.5">
                  <span className="text-[#f0a0a4] text-[10px] shrink-0 w-[60px] truncate">{h.period}</span>
                  <div className="flex gap-1 flex-wrap">{h.drawn.map((n, j) => <Ball key={j} number={n} size={16} />)}</div>
                  <span className="text-[#e39662] text-[10px] ml-auto">{l.big} · {l.parity}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Betting matrix */}
      <section className="relative z-10 flex-1 min-h-0 flex bg-[#f4f4f4]">
        <aside className="w-[88px] shrink-0 flex flex-col bg-[#f0f0f0] border-r border-[#e0e0e0]">
          {config.tabs.map((t) => {
            const active = t.id === activeTabId;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTabId(t.id)}
                className={`flex-1 min-h-[60px] flex items-center justify-center transition-colors ${active ? "bg-[#ff6600]" : "hover:bg-[#e8e8e8]"}`}
              >
                <p className={`text-[14px] font-semibold leading-tight text-center px-1 ${active ? "text-white" : "text-[#8c8c8c]"}`}>{t.label}</p>
              </button>
            );
          })}
        </aside>

        <div className="flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:hidden">
          <div className="h-9 flex items-center justify-center bg-[#e8e8e8] border-b border-[#dcdcdc] sticky top-0 z-10">
            <p className="text-[15px] font-bold text-[#b62d34]">{activeTab?.label}</p>
          </div>
          {activeTab?.sections?.map((sec, si) => (
            <div key={si} className="grid gap-[1px] bg-[#ececec]" style={{ gridTemplateColumns: `repeat(${Math.min(sec.columns, 5)},minmax(0,1fr))` }}>
              {sec.items.map((item, i) => {
                const itemKey = item.key || item.label;
                const sel = selectedCells.some((s) => s.tabId === activeTab.id && (s.key ? s.key === itemKey : s.label === item.label));
                const displayOdds = getEffectiveOdds(item);
                return (
                  <button
                    key={i}
                    onClick={() => !bettingClosed && !isMaintenanceOrDisabled && toggleCell(activeTab.id, activeTab.label, item)}
                    className={`flex flex-col items-center justify-center h-[64px] bg-white transition-colors ${sel ? "bg-[#ffe9d6] ring-2 ring-[#ff6600] inset-shadow" : "hover:bg-[#fafafa]"}`}
                  >
                    <p className={`text-[13px] font-semibold leading-tight ${sel ? "text-[#ff6600]" : "text-[#333]"}`}>{item.label}</p>
                    <p className="text-[11px] text-[#999] mt-0.5">{displayOdds}</p>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      {/* Betting control bar */}
      <footer className="relative z-20 shrink-0 bg-[#ff6600] px-2.5 pt-1.5 pb-2">
        <div className="flex items-center justify-between">
          <p className="text-white text-[12px] font-medium truncate max-w-[55%]">{statusText}</p>
          <div className="flex items-center gap-1">
            <p className="text-white text-[12px] font-semibold">Đặt cược nhanh ($)</p>
            <ChevronDown className="w-3.5 h-3.5 text-white" />
          </div>
        </div>

        <div className="flex items-center justify-between gap-1.5 px-0.5 mt-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden py-1">
          {tierChips.map((c) => {
            const isSelected = selectedChip === c;

            return (
              <button
                key={c}
                onClick={() => { setSelectedChip(c); setBetAmount(c); }}
                className={`relative w-[48px] h-[48px] shrink-0 flex items-center justify-center transition-all duration-200 active:scale-95 ${
                  isSelected ? "-translate-y-1 scale-110 z-10" : "hover:scale-105 opacity-90 hover:opacity-100"
                }`}
              >
                <CasinoChip
                  value={c}
                  className={`absolute inset-0 w-full h-full pointer-events-none transition-transform ${
                    isSelected ? "drop-shadow-[0_0_12px_rgba(255,215,0,0.9)] scale-105" : "drop-shadow-[0_2px_5px_rgba(0,0,0,0.6)]"
                  }`}
                />

                {/* Selection ring */}
                {isSelected && (
                  <span className="absolute inset-0 rounded-full ring-2 ring-[#FFD700] ring-offset-1 ring-offset-black/50 animate-pulse pointer-events-none" />
                )}

                <span
                  className={`relative z-10 text-[11px] font-black tracking-tight ${
                    isSelected
                      ? "text-[#FFD700] drop-shadow-[0_2px_3px_rgba(0,0,0,1)] scale-110"
                      : "text-white drop-shadow-[0_1.5px_2px_rgba(0,0,0,0.95)]"
                  }`}
                >
                  ${c}
                </span>
              </button>
            );
          })}
          <button
            key="50%"
            onClick={handleSelectFiftyPercent}
            className={`relative w-[52px] h-[48px] shrink-0 flex items-center justify-center transition-all duration-200 active:scale-95 ${
              selectedChip === "50%" ? "-translate-y-1 scale-110 z-10" : "hover:scale-105 opacity-90 hover:opacity-100"
            }`}
          >
            <CasinoChip
              value="50%"
              className={`absolute inset-0 w-full h-full pointer-events-none transition-transform ${
                selectedChip === "50%" ? "drop-shadow-[0_0_12px_rgba(255,215,0,0.9)] scale-105" : "drop-shadow-[0_2px_5px_rgba(0,0,0,0.6)]"
              }`}
            />
            {selectedChip === "50%" && (
              <span className="absolute inset-0 rounded-full ring-2 ring-[#FFD700] ring-offset-1 ring-offset-black/50 animate-pulse pointer-events-none" />
            )}
            <span
              className={`relative z-10 text-[11px] font-black tracking-tight ${
                selectedChip === "50%" ? "text-[#FFD700] drop-shadow-[0_2px_3px_rgba(0,0,0,1)] scale-110" : "text-white drop-shadow-[0_1.5px_2px_rgba(0,0,0,0.95)]"
              }`}
            >
              50%
            </span>
          </button>
        </div>

        <div className="flex items-center gap-1 mt-1.5">
          <p className="text-white text-[12px] shrink-0">Số tiền ($):</p>
          <input
            type="number"
            min="0"
            value={betAmount}
            onChange={(e) => {
              setBetAmount(Math.max(0, Number(e.target.value)));
              setSelectedChip(null);
            }}
            className="flex-1 h-9 rounded-lg bg-white px-2 text-center text-[#333] text-[13px] font-semibold outline-none min-w-0"
          />
          <button onClick={handleAdd} className="h-9 px-2.5 rounded-lg bg-[#4a097f] text-white text-[12px] font-semibold shrink-0">Mua hàng</button>
          <button onClick={handleReset} className="h-9 px-2.5 rounded-lg bg-[#cc0000] text-white text-[12px] font-semibold shrink-0">Đặt lại</button>
        </div>

        <button
          onClick={handlePlace}
          disabled={bettingClosed}
          className="mt-1.5 w-full h-11 rounded-xl bg-[#ff7a1a] text-white font-bold text-[15px] shadow-lg active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          Đặt cược
        </button>
      </footer>

      {bettingClosed && !isMaintenanceOrDisabled && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 backdrop-blur-sm pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-white bg-[#0A0E1A]/90 p-4 rounded-2xl border border-[#FFD700]/30 shadow-2xl">
            <Lock className="w-8 h-8 text-[#FFD700]" />
            <p className="font-bold text-sm">Đang chờ mở kết quả kỳ {period}</p>
          </div>
        </div>
      )}

      {/* Bảng Xác Nhận Đặt Cược (Bet Confirmation Modal) */}
      {confirmModalData && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121626] border border-[#FFD700]/40 rounded-2xl p-5 max-w-md w-full shadow-[0_0_30px_rgba(255,215,0,0.25)] animate-in fade-in zoom-in-95 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FFD700] via-[#FF8C00] to-[#b75a00] flex items-center justify-center text-[#3a1500] font-black shadow-md ring-1 ring-amber-300/40">
                  <Dices className="w-6 h-6 animate-spin" style={{ animationDuration: '6s' }} />
                </div>
                <div>
                  <h3 className="text-white font-bold text-base tracking-tight">Xác Nhận Đặt Cược</h3>
                  <p className="text-xs text-[#FFD700] font-semibold">{confirmModalData.gameTitle} · Kỳ #{confirmModalData.activePeriod}</p>
                </div>
              </div>
              <button
                onClick={() => setConfirmModalData(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Ticket List Table */}
            <div className="space-y-1.5">
              <p className="text-xs text-white/60 font-medium">Chi tiết ô cược ({confirmModalData.toSubmit.length} vé):</p>
              <div className="max-h-[170px] overflow-y-auto space-y-1.5 pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-amber-500/30">
                <div className="grid grid-cols-12 text-[11px] font-semibold text-white/50 px-2.5 py-1 bg-white/5 rounded-lg">
                  <span className="col-span-6">Cửa chọn</span>
                  <span className="col-span-3 text-center">Tỷ lệ</span>
                  <span className="col-span-3 text-right">Mức cược</span>
                </div>
                {confirmModalData.toSubmit.map((item, idx) => {
                  const oddsVal = item.odds || getEffectiveOdds(item) || 1.98;
                  return (
                    <div key={idx} className="grid grid-cols-12 text-xs items-center px-2.5 py-2 bg-white/[0.03] border border-white/5 rounded-lg hover:border-amber-500/30 transition-colors">
                      <span className="col-span-6 font-bold text-white truncate">{item.label}</span>
                      <span className="col-span-3 text-center font-bold text-[#FFD700]">{oddsVal}</span>
                      <span className="col-span-3 text-right font-extrabold text-emerald-400">${Number(item.amount).toLocaleString()} USD</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Financial Summary */}
            <div className="bg-gradient-to-br from-[#1a1f36] to-[#0f1222] p-3.5 rounded-xl border border-white/10 space-y-2 text-xs">
              <div className="flex justify-between items-center text-white/70">
                <span>Số dư hiện tại:</span>
                <span className="font-semibold text-white">${confirmModalData.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</span>
              </div>
              <div className="flex justify-between items-center text-amber-300 font-semibold pt-1 border-t border-white/10">
                <span>Tổng tiền cược ván này:</span>
                <span className="text-base font-black text-amber-400">${confirmModalData.total.toLocaleString()} USD</span>
              </div>
              <div className="flex justify-between items-center text-white/60 text-[11px]">
                <span>Số dư còn lại dự kiến:</span>
                <span className="font-semibold text-emerald-300">${(confirmModalData.currentBalance - confirmModalData.total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                disabled={isSubmitting}
                onClick={() => setConfirmModalData(null)}
                className="h-11 rounded-xl bg-white/10 hover:bg-white/15 text-white/80 font-bold text-sm transition-colors active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
              >
                Hủy bỏ
              </button>
              <button
                disabled={isSubmitting}
                onClick={executeBetSubmission}
                className="h-11 rounded-xl bg-gradient-to-r from-[#FF8C00] via-[#FFD700] to-[#FF8C00] hover:brightness-110 text-[#3a1500] font-black text-sm shadow-[0_0_18px_rgba(255,215,0,0.5)] active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none"
              >
                {isSubmitting ? (
                  <span className="font-bold animate-pulse text-[#3a1500]">Đang xử lý...</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-[#3a1500]" />
                    Xác nhận cược (${confirmModalData.total.toLocaleString()})
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Maintenance / Closed Immediate Lock & Auto Redirect Modal */}
      {isMaintenanceOrDisabled && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 text-center">
          <div className="bg-[#161936] border border-amber-500/50 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-8 h-8 text-amber-400 animate-pulse" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-base font-bold text-amber-300">Thông Báo Sảnh Chơi</h2>
              <p className="text-xs text-white/85 leading-relaxed">
                Sảnh chơi đang được Admin bảo trì để nâng cấp. Vui lòng quay lại sau.
              </p>
            </div>
            <div className="pt-2 border-t border-white/10 flex items-center justify-center gap-2 text-xs text-white/50">
              <span>Tự động quay về trang chủ sau</span>
              <span className="text-amber-400 font-extrabold font-mono text-sm px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                {redirectCount}s
              </span>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
