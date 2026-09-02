-- ====================================================================
-- DIRECT IN-APP MESSAGING — TICKET-BASED SCHEMA (v2)
-- Đã áp dụng trực tiếp lên project qua Supabase MCP (apply_migration). File
-- này chỉ lưu lại nội dung để tham chiếu/redeploy môi trường khác — không tự
-- chạy lại migration cho project đã áp dụng rồi.
--
-- Thay thế support_conversations/chat_messages (1 user = 1 hội thoại vĩnh
-- viễn) bằng schema ticket thật: 1 user có thể có NHIỀU conversations theo
-- thời gian, mỗi cái đi qua vòng đời pending → active → resolved (có thể mở
-- lại). Xem tài liệu thiết kế "Sands Messaging Blueprint" cho lý do kiến trúc
-- đầy đủ, và src/lib/messagingService.js cho toàn bộ tầng service dùng schema
-- này.
--
-- support_conversations/chat_messages KHÔNG bị xoá — giữ lại làm bản sao
-- lưu trữ (read-only) của lịch sử trước migration.
-- ====================================================================

-- 1. SCHEMA MỚI ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'resolved')),
    assigned_admin_id TEXT REFERENCES public.users_profile(id) ON DELETE SET NULL,
    channel TEXT NOT NULL DEFAULT 'widget',
    device_context JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_secret BOOLEAN NOT NULL DEFAULT FALSE,
    unread_admin INTEGER NOT NULL DEFAULT 0,
    unread_user INTEGER NOT NULL DEFAULT 0,
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_message_preview TEXT NOT NULL DEFAULT '',
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS conversations_user_id_idx ON public.conversations(user_id);
CREATE INDEX IF NOT EXISTS conversations_status_idx ON public.conversations(status);
CREATE INDEX IF NOT EXISTS conversations_assigned_admin_idx ON public.conversations(assigned_admin_id);
CREATE INDEX IF NOT EXISTS conversations_last_message_at_idx ON public.conversations(last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'agent', 'bot', 'system')),
    sender_id TEXT,
    sender_name TEXT,
    body TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read')),
    is_secret BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON public.messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS public.attachments (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    thumbnail_url TEXT,
    mime_type TEXT,
    size_bytes INTEGER,
    scan_status TEXT NOT NULL DEFAULT 'clean' CHECK (scan_status IN ('pending', 'clean', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS attachments_message_id_idx ON public.attachments(message_id);

CREATE TABLE IF NOT EXISTS public.internal_notes (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    admin_id TEXT NOT NULL,
    admin_name TEXT,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS internal_notes_conversation_id_idx ON public.internal_notes(conversation_id);

CREATE TABLE IF NOT EXISTS public.quick_replies (
    id TEXT PRIMARY KEY,
    shortcut TEXT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    owner_admin_id TEXT REFERENCES public.users_profile(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. RLS ------------------------------------------------------------------
-- Cùng mức permissive như mọi bảng khác trong schema.sql — app này KHÔNG
-- dùng Supabase Auth session (auth tự viết riêng bằng bcrypt qua RPC), nên
-- không có auth.uid() để ràng buộc theo role ở tầng DB. "internal_notes chỉ
-- Admin đọc được" hiện được đảm bảo Ở TẦNG ỨNG DỤNG (UI/queries) như mọi bảng
-- nhạy cảm khác (vd. balance, bank_info) — không phải RLS thật.
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversations_all ON public.conversations;
CREATE POLICY conversations_all ON public.conversations FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS messages_all ON public.messages;
CREATE POLICY messages_all ON public.messages FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS attachments_all ON public.attachments;
CREATE POLICY attachments_all ON public.attachments FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS internal_notes_all ON public.internal_notes;
CREATE POLICY internal_notes_all ON public.internal_notes FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS quick_replies_all ON public.quick_replies;
CREATE POLICY quick_replies_all ON public.quick_replies FOR ALL USING (true) WITH CHECK (true);

-- 3. TRIGGER: giữ conversations.last_message_at/preview/unread/status đồng bộ
CREATE OR REPLACE FUNCTION public.handle_new_message() RETURNS trigger AS $$
BEGIN
  UPDATE public.conversations
  SET
    last_message_at = NEW.created_at,
    last_message_preview = LEFT(NEW.body, 200),
    unread_admin = CASE WHEN NEW.sender_type = 'user' THEN unread_admin + 1 ELSE unread_admin END,
    unread_user = CASE WHEN NEW.sender_type IN ('agent','bot','system') THEN unread_user + 1 ELSE unread_user END,
    status = CASE WHEN NEW.sender_type = 'user' AND status = 'resolved' THEN 'active' ELSE status END
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS messages_after_insert ON public.messages;
CREATE TRIGGER messages_after_insert
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.handle_new_message();

-- 4. REALTIME PUBLICATION — BẮT BUỘC, nếu bỏ qua bước này thì mọi
-- postgres_changes subscription trên các bảng dưới đây sẽ không bao giờ bắn
-- sự kiện (schema.sql tạo publication chỉ liệt kê tên bảng tường minh, không
-- tự động bao gồm bảng mới).
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.attachments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_notes;

-- 5. BACKFILL từ support_conversations/chat_messages ----------------------
-- Hội thoại cũ (đã có lịch sử thật) migrate thẳng sang trạng thái 'active'
-- (không phải 'pending') — admin claim/resolve tiếp tục từ đó. 'closed' cũ
-- -> 'resolved'.
INSERT INTO public.conversations
  (id, user_id, status, assigned_admin_id, channel, is_secret,
   unread_admin, unread_user, last_message_at, last_message_preview, created_at)
SELECT
  sc.id, sc.user_id,
  CASE WHEN sc.status = 'closed' THEN 'resolved' ELSE 'active' END,
  NULL, 'widget', FALSE,
  COALESCE(sc.unread_admin, 0), COALESCE(sc.unread_user, 0),
  COALESCE(sc.last_message_at, NOW()), COALESCE(sc.last_message_body, ''),
  COALESCE(sc.created_at, NOW())
FROM public.support_conversations sc
WHERE EXISTS (SELECT 1 FROM public.users_profile up WHERE up.id = sc.user_id)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.messages
  (id, conversation_id, sender_type, sender_id, sender_name, body, status, is_secret, created_at)
SELECT
  cm.id, cm.conversation_id,
  CASE WHEN cm.sender_role IN ('admin','super_admin') THEN 'agent' ELSE 'user' END,
  cm.user_id, cm.username, cm.message,
  CASE
    WHEN cm.sender_role = 'user' AND cm.read_by_admin THEN 'read'
    WHEN cm.sender_role IN ('admin','super_admin') AND cm.read_by_user THEN 'read'
    ELSE 'delivered'
  END,
  COALESCE(cm.is_secret, FALSE), COALESCE(cm.created_at, NOW())
FROM public.chat_messages cm
WHERE cm.conversation_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = cm.conversation_id)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.attachments (id, message_id, file_url, mime_type, scan_status, created_at)
SELECT cm.id || '_att', cm.id, cm.image_url, 'image/*', 'clean', COALESCE(cm.created_at, NOW())
FROM public.chat_messages cm
WHERE cm.image_url IS NOT NULL AND cm.image_url <> ''
  AND EXISTS (SELECT 1 FROM public.messages m WHERE m.id = cm.id)
ON CONFLICT (id) DO NOTHING;

-- 6. SEED mẫu tin nhắn nhanh (giữ nguyên 4 mẫu hardcode trước đó trong
-- src/pages/admin/modules/Chat.jsx, giờ chỉnh sửa được từ DB thay vì code).
INSERT INTO public.quick_replies (id, shortcut, title, body, owner_admin_id) VALUES
('qr_chao', '/chao', '👋 Chào CSKH', 'Xin chào quý khách! CSKH 24/7 hân hạnh được phục vụ bạn. Bạn cần hỗ trợ về vấn đề gì ạ?', NULL),
('qr_huongdannap', '/nap', '💳 Hướng Dẫn Nạp', 'Để nạp tiền nhanh chóng, quý khách vào mục Nạp Tiền → Chọn Ngân hàng/Crypto USDT → Chuyển khoản theo mã QR. Tiền vào tài khoản tự động trong 1–3 phút!', NULL),
('qr_huongdanrut', '/rut', '💸 Hướng Dẫn Rút', 'Để rút tiền, bạn vào mục Rút Tiền → Điền số tiền & thông tin Ngân hàng chính chủ → Bấm Xác nhận. Admin sẽ duyệt trong ít phút.', NULL)
ON CONFLICT (id) DO NOTHING;
