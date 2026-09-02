import { useState, useEffect, useCallback } from "react";
import { isSupabaseConfigured } from "./supabase";
import {
  spGetUserProfile,
  spFetchUserTransactions,
  spFetchUserWithdrawRequests,
  spSubscribeUserProfile,
  spUpdateUser,
  spFetchUserGameBets,
} from "./supabaseService";
import { emitSocketEvent } from "./socket";
import { queryClientInstance } from "./query-client";

// Kho dữ liệu cá nhân theo user (localStorage cache + Supabase DB sync)
const key = (userId) => `userdata_${userId}`;

export const defaultUserData = () => ({
  balance: 0,
  profit: 0,
  bets: [],
  txs: [],
  linked: [],
  turnover: 0,
  withdrawRequests: [], // Đơn rút tiền đang chờ admin duyệt
});

const listeners = new Set();

export const resolveUserId = (userId) => {
  if (userId) return String(userId);
  try {
    const raw = localStorage.getItem("user");
    if (raw) {
      const u = JSON.parse(raw);
      if (u?.id) return String(u.id);
      if (u?.account) return String(u.account);
      if (u?.email) return String(u.email);
    }
  } catch { /* ignore */ }
  return "guest_user";
};

export const getUserData = (userId) => {
  const uid = resolveUserId(userId);
  try {
    const raw = localStorage.getItem(key(uid));
    if (!raw) {
      const d = defaultUserData();
      localStorage.setItem(key(uid), JSON.stringify(d));
      return d;
    }
    return { ...defaultUserData(), ...JSON.parse(raw) };
  } catch {
    return defaultUserData();
  }
};

// Create BroadcastChannel for cross-tab user data synchronization
let userChannel = null;
if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
  try {
    userChannel = new BroadcastChannel("sands_user_realtime_channel");
    userChannel.onmessage = (e) => {
      if (e.data?.type === "USER_DATA_UPDATED" && e.data?.userId) {
        listeners.forEach((l) => l(e.data.userId));
        try {
          queryClientInstance.invalidateQueries({ queryKey: ["userData", e.data.userId] });
        } catch { /* ignore */ }
      }
    };
  } catch { /* ignore */ }
}

export const saveUserData = (userId, data, opts = {}) => {
  const uid = resolveUserId(userId);
  try {
    localStorage.setItem(key(uid), JSON.stringify(data));
    try {
      window.dispatchEvent(new CustomEvent("user-data-changed", { detail: { userId: uid, data } }));
      window.dispatchEvent(new CustomEvent("FORCE_BALANCE_SYNC", { detail: { userId: uid, balance: data?.balance } }));
    } catch { /* ignore */ }
  } catch (err) {
    // Test Case 3: Storage Limit & Boundary Value Test (QuotaExceededError Protection)
    if (err && (err.name === "QuotaExceededError" || err.code === 22 || err.code === 1014 || String(err).includes("quota"))) {
      try {
        const prunedBets = Array.isArray(data?.bets) ? data.bets.slice(-40) : [];
        const prunedTxs = Array.isArray(data?.txs) ? data.txs.slice(-30) : [];
        const prunedData = { ...data, bets: prunedBets, txs: prunedTxs };
        localStorage.setItem(key(uid), JSON.stringify(prunedData));
        data = prunedData;
        try {
          window.dispatchEvent(new CustomEvent("user-data-changed", { detail: { userId: uid, data: prunedData } }));
          window.dispatchEvent(new CustomEvent("FORCE_BALANCE_SYNC", { detail: { userId: uid, balance: prunedData?.balance } }));
        } catch { /* ignore */ }
      } catch { /* ignore fallback */ }
    }
  }
  listeners.forEach((l) => l(uid));

  // Sync with TanStack Query, BroadcastChannel & Socket.io
  try {
    queryClientInstance.setQueryData(["userData", uid], data);
    queryClientInstance.invalidateQueries({ queryKey: ["userData", uid] });
    emitSocketEvent("user:balance_change", { userId: uid, data });
    if (userChannel) {
      userChannel.postMessage({ type: "USER_DATA_UPDATED", userId: uid, data });
    }
  } catch { /* ignore */ }

  // Đẩy số dư mới nhất lên Supabase — đây là nguồn dữ liệu dùng để đồng bộ số dư
  // giữa các thiết bị (chơi game/thắng/thua trước đây chỉ lưu ở localStorage, khiến
  // số dư "biến mất" khi đổi thiết bị hoặc bị Supabase ghi đè ngược lại giá trị cũ).
  // `skipRemotePush` — dùng cho những lượt gọi CHỈ đang sao chép số dư TỪ Supabase VÀO
  // cache cục bộ (vd. syncFullAccountState, Realtime profile listener): đẩy ngược con số
  // vừa đọc được lên lại Supabase là thừa, và nguy hiểm hơn — nếu giữa lúc đọc và lúc đẩy
  // lại có 1 thao tác khác (đặt cược, tất toán vé...) vừa ghi số dư MỚI hơn lên Supabase,
  // lượt đẩy lại thừa này sẽ GHI ĐÈ số dư mới đó bằng số liệu cũ vừa đọc — đã tái hiện và
  // xác nhận trực tiếp (đặt cược trừ tiền thành công nhưng số dư bị đồng bộ nền ghi đè lại).
  if (!opts.skipRemotePush && isSupabaseConfigured() && uid && uid !== "guest_user" && typeof data?.balance === "number") {
    spUpdateUser(uid, { balance: data.balance }).catch(() => {});
  }
};

// Test Case 4: Network Recovery Event Listener
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    try {
      window.dispatchEvent(new CustomEvent("NETWORK_RECOVERED"));
    } catch { /* ignore */ }
  });
}

export const updateUserData = (userId, patch, opts = {}) => {
  const uid = resolveUserId(userId);
  const cur = getUserData(uid);
  let next = typeof patch === "function" ? patch(cur) : { ...cur, ...patch };

  // Nếu hàm cập nhật trả về CHÍNH object đầu vào (không có gì thay đổi — vd
  // settlePendingBets() chạy trên interval nhưng chưa có vé nào tới kỳ tất toán),
  // bỏ qua việc lưu để tránh gọi lại Socket.io + đẩy Supabase một cách dư thừa
  // (mỗi vài giây/lần) khi người dùng có vé đang PENDING.
  if (next === cur) return next;

  if (next && next.balance !== undefined) {
    const rawBal = next.balance;
    const cleanBal = parseFloat(String(rawBal).replace(/[^0-9.-]+/g, "")) || 0;
    next.balance = Math.max(0, +cleanBal.toFixed(2));
  }
  saveUserData(uid, next, opts);
  return next;
};

export const subscribeUserData = (cb) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

// Hàm đồng bộ toàn diện trạng thái tài khoản người dùng từ Supabase DB (Balance, Bank, Txs, WithdrawRequests)
export const syncFullAccountState = async (userId) => {
  if (!isSupabaseConfigured() || !userId || userId === "guest_user") return;

  try {
    const uid = resolveUserId(userId);
    const spProfile = await spGetUserProfile(uid);

    if (spProfile) {
      const curData = getUserData(uid);
      const patch = {};

      // 1. Đồng bộ Số Dư (Balance)
      if (typeof spProfile.balance === "number" && curData.balance !== spProfile.balance) {
        patch.balance = spProfile.balance;
      }

      // 2. Đồng bộ Thông tin Ngân hàng đã liên kết (Bank Info)
      if (spProfile.bank_info && spProfile.bank_info.bankName) {
        const bankObj = {
          id: "bank_sp_" + (spProfile.id || uid),
          type: "bank",
          bankName: spProfile.bank_info.bankName,
          accountNumber: spProfile.bank_info.accountNumber || "",
          holder: spProfile.bank_info.holder || spProfile.full_name || "",
        };
        const existingLinked = curData.linked || [];
        const hasBank = existingLinked.some((l) => l.type === "bank" && l.accountNumber === bankObj.accountNumber);
        if (!hasBank) {
          const filtered = existingLinked.filter((l) => l.type !== "bank");
          patch.linked = [bankObj, ...filtered];
        }
      }

      if (Object.keys(patch).length > 0) {
        // Chỉ đang sao chép số dư/thông tin ngân hàng TỪ Supabase VÀO cache cục bộ —
        // không đẩy ngược lên lại (xem giải thích skipRemotePush trong saveUserData).
        updateUserData(uid, patch, { skipRemotePush: true });
      }

      // 2.5. Đồng bộ Hồ Sơ (Tên, SĐT, Trạng thái khóa, Ghi chú Admin) xuống phiên hiện tại
      // & danh sách local_users — để tên/SĐT/khóa TK do Admin sửa trên thiết bị khác
      // (hoặc chính user đổi trên thiết bị khác) hiển thị đúng ở đây.
      try {
        const rawSession = localStorage.getItem("user");
        const session = rawSession ? JSON.parse(rawSession) : null;
        if (session && (session.id === spProfile.id || session.account === spProfile.account)) {
          const sessionPatch = {};
          if (spProfile.full_name !== undefined && spProfile.full_name !== session.full_name) sessionPatch.full_name = spProfile.full_name;
          if (spProfile.phone !== undefined && spProfile.phone !== session.phone) sessionPatch.phone = spProfile.phone;
          if (spProfile.admin_note !== undefined && spProfile.admin_note !== session.adminNote) sessionPatch.adminNote = spProfile.admin_note;
          if (typeof spProfile.locked === "boolean" && spProfile.locked !== session.locked) sessionPatch.locked = spProfile.locked;

          if (Object.keys(sessionPatch).length > 0) {
            const mergedSession = { ...session, ...sessionPatch };
            localStorage.setItem("user", JSON.stringify(mergedSession));
            window.dispatchEvent(new CustomEvent("session-profile-synced", { detail: mergedSession }));
          }

          const rawUsers = localStorage.getItem("local_users");
          const users = rawUsers ? JSON.parse(rawUsers) : [];
          const uIdx = users.findIndex((u) => u.id === spProfile.id || u.account === spProfile.account);
          if (uIdx !== -1) {
            let usersChanged = false;
            if (spProfile.full_name !== undefined && users[uIdx].full_name !== spProfile.full_name) {
              users[uIdx].full_name = spProfile.full_name;
              usersChanged = true;
            }
            if (spProfile.phone !== undefined && users[uIdx].phone !== spProfile.phone) {
              users[uIdx].phone = spProfile.phone;
              usersChanged = true;
            }
            if (spProfile.admin_note !== undefined && users[uIdx].adminNote !== spProfile.admin_note) {
              users[uIdx].adminNote = spProfile.admin_note;
              usersChanged = true;
            }
            if (typeof spProfile.locked === "boolean" && users[uIdx].locked !== spProfile.locked) {
              users[uIdx].locked = spProfile.locked;
              usersChanged = true;
            }
            if (usersChanged) {
              localStorage.setItem("local_users", JSON.stringify(users));
              window.dispatchEvent(new Event("local-users-changed"));
            }
          }
        }
      } catch { /* ignore */ }
    }

    // 3. Đồng bộ Lịch sử Giao dịch (Transactions)
    const spTxs = await spFetchUserTransactions(uid);
    if (spTxs && Array.isArray(spTxs) && spTxs.length > 0) {
      const curData = getUserData(uid);
      const localTxs = curData.txs || [];
      const mergedMap = new Map();

      // Thêm giao dịch local trước
      localTxs.forEach((tx) => mergedMap.set(tx.id, tx));

      // Merge giao dịch từ Supabase
      spTxs.forEach((tx) => {
        mergedMap.set(tx.id, {
          id: tx.id,
          type: tx.type,
          amount: Number(tx.amount),
          status: tx.status || "completed",
          method: tx.method || "System",
          reason: tx.reason || "",
          time: new Date(tx.created_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) + " " + new Date(tx.created_at).toLocaleDateString("vi-VN"),
          created_date: tx.created_at,
        });
      });

      const mergedList = Array.from(mergedMap.values()).sort(
        (a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0)
      );

      if (JSON.stringify(localTxs) !== JSON.stringify(mergedList)) {
        // Chỉ đang merge lịch sử giao dịch, không hề đổi số dư — nhưng patch object không
        // chứa `balance` vẫn kế thừa balance hiện có trong cache khi merge {...cur, ...patch},
        // nên vẫn phải chặn đẩy ngược để tránh vô tình ghi đè số dư mới hơn trên Supabase.
        updateUserData(uid, { txs: mergedList }, { skipRemotePush: true });
      }
    }

    // 4. Đồng bộ Đơn rút tiền (Withdraw Requests)
    const spWRs = await spFetchUserWithdrawRequests(uid);
    if (spWRs && Array.isArray(spWRs) && spWRs.length > 0) {
      const curData = getUserData(uid);
      const localWRs = curData.withdrawRequests || [];
      const wrMap = new Map();

      localWRs.forEach((w) => wrMap.set(w.id, w));
      spWRs.forEach((w) => {
        wrMap.set(w.id, {
          id: w.id,
          userId: w.user_id,
          account: w.account,
          amount: Number(w.amount),
          bankInfo: w.bank_info || {},
          status: w.status,
          created_at: w.created_at,
        });
      });

      const mergedWRs = Array.from(wrMap.values()).sort(
        (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
      );

      if (JSON.stringify(localWRs) !== JSON.stringify(mergedWRs)) {
        // Chỉ merge danh sách đơn rút tiền, không đổi số dư — chặn đẩy ngược cùng lý do trên.
        updateUserData(uid, { withdrawRequests: mergedWRs }, { skipRemotePush: true });
      }
    }

    // 5. Đồng bộ Lịch sử Đặt Cược (Bets) — vé đang chờ & đã tất toán hiển thị đúng trên mọi thiết bị
    const spBets = await spFetchUserGameBets(uid);
    if (spBets && Array.isArray(spBets) && spBets.length > 0) {
      const curData = getUserData(uid);
      const localBets = curData.bets || [];
      const betMap = new Map();

      localBets.forEach((b) => betMap.set(String(b.id || b.betId), b));

      spBets.forEach((row) => {
        const rid = String(row.id);
        const existing = betMap.get(rid);
        const remoteStatus = row.status === "win" ? "SETTLED_WIN" : row.status === "loss" ? "SETTLED_LOSE" : "PENDING";

        // Không hạ cấp vé đã tất toán cục bộ về "đang chờ" nếu CSDL chưa kịp đồng bộ xong
        if (existing && (existing.status === "SETTLED_WIN" || existing.status === "SETTLED_LOSE") && remoteStatus === "PENDING") {
          return;
        }

        const details = row.details || {};
        betMap.set(rid, {
          ...existing,
          id: rid,
          betId: rid,
          userId: row.user_id,
          gameId: row.game_type,
          game: details.game || existing?.game || row.game_type,
          period: details.period ?? existing?.period,
          amount: Number(row.amount),
          key: details.key || existing?.key,
          itemKey: details.key || existing?.itemKey,
          label: details.label || existing?.label,
          lockedOdds: details.lockedOdds ?? existing?.lockedOdds,
          odds: details.lockedOdds ?? existing?.odds,
          tabId: details.tabId ?? existing?.tabId,
          tabLabel: details.tabLabel || existing?.tabLabel,
          time: details.time || existing?.time,
          status: remoteStatus,
          result: row.status === "win" ? "win" : row.status === "loss" ? "loss" : existing?.result,
          winAmount: Number(row.payout) || 0,
          created_date: details.created_date || row.created_at,
          timestamp: details.created_date || row.created_at,
        });
      });

      const mergedBets = Array.from(betMap.values()).sort(
        (a, b) => new Date(a.created_date || 0) - new Date(b.created_date || 0)
      );

      if (JSON.stringify(localBets) !== JSON.stringify(mergedBets)) {
        // Chỉ merge lịch sử vé cược, không đổi số dư — chặn đẩy ngược cùng lý do trên. Đây
        // là điểm QUAN TRỌNG NHẤT trong 4 chỗ này: hàm này chạy trên cùng interval/focus với
        // lúc người dùng vừa đặt cược/vé vừa tất toán — nếu không chặn, dễ ghi đè đúng lúc
        // số dư vừa được trừ/cộng tiền thật sự (đã tái hiện và xác nhận trực tiếp: đặt cược
        // trừ tiền thành công nhưng bị đồng bộ nền ghi số dư cũ đè lại ngay sau đó).
        updateUserData(uid, { bets: mergedBets }, { skipRemotePush: true });
      }
    }
  } catch (e) {
    console.warn("Cross-device sync info:", e?.message);
  }
};

// React hook tiện lợi cho component với Realtime Supabase Sync
export const useUserData = (userId) => {
  const uid = resolveUserId(userId);
  const [data, setData] = useState(() => getUserData(uid));

  const refresh = useCallback(() => {
    const latest = getUserData(uid);
    setData((prev) => {
      if (JSON.stringify(prev) !== JSON.stringify(latest)) {
        return latest;
      }
      return prev;
    });
  }, [uid]);

  useEffect(() => {
    refresh();

    // 1. Initial full account state sync from Supabase DB
    if (isSupabaseConfigured() && uid && uid !== "guest_user") {
      syncFullAccountState(uid);
    }

    // 2. In-memory pub/sub
    const unsub = subscribeUserData((notifiedUid) => {
      if (!uid || notifiedUid === uid) refresh();
    });

    // 3. Realtime FORCE_BALANCE_SYNC event handler
    const handleForceSync = (e) => {
      if (!e.detail?.userId || e.detail.userId === uid) {
        refresh();
      }
    };
    window.addEventListener("FORCE_BALANCE_SYNC", handleForceSync);
    window.addEventListener("user-data-changed", handleForceSync);

    // 4. Cross-tab localStorage synchronization
    const handleStorage = (e) => {
      if (!e.key || e.key === key(uid)) {
        refresh();
      }
    };
    window.addEventListener("storage", handleStorage);

    // 5. Sync on window focus
    const handleFocus = () => {
      refresh();
      if (isSupabaseConfigured() && uid && uid !== "guest_user") {
        syncFullAccountState(uid);
      }
    };
    window.addEventListener("focus", handleFocus);

    // 6. Supabase Realtime User Profile Listener (Instant push across devices)
    let unsubRealtime = () => {};
    if (isSupabaseConfigured() && uid && uid !== "guest_user") {
      try {
        unsubRealtime = spSubscribeUserProfile(uid, (spProfile) => {
          if (spProfile) {
            if (typeof spProfile.balance === "number") {
              // Chỉ đang mirror số dư Realtime từ Supabase vào cache — chặn đẩy ngược
              // cùng lý do đã giải thích trong saveUserData.
              updateUserData(uid, { balance: spProfile.balance }, { skipRemotePush: true });
            }
            if (spProfile.locked) {
              window.dispatchEvent(new Event("local-users-changed"));
            }
          }
        });
      } catch (e) {
        console.warn("Realtime sub catch:", e?.message);
      }
    }

    // 7. Interval background sync (every 2.5 seconds)
    const timer = setInterval(() => {
      refresh();
      if (isSupabaseConfigured() && uid && uid !== "guest_user") {
        syncFullAccountState(uid);
      }
    }, 2500);

    return () => {
      unsub();
      unsubRealtime();
      window.removeEventListener("FORCE_BALANCE_SYNC", handleForceSync);
      window.removeEventListener("user-data-changed", handleForceSync);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleFocus);
      clearInterval(timer);
    };
  }, [uid, refresh]);

  const update = useCallback((patch) => updateUserData(uid, patch), [uid]);
  return { data, update, refresh };
};