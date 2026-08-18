// Hệ thống thông báo cục bộ per-user (localStorage) — clean slate khi đăng ký.
import { localListUsers } from "@/lib/localAuth";
import { toast } from "@/components/ui/use-toast";
import { queryClientInstance } from "@/lib/query-client";
import { isSupabaseConfigured } from "@/lib/supabase";
import { spListUsers, spInsertNotifications, spFetchUserNotifications } from "@/lib/supabaseService";

const inboxKey = (userId) => `stargame_notif_${userId}`;
const ADMIN_LOG_KEY = "stargame_notif_adminlog";

const listeners = new Map(); // userId -> Set<cb>

const read = (userId) => {
  if (!userId) return [];
  try { return JSON.parse(localStorage.getItem(inboxKey(userId))) || []; } catch { return []; }
};
const write = (userId, list) => {
  try { localStorage.setItem(inboxKey(userId), JSON.stringify(list.slice(0, 100))); } catch { /* ignore */ }
  emit(userId);
  try {
    queryClientInstance.invalidateQueries({ queryKey: ["notifications", userId] });
    queryClientInstance.invalidateQueries({ queryKey: ["userData", userId] });
  } catch { /* ignore */ }
};
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const emit = (userId) => {
  listeners.get(userId)?.forEach((cb) => cb());
  try {
    window.dispatchEvent(new CustomEvent("stargame_notif_update", { detail: { userId } }));
  } catch { /* ignore */ }
};

export const getNotifications = (userId) => read(userId);

export const pushNotification = (userId, n) => {
  if (!userId) return null;
  const item = { id: genId(), time: new Date().toISOString(), read: false, type: "info", ...n };
  write(userId, [item, ...read(userId)]);

  try {
    const isWin = n.type === "result" && (n.title?.includes("Thắng") || n.title?.includes("Cộng"));
    toast({
      title: n.title || "Thông báo",
      description: n.body || "",
      variant: isWin ? "success" : n.type === "destructive" ? "destructive" : "default",
    });
  } catch {
    /* ignore if called outside react tree */
  }

  return item.id;
};

export const markRead = (userId, id) =>
  write(userId, read(userId).map((n) => (n.id === id ? { ...n, read: true } : n)));
export const markAllRead = (userId) =>
  write(userId, read(userId).map((n) => ({ ...n, read: true })));
export const removeNotification = (userId, id) =>
  write(userId, read(userId).filter((n) => n.id !== id));
export const clearAll = (userId) => write(userId, []);

// Lấy danh sách người dùng đầy đủ để chọn đối tượng nhận thông báo — ưu tiên Supabase
// (nguồn chuẩn, có TẤT CẢ user dù đăng ký ở thiết bị nào), chỉ rơi về cache cục bộ của
// máy Admin (có thể thiếu) nếu Supabase chưa cấu hình hoặc lỗi mạng.
const resolveNotificationTargets = async (group) => {
  let users = localListUsers();
  if (isSupabaseConfigured()) {
    try {
      const spUsers = await spListUsers();
      if (Array.isArray(spUsers) && spUsers.length > 0) {
        users = spUsers.map((u) => ({
          id: u.id,
          account: u.account,
          email: u.email,
          role: u.role,
          balance: Number(u.balance) || 0,
          locked: !!u.locked,
        }));
      }
    } catch { /* ignore — dùng danh sách cục bộ nếu Supabase lỗi */ }
  }

  if (group === "active") return users.filter((u) => !u.locked);
  if (group === "has_balance") return users.filter((u) => (u.balance || 0) > 0);
  if (group === "locked") return users.filter((u) => u.locked);
  if (group === "admins") return users.filter((u) => u.role === "admin");
  return users;
};

// Gửi tới nhóm người dùng cụ thể (Group Broadcast). Đẩy thẳng lên Supabase để thông
// báo chuyển phát THẬT tới máy của người dùng — trước đây chỉ ghi vào localStorage
// của chính máy Admin nên không ai khác thấy được, dù giao diện báo "gửi thành công".
export const sendToGroup = async (group, n) => {
  const targets = await resolveNotificationTargets(group);

  const logEntry = logAdmin({
    ...n,
    audience: group,
    target: group === "all" ? "Tất cả" : group,
    recipientCount: targets.length,
  });

  const rows = targets.map((u) => ({
    id: genId(),
    userId: u.id,
    type: n.type,
    title: n.title,
    body: n.body,
    broadcastId: logEntry.id,
    audience: group,
  }));

  // Ghi cục bộ ngay (không dùng pushNotification để tránh spam toast cho từng người
  // nhận trên chính màn hình Admin) — chỉ có tác dụng thật với user đã có trong cache
  // của máy Admin; việc chuyển phát thật sự nằm ở bước đẩy lên Supabase bên dưới.
  rows.forEach((r) => {
    write(r.userId, [{ ...r, time: new Date().toISOString(), read: false }, ...read(r.userId)]);
  });

  if (isSupabaseConfigured()) {
    spInsertNotifications(rows).catch(() => {});
  }

  return targets.length;
};

// Gửi tới mọi người dùng (broadcast).
export const broadcastNotification = (n) => {
  return sendToGroup("all", n);
};

// Gửi đích danh theo username (account).
export const sendToUser = async (account, n) => {
  const acc = String(account || "").trim().toLowerCase();
  const targets = await resolveNotificationTargets("all");
  const u = targets.find((x) => (x.account || "").toLowerCase() === acc || x.id === account || (x.email || "").toLowerCase() === acc);
  if (!u) return false;

  const logEntry = logAdmin({
    ...n,
    audience: "user",
    target: u.account || u.email || u.id,
    recipientCount: 1,
  });

  const row = {
    id: genId(),
    userId: u.id,
    type: n.type,
    title: n.title,
    body: n.body,
    broadcastId: logEntry.id,
    audience: "user",
  };
  write(u.id, [{ ...row, time: new Date().toISOString(), read: false }, ...read(u.id)]);

  if (isSupabaseConfigured()) {
    spInsertNotifications([row]).catch(() => {});
  }

  return true;
};

// Khôi phục thông báo từ Supabase vào hộp thư cục bộ của 1 người dùng — để thông báo
// Admin đã gửi hiển thị đúng ngay cả khi mở trên thiết bị/trình duyệt chưa từng nhận.
export const hydrateUserNotifications = async (userId) => {
  if (!isSupabaseConfigured() || !userId) return;
  try {
    const rows = await spFetchUserNotifications(userId);
    if (!rows || rows.length === 0) return;

    const existing = read(userId);
    const existingIds = new Set(existing.map((n) => n.id));
    let changed = false;
    const merged = [...existing];

    rows.forEach((row) => {
      if (!existingIds.has(row.id)) {
        merged.push({
          id: row.id,
          type: row.type || "info",
          title: row.title || "",
          body: row.body || "",
          broadcastId: row.broadcast_id,
          audience: row.audience,
          read: !!row.read,
          time: row.created_at,
        });
        existingIds.add(row.id);
        changed = true;
      }
    });

    if (changed) {
      merged.sort((a, b) => new Date(b.time) - new Date(a.time));
      write(userId, merged);
    }
  } catch { /* ignore */ }
};

// Thông báo cho các tài khoản quản trị (dùng khi người dùng nạp tiền…).
export const notifyAdmins = (n) => {
  return sendToGroup("admins", n);
};

// Lấy thống kê số lượt đã đọc (Read Counts & Rate) cho 1 bản ghi thông báo
export const getNotificationReadStats = (broadcastId) => {
  const users = localListUsers();
  let delivered = 0;
  let readCount = 0;

  users.forEach((u) => {
    const userNotifs = read(u.id);
    const match = userNotifs.find((x) => x.broadcastId === broadcastId);
    if (match) {
      delivered++;
      if (match.read) {
        readCount++;
      }
    }
  });

  const readRate = delivered > 0 ? Math.round((readCount / delivered) * 100) : 0;
  return { delivered, readCount, readRate };
};

// Nhật ký thông báo admin đã gửi.
export const getAdminLog = (viewerRole) => {
  try {
    const list = JSON.parse(localStorage.getItem(ADMIN_LOG_KEY)) || [];
    if (viewerRole !== "super_admin") {
      let secrets = [];
      try {
        const rawSec = localStorage.getItem("secret_chat_users");
        secrets = rawSec ? JSON.parse(rawSec) : [];
      } catch { /* ignore */ }

      return list.filter((item) => {
        if (!item.target) return true;
        const targetStr = String(item.target).toLowerCase();
        return !secrets.some((s) => String(s).toLowerCase() === targetStr);
      });
    }
    return list;
  } catch { return []; }
};
const logAdmin = (entry) => {
  const item = { id: genId(), time: new Date().toISOString(), ...entry };
  const list = getAdminLog();
  try { localStorage.setItem(ADMIN_LOG_KEY, JSON.stringify([item, ...list].slice(0, 100))); } catch { /* ignore */ }
  return item;
};
export const removeAdminLog = (id) => {
  const list = getAdminLog().filter((n) => n.id !== id);
  try { localStorage.setItem(ADMIN_LOG_KEY, JSON.stringify(list)); } catch { /* ignore */ }
};

// Lắng nghe thay đổi inbox của một user.
export const subscribe = (userId, cb) => {
  if (!userId) return () => {};
  if (!listeners.has(userId)) listeners.set(userId, new Set());
  listeners.get(userId).add(cb);
  return () => listeners.get(userId)?.delete(cb);
};