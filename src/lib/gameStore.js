// Centralized Game Store: manages game statuses, countdown timers, payout odds, custom games list, and audit logs.
// Provides real-time synchronization across client and admin components.
import { emitSocketEvent } from './socket';
import { queryClientInstance } from './query-client';
import { isSupabaseConfigured } from './supabase';
import { spGetAppSetting, spSetAppSetting } from './supabaseService';

const SETTING_KEY = 'game_configs';

const STORAGE_KEY = "sands_game_store_config";
const AUDIT_LOG_KEY = "sands_game_audit_log";
const GAMES_STORAGE_KEY = "sands_custom_games_list";
const GAMES_LIST_VERSION_KEY = "sands_custom_games_version";
// Tăng số này khi danh sách mặc định (GAMES trong homeData.js) đổi cấu trúc theo cách cần
// ghi đè bản đã lưu của người dùng — v2: khôi phục đủ 9 thẻ, mỗi thẻ có 1 mã gameId RIÊNG
// (trước đó từng gộp 3 thẻ trùng gameId về còn 1, khiến bật/tắt tỷ lệ 1 thẻ ảnh hưởng luôn
// 2 thẻ kia). v3: đổi 9 mã gameId tạm ("-2"/"-3") sang đúng 9 mã + tên đã thiết kế sẵn
// theo vùng/quốc gia trong gamesData.js (mục Giải Thưởng). v4: bỏ title text (đặt lại về
// rỗng) vì tên trò chơi đã được vẽ sẵn ngay trong ảnh nền (bg) — set title làm chữ bị vẽ
// chồng lặp 2 lần chữ lên nhau trên thẻ, cùng khôi phục badge HOT bị rớt ở PK10 Đài Loan.
const GAMES_LIST_VERSION = "v4-restore-card-images";
const FAST_FORWARD_KEY = "sands_game_fast_forward_state";

// An toàn phòng hờ: giữ lại thẻ ĐẦU TIÊN cho mỗi gameId nếu vì lý do gì đó danh sách bị
// trùng trở lại (vd admin nhập tay mã Game ID trùng qua chỉnh sửa thủ công dữ liệu).
const dedupeByGameId = (list) => {
  const seen = new Set();
  return list.filter((g) => {
    const key = g.gameId || g.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const getCustomGames = (defaultGames) => {
  try {
    // Nâng cấp 1 LẦN cho mỗi trình duyệt: nếu danh sách đã lưu thuộc phiên bản cũ (trước
    // khi mỗi thẻ có gameId riêng), khôi phục về đủ 9 thẻ mặc định thay vì tiếp tục dùng
    // bản rút gọn trước đó.
    const storedVersion = localStorage.getItem(GAMES_LIST_VERSION_KEY);
    if (storedVersion !== GAMES_LIST_VERSION) {
      localStorage.setItem(GAMES_LIST_VERSION_KEY, GAMES_LIST_VERSION);
      saveCustomGames(defaultGames);
      return defaultGames;
    }

    const raw = localStorage.getItem(GAMES_STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : defaultGames;
    const deduped = dedupeByGameId(list);
    if (deduped.length !== list.length) {
      saveCustomGames(deduped);
    }
    return deduped;
  } catch {
    return defaultGames;
  }
};

export const saveCustomGames = (games) => {
  try {
    localStorage.setItem(GAMES_STORAGE_KEY, JSON.stringify(games));
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent("GAMES_LIST_UPDATED", { detail: games }));
  } catch {}
  if (realtimeChannel) {
    try {
      realtimeChannel.postMessage({ type: "GAMES_LIST_UPDATED", games });
    } catch {}
  }
};

// ── Fast Forward State Management ────────────────────────────
export const getFastForwardState = (gameId) => {
  try {
    const raw = localStorage.getItem(FAST_FORWARD_KEY);
    if (!raw) return null;
    const all = JSON.parse(raw);
    return all[gameId] || null;
  } catch {
    return null;
  }
};

export const triggerGameFastForward = (gameId, speedMultiplier = 6) => {
  try {
    const raw = localStorage.getItem(FAST_FORWARD_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[gameId] = {
      active: true,
      startedAt: Date.now(),
      speedMultiplier,
    };
    localStorage.setItem(FAST_FORWARD_KEY, JSON.stringify(all));
  } catch {}

  try {
    window.dispatchEvent(new CustomEvent("GAME_FAST_FORWARD", { detail: { gameId, speedMultiplier } }));
  } catch {}

  if (realtimeChannel) {
    try {
      realtimeChannel.postMessage({ type: "GAME_FAST_FORWARD", gameId, speedMultiplier });
    } catch {}
  }
};

export const clearFastForwardState = (gameId) => {
  try {
    const raw = localStorage.getItem(FAST_FORWARD_KEY);
    if (!raw) return;
    const all = JSON.parse(raw);
    delete all[gameId];
    localStorage.setItem(FAST_FORWARD_KEY, JSON.stringify(all));
  } catch {}
};

// Default game configurations
const DEFAULT_GAME_CONFIGS = {
  "may-man-28": {
    gameId: "may-man-28",
    title: "Hàn Quốc may mắn 28",
    status: "active", // "active" | "maintenance" | "disabled"
    timerDuration: 299, // 04:59 in seconds
    intermission: 10,
    boostMode: "OFF", // "ON" | "OFF"
    scheduledBoostTime: null, // e.g. "16:00"
    odds: {
      tai_xiu: 1.98,
      chan_le: 1.98,
      hoa: 95,
      cap_so: 12,
    },
    oddsSchedules: [],
  },
  xoso: {
    gameId: "xoso",
    title: "Thời gian Đài Loan",
    status: "active",
    timerDuration: 299,
    intermission: 10,
    boostMode: "OFF",
    scheduledBoostTime: null,
    odds: {
      tai_xiu: 1.98,
      chan_le: 1.98,
      hoa: 95,
      cap_so: 12,
    },
    oddsSchedules: [
      {
        id: "sched_xoso_vip",
        name: "Cấu hình Thưởng VIP Khung Tối",
        badgeText: "⭐ Thưởng Tỷ Lệ VIP",
        slots: [{ startTime: "18:00", endTime: "23:59" }],
        targetScope: "system",
        targetUsers: [],
        type: "manual",
        percentBoost: 0,
        odds: { tai_xiu: 2.05, chan_le: 2.05, hoa: 98, cap_so: 14 },
        active: true,
      },
    ],
  },
  pk10: {
    gameId: "pk10",
    title: "Đài Loan PK10",
    status: "active",
    timerDuration: 299,
    intermission: 10,
    boostMode: "OFF",
    scheduledBoostTime: null,
    odds: {
      tai_xiu: 1.98,
      chan_le: 1.98,
      hoa: 95,
      cap_so: 12,
    },
    oddsSchedules: [],
  },
};

const listeners = new Set();

// Create BroadcastChannel for cross-tab realtime sync
let realtimeChannel = null;
if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
  try {
    realtimeChannel = new BroadcastChannel("sands_game_realtime_channel");
    realtimeChannel.onmessage = (e) => {
      if (e.data?.type === "GAME_HALL_CONFIG_UPDATED" && e.data?.configs) {
        listeners.forEach((cb) => cb(e.data.configs));
      }
    };
  } catch {
    /* ignore */
  }
}

// Cross-tab localStorage listener fallback
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) {
      const current = getGameConfigs();
      listeners.forEach((cb) => cb(current));
    }
  });
}

export const getGameConfigs = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_GAME_CONFIGS;
    return { ...DEFAULT_GAME_CONFIGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_GAME_CONFIGS;
  }
};

export const getGameConfig = (gameId) => {
  const configs = getGameConfigs();
  return configs[gameId] || {
    gameId,
    title: gameId,
    status: "active",
    timerDuration: 299,
    intermission: 10,
    odds: { tai_xiu: 1.98, chan_le: 1.98, hoa: 95, cap_so: 12 },
  };
};

export const saveGameConfigs = (configs, fromRemote = false) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
  } catch {
    /* ignore */
  }

  // 1. Notify in-memory subscribers
  listeners.forEach((cb) => cb(configs));

  // 2. Dispatch custom events
  try {
    window.dispatchEvent(new CustomEvent("GAME_HALL_CONFIG_UPDATED", { detail: configs }));
    window.dispatchEvent(new CustomEvent("game-status-changed", { detail: configs }));
  } catch {
    /* ignore */
  }

  // 3. Post message over BroadcastChannel for cross-tab sync
  if (realtimeChannel) {
    try {
      realtimeChannel.postMessage({ type: "GAME_HALL_CONFIG_UPDATED", configs });
    } catch {
      /* ignore */
    }
  }

  // 4. Update TanStack Query cache & Emit Socket.io Event — chỉ phát khi đây là thay
  // đổi THẬT do chính máy này thực hiện, không phát lại khi chỉ đang áp dụng dữ liệu
  // vừa kéo VỀ từ Supabase (fromRemote=true), tránh dội sự kiện qua lại không cần thiết.
  try {
    queryClientInstance.setQueryData(['gameConfigs'], configs);
    queryClientInstance.invalidateQueries({ queryKey: ['gameConfigs'] });
    if (!fromRemote) {
      emitSocketEvent('game:config_change', { configs });
    }
  } catch {
    /* ignore */
  }

  // 5. Đẩy cấu hình lên Supabase — nguồn dữ liệu dùng để mọi thiết bị người dùng
  // (không chỉ máy Admin) đọc được cùng một cấu hình game trong thời gian thực.
  // Bỏ qua khi chính bản thân hàm này được gọi để ÁP DỤNG cấu hình vừa kéo VỀ từ
  // Supabase (fromRemote=true), tránh vòng lặp đẩy lên rồi lại kéo về vô ích.
  if (!fromRemote && isSupabaseConfigured()) {
    spSetAppSetting(SETTING_KEY, configs).catch(() => {});
  }
};

// Kéo cấu hình mới nhất từ Supabase và áp dụng cục bộ nếu khác với bản đang có —
// đây là cơ chế khiến thay đổi của Admin (bật/tắt game, đổi tỷ lệ, bảo trì...) thực
// sự tới được MỌI thiết bị người dùng, không chỉ riêng máy Admin.
const pullGameConfigsFromSupabase = async () => {
  if (!isSupabaseConfigured()) return;
  try {
    const row = await spGetAppSetting(SETTING_KEY);
    if (row && row.value && Object.keys(row.value).length > 0) {
      const current = getGameConfigs();
      if (JSON.stringify(current) !== JSON.stringify(row.value)) {
        saveGameConfigs(row.value, true);
      }
    }
  } catch {
    /* ignore */
  }
};

if (typeof window !== "undefined") {
  pullGameConfigsFromSupabase();
  setInterval(pullGameConfigsFromSupabase, 5000);
}

export const updateGameConfig = (gameId, patch, adminMeta = {}) => {
  const configs = getGameConfigs();
  const oldConfig = configs[gameId] || getGameConfig(gameId);
  const newConfig = { ...oldConfig, ...patch };

  // Write Audit Log
  const diffs = [];
  if (patch.status !== undefined && patch.status !== oldConfig.status) {
    diffs.push({ field: "Trạng thái (Status)", old: oldConfig.status, new: patch.status });
  }
  if (patch.timerDuration !== undefined && patch.timerDuration !== oldConfig.timerDuration) {
    diffs.push({
      field: "Thời gian cược (Timer)",
      old: formatMMSS(oldConfig.timerDuration),
      new: formatMMSS(patch.timerDuration),
    });
  }
  if (patch.odds !== undefined) {
    Object.keys(patch.odds).forEach((k) => {
      if (oldConfig.odds?.[k] !== patch.odds[k]) {
        diffs.push({
          field: `Tỷ lệ cược (${k})`,
          old: `1:${oldConfig.odds?.[k] ?? 0.98}`,
          new: `1:${patch.odds[k]}`,
        });
      }
    });
  }

  if (diffs.length > 0) {
    addAuditLog({
      adminId: adminMeta.adminId || "Admin",
      ip: adminMeta.ip || "127.0.0.1",
      gameId,
      gameTitle: newConfig.title || gameId,
      diffs,
    });
  }

  const updatedConfigs = { ...configs, [gameId]: newConfig };
  saveGameConfigs(updatedConfigs);
  return newConfig;
};

// ── Boost Mode (2.05 Odds Toggle & Fast Forward Trigger) ──────
export const setGameBoostMode = (gameId, mode, adminMeta = {}) => {
  const configs = getGameConfigs();
  const oldConfig = configs[gameId] || getGameConfig(gameId);

  const targetOdds = mode === "ON"
    ? { ...oldConfig.odds, tai_xiu: 2.05 }
    : { ...oldConfig.odds, tai_xiu: 1.98 };

  const patch = {
    boostMode: mode,
    odds: targetOdds,
    ...(mode === "OFF" ? { scheduledBoostTime: null } : {}),
  };

  const updatedConfig = updateGameConfig(gameId, patch, {
    adminId: adminMeta.adminId || "Admin",
    ip: adminMeta.ip || "127.0.0.1",
  });

  if (mode === "ON") {
    // Fast forward current round so new round starts immediately with 2.05 odds
    triggerGameFastForward(gameId, 6);
  } else {
    clearFastForwardState(gameId);
  }

  return updatedConfig;
};

export const setGameBoostSchedule = (gameId, timeStr, adminMeta = {}) => {
  const patch = { scheduledBoostTime: timeStr || null };
  return updateGameConfig(gameId, patch, {
    adminId: adminMeta.adminId || "Admin",
    ip: adminMeta.ip || "127.0.0.1",
  });
};

// Background Interval for Scheduled Boost Timer Execution
if (typeof window !== "undefined") {
  setInterval(() => {
    try {
      const configs = getGameConfigs();
      const now = new Date();
      const currentHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

      Object.keys(configs).forEach((gameId) => {
        const cfg = configs[gameId];
        if (cfg.scheduledBoostTime && cfg.scheduledBoostTime === currentHHMM && cfg.boostMode !== "ON") {
          setGameBoostMode(gameId, "ON", { adminId: "HệThống_HẹnGiờ", ip: "Auto_Scheduled" });
          window.dispatchEvent(new CustomEvent("GAME_BOOST_SCHEDULE_TRIGGERED", {
            detail: { gameId, title: cfg.title || gameId, time: currentHHMM }
          }));
        }
      });
    } catch {}
  }, 5000);
}

export const subscribeGameStore = (cb) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

// ── Audit Logs ──────────────────────────────────────────────
export const getAuditLogs = () => {
  try {
    const raw = localStorage.getItem(AUDIT_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const addAuditLog = (entry) => {
  const logItem = {
    id: "log_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    timestamp: new Date().toLocaleString("vi-VN"),
    isoTime: new Date().toISOString(),
    adminId: entry.adminId || "Admin",
    ip: entry.ip || "127.0.0.1",
    gameId: entry.gameId,
    gameTitle: entry.gameTitle,
    diffs: entry.diffs || [],
  };

  const logs = getAuditLogs();
  const nextLogs = [logItem, ...logs].slice(0, 200); // Keep last 200 logs
  try {
    localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(nextLogs));
  } catch {
    /* ignore */
  }
  return logItem;
};

// Utility: format seconds into MM:SS
export const formatMMSS = (totalSeconds) => {
  const secs = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

// Utility: parse MM:SS string into seconds
export const parseMMSS = (str) => {
  if (!str) return 299;
  const parts = str.split(":");
  if (parts.length === 2) {
    const m = parseInt(parts[0], 10) || 0;
    const s = parseInt(parts[1], 10) || 0;
    return m * 60 + s;
  }
  return parseInt(str, 10) || 299;
};

// ── Automated Odds Scheduler Engine ─────────────────────────

/**
 * Checks whether the current time (or given Date) falls within any of the scheduled slots.
 */
export const isTimeInSlots = (slots, now = new Date()) => {
  if (!slots || !Array.isArray(slots) || slots.length === 0) return false;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  return slots.some((slot) => {
    if (!slot.startTime || !slot.endTime) return false;
    const [startH, startM] = slot.startTime.split(":").map(Number);
    const [endH, endM] = slot.endTime.split(":").map(Number);
    const startTotal = (startH || 0) * 60 + (startM || 0);
    const endTotal = (endH || 0) * 60 + (endM || 0);

    if (startTotal <= endTotal) {
      return currentMinutes >= startTotal && currentMinutes <= endTotal;
    } else {
      // Crosses midnight (e.g. 23:00 to 02:00)
      return currentMinutes >= startTotal || currentMinutes <= endTotal;
    }
  });
};

/**
 * Calculates effective odds and active event rule for a given user & game in real-time.
 */
export const getEffectiveGameOdds = (gameId, userId = null, userAccount = null, now = new Date()) => {
  const config = getGameConfig(gameId);
  const baseOdds = config.odds || { tai_xiu: 0.98, chan_le: 0.98, hoa: 95, cap_so: 12 };
  const schedules = config.oddsSchedules || [];

  const activeSchedules = schedules.filter((s) => s.active && isTimeInSlots(s.slots, now));

  if (activeSchedules.length === 0) {
    return {
      odds: baseOdds,
      activeRule: null,
      isBoosted: false,
    };
  }

  // Priority 1: User specific target rule
  let matchedRule = null;
  if (userId || userAccount) {
    matchedRule = activeSchedules.find((s) => {
      if (s.targetScope !== "users" || !Array.isArray(s.targetUsers)) return false;
      return s.targetUsers.some((u) => {
        const cleanU = String(u).trim().toLowerCase();
        return (
          (userId && String(userId).toLowerCase() === cleanU) ||
          (userAccount && String(userAccount).toLowerCase() === cleanU)
        );
      });
    });
  }

  // Priority 2: System-wide rule
  if (!matchedRule) {
    matchedRule = activeSchedules.find((s) => s.targetScope === "system");
  }

  if (!matchedRule) {
    return {
      odds: baseOdds,
      activeRule: null,
      isBoosted: false,
    };
  }

  // Compute calculated odds
  let calculatedOdds = { ...baseOdds };

  if (matchedRule.type === "percent") {
    const boostMult = 1 + (Number(matchedRule.percentBoost) || 0) / 100;
    Object.keys(baseOdds).forEach((key) => {
      calculatedOdds[key] = +(baseOdds[key] * boostMult).toFixed(2);
    });
  } else if (matchedRule.type === "manual" && matchedRule.odds) {
    Object.keys(matchedRule.odds).forEach((key) => {
      if (matchedRule.odds[key] !== undefined && matchedRule.odds[key] !== null) {
        calculatedOdds[key] = Number(matchedRule.odds[key]);
      }
    });
  }

  return {
    odds: calculatedOdds,
    activeRule: matchedRule,
    isBoosted: true,
  };
};

/**
 * Add a new odds schedule rule to a game
 */
export const addOddsScheduleRule = (gameId, ruleData) => {
  const configs = getGameConfigs();
  const config = configs[gameId] || getGameConfig(gameId);
  const currentSchedules = config.oddsSchedules || [];

  const newRule = {
    id: "sched_" + Date.now().toString(36),
    name: ruleData.name || "Lịch Đổi Tỷ Lệ Mới",
    badgeText: ruleData.badgeText || "🔥 Giờ Vàng X2 Thưởng",
    slots: ruleData.slots || [{ startTime: "12:00", endTime: "14:00" }],
    targetScope: ruleData.targetScope || "system", // "system" | "users"
    targetUsers: Array.isArray(ruleData.targetUsers) ? ruleData.targetUsers : [],
    type: ruleData.type || "percent", // "percent" | "manual"
    percentBoost: Number(ruleData.percentBoost) || 10,
    odds: ruleData.odds || { tai_xiu: 1.08, chan_le: 1.08, hoa: 105, cap_so: 15 },
    active: ruleData.active !== undefined ? ruleData.active : true,
  };

  const updatedSchedules = [newRule, ...currentSchedules];
  const updatedConfig = { ...config, oddsSchedules: updatedSchedules };

  const updatedConfigs = { ...configs, [gameId]: updatedConfig };
  saveGameConfigs(updatedConfigs);
  return updatedConfig;
};

/**
 * Update an existing odds schedule rule
 */
export const updateOddsScheduleRule = (gameId, ruleId, patch) => {
  const configs = getGameConfigs();
  const config = configs[gameId] || getGameConfig(gameId);
  const currentSchedules = config.oddsSchedules || [];

  const updatedSchedules = currentSchedules.map((rule) => {
    if (rule.id === ruleId) {
      return { ...rule, ...patch };
    }
    return rule;
  });

  const updatedConfig = { ...config, oddsSchedules: updatedSchedules };

  const updatedConfigs = { ...configs, [gameId]: updatedConfig };
  saveGameConfigs(updatedConfigs);
  return updatedConfig;
};

/**
 * Delete an odds schedule rule
 */
export const deleteOddsScheduleRule = (gameId, ruleId) => {
  const configs = getGameConfigs();
  const config = configs[gameId] || getGameConfig(gameId);
  const currentSchedules = config.oddsSchedules || [];

  const updatedSchedules = currentSchedules.filter((r) => r.id !== ruleId);
  const updatedConfig = { ...config, oddsSchedules: updatedSchedules };

  const updatedConfigs = { ...configs, [gameId]: updatedConfig };
  saveGameConfigs(updatedConfigs);
  return updatedConfig;
};

/**
 * Toggle active state of a schedule rule
 */
export const toggleOddsScheduleRule = (gameId, ruleId) => {
  const configs = getGameConfigs();
  const config = configs[gameId] || getGameConfig(gameId);
  const currentSchedules = config.oddsSchedules || [];

  const updatedSchedules = currentSchedules.map((rule) => {
    if (rule.id === ruleId) {
      return { ...rule, active: !rule.active };
    }
    return rule;
  });

  const updatedConfig = { ...config, oddsSchedules: updatedSchedules };

  const updatedConfigs = { ...configs, [gameId]: updatedConfig };
  saveGameConfigs(updatedConfigs);
  return updatedConfig;
};
