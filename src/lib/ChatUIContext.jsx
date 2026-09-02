// Trạng thái "khung chat đang mở?" + "số tin chưa đọc" dùng CHUNG cho toàn app —
// sửa lỗi đã ghi nhận trong audit: trước đây mỗi trang (Home.jsx,
// ContainerAug4CodiaStudio2.jsx) tự giữ 1 bản state riêng, nên chuyển trang là
// khung chat tự đóng + phải tải lại lịch sử + badge nhấp nháy về 0. Provider này
// bọc quanh <ChatWidget/> được mount DUY NHẤT 1 lần ở App.jsx; mọi nút "Hỗ Trợ
// Trực Tuyến" rải rác khắp app chỉ cần gọi useChatUI().openChat().
import React, { createContext, useContext, useState, useCallback } from 'react';

const ChatUIContext = createContext(null);

export function ChatUIProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  const openChat = useCallback(() => setOpen(true), []);
  const closeChat = useCallback(() => setOpen(false), []);

  return (
    <ChatUIContext.Provider value={{ open, unread, setUnread, openChat, closeChat }}>
      {children}
    </ChatUIContext.Provider>
  );
}

export const useChatUI = () => {
  const ctx = useContext(ChatUIContext);
  if (!ctx) throw new Error('useChatUI() phải được gọi bên trong <ChatUIProvider>');
  return ctx;
};
