import { computeDrawLabels } from "@/components/game/gameConfig";
import { getGameConfig, getFastForwardState, clearFastForwardState } from "@/lib/gameStore";
import { getUserData, updateUserData } from "./userData";
import { pushNotification } from "./localNotifications";
import { isSupabaseConfigured } from "./supabase";
import { spSyncGameBet, spGetUserProfile } from "./supabaseService";

// Fixed anchor epoch in seconds (e.g. 2026-01-01 00:00:00 UTC)
const ANCHOR_TIME = 1767225600;
const BASE_PERIOD = 1897400;

/**
 * Calculates current period number and remaining seconds in real-time.
 */
export function getCurrentRoundInfo(gameId) {
  const config = getGameConfig(gameId);
  const roundSec = config.timerDuration || config.roundSeconds || 60;
  const nowSec = Math.floor(Date.now() / 1000);

  const ff = getFastForwardState(gameId);
  let fastForwardActive = false;
  let extraElapsed = 0;

  if (ff && ff.active) {
    const realElapsed = (Date.now() - ff.startedAt) / 1000;
    extraElapsed = Math.floor(realElapsed * (ff.speedMultiplier || 6));
    fastForwardActive = true;
  }

  const elapsed = Math.max(0, nowSec - ANCHOR_TIME) + extraElapsed;
  const roundIndex = Math.floor(elapsed / roundSec);
  const currentPeriod = BASE_PERIOD + roundIndex;
  const secondsInRound = elapsed % roundSec;
  const remainingSeconds = Math.max(0, roundSec - secondsInRound);

  if (remainingSeconds <= 1 && ff && ff.active) {
    clearFastForwardState(gameId);
  }

  return {
    currentPeriod,
    remainingSeconds,
    roundSeconds: roundSec,
    isFastForwarding: fastForwardActive,
  };
}

/**
 * Deterministically generates draw numbers for a specific game and period.
 */
export function getPeriodDraw(gameId, period) {
  const config = getGameConfig(gameId);
  const drawCount = config.drawCount || 3;
  let str = `${gameId}_period_${period}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }

  const drawn = [];
  for (let i = 0; i < drawCount; i++) {
    hash = Math.imul(hash ^ (hash >>> 15), 0x85ebca6b);
    hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
    hash ^= hash >>> 16;
    drawn.push(Math.abs(hash) % 10);
  }
  return drawn;
}

/**
 * Evaluates whether a bet label matches a draw result.
 */
export function evaluateBetWin(itemLabel, drawn, config, itemKey) {
  const labels = computeDrawLabels(drawn, config.bigThreshold);
  const sum = labels.sum;

  // Extreme Big/Small
  if (itemKey === "LON_EXTREME" || itemLabel === "Cực Lớn" || itemLabel === "Lớn (Cực)") return sum >= 22;
  if (itemKey === "NHO_EXTREME" || itemLabel === "Cực nhỏ" || itemLabel === "Nhỏ (Cực)") return sum <= 5;

  // Normal Big/Small
  if (itemKey === "LON_NORMAL" || itemLabel === "Lớn") return labels.big === "Lớn";
  if (itemKey === "NHO_NORMAL" || itemLabel === "Nhỏ") return labels.big === "Nhỏ";

  // Parity
  if (itemKey === "DON_NORMAL" || itemLabel === "Đơn") return labels.parity === "Đơn";
  if (itemKey === "DOI_NORMAL" || itemLabel === "Đôi") return labels.parity === "Đôi";

  // Combo
  if (itemKey === "LON_DON" || itemLabel === "Đơn hàng lớn") return labels.big === "Lớn" && labels.parity === "Đơn";
  if (itemKey === "LON_DOI" || itemLabel === "Đôi lớn") return labels.big === "Lớn" && labels.parity === "Đôi";
  if (itemKey === "NHO_DON" || itemLabel === "Danh sách nhỏ") return labels.big === "Nhỏ" && labels.parity === "Đơn";
  if (itemKey === "NHO_DOI" || itemLabel === "Đôi nhỏ") return labels.big === "Nhỏ" && labels.parity === "Đôi";

  // Waves & Bao
  if (itemKey === "RED_WAVE" || itemLabel === "Sóng đỏ") return [3, 6, 9, 12, 15, 18, 21, 24].includes(sum);
  if (itemKey === "GREEN_WAVE" || itemLabel === "Sóng xanh") return [1, 4, 7, 10, 16, 19, 22, 25].includes(sum);
  if (itemKey === "BLUE_WAVE" || itemLabel === "Sóng xanh dương") return [2, 5, 8, 11, 17, 20, 23, 26].includes(sum);
  if (itemKey === "BAO" || itemLabel === "Báo") return drawn.length >= 3 && drawn[0] === drawn[1] && drawn[1] === drawn[2];

  // Bonus
  if (itemKey === "BONUS_LON" || itemLabel === "Bonus Lớn") return sum >= (config.bigThreshold || 14) + 2;
  if (itemKey === "BONUS_NHO" || itemLabel === "Bonus Nhỏ") return sum <= (config.bigThreshold || 14) - 2;

  // Casino / Table games
  if (itemLabel === "Player") return drawn[0] > drawn[1];
  if (itemLabel === "Banker") return drawn[1] > drawn[0];
  if (itemLabel === "Tie" || itemLabel === "Hòa") return drawn[0] === drawn[1];
  if (itemLabel === "Rồng") return drawn[0] > drawn[1];
  if (itemLabel === "Hổ") return drawn[1] > drawn[0];

  // Number match
  if (!isNaN(itemLabel)) {
    const num = Number(itemLabel);
    return drawn.includes(num) || sum === num;
  }

  return false;
}

// Khoá theo userId — hàm này giờ có 1 bước `await` (lấy số dư thật) trước khi ghi, nên
// KHÔNG còn chạy trọn vẹn trong 1 tick JS như trước nữa. Nếu không khoá, 2 lượt gọi
// chồng nhau cho CÙNG 1 user (vd. timer 1s trong màn chơi + timer 3s toàn cục cùng nổ
// gần nhau) có thể cùng đọc thấy 1 vé đang PENDING (vì lượt đầu chưa kịp ghi xong), rồi
// CẢ HAI cùng tính thắng thưởng cho đúng 1 vé đó — trả thưởng trùng lặp. Bản gốc (đồng
// bộ hoàn toàn) không có nguy cơ này; khoá này giữ nguyên tính an toàn đó.
const settlementInFlight = new Set();

/**
 * Settles all expired pending bets for a user atomically with idempotency control and locked odds snapshots.
 */
export async function settlePendingBets(userId) {
  if (!userId || settlementInFlight.has(userId)) return;
  const initialUserData = getUserData(userId);
  if (!initialUserData || !initialUserData.bets || initialUserData.bets.length === 0) return;

  const hasPending = initialUserData.bets.some(
    (b) => b.status === "PENDING" || b.status === "pending"
  );
  if (!hasPending) return;

  settlementInFlight.add(userId);
  try {
  // Lấy số dư THẬT từ Supabase làm mốc TRƯỚC khi cộng/trừ tiền thắng-thua — hàm này chạy
  // NỀN mỗi 3 giây cho MỌI người dùng đang đăng nhập (App.jsx GlobalBetSettler), nên nếu
  // cứ dùng số dư trong cache cục bộ (có thể đang lỗi thời do Admin vừa cộng/trừ tiền,
  // hoặc do cùng tài khoản đang mở ở thiết bị khác) làm mốc, số dư THẬT trên Supabase sẽ
  // bị GHI ĐÈ bằng 1 con số sai chỉ vì có 1 vé cược vừa tất toán — bug đã tái hiện và xác
  // nhận trực tiếp (số dư thật 500 bị ghi đè thành 999 chỉ vì 1 vé thua tất toán trong khi
  // cache cục bộ đang giữ 999 lỗi thời). Chỉ fetch khi THẬT SỰ có vé cần tất toán, để không
  // tốn thêm 1 lượt gọi Supabase mỗi 3 giây cho những người dùng không có vé đang chờ.
  let authoritativeBalance = null;
  if (isSupabaseConfigured()) {
    try {
      const spProfile = await spGetUserProfile(userId);
      if (spProfile && typeof spProfile.balance === "number") {
        authoritativeBalance = spProfile.balance;
      }
    } catch { /* ignore — rơi về cache cục bộ nếu Supabase lỗi/mất mạng */ }
  }

  let notificationsToSend = [];
  let betsToSync = [];

  updateUserData(userId, (latestDB) => {
    if (!latestDB || !latestDB.bets || latestDB.bets.length === 0) return latestDB;

    let hasChanges = false;
    let totalWinnings = 0;
    let profitAdd = 0;
    const newTxLogs = [];
    notificationsToSend = [];
    betsToSync = [];

    const updatedBets = latestDB.bets.map((bet) => {
      const isPending = bet.status === "PENDING" || bet.status === "pending";
      if (!isPending) return bet;

      const gameId = bet.gameId || "may-man-28";
      const roundInfo = getCurrentRoundInfo(gameId);

      if (roundInfo.currentPeriod > bet.period) {
        hasChanges = true;
        const config = getGameConfig(gameId);
        const drawn = getPeriodDraw(gameId, bet.period);
        const won = evaluateBetWin(bet.label, drawn, config, bet.key);
        const lockedOdds = Number(bet.lockedOdds ?? bet.odds ?? 1.98);

        if (won) {
          const payout = +(bet.amount * lockedOdds).toFixed(2);
          totalWinnings += payout;
          profitAdd += (payout - bet.amount);

          notificationsToSend.push({
            type: "result",
            title: `Thắng Cược Kỳ ${bet.period}`,
            body: `Cộng +$${payout} USD tại ${bet.game || gameId} (${bet.label})`,
          });

          newTxLogs.push({
            id: `tx_payout_${bet.id || bet.betId || Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            type: "payout",
            title: `Thắng Cược Kỳ ${bet.period}`,
            body: `+$${payout} USD · ${bet.game || gameId} (${bet.label})`,
            amount: payout,
            method: "Trả thưởng",
            status: "completed",
            time: new Date().toLocaleString("vi-VN"),
          });

          const settledWinBet = {
            ...bet,
            lockedOdds,
            status: "SETTLED_WIN",
            result: "win",
            winAmount: payout,
            settledAt: new Date().toISOString(),
          };
          betsToSync.push(settledWinBet);
          return settledWinBet;
        } else {
          profitAdd -= bet.amount;
          notificationsToSend.push({
            type: "result",
            title: `Kết Quả Kỳ ${bet.period}`,
            body: `Thua $${bet.amount} USD tại ${bet.game || gameId} (${bet.label})`,
          });

          const settledLoseBet = {
            ...bet,
            lockedOdds,
            status: "SETTLED_LOSE",
            result: "loss",
            winAmount: 0,
            settledAt: new Date().toISOString(),
          };
          betsToSync.push(settledLoseBet);
          return settledLoseBet;
        }
      }

      return bet;
    });

    if (!hasChanges) return latestDB;

    const currentDBBalance = authoritativeBalance !== null ? authoritativeBalance : (latestDB?.balance ?? 0);
    const newBalance = +(currentDBBalance + totalWinnings).toFixed(2);
    const newProfit = +((latestDB?.profit ?? 0) + profitAdd).toFixed(2);

    return {
      ...latestDB,
      balance: newBalance,
      profit: newProfit,
      bets: updatedBets,
      txs: [...newTxLogs, ...(latestDB?.txs || [])],
    };
  });

  if (notificationsToSend.length > 0) {
    try {
      window.dispatchEvent(new CustomEvent("FORCE_BALANCE_SYNC", { detail: { userId } }));
    } catch { /* ignore */ }

    notificationsToSend.forEach((notif) => {
      pushNotification(userId, notif);
    });
  }

  // Đẩy kết quả tất toán (thắng/thua) lên Supabase để mọi thiết bị thấy đúng lịch sử cược
  if (betsToSync.length > 0 && isSupabaseConfigured()) {
    betsToSync.forEach((b) => { spSyncGameBet(b).catch(() => {}); });
  }
  } finally {
    settlementInFlight.delete(userId);
  }
}
