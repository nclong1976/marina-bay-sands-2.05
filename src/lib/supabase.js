import { createClient } from '@supabase/supabase-js';

// Chuẩn hoá URL cấu hình: bỏ khoảng trắng, thêm https:// nếu thiếu, bỏ "/" hoặc
// "/rest/v1" thừa ở cuối. Giá trị không phải URL hợp lệ -> '' (coi như chưa cấu hình)
// thay vì để createClient ném lỗi lúc import khiến cả app chỉ còn trang trắng.
const normalizeSupabaseUrl = (raw) => {
  let v = String(raw || '').trim();
  if (!v) return '';
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  v = v.replace(/\/+$/, '').replace(/\/rest\/v1$/i, '');
  try {
    return new URL(v).origin;
  } catch {
    console.error('[Supabase] VITE_SUPABASE_URL không hợp lệ:', raw);
    return '';
  }
};

const supabaseUrl = normalizeSupabaseUrl(
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
  ''
);

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  '';

const hasSupabaseConfig = () => {
  return (
    typeof supabaseUrl === 'string' &&
    supabaseUrl.trim().length > 0 &&
    !supabaseUrl.includes('your-supabase-project') &&
    typeof supabaseAnonKey === 'string' &&
    supabaseAnonKey.trim().length > 0 &&
    !supabaseAnonKey.includes('your-supabase-anon-key')
  );
};

const createSafeClient = () => {
  if (!hasSupabaseConfig()) return null;
  try {
    return createClient(supabaseUrl, supabaseAnonKey.trim(), {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  } catch (e) {
    console.error('[Supabase] Không khởi tạo được client:', e?.message);
    return null;
  }
};

export const supabase = createSafeClient();

export const isSupabaseConfigured = () => supabase !== null;
