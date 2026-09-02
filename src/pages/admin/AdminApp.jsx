import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/AuthContext";
import AdminShell from "@/components/admin/AdminShell";
import Overview from "./modules/Overview";
import Users from "./modules/Users";
import GameHalls from "./modules/GameHalls";
import Bets from "./modules/Bets";
import Transactions from "./modules/Transactions";
import Notifications from "./modules/Notifications";
import Settings from "./modules/Settings";
import Chat from "./modules/Chat";
import Banners from "./modules/Banners";
import { useAdminChat } from "@/hooks/useAdminChat";
import { useToast } from "@/components/ui/use-toast";
import { playChatMessageSound, playWithdrawalSound } from "@/lib/soundEffects";
import { spSubscribeAllWithdrawRequests } from "@/lib/supabaseService";
import { isSupabaseConfigured } from "@/lib/supabase";

const MODULES = {
  overview: Overview,
  users: Users,
  halls: GameHalls,
  bets: Bets,
  transactions: Transactions,
  notifications: Notifications,
  banners: Banners,
  settings: Settings,
  chat: Chat,
};

export default function AdminApp() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [active, setActive] = useState("overview");
  const Mod = MODULES[active] || Overview;

  // Lấy tổng unread từ conversations — hiển thị badge Bell trong AdminShell header
  const { totalUnread, conversations } = useAdminChat();

  // Báo tin nhắn mới (chuông + toast) — chạy ở đây (gốc AdminApp) để hoạt động bất kể
  // Admin đang xem trang nào, không chỉ khi mở sẵn trang Nhắn tin. So sánh unread_admin
  // trước/sau mỗi lần conversations cập nhật qua Realtime: chỉ phát khi số TĂNG (tin
  // nhắn user mới), bỏ qua lần tải đầu tiên để tránh dội chuông hàng loạt cho các hội
  // thoại chưa đọc có sẵn ngay khi Admin vừa đăng nhập.
  const prevUnreadRef = useRef(new Map());
  useEffect(() => {
    conversations.forEach((c) => {
      const prev = prevUnreadRef.current.get(c.id);
      const curr = c.unread_admin || 0;
      if (prev !== undefined && curr > prev) {
        const name = c.users_profile?.full_name || c.users_profile?.account || "Khách";
        playChatMessageSound();
        toast({ title: `💬 Tin nhắn mới từ ${name}`, description: c.last_message_body || "" });
      }
      prevUnreadRef.current.set(c.id, curr);
    });
  }, [conversations, toast]);

  // Báo yêu cầu rút tiền mới bằng chuông to — realtime toàn hệ thống, hoạt động dù Admin
  // đang ở trang nào, không cần mở sẵn trang Giao dịch.
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const unsub = spSubscribeAllWithdrawRequests((payload) => {
      if (payload.eventType === "INSERT" && payload.new?.status === "pending") {
        playWithdrawalSound();
        toast({
          title: "💸 Yêu cầu rút tiền mới",
          description: `${payload.new.full_name || payload.new.account} · $${Number(payload.new.amount).toLocaleString()} USD`,
          variant: "destructive",
        });
      }
    });
    return () => unsub();
  }, [toast]);

  const handleLogout = () => {
    logout("/login");
  };

  return (
    <AdminShell active={active} onNavigate={setActive} user={user} onLogout={handleLogout} unread={totalUnread}>
      <Mod />
    </AdminShell>
  );
}