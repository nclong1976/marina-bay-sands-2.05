// Mock data source for the Home page (games, announcements, categories).

import g1Img from "@/assets/images/regenerated_image_1786211623879.png";
import g4Img from "@/assets/images/regenerated_image_1786211626625.png";
import g7Img from "@/assets/images/regenerated_image_1786211632612.png";

export const CATEGORIES = [
  { key: "all", labelKey: "cat_all" },
  { key: "lucky28", labelKey: "cat_lucky28" },
  { key: "xoso", labelKey: "cat_xoso" },
  { key: "pk10", labelKey: "cat_pk10" },
  { key: "slot", labelKey: "cat_slot" },
  { key: "casino", labelKey: "cat_casino" },
];

// Mỗi trò chơi thật (gameId) chỉ có ĐÚNG 1 thẻ đại diện — trước đây có tới 3 thẻ trùng
// gameId (chỉ khác badge HOT/NEW) khiến bật/tắt tỷ lệ ở admin bị đồng bộ cả cụm, gây
// nhầm lẫn tưởng 3 trò chơi độc lập trong khi thực chất chỉ là 1 ván chơi trực tiếp.
export const GAMES = [
  { id: "g1", gameId: "may-man-28", title: "", category: "lucky28", badge: "hot", status: "active",
    bg: g1Img,
    titleClass: "text-figma-12 font-bold font-figma-inter leading-figma-17 text-[#ccb2eb]" },
  { id: "g4", gameId: "xoso", title: "", category: "xoso", status: "active",
    bg: g4Img,
    titleClass: "text-figma-14 font-bold font-figma-news-cycle leading-figma-16 text-[#d2baec]" },
  { id: "g7", gameId: "pk10", title: "", category: "pk10", badge: "hot", status: "active",
    bg: g7Img,
    overlay: { src: "https://media.base44.com/images/public/6a729d033f9d0f63f381a6c6/b19be242e_292e7a944_5952b8f1ffb770a13601dc2d2c3e286f08149e5d.png", cls: "absolute top-[14px] left-[21px] w-[90px] h-[75px] object-contain z-10" },
    titleClass: "text-figma-13 font-bold font-figma-manrope leading-figma-15 text-[#c9afe8]" },
];

export const getGameById = (id) => GAMES.find((g) => g.id === id);

export const ANNOUNCEMENTS = [
  { id: "a1", title: "★ NguyenHa thắng $5,200,000 USD tại May mắn 28 Hàn Quốc!", detail: "Vào lúc 09:32 sáng nay, người chơi NguyenHa đã trúng giải đặc biệt tại phòng May mắn 28 Hàn Quốc với tổng thưởng $5,200,000 USD. Chúc mừng người chơi may mắn!" },
  { id: "a2", title: "Sự kiện: Nạp lần đầu tặng 50% đến $2,000,000 USD", detail: "Từ 01/08 - 15/08, thành viên mới nạp lần đầu sẽ nhận thưởng 50% giá trị nạp, tối đa $2,000,000 USD. Áp dụng cho tất cả phương thức thanh toán." },
  { id: "a3", title: "Bảo trì hệ thống Xổ số Đài Loan 02:00 - 03:00 ngày 06/08", detail: "Hệ thống Xổ số Đài Loan sẽ tạm bảo trì để nâng cấp từ 02:00 đến 03:00 ngày 06/08/2026. Các cược đang chờ sẽ được giữ nguyên. Xin lỗi vì sự bất tiện." },
];