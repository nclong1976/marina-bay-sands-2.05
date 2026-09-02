import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Upload, Save, Plus, Trash2, MessageSquare } from "lucide-react";
import { Panel, inputCls } from "../ui";
import { getBannerConfig, saveBannerConfig, extractZipArchive, readFileAsDataUrl } from "@/lib/bannerStore";
import { getSiteSettings, saveSiteSettings, subscribeSiteSettings } from "@/lib/siteSettingsStore";
import { spUploadFile, spSetAppSetting } from "@/lib/supabaseService";
import { fetchSupportHours, fetchQuickReplies, saveQuickReply, deleteQuickReply } from "@/lib/messagingService";

export default function Settings() {
  const { toast } = useToast();
  const [s, setS] = useState(() => getSiteSettings());
  const [halls, setHalls] = useState([]);
  const [bannerType, setBannerType] = useState("video");

  // ── Chăm sóc khách hàng: giờ làm việc + mẫu tin nhắn nhanh ──────────
  const [hours, setHours] = useState({ enabled: false, start: "09:00", end: "23:00" });
  const [quickReplies, setQuickReplies] = useState([]);
  const [newReply, setNewReply] = useState({ title: "", body: "", shortcut: "" });

  useEffect(() => {
    fetchSupportHours().then(setHours);
    fetchQuickReplies().then(setQuickReplies);
  }, []);

  const saveHours = async (next) => {
    setHours(next);
    await spSetAppSetting("support_hours", next);
  };

  const addQuickReply = async () => {
    if (!newReply.title.trim() || !newReply.body.trim()) {
      toast({ title: "Cần nhập tiêu đề và nội dung mẫu", variant: "destructive" });
      return;
    }
    const saved = await saveQuickReply({ ...newReply, ownerAdminId: null });
    if (saved) {
      setQuickReplies((prev) => [...prev, saved]);
      setNewReply({ title: "", body: "", shortcut: "" });
      toast({ title: "Đã thêm mẫu tin nhắn nhanh" });
    }
  };

  const removeQuickReply = async (id) => {
    await deleteQuickReply(id);
    setQuickReplies((prev) => prev.filter((q) => q.id !== id));
  };

  // Cập nhật giao diện ngay khi cấu hình được kéo về từ Supabase (vd Admin khác vừa lưu)
  useEffect(() => {
    const unsub = subscribeSiteSettings((latest) => setS(latest));
    return unsub;
  }, []);

  useEffect(() => {
    const cfg = getBannerConfig();
    if (cfg.banners?.[0]) {
      setS((p) => ({ ...p, banner: cfg.banners[0].url || p.banner }));
      setBannerType(cfg.banners[0].type || "video");
    }
    base44.entities.GameHall.list().then((res) => setHalls(res || [])).catch(() => {});
  }, []);

  const set = (k, v) => setS((p) => ({ ...p, [k]: v }));

  const save = () => {
    saveSiteSettings(s);

    // Also sync to bannerStore
    if (s.banner) {
      const currentCfg = getBannerConfig();
      const firstBanner = currentCfg.banners?.[0] || {};
      const updatedBanner = {
        ...firstBanner,
        id: firstBanner.id || "banner_1",
        type: bannerType,
        title: firstBanner.title || "Sands Club Banner",
        subtitle: firstBanner.subtitle || "Sòng bài giải trí trực tuyến",
        url: s.banner,
        autoPlay: true,
        loop: true,
        muted: true,
        controls: false,
        active: true,
      };
      const updatedBanners = [updatedBanner, ...currentCfg.banners.slice(1)];
      saveBannerConfig({ ...currentCfg, banners: updatedBanners });
    }

    toast({ title: "Đã lưu cài đặt ứng dụng" });
  };

  const onUpload = async (e) => {
    const files = e.target.files; if (!files || files.length === 0) return;
    const f = files[0];

    // Tự động giải nén tệp ZIP banner nếu admin tải tệp ZIP lên
    if (f.name.toLowerCase().endsWith(".zip")) {
      toast({ title: "Đang tự động giải nén tệp ZIP...", description: `Tệp: ${f.name}` });
      try {
        const extracted = await extractZipArchive(f);
        if (extracted.length > 0) {
          const currentCfg = getBannerConfig();
          const updated = { ...currentCfg, banners: [...extracted, ...currentCfg.banners] };
          saveBannerConfig(updated);
          set("banner", extracted[0].url);
          setBannerType(extracted[0].type);
          toast({
            title: "Giải nén ZIP thành công!",
            description: `Đã trích xuất ${extracted.length} banner và áp dụng ngay lập tức cho người dùng.`,
            variant: "success",
          });
        } else {
          toast({ title: "Tệp ZIP không chứa ảnh/video hợp lệ", variant: "destructive" });
        }
      } catch (err) {
        toast({ title: "Lỗi giải nén tệp ZIP", description: err.message, variant: "destructive" });
      }
      return;
    }

    const isVid = f.type.startsWith("video") || f.name.match(/\.(mp4|webm|mov)$/i);
    setBannerType(isVid ? "video" : "image");
    const file_url = await spUploadFile(f, "banners");
    if (file_url) {
      set("banner", file_url);
      toast({ title: `Đã tải ${isVid ? "video" : "ảnh"} banner` });
    } else {
      const localUrl = await readFileAsDataUrl(f);
      set("banner", localUrl);
      toast({ title: "Đã chọn file banner cục bộ" });
    }
  };

  const toggleHall = async (h) => {
    try { await base44.entities.GameHall.update(h.id, { enabled: !h.enabled }); setHalls((l) => l.map((x) => x.id === h.id ? { ...x, enabled: !x.enabled } : x)); }
    catch {}
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Cài Đặt Ứng Dụng</h1>
      <div className="grid lg:grid-cols-2 gap-4">
        <Panel className="p-4 space-y-3">
          <p className="text-sm font-semibold">Trang chủ & Banner</p>
          <div>
            <label className="text-[12px] text-white/65">Nội dung thanh thông báo</label>
            <input className={inputCls} value={s.announcement || ""} onChange={(e) => set("announcement", e.target.value)} placeholder="Thông báo chạy trên trang chủ…" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[12px] text-white/65">Media Banner Trang Chủ (Video hoặc Ảnh)</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBannerType("video")}
                  className={`text-[10px] px-2 py-0.5 rounded font-bold transition-colors ${bannerType === "video" ? "bg-[#7033ff] text-white" : "bg-white/10 text-white/60"}`}
                >
                  Video
                </button>
                <button
                  type="button"
                  onClick={() => setBannerType("image")}
                  className={`text-[10px] px-2 py-0.5 rounded font-bold transition-colors ${bannerType === "image" ? "bg-[#7033ff] text-white" : "bg-white/10 text-white/60"}`}
                >
                  Ảnh
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <input
                className={inputCls}
                value={s.banner || ""}
                onChange={(e) => set("banner", e.target.value)}
                placeholder="URL Video (MP4) hoặc URL Ảnh Banner..."
              />
              <label className="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-sm flex items-center gap-1 cursor-pointer whitespace-nowrap border border-white/10">
                <Upload size={16} /> Tải file
                <input type="file" className="hidden" accept="image/*,video/*" onChange={onUpload} />
              </label>
            </div>

            {s.banner && (
              <div className="mt-2.5 rounded-xl overflow-hidden bg-black/50 border border-white/10 h-32 relative flex items-center justify-center">
                {bannerType === "video" || s.banner.endsWith(".mp4") || s.banner.endsWith(".webm") ? (
                  <video src={s.banner} autoPlay loop muted playsInline className="w-full h-full object-cover" />
                ) : (
                  <img src={s.banner} alt="" className="w-full h-full object-cover" />
                )}
                <span className="absolute top-1.5 left-1.5 bg-black/80 text-[10px] font-bold px-2 py-0.5 rounded text-white border border-white/20">
                  Xem trước {bannerType === "video" ? "Video" : "Ảnh"}
                </span>
              </div>
            )}
          </div>

          <div>
            <label className="text-[12px] text-white/65">Ngôn ngữ hiển thị</label>
            <select className={inputCls} value={s.language || "vi"} onChange={(e) => set("language", e.target.value)}>
              <option value="vi" className="bg-[#161936]">Tiếng Việt</option>
              <option value="en" className="bg-[#161936]">English</option>
              <option value="zh" className="bg-[#161936]">中文</option>
            </select>
          </div>
        </Panel>

        <Panel className="p-4 space-y-3">
          <p className="text-sm font-semibold">Hệ thống</p>
          <div>
            <label className="text-[12px] text-white/65">Tỷ lệ quy đổi "Nguyên tử"</label>
            <input type="number" className={inputCls} value={s.atomRate ?? 1} onChange={(e) => set("atomRate", Number(e.target.value))} />
          </div>
          <div className="flex items-center justify-between py-1"><span className="text-sm text-white/80">Chế độ bảo trì</span><Switch checked={!!s.maintenance} onCheckedChange={(v) => set("maintenance", v)} /></div>
          <div>
            <p className="text-sm font-semibold mb-2">Bật/tắt sảnh</p>
            <div className="space-y-1.5">
              {halls.map((h) => (
                <div key={h.id} className="flex items-center justify-between py-1.5 border-b border-white/5">
                  <span className="text-sm text-white/85">{h.name}</span>
                  <Switch checked={!!h.enabled} onCheckedChange={() => toggleHall(h)} />
                </div>
              ))}
              {halls.length === 0 && <p className="text-white/40 text-sm">Chưa có sảnh</p>}
            </div>
          </div>
        </Panel>
      </div>

      <Panel className="p-4 space-y-3">
        <p className="text-sm font-semibold flex items-center gap-1.5"><MessageSquare size={15} className="text-[#ffab40]" /> Chăm Sóc Khách Hàng</p>

        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm text-white/80">Giờ làm việc CSKH</p>
            <p className="text-[11px] text-white/40">Khi bật: ngoài khung giờ này, tin chào tự động sẽ báo khách "ngoài giờ hỗ trợ".</p>
          </div>
          <Switch checked={!!hours.enabled} onCheckedChange={(v) => saveHours({ ...hours, enabled: v })} />
        </div>
        {hours.enabled && (
          <div className="flex items-center gap-2">
            <input type="time" className={inputCls} value={hours.start} onChange={(e) => saveHours({ ...hours, start: e.target.value })} />
            <span className="text-white/40 text-sm">đến</span>
            <input type="time" className={inputCls} value={hours.end} onChange={(e) => saveHours({ ...hours, end: e.target.value })} />
          </div>
        )}

        <div className="pt-2 border-t border-white/10">
          <p className="text-sm font-semibold mb-2">Mẫu tin nhắn nhanh</p>
          <div className="space-y-1.5 mb-3">
            {quickReplies.length === 0 && <p className="text-white/40 text-sm">Chưa có mẫu nào</p>}
            {quickReplies.map((q) => (
              <div key={q.id} className="flex items-start justify-between gap-2 py-2 border-b border-white/5">
                <div className="min-w-0">
                  <p className="text-sm text-white/85">{q.title} {q.shortcut && <span className="text-[10px] text-white/30 font-mono ml-1">{q.shortcut}</span>}</p>
                  <p className="text-[11px] text-white/40 truncate">{q.body}</p>
                </div>
                <button onClick={() => removeQuickReply(q.id)} className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/20 shrink-0" title="Xóa mẫu">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="space-y-1.5 bg-white/[0.03] rounded-lg p-2.5">
            <div className="flex gap-2">
              <input className={inputCls} placeholder="Tiêu đề (vd: Chào khách)" value={newReply.title} onChange={(e) => setNewReply((p) => ({ ...p, title: e.target.value }))} />
              <input className={`${inputCls} max-w-[120px]`} placeholder="/lệnh tắt" value={newReply.shortcut} onChange={(e) => setNewReply((p) => ({ ...p, shortcut: e.target.value }))} />
            </div>
            <textarea className={`${inputCls} h-16 py-2`} placeholder="Nội dung mẫu…" value={newReply.body} onChange={(e) => setNewReply((p) => ({ ...p, body: e.target.value }))} />
            <Button size="sm" className="bg-white/10 hover:bg-white/15 text-white" onClick={addQuickReply}><Plus size={14} className="mr-1" /> Thêm mẫu</Button>
          </div>
        </div>
      </Panel>

      <Button className="bg-gradient-to-r from-[#ffab40] to-[#e67e22] text-white font-bold" onClick={save}><Save size={16} className="mr-1" /> Lưu cài đặt</Button>
    </div>
  );
}