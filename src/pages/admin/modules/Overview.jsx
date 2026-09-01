import React, { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { LineChart, Line, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { Users as UsersIcon, UserCheck, ArrowLeftRight, DollarSign, Ticket } from "lucide-react";
import { Panel, StatCard, TableWrap, Th, Td, Empty, Badge } from "../ui";
import { isSecretChatUser } from "@/lib/localChat";
import { useAuth } from "@/lib/AuthContext";
import { spListUsers, spListAllGameBets } from "@/lib/supabaseService";
import { isSupabaseConfigured } from "@/lib/supabase";

const PIE = ["#7033ff", "#4b00ff", "#ffab40", "#e67e22", "#34d399", "#38bdf8", "#f472b6", "#a78bfa", "#fb7185"];

export default function Overview() {
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.role === "super_admin";
  const [users, setUsers] = useState([]);
  const [txs, setTxs] = useState([]);
  const [bets, setBets] = useState([]);

  useEffect(() => {
    const load = () => {
      base44.entities.Transaction.list().then(setTxs).catch(() => {});

      // Supabase là nguồn CHUẨN — thấy TẤT CẢ người dùng & vé cược dù hoạt động ở thiết bị nào.
      if (isSupabaseConfigured()) {
        spListUsers().then((rows) => {
          if (Array.isArray(rows)) {
            setUsers(rows.map((r) => ({
              id: r.id,
              account: r.account,
              email: r.email,
              locked: !!r.locked,
            })));
          }
        }).catch(() => {});

        spListAllGameBets().then((rows) => {
          if (!Array.isArray(rows)) return;
          setBets(rows.map((r) => {
            const details = r.details || {};
            return {
              id: r.id,
              userId: r.user_id,
              userEmail: r.user_id,
              hallName: details.game || r.game_type,
              amount: Number(r.amount) || 0,
              result: r.status,
              created_date: details.created_date || r.created_at,
            };
          }));
        }).catch(() => {});
      } else {
        base44.entities.User.list().then(setUsers).catch(() => {});
        base44.entities.Bet.list().then(setBets).catch(() => {});
      }
    };

    load();
    // Poll để số liệu tổng quan tự cập nhật khi có người dùng/vé cược mới từ thiết bị
    // khác, không cần Admin tự bấm F5.
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, []);

  const visibleUsers = useMemo(() => {
    if (isSuperAdmin) return users;
    return users.filter((u) => !isSecretChatUser(u.id) && !isSecretChatUser(u.account) && !isSecretChatUser(u.email));
  }, [users, isSuperAdmin]);

  const visibleTxs = useMemo(() => {
    if (isSuperAdmin) return txs;
    return txs.filter((t) => !isSecretChatUser(t.userId) && !isSecretChatUser(t.userEmail));
  }, [txs, isSuperAdmin]);

  const visibleBets = useMemo(() => {
    if (isSuperAdmin) return bets;
    return bets.filter((b) => !isSecretChatUser(b.userId) && !isSecretChatUser(b.userEmail));
  }, [bets, isSuperAdmin]);

  const stats = useMemo(() => {
    const active = visibleUsers.filter((u) => !u.locked).length;
    const revenue = visibleTxs.filter((t) => t.status === "completed" && t.type === "deposit").reduce((s, t) => s + (t.amount || 0), 0);
    return { total: visibleUsers.length, active, txCount: visibleTxs.length, revenue, todayBets: visibleBets.length };
  }, [visibleUsers, visibleTxs, visibleBets]);

  const revenueSeries = useMemo(() => {
    const days = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
    const base = Math.max(1000, Math.round(stats.revenue / 7));
    return days.map((d, i) => ({ name: d, uv: Math.round(base * (0.6 + Math.sin(i) * 0.25 + i * 0.05)) }));
  }, [stats.revenue]);

  const pieData = useMemo(() => {
    const map = {};
    visibleBets.forEach((b) => { map[b.hallName] = (map[b.hallName] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value })).slice(0, 9);
  }, [visibleBets]);

  const activity = useMemo(() => {
    const items = [];
    visibleBets.forEach((b) => items.push({ id: "b" + b.id, user: b.userEmail, action: `Đặt cược ${b.hallName} · $${b.amount} USD`, time: b.created_date, tone: b.result === "win" ? "green" : b.result === "loss" ? "red" : "amber", tag: b.result }));
    visibleTxs.forEach((t) => items.push({ id: "t" + t.id, user: t.userEmail, action: `${t.type === "deposit" ? "Nạp" : "Rút"} $${t.amount} USD · ${t.status}`, time: t.created_date, tone: t.status === "completed" ? "green" : t.status === "rejected" ? "red" : "amber", tag: t.status }));
    return items.sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 8);
  }, [visibleBets, visibleTxs]);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Tổng Quan</h1>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard icon={UsersIcon} label="Tổng người dùng" value={stats.total} />
        <StatCard icon={UserCheck} label="Đang hoạt động" value={stats.active} accent="orange" />
        <StatCard icon={ArrowLeftRight} label="Giao dịch" value={stats.txCount} />
        <StatCard icon={DollarSign} label="Doanh thu" value={stats.revenue.toLocaleString()} accent="orange" />
        <StatCard icon={Ticket} label="Cược hôm nay" value={stats.todayBets} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Panel className="lg:col-span-2 p-4">
          <p className="text-sm font-semibold mb-3">Doanh thu 7 ngày qua</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueSeries}>
                <XAxis dataKey="name" stroke="#ffffff60" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#ffffff60" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "#161936", border: "1px solid #ffffff20", borderRadius: 12, color: "#fff" }} />
                <Line type="monotone" dataKey="uv" stroke="#7033ff" strokeWidth={3} dot={{ r: 3, fill: "#ffab40" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel className="p-4">
          <p className="text-sm font-semibold mb-3">Phân bố theo sảnh</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={3}>
                  {pieData.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#161936", border: "1px solid #ffffff20", borderRadius: 12, color: "#fff" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel className="overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10"><p className="text-sm font-semibold">Hoạt động gần đây</p></div>
        <TableWrap>
          <thead className="bg-white/[0.03]">
            <tr><Th>Người dùng</Th><Th>Hành động</Th><Th>Trạng thái</Th><Th>Thời gian</Th></tr>
          </thead>
          <tbody>
            {activity.length === 0 ? <Empty colSpan={4} /> : activity.map((a) => (
              <tr key={a.id} className="border-t border-white/5">
                <Td>{a.user}</Td>
                <Td>{a.action}</Td>
                <Td><Badge tone={a.tone}>{a.tag}</Badge></Td>
                <Td className="text-white/50 text-[12px]">{new Date(a.time).toLocaleString("vi-VN")}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Panel>
    </div>
  );
}