import React, { useState } from "react";
import { LayoutDashboard, Users, Gamepad2, Ticket, ArrowLeftRight, Bell, Settings, LogOut, Menu, Shield, MessageSquare, Video, ChevronLeft, ChevronRight } from "lucide-react";

// Nhóm theo nghiệp vụ để dễ quét mắt hơn là 1 danh sách 9 mục liền mạch:
// Tổng quan riêng · Vận hành (người dùng/sảnh/cược/giao dịch) · Nội dung (thông báo/banner/nhắn tin) · Hệ thống.
const NAV_GROUPS = [
  [{ id: "overview", label: "Tổng quan", icon: LayoutDashboard }],
  [
    { id: "users", label: "Người dùng", icon: Users },
    { id: "halls", label: "Sảnh chơi", icon: Gamepad2 },
    { id: "bets", label: "Đặt cược", icon: Ticket },
    { id: "transactions", label: "Giao dịch", icon: ArrowLeftRight },
  ],
  [
    { id: "notifications", label: "Thông báo", icon: Bell },
    { id: "banners", label: "Quản lý Banner", icon: Video },
    { id: "chat", label: "Nhắn tin", icon: MessageSquare },
  ],
  [{ id: "settings", label: "Cài đặt", icon: Settings }],
];

const COLLAPSE_KEY = "admin_sidebar_collapsed";

export default function AdminShell({ active, onNavigate, user, onLogout, unread, children }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const go = (id) => { onNavigate(id); setOpen(false); };
  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };

  // isCollapsed chỉ áp dụng cho sidebar cố định trên desktop — sidebar mobile luôn hiện
  // đầy đủ nhãn vì nó là lớp phủ tạm thời, không tranh chỗ với nội dung chính.
  const renderSidebar = (isCollapsed) => (
    <div className="flex flex-col h-full">
      <div className={`h-14 flex items-center gap-2 border-b border-white/10 shrink-0 ${isCollapsed ? "justify-center px-2" : "px-4"}`}>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#7033ff] to-[#4b00ff] flex items-center justify-center shrink-0">
          <Shield className="w-4 h-4 text-white" />
        </div>
        {!isCollapsed && (
          <div className="min-w-0">
            <p className="text-white font-bold leading-none text-sm truncate">Sands</p>
            <p className="text-[10px] text-white/50 mt-0.5 truncate">Admin Console</p>
          </div>
        )}
      </div>

      <nav className="flex-1 p-2.5 overflow-y-auto">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi} className={gi > 0 ? "mt-2 pt-2 border-t border-white/5 space-y-0.5" : "space-y-0.5"}>
            {group.map((n) => {
              const Icon = n.icon;
              const on = active === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => go(n.id)}
                  title={isCollapsed ? n.label : undefined}
                  className={`w-full flex items-center gap-3 py-2 rounded-lg text-sm transition-colors border ${
                    isCollapsed ? "justify-center px-2" : "px-3"
                  } ${
                    on
                      ? "bg-gradient-to-r from-[#7033ff]/30 to-[#4b00ff]/20 text-white border-[#7033ff]/40"
                      : "text-white/65 hover:bg-white/5 hover:text-white border-transparent"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {!isCollapsed && <span className="truncate">{n.label}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="p-2.5 border-t border-white/10 shrink-0">
        <button
          onClick={onLogout}
          title={isCollapsed ? "Đăng xuất" : undefined}
          className={`w-full flex items-center gap-2 py-2 rounded-lg text-sm text-white/65 hover:bg-white/5 hover:text-white ${isCollapsed ? "justify-center px-2" : "px-3"}`}
        >
          <LogOut className="w-4 h-4 shrink-0" /> {!isCollapsed && "Đăng xuất"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-[100dvh] bg-[#0f1225] text-white flex">
      <aside className={`hidden lg:flex shrink-0 border-r border-white/10 bg-[#0c0e1f] sticky top-0 h-[100dvh] relative transition-[width] duration-200 ${collapsed ? "w-[68px]" : "w-56"}`}>
        {renderSidebar(collapsed)}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
          className="absolute -right-3 top-16 w-6 h-6 rounded-full bg-[#161936] border border-white/15 flex items-center justify-center text-white/60 hover:text-white hover:border-white/30 transition-colors z-10"
        >
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
      </aside>

      {open && (
        <>
          <div className="lg:hidden fixed inset-0 bg-black/60 z-40" onClick={() => setOpen(false)} />
          <aside className="lg:hidden fixed left-0 top-0 bottom-0 w-64 z-50 bg-[#0c0e1f] border-r border-white/10">{renderSidebar(false)}</aside>
        </>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-16 flex items-center gap-3 px-4 sm:px-6 border-b border-white/10 bg-[#0f1225]/90 backdrop-blur-md">
          <button className="lg:hidden p-2 rounded-lg hover:bg-white/10" onClick={() => setOpen(true)}><Menu className="w-5 h-5" /></button>
          <p className="text-sm text-white/50 hidden sm:block">Xin chào, <span className="text-white font-medium">{user?.full_name || user?.email || "Admin"}</span></p>
          <div className="ml-auto flex items-center gap-2">
            <button className="relative p-2 rounded-lg hover:bg-white/10"><Bell className="w-5 h-5 text-white/70" />{unread > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#ffab40]" />}</button>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#ffab40] to-[#e67e22] flex items-center justify-center font-bold text-white text-sm">{(user?.full_name || user?.email || "A").charAt(0).toUpperCase()}</div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-[1400px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
