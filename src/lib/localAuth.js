// Hệ thống auth cục bộ dùng localStorage — không gọi Base44 API.
// Lưu danh sách tài khoản + phiên hiện tại trực tiếp trong trình duyệt.

import { getUserData, saveUserData, updateUserData, defaultUserData } from "@/lib/userData";
import { base44 } from "@/api/base44Client";
import { spRegisterUser, spLoginUser, spAdjustBalance, spUpdateUser, spGetUserProfile, spDeleteUser, spInsertNotifications, spVerifyPayPassword } from "@/lib/supabaseService";
import { isSupabaseConfigured } from "@/lib/supabase";
import { pushNotification } from "@/lib/localNotifications";

const USERS_KEY = "local_users";
const SESSION_KEY = "user";

const readUsers = () => {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const writeUsers = (users) => {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    try { window.dispatchEvent(new Event("local-users-changed")); } catch { /* ignore */ }
  } catch {
    /* ignore */
  }
};

// Seed tài khoản admin mặc định (leo1102 / 141219 & admin / 121212) nếu chưa tồn tại.
// QUAN TRỌNG: phải dùng đúng ID cố định trùng với ID đã seed sẵn trong Supabase
// (u_super_admin / u_admin_default, xem supabase/schema.sql) — nếu không, phiên đăng
// nhập cục bộ của 2 tài khoản này sẽ mang ID khác với hàng dữ liệu thật trên Supabase,
// khiến mọi lượt đồng bộ (đổi mật khẩu, số dư...) từ chính tài khoản đó bị "trôi",
// không bao giờ khớp đúng hàng để cập nhật trên các thiết bị khác.
const ensureSeedAdmin = () => {
  let users = readUsers();
  // Xóa tài khoản admin1 cũ nếu có
  users = users.filter((u) => u.account?.toLowerCase() !== "admin1");

  const hasSuperAdmin = users.some((u) => u.account?.toLowerCase() === "leo1102");
  if (!hasSuperAdmin) {
    const superAdmin = buildUser("leo1102", {
      id: "u_super_admin",
      password: "141219",
      payPassword: "141219",
      fullName: "Super Admin",
      role: "super_admin",
    });
    users.push(superAdmin);
  }

  const hasAdmin = users.some((u) => u.account?.toLowerCase() === "admin");
  if (!hasAdmin) {
    const admin = buildUser("admin", {
      id: "u_admin_default",
      password: "121212",
      payPassword: "121212",
      fullName: "Quản trị viên",
      role: "admin",
    });
    users.push(admin);
  }

  writeUsers(users);
};

const genId = () =>
  "u_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// Quyết định role: leo1102 -> super_admin, admin -> admin, còn lại user.
const roleFor = (account) => {
  const a = (account || "").trim().toLowerCase();
  if (a === "leo1102") return "super_admin";
  if (a === "admin") return "admin";
  return "user";
};

const buildUser = (account, extra = {}) => {
  const accountName = (account || "").trim().toLowerCase();
  return {
    id: accountName,
    email: `${accountName}@app.internal`,
    full_name: extra.fullName || account,
    account: accountName,
    role: extra.role || roleFor(account),
    created_date: new Date().toISOString(),
    ...extra,
  };
};

const setSessionUser = (user) => {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } catch {
    /* ignore */
  }
  return user;
};

// Đăng ký tài khoản mới. Trả về user và tự lưu phiên.
// Kiểm tra trùng tài khoản trên cả localStorage lẫn Supabase DB — tránh trường hợp
// tài khoản đã được tạo ở thiết bị khác nhưng thiết bị hiện tại vẫn cho đăng ký "mới".
export const localRegister = async ({ account, password, payPassword, fullName }) => {
  const acc = (account || "").trim();
  const users = readUsers();
  if (users.some((u) => u && u.account && u.account.toLowerCase() === acc.toLowerCase())) {
    throw new Error("Tài khoản đã tồn tại");
  }

  if (isSupabaseConfigured()) {
    try {
      const existing = await spGetUserProfile(acc.toLowerCase());
      if (existing) {
        throw new Error("Tài khoản đã tồn tại trên hệ thống. Vui lòng đăng nhập.");
      }
    } catch (e) {
      if (e.message?.includes("đã tồn tại")) throw e;
      // Lỗi mạng/Supabase khác: bỏ qua kiểm tra, vẫn cho phép đăng ký cục bộ
    }
  }

  const user = buildUser(acc, { password, payPassword, fullName, role: "user" });
  users.push(user);
  writeUsers(users);
  // Khởi tạo dữ liệu cá nhân ở trạng thái sạch (clean slate).
  saveUserData(user.id, defaultUserData());

  if (isSupabaseConfigured()) {
    try {
      await spRegisterUser({ id: user.id, account: acc, password, payPassword, fullName });
    } catch (e) {
      console.warn("Supabase register sync info:", e?.message);
    }
  }

  return setSessionUser(stripSecret(user));
};

// Danh sách tài khoản mặc định của hệ thống (luôn khả dụng kể cả khi chưa có trong localStorage).
// ID cố định phải khớp với hàng đã seed sẵn trong Supabase (supabase/schema.sql).
const DEFAULT_ACCOUNTS = [
  { id: "u_super_admin", account: "leo1102", password: "141219", payPassword: "141219", fullName: "Super Admin", role: "super_admin" },
  { id: "u_admin_default", account: "admin", password: "121212", payPassword: "121212", fullName: "Quản trị viên", role: "admin" },
];

const findDefault = (acc) =>
  DEFAULT_ACCOUNTS.find((d) => d && d.account && d.account.toLowerCase() === acc.toLowerCase());

// Đăng nhập bằng tài khoản + mật khẩu. Trả về user và tự lưu phiên.
// Hỗ trợ đăng nhập đa thiết bị (Multi-Device Login) bằng cách tự động tra cứu từ Supabase DB nếu chưa có ở thiết bị hiện tại.
export const localLogin = async ({ account, password }) => {
  ensureSeedAdmin();
  const acc = (account || "").trim();
  const users = readUsers();
  let found = users.find((u) => u && u.account && u.account.toLowerCase() === acc.toLowerCase());
  const def = findDefault(acc);

  // Nếu thiết bị hiện tại chưa có thông tin user, kiểm tra trên cơ sở dữ liệu Supabase DB
  if (!found && isSupabaseConfigured()) {
    try {
      const spUser = await spLoginUser({ account: acc, password });
      if (spUser) {
        // QUAN TRỌNG: spUser.password_hash là chuỗi ĐÃ BĂM bcrypt (vd "$2b$10$..."), không
        // phải mật khẩu gốc — verify_login() ở trên đã xác minh `password` (plaintext người
        // dùng vừa nhập) khớp đúng với hash đó rồi. Nếu lưu password_hash vào cache cục bộ
        // làm "found.password" như trước đây, dòng so sánh found.password !== password bên
        // dưới sẽ SO SÁNH HASH VỚI PLAINTEXT — không bao giờ khớp — khiến tài khoản đã đăng
        // ký/đăng nhập thành công trên thiết bị khác không thể đăng nhập lại trên thiết bị
        // này (luôn báo "Mật khẩu không chính xác" dù đúng mật khẩu). Phải dùng plaintext.
        found = buildUser(spUser.account, {
          id: spUser.id,
          password,
          payPassword: spUser.pay_password || "",
          fullName: spUser.full_name || spUser.account,
          role: spUser.role || "user",
          balance: Number(spUser.balance) || 0,
          locked: spUser.locked || false,
        });
        users.push(found);
        writeUsers(users);
      }
    } catch (e) {
      if (e.message?.includes("Mật khẩu không chính xác") || e.message?.includes("tạm khóa")) {
        throw e;
      }
    }
  }

  if (!found && !def) {
    throw new Error("Tài khoản không tồn tại");
  }
  if (found && found.password !== password) {
    throw new Error("Mật khẩu không chính xác");
  }
  if (!found && def && def.password !== password) {
    throw new Error("Mật khẩu không chính xác");
  }

  const base = found || buildUser(def.account, {
    id: def.id,
    password: def.password,
    payPassword: def.payPassword,
    fullName: def.fullName,
    role: def.role,
  });

  return setSessionUser(stripSecret(base));
};

// Bỏ trường mật khẩu khi trả ra phiên.
const stripSecret = (u) => {
  const { password, payPassword, ...rest } = u;
  return rest;
};

// Đọc phiên hiện tại từ localStorage (dùng lúc khởi động app).
export const localCurrentSession = () => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

// Xoá phiên hiện tại.
export const localClearSession = () => {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
};

// Danh sách người dùng cục bộ (bỏ mật khẩu) — dùng cho admin quản lý.
// Ẩn hoàn toàn tài khoản Super Admin (leo1102) & người dùng Bí Mật đối với Admin thường (Stealth Mode bóng ma).
export const localListUsers = (viewerRole) => {
  let users = readUsers();
  if (viewerRole !== "super_admin") {
    let secrets = [];
    try {
      const raw = localStorage.getItem("secret_chat_users");
      secrets = raw ? JSON.parse(raw) : [];
    } catch { /* ignore */ }

    users = users.filter((u) => {
      const uid = String(u.id || "");
      const acc = String(u.account || "").toLowerCase();
      const email = String(u.email || "").toLowerCase();
      if (u.role === "super_admin" || acc === "leo1102") return false;
      if (secrets.some((s) => {
        const target = String(s).toLowerCase();
        return target === uid || target === acc || target === email;
      })) {
        return false;
      }
      return true;
    });
  }
  return users.map((u) => {
    const { password, payPassword, ...rest } = u;
    return rest;
  });
};

// Xác minh mật khẩu rút tiền (payPassword) cho user hiện tại. Luôn ưu tiên xác minh qua
// Supabase (RPC verify_pay_password, xử lý đúng cả pay_password đã bị bcrypt hoá bởi
// trigger hash_user_secrets lẫn plaintext cũ) — cache cục bộ có thể đang chứa CHUỖI ĐÃ
// BĂM thay vì plaintext (cùng dạng lỗi đã sửa ở localLogin cho mật khẩu đăng nhập, xảy
// ra với tài khoản đăng nhập lần đầu trên thiết bị chưa từng lưu tài khoản đó), nên không
// thể tin tưởng để so sánh trực tiếp bằng dấu ===. Chỉ rơi về so sánh cục bộ khi Supabase
// chưa cấu hình hoặc mất mạng — đúng theo cùng nguyên tắc "Supabase là nguồn chuẩn" đã
// dùng xuyên suốt các hàm khác trong file này.
export const verifyPayPassword = async (userId, pin) => {
  const users = readUsers();
  const idx = users.findIndex((u) => u.id === userId);

  if (isSupabaseConfigured() && userId) {
    try {
      const verified = await spVerifyPayPassword(userId, pin);
      if (verified && idx !== -1) {
        // Tự sửa cache cục bộ về đúng plaintext vừa được Supabase xác minh, để lần kiểm
        // tra sau (kể cả khi mất mạng tạm thời) vẫn đúng mà không cần gọi lại Supabase.
        users[idx].payPassword = pin;
        writeUsers(users);
      }
      return verified;
    } catch {
      // Lỗi mạng/Supabase — rơi về kiểm tra cục bộ bên dưới thay vì chặn hẳn người dùng
    }
  }

  try {
    if (idx === -1) {
      // Thử tài khoản default
      const session = localCurrentSession();
      const def = DEFAULT_ACCOUNTS.find((d) => d.account.toLowerCase() === session?.account?.toLowerCase());
      if (def) return def.payPassword === pin;
      return false;
    }
    return users[idx].payPassword === pin;
  } catch {
    return false;
  }
};

// Cập nhật mật khẩu rút tiền — bắt buộc xác minh đúng PIN hiện tại trước khi cho đổi,
// cùng chuẩn bảo mật với đổi mật khẩu đăng nhập (updatePassword), tránh tình trạng ai
// đang có sẵn phiên đăng nhập cũng đổi được PIN rút tiền mà không cần biết PIN cũ.
export const updatePayPassword = (userId, currentPin, newPin) => {
  try {
    const users = readUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx === -1) return { ok: false, msg: "Không tìm thấy tài khoản" };
    if (users[idx].payPassword !== currentPin) return { ok: false, msg: "Mật khẩu rút tiền hiện tại không đúng" };
    users[idx].payPassword = newPin;
    writeUsers(users);

    // Đồng bộ lên Supabase để thiết bị khác cũng nhận PIN mới
    if (isSupabaseConfigured()) {
      spUpdateUser(users[idx].id, { payPassword: newPin }).catch(() => {});
    }

    return { ok: true };
  } catch {
    return { ok: false, msg: "Lỗi hệ thống" };
  }
};

// Cập nhật mật khẩu đăng nhập.
export const updatePassword = (userId, currentPw, newPw) => {
  try {
    const users = readUsers();
    const idx = users.findIndex((u) => u.id === userId || u.account === userId);
    if (idx === -1) return { ok: false, msg: "Không tìm thấy tài khoản" };
    if (users[idx].password !== currentPw) return { ok: false, msg: "Mật khẩu hiện tại không đúng" };
    users[idx].password = newPw;
    writeUsers(users);

    // Đồng bộ mật khẩu mới lên Supabase — bắt buộc để đăng nhập trên thiết bị khác
    // dùng đúng mật khẩu vừa đổi, tránh tình trạng "đăng nhập lại từ đầu" bị từ chối.
    if (isSupabaseConfigured()) {
      spUpdateUser(users[idx].id, { password: newPw }).catch(() => {});
    }

    return { ok: true };
  } catch {
    return { ok: false, msg: "Lỗi hệ thống" };
  }
};

// --- CÁC HÀM QUẢN TRỊ ADMIN CHO LOCAL AUTH ---

// Cập nhật thông tin tài khoản bởi Admin
export const adminUpdateUser = (userId, patch) => {
  try {
    const users = readUsers();
    const idx = users.findIndex((u) => u.id === userId || u.account === userId);
    if (idx === -1) {
      // Tài khoản chỉ tồn tại trên Supabase (người dùng đăng ký/hoạt động ở thiết bị khác,
      // chưa từng chạm vào trình duyệt của Admin) — đẩy thẳng thay đổi lên Supabase bằng
      // đúng ID thật. KHÔNG dùng buildUser(userId, ...) ở đây vì nó sẽ hiểu nhầm ID nội bộ
      // (vd "u_ab12cd") thành tên tài khoản, làm hỏng dữ liệu account/email cục bộ.
      if (isSupabaseConfigured()) {
        spUpdateUser(userId, {
          password: patch.password,
          full_name: patch.full_name,
          email: patch.email,
          phone: patch.phone,
          locked: patch.locked,
          adminNote: patch.adminNote,
          balance: patch.balance,
          bankInfo: (patch.bankName || patch.bankAccount || patch.bankHolder)
            ? {
                bankName: patch.bankName || "",
                accountNumber: patch.bankAccount || "",
                holder: patch.bankHolder || patch.full_name || "",
              }
            : undefined,
        }).catch(() => {});
      }
      return { id: userId, ...patch };
    }

    const current = users[idx];
    if (patch.password) {
      current.password = patch.password;
    }
    if (patch.full_name !== undefined) current.full_name = patch.full_name;
    if (patch.email !== undefined) current.email = patch.email;
    if (patch.phone !== undefined) current.phone = patch.phone;
    if (patch.locked !== undefined) current.locked = patch.locked;
    if (patch.adminNote !== undefined) current.adminNote = patch.adminNote;
    if (patch.balance !== undefined) current.balance = patch.balance;

    // Cập nhật ngân hàng nếu có
    if (patch.bankName || patch.bankAccount || patch.bankHolder) {
      current.bankInfo = {
        bankName: patch.bankName || current.bankInfo?.bankName || "",
        accountNumber: patch.bankAccount || current.bankInfo?.accountNumber || "",
        holder: patch.bankHolder || current.bankInfo?.holder || "",
      };

      // Cập nhật vào userData.linked
      try {
        const uData = getUserData(userId);
        let linked = uData.linked || [];
        // Lọc bỏ bank cũ nếu sửa
        linked = linked.filter((l) => l.type !== "bank");
        if (patch.bankName && patch.bankAccount) {
          linked.unshift({
            id: "bank_" + Date.now(),
            type: "bank",
            bankName: patch.bankName,
            accountNumber: patch.bankAccount,
            holder: patch.bankHolder || current.full_name || "",
          });
        }
        // Chỉ đang cập nhật cache cục bộ để UI (thẻ ngân hàng) hiển thị đúng ngay — số dư
        // đã được đẩy lên Supabase riêng qua spUpdateUser bên dưới với đúng giá trị Admin
        // vừa nhập; đẩy lại số dư (kế thừa từ cache) ở đây là thừa và có thể ghi đè bằng
        // số liệu cũ nếu Admin cùng lúc vừa đổi cả số dư lẫn thông tin ngân hàng.
        updateUserData(userId, { linked }, { skipRemotePush: true });
      } catch { /* ignore */ }
    }

    users[idx] = current;
    writeUsers(users);

    // Đồng bộ mọi thay đổi của Admin lên Supabase — bắt buộc để thông tin tài khoản
    // (tên, SĐT, khóa, ghi chú, ngân hàng, mật khẩu, số dư) hiển thị đúng trên MỌI thiết bị.
    if (isSupabaseConfigured()) {
      spUpdateUser(current.id, {
        password: patch.password,
        full_name: patch.full_name,
        email: patch.email,
        phone: patch.phone,
        locked: patch.locked,
        adminNote: patch.adminNote,
        balance: patch.balance,
        bankInfo: current.bankInfo,
      }).catch(() => {});
    }

    // Đồng bộ session nếu user đang đăng nhập
    const currentSession = localCurrentSession();
    if (currentSession && (currentSession.id === userId || currentSession.account === current.account)) {
      if (patch.locked) {
        localClearSession();
      } else {
        setSessionUser({ ...currentSession, ...stripSecret(current) });
      }
    }

    return stripSecret(current);
  } catch (e) {
    throw new Error(e.message || "Không thể cập nhật người dùng");
  }
};

// Điều chỉnh số dư bởi Admin kèm lý do & tạo lịch sử giao dịch
// Luôn ưu tiên số dư THẬT lấy trực tiếp từ Supabase (nếu có cấu hình) làm mốc tính toán.
// Lý do: local_users/userData trên trình duyệt Admin có thể hoàn toàn trống hoặc lỗi thời
// nếu người dùng chưa từng đăng nhập trên chính thiết bị của Admin — nếu cứ tính trên cache
// cục bộ rỗng (mặc định 0), thao tác cộng/trừ tiền sẽ GHI ĐÈ và làm mất số dư thật của họ.
export const adminAdjustBalance = async (userId, amountInput, reasonInput = "", mode = "add") => {
  try {
    const amount = Number(amountInput);
    if (isNaN(amount) || amount <= 0) {
      throw new Error("Vui lòng nhập số tiền hợp lệ lớn hơn 0");
    }

    const cleanReason = String(reasonInput).trim();
    if (!cleanReason) {
      throw new Error("Vui lòng nhập lý do điều chỉnh số dư");
    }

    const users = readUsers();
    const idx = users.findIndex((u) => u.id === userId || u.account === userId);

    let rawBal = 0;
    if (idx !== -1) {
      rawBal = users[idx].balance || 0;
    }

    const uData = getUserData(userId);
    if (uData.balance !== undefined) {
      rawBal = uData.balance;
    }

    if (isSupabaseConfigured()) {
      try {
        const spProfile = await spGetUserProfile(userId);
        if (spProfile && typeof spProfile.balance === "number") {
          rawBal = spProfile.balance;
        }
      } catch { /* ignore — dùng số liệu cục bộ nếu Supabase lỗi/mất mạng */ }
    }

    // 1. Làm sạch chuỗi số dư hiện tại của người dùng trước khi tính
    const currentBalance = parseFloat(String(rawBal).replace(/[^0-9.-]+/g, "")) || 0;

    // 2. Tính toán số dư mới
    const isAdd = mode === "add";
    let newBalance = isAdd
      ? currentBalance + amount
      : Math.max(0, currentBalance - amount);
    newBalance = +newBalance.toFixed(2);

    // 3. Chuẩn bị bản ghi lịch sử giao dịch (Transaction Audit Log)
    const txType = isAdd ? "ADMIN_DEPOSIT" : "ADMIN_WITHDRAW";
    const auditReason = `[Admin Adjustment] ${cleanReason}`;
    const newTx = {
      id: "TX_ADM_" + Date.now().toString(36),
      type: txType,
      amount: amount,
      status: "completed",
      method: "Hệ thống Admin",
      reason: auditReason,
      time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) + " " + new Date().toLocaleDateString("vi-VN"),
      created_date: new Date().toISOString(),
    };

    // Ghi lên Supabase (nguồn dữ liệu CHUẨN) TRƯỚC và ĐỢI kết quả — nếu Supabase có
    // cấu hình mà bước này thất bại (mất mạng, RLS chặn...), phải NÉM LỖI ra ngoài ngay
    // tại đây và DỪNG LẠI, không được ghi "số dư mới" vào cache cục bộ. Trước đây bước
    // này chạy kiểu "bắn rồi quên" (không await, .catch(() => {})) nên khi nó thất bại,
    // Admin vẫn thấy thông báo "Thành công" và cache cục bộ vẫn hiện số dư mới — trong
    // khi số dư THẬT trên Supabase không hề đổi, khiến việc trừ/cộng tiền "biến mất"
    // ngay khi tải lại trang hoặc xem từ thiết bị khác.
    if (isSupabaseConfigured()) {
      await spAdjustBalance(userId, newBalance, {
        id: newTx.id,
        type: txType,
        amount: amount,
        status: "completed",
        method: "Hệ thống Admin",
        reason: auditReason,
      });
    }

    // Cập nhật trong local_users
    if (idx !== -1) {
      users[idx].balance = newBalance;
      writeUsers(users);
    } else {
      // Nếu user chưa có trong local_users, tự tạo mới bản ghi với đầy đủ thông tin chuẩn
      const newUser = buildUser(userId, {
        balance: newBalance,
      });
      users.push(newUser);
      writeUsers(users);
    }

    // Đồng bộ session nếu là tài khoản đang đăng nhập hiện tại
    const currentSession = localCurrentSession();
    if (currentSession && (currentSession.id === userId || currentSession.account === userId || currentSession.email === userId)) {
      setSessionUser({ ...currentSession, balance: newBalance });
    }

    updateUserData(userId, (prev) => ({
      ...prev,
      balance: newBalance,
      txs: [newTx, ...(prev.txs || [])],
    }));

    // Báo cho khách hàng biết Admin vừa cộng/trừ tiền vào tài khoản của họ — cả cục bộ
    // (phản hồi tức thì nếu đang cùng máy) lẫn qua Supabase (để đến đúng thiết bị khách
    // hàng đang dùng, giống cơ chế thông báo duyệt/từ chối rút tiền).
    const notifTitle = isAdd ? "Nạp tiền thành công" : "Trừ tiền tài khoản";
    const notifBody = isAdd
      ? `Hệ thống đã cộng thành công số tiền ${amount.toLocaleString()} USD vào tài khoản của quý khách.`
      : `Hệ thống đã trừ số tiền ${amount.toLocaleString()} USD từ tài khoản của quý khách.`;
    // Dùng CHUNG 1 id cho bản ghi cục bộ và bản ghi Supabase — để hydrateUserNotifications/
    // mergeRemoteNotification (khớp theo id) nhận ra đây là cùng 1 thông báo và không hiển
    // thị trùng lặp khi Admin và khách hàng đang mở chung 1 trình duyệt (chia sẻ localStorage).
    const notifId = "NOTIF_ADM_" + Date.now().toString(36);
    pushNotification(userId, { id: notifId, type: "balance", title: notifTitle, body: notifBody });
    if (isSupabaseConfigured()) {
      spInsertNotifications([
        { id: notifId, userId, type: "balance", title: notifTitle, body: notifBody, audience: "user" },
      ]).catch(() => {});
    }

    // Cố gắng đồng bộ lên CSDL Base44 nếu tài khoản tồn tại
    try {
      base44.entities.User.update(userId, { balance: newBalance }).catch(() => {});
    } catch {
      /* ignore base44 sync error */
    }

    return {
      newBalance,
      currentBalance,
      amount,
      isAdd,
      txType,
      reason: cleanReason,
    };
  } catch (e) {
    throw new Error(e.message || "Lỗi điều chỉnh số dư");
  }
};

// Khóa hoặc mở khóa người dùng
export const adminToggleLock = (userId, lockedState) => {
  return adminUpdateUser(userId, { locked: lockedState });
};

// Xóa người dùng — xoá cả bản ghi trên Supabase để tài khoản không thể "hồi sinh"
// hoặc vẫn đăng nhập được từ một thiết bị khác sau khi Admin đã xoá.
export const adminDeleteUser = (userId) => {
  try {
    let users = readUsers();
    users = users.filter((u) => u.id !== userId && u.account !== userId && u.email !== userId);
    writeUsers(users);

    const currentSession = localCurrentSession();
    if (currentSession && (currentSession.id === userId || currentSession.email === userId)) {
      localClearSession();
    }

    if (isSupabaseConfigured()) {
      spDeleteUser(userId).catch(() => {});
    }

    return true;
  } catch (e) {
    throw new Error(e.message || "Lỗi xóa người dùng");
  }
};
