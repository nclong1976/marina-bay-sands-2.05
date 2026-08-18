// Cài đặt chung toàn hệ thống (thông báo trang chủ, tỷ lệ quy đổi, chế độ bảo trì...)
// do Admin điều khiển trong mục Cài Đặt — đồng bộ qua Supabase để áp dụng đúng trên
// mọi thiết bị người dùng, không chỉ lưu trong localStorage riêng của máy Admin.
import { isSupabaseConfigured } from "./supabase";
import { spGetAppSetting, spSetAppSetting } from "./supabaseService";

const STORAGE_KEY = "sands_settings";
const SETTING_KEY = "site_settings";

export const DEFAULT_SITE_SETTINGS = {
  announcement: "",
  banner: "",
  language: "vi",
  atomRate: 1,
  maintenance: false,
};

const listeners = new Set();

let channel = null;
if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
  try {
    channel = new BroadcastChannel("sands_site_settings_channel");
    channel.onmessage = (e) => {
      if (e.data?.type === "SITE_SETTINGS_UPDATED" && e.data?.settings) {
        listeners.forEach((cb) => cb(e.data.settings));
      }
    };
  } catch {
    /* ignore */
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) {
      const current = getSiteSettings();
      listeners.forEach((cb) => cb(current));
    }
  });
}

export const getSiteSettings = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return { ...DEFAULT_SITE_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return DEFAULT_SITE_SETTINGS;
  }
};

export const saveSiteSettings = (settings, fromRemote = false) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }

  listeners.forEach((cb) => cb(settings));

  if (channel) {
    try {
      channel.postMessage({ type: "SITE_SETTINGS_UPDATED", settings });
    } catch {
      /* ignore */
    }
  }

  if (!fromRemote && isSupabaseConfigured()) {
    spSetAppSetting(SETTING_KEY, settings).catch(() => {});
  }

  return settings;
};

export const subscribeSiteSettings = (cb) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

const pullSiteSettingsFromSupabase = async () => {
  if (!isSupabaseConfigured()) return;
  try {
    const row = await spGetAppSetting(SETTING_KEY);
    if (row && row.value) {
      const current = getSiteSettings();
      const merged = { ...DEFAULT_SITE_SETTINGS, ...row.value };
      if (JSON.stringify(current) !== JSON.stringify(merged)) {
        saveSiteSettings(merged, true);
      }
    }
  } catch {
    /* ignore */
  }
};

if (typeof window !== "undefined") {
  pullSiteSettingsFromSupabase();
  setInterval(pullSiteSettingsFromSupabase, 5000);
}
