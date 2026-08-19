// Cơ chế Duyệt / Từ chối đơn rút tiền dùng CHUNG cho toàn ứng dụng (thẻ người dùng trong
// Quản Lý Người Dùng, trang Quản Lý Giao Dịch...) — một nơi xử lý duy nhất để tránh lệch
// logic hoàn tiền/thông báo giữa các màn hình khác nhau.
import { localListUsers } from "@/lib/localAuth";
import { getUserData, updateUserData } from "@/lib/userData";
import { pushNotification } from "@/lib/localNotifications";
import {
  spListAllWithdrawRequests,
  spUpdateWithdrawRequestStatus,
  spGetUserProfile,
  spInsertNotifications,
} from "@/lib/supabaseService";
import { isSupabaseConfigured } from "@/lib/supabase";

const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Lấy tất cả đơn rút tiền đang chờ duyệt — Supabase là nguồn CHUẨN (thấy đơn dù người
// dùng gửi từ thiết bị nào), chỉ rơi về quét cache local từng user khi Supabase chưa
// cấu hình/lỗi mạng. Trả về mảng gọn { id, userId, amount, bank, createdAt }.
export async function listPendingWithdrawRequests() {
  if (isSupabaseConfigured()) {
    try {
      const rows = await spListAllWithdrawRequests();
      if (Array.isArray(rows)) {
        return rows
          .filter((r) => r.status === "pending")
          .map((r) => ({
            id: r.id,
            userId: r.user_id,
            amount: Number(r.amount) || 0,
            bank: r.bank_info || null,
            createdAt: r.created_at,
          }));
      }
    } catch {
      /* ignore — rơi về local nếu Supabase lỗi */
    }
  }

  const pending = [];
  localListUsers().forEach((u) => {
    const uData = getUserData(u.id);
    (uData.withdrawRequests || []).forEach((r) => {
      if (r.status === "pending") {
        pending.push({ id: r.id, userId: u.id, amount: r.amount, bank: r.bank || null, createdAt: r.createdAt });
      }
    });
  });
  return pending;
}

// Duyệt ("approved") hoặc từ chối ("rejected") một đơn rút tiền: cập nhật Supabase (nguồn
// chuẩn đa thiết bị), hoàn tiền vào số dư nếu từ chối, và báo kết quả cho người dùng —
// cả cục bộ (phản hồi tức thì) lẫn qua Supabase (để đến đúng thiết bị người dùng đã gửi).
export async function decideWithdrawRequest({ userId, requestId, amount, status }) {
  let authoritativeBalance = null;
  if (isSupabaseConfigured()) {
    await spUpdateWithdrawRequestStatus(requestId, status);
    if (status === "rejected") {
      try {
        const spProfile = await spGetUserProfile(userId);
        if (spProfile && typeof spProfile.balance === "number") {
          authoritativeBalance = spProfile.balance;
        }
      } catch {
        /* ignore */
      }
    }
  }

  updateUserData(userId, (d) => {
    const updatedReqs = (d.withdrawRequests || []).map((r) =>
      r.id === requestId ? { ...r, status } : r
    );
    const baseBalance = authoritativeBalance !== null ? authoritativeBalance : d.balance;
    const nextBalance = status === "rejected" ? +(baseBalance + amount).toFixed(2) : baseBalance;

    return {
      ...d,
      balance: nextBalance,
      withdrawRequests: updatedReqs,
      txs: (d.txs || []).map((t) =>
        t.txid === requestId ? { ...t, status: status === "approved" ? "completed" : "rejected" } : t
      ),
    };
  });

  const title = status === "approved" ? "Đơn rút tiền đã được duyệt!" : "Đơn rút tiền bị từ chối";
  const body =
    status === "approved"
      ? `Admin đã duyệt đơn rút $${amount.toLocaleString()} USD. Tiền sẽ về tài khoản ngân hàng trong ít phút.`
      : `Đơn rút $${amount.toLocaleString()} USD bị từ chối. Số tiền đã được hoàn lại vào số dư. Vui lòng liên hệ hỗ trợ để biết chi tiết.`;

  pushNotification(userId, { type: "balance", title, body });
  if (isSupabaseConfigured()) {
    spInsertNotifications([{ id: genId(), userId, type: "balance", title, body, audience: "user" }]).catch(() => {});
  }
}
