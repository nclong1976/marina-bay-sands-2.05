-- ====================================================================
-- AUTH RPC + STORAGE + REALTIME
-- Chạy sau schema.sql, chat_migration.sql, messaging_v2_migration.sql.
-- Đã áp dụng lên project ljgbycowfcnqqigmjiwo (migrations auth_rpc_functions,
-- storage_and_realtime). Trước đây các hàm này chỉ tồn tại trên project cũ,
-- không có trong repo — thiếu chúng thì đăng nhập (verify_login) và xác minh
-- PIN rút tiền (verify_pay_password) luôn thất bại.
-- ====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1. Tự băm bcrypt password_hash / pay_password khi insert/update (bỏ qua giá
-- trị đã là bcrypt "$2...").
CREATE OR REPLACE FUNCTION public.hash_user_secrets() RETURNS trigger AS $$
BEGIN
  IF NEW.password_hash IS NOT NULL AND NEW.password_hash <> '' AND NEW.password_hash NOT LIKE '$2%' THEN
    NEW.password_hash := extensions.crypt(NEW.password_hash, extensions.gen_salt('bf', 10));
  END IF;
  IF NEW.pay_password IS NOT NULL AND NEW.pay_password <> '' AND NEW.pay_password NOT LIKE '$2%' THEN
    NEW.pay_password := extensions.crypt(NEW.pay_password, extensions.gen_salt('bf', 10));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, extensions;

CREATE OR REPLACE TRIGGER hash_user_secrets
BEFORE INSERT OR UPDATE OF password_hash, pay_password ON public.users_profile
FOR EACH ROW EXECUTE FUNCTION public.hash_user_secrets();

-- 2. RPC dùng bởi src/lib/supabaseService.js (spLoginUser, spVerifyPayPassword).
-- Chấp nhận cả giá trị bcrypt lẫn plaintext cũ.
CREATE OR REPLACE FUNCTION public.secret_matches(stored TEXT, given TEXT)
RETURNS BOOLEAN AS $$
  SELECT stored IS NOT NULL AND stored <> '' AND CASE
    WHEN stored LIKE '$2%' THEN extensions.crypt(given, stored) = stored
    ELSE given = stored
  END;
$$ LANGUAGE sql IMMUTABLE SET search_path = public, extensions;
REVOKE EXECUTE ON FUNCTION public.secret_matches(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.verify_login(p_account TEXT, p_password TEXT)
RETURNS TABLE (id TEXT) AS $$
  SELECT u.id FROM public.users_profile u
  WHERE u.account = lower(trim(p_account))
    AND public.secret_matches(u.password_hash, p_password);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions;

CREATE OR REPLACE FUNCTION public.verify_pay_password(p_user_id TEXT, p_pin TEXT)
RETURNS BOOLEAN AS $$
  SELECT COALESCE((
    SELECT public.secret_matches(u.pay_password, p_pin)
    FROM public.users_profile u WHERE u.id = p_user_id
  ), FALSE);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions;

GRANT EXECUTE ON FUNCTION public.verify_login(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_pay_password(TEXT, TEXT) TO anon, authenticated;

-- Băm lại 2 admin seed của schema.sql (được insert trước khi có trigger).
UPDATE public.users_profile u SET (password_hash, pay_password) = (u.password_hash, u.pay_password)
WHERE u.id IN ('u_super_admin', 'u_admin_default');

-- 3. Bucket công khai cho file admin tải lên (src/lib/supabaseService.js spUploadFile).
INSERT INTO storage.buckets (id, name, public)
VALUES ('app-assets', 'app-assets', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "app-assets public read" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'app-assets');
CREATE POLICY "app-assets public upload" ON storage.objects
  FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'app-assets');

-- 4. Realtime. Trên project Supabase mới, publication supabase_realtime đã có
-- sẵn nhưng rỗng — thêm bảng vào thay vì DROP/CREATE lại publication.
ALTER PUBLICATION supabase_realtime ADD TABLE
  public.chat_messages, public.users_profile, public.transactions,
  public.withdraw_requests, public.banners, public.app_settings,
  public.notifications, public.support_conversations,
  public.conversations, public.messages, public.attachments, public.internal_notes;
