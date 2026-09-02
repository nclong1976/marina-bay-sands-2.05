// Danh sách "trò chuyện bí mật" (Ghost Mode / Stealth) dành cho Super Admin —
// ẩn hoàn toàn 1 người dùng khỏi tầm nhìn của Admin thường trên các trang quản
// trị (Người dùng, Giao dịch, Đặt cược, Tổng quan, hàng đợi Nhắn tin).
//
// LƯU Ý: toàn bộ phần LƯU TRỮ tin nhắn (addChatMessage/addChatMessageV2/
// subscribeChat và các hàm đọc luồng liên quan) đã được gỡ khỏi file này —
// đó là hệ chat cũ ghi thẳng vào Supabase KHÔNG kèm conversation_id, và là
// nguyên nhân gốc của lỗi "tin nhắn gửi xong không hiển thị" đã phát hiện và
// sửa dữ liệu thủ công. Hệ chat thật hiện tại nằm ở src/lib/messagingService.js
// (schema conversations/messages/attachments), dùng bởi useTicketChat.js
// (phía người dùng) và useAdminTickets.js (phía Admin).
const SECRET_CHAT_KEY = "secret_chat_users";
const listeners = new Set();

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
    listeners.forEach((l) => l(nextList));
  } catch { /* ignore */ }
  return isSecretNow;
};

export const subscribeSecretChatUsers = (cb) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === SECRET_CHAT_KEY) listeners.forEach((l) => l(getSecretChatUsers()));
  });
}
