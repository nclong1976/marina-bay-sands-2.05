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
  spUpdateUser,
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
  let finalBalance = null;

  // Luôn lấy số dư THẬT từ Supabase (cho cả "approved" lẫn "rejected") và GHI THẲNG lên
  // Supabase TRƯỚC khi đụng đến cache cục bộ của Admin. Trước đây khi "approved", code
  // không hề fetch số dư thật — nó lấy balance từ cache cục bộ (d.balance, đọc qua
  // getUserData) rồi coi đó là "số dư mới" và ghi ĐÈ lên Supabase; nếu Admin chưa từng
  // mở dữ liệu người dùng này trên chính máy mình, cache đó trống/lỗi thời, nên việc
  // "Duyệt" một đơn rút vô tình GHI ĐÈ số dư THẬT của khách hàng bằng một con số sai —
  // bug đã tái hiện và xác nhận trực tiếp trên production (số dư 175.10 bị ghi đè thành
  // 999 chỉ vì "Duyệt" một đơn rút, do cache cục bộ đang giữ giá trị cũ).
  if (isSupabaseConfigured()) {
    await spUpdateWithdrawRequestStatus(requestId, status);

    const spProfile = await spGetUserProfile(userId);
    if (!spProfile || typeof spProfile.balance !== "number") {
      throw new Error("Không thể lấy số dư hiện tại để xử lý đơn rút tiền, vui lòng thử lại");
    }
    const authoritativeBalance = spProfile.balance;
    finalBalance = status === "rejected"
      ? +(authoritativeBalance + amount).toFixed(2)
      : authoritativeBalance;

    await spUpdateUser(userId, { balance: finalBalance });
  }

  updateUserData(userId, (d) => {
    const updatedReqs = (d.withdrawRequests || []).map((r) =>
      r.id === requestId ? { ...r, status } : r
    );
    const nextBalance = finalBalance !== null
      ? finalBalance
      : (status === "rejected" ? +((d.balance || 0) + amount).toFixed(2) : d.balance);

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
