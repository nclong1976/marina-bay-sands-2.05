// Quản lý thông báo thời gian thực cho Admin Console
const ADMIN_NOTIF_KEY = "admin_notifications";
const listeners = new Set();

if (typeof window !== "undefined" && !window.adminBroadcastChannel) {
  try {
    window.adminBroadcastChannel = new BroadcastChannel("admin_channel");
    window.adminBroadcastChannel.onmessage = (event) => {
      if (event.data && event.data.type === "NEW_ADMIN_NOTIFICATION") {
        listeners.forEach((cb) => cb(getAdminNotifications()));
      }
    };
  } catch {
    // Fallback if BroadcastChannel is not supported
  }

  window.addEventListener("storage", (e) => {
    if (e.key === ADMIN_NOTIF_KEY) {
      listeners.forEach((cb) => cb(getAdminNotifications()));
    }
  });
}

export const getAdminNotifications = (viewerRole) => {
  try {
    const raw = localStorage.getItem(ADMIN_NOTIF_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (viewerRole !== "super_admin") {
      let secrets = [];
      try {
        const rawSec = localStorage.getItem("secret_chat_users");
        secrets = rawSec ? JSON.parse(rawSec) : [];
      } catch { /* ignore */ }

      return list.filter((n) => {
        if (n.isSecret) return false;
        if (n.userId && secrets.some((s) => String(s).toLowerCase() === String(n.userId).toLowerCase())) return false;
        // Check if title or message mentions a secret user
        if (secrets.some((s) => {
          const str = String(s).toLowerCase();
          return str.length > 2 && ((n.title || "").toLowerCase().includes(str) || (n.message || "").toLowerCase().includes(str));
        })) {
          return false;
        }
        return true;
      });
    }
    return list;
  } catch {
    return [];
  }
};

export const triggerAdminNotification = (type, title, message, extraData = {}) => {
  const existingNotifications = getAdminNotifications();
  const newNotification = {
    id: Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    type, // 'deposit', 'withdraw', 'chat', 'user'
    title,
    message,
    userId: extraData.userId || null,
    isSecret: extraData.isSecret || false,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    timestamp: new Date().toISOString(),
    read: false
  };

  const updated = [newNotification, ...existingNotifications];
  try {
    localStorage.setItem(ADMIN_NOTIF_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }

  // Phát BroadcastChannel để cập nhật UI ngay lập tức cho Admin Panel
  if (typeof window !== "undefined" && window.adminBroadcastChannel) {
    try {
      window.adminBroadcastChannel.postMessage({ type: 'NEW_ADMIN_NOTIFICATION', notification: newNotification });
    } catch {
      // ignore
    }
  }

  listeners.forEach((cb) => cb(updated));
  return newNotification;
};

export const markAdminNotificationRead = (id) => {
  const list = getAdminNotifications();
  const updated = list.map((n) => (n.id === id ? { ...n, read: true } : n));
  try {
    localStorage.setItem(ADMIN_NOTIF_KEY, JSON.stringify(updated));
  } catch {}
  listeners.forEach((cb) => cb(updated));
  return updated;
};

export const markAllAdminNotificationsRead = () => {
  const list = getAdminNotifications();
  const updated = list.map((n) => ({ ...n, read: true }));
  try {
    localStorage.setItem(ADMIN_NOTIF_KEY, JSON.stringify(updated));
  } catch {}
  listeners.forEach((cb) => cb(updated));
  return updated;
};

export const clearAdminNotifications = () => {
  try {
    localStorage.removeItem(ADMIN_NOTIF_KEY);
  } catch {}
  listeners.forEach((cb) => cb([]));
  return [];
};

export const subscribeAdminNotifications = (cb) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
