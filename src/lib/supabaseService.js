import { supabase, isSupabaseConfigured } from './supabase';

// Đăng ký kênh Realtime dùng chung theo `key` — nhiều component (Home, HomeHeader,
// GamePlayScreen...) có thể cùng lắng nghe realtime cho CÙNG một user/kênh chat trên
// cùng một trang. Supabase trả về LẠI cùng một channel instance khi gọi `.channel()` với
// cùng tên topic, nên gọi `.on().subscribe()` lần thứ 2 trên kênh đã subscribe sẽ crash
// ("cannot add postgres_changes callbacks ... after subscribe()"). Dùng registry đếm số
// người nghe để chỉ tạo/subscribe kênh MỘT LẦN và chỉ removeChannel khi không còn ai lắng nghe.
const sharedChannels = new Map();

const subscribeShared = (key, createChannel) => (onMessage) => {
  if (!isSupabaseConfigured() || !supabase) return () => {};

  let entry = sharedChannels.get(key);
  if (!entry) {
    const listeners = new Set();
    let channel;
    try {
      channel = createChannel((payload) => {
        listeners.forEach((cb) => cb(payload));
      });
    } catch (e) {
      console.warn('Supabase realtime subscribe notice:', e?.message);
      return () => {};
    }
    entry = { channel, listeners };
    sharedChannels.set(key, entry);
  }
  entry.listeners.add(onMessage);

  return () => {
    entry.listeners.delete(onMessage);
    if (entry.listeners.size === 0) {
      supabase.removeChannel(entry.channel);
      sharedChannels.delete(key);
    }
  };
};

/**
 * Register user in Supabase CSDL (users_profile table)
 */
export const spRegisterUser = async ({ id: passedId, account, password, payPassword, fullName }) => {
  if (!isSupabaseConfigured()) return null;

  const acc = (account || '').trim().toLowerCase();
  const id = passedId || 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const role = acc === 'admin' || acc === 'admin1' || acc.startsWith('admin') ? 'admin' : 'user';

  // Check if account exists
  const { data: existing } = await supabase
    .from('users_profile')
    .select('id')
    .eq('account', acc)
    .maybeSingle();

  if (existing) {
    throw new Error('Tài khoản đã tồn tại trên cơ sở dữ liệu Supabase');
  }

  const newUser = {
    id,
    account: acc,
    email: `${acc}@app.internal`,
    full_name: fullName || acc,
    password_hash: password,
    pay_password: payPassword,
    role,
    balance: 0,
    locked: false,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('users_profile')
    .insert([newUser])
    .select()
    .single();

  if (error) {
    throw new Error(error.message || 'Lỗi khi đăng ký tài khoản trên Supabase');
  }

  return data;
};

/**
 * Login user via Supabase CSDL
 */
export const spLoginUser = async ({ account, password }) => {
  if (!isSupabaseConfigured()) return null;

  const acc = (account || '').trim().toLowerCase();

  const { data: user, error } = await supabase
    .from('users_profile')
    .select('*')
    .eq('account', acc)
    .maybeSingle();

  if (error || !user) {
    throw new Error('Tài khoản không tồn tại trên Supabase');
  }

  if (user.password_hash !== password) {
    throw new Error('Mật khẩu không chính xác');
  }

  if (user.locked) {
    throw new Error('Tài khoản đã bị tạm khóa bởi QTV');
  }

  return user;
};

/**
 * Fetch all users profile for Admin
 */
export const spListUsers = async () => {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await supabase
    .from('users_profile')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return null;
  return data;
};

/**
 * Fetch single user profile by ID or Account
 */
export const spGetUserProfile = async (userIdOrAccount) => {
  if (!isSupabaseConfigured() || !userIdOrAccount) return null;

  const { data, error } = await supabase
    .from('users_profile')
    .select('*')
    .or(`id.eq.${userIdOrAccount},account.eq.${userIdOrAccount}`)
    .maybeSingle();

  if (error) return null;
  return data;
};

/**
 * Update User Balance & Record Audit Transaction in Supabase
 */
export const spAdjustBalance = async (userId, newBalance, txData = null) => {
  if (!isSupabaseConfigured()) return null;

  const { data: user, error: uErr } = await supabase
    .from('users_profile')
    .update({ balance: newBalance, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single();

  if (uErr) {
    console.error('Supabase balance update error:', uErr);
  }

  if (txData) {
    await supabase.from('transactions').insert([
      {
        id: txData.id || 'TX_' + Date.now().toString(36),
        user_id: userId,
        type: txData.type || 'ADMIN_ADJUST',
        amount: txData.amount,
        status: txData.status || 'completed',
        method: txData.method || 'System',
        reason: txData.reason || '',
        created_at: new Date().toISOString(),
      },
    ]);
  }

  return user;
};

/**
 * Xoá vĩnh viễn tài khoản khỏi Supabase — dùng khi Admin xoá người dùng, để tài khoản
 * không thể "hồi sinh" hoặc vẫn đăng nhập được từ một thiết bị khác.
 */
export const spDeleteUser = async (userId) => {
  if (!isSupabaseConfigured() || !userId) return false;

  const { error } = await supabase.from('users_profile').delete().eq('id', userId);
  if (error) {
    console.error('Supabase delete user error:', error);
    return false;
  }
  return true;
};

/**
 * Update user details in Supabase
 */
export const spUpdateUser = async (userId, patch) => {
  if (!isSupabaseConfigured()) return null;

  const updateData = { updated_at: new Date().toISOString() };
  if (patch.password) updateData.password_hash = patch.password;
  if (patch.payPassword) updateData.pay_password = patch.payPassword;
  if (patch.full_name !== undefined) updateData.full_name = patch.full_name;
  if (patch.email !== undefined) updateData.email = patch.email;
  if (patch.phone !== undefined) updateData.phone = patch.phone;
  if (patch.locked !== undefined) updateData.locked = patch.locked;
  if (patch.adminNote !== undefined) updateData.admin_note = patch.adminNote;
  if (patch.balance !== undefined) updateData.balance = patch.balance;
  if (patch.bankInfo !== undefined) updateData.bank_info = patch.bankInfo;

  const { data, error } = await supabase
    .from('users_profile')
    .update(updateData)
    .eq('id', userId)
    .select()
    .maybeSingle();

  if (error) {
    console.error('Supabase update user error:', error);
  }
  return data;
};

/**
 * Realtime Chat Support
 */
export const spFetchChatMessages = async (limit = 50) => {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return null;
  return data ? data.reverse() : [];
};

export const spSendChatMessage = async (msg) => {
  if (!isSupabaseConfigured()) return null;

  const newMsg = {
    id: msg.id || 'msg_' + Date.now().toString(36),
    user_id: msg.userId || 'guest',
    username: msg.username || msg.sender || 'Khách',
    message: msg.text || msg.message || '',
    avatar: msg.avatar || '',
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('chat_messages')
    .insert([newMsg])
    .select()
    .single();

  if (error) {
    console.error('Supabase send chat error:', error);
  }
  return data;
};

export const spSubscribeChat = subscribeShared('public:chat_messages', (emit) =>
  supabase
    .channel('public:chat_messages')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages' },
      (payload) => {
        if (payload.new) emit(payload.new);
      }
    )
    .subscribe()
);

/**
 * Banners Support
 */
export const spFetchBanners = async () => {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await supabase
    .from('banners')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) return null;
  return data;
};

/**
 * Realtime User Profile Subscription
 */
export const spSubscribeUserProfile = (userId, onProfileChange) => {
  if (!isSupabaseConfigured() || !supabase || !userId) return () => {};

  return subscribeShared(`public:users_profile:${userId}`, (emit) =>
    supabase
      .channel(`public:users_profile:${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users_profile' },
        (payload) => {
          if (payload.new && (payload.new.id === userId || payload.new.account === userId)) {
            emit(payload.new);
          }
        }
      )
      .subscribe()
  )(onProfileChange);
};

/**
 * Transactions Sync
 */
export const spFetchUserTransactions = async (userId) => {
  if (!isSupabaseConfigured() || !userId) return null;

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return null;
  return data;
};

/**
 * Withdraw Requests Sync
 */
export const spFetchUserWithdrawRequests = async (userId) => {
  if (!isSupabaseConfigured() || !userId) return null;

  const { data, error } = await supabase
    .from('withdraw_requests')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return null;
  return data;
};

/**
 * Game Bets Sync (Multi-Device) — đẩy vé cược (đang chờ/đã tất toán) lên Supabase
 * để mọi thiết bị đăng nhập cùng tài khoản đều thấy đúng lịch sử cược.
 */
export const spSyncGameBet = async (bet) => {
  if (!isSupabaseConfigured() || !bet) return null;

  const id = String(bet.betId || bet.id);
  const status = bet.status === 'SETTLED_WIN' ? 'win' : bet.status === 'SETTLED_LOSE' ? 'loss' : 'pending';

  const row = {
    id,
    user_id: bet.userId,
    game_type: bet.gameId || bet.game || 'unknown',
    amount: Number(bet.amount) || 0,
    payout: Number(bet.winAmount) || 0,
    status,
    details: {
      period: bet.period,
      key: bet.key || bet.itemKey,
      label: bet.label,
      lockedOdds: bet.lockedOdds ?? bet.odds,
      tabId: bet.tabId,
      tabLabel: bet.tabLabel,
      time: bet.time,
      created_date: bet.created_date || bet.timestamp,
      game: bet.game,
    },
  };

  // Không dùng upsert()/onConflict: một số môi trường Supabase có thể chưa có ràng buộc
  // UNIQUE/PRIMARY KEY thực sự trên cột id (lệch với supabase/schema.sql), khiến upsert
  // báo lỗi Postgres 42P10 ("no unique or exclusion constraint matching ON CONFLICT") và
  // vé cược không bao giờ được lưu. Tự làm UPSERT ở tầng ứng dụng: thử UPDATE trước, nếu
  // không có dòng nào khớp thì INSERT mới — hoạt động đúng bất kể ràng buộc DB thế nào.
  const { data: updated, error: updateError } = await supabase
    .from('game_bets')
    .update(row)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (updateError) {
    console.error('Supabase sync bet (update) error:', updateError);
  }

  if (updated) return updated;

  const { data: inserted, error: insertError } = await supabase
    .from('game_bets')
    .insert([row])
    .select()
    .maybeSingle();

  if (insertError) {
    console.error('Supabase sync bet (insert) error:', insertError);
  }
  return inserted;
};

export const spFetchUserGameBets = async (userId, limit = 300) => {
  if (!isSupabaseConfigured() || !userId) return null;

  const { data, error } = await supabase
    .from('game_bets')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return null;
  return data;
};

/**
 * Admin: lấy TOÀN BỘ vé cược của TẤT CẢ người dùng (bất kể đăng nhập/chơi ở thiết bị nào)
 */
export const spListAllGameBets = async (limit = 500) => {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await supabase
    .from('game_bets')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return null;
  return data;
};

/**
 * Admin: lấy TOÀN BỘ đơn rút tiền của TẤT CẢ người dùng để Admin luôn kiểm soát được
 * hàng đợi duyệt rút tiền dù người dùng gửi đơn từ thiết bị nào.
 */
export const spListAllWithdrawRequests = async (limit = 500) => {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await supabase
    .from('withdraw_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return null;
  return data;
};

/**
 * Admin: duyệt/từ chối đơn rút tiền — cập nhật trạng thái trên Supabase để mọi thiết bị
 * (kể cả thiết bị của người dùng gửi đơn) thấy đúng kết quả tức thì.
 */
export const spUpdateWithdrawRequestStatus = async (id, status) => {
  if (!isSupabaseConfigured() || !id) return null;

  const { data, error } = await supabase
    .from('withdraw_requests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) {
    console.error('Supabase update withdraw request error:', error);
  }
  return data;
};

export const spCreateWithdrawRequest = async (req) => {
  if (!isSupabaseConfigured() || !req) return null;

  const newReq = {
    id: req.id || 'WR_' + Date.now().toString(36),
    user_id: req.userId,
    account: req.account || '',
    full_name: req.fullName || '',
    amount: req.amount,
    bank_info: req.bankInfo || {},
    status: 'pending',
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('withdraw_requests')
    .insert([newReq])
    .select()
    .single();

  if (error) {
    console.error('Supabase create withdraw request error:', error);
  }
  return data;
};
