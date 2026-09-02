import React, { useState } from "react";
import {
  Plus,
  Minus,
  RotateCcw,
  Lock,
  Unlock,
  Bell,
  Trash2,
  Edit2,
  CreditCard,
  Crown,
  ShieldCheck,
  Copy,
  Check,
  X,
  Landmark,
  ArrowDownToLine,
  ArrowUpFromLine,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

// Sinh dãy số thẻ giả lập (gọn 4 nhóm x 4 ký tự) từ UID/tài khoản của người dùng, để mặt
// trước thẻ trông giống thẻ ngân hàng thật — chỉ mang tính trang trí nhận diện, không phải
// dữ liệu nhạy cảm thật (không dùng số thẻ/ngân hàng thật của người dùng ở mặt trước).
const toCardNumber = (u) => {
  const raw = (u.id || u.account || "SANDSCLUB0000000").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const padded = (raw + "0000000000000000").slice(0, 16);
  const groups = padded.match(/.{1,4}/g);
  return [groups[0], "••••", "••••", groups[3]];
};

const toValidThru = (dateStr) => {
  if (!dateStr) return "--/--";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "--/--";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}/${yy}`;
};

const FaceBtn = ({ onClick, title, tone = "neutral", children }) => {
  const tones = {
    neutral: "bg-white/10 hover:bg-white/20 text-white",
    green: "bg-emerald-500/25 hover:bg-emerald-500/40 text-emerald-300 border border-emerald-400/40",
    red: "bg-rose-500/25 hover:bg-rose-500/40 text-rose-300 border border-rose-400/40",
  };
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${tones[tone]}`}
    >
      {children}
    </button>
  );
};

export default function UserBankCard({
  user,
  onAdd,
  onSub,
  onEdit,
  onToggleLock,
  onNotify,
  onDelete,
  onApproveWithdraw,
  onRejectWithdraw,
}) {
  const { toast } = useToast();
  const [flipped, setFlipped] = useState(false);
  const [copied, setCopied] = useState(false);
  const [bankCopied, setBankCopied] = useState(false);
  const bank = user.bankInfo;
  const isVip = user.role === "admin" || user.role === "super_admin";
  const cardNumber = toCardNumber(user);
  const pendingWithdraw = user.pendingWithdraw;
  const totalDeposit = user.totalDeposit || 0;
  const totalWithdraw = user.totalWithdraw || 0;

  // Sao chép nhanh UID — tiện cho admin dán vào ô tìm kiếm ở tab Giao dịch/Đặt cược
  // mà không cần rời trang Quản lý Người dùng để chép thủ công.
  const handleCopyUid = () => {
    if (!user.id) return;
    navigator.clipboard?.writeText(user.id).then(() => {
      setCopied(true);
      toast({ title: "Đã sao chép UID", description: user.id });
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  // Sao chép nhanh số tài khoản ngân hàng — admin cần đối chiếu/chuyển khoản khi duyệt rút tiền.
  const handleCopyBank = (accountNumber) => {
    navigator.clipboard?.writeText(accountNumber).then(() => {
      setBankCopied(true);
      toast({ title: "Đã sao chép số tài khoản", description: accountNumber });
      setTimeout(() => setBankCopied(false), 1500);
    }).catch(() => {});
  };

  return (
    <div style={{ perspective: "1400px" }} className="w-full">
      <div
        style={{
          transformStyle: "preserve-3d",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          transition: "transform 0.6s cubic-bezier(0.4, 0.2, 0.2, 1)",
        }}
        className={`relative w-full ${pendingWithdraw ? "h-72" : "h-60"}`}
      >
        {/* ---------- FRONT: Thẻ ngân hàng thu gọn ---------- */}
        <div
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
          className={`absolute inset-0 rounded-2xl p-4 flex flex-col justify-between shadow-xl border overflow-hidden ${
            pendingWithdraw
              ? "bg-gradient-to-br from-[#2a1e08] via-[#3a2a0f] to-[#7033ff] border-amber-400/60 ring-2 ring-amber-400/30"
              : user.locked
              ? "bg-gradient-to-br from-[#2a1220] via-[#3a1522] to-[#1b0d14] border-rose-500/30"
              : "bg-gradient-to-br from-[#1b1140] via-[#3a1f78] to-[#7033ff] border-[#ffab40]/30"
          }`}
        >
          {/* Decorative glow blobs */}
          <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-[#ffab40]/20 blur-2xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-8 w-28 h-28 rounded-full bg-[#7033ff]/30 blur-2xl pointer-events-none" />

          {/* Header: brand + chip + role/status */}
          <div className="flex items-start justify-between relative">
            <div className="flex items-center gap-2">
              <div className="w-8 h-6 rounded-md bg-gradient-to-br from-[#ffd98a] to-[#c9962f] shadow-inner flex items-center justify-center">
                <div className="w-4 h-3 rounded-sm border border-[#8a6414]/60" />
              </div>
              <span className="text-[11px] font-bold tracking-widest text-white/90">SANDS CLUB</span>
            </div>
            <div className="flex items-center gap-1.5">
              {isVip && (
                <span title={user.role} className="w-6 h-6 rounded-full bg-[#ffab40]/25 border border-[#ffab40]/50 flex items-center justify-center">
                  <Crown className="w-3.5 h-3.5 text-[#ffab40]" />
                </span>
              )}
              <span
                title={user.locked ? "Tài khoản đã bị khóa" : "Tài khoản đang hoạt động"}
                className={`w-2.5 h-2.5 rounded-full ${user.locked ? "bg-rose-400" : "bg-emerald-400 animate-pulse"}`}
              />
            </div>
          </div>

          {/* Masked card number */}
          <div className="relative font-mono text-base sm:text-lg tracking-[0.15em] text-white/90 drop-shadow-sm">
            {cardNumber.join("  ")}
          </div>

          {/* Cardholder + balance */}
          <div className="relative flex items-end justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[9px] text-white/50 uppercase tracking-wider">Chủ thẻ</p>
              <p className="text-xs sm:text-sm font-bold text-white truncate max-w-[140px] uppercase">
                {user.full_name || user.account}
              </p>
              <p className="text-[9px] text-white/40 mt-1">Thành viên từ {toValidThru(user.created_date)}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[9px] text-white/50 uppercase tracking-wider">Số dư</p>
              <p className="text-base sm:text-lg font-extrabold text-emerald-300 leading-tight">
                ${(user.balance || 0).toLocaleString()}
              </p>
            </div>
          </div>

          {/* Tổng nạp / tổng rút — gọn trong 1 dòng, không tranh chỗ với số dư chính */}
          <div className="relative flex items-center justify-between gap-2 text-[10px] px-0.5">
            <span className="flex items-center gap-1 text-emerald-300/80">
              <ArrowDownToLine className="w-3 h-3" />
              Nạp <span className="font-bold text-emerald-300">${totalDeposit.toLocaleString()}</span>
            </span>
            <span className="flex items-center gap-1 text-rose-300/80">
              <ArrowUpFromLine className="w-3 h-3" />
              Rút <span className="font-bold text-rose-300">${totalWithdraw.toLocaleString()}</span>
            </span>
          </div>

          {/* Cảnh báo: yêu cầu rút tiền đang chờ duyệt ngay trên mặt thẻ */}
          {pendingWithdraw && (
            <div className="relative flex items-center justify-between gap-2 bg-black/30 border border-amber-400/50 rounded-lg px-2.5 py-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <Landmark className="w-3.5 h-3.5 text-amber-300 shrink-0 animate-pulse" />
                <span className="text-[11px] text-amber-100 font-semibold truncate">
                  Yêu cầu rút ${pendingWithdraw.amount.toLocaleString()}
                  {pendingWithdraw.bank?.bankName ? ` · ${pendingWithdraw.bank.bankName}` : ""}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  title="Duyệt yêu cầu rút tiền"
                  onClick={() => onApproveWithdraw(user, pendingWithdraw)}
                  className="w-6 h-6 rounded-full bg-emerald-500/30 hover:bg-emerald-500/50 text-emerald-200 flex items-center justify-center transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  title="Từ chối yêu cầu rút tiền"
                  onClick={() => onRejectWithdraw(user, pendingWithdraw)}
                  className="w-6 h-6 rounded-full bg-rose-500/30 hover:bg-rose-500/50 text-rose-200 flex items-center justify-center transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Footer actions: Cộng / Trừ tiền + lật thẻ */}
          <div className="relative flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1.5">
              <FaceBtn title="Cộng tiền" tone="green" onClick={() => onAdd(user)}>
                <Plus className="w-4 h-4" />
              </FaceBtn>
              <FaceBtn title="Trừ tiền" tone="red" onClick={() => onSub(user)}>
                <Minus className="w-4 h-4" />
              </FaceBtn>
            </div>
            <FaceBtn title="Xem đầy đủ thông tin" onClick={() => setFlipped(true)}>
              <RotateCcw className="w-3.5 h-3.5" />
            </FaceBtn>
          </div>
        </div>

        {/* ---------- BACK: Toàn bộ thông tin đăng ký ---------- */}
        <div
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
          className="absolute inset-0 rounded-2xl bg-[#12142e] border border-white/15 shadow-xl flex flex-col overflow-hidden"
        >
          {/* Magnetic stripe */}
          <div className="h-7 bg-black/70 mt-3" />

          <div className="flex-1 min-h-0 overflow-y-auto px-3.5 py-2 space-y-1.5 text-[11px]">
            <Info label="Tài khoản" value={user.account || "—"} />
            <Info label="Họ và tên" value={user.full_name || "—"} />
            <Info label="Email" value={user.email || "—"} />
            <Info label="Số điện thoại" value={user.phone || "—"} />
            <Info label="Vai trò" value={user.role || "user"} />
            <Info
              label="UID"
              value={user.id ? String(user.id).slice(0, 14) : "—"}
              mono
              onCopy={user.id ? handleCopyUid : undefined}
              copied={copied}
            />
            <Info
              label="Ngày đăng ký"
              value={user.created_date ? new Date(user.created_date).toLocaleDateString("vi-VN") : "—"}
            />
            {bank?.bankName ? (
              <>
                <Info
                  label="Ngân hàng rút"
                  value={bank.bankName}
                  icon={<CreditCard className="w-3 h-3 text-emerald-400" />}
                />
                <Info
                  label="Số tài khoản"
                  value={bank.accountNumber || "—"}
                  mono
                  onCopy={bank.accountNumber ? () => handleCopyBank(bank.accountNumber) : undefined}
                  copied={bankCopied}
                />
                <Info label="Chủ tài khoản" value={bank.holder || "—"} />
              </>
            ) : (
              <Info label="Ngân hàng rút" value="Chưa liên kết" muted />
            )}
            {user.adminNote && <Info label="Ghi chú admin" value={user.adminNote} />}
          </div>

          {/* Action row */}
          <div className="flex items-center justify-between gap-1 px-3 py-2 border-t border-white/10 bg-white/[0.03]">
            <div className="flex items-center gap-1">
              <FaceBtn title="Chỉnh sửa thông tin" onClick={() => onEdit(user)}>
                <Edit2 className="w-3.5 h-3.5" />
              </FaceBtn>
              <FaceBtn
                title={user.locked ? "Mở khóa tài khoản" : "Khóa tài khoản"}
                tone={user.locked ? "green" : "red"}
                onClick={() => onToggleLock(user)}
              >
                {user.locked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
              </FaceBtn>
              <FaceBtn title="Gửi thông báo" onClick={() => onNotify(user)}>
                <Bell className="w-3.5 h-3.5" />
              </FaceBtn>
              <FaceBtn title="Xóa tài khoản" tone="red" onClick={() => onDelete(user)}>
                <Trash2 className="w-3.5 h-3.5" />
              </FaceBtn>
            </div>
            <FaceBtn title="Lật lại mặt trước" onClick={() => setFlipped(false)}>
              <ShieldCheck className="w-3.5 h-3.5" />
            </FaceBtn>
          </div>
        </div>
      </div>
    </div>
  );
}

const Info = ({ label, value, mono, muted, icon, onCopy, copied }) => (
  <div className="flex items-center justify-between gap-3 py-1 border-b border-white/5 last:border-0">
    <span className="text-white/45 shrink-0">{label}</span>
    <span
      className={`text-right truncate max-w-[62%] flex items-center gap-1 justify-end ${
        muted ? "text-white/30 italic" : "text-white/85 font-medium"
      } ${mono ? "font-mono" : ""}`}
    >
      {icon}
      {value}
      {onCopy && (
        <button
          type="button"
          title="Sao chép UID"
          onClick={onCopy}
          className="shrink-0 text-white/40 hover:text-white transition-colors"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
        </button>
      )}
    </span>
  </div>
);
