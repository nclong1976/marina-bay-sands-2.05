import React, { useState, useEffect, useRef } from "react";
import { Lock } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import AdminShell, { SUPER_ADMIN_ONLY_MODULES } from "@/components/admin/AdminShell";
import Overview from "./modules/Overview";
import Users from "./modules/Users";
import GameHalls from "./modules/GameHalls";
import Bets from "./modules/Bets";
import Transactions from "./modules/Transactions";
import Notifications from "./modules/Notifications";
import Settings from "./modules/Settings";
import Chat from "./modules/Chat";
import Banners from "./modules/Banners";
import { AdminChatProvider, useAdminChatContext } from "@/lib/AdminChatContext";
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

function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
        <Lock className="w-6 h-6 text-white/40" />
      </div>
      <p className="text-white font-semibold">Không đủ quyền truy cập</p>
      <p className="text-white/50 text-sm max-w-xs">Chỉ tài khoản Super Admin mới có quyền xem và thao tác ở mục này.</p>
    </div>
  );
}

export default function AdminApp() {
  const { user, logout } = useAuth();
  const handleLogout = () => logout("/login");

  // useAdminTickets() sống ở ĐÚNG 1 nơi (bên trong Provider này) — AdminShell
  // (badge chuông) và trang Nhắn tin bên dưới đều đọc chung 1 bản state qua
  // useAdminChatContext(), không còn 2 bản độc lập có thể lệch nhau.
  return (
    <AdminChatProvider user={user}>
      <AdminAppInner user={user} onLogout={handleLogout} />
    </AdminChatProvider>
  );
}

function AdminAppInner({ user, onLogout }) {
  const { toast } = useToast();
  const [active, setActive] = useState("overview");
  const isSuperAdmin = user?.role === "super_admin";
  // Chặn ở tầng render (không chỉ ở menu điều hướng) — phòng trường hợp `active` bằng
  // cách nào đó rơi vào 1 module giới hạn (vd. đổi quyền ngay giữa phiên) mà không đi
  // qua click menu của AdminShell.
  const isRestricted = SUPER_ADMIN_ONLY_MODULES.includes(active) && !isSuperAdmin;
  const Mod = isRestricted ? AccessDenied : (MODULES[active] || Overview);

  const { totalUnread, conversations } = useAdminChatContext();

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
        toast({ title: `💬 Tin nhắn mới từ ${name}`, description: c.last_message_preview || "" });
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

  return (
    <AdminShell active={active} onNavigate={setActive} user={user} onLogout={onLogout} unread={totalUnread}>
      <Mod />
    </AdminShell>
  );
}
