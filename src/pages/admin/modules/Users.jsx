import React, { useEffect, useMemo, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  UserCheck,
} from "lucide-react";
import { Panel, inputCls, ConfirmDialog } from "../ui";
import { localListUsers, adminToggleLock, adminDeleteUser } from "@/lib/localAuth";
import { isSecretChatUser } from "@/lib/localChat";
import { getUserData, updateUserData } from "@/lib/userData";
import { useAuth } from "@/lib/AuthContext";
import { spListUsers } from "@/lib/supabaseService";
import { isSupabaseConfigured } from "@/lib/supabase";
import { listPendingWithdrawRequests, decideWithdrawRequest } from "@/lib/withdrawActions";

import EditUserModal from "./EditUserModal";
import BalanceAdjustModal from "./BalanceAdjustModal";
import UserBankCard from "./UserBankCard";

const PAGE = 9;

export default function Users() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);

  // Modals state
  const [editUser, setEditUser] = useState(null);
  const [balanceUser, setBalanceUser] = useState(null);
  const [balanceMode, setBalanceMode] = useState("add");
  const [delUser, setDelUser] = useState(null);
  const [withdrawConfirm, setWithdrawConfirm] = useState(null); // { user, request, status }

  const openBalanceModal = (u, mode) => {
    setBalanceMode(mode);
    setBalanceUser(u);
  };

  // Load & merge danh sách người dùng — Supabase là nguồn dữ liệu CHUẨN (chứa TẤT CẢ tài
  // khoản đã đăng ký/hoạt động trên BẤT KỲ thiết bị nào), local storage & Base44 chỉ bổ
  // sung cho những trường hợp chưa kịp đồng bộ lên Supabase (offline, chưa cấu hình...).
  const isHiddenFromViewer = useCallback((u) => {
    return (
      currentUser?.role !== "super_admin" &&
      (u.role === "super_admin" ||
        (u.account || "").toLowerCase() === "leo1102" ||
        isSecretChatUser(u.id) ||
        isSecretChatUser(u.account) ||
        isSecretChatUser(u.email))
    );
  }, [currentUser?.role]);

  // Tổng nạp/rút để hiện gọn trên thẻ — cộng dồn lịch sử giao dịch cục bộ của người dùng:
  // nạp = các lần Admin cộng tiền, rút = đơn rút đã được duyệt (bỏ qua đơn đang chờ/từ chối).
  const computeTxTotals = (userId) => {
    const txs = getUserData(userId).txs || [];
    let totalDeposit = 0;
    let totalWithdraw = 0;
    txs.forEach((t) => {
      if (t.type === "ADMIN_DEPOSIT") totalDeposit += Number(t.amount) || 0;
      else if (t.type === "ADMIN_WITHDRAW") totalWithdraw += Number(t.amount) || 0;
      else if (t.type === "withdraw" && t.status === "completed") totalWithdraw += Number(t.amount) || 0;
    });
    return { totalDeposit, totalWithdraw };
  };

  const loadUsers = useCallback(async () => {
    let bUsers = [];
    try {
      bUsers = await base44.entities.User.list();
    } catch {
      /* ignore fallback */
    }

    let spUsers = [];
    if (isSupabaseConfigured()) {
      try {
        const rows = await spListUsers();
        if (Array.isArray(rows)) spUsers = rows;
      } catch {
        /* ignore — rơi về local/base44 nếu Supabase lỗi */
      }
    }

    const lUsers = localListUsers(currentUser?.role);
    const mapByAccOrId = new Map();

    // 1. Supabase (nguồn chuẩn — đa thiết bị)
    spUsers.forEach((row) => {
      const u = {
        id: row.id,
        account: row.account,
        email: row.email,
        full_name: row.full_name,
        phone: row.phone,
        role: row.role || "user",
        balance: typeof row.balance === "number" ? row.balance : 0,
        locked: !!row.locked,
        adminNote: row.admin_note || "",
        bankInfo: row.bank_info && row.bank_info.bankName ? row.bank_info : null,
        created_date: row.created_at,
      };
      if (isHiddenFromViewer(u)) return;
      const key = (u.account || u.id || u.email || "").toLowerCase();
      mapByAccOrId.set(key, u);
    });

    // 2. Local cache — chỉ bổ sung tài khoản CHƯA có trên Supabase, không ghi đè dữ liệu chuẩn
    lUsers.forEach((u) => {
      if (isHiddenFromViewer(u)) return;
      const key = (u.account || u.id || u.email || "").toLowerCase();
      if (mapByAccOrId.has(key)) return;
      const uData = getUserData(u.id);
      const curBal = uData.balance !== undefined ? uData.balance : (u.balance || 0);
      const bankLinked = uData.linked?.find((l) => l.type === "bank") || u.bankInfo || null;

      mapByAccOrId.set(key, {
        ...u,
        balance: curBal,
        bankInfo: bankLinked,
      });
    });

    // 3. Base44 (legacy) — chỉ bổ sung nếu còn thiếu
    bUsers.forEach((u) => {
      if (isHiddenFromViewer(u)) return;
      const key = (u.account || u.id || u.email || "").toLowerCase();
      if (!mapByAccOrId.has(key)) {
        const uData = getUserData(u.id);
        const curBal = uData.balance !== undefined ? uData.balance : (u.balance || 0);
        const bankLinked = uData.linked?.find((l) => l.type === "bank") || null;

        mapByAccOrId.set(key, {
          ...u,
          balance: curBal,
          bankInfo: bankLinked,
        });
      }
    });

    // 4. Đơn rút tiền đang chờ duyệt — gắn thẳng vào từng người dùng tương ứng để hiện
    // ngay trên mặt thẻ, admin không cần mở riêng tab Giao dịch mới thấy được.
    let pendingList = [];
    try {
      pendingList = await listPendingWithdrawRequests();
    } catch {
      /* ignore */
    }
    const pendingByUserId = new Map(pendingList.map((r) => [r.userId, r]));

    setUsers(
      Array.from(mapByAccOrId.values()).map((u) => ({
        ...u,
        pendingWithdraw: pendingByUserId.get(u.id) || null,
        ...computeTxTotals(u.id),
      }))
    );
  }, [currentUser?.role, isHiddenFromViewer]);

  useEffect(() => {
    loadUsers();

    // Realtime event listeners and polling sync
    const handleSync = () => loadUsers();
    window.addEventListener("local-users-changed", handleSync);
    window.addEventListener("user-data-changed", handleSync);
    window.addEventListener("storage", handleSync);

    // Polling interval for realtime sync
    const pollInterval = setInterval(() => {
      loadUsers();
    }, 2500);

    return () => {
      window.removeEventListener("local-users-changed", handleSync);
      window.removeEventListener("user-data-changed", handleSync);
      window.removeEventListener("storage", handleSync);
      clearInterval(pollInterval);
    };
  }, [loadUsers]);

  // Helper to update user data & trigger sync across components
  const handleUpdateUserData = useCallback((userId, patch) => {
    let sanitizedPatch = patch;
    if (typeof patch === "object" && patch !== null && patch.balance !== undefined) {
      const cleanBal = parseFloat(String(patch.balance).replace(/[^0-9.-]+/g, "")) || 0;
      sanitizedPatch = { ...patch, balance: Math.max(0, parseFloat(cleanBal.toFixed(2))) };
    }
    const updated = updateUserData(userId, sanitizedPatch);
    loadUsers();
    return updated;
  }, [loadUsers]);

  // Filter and search logic
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      // Status filter
      if (filter === "active" && u.locked) return false;
      if (filter === "locked" && !u.locked) return false;
      if (filter === "has_balance" && (u.balance || 0) <= 0) return false;

      // Query search
      if (q.trim()) {
        const query = q.toLowerCase().trim();
        const nameMatch = (u.full_name || "").toLowerCase().includes(query);
        const emailMatch = (u.email || "").toLowerCase().includes(query);
        const accMatch = (u.account || "").toLowerCase().includes(query);
        const idMatch = (u.id || "").toLowerCase().includes(query);
        const phoneMatch = (u.phone || "").toLowerCase().includes(query);

        if (!nameMatch && !emailMatch && !accMatch && !idMatch && !phoneMatch) {
          return false;
        }
      }

      return true;
    });
  }, [users, q, filter]);

  // Pagination
  const pages = Math.max(1, Math.ceil(filteredUsers.length / PAGE));
  const pageRows = filteredUsers.slice(page * PAGE, page * PAGE + PAGE);

  // Toggle account lock state with immediate force logout trigger
  const handleToggleLock = async (u) => {
    const nextLockedState = !u.locked;
    try {
      // Local Auth update
      adminToggleLock(userKey(u), nextLockedState);

      // Try Base44 update if exists
      try {
        await base44.entities.User.update(u.id, { locked: nextLockedState });
      } catch {
        /* ignore */
      }

      toast({
        title: nextLockedState ? "🔒 Đã khóa tài khoản" : "🟢 Đã mở khóa tài khoản",
        description: nextLockedState
          ? `Tài khoản ${u.account || u.email} đã bị khóa và chấm dứt phiên làm việc.`
          : `Tài khoản ${u.account || u.email} đã được mở khóa hoạt động trở lại.`,
        variant: nextLockedState ? "destructive" : "default",
      });

      loadUsers();
    } catch (e) {
      toast({
        title: "Lỗi thao tác",
        description: e.message || "Không thể thay đổi trạng thái khóa",
        variant: "destructive",
      });
    }
  };

  // Delete user handler
  const handleDeleteUser = async () => {
    if (!delUser) return;
    try {
      adminDeleteUser(userKey(delUser));
      try {
        await base44.entities.User.delete(delUser.id);
      } catch {
        /* ignore */
      }

      toast({
        title: "Xóa thành công",
        description: `Đã xóa người dùng ${delUser.account || delUser.email}`,
      });
      setDelUser(null);
      loadUsers();
    } catch (e) {
      toast({
        title: "Lỗi xóa người dùng",
        description: e.message,
        variant: "destructive",
      });
    }
  };

  // Send admin notification to single user
  const handleNotifyUser = async (u) => {
    try {
      await base44.entities.NotificationLog.create({
        title: "Thông báo từ QTV",
        body: `Gửi trực tiếp tới tài khoản ${u.account || u.email}`,
        audience: "segment",
        target: u.email || u.id,
        status: "sent",
      });
      toast({
        title: "Đã gửi thông báo",
        description: `Đã phát thông báo tới ${u.full_name || u.account}`,
      });
    } catch {
      toast({
        title: "Đã phát thông báo nội bộ",
        description: `Gửi thông báo thành công tới ${u.account || u.email}`,
      });
    }
  };

  // Duyệt/Từ chối đơn rút tiền ngay trên thẻ — dùng chung cơ chế với trang Giao Dịch
  const handleDecideWithdraw = async () => {
    if (!withdrawConfirm) return;
    const { user, request, status } = withdrawConfirm;
    try {
      await decideWithdrawRequest({ userId: user.id, requestId: request.id, amount: request.amount, status });
      toast({
        title: status === "approved" ? "Đã duyệt đơn rút tiền" : "Đã từ chối đơn rút tiền",
        description: `${user.full_name || user.account} · $${request.amount.toLocaleString()} USD`,
        variant: status === "approved" ? "success" : "destructive",
      });
      setWithdrawConfirm(null);
      loadUsers();
    } catch (e) {
      toast({ title: "Có lỗi xảy ra", description: e.message, variant: "destructive" });
    }
  };

  const userKey = (u) => u.id || u.account;

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <UserCheck className="w-6 h-6 text-[#7033ff]" />
            Quản Lý Người Dùng
          </h1>
          <p className="text-xs text-white/50 mt-0.5">
            Theo dõi, điều chỉnh số dư và phân quyền tài khoản thời gian thực
          </p>
        </div>

        {/* Trạng thái đồng bộ trực tuyến — bấm để làm mới ngay lập tức */}
        <button
          type="button"
          onClick={loadUsers}
          title="Dữ liệu tự đồng bộ theo thời gian thực — bấm để làm mới ngay"
          className="flex items-center gap-2 bg-[#121633] border border-emerald-500/30 text-emerald-400 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-sm hover:bg-emerald-500/10 transition-colors"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          Trực tuyến
        </button>
      </div>

      {/* Search & Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-2.5 items-center justify-between bg-[#121633] p-3 rounded-2xl border border-white/10">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            className={`${inputCls} pl-10 bg-[#0c0f26]`}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            placeholder="Tìm theo Tên, Email, SĐT, UID hoặc Tên Tài Khoản..."
          />
        </div>

        <select
          className={`${inputCls} sm:w-52 bg-[#0c0f26]`}
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(0);
          }}
        >
          <option value="all" className="bg-[#161936]">Tất cả tài khoản</option>
          <option value="active" className="bg-[#161936]">🟢 Đang hoạt động</option>
          <option value="locked" className="bg-[#161936]">🔒 Đã bị khóa</option>
          <option value="has_balance" className="bg-[#161936]">💵 Có số dư (&gt; 0)</option>
        </select>
      </div>

      {/* User Bank-Card Grid */}
      <Panel className="p-4 sm:p-5 space-y-4">
        {pageRows.length === 0 ? (
          <div className="text-center text-white/40 text-sm py-14">Chưa có dữ liệu</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {pageRows.map((u) => (
              <UserBankCard
                key={u.id || u.account}
                user={u}
                onAdd={(usr) => openBalanceModal(usr, "add")}
                onSub={(usr) => openBalanceModal(usr, "sub")}
                onEdit={setEditUser}
                onToggleLock={handleToggleLock}
                onNotify={handleNotifyUser}
                onDelete={setDelUser}
                onApproveWithdraw={(usr, req) => setWithdrawConfirm({ user: usr, request: req, status: "approved" })}
                onRejectWithdraw={(usr, req) => setWithdrawConfirm({ user: usr, request: req, status: "rejected" })}
              />
            ))}
          </div>
        )}

        {/* Footer / Pagination */}
        <div className="flex items-center justify-between pt-3 border-t border-white/10 text-xs text-white/50">
          <span>
            Hiển thị {filteredUsers.length} tài khoản {q && "(Đã lọc)"}
          </span>

          <div className="flex items-center gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="p-1.5 rounded-lg border border-white/10 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-medium text-white/80">
              Trang {page + 1} / {pages}
            </span>
            <button
              disabled={page >= pages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="p-1.5 rounded-lg border border-white/10 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </Panel>

      {/* MODALS */}
      {/* 1. Edit User Modal */}
      <EditUserModal
        open={!!editUser}
        onOpenChange={(v) => !v && setEditUser(null)}
        user={editUser}
        onSaved={loadUsers}
      />

      {/* 2. Balance Adjust Modal */}
      <BalanceAdjustModal
        open={!!balanceUser}
        onOpenChange={(v) => !v && setBalanceUser(null)}
        user={balanceUser}
        onSaved={loadUsers}
        updateUserData={handleUpdateUserData}
        initialMode={balanceMode}
      />

      {/* 3. Confirm Delete Dialog */}
      <ConfirmDialog
        open={!!delUser}
        onOpenChange={(v) => !v && setDelUser(null)}
        title="Xóa tài khoản người dùng"
        desc={`Bạn có chắc chắn muốn xóa vĩnh viễn người dùng ${delUser?.account || delUser?.email}? Thao tác này không thể hoàn tác.`}
        confirmText="Xóa Ngay"
        onConfirm={handleDeleteUser}
      />

      {/* 4. Confirm Withdraw Decision Dialog */}
      <ConfirmDialog
        open={!!withdrawConfirm}
        onOpenChange={(v) => !v && setWithdrawConfirm(null)}
        title={withdrawConfirm?.status === "approved" ? "Duyệt đơn rút tiền" : "Từ chối đơn rút tiền"}
        desc={`${withdrawConfirm?.user?.full_name || withdrawConfirm?.user?.account} · $${withdrawConfirm?.request?.amount?.toLocaleString()} USD${withdrawConfirm?.request?.bank?.bankName ? ` · ${withdrawConfirm.request.bank.bankName}` : ""}`}
        confirmText={withdrawConfirm?.status === "approved" ? "Chấp nhận duyệt" : "Từ chối"}
        tone={withdrawConfirm?.status === "approved" ? "primary" : "danger"}
        onConfirm={handleDecideWithdraw}
      />
    </div>
  );
}
