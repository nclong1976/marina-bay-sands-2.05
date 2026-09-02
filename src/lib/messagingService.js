// ─── Direct In-App Messaging (ticket-based) ─────────────────────────────────
// Thay thế hệ chat cũ (support_conversations/chat_messages, xem localChat.js
// — đã gỡ khỏi luồng chạy) bằng schema ticket thật: 1 người dùng có thể có
// NHIỀU conversations theo thời gian (pending → active → resolved → có thể
// mở lại), thay vì đúng 1 hội thoại vĩnh viễn như trước. Xem tài liệu thiết
// kế "Sands Messaging Blueprint" cho toàn bộ lý do kiến trúc.
import { supabase, isSupabaseConfigured } from './supabase';
import { spGetAppSetting } from './supabaseService';

const genId = (prefix) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// Đăng ký kênh Realtime dùng chung theo key — tránh subscribe trùng cùng 1
// topic từ nhiều component/hook instance (Supabase báo lỗi nếu gọi .on() lần
// 2 trên kênh đã subscribe). Bản sao riêng cho module này, xem giải thích ở
// đầu supabaseService.js.
const sharedChannels = new Map();
const subscribeShared = (key, createChannel) => (onMessage) => {
  if (!isSupabaseConfigured() || !supabase) return () => {};
  let entry = sharedChannels.get(key);
  if (!entry) {
    const listeners = new Set();
    let channel;
    try {
      channel = createChannel((payload) => listeners.forEach((cb) => cb(payload)));
    } catch (e) {
      console.warn('Messaging realtime subscribe notice:', e?.message);
      return () => {};
    }
    entry = { channel, listeners };
    sharedChannels.set(key, entry);
  }
  entry.listeners.add(onMessage);
  return () => {
    entry.listeners.delete(onMessage);
    if (entry.listeners.size === 0) {
      supabase.removeChannel(entry.channel);
      sharedChannels.delete(key);
    }
  };
};

// ── Conversations (tickets) ─────────────────────────────────────────────

/**
 * Lấy ticket đang mở (pending/active) gần nhất của người dùng, hoặc tạo mới
 * kèm tin chào tự động nếu chưa có/ticket trước đã resolved. Đây là điểm vào
 * DUY NHẤT khi mở ChatWidget — đảm bảo không bao giờ gửi tin mà chưa có
 * conversation_id hợp lệ (lớp lỗi đã từng làm mất tin nhắn thật).
 */
export const getOrCreateActiveTicket = async (userId, { channel = 'widget', deviceContext = {} } = {}) => {
  if (!isSupabaseConfigured() || !userId) return null;

  const { data: existing } = await supabase
    .from('conversations')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['pending', 'active'])
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return existing;

  const newConv = {
    id: genId('conv'),
    user_id: userId,
    status: 'pending',
    channel,
    device_context: deviceContext,
    unread_admin: 0,
    unread_user: 0,
    last_message_at: new Date().toISOString(),
    last_message_preview: '',
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from('conversations').insert([newConv]).select().single();
  if (error) {
    const { data: retry } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['pending', 'active'])
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return retry;
  }

  await insertGreetingMessage(data.id);
  return data;
};

/** Tin chào tự động — nội dung khác nhau trong/ngoài giờ hỗ trợ (app_settings.support_hours). */
const insertGreetingMessage = async (conversationId) => {
  const setting = await spGetAppSetting('support_hours');
  const hours = setting?.value || { enabled: false, start: '09:00', end: '23:00' };

  let body = 'Xin chào! 👋 Đội ngũ CSKH đã nhận được tin nhắn của bạn, sẽ phản hồi trong ít phút.';
  if (hours.enabled) {
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = (hours.start || '09:00').split(':').map(Number);
    const [eh, em] = (hours.end || '23:00').split(':').map(Number);
    const inHours = mins >= sh * 60 + sm && mins <= eh * 60 + em;
    if (!inHours) {
      body = `Hiện ngoài giờ hỗ trợ (${hours.start}–${hours.end}). Để lại tin nhắn, chúng tôi phản hồi ngay khi vào ca.`;
    }
  }

  await supabase.from('messages').insert([{
    id: genId('msg'),
    conversation_id: conversationId,
    sender_type: 'bot',
    sender_id: null,
    sender_name: 'CSKH',
    body,
    status: 'delivered',
    created_at: new Date().toISOString(),
  }]);
};

/** Admin: hàng đợi theo trạng thái, kèm hồ sơ người dùng để hiển thị danh sách. */
export const fetchTicketQueue = async (status) => {
  if (!isSupabaseConfigured()) return [];
  let q = supabase
    .from('conversations')
    .select('*, users_profile:user_id(id, account, full_name, email, role), assigned:assigned_admin_id(id, account, full_name)')
    .order('last_message_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) { console.error('fetchTicketQueue:', error); return []; }
  return data || [];
};

/** 1 người dùng theo dõi đúng ticket của mình — biết ngay khi Admin đổi trạng thái. */
export const subscribeTicket = (conversationId, onChange) => {
  if (!isSupabaseConfigured() || !supabase || !conversationId) return () => {};
  const key = `public:conversations:id:${conversationId}`;
  return subscribeShared(key, (emit) =>
    supabase
      .channel(key)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations', filter: `id=eq.${conversationId}` },
        (payload) => { if (payload.new) emit(payload.new); })
      .subscribe()
  )(onChange);
};

export const subscribeTicketQueue = subscribeShared('public:conversations', (emit) =>
  supabase
    .channel('public:conversations')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, (payload) => {
      if (payload.new) emit(payload.new);
    })
    .subscribe()
);

/** Nhận ticket — UPDATE có điều kiện để 2 admin bấm cùng lúc chỉ 1 người thắng. */
export const claimTicket = async (conversationId, admin) => {
  if (!isSupabaseConfigured() || !admin?.id) return { ok: false, reason: 'no_admin' };
  const { data, error } = await supabase
    .from('conversations')
    .update({ status: 'active', assigned_admin_id: admin.id })
    .eq('id', conversationId)
    .is('assigned_admin_id', null)
    .select()
    .maybeSingle();
  if (error) return { ok: false, reason: error.message };
  if (!data) return { ok: false, reason: 'already_claimed' };
  return { ok: true, conversation: data };
};

export const unclaimTicket = async (conversationId) => {
  if (!isSupabaseConfigured()) return;
  await supabase.from('conversations').update({ status: 'pending', assigned_admin_id: null }).eq('id', conversationId);
};

export const resolveTicket = async (conversationId, admin) => {
  if (!isSupabaseConfigured()) return;
  await supabase
    .from('conversations')
    .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: admin?.id || null })
    .eq('id', conversationId);
};

export const reopenTicket = async (conversationId) => {
  if (!isSupabaseConfigured()) return;
  await supabase.from('conversations').update({ status: 'active' }).eq('id', conversationId);
};

/** Round-robin: gán ticket pending cho admin online lâu chưa nhận việc nhất. */
export const autoAssignRoundRobin = async (conversationId, onlineAdminIds) => {
  if (!isSupabaseConfigured() || !onlineAdminIds || onlineAdminIds.length === 0) return null;
  const { data: candidates } = await supabase
    .from('conversations')
    .select('assigned_admin_id')
    .in('assigned_admin_id', onlineAdminIds)
    .order('last_message_at', { ascending: false });

  const lastAssignedRank = new Map(onlineAdminIds.map((id) => [id, 0]));
  (candidates || []).forEach((c, idx) => {
    if (c.assigned_admin_id && lastAssignedRank.has(c.assigned_admin_id)) {
      lastAssignedRank.set(c.assigned_admin_id, Math.max(lastAssignedRank.get(c.assigned_admin_id), candidates.length - idx));
    }
  });
  const nextAdminId = [...lastAssignedRank.entries()].sort((a, b) => a[1] - b[1])[0][0];

  const { data } = await supabase
    .from('conversations')
    .update({ status: 'active', assigned_admin_id: nextAdminId })
    .eq('id', conversationId)
    .is('assigned_admin_id', null)
    .select()
    .maybeSingle();
  return data;
};

// ── Messages ─────────────────────────────────────────────────────────────

export const fetchMessagesPage = async (conversationId, { before, limit = 30 } = {}) => {
  if (!isSupabaseConfigured() || !conversationId) return [];
  let q = supabase
    .from('messages')
    .select('*, attachments(*)')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q;
  if (error) { console.error('fetchMessagesPage:', error); return []; }
  return (data || []).reverse();
};

export const sendMessage = async ({ conversationId, senderType, senderId, senderName, body, attachments = [] }) => {
  if (!isSupabaseConfigured() || !conversationId) return null;
  const trimmed = (body || '').trim();
  if (!trimmed && attachments.length === 0) return null;

  const msgId = genId('msg');
  const { data: msg, error } = await supabase
    .from('messages')
    .insert([{
      id: msgId,
      conversation_id: conversationId,
      sender_type: senderType,
      sender_id: senderId || null,
      sender_name: senderName || '',
      body: trimmed,
      status: 'delivered',
      created_at: new Date().toISOString(),
    }])
    .select()
    .single();

  if (error) { console.error('sendMessage:', error); return null; }

  let savedAttachments = [];
  if (attachments.length > 0) {
    const rows = attachments.map((a) => ({
      id: genId('att'),
      message_id: msgId,
      file_url: a.url,
      thumbnail_url: a.url,
      mime_type: a.mimeType,
      size_bytes: a.sizeBytes || null,
      scan_status: 'clean',
    }));
    const { data: attData } = await supabase.from('attachments').insert(rows).select();
    savedAttachments = attData || [];
  }

  return { ...msg, attachments: savedAttachments };
};

export const markTicketRead = async (conversationId, role) => {
  if (!isSupabaseConfigured() || !conversationId) return;
  const isAgent = role === 'admin' || role === 'super_admin';
  await supabase
    .from('messages')
    .update({ status: 'read' })
    .eq('conversation_id', conversationId)
    .neq('status', 'read')
    .eq('sender_type', isAgent ? 'user' : 'agent');
  await supabase
    .from('conversations')
    .update(isAgent ? { unread_admin: 0 } : { unread_user: 0 })
    .eq('id', conversationId);
};

export const subscribeConversationMessages = (conversationId, onChange) => {
  if (!isSupabaseConfigured() || !supabase || !conversationId) return () => {};
  const key = `public:messages:conv:${conversationId}`;
  return subscribeShared(key, (emit) =>
    supabase
      .channel(key)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const row = payload.new && Object.keys(payload.new).length > 0 ? payload.new : payload.old;
          if (row) emit({ eventType: payload.eventType, row });
        })
      .subscribe()
  )(onChange);
};

export const deleteMessage = async (messageId) => {
  if (!isSupabaseConfigured() || !messageId) return false;
  const { error } = await supabase.from('messages').delete().eq('id', messageId);
  return !error;
};

// ── Internal notes (Admin-only, không đi qua kênh người dùng subscribe) ───

export const fetchInternalNotes = async (conversationId) => {
  if (!isSupabaseConfigured() || !conversationId) return [];
  const { data } = await supabase.from('internal_notes').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true });
  return data || [];
};

export const addInternalNote = async ({ conversationId, adminId, adminName, body }) => {
  if (!isSupabaseConfigured() || !conversationId || !body?.trim()) return null;
  const { data } = await supabase
    .from('internal_notes')
    .insert([{ id: genId('note'), conversation_id: conversationId, admin_id: adminId, admin_name: adminName, body: body.trim() }])
    .select()
    .single();
  return data;
};

export const subscribeInternalNotes = (conversationId, onChange) => {
  if (!isSupabaseConfigured() || !supabase || !conversationId) return () => {};
  const key = `public:internal_notes:conv:${conversationId}`;
  return subscribeShared(key, (emit) =>
    supabase
      .channel(key)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'internal_notes', filter: `conversation_id=eq.${conversationId}` },
        (payload) => { if (payload.new) emit(payload.new); })
      .subscribe()
  )(onChange);
};

// ── Quick replies / macros ─────────────────────────────────────────────

export const fetchQuickReplies = async () => {
  if (!isSupabaseConfigured()) return [];
  const { data } = await supabase.from('quick_replies').select('*').order('created_at', { ascending: true });
  return data || [];
};

export const saveQuickReply = async ({ id, shortcut, title, body, ownerAdminId }) => {
  if (!isSupabaseConfigured() || !title?.trim() || !body?.trim()) return null;
  const row = { id: id || genId('qr'), shortcut: shortcut || null, title: title.trim(), body: body.trim(), owner_admin_id: ownerAdminId || null };
  const { data } = await supabase.from('quick_replies').upsert([row]).select().maybeSingle();
  return data;
};

export const deleteQuickReply = async (id) => {
  if (!isSupabaseConfigured() || !id) return;
  await supabase.from('quick_replies').delete().eq('id', id);
};

// ── User Context panel (Admin) ──────────────────────────────────────────

export const fetchUserContext = async (userId) => {
  if (!isSupabaseConfigured() || !userId) return null;
  const [{ data: profile }, { data: transactions }, { data: withdrawals }, { data: bets }] = await Promise.all([
    supabase.from('users_profile').select('*').eq('id', userId).maybeSingle(),
    supabase.from('transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(5),
    supabase.from('withdraw_requests').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(5),
    supabase.from('game_bets').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(5),
  ]);
  return { profile, transactions: transactions || [], withdrawals: withdrawals || [], bets: bets || [] };
};

// ── Presence (Admin online/offline) ─────────────────────────────────────

let presenceChannel = null;
export const joinAdminPresence = (admin) => {
  if (!isSupabaseConfigured() || !supabase || !admin?.id) return () => {};
  presenceChannel = supabase.channel('presence:admins', { config: { presence: { key: admin.id } } });
  presenceChannel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      presenceChannel.track({ id: admin.id, name: admin.full_name || admin.account, online_at: new Date().toISOString() });
    }
  });
  return () => {
    if (presenceChannel) { supabase.removeChannel(presenceChannel); presenceChannel = null; }
  };
};

export const subscribeAdminPresence = (onChange) => {
  if (!isSupabaseConfigured() || !supabase) return () => {};
  const ch = supabase.channel('presence:admins-watch', { config: { presence: { key: 'watcher' } } });
  ch.on('presence', { event: 'sync' }, () => {
    const state = ch.presenceState();
    const onlineIds = Object.values(state).flat().map((p) => p.id);
    onChange([...new Set(onlineIds)]);
  });
  ch.subscribe();
  return () => supabase.removeChannel(ch);
};

// ── Business hours setting (dùng chung bởi widget chào tự động + trang Cài đặt) ──

export const fetchSupportHours = async () => {
  const setting = await spGetAppSetting('support_hours');
  return setting?.value || { enabled: false, start: '09:00', end: '23:00' };
};
