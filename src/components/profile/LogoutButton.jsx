import React, { useState } from "react";
import { LogOut, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useNavigate } from "react-router-dom";

export default function LogoutButton() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout('/login');
    } catch {
      navigate("/login", { replace: true });
    }
  };

  return (
    <button
      onClick={handleLogout}
      disabled={isLoggingOut}
      id="logout-button"
      className="mx-[17px] mt-6 mb-2 w-[calc(100%-34px)] min-h-[48px] flex items-center justify-center gap-2 py-3 rounded-xl bg-red-600/85 hover:bg-red-600 active:scale-[0.98] text-white text-sm font-semibold transition-all shadow-md disabled:opacity-70 disabled:cursor-not-allowed"
    >
      {isLoggingOut ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" /> Đang đăng xuất...
        </>
      ) : (
        <>
          <LogOut className="w-4 h-4" /> Đăng Xuất
        </>
      )}
    </button>
  );
}