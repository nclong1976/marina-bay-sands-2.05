// Bọc useAdminTickets() ĐÚNG 1 LẦN quanh toàn bộ Admin Console — sửa lỗi đã
// ghi nhận trong audit: trước đây AdminApp.jsx (cho badge chuông) và Chat.jsx
// (cho toàn bộ UI trang Nhắn tin) mỗi nơi tự gọi useAdminChat() riêng, tạo 2
// bản state độc lập có thể lệch nhau (đánh dấu đã đọc ở nơi này không phản
// ánh sang nơi kia cho tới khi Realtime bắn UPDATE về).
import React, { createContext, useContext } from 'react';
import { useAdminTickets } from '@/hooks/useAdminTickets';

const AdminChatContext = createContext(null);

export function AdminChatProvider({ user, children }) {
  const value = useAdminTickets(user);
  return <AdminChatContext.Provider value={value}>{children}</AdminChatContext.Provider>;
}

export const useAdminChatContext = () => {
  const ctx = useContext(AdminChatContext);
  if (!ctx) throw new Error('useAdminChatContext() phải được gọi bên trong <AdminChatProvider>');
  return ctx;
};
