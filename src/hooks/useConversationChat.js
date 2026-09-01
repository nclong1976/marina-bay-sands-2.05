import { useState, useEffect, useRef, useCallback } from 'react';
import {
  spGetOrCreateConversation,
  spFetchConversationMessages,
  spSendChatMessageV2,
  spMarkConversationRead,
  spSubscribeConversationMessages,
  spBroadcastTyping,
  spUploadFile,
} from '@/lib/supabaseService';
import { isSupabaseConfigured } from '@/lib/supabase';
import { emitSocketEvent } from '@/lib/socket';

/**
 * useConversationChat — Hook cho phía User (Chat Widget).
 *
 * Cung cấp:
 * - messages: danh sách tin nhắn của conversation
 * - send(text): gửi tin nhắn văn bản
 * - sendImage(file, caption): tải ảnh lên rồi gửi kèm chú thích (nếu có)
 * - conversation: metadata của conversation hiện tại
 * - adminIsTyping: admin đang gõ hay không
 * - isLoading: đang tải lịch sử
 * - notifyTyping(bool): báo cho admin biết user đang gõ
 *
 * `isOpen` cho hook biết khung chat có đang thật sự MỞ trên màn hình hay không —
 * chỉ đánh dấu "đã đọc" (và reset badge chưa đọc) khi user thật sự đang nhìn thấy
 * tin nhắn. Widget luôn được mount sẵn (để có thể hiện badge chưa đọc trên nút mở
 * chat), nên nếu đánh dấu đã đọc bất kể có mở hay không, badge sẽ luôn = 0 dù admin
 * vừa nhắn tin và user chưa từng mở khung chat để xem.
 */
export function useConversationChat(user, isOpen = false) {
  const userId = user?.id;
  const userName = user?.full_name || user?.account || 'Khách';

  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [adminIsTyping, setAdminIsTyping] = useState(false);

  const adminTypingTimer = useRef(null);
  const convIdRef = useRef(null);
  const isOpenRef = useRef(isOpen);
  useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);

  // Khởi tạo: lấy hoặc tạo conversation, fetch lịch sử
  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    const init = async () => {
      setIsLoading(true);
      try {
        const conv = await spGetOrCreateConversation(userId);
        if (cancelled || !conv) return;
        setConversation(conv);
        convIdRef.current = conv.id;

        const history = await spFetchConversationMessages(conv.id);
        if (!cancelled) setMessages(history || []);
      } catch (err) {
        console.error('[useConversationChat] init error:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    init();
    return () => { cancelled = true; };
  }, [userId]);

  // Đánh dấu đã đọc mỗi khi khung chat được MỞ (lúc mở lần đầu, hoặc conversation
  // vừa tải xong trong khi khung đang mở sẵn).
  useEffect(() => {
    if (!isOpen || !conversation?.id) return;
    if (!conversation.unread_user) return;
    spMarkConversationRead(conversation.id, 'user').catch(() => {});
    setConversation((prev) => (prev ? { ...prev, unread_user: 0 } : prev));
  }, [isOpen, conversation?.id, conversation?.unread_user]);

  // Subscribe realtime tin nhắn mới trong conversation
  useEffect(() => {
    const convId = convIdRef.current;
    if (!convId || !isSupabaseConfigured()) return;

    const unsub = spSubscribeConversationMessages(convId, ({ eventType, row }) => {
      if (eventType === 'DELETE') {
        setMessages((prev) => prev.filter((m) => m.id !== row.id));
        return;
      }

      const newMsg = row;
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === newMsg.id);
        if (idx === -1) return [...prev, newMsg];
        // UPDATE — merge để phản ánh thay đổi (vd. admin vừa đọc tin của mình) ngay.
        const next = [...prev];
        next[idx] = { ...next[idx], ...newMsg };
        return next;
      });

      // Chỉ xử lý cho tin nhắn MỚI (INSERT) từ admin — tránh vòng lặp vô ích khi
      // chính hành động đánh dấu đã đọc bên dưới lại tự phát sinh sự kiện UPDATE.
      if (eventType === 'INSERT' && (newMsg.sender_role === 'admin' || newMsg.sender_role === 'super_admin')) {
        if (isOpenRef.current) {
          spMarkConversationRead(convId, 'user').catch(() => {});
          setConversation((prev) => (prev ? { ...prev, unread_user: 0 } : prev));
        } else {
          setConversation((prev) => (prev ? { ...prev, unread_user: (prev.unread_user || 0) + 1 } : prev));
        }
      }
    });

    return () => unsub();
  }, [conversation?.id]);

  // Subscribe typing indicator từ admin
  useEffect(() => {
    const convId = convIdRef.current || conversation?.id;
    if (!convId || !isSupabaseConfigured()) return;

    const unsub = spBroadcastTyping.subscribe(convId, ({ role, isTyping }) => {
      if (role === 'admin' || role === 'super_admin') {
        setAdminIsTyping(isTyping);
        // Tự tắt typing sau 4s nếu không có update mới
        clearTimeout(adminTypingTimer.current);
        if (isTyping) {
          adminTypingTimer.current = setTimeout(() => setAdminIsTyping(false), 4000);
        }
      }
    });

    return () => {
      unsub();
      clearTimeout(adminTypingTimer.current);
    };
  }, [conversation?.id]);

  // Gửi tin nhắn (text và/hoặc ảnh — imageUrl đã upload sẵn lên Storage)
  const sendMessage = useCallback(async (text, imageUrl) => {
    const trimmed = (text || '').trim();
    if (!trimmed && !imageUrl) return;
    if (!userId) return;
    const convId = convIdRef.current;

    const msgId = 'msg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const optimistic = {
      id: msgId,
      user_id: userId,
      username: userName,
      message: trimmed,
      image_url: imageUrl || null,
      sender_role: 'user',
      conversation_id: convId,
      read_by_admin: false,
      read_by_user: true,
      created_at: new Date().toISOString(),
    };

    // Optimistic update
    setMessages((prev) => [...prev, optimistic]);

    // Dừng typing khi gửi
    if (convId) {
      spBroadcastTyping.send(convId, userId, 'user', false);
    }

    // Lưu vào Supabase
    const saved = await spSendChatMessageV2({
      id: msgId,
      userId,
      username: userName,
      message: trimmed,
      imageUrl: imageUrl || null,
      senderRole: 'user',
      conversationId: convId,
    });

    if (saved) {
      // Thay thế optimistic bằng server response
      setMessages((prev) => prev.map((m) => (m.id === msgId ? saved : m)));
    }

    // Emit socket để admin thấy ngay
    emitSocketEvent('chat:send_message', {
      ...optimistic,
      conversationId: convId,
      userId,
    });
  }, [userId, userName]);

  const send = useCallback((text) => sendMessage(text), [sendMessage]);

  // Tải ảnh lên Storage rồi gửi kèm chú thích (nếu có)
  const sendImage = useCallback(async (file, caption = '') => {
    if (!file) return;
    const imageUrl = await spUploadFile(file, 'chat');
    if (!imageUrl) return;
    await sendMessage(caption, imageUrl);
  }, [sendMessage]);

  // Thông báo user đang gõ cho admin
  const userTypingTimer = useRef(null);
  const notifyTyping = useCallback((isTyping) => {
    const convId = convIdRef.current || conversation?.id;
    if (!convId) return;
    clearTimeout(userTypingTimer.current);
    spBroadcastTyping.send(convId, userId, 'user', isTyping);
    if (isTyping) {
      // Tự dừng typing sau 3s
      userTypingTimer.current = setTimeout(() => {
        spBroadcastTyping.send(convId, userId, 'user', false);
      }, 3000);
    }
  }, [conversation?.id, userId]);

  // Unread count phía user
  const unreadUser = conversation?.unread_user || 0;

  return {
    conversation,
    messages,
    isLoading,
    adminIsTyping,
    unreadUser,
    send,
    sendImage,
    notifyTyping,
  };
}
