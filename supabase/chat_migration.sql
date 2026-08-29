-- ====================================================================
-- LIVE CHAT CSKH — MIGRATION v2
-- Chạy file này trong Supabase SQL Editor sau khi đã chạy schema.sql
-- ====================================================================

-- 1. BẢNG SUPPORT_CONVERSATIONS
-- Mỗi user có đúng 1 conversation (1-to-1 với Admin).
-- Lưu trạng thái, số tin chưa đọc và thời điểm tin nhắn cuối.
CREATE TABLE IF NOT EXISTS public.support_conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'pending')),
    unread_admin INTEGER DEFAULT 0,   -- Tin user gửi mà admin chưa đọc
    unread_user INTEGER DEFAULT 0,    -- Tin admin gửi mà user chưa đọc
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    last_message_body TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id)
);

-- 2. THÊM CỘT VÀO chat_messages (backward-compatible — nullable)
ALTER TABLE public.chat_messages
    ADD COLUMN IF NOT EXISTS conversation_id TEXT REFERENCES public.support_conversations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS read_by_admin BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS read_by_user BOOLEAN DEFAULT FALSE;

-- 3. INDEXES TỐI ƯU
CREATE INDEX IF NOT EXISTS idx_support_conversations_user_id
    ON public.support_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_support_conversations_last_msg
    ON public.support_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_conversations_status
    ON public.support_conversations(status);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id
    ON public.chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conv_created
    ON public.chat_messages(conversation_id, created_at ASC);

-- 4. RLS — support_conversations
ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read/write support_conversations" ON public.support_conversations;
CREATE POLICY "Allow public read/write support_conversations"
    ON public.support_conversations FOR ALL USING (true) WITH CHECK (true);

-- 5. BẬT REALTIME CHO support_conversations
-- Thêm vào publication hiện có (idempotent nếu đã tồn tại)
DO $$
BEGIN
  -- Nếu publication đã có, thêm bảng mới vào
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    -- Thêm support_conversations nếu chưa có trong publication
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'support_conversations'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.support_conversations;
    END IF;
    -- Đảm bảo chat_messages đã trong publication
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'chat_messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
    END IF;
  ELSE
    -- Tạo mới publication nếu chưa tồn tại (fallback)
    CREATE PUBLICATION supabase_realtime FOR TABLE
      public.support_conversations,
      public.chat_messages,
      public.users_profile,
      public.transactions,
      public.withdraw_requests,
      public.banners,
      public.app_settings,
      public.notifications;
  END IF;
END;
$$;

-- 6. FUNCTION: tự động cập nhật last_message_at khi có tin nhắn mới
CREATE OR REPLACE FUNCTION public.update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.conversation_id IS NOT NULL THEN
    UPDATE public.support_conversations
    SET
      last_message_at = NEW.created_at,
      last_message_body = LEFT(NEW.message, 100),
      -- Nếu user gửi → admin chưa đọc, tăng unread_admin
      unread_admin = CASE
        WHEN NEW.sender_role = 'user' THEN unread_admin + 1
        ELSE unread_admin
      END,
      -- Nếu admin gửi → user chưa đọc, tăng unread_user
      unread_user = CASE
        WHEN NEW.sender_role IN ('admin', 'super_admin') THEN unread_user + 1
        ELSE unread_user
      END
    WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_conv_on_message ON public.chat_messages;
CREATE TRIGGER trg_update_conv_on_message
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_conversation_on_message();
