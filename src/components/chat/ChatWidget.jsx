import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, X, Send, Loader2, ChevronDown, CheckCheck, Check, Paperclip, Smile, CircleCheck } from 'lucide-react';
import { useTicketChat } from '@/hooks/useTicketChat';
import { useAuth } from '@/lib/AuthContext';
import { useChatUI } from '@/lib/ChatUIContext';
import cskhAvatar from '@/assets/images/cskh_avatar.jpg';

const MAX_IMAGE_MB = 5;

const EMOJIS = [
  '👍','🙏','😊','😀','😂','❤️','🎉','👌','😅','🙁','😢','😡','🤔','👋','🔥','💯',
  '💰','💳','⏰','✅','❌','❓','❗','📎','📷','💬','🤝','🙌','😴','🥳','😍','😭',
];

const UserAvatar = () => (
  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-md">
    <span className="text-white text-xs font-bold">U</span>
  </div>
);

const AdminAvatar = () => (
  <img src={cskhAvatar} alt="CSKH" className="w-8 h-8 rounded-full object-cover shrink-0 shadow-md" />
);

const TypingDots = () => (
  <div className="flex items-center gap-1 px-3 py-2">
    {[0, 1, 2].map((i) => (
      <span key={i} className="w-1.5 h-1.5 rounded-full bg-white/50 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
    ))}
  </div>
);

// ─── Tick trạng thái: đã gửi (client, chưa lưu xong) → đã nhận → đã đọc ────
const StatusTick = ({ status }) => {
  if (status === 'read') return <CheckCheck className="w-3 h-3 text-indigo-400" />;
  if (status === 'delivered') return <CheckCheck className="w-3 h-3 text-white/25" />;
  return <Check className="w-3 h-3 text-white/25" />;
};

const MessageBubble = ({ msg, isOwn, onViewImage }) => {
  const time = msg.created_at ? new Date(msg.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';
  const attachment = msg.attachments?.[0];
  const isBot = msg.sender_type === 'bot';

  return (
    <div className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
      {!isOwn && <AdminAvatar />}
      <div className={`max-w-[78%] flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
        {isBot && <span className="text-[10px] text-white/30 mb-0.5 px-1">Tự động</span>}
        {attachment && (
          <button type="button" onClick={() => onViewImage?.(attachment.file_url)} className={`mb-1 block overflow-hidden rounded-2xl border border-white/10 ${isOwn ? 'rounded-br-sm' : 'rounded-bl-sm'}`}>
            <img src={attachment.file_url} alt="Ảnh đính kèm" className="w-[200px] h-[160px] object-cover block" loading="lazy" />
          </button>
        )}
        {msg.body && (
          <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words shadow-sm ${
            isOwn ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-br-sm'
              : isBot ? 'bg-white/[0.06] text-white/70 border border-white/10 rounded-bl-sm' : 'bg-white/10 text-white rounded-bl-sm border border-white/10'
          }`}>
            {msg.body}
          </div>
        )}
        <div className={`flex items-center gap-1 mt-1 px-1 ${isOwn ? 'flex-row-reverse' : ''}`}>
          <span className="text-[10px] text-white/35">{time}</span>
          {isOwn && <StatusTick status={msg.status} />}
        </div>
      </div>
      {isOwn && <UserAvatar />}
    </div>
  );
};

/**
 * ChatWidget — Widget hỗ trợ trực tuyến nổi, mount DUY NHẤT 1 lần ở App.jsx
 * (bên trong <ChatUIProvider>) — không còn mount riêng theo từng trang, nên
 * trạng thái mở/đóng + số tin chưa đọc không còn bị reset khi chuyển trang.
 */
export default function ChatWidget() {
  const { user } = useAuth();
  const { open, closeChat, setUnread } = useChatUI();
  const [text, setText] = useState('');
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [pendingImage, setPendingImage] = useState(null);
  const [imageError, setImageError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [viewerImage, setViewerImage] = useState(null);
  const messagesEndRef = useRef(null);
  const scrollAreaRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const { conversation, messages, isLoading, isLoadingMore, hasMore, agentIsTyping, unreadUser, send, sendImage, notifyTyping, loadOlderMessages } =
    useTicketChat(user, open);

  useEffect(() => { setUnread(unreadUser); }, [unreadUser, setUnread]);

  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, agentIsTyping, open]);

  const onScroll = () => {
    const el = scrollAreaRef.current;
    if (!el) return;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 80);
    if (el.scrollTop < 40 && hasMore && !isLoadingMore) loadOlderMessages();
  };

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  const handleInputChange = useCallback((e) => {
    setText(e.target.value);
    notifyTyping(true);
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => notifyTyping(false), 1500);
  }, [notifyTyping]);

  const handleSend = useCallback(async () => {
    if (!text.trim() && !pendingImage) return;
    const t = text; const img = pendingImage;
    setText(''); setShowEmoji(false);
    notifyTyping(false);
    clearTimeout(typingTimeoutRef.current);

    if (img) {
      setIsUploading(true);
      if (img.previewUrl) URL.revokeObjectURL(img.previewUrl);
      setPendingImage(null);
      try { await sendImage(img.file, t); } finally { setIsUploading(false); }
    } else {
      await send(t);
    }
    inputRef.current?.focus();
  }, [text, pendingImage, send, sendImage, notifyTyping]);

  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };

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

  const insertEmoji = (emoji) => {
    setText((prev) => prev + emoji);
    inputRef.current?.focus();
  };

  // Không hiện widget cho admin, hoặc chưa đăng nhập
  if (!user || user.role === 'admin' || user.role === 'super_admin') return null;

  const isResolved = conversation?.status === 'resolved';

  return (
    <>
      <div
        className={`fixed bottom-24 right-4 z-[9997] w-[360px] max-w-[calc(100vw-2rem)] flex flex-col rounded-2xl overflow-hidden
          bg-[#0f1225]/95 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/60
          transition-all duration-300 origin-bottom-right
          ${open ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto' : 'opacity-0 scale-90 translate-y-4 pointer-events-none'}`}
        style={{ height: '520px', maxHeight: 'calc(100dvh - 112px)' }}
      >
        <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-[#1a1f3c] to-[#141830] border-b border-white/10 shrink-0">
          <div className="relative">
            <AdminAvatar />
            <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#0f1225] ${isResolved ? 'bg-white/30' : 'bg-emerald-400'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm leading-none">Hỗ trợ 24/7</p>
            <p className={`text-[11px] mt-0.5 flex items-center gap-1 ${isResolved ? 'text-white/40' : 'text-emerald-400'}`}>
              {isResolved ? 'Đã giải quyết' : (
                <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />Trực tuyến</>
              )}
            </p>
          </div>
          <button onClick={closeChat} className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div ref={scrollAreaRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-3 py-4 space-y-3 scroll-smooth"
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>

          {isLoadingMore && <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 text-white/30 animate-spin" /></div>}

          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center h-full gap-3 py-8">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400/20 to-orange-500/20 border border-amber-400/20 flex items-center justify-center">
                <MessageSquare className="w-8 h-8 text-amber-400" />
              </div>
              <div className="text-center">
                <p className="text-white font-semibold text-sm">Xin chào! 👋</p>
                <p className="text-white/50 text-xs mt-1 leading-relaxed">Đội ngũ CSKH của chúng tôi luôn sẵn sàng hỗ trợ bạn 24/7. Hãy gửi tin nhắn để bắt đầu!</p>
              </div>
            </div>
          )}

          {isLoading && <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 text-white/40 animate-spin" /></div>}

          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} isOwn={msg.sender_type === 'user'} onViewImage={setViewerImage} />
          ))}

          {agentIsTyping && (
            <div className="flex items-end gap-2">
              <AdminAvatar />
              <div className="bg-white/10 border border-white/10 rounded-2xl rounded-bl-sm shadow-sm"><TypingDots /></div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {isResolved && (
          <div className="px-4 py-2 bg-emerald-500/10 border-t border-emerald-500/20 flex items-center gap-2 shrink-0">
            <CircleCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <p className="text-[11px] text-emerald-300">Yêu cầu đã được giải quyết. Gửi tin nhắn mới nếu bạn cần hỗ trợ thêm.</p>
          </div>
        )}

        {showScrollBtn && (
          <button onClick={scrollToBottom} className="absolute bottom-20 right-4 w-8 h-8 rounded-full bg-white/15 backdrop-blur border border-white/10 flex items-center justify-center text-white/70 hover:bg-white/25 transition-colors shadow-lg">
            <ChevronDown className="w-4 h-4" />
          </button>
        )}

        <div className="px-3 py-3 border-t border-white/10 shrink-0 bg-[#0f1225]/50 backdrop-blur-sm relative">
          {showEmoji && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowEmoji(false)} />
              <div className="absolute bottom-full left-3 mb-2 z-50 w-64 rounded-xl bg-[#161936] border border-white/10 shadow-2xl p-2 grid grid-cols-8 gap-1">
                {EMOJIS.map((e) => (
                  <button key={e} onClick={() => insertEmoji(e)} className="text-lg leading-none w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10">{e}</button>
                ))}
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

          <div className="flex items-end gap-1.5 bg-white/5 border border-white/10 rounded-xl px-2 py-2 focus-within:border-amber-400/50 focus-within:ring-1 focus-within:ring-amber-400/20 transition-all">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePickImage} />
            <button onClick={() => setShowEmoji((v) => !v)} title="Emoji" className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white/50 hover:text-amber-400 hover:bg-white/10 transition-colors">
              <Smile className="w-4 h-4" />
            </button>
            <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} title="Gửi ảnh"
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white/50 hover:text-amber-400 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <Paperclip className="w-4 h-4" />
            </button>
            <textarea ref={inputRef} value={text} onChange={handleInputChange} onKeyDown={handleKeyDown} rows={1}
              placeholder="Nhập tin nhắn... (Enter để gửi)"
              className="flex-1 bg-transparent text-white text-sm placeholder:text-white/35 resize-none outline-none min-h-[24px] max-h-24 leading-6"
              style={{ fieldSizing: 'content' }} />
            <button onClick={handleSend} disabled={(!text.trim() && !pendingImage) || isUploading}
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-br from-amber-400 to-orange-500 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 active:scale-95 transition-all shadow-md">
              {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[10px] text-white/25 text-center mt-1.5">Shift+Enter để xuống dòng</p>
        </div>
      </div>

      {viewerImage && (
        <div className="fixed inset-0 z-[10000] bg-black/85 flex items-center justify-center p-6" onClick={() => setViewerImage(null)}>
          <button onClick={() => setViewerImage(null)} className="absolute top-4 right-4 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"><X className="w-5 h-5" /></button>
          <img src={viewerImage} alt="Ảnh đính kèm" className="max-w-full max-h-full rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}
