import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  fetchTicketQueue, subscribeTicketQueue, claimTicket, unclaimTicket, resolveTicket, reopenTicket,
  fetchMessagesPage, sendMessage, markTicketRead, subscribeConversationMessages,
  fetchInternalNotes, addInternalNote, subscribeInternalNotes,
  fetchQuickReplies, joinAdminPresence, subscribeAdminPresence, deleteMessage,
} from '@/lib/messagingService';
import { spUploadFile, spBroadcastTyping } from '@/lib/supabaseService';
import { isSupabaseConfigured } from '@/lib/supabase';
import { isSecretChatUser } from '@/lib/localChat';
import { emitSocketEvent } from '@/lib/socket';

const PAGE_SIZE = 30;

/**
 * useAdminTickets — hook DUY NHẤT phía Admin cho hàng đợi ticket (Pending/
 * Active/Resolved) + thread đang mở. Được gọi 1 LẦN bên trong
 * <AdminChatProvider> (xem AdminChatContext.jsx) — sửa lỗi đã ghi nhận trong
 * audit: trước đây AdminApp.jsx và Chat.jsx mỗi nơi tự gọi useAdminChat()
 * riêng, tạo 2 bản state độc lập có thể lệch nhau.
 */
export function useAdminTickets(currentUser) {
  const isSuperAdmin = currentUser?.role === 'super_admin';

  const [conversations, setConversations] = useState([]);
  const [isLoadingConvs, setIsLoadingConvs] = useState(false);
  const [onlineAdminIds, setOnlineAdminIds] = useState([]);

  const [activeConvId, setActiveConvIdState] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoadingMsgs, setIsLoadingMsgs] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [userIsTyping, setUserIsTyping] = useState(false);
  const [internalNotes, setInternalNotes] = useState([]);
  const [quickReplies, setQuickReplies] = useState([]);

  const userTypingTimer = useRef(null);
  const unsubMsgsRef = useRef(null);
  const unsubTypingRef = useRef(null);
  const unsubNotesRef = useRef(null);
  const activeConvIdRef = useRef(null);

  const loadQueue = useCallback(async () => {
    setIsLoadingConvs(true);
    try {
      const list = await fetchTicketQueue();
      setConversations(list);
    } finally {
      setIsLoadingConvs(false);
    }
  }, []);

  useEffect(() => { loadQueue(); }, [loadQueue]);
  useEffect(() => { fetchQuickReplies().then(setQuickReplies); }, []);

  // Presence: "vào ca" khi mở Admin Console, "tan ca" khi rời trang.
  useEffect(() => {
    if (!currentUser?.id) return;
    const leave = joinAdminPresence(currentUser);
    const unsub = subscribeAdminPresence(setOnlineAdminIds);
    return () => { leave(); unsub(); };
  }, [currentUser?.id]);

  // Realtime: hàng đợi tự cập nhật khi có ticket mới/đổi trạng thái/được claim.
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const unsub = subscribeTicketQueue((updated) => {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === updated.id);
        if (idx === -1) { loadQueue(); return prev; }
        const next = [...prev];
        next[idx] = { ...next[idx], ...updated };
        return next.sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at));
      });
    });
    return () => unsub();
  }, [loadQueue]);

  const setActiveConvId = useCallback(async (convId) => {
    setActiveConvIdState(convId);
    activeConvIdRef.current = convId;
    if (unsubMsgsRef.current) { unsubMsgsRef.current(); unsubMsgsRef.current = null; }
    if (unsubTypingRef.current) { unsubTypingRef.current(); unsubTypingRef.current = null; }
    if (unsubNotesRef.current) { unsubNotesRef.current(); unsubNotesRef.current = null; }
    setUserIsTyping(false);
    setMessages([]);
    setInternalNotes([]);
    setHasMore(true);
    if (!convId) return;

    setIsLoadingMsgs(true);
    try {
      const page = await fetchMessagesPage(convId, { limit: PAGE_SIZE });
      if (activeConvIdRef.current === convId) {
        setMessages(page);
        setHasMore(page.length === PAGE_SIZE);
      }
      const notes = await fetchInternalNotes(convId);
      if (activeConvIdRef.current === convId) setInternalNotes(notes);
    } finally {
      if (activeConvIdRef.current === convId) setIsLoadingMsgs(false);
    }

    await markTicketRead(convId, currentUser?.role);
    setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, unread_admin: 0 } : c)));

    unsubMsgsRef.current = subscribeConversationMessages(convId, ({ eventType, row }) => {
      if (activeConvIdRef.current !== convId) return;
      if (eventType === 'DELETE') { setMessages((prev) => prev.filter((m) => m.id !== row.id)); return; }
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === row.id);
        if (idx === -1) return [...prev, { ...row, attachments: row.attachments || [] }];
        const next = [...prev];
        next[idx] = { ...next[idx], ...row };
        return next;
      });
      if (eventType === 'INSERT' && row.sender_type === 'user') {
        markTicketRead(convId, currentUser?.role).catch(() => {});
        setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, unread_admin: 0 } : c)));
      }
    });

    unsubTypingRef.current = spBroadcastTyping.subscribe(convId, ({ role, isTyping }) => {
      if (role === 'user') {
        setUserIsTyping(isTyping);
        clearTimeout(userTypingTimer.current);
        if (isTyping) userTypingTimer.current = setTimeout(() => setUserIsTyping(false), 4000);
      }
    });

    unsubNotesRef.current = subscribeInternalNotes(convId, (note) => {
      setInternalNotes((prev) => (prev.some((n) => n.id === note.id) ? prev : [...prev, note]));
    });
  }, [currentUser?.role]);

  useEffect(() => () => {
    unsubMsgsRef.current?.();
    unsubTypingRef.current?.();
    unsubNotesRef.current?.();
    clearTimeout(userTypingTimer.current);
  }, []);

  const loadOlderMessages = useCallback(async () => {
    const convId = activeConvIdRef.current;
    if (!convId || isLoadingMore || !hasMore || messages.length === 0) return;
    setIsLoadingMore(true);
    try {
      const older = await fetchMessagesPage(convId, { before: messages[0].created_at, limit: PAGE_SIZE });
      setMessages((prev) => [...older, ...prev]);
      setHasMore(older.length === PAGE_SIZE);
    } finally {
      setIsLoadingMore(false);
    }
  }, [messages, isLoadingMore, hasMore]);

  const sendReplyMessage = useCallback(async (text, attachments = []) => {
    const convId = activeConvIdRef.current;
    const trimmed = (text || '').trim();
    if ((!trimmed && attachments.length === 0) || !convId || !currentUser) return;

    const adminRole = currentUser.role || 'admin';
    const adminName = currentUser.full_name || currentUser.account || 'Admin';
    const msgId = 'optimistic_' + Date.now().toString(36);
    const optimistic = {
      id: msgId, conversation_id: convId, sender_type: 'agent', sender_id: currentUser.id,
      sender_name: adminName, body: trimmed, status: 'delivered', attachments,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    spBroadcastTyping.send(convId, currentUser.id, adminRole, false);

    const saved = await sendMessage({ conversationId: convId, senderType: 'agent', senderId: currentUser.id, senderName: adminName, body: trimmed, attachments });
    if (saved) setMessages((prev) => prev.map((m) => (m.id === msgId ? saved : m)));

    const conv = conversations.find((c) => c.id === convId);
    emitSocketEvent('chat:send_message', { ...(saved || optimistic), conversationId: convId, userId: conv?.user_id });
  }, [currentUser, conversations]);

  const sendReply = useCallback((text) => sendReplyMessage(text), [sendReplyMessage]);
  const sendReplyImage = useCallback(async (file, caption = '') => {
    if (!file) return;
    const url = await spUploadFile(file, 'chat');
    if (!url) return;
    await sendReplyMessage(caption, [{ url, mimeType: file.type, sizeBytes: file.size }]);
  }, [sendReplyMessage]);

  const removeMessage = useCallback(async (msgId) => {
    if (!msgId) return false;
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
    return deleteMessage(msgId);
  }, []);

  const notifyTyping = useCallback((isTyping) => {
    const convId = activeConvIdRef.current;
    if (!convId || !currentUser) return;
    clearTimeout(userTypingTimer.current);
    spBroadcastTyping.send(convId, currentUser.id, currentUser.role || 'admin', isTyping);
    if (isTyping) userTypingTimer.current = setTimeout(() => spBroadcastTyping.send(convId, currentUser.id, currentUser.role || 'admin', false), 3000);
  }, [currentUser]);

  const claim = useCallback(async (convId) => {
    const res = await claimTicket(convId, currentUser);
    if (res.ok) setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, ...res.conversation } : c)));
    return res;
  }, [currentUser]);
  const unclaim = useCallback(async (convId) => {
    await unclaimTicket(convId);
    setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, status: 'pending', assigned_admin_id: null } : c)));
  }, []);
  const resolve = useCallback(async (convId) => {
    await resolveTicket(convId, currentUser);
    setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, status: 'resolved' } : c)));
  }, [currentUser]);
  const reopen = useCallback(async (convId) => {
    await reopenTicket(convId);
    setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, status: 'active' } : c)));
  }, []);

  const addNote = useCallback(async (body) => {
    const convId = activeConvIdRef.current;
    if (!convId || !currentUser || !body?.trim()) return;
    const note = await addInternalNote({ conversationId: convId, adminId: currentUser.id, adminName: currentUser.full_name || currentUser.account, body });
    if (note) setInternalNotes((prev) => (prev.some((n) => n.id === note.id) ? prev : [...prev, note]));
  }, [currentUser]);

  // Ẩn hội thoại "bí mật" (Ghost Mode) với Admin thường — vẫn dùng đúng cơ chế
  // stealth-list hiện có (localChat.js), chỉ đổi nguồn dữ liệu sang schema mới.
  const visibleConversations = useMemo(() => {
    if (isSuperAdmin) return conversations;
    return conversations.filter((c) => !c.is_secret && !isSecretChatUser(c.user_id) && !isSecretChatUser(c.users_profile?.account));
  }, [conversations, isSuperAdmin]);

  const pending = useMemo(() => visibleConversations.filter((c) => c.status === 'pending'), [visibleConversations]);
  const active = useMemo(() => visibleConversations.filter((c) => c.status === 'active'), [visibleConversations]);
  const resolved = useMemo(() => visibleConversations.filter((c) => c.status === 'resolved'), [visibleConversations]);
  const totalUnread = useMemo(() => visibleConversations.reduce((sum, c) => sum + (c.unread_admin || 0), 0), [visibleConversations]);
  const activeConversation = conversations.find((c) => c.id === activeConvId) || null;

  return {
    conversations: visibleConversations, pending, active, resolved,
    isLoadingConvs, onlineAdminIds, refreshQueue: loadQueue,
    activeConvId, activeConversation, setActiveConvId,
    messages, isLoadingMsgs, isLoadingMore, hasMore, loadOlderMessages,
    userIsTyping, sendReply, sendReplyImage, removeMessage, notifyTyping,
    internalNotes, addNote, quickReplies, refreshQuickReplies: () => fetchQuickReplies().then(setQuickReplies),
    claim, unclaim, resolve, reopen, totalUnread,
  };
}
