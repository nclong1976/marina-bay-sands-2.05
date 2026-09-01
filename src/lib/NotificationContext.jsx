import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import * as notif from "@/lib/localNotifications";
import { isSupabaseConfigured } from "@/lib/supabase";
import { spSubscribeUserNotifications } from "@/lib/supabaseService";

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const userId = user?.id;

  const [notifications, setNotifications] = useState(() => notif.getNotifications(userId));

  const refreshNotifs = useCallback(() => {
    if (!userId) return;
    const latest = notif.getNotifications(userId);
    setNotifications((prev) => {
      if (JSON.stringify(prev) !== JSON.stringify(latest)) {
        return latest;
      }
      return prev;
    });
  }, [userId]);

  useEffect(() => {
    refreshNotifs();
    if (!userId) return;

    const unsub = notif.subscribe(userId, () => refreshNotifs());

    const onCustomEvent = (e) => {
      if (!e.detail?.userId || e.detail.userId === userId) {
        refreshNotifs();
      }
    };
    const onStorage = (e) => {
      if (!e.key || e.key === `stargame_notif_${userId}`) refreshNotifs();
    };

    window.addEventListener("stargame_notif_update", onCustomEvent);
    window.addEventListener("storage", onStorage);

    const timer = setInterval(() => {
      refreshNotifs();
    }, 1000);

    // Khôi phục + kéo định kỳ thông báo Admin đã gửi từ Supabase — đây là bước bắt
    // buộc để thông báo thật sự tới được máy người dùng (trước đây Admin chỉ ghi vào
    // localStorage của chính máy Admin nên người dùng không bao giờ nhận được).
    let pollTimer;
    let unsubRealtime;
    if (isSupabaseConfigured()) {
      const pullNotifs = () => notif.hydrateUserNotifications(userId).then(refreshNotifs);
      pullNotifs();
      // Lưới an toàn phòng khi kết nối realtime bên dưới rớt/chưa kịp kết nối.
      pollTimer = setInterval(pullNotifs, 5000);

      // Đồng bộ THẬT theo thời gian thực: thông báo Admin gửi tới NGAY, không cần đợi
      // vòng poll 5s tiếp theo.
      unsubRealtime = spSubscribeUserNotifications(userId, (row) => {
        notif.mergeRemoteNotification(userId, row);
      });
    }

    return () => {
      unsub();
      window.removeEventListener("stargame_notif_update", onCustomEvent);
      window.removeEventListener("storage", onStorage);
      clearInterval(timer);
      if (pollTimer) clearInterval(pollTimer);
      if (unsubRealtime) unsubRealtime();
    };
  }, [userId, refreshNotifs]);

  const push = useCallback((n) => (userId ? notif.pushNotification(userId, n) : null), [userId]);
  const markAllRead = useCallback(() => userId && notif.markAllRead(userId), [userId]);
  const markRead = useCallback((id) => userId && notif.markRead(userId, id), [userId]);
  const remove = useCallback((id) => userId && notif.removeNotification(userId, id), [userId]);
  const clear = useCallback(() => userId && notif.clearAll(userId), [userId]);
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider value={{ notifications, unread, push, markAllRead, markRead, remove, clear }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) return { notifications: [], unread: 0, push: () => {}, markAllRead: () => {}, markRead: () => {}, remove: () => {}, clear: () => {} };
  return ctx;
}