import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldCheck, KeyRound, Lock } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { updatePassword, updatePayPassword } from "@/lib/localAuth";

export default function SettingsModal({ open, onOpenChange, onToast }) {
  const { user } = useAuth();
  const [pw, setPw] = useState({ cur: "", new: "", confirm: "" });
  const [pin, setPin] = useState({ cur: "", new: "" });

  const submitPw = () => {
    if (!pw.cur || !pw.new) return onToast({ title: "Vui lòng nhập đầy đủ mật khẩu", variant: "destructive" });
    if (pw.new.length < 6) return onToast({ title: "Mật khẩu mới tối thiểu 6 ký tự", variant: "destructive" });
    if (pw.new !== pw.confirm) return onToast({ title: "Mật khẩu xác nhận không khớp", variant: "destructive" });

    const res = updatePassword(user?.id, pw.cur, pw.new);
    if (!res.ok) return onToast({ title: res.msg || "Cập nhật mật khẩu thất bại", variant: "destructive" });

    onToast({ title: "Đổi mật khẩu đăng nhập thành công", variant: "success" });
    setPw({ cur: "", new: "", confirm: "" });
  };

  const submitPin = () => {
    if (!/^\d{6}$/.test(pin.cur)) return onToast({ title: "Vui lòng nhập đúng PIN hiện tại (6 chữ số)", variant: "destructive" });
    if (!/^\d{6}$/.test(pin.new)) return onToast({ title: "PIN mới phải đúng 6 chữ số", variant: "destructive" });
    if (pin.new === pin.cur) return onToast({ title: "PIN mới phải khác PIN hiện tại", variant: "destructive" });

    const res = updatePayPassword(user?.id, pin.cur, pin.new);
    if (!res.ok) return onToast({ title: res.msg || "Cập nhật PIN thất bại", variant: "destructive" });

    onToast({ title: "Đổi PIN rút tiền thành công", variant: "success" });
    setPin({ cur: "", new: "" });
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[460px] w-[95vw] bg-[#1e1832] border-[#323b51] text-white rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-white/10">
          <DialogTitle className="text-[#bd9c59] flex items-center gap-2">
            <Lock className="w-4 h-4" /> Cài Đặt Cá Nhân
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 py-4 space-y-6 max-h-[65vh] overflow-y-auto no-scrollbar">

          {/* Đổi mật khẩu đăng nhập */}
          <div className="bg-[#2a2040] rounded-xl p-3.5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#bd9c59]">
              <KeyRound className="w-4 h-4" /> Đổi mật khẩu đăng nhập
            </div>
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="Mật khẩu hiện tại"
                value={pw.cur}
                onChange={(e) => setPw({ ...pw, cur: e.target.value })}
                className="bg-[#1e1832] border-[#3a2d52] focus:border-[#bd9c59] text-white text-sm"
                style={{ fontSize: "16px" }}
              />
              <Input
                type="password"
                placeholder="Mật khẩu mới (tối thiểu 6 ký tự)"
                value={pw.new}
                onChange={(e) => setPw({ ...pw, new: e.target.value })}
                className="bg-[#1e1832] border-[#3a2d52] focus:border-[#bd9c59] text-white text-sm"
                style={{ fontSize: "16px" }}
              />
              <Input
                type="password"
                placeholder="Xác nhận mật khẩu mới"
                value={pw.confirm}
                onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
                className="bg-[#1e1832] border-[#3a2d52] focus:border-[#bd9c59] text-white text-sm"
                style={{ fontSize: "16px" }}
              />
            </div>
            <Button
              onClick={submitPw}
              className="w-full bg-[#bd9c59] text-[#1e1832] hover:bg-[#cfb06a] font-semibold h-10 rounded-lg text-sm"
            >
              Cập nhật mật khẩu
            </Button>
          </div>

          {/* Đổi PIN rút tiền — bắt buộc nhập đúng PIN hiện tại (chính là PIN dùng khi
              gửi yêu cầu rút tiền ở màn Rút Tiền) trước khi cho đặt PIN mới, để 2 màn
              hình luôn khớp nhau và tránh ai đó chiếm phiên đăng nhập tự ý đổi PIN. */}
          <div className="bg-[#2a2040] rounded-xl p-3.5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#bd9c59]">
              <ShieldCheck className="w-4 h-4" /> Đổi mật khẩu rút tiền (PIN 6 số)
            </div>
            <div className="space-y-2">
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="Mật khẩu rút tiền hiện tại"
                value={pin.cur}
                onChange={(e) => setPin({ ...pin, cur: e.target.value.replace(/\D/g, "") })}
                className="bg-[#1e1832] border-[#3a2d52] focus:border-[#bd9c59] text-white text-center tracking-widest text-lg h-11"
                style={{ fontSize: "20px", letterSpacing: "0.4em" }}
              />
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="Nhập PIN mới (6 chữ số)"
                value={pin.new}
                onChange={(e) => setPin({ ...pin, new: e.target.value.replace(/\D/g, "") })}
                className="bg-[#1e1832] border-[#3a2d52] focus:border-[#bd9c59] text-white text-center tracking-widest text-lg h-11"
                style={{ fontSize: "20px", letterSpacing: "0.4em" }}
              />
            </div>
            <Button
              onClick={submitPin}
              className="w-full bg-[#bd9c59] text-[#1e1832] hover:bg-[#cfb06a] font-semibold h-10 rounded-lg text-sm"
            >
              Cập nhật PIN rút tiền
            </Button>
          </div>


        </div>

        <DialogFooter className="px-5 py-3 border-t border-white/10">
          <DialogClose asChild>
            <Button variant="ghost" className="w-full text-white/70 hover:text-white">Đóng</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
