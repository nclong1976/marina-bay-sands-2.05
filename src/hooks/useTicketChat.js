import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getOrCreateActiveTicket, fetchMessagesPage, sendMessage, markTicketRead,
  subscribeConversationMessages, subscribeTicket,
} from '@/lib/messagingService';
import { spUploadFile, spBroadcastTyping } from '@/lib/supabaseService';
import { isSupabaseConfigured } from '@/lib/supabase';
import { emitSocketEvent } from '@/lib/socket';

const PAGE_SIZE = 30;

/**
 * useTicketChat — hook phía Người dùng cho ChatWidget, trên schema ticket mới
 * (conversations/messages/attachments). Thay cho useConversationChat.js cũ.
 *
 * `isOpen` cho hook biết khung chat có đang thật sự hiển thị hay không — chỉ
 * đánh dấu đã đọc khi người dùng thật sự đang nhìn thấy tin nhắn.
 */
export function useTicketChat(user, isOpen = false) {
  const userId = user?.id;
  const userName = user?.full_name || user?.account || 'Khách';

  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [agentIsTyping, setAgentIsTyping] = useState(false);

  const convIdRef = useRef(null);
  const isOpenRef = useRef(isOpen);
  useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);

  const typingTimer = useRef(null);
  const initPromiseRef = useRef(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const init = async () => {
      setIsLoading(true);
      try {
        const deviceContext = typeof navigator !== 'undefined'
          ? { userAgent: navigator.userAgent, viewport: `${window.innerWidth}x${window.innerHeight}` }
          : {};
        const conv = await getOrCreateActiveTicket(userId, { channel: 'widget', deviceContext });
        if (cancelled || !conv) return;
        setConversation(conv);
        convIdRef.current = conv.id;

        const page = await fetchMessagesPage(conv.id, { limit: PAGE_SIZE });
        if (!cancelled) {
          setMessages(page);
          setHasMore(page.length === PAGE_SIZE);
        }
      } catch (err) {
        console.error('[useTicketChat] init error:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    initPromiseRef.current = init();
    return () => { cancelled = true; };
  }, [userId]);

  // Đánh dấu đã đọc khi mở khung + khi có tin mới từ agent trong lúc đang mở.
  useEffect(() => {
    if (!isOpen || !conversation?.id) return;
    if (!conversation.unread_user) return;
    markTicketRead(conversation.id, 'user').catch(() => {});
    setConversation((prev) => (prev ? { ...prev, unread_user: 0 } : prev));
  }, [isOpen, conversation?.id, conversation?.unread_user]);

  // Theo dõi chính ticket này — biết ngay khi Admin claim/resolve/mở lại.
  useEffect(() => {
    const convId = conversation?.id;
    if (!convId) return;
    const unsub = subscribeTicket(convId, (updated) => {
      setConversation((prev) => (prev ? { ...prev, ...updated } : updated));
    });
    return () => unsub();
  }, [conversation?.id]);

  // Subscribe tin nhắn mới/cập nhật/xóa trong ticket.
  useEffect(() => {
    const convId = conversation?.id;
    if (!convId || !isSupabaseConfigured()) return;

    const unsub = subscribeConversationMessages(convId, ({ eventType, row }) => {
      if (eventType === 'DELETE') {
        setMessages((prev) => prev.filter((m) => m.id !== row.id));
        return;
      }
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === row.id);
        if (idx === -1) return [...prev, { ...row, attachments: row.attachments || [] }];
        const next = [...prev];
        next[idx] = { ...next[idx], ...row };
        return next;
      });

      if (eventType === 'INSERT' && row.sender_type === 'agent') {
        if (isOpenRef.current) {
          markTicketRead(convId, 'user').catch(() => {});
          setConversation((prev) => (prev ? { ...prev, unread_user: 0 } : prev));
        } else {
          setConversation((prev) => (prev ? { ...prev, unread_user: (prev.unread_user || 0) + 1 } : prev));
        }
      }
    });
    return () => unsub();
  }, [conversation?.id]);

  // Typing indicator từ agent.
  useEffect(() => {
    const convId = conversation?.id;
    if (!convId || !isSupabaseConfigured()) return;
    const unsub = spBroadcastTyping.subscribe(convId, ({ role, isTyping }) => {
      if (role === 'admin' || role === 'super_admin') {
        setAgentIsTyping(isTyping);
        clearTimeout(typingTimer.current);
        if (isTyping) typingTimer.current = setTimeout(() => setAgentIsTyping(false), 4000);
      }
    });
    return () => { unsub(); clearTimeout(typingTimer.current); };
  }, [conversation?.id]);

  const loadOlderMessages = useCallback(async () => {
    const convId = conversation?.id;
    if (!convId || isLoadingMore || !hasMore || messages.length === 0) return;
    setIsLoadingMore(true);
    try {
      const older = await fetchMessagesPage(convId, { before: messages[0].created_at, limit: PAGE_SIZE });
      setMessages((prev) => [...older, ...prev]);
      setHasMore(older.length === PAGE_SIZE);
    } finally {
      setIsLoadingMore(false);
    }
  }, [conversation?.id, messages, isLoadingMore, hasMore]);

  const send = useCallback(async (text, attachments = []) => {
    const trimmed = (text || '').trim();
    if (!trimmed && attachments.length === 0) return;
    if (!convIdRef.current && initPromiseRef.current) await initPromiseRef.current;
    const convId = convIdRef.current;
    if (!convId || !userId) return;

    const msgId = 'optimistic_' + Date.now().toString(36);
    const optimistic = {
      id: msgId, conversation_id: convId, sender_type: 'user', sender_id: userId,
      sender_name: userName, body: trimmed, status: 'sent', attachments,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    spBroadcastTyping.send(convId, userId, 'user', false);

    const saved = await sendMessage({ conversationId: convId, senderType: 'user', senderId: userId, senderName: userName, body: trimmed, attachments });
    if (saved) setMessages((prev) => prev.map((m) => (m.id === msgId ? saved : m)));

    emitSocketEvent('chat:send_message', { ...(saved || optimistic), conversationId: convId, userId });
  }, [userId, userName]);

  const sendImage = useCallback(async (file, caption = '') => {
    if (!file) return;
    const url = await spUploadFile(file, 'chat');
    if (!url) return;
    await send(caption, [{ url, mimeType: file.type, sizeBytes: file.size }]);
  }, [send]);

  const notifyTyping = useCallback((isTyping) => {
    const convId = conversation?.id;
    if (!convId || !userId) return;
    clearTimeout(typingTimer.current);
    spBroadcastTyping.send(convId, userId, 'user', isTyping);
    if (isTyping) typingTimer.current = setTimeout(() => spBroadcastTyping.send(convId, userId, 'user', false), 3000);
  }, [conversation?.id, userId]);

  return {
    conversation, messages, isLoading, isLoadingMore, hasMore, agentIsTyping,
    unreadUser: conversation?.unread_user || 0,
    send, sendImage, notifyTyping, loadOlderMessages,
  };
}
