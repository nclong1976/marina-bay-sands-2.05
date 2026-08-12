import { triggerAdminNotification } from "@/lib/adminNotifications";
import { isSupabaseConfigured } from "./supabase";
import { spSendChatMessage, spSubscribeChat } from "./supabaseService";
import { emitSocketEvent } from "./socket";
import { queryClientInstance } from "./query-client";

// Kho chat local (localStorage) — trao đổi tin nhắn giữa User, Admin & Super Admin (Bóng Ma).
const CHAT_KEY = "local_chat";
const SECRET_CHAT_KEY = "secret_chat_users";
const listeners = new Set();

const read = () => {
  try {
    const raw = localStorage.getItem(CHAT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const write = (msgs) => {
  try { localStorage.setItem(CHAT_KEY, JSON.stringify(msgs)); } catch { /* ignore */ }
  listeners.forEach((l) => l(read()));
  try {
    queryClientInstance.invalidateQueries({ queryKey: ["chatMessages"] });
  } catch { /* ignore */ }
};

// --- QUẢN LÝ DANH SÁCH TRÒ CHUYỆN BÍ MẬT (SECRET STEALTH CHAT FOR SUPER ADMIN) ---
export const getSecretChatUsers = () => {
  try {
    const raw = localStorage.getItem(SECRET_CHAT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const isSecretChatUser = (identifier) => {
  if (!identifier) return false;
  const list = getSecretChatUsers();
  const target = String(identifier).toLowerCase();
  return list.some((item) => String(item).toLowerCase() === target);
};

export const toggleSecretChatUser = (userId) => {
  if (!userId) return false;
  const list = getSecretChatUsers();
  const uid = String(userId);
  let nextList;
  let isSecretNow = false;
  if (list.includes(uid)) {
    nextList = list.filter((id) => id !== uid);
  } else {
    nextList = [...list, uid];
    isSecretNow = true;
  }
  try {
    localStorage.setItem(SECRET_CHAT_KEY, JSON.stringify(nextList));
    listeners.forEach((l) => l(read()));
  } catch { /* ignore */ }
  return isSecretNow;
};

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === CHAT_KEY || e.key === SECRET_CHAT_KEY) listeners.forEach((l) => l(read()));
  });
}

// Lấy toàn bộ luồng tin nhắn riêng của 1 người dùng (Luồng Client/User luôn hiển thị đầy đủ tin nhắn)
export const getUserThread = (userId) => {
  if (!userId) return [];
  const uid = String(userId);
  return read()
    .filter((m) => String(m.userId) === uid)
    .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
};

// Đọc danh sách tin nhắn có lọc quyền hạn (Stealth Mode)
export const getChatMessages = (viewerRole, currentUserId) => {
  const msgs = read();
  if (viewerRole === "super_admin") return msgs;
  if (currentUserId && viewerRole !== "admin") {
    return msgs.filter((m) => String(m.userId) === String(currentUserId));
  }
  const secrets = getSecretChatUsers();
  return msgs.filter((m) => !secrets.includes(String(m.userId)) && !m.isSecret);
};

export const getThread = (userId, viewerRole) => {
  if (!userId) return [];
  const uid = String(userId);
  const secrets = getSecretChatUsers();

  // Ẩn hội thoại bí mật chỉ đối với Admin thường (viewerRole === "admin")
  if (viewerRole === "admin" && secrets.includes(uid)) {
    return [];
  }

  return read()
    .filter((m) => String(m.userId) === uid)
    .filter((m) => viewerRole === "super_admin" || viewerRole !== "admin" || !m.isSecret)
    .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
};

export const getConversations = (viewerRole) => {
  const msgs = read();
  const secrets = getSecretChatUsers();
  const map = new Map();

  msgs.forEach((m) => {
    // Nếu viewer là Admin thường, ẩn hoàn toàn cuộc trò chuyện thuộc danh sách Bí Mật
    if (viewerRole !== "super_admin" && (secrets.includes(String(m.userId)) || m.isSecret)) {
      return;
    }
    const ex = map.get(m.userId);
    if (!ex || new Date(m.created_date) > new Date(ex.last)) {
      map.set(m.userId, {
        userId: m.userId,
        userEmail: m.userEmail,
        userName: m.userName,
        last: m.created_date,
        lastBody: m.body || (m.image ? "📷 Hình ảnh" : ""),
        isSecret: secrets.includes(String(m.userId)),
      });
    }
  });
  return Array.from(map.values()).sort((a, b) => new Date(b.last) - new Date(a.last));
};

export const addChatMessage = ({ userId, userEmail, userName, senderRole, body, image, isSecret }) => {
  const secrets = getSecretChatUsers();
  const isUserSecret = secrets.includes(String(userId)) || isSecret;

  const msg = {
    id: "m_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    userId,
    userEmail: userEmail || "",
    userName: userName || "",
    senderRole,
    body: body || "",
    image: image || "",
    isSecret: isUserSecret || false,
    created_date: new Date().toISOString(),
  };

  const msgs = read();
  msgs.push(msg);
  write(msgs);

  if (isSupabaseConfigured() && !isUserSecret) {
    spSendChatMessage({
      id: msg.id,
      userId: userId,
      username: userName || userEmail || 'User',
      message: body || (image ? '[Hình ảnh]' : ''),
    }).catch(() => {});
  }

  // Nếu là tin nhắn thường và không thuộc Secret Chat, mới báo cho Admin thường
  if (senderRole === "user" && !isUserSecret) {
    try {
      triggerAdminNotification(
        "chat",
        `Tin nhắn mới từ ${userName || userEmail || "Người dùng"}`,
        body || (image ? "[Hình ảnh đính kèm]" : "Đã gửi tin nhắn hỗ trợ")
      );
    } catch {}
  }

  // Emit Socket.io Event for live chat sync across devices
  try {
    emitSocketEvent("chat:send_message", msg);
  } catch { /* ignore */ }

  return msg;
};

// Hàm XÓA TIN NHẮN (Dành cho Super Admin)
export const deleteChatMessage = (msgId) => {
  if (!msgId) return false;
  const msgs = read().filter((m) => m.id !== msgId);
  write(msgs);
  return true;
};

export const subscribeChat = (cb) => {
  listeners.add(cb);

  let unsubSupabase = () => {};
  if (isSupabaseConfigured()) {
    unsubSupabase = spSubscribeChat((spMsg) => {
      if (spMsg) {
        const msgs = read();
        if (!msgs.some((m) => m.id === spMsg.id)) {
          msgs.push({
            id: spMsg.id,
            userId: spMsg.user_id,
            userName: spMsg.username,
            body: spMsg.message,
            created_date: spMsg.created_at,
          });
          write(msgs);
        }
      }
    });
  }

  return () => {
    listeners.delete(cb);
    unsubSupabase();
  };
};