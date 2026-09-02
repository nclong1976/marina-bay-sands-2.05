import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { useNotifications } from "@/lib/NotificationContext";
import { useAuth } from "@/lib/AuthContext";
import { useUserData } from "@/lib/userData";
import { handleDepositRequest } from "@/lib/depositHandler";
import NotificationBell from "@/components/NotificationBell";
import BottomNav from "@/components/BottomNav";
import ProfileCard from "@/components/profile/ProfileCard";
import QuickMenuCard from "@/components/profile/QuickMenuCard";
import ActionCards from "@/components/profile/ActionCards";
import LogoutButton from "@/components/profile/LogoutButton";
import SettingsModal from "@/components/profile/SettingsModal";
import BetHistoryModal from "@/components/profile/BetHistoryModal";
import TxHistoryModal from "@/components/profile/TxHistoryModal";
import LinkAccountModal from "@/components/profile/LinkAccountModal";
import WithdrawModal from "@/components/profile/WithdrawModal";
import { MIN_TURNOVER } from "@/components/profile/profileData";
import { spCreateWithdrawRequest, spUpdateUser } from "@/lib/supabaseService";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useChatUI } from "@/lib/ChatUIContext";

export default function ContainerAug4CodiaStudio2() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { push } = useNotifications();
  const { user } = useAuth();
  const { data, update } = useUserData(user?.id);
  const { unread: chatUnread, openChat } = useChatUI();

  const handleDeposit = () => {
    handleDepositRequest({ user, navigate, toast, openChat });
  };

  const [hidden, setHidden] = useState(false);
  const [openSettings, setOpenSettings] = useState(false);
  const [openBet, setOpenBet] = useState(false);
  const [txMode, setTxMode] = useState(null);
  const [openLink, setOpenLink] = useState(false);
  const [openWithdraw, setOpenWithdraw] = useState(false);

  const balance = data.balance;
  const profit = data.profit;
  const bets = data.bets;
  const txs = data.txs;
  const linked = data.linked;
  const turnover = data.turnover;

  const copyId = async () => {
    const id = user?.id ? user.id.slice(-6) : "000000";
    try {
      await navigator.clipboard.writeText(id);
      toast({ title: "Đã sao chép ID", description: id });
    } catch {
      toast({ title: "Không thể sao chép ID", variant: "destructive" });
    }
  };

  const addLinked = (acct) => {
    update((d) => ({ ...d, linked: [acct, ...d.linked] }));

    // Đẩy thông tin ngân hàng lên Supabase — bắt buộc để tài khoản ngân hàng đã liên kết
    // hiển thị đúng khi người dùng đăng nhập trên thiết bị khác.
    if (isSupabaseConfigured() && user?.id && acct?.type === "bank") {
      spUpdateUser(user.id, {
        bankInfo: { bankName: acct.bankName, accountNumber: acct.accountNumber, holder: acct.holder },
      }).catch(() => {});
    }

    toast({ title: "Liên kết tài khoản thành công" });
  };

  const submitWithdraw = ({ amount, bank, requestId, request }) => {
    if (amount > balance) return toast({ title: "Số dư không đủ", variant: "destructive" });
    if (turnover < MIN_TURNOVER) return toast({ title: "Chưa đủ số vòng cược tối thiểu", variant: "destructive" });

    const newReq = request || {
      id: requestId || "WD" + Date.now(),
      amount,
      bank,
      status: "pending",
      time: new Date().toLocaleString("vi-VN"),
    };

    update((d) => ({
      ...d,
      balance: +(d.balance - amount).toFixed(2),
      withdrawRequests: [newReq, ...(d.withdrawRequests || [])],
      txs: [{
        txid: newReq.id,
        type: "withdraw",
        amount,
        bank: bank?.bankName,
        status: "processing",
        time: new Date().toLocaleString("vi-VN"),
      }, ...d.txs],
    }));

    // Đẩy đơn rút tiền lên Supabase — bắt buộc để Admin thấy & duyệt được đơn này
    // dù người dùng gửi yêu cầu từ bất kỳ thiết bị nào.
    if (isSupabaseConfigured() && user?.id) {
      spCreateWithdrawRequest({
        id: newReq.id,
        userId: user.id,
        account: user.account,
        fullName: user.full_name,
        amount,
        bankInfo: bank,
      }).catch(() => {});
    }

    toast({ title: "Gửi yêu cầu rút tiền thành công", description: `$${amount} USD · ${bank?.bankName}` });
    push({ type: "balance", title: "Yêu cầu rút tiền đã gửi", body: `$${amount} USD · Đang chờ admin duyệt` });
  };

  return (
    <main className="max-w-md w-full mx-auto relative min-h-[100dvh] bg-[#0A0E1A] overflow-x-hidden" style={{ fontFamily: "Roboto, sans-serif" }}>
      <div className="relative w-full">
        <img
          src="https://media.base44.com/images/public/6a729d033f9d0f63f381a6c6/61e389800_9bfeffd96_07a3de8dd600878de86f2c73376a64fa24558e67.png"
          alt="background"
          className="w-full object-cover object-center absolute inset-0 h-full"
          style={{ zIndex: 0 }}
        />

        <div className="relative z-10 flex flex-col w-full pb-24">
          <div className="absolute top-2 right-2 z-30"><NotificationBell /></div>
          <ProfileCard
            user={user}
            balance={balance}
            profit={profit}
            hidden={hidden}
            onToggleHidden={() => setHidden((h) => !h)}
            onCopyId={copyId}
            onSettings={() => setOpenSettings(true)}
          />

          <QuickMenuCard
            onBetHistory={() => setOpenBet(true)}
            onTx={(mode) => setTxMode(mode)}
            onLink={() => setOpenLink(true)}
          />

          <ActionCards
            onSupport={openChat}
            onDeposit={handleDeposit}
            onWithdraw={() => setOpenWithdraw(true)}
            unreadSupport={chatUnread}
          />

          <LogoutButton />
        </div>

        <BottomNav />
      </div>

      <SettingsModal open={openSettings} onOpenChange={setOpenSettings} onToast={toast} />
      <BetHistoryModal open={openBet} onOpenChange={setOpenBet} bets={bets} />
      <TxHistoryModal open={!!txMode} onOpenChange={(v) => !v && setTxMode(null)} txs={txs} mode={txMode || "both"} />
      <LinkAccountModal open={openLink} onOpenChange={setOpenLink} onAdd={addLinked} linked={linked} />
      <WithdrawModal
        open={openWithdraw}
        onOpenChange={setOpenWithdraw}
        balance={balance}
        minTurnover={MIN_TURNOVER}
        turnover={turnover}
        linked={linked}
        withdrawRequests={data.withdrawRequests || []}
        onSubmit={submitWithdraw}
      />
    </main>
  );
}