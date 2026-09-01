import { useState, useEffect, useRef, useCallback } from 'react';
import {
  spFetchAllConversations,
  spFetchConversationMessages,
  spSendChatMessageV2,
  spMarkConversationRead,
  spDeleteChatMessage,
  spSubscribeConversations,
  spSubscribeConversationMessages,
  spBroadcastTyping,
  spUploadFile,
} from '@/lib/supabaseService';
import { isSupabaseConfigured } from '@/lib/supabase';
import { emitSocketEvent } from '@/lib/socket';

/**
 * useAdminChat — Hook cho phía Admin (Dashboard 2 cột).
 *
 * Cung cấp:
 * - conversations: danh sách conversations (sort by last_message_at)
 * - activeConvId: ID conversation đang chọn
 * - setActiveConvId: chọn conversation
 * - messages: tin nhắn của conversation đang active
 * - userIsTyping: user đang gõ hay không
 * - sendReply(text, adminUser): gửi phản hồi
 * - totalUnread: tổng unread_admin trên tất cả conversations
 * - isLoadingConvs: đang tải danh sách
 * - isLoadingMsgs: đang tải tin nhắn
 * - notifyTyping(bool, adminUser): báo admin đang gõ cho user
 */
export function useAdminChat() {
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvIdState] = useState(null);
  const [messages, setMessages] = useState([]);
  const [userIsTyping, setUserIsTyping] = useState(false);
  const [isLoadingConvs, setIsLoadingConvs] = useState(false);
  const [isLoadingMsgs, setIsLoadingMsgs] = useState(false);

  const userTypingTimer = useRef(null);
  const unsubMsgsRef = useRef(null);
  const unsubTypingRef = useRef(null);
  const activeConvIdRef = useRef(null);

  // ─── Tải danh sách conversations ──────────────────────────────
  const loadConversations = useCallback(async () => {
    setIsLoadingConvs(true);
    try {
      const list = await spFetchAllConversations();
      setConversations(list);
    } catch (err) {
      console.error('[useAdminChat] loadConversations:', err);
    } finally {
      setIsLoadingConvs(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // ─── Realtime: cập nhật conversations khi có thay đổi ────────
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const unsub = spSubscribeConversations((updatedConv) => {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === updatedConv.id);
        let next;
        if (idx >= 0) {
          next = [...prev];
          // Giữ nguyên users_profile đã join (updatedConv từ realtime không có join data)
          next[idx] = { ...next[idx], ...updatedConv };
        } else {
          // Conversation mới — cần tải lại để có users_profile
          loadConversations();
          return prev;
        }
        // Resort theo last_message_at
        return next.sort(
          (a, b) => new Date(b.last_message_at) - new Date(a.last_message_at)
        );
      });
    });

    return () => unsub();
  }, [loadConversations]);

  // ─── Chọn conversation — tải messages + subscribe ─────────────
  const setActiveConvId = useCallback(async (convId, adminRole = 'admin') => {
    setActiveConvIdState(convId);
    activeConvIdRef.current = convId;

    // Hủy subscribe cũ
    if (unsubMsgsRef.current) { unsubMsgsRef.current(); unsubMsgsRef.current = null; }
    if (unsubTypingRef.current) { unsubTypingRef.current(); unsubTypingRef.current = null; }
    setUserIsTyping(false);
    setMessages([]);

    if (!convId) return;

    // Tải lịch sử tin nhắn
    setIsLoadingMsgs(true);
    try {
      const history = await spFetchConversationMessages(convId);
      if (activeConvIdRef.current === convId) {
        setMessages(history || []);
      }
    } finally {
      setIsLoadingMsgs(false);
    }

    // Đánh dấu admin đã đọc
    await spMarkConversationRead(convId, adminRole);
    setConversations((prev) =>
      prev.map((c) => c.id === convId ? { ...c, unread_admin: 0 } : c)
    );

    // Subscribe tin nhắn mới / cập nhật (vd. đã đọc) / bị xóa
    unsubMsgsRef.current = spSubscribeConversationMessages(convId, ({ eventType, row }) => {
      if (activeConvIdRef.current !== convId) return;

      if (eventType === 'DELETE') {
        setMessages((prev) => prev.filter((m) => m.id !== row.id));
        return;
      }

      const newMsg = row;
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === newMsg.id);
        if (idx === -1) return [...prev, newMsg];
        // UPDATE (vd. read_by_user vừa chuyển true) — merge vào tin nhắn đã có để dấu
        // ✓✓ "đã đọc" cập nhật ngay, không cần mở lại hội thoại.
        const next = [...prev];
        next[idx] = { ...next[idx], ...newMsg };
        return next;
      });

      // Chỉ xử lý khi có tin nhắn MỚI (INSERT) từ user — tránh vòng lặp vô ích khi
      // chính hành động đánh dấu đã đọc bên dưới lại tự phát sinh sự kiện UPDATE.
      if (eventType === 'INSERT' && newMsg.sender_role === 'user') {
        spMarkConversationRead(convId, adminRole).catch(() => {});
        setConversations((prev) =>
          prev.map((c) => c.id === convId ? { ...c, unread_admin: 0 } : c)
        );
      }
    });

    // Subscribe typing indicator từ user
    unsubTypingRef.current = spBroadcastTyping.subscribe(convId, ({ role, isTyping }) => {
      if (role === 'user') {
        setUserIsTyping(isTyping);
        clearTimeout(userTypingTimer.current);
        if (isTyping) {
          userTypingTimer.current = setTimeout(() => setUserIsTyping(false), 4000);
        }
      }
    });
  }, []);

  // Cleanup khi unmount
  useEffect(() => {
    return () => {
      if (unsubMsgsRef.current) unsubMsgsRef.current();
      if (unsubTypingRef.current) unsubTypingRef.current();
      clearTimeout(userTypingTimer.current);
    };
  }, []);

  // ─── Gửi phản hồi từ Admin (text và/hoặc ảnh) ─────────────────
  const sendReplyMessage = useCallback(async (text, adminUser, imageUrl) => {
    const convId = activeConvIdRef.current;
    const trimmed = (text || '').trim();
    if ((!trimmed && !imageUrl) || !convId || !adminUser) return;

    const conv = conversations.find((c) => c.id === convId);
    if (!conv) return;

    const adminRole = adminUser.role || 'admin';
    const adminName = adminUser.full_name || adminUser.account || 'Admin';
    const targetUserId = conv.user_id;

    const msgId = 'msg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const optimistic = {
      id: msgId,
      user_id: targetUserId,
      username: adminName,
      message: trimmed,
      image_url: imageUrl || null,
      sender_role: adminRole,
      conversation_id: convId,
      read_by_admin: true,
      read_by_user: false,
      created_at: new Date().toISOString(),
    };

    // Optimistic update
    setMessages((prev) => [...prev, optimistic]);

    // Dừng typing
    spBroadcastTyping.send(convId, adminUser.id, adminRole, false);

    // Lưu vào Supabase
    const saved = await spSendChatMessageV2({
      id: msgId,
      userId: targetUserId,
      username: adminName,
      message: trimmed,
      imageUrl: imageUrl || null,
      senderRole: adminRole,
      conversationId: convId,
    });

    if (saved) {
      setMessages((prev) => prev.map((m) => (m.id === msgId ? saved : m)));
    }

    // Emit socket để user widget thấy ngay
    emitSocketEvent('chat:send_message', {
      ...optimistic,
      conversationId: convId,
      userId: targetUserId,
    });
  }, [conversations]);

  const sendReply = useCallback((text, adminUser) => sendReplyMessage(text, adminUser), [sendReplyMessage]);

  // Tải ảnh lên Storage rồi gửi kèm chú thích (nếu có)
  const sendReplyImage = useCallback(async (file, adminUser, caption = '') => {
    if (!file) return;
    const imageUrl = await spUploadFile(file, 'chat');
    if (!imageUrl) return;
    await sendReplyMessage(caption, adminUser, imageUrl);
  }, [sendReplyMessage]);

  // ─── Xóa (thu hồi) 1 tin nhắn — Super Admin ──────────────────
  const deleteMessage = useCallback(async (msgId) => {
    if (!msgId) return false;
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
    return spDeleteChatMessage(msgId);
  }, []);

  // ─── Admin đang gõ → thông báo cho user ─────────────────────
  const adminTypingTimer = useRef(null);
  const notifyTyping = useCallback((isTyping, adminUser) => {
    const convId = activeConvIdRef.current;
    if (!convId || !adminUser) return;
    clearTimeout(adminTypingTimer.current);
    spBroadcastTyping.send(convId, adminUser.id, adminUser.role || 'admin', isTyping);
    if (isTyping) {
      adminTypingTimer.current = setTimeout(() => {
        spBroadcastTyping.send(convId, adminUser.id, adminUser.role || 'admin', false);
      }, 3000);
    }
  }, []);

  // ─── Tổng unread của admin ────────────────────────────────────
  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_admin || 0), 0);

  // ─── Conversation đang active ─────────────────────────────────
  const activeConversation = conversations.find((c) => c.id === activeConvId) || null;

  return {
    conversations,
    activeConvId,
    activeConversation,
    setActiveConvId,
    messages,
    userIsTyping,
    isLoadingConvs,
    isLoadingMsgs,
    sendReply,
    sendReplyImage,
    deleteMessage,
    notifyTyping,
    totalUnread,
    refreshConversations: loadConversations,
  };
}
