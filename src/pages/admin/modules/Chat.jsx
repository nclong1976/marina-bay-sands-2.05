import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, Search, Ghost, Trash2, MessageSquare,
  Loader2, RefreshCw, CheckCheck, ChevronDown, ChevronLeft, Paperclip, X, Zap,
  UserCheck, CircleCheck, RotateCcw, StickyNote, IdCard, Circle,
} from 'lucide-react';

const MAX_IMAGE_MB = 5;
import { Panel, inputCls } from '../ui';
import { useAuth } from '@/lib/AuthContext';
import { useAdminChatContext } from '@/lib/AdminChatContext';
import { useToast } from '@/components/ui/use-toast';
import { fetchUserContext } from '@/lib/messagingService';
import cskhAvatar from '@/assets/images/cskh_avatar.jpg';

// ─── Thời gian tương đối ──────────────────────────────────────────────────
const timeAgo = (dateStr) => {
  if (!dateStr) return '';
  const min = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (min < 1) return 'Vừa xong';
  if (min < 60) return `${min} phút`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} giờ`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} ngày`;
  return new Date(dateStr).toLocaleDateString('vi-VN');
};

const STATUS_META = {
  pending: { label: 'Đang chờ', dot: 'bg-amber-400', tone: 'amber' },
  active: { label: 'Đang xử lý', dot: 'bg-emerald-400', tone: 'green' },
  resolved: { label: 'Đã giải quyết', dot: 'bg-white/30', tone: 'neutral' },
};

// ─── Avatar ──────────────────────────────────────────────────────────────
const Avatar = ({ name, isAgent }) => {
  if (isAgent) {
    return <img src={cskhAvatar} alt="CSKH" className="w-8 h-8 rounded-full object-cover shrink-0 shadow" />;
  }
  const letter = (name || 'U').charAt(0).toUpperCase();
  return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-bold shadow bg-gradient-to-br from-indigo-500 to-purple-600">
      {letter}
    </div>
  );
};

const TypingDots = ({ label = 'đang gõ...' }) => (
  <div className="flex items-center gap-1.5 px-3 py-1.5">
    {[0, 1, 2].map((i) => (
      <span key={i} className="w-1.5 h-1.5 rounded-full bg-white/50 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
    ))}
    <span className="text-[10px] text-white/40 ml-1">{label}</span>
  </div>
);

// ─── Message bubble ────────────────────────────────────────────────────────
const MessageBubble = ({ msg, isFromAgent, onDelete, canDelete, onViewImage }) => {
  const time = msg.created_at ? new Date(msg.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';
  const isBot = msg.sender_type === 'bot';
  const attachment = msg.attachments?.[0];

  return (
    <div className={`group flex items-end gap-2 ${isFromAgent ? 'flex-row-reverse' : 'flex-row'}`}>
      {canDelete && !isBot && (
        <button onClick={() => onDelete(msg.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/20 shrink-0 mb-1"
          title="Xóa tin nhắn">
          <Trash2 size={13} />
        </button>
      )}
      <Avatar name={msg.sender_name} isAgent={isFromAgent} />
      <div className={`max-w-[72%] flex flex-col ${isFromAgent ? 'items-end' : 'items-start'}`}>
        {isBot && <span className="text-[10px] text-white/30 mb-0.5 px-1">Tự động</span>}
        {attachment && (
          <button type="button" onClick={() => onViewImage?.(attachment.file_url)}
            className={`mb-1 block overflow-hidden rounded-2xl border border-white/10 ${isFromAgent ? 'rounded-br-sm' : 'rounded-bl-sm'}`}>
            <img src={attachment.file_url} alt="Ảnh đính kèm" className="w-[220px] h-[170px] object-cover block" loading="lazy" />
          </button>
        )}
        {msg.body && (
          <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words shadow-sm
            ${isFromAgent
              ? isBot ? 'bg-white/[0.06] text-white/70 border border-white/10 rounded-br-sm' : 'bg-gradient-to-br from-[#7033ff] to-[#4b00ff] text-white rounded-br-sm'
              : 'bg-white/10 text-white rounded-bl-sm border border-white/10'}`}>
            {msg.body}
          </div>
        )}
        <div className={`flex items-center gap-1 mt-0.5 px-1 ${isFromAgent ? 'flex-row-reverse' : ''}`}>
          <span className="text-[10px] text-white/35">{time}</span>
          {isFromAgent && !isBot && (
            msg.status === 'read'
              ? <CheckCheck size={12} className="text-indigo-400" title="Đã đọc" />
              : <CheckCheck size={12} className="text-white/25" title="Đã nhận" />
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Conversation Item ──────────────────────────────────────────────────
const ConvItem = ({ conv, isActive, onClick, onQuickClaim }) => {
  const profile = conv.users_profile || {};
  const displayName = profile.full_name || profile.account || conv.user_id;
  const unread = conv.unread_admin || 0;
  const lastTime = conv.last_message_at ? timeAgo(conv.last_message_at) : '';
  const lastTimeExact = conv.last_message_at ? new Date(conv.last_message_at).toLocaleString('vi-VN') : '';

  return (
    <button onClick={onClick}
      className={`w-full text-left px-3 py-3 border-b border-white/5 hover:bg-white/5 transition-colors flex items-start gap-2.5
        ${isActive ? 'bg-white/10 border-l-2 border-l-[#7033ff]' : ''}`}>
      <Avatar name={displayName} isAgent={false} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1 mb-0.5">
          <p className={`text-sm truncate ${unread > 0 ? 'font-semibold text-white' : 'font-medium text-white/90'}`}>{displayName}</p>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] text-white/35" title={lastTimeExact}>{lastTime}</span>
            {unread > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className={`text-[11px] truncate ${unread > 0 ? 'text-white/70' : 'text-white/40'}`}>
            {conv.last_message_preview || 'Chưa có tin nhắn'}
          </p>
          {conv.status === 'pending' && onQuickClaim && (
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); onQuickClaim(conv.id); }}
              className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 flex items-center gap-1"
            >
              <UserCheck size={11} /> Nhận
            </span>
          )}
          {conv.status === 'active' && conv.assigned?.full_name && (
            <span className="shrink-0 text-[10px] text-white/30 truncate max-w-[80px]">{conv.assigned.full_name}</span>
          )}
        </div>
      </div>
    </button>
  );
};

// ─── User Context panel ────────────────────────────────────────────────
const UserContextPanel = ({ userId, onClose }) => {
  const [ctx, setCtx] = useState(null);
  useEffect(() => { fetchUserContext(userId).then(setCtx); }, [userId]);

  return (
    <div className="fixed inset-0 z-[10000] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-[#161936] border border-white/10 rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between sticky top-0 bg-[#161936]">
          <p className="text-sm font-bold text-white flex items-center gap-2"><IdCard size={16} className="text-[#ffab40]" /> Ngữ cảnh người dùng</p>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white"><X size={16} /></button>
        </div>
        {!ctx ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 text-white/40 animate-spin" /></div>
        ) : (
          <div className="p-4 space-y-4 text-sm">
            <div>
              <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wide mb-1.5">Tài khoản</p>
              <p className="text-white font-medium">{ctx.profile?.full_name || ctx.profile?.account}</p>
              <p className="text-white/50 text-xs">{ctx.profile?.account} · {ctx.profile?.email || '—'}</p>
              <p className="text-white/50 text-xs mt-1">Tham gia: {ctx.profile?.created_at ? new Date(ctx.profile.created_at).toLocaleDateString('vi-VN') : '—'} · Số dư: ${Number(ctx.profile?.balance || 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wide mb-1.5">Giao dịch gần đây</p>
              {ctx.transactions.length === 0 ? <p className="text-white/30 text-xs">Chưa có giao dịch</p> : (
                <div className="space-y-1">
                  {ctx.transactions.map((t) => (
                    <div key={t.id} className="flex justify-between text-xs text-white/70">
                      <span>{t.type} · {new Date(t.created_at).toLocaleDateString('vi-VN')}</span>
                      <span className="font-mono text-[#bd9c59]">${Number(t.amount).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wide mb-1.5">Đơn rút tiền gần đây</p>
              {ctx.withdrawals.length === 0 ? <p className="text-white/30 text-xs">Chưa có đơn rút</p> : (
                <div className="space-y-1">
                  {ctx.withdrawals.map((w) => (
                    <div key={w.id} className="flex justify-between text-xs text-white/70">
                      <span>{w.status} · {new Date(w.created_at).toLocaleDateString('vi-VN')}</span>
                      <span className="font-mono text-[#bd9c59]">${Number(w.amount).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wide mb-1.5">Vé cược gần đây</p>
              {ctx.bets.length === 0 ? <p className="text-white/30 text-xs">Chưa đặt cược</p> : (
                <div className="space-y-1">
                  {ctx.bets.map((b) => (
                    <div key={b.id} className="flex justify-between text-xs text-white/70">
                      <span>{b.game_type} · {b.status}</span>
                      <span className="font-mono text-[#bd9c59]">${Number(b.amount).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main Chat Module ─────────────────────────────────────────────────────
export default function Chat() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.role === 'super_admin';

  const {
    pending, active, resolved, activeConvId, activeConversation, setActiveConvId,
    messages, userIsTyping, isLoadingConvs, isLoadingMsgs, isLoadingMore, hasMore, loadOlderMessages,
    sendReply, sendReplyImage, removeMessage, notifyTyping, refreshQueue,
    internalNotes, addNote, quickReplies, claim, unclaim, resolve, reopen, totalUnread,
  } = useAdminChatContext();

  const [tab, setTab] = useState('pending');
  const [panel, setPanel] = useState('reply'); // 'reply' | 'notes'
  const [text, setText] = useState('');
  const [noteText, setNoteText] = useState('');
  const [q, setQ] = useState('');
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [pendingImage, setPendingImage] = useState(null);
  const [imageError, setImageError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [viewerImage, setViewerImage] = useState(null);
  const [showContext, setShowContext] = useState(false);
  const messagesEndRef = useRef(null);
  const scrollAreaRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const queues = { pending, active, resolved };
  const TABS = [
    { id: 'pending', label: 'Đang chờ', count: pending.length },
    { id: 'active', label: 'Đang xử lý', count: active.length },
    { id: 'resolved', label: 'Đã giải quyết', count: resolved.length },
  ];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, userIsTyping]);

  const onScroll = () => {
    const el = scrollAreaRef.current;
    if (!el) return;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 80);
    if (el.scrollTop < 60 && hasMore && !isLoadingMore) loadOlderMessages();
  };

  const handleSelectConv = useCallback((convId) => {
    setPendingImage((prev) => { if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl); return null; });
    setImageError(''); setShowTemplates(false); setPanel('reply');
    setActiveConvId(convId);
  }, [setActiveConvId]);

  const handleSend = useCallback(async () => {
    if ((!text.trim() && !pendingImage) || !activeConvId) return;
    const t = text; const img = pendingImage;
    setText(''); notifyTyping(false); clearTimeout(typingTimeoutRef.current);

    if (img) {
      setIsUploading(true);
      if (img.previewUrl) URL.revokeObjectURL(img.previewUrl);
      setPendingImage(null);
      try { await sendReplyImage(img.file, t); } finally { setIsUploading(false); }
    } else {
      await sendReply(t);
    }
    inputRef.current?.focus();
  }, [text, pendingImage, activeConvId, sendReply, sendReplyImage, notifyTyping]);

  const handlePickImage = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImageError('');
    if (!file.type.startsWith('image/')) return setImageError('Chỉ hỗ trợ file ảnh');
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) return setImageError(`Ảnh tối đa ${MAX_IMAGE_MB}MB`);
    setPendingImage((prev) => { if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl); return { file, previewUrl: URL.createObjectURL(file) }; });
  };
  const removePendingImage = () => setPendingImage((prev) => { if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl); return null; });

  const handleInputChange = (e) => {
    setText(e.target.value);
    notifyTyping(true);
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => notifyTyping(false), 1500);
  };
  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };

  const handleDeleteMessage = async (msgId) => {
    if (!isSuperAdmin) return;
    await removeMessage(msgId);
    toast({ title: 'Đã xóa tin nhắn', description: 'Super Admin đã thu hồi tin nhắn.' });
  };

  const sendTemplate = (templateText) => { if (activeConvId) sendReply(templateText); };

  const handleClaim = async (convId) => {
    const res = await claim(convId);
    if (!res.ok) {
      toast({ title: 'Không nhận được ticket', description: 'Có admin khác vừa nhận ticket này rồi.', variant: 'destructive' });
    } else {
      toast({ title: 'Đã nhận ticket', variant: 'success' });
      setTab('active');
      handleSelectConv(convId);
    }
  };
  const handleResolve = async () => { await resolve(activeConvId); toast({ title: 'Đã đóng ticket', variant: 'success' }); };
  const handleReopen = async () => { await reopen(activeConvId); toast({ title: 'Đã mở lại ticket' }); };
  const handleUnclaim = async () => { await unclaim(activeConvId); toast({ title: 'Đã nhả ticket về hàng chờ' }); };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    await addNote(noteText);
    setNoteText('');
  };

  const list = queues[tab] || [];
  const filtered = list.filter((c) => {
    if (!q) return true;
    const profile = c.users_profile || {};
    return (profile.full_name || profile.account || '').toLowerCase().includes(q.toLowerCase());
  });

  const activeProfile = activeConversation?.users_profile || {};
  const activeName = activeProfile.full_name || activeProfile.account || activeConvId;
  const statusMeta = activeConversation ? STATUS_META[activeConversation.status] : null;
  const canReply = activeConversation?.status === 'active';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="w-5 h-5 text-[#ffab40] shrink-0" />
          <h1 className="text-lg font-bold text-white truncate">Chăm Sóc Khách Hàng — Live Chat</h1>
          {totalUnread > 0 && (
            <span className="min-w-[20px] h-5 px-1.5 flex items-center justify-center text-[11px] font-bold text-white bg-red-500 rounded-full shrink-0">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
          {isSuperAdmin && (
            <span title="Chế độ Super Admin" className="hidden sm:flex items-center gap-1 shrink-0 bg-[#7033ff]/20 text-[#ebd39a] border border-[#7033ff]/50 text-[11px] px-2 py-0.5 rounded-full font-semibold">
              <Ghost size={12} /> Super Admin
            </span>
          )}
        </div>
        <button onClick={refreshQueue} className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors shrink-0" title="Tải lại">
          <RefreshCw size={15} className={isLoadingConvs ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 h-[calc(100dvh-180px)] min-h-[480px]">
        <Panel className={`lg:col-span-1 overflow-hidden flex-col ${activeConvId ? 'hidden lg:flex' : 'flex'}`}>
          {/* Tabs hàng đợi */}
          <div className="flex border-b border-white/10 shrink-0">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex-1 px-2 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors
                  ${tab === t.id ? 'border-[#ffab40] text-white' : 'border-transparent text-white/40 hover:text-white/70'}`}>
                {t.label}
                {t.count > 0 && (
                  <span className={`min-w-[16px] h-4 px-1 rounded-full text-[10px] flex items-center justify-center
                    ${tab === t.id ? 'bg-[#ffab40] text-black' : 'bg-white/10 text-white/60'}`}>{t.count}</span>
                )}
              </button>
            ))}
          </div>
          <div className="p-2.5 border-b border-white/10 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input className={`${inputCls} pl-8`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm khách hàng…" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoadingConvs && <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 text-white/40 animate-spin" /></div>}
            {!isLoadingConvs && filtered.length === 0 && (
              <div className="px-4 py-8 text-center">
                <MessageSquare className="w-8 h-8 text-white/20 mx-auto mb-2" />
                <p className="text-xs text-white/40">Không có hội thoại nào ở mục này</p>
              </div>
            )}
            {filtered.map((conv) => (
              <ConvItem key={conv.id} conv={conv} isActive={conv.id === activeConvId}
                onClick={() => handleSelectConv(conv.id)} onQuickClaim={handleClaim} />
            ))}
          </div>
        </Panel>

        <Panel className={`lg:col-span-2 overflow-hidden flex-col relative ${activeConvId ? 'flex' : 'hidden lg:flex'}`}>
          {!activeConvId ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-white/30">
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center"><MessageSquare className="w-8 h-8" /></div>
              <div className="text-center"><p className="text-sm font-medium">Chọn một hội thoại</p><p className="text-xs mt-1">để bắt đầu trả lời khách hàng</p></div>
            </div>
          ) : (
            <>
              <div className="px-3 sm:px-4 py-3 border-b border-white/10 flex items-center justify-between gap-2 bg-white/[0.02] shrink-0">
                <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                  <button onClick={() => handleSelectConv(null)} className="lg:hidden p-1.5 -ml-1 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors shrink-0" title="Quay lại danh sách">
                    <ChevronLeft size={18} />
                  </button>
                  <Avatar name={activeName} isAgent={false} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{activeName}</p>
                    <div className="flex items-center gap-2 min-w-0">
                      {statusMeta && (
                        <span className="text-[10px] flex items-center gap-1 text-white/50 shrink-0">
                          <Circle size={7} className={`${statusMeta.dot} rounded-full fill-current`} />{statusMeta.label}
                        </span>
                      )}
                      {activeConversation?.status === 'active' && activeConversation?.assigned?.full_name && (
                        <span className="text-[10px] text-white/30 truncate">· {activeConversation.assigned.full_name}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setShowContext(true)} title="Ngữ cảnh người dùng"
                    className="p-1.5 rounded-lg text-white/50 hover:text-[#ffab40] hover:bg-white/10 transition-colors">
                    <IdCard size={16} />
                  </button>
                  {activeConversation?.status === 'pending' && (
                    <button onClick={() => handleClaim(activeConvId)} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 flex items-center gap-1">
                      <UserCheck size={13} /> Nhận xử lý
                    </button>
                  )}
                  {activeConversation?.status === 'active' && (
                    <>
                      <button onClick={handleUnclaim} title="Nhả về hàng chờ" className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10"><RotateCcw size={15} /></button>
                      <button onClick={handleResolve} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 flex items-center gap-1">
                        <CircleCheck size={13} /> Đóng ticket
                      </button>
                    </>
                  )}
                  {activeConversation?.status === 'resolved' && (
                    <button onClick={handleReopen} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-white/10 text-white/70 hover:bg-white/20 flex items-center gap-1">
                      <RotateCcw size={13} /> Mở lại
                    </button>
                  )}
                </div>
              </div>

              {/* Toggle Trả lời / Ghi chú nội bộ */}
              <div className="flex border-b border-white/10 shrink-0">
                <button onClick={() => setPanel('reply')} className={`flex-1 py-2 text-xs font-semibold border-b-2 ${panel === 'reply' ? 'border-[#ffab40] text-white' : 'border-transparent text-white/40'}`}>Tin nhắn</button>
                <button onClick={() => setPanel('notes')} className={`flex-1 py-2 text-xs font-semibold border-b-2 flex items-center justify-center gap-1.5 ${panel === 'notes' ? 'border-[#ffab40] text-white' : 'border-transparent text-white/40'}`}>
                  <StickyNote size={12} /> Ghi chú nội bộ {internalNotes.length > 0 && `(${internalNotes.length})`}
                </button>
              </div>

              {panel === 'reply' ? (
                <>
                  <div ref={scrollAreaRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scroll-smooth"
                    style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>
                    {isLoadingMore && <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 text-white/30 animate-spin" /></div>}
                    {isLoadingMsgs && <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-white/30 animate-spin" /></div>}
                    {!isLoadingMsgs && messages.length === 0 && <p className="text-center text-white/30 text-sm py-8">Chưa có tin nhắn.</p>}
                    {messages.map((msg) => (
                      <MessageBubble key={msg.id} msg={msg} isFromAgent={msg.sender_type === 'agent' || msg.sender_type === 'bot'}
                        onDelete={handleDeleteMessage} canDelete={isSuperAdmin} onViewImage={setViewerImage} />
                    ))}
                    {userIsTyping && (
                      <div className="flex items-end gap-2">
                        <Avatar name={activeName} isAgent={false} />
                        <div className="bg-white/10 border border-white/10 rounded-2xl rounded-bl-sm"><TypingDots label="đang gõ..." /></div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {showScrollBtn && (
                    <button onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
                      className="absolute bottom-28 right-6 w-8 h-8 rounded-full bg-white/15 backdrop-blur border border-white/10 flex items-center justify-center text-white/70 hover:bg-white/25 transition-colors shadow-lg">
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  )}

                  {!canReply ? (
                    <div className="px-4 py-4 border-t border-white/10 shrink-0 text-center">
                      {activeConversation?.status === 'pending' ? (
                        <button onClick={() => handleClaim(activeConvId)} className="text-sm font-semibold px-4 py-2 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 inline-flex items-center gap-2">
                          <UserCheck size={15} /> Nhận xử lý ticket này để trả lời
                        </button>
                      ) : (
                        <p className="text-xs text-white/40">Ticket đã đóng. Bấm "Mở lại" ở trên để tiếp tục trả lời.</p>
                      )}
                    </div>
                  ) : (
                    <div className="px-3 py-3 border-t border-white/10 shrink-0 relative">
                      {showTemplates && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowTemplates(false)} />
                          <div className="absolute bottom-full left-3 mb-2 z-50 w-72 max-w-[calc(100%-1.5rem)] rounded-xl bg-[#161936] border border-white/10 shadow-2xl overflow-hidden">
                            <p className="px-3 pt-2.5 pb-1.5 text-[11px] font-semibold text-[#ffab40]">Mẫu tin nhắn nhanh</p>
                            <div className="max-h-64 overflow-y-auto pb-1">
                              {quickReplies.length === 0 && <p className="px-3 py-3 text-xs text-white/30">Chưa có mẫu nào — thêm ở trang Cài đặt.</p>}
                              {quickReplies.map((tmpl) => (
                                <button key={tmpl.id} onClick={() => { sendTemplate(tmpl.body); setShowTemplates(false); }} className="w-full text-left px-3 py-2 hover:bg-white/10 transition-colors">
                                  <p className="text-sm text-white font-medium">{tmpl.title}</p>
                                  <p className="text-[11px] text-white/40 truncate">{tmpl.body}</p>
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                      {pendingImage && (
                        <div className="mb-2 flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-2 py-2">
                          <img src={pendingImage.previewUrl} alt="Xem trước" className="w-12 h-12 rounded-lg object-cover" />
                          <span className="flex-1 text-xs text-white/50 truncate">{pendingImage.file.name}</span>
                          <button onClick={removePendingImage} className="p-1 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors shrink-0"><X className="w-4 h-4" /></button>
                        </div>
                      )}
                      {imageError && <p className="text-[11px] text-rose-400 mb-1.5 px-1">{imageError}</p>}
                      <div className="flex items-end gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2 focus-within:border-[#ffab40]/50 focus-within:ring-1 focus-within:ring-[#ffab40]/20 transition-all">
                        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePickImage} />
                        <button onClick={() => setShowTemplates((v) => !v)} title="Mẫu tin nhắn nhanh"
                          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors ${showTemplates ? 'text-[#ffab40] bg-white/10' : 'text-white/50 hover:text-[#ffab40] hover:bg-white/10'}`}>
                          <Zap size={16} />
                        </button>
                        <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} title="Gửi ảnh"
                          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-white/50 hover:text-[#ffab40] hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                          <Paperclip size={16} />
                        </button>
                        <textarea ref={inputRef} value={text} onChange={handleInputChange} onKeyDown={handleKeyDown} rows={1}
                          placeholder="Nhập phản hồi (Enter để gửi, Shift+Enter xuống dòng)..."
                          className="flex-1 bg-transparent text-white text-sm placeholder:text-white/35 resize-none outline-none min-h-[24px] max-h-24 leading-6"
                          style={{ fieldSizing: 'content' }} />
                        <button onClick={handleSend} disabled={(!text.trim() && !pendingImage) || isUploading}
                          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-r from-[#ffab40] to-[#e67e22] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 active:scale-95 transition-all shadow-md">
                          {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
                    <p className="text-[11px] text-white/30 mb-1">Chỉ Admin thấy được — không hiển thị cho khách hàng.</p>
                    {internalNotes.length === 0 && <p className="text-center text-white/30 text-sm py-8">Chưa có ghi chú nào.</p>}
                    {internalNotes.map((n) => (
                      <div key={n.id} className="bg-amber-500/[0.06] border border-amber-500/20 rounded-xl px-3.5 py-2.5">
                        <p className="text-sm text-amber-100 whitespace-pre-wrap break-words">{n.body}</p>
                        <p className="text-[10px] text-amber-300/50 mt-1">{n.admin_name} · {new Date(n.created_at).toLocaleString('vi-VN')}</p>
                      </div>
                    ))}
                  </div>
                  <div className="px-3 py-3 border-t border-white/10 shrink-0 flex items-end gap-2">
                    <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={1}
                      placeholder="Ghi chú nội bộ cho các Admin khác…"
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/35 resize-none outline-none focus:border-amber-400/50"
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddNote(); } }} />
                    <button onClick={handleAddNote} disabled={!noteText.trim()}
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-amber-500/80 text-black disabled:opacity-40 hover:opacity-90">
                      <Send size={16} />
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </Panel>
      </div>

      {showContext && activeConversation && <UserContextPanel userId={activeConversation.user_id} onClose={() => setShowContext(false)} />}

      {viewerImage && (
        <div className="fixed inset-0 z-[10000] bg-black/85 flex items-center justify-center p-6" onClick={() => setViewerImage(null)}>
          <button onClick={() => setViewerImage(null)} className="absolute top-4 right-4 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"><X className="w-5 h-5" /></button>
          <img src={viewerImage} alt="Ảnh đính kèm" className="max-w-full max-h-full rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
