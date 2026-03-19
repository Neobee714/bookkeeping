import { useState, useEffect, useMemo, useCallback } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// ── 后端地址（Railway 部署后替换） ─────────────────────
const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const USERS = {
  me: { name: "我", avatar: "🧑", color: "#C9A84C" },
  gf: { name: "她", avatar: "👩", color: "#E8A0BF" },
};

const CATEGORIES = {
  expense: [
    { id: "food",          label: "餐饮",   icon: "🍜" },
    { id: "shop",          label: "购物",   icon: "🛍️" },
    { id: "transport",     label: "交通",   icon: "🚇" },
    { id: "health",        label: "医疗",   icon: "💊" },
    { id: "entertainment", label: "娱乐",   icon: "🎮" },
    { id: "other",         label: "其他",   icon: "📦" },
  ],
  income: [
    { id: "salary",  label: "工资", icon: "💼" },
    { id: "bonus",   label: "奖金", icon: "🎁" },
    { id: "invest",  label: "投资", icon: "📈" },
    { id: "other",   label: "其他", icon: "💰" },
    { id: "living",  label: "生活费", icon: "🏠" },
  ],
};

const PIE_COLORS = ["#C9A84C","#E8A0BF","#7EC8E3","#A8D8A8","#F4A261","#9B8EA8"];
const ALL_CATS   = [...CATEGORIES.expense, ...CATEGORIES.income];

function fmt(n) {
  return Number(n).toLocaleString("zh-CN", { minimumFractionDigits: 2 });
}

function getMonthList() {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}
const MONTHS     = getMonthList();
const THIS_MONTH = MONTHS[0];

// ── API helpers ──────────────────────────────────────
async function apiFetch(path, token, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "请求失败");
  }
  return res.json();
}

// ── Login Screen ─────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [userId, setUserId]     = useState("me");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const user = USERS[userId];

  async function handleLogin() {
    setLoading(true); setError("");
    try {
      const form = new URLSearchParams({ username: userId, password });
      const data = await fetch(`${API}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      });
      if (!data.ok) throw new Error("密码错误");
      const json = await data.json();
      localStorage.setItem("ledger_token",  json.access_token);
      localStorage.setItem("ledger_user_id", userId);
      onLogin(json.access_token, userId);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#0D0D0D,#1A1410)", display:"flex", justifyContent:"center", alignItems:"center", fontFamily:"'Georgia','Noto Serif SC',serif" }}>
      <div style={{ width:340, background:"#161410", borderRadius:28, padding:"36px 28px 40px", border:"1px solid #2A2520", boxShadow:"0 32px 80px rgba(0,0,0,0.7)" }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ fontSize:40, marginBottom:8 }}>💰</div>
          <div style={{ color:"#C9A84C", fontSize:22, fontWeight:700 }}>账本</div>
          <div style={{ color:"#555", fontSize:12, marginTop:4, fontFamily:"monospace", letterSpacing:1 }}>ledger.neobee.top</div>
        </div>

        {/* User selector */}
        <div style={{ display:"flex", background:"#0D0D0A", borderRadius:16, padding:3, marginBottom:20, gap:3 }}>
          {Object.entries(USERS).map(([key, u]) => (
            <button key={key} onClick={() => setUserId(key)} style={{ flex:1, padding:11, borderRadius:13, border:"none", background:userId===key ? u.color : "transparent", color:userId===key ? "#000" : "#555", fontWeight:600, fontSize:14, cursor:"pointer", transition:"all 0.2s" }}>
              {u.avatar} {u.name}
            </button>
          ))}
        </div>

        <input
          type="password"
          placeholder="密码"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleLogin()}
          style={{ width:"100%", background:"#0D0D0A", border:`1px solid ${user.color}40`, borderRadius:14, padding:"13px 16px", color:"#EEE", fontSize:15, outline:"none", marginBottom:10, boxSizing:"border-box" }}
        />

        {error && <div style={{ color:"#E05C5C", fontSize:12, marginBottom:10, fontFamily:"monospace" }}>✕ {error}</div>}

        <button onClick={handleLogin} disabled={loading || !password} style={{ width:"100%", padding:14, borderRadius:16, border:"none", background:loading||!password ? "#2A2520" : `linear-gradient(135deg,${user.color},${user.color}AA)`, color:loading||!password ? "#555" : "#000", fontWeight:700, fontSize:15, cursor:loading||!password ? "default" : "pointer" }}>
          {loading ? "登录中…" : "登录"}
        </button>
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────
export default function App() {
  const [token,    setToken]    = useState(() => localStorage.getItem("ledger_token") || null);
  const [userId,   setUserId]   = useState(() => localStorage.getItem("ledger_user_id") || "me");
  const [month,    setMonth]    = useState(THIS_MONTH);
  const [records,  setRecords]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [tab,      setTab]      = useState("home");
  const [showAdd,  setShowAdd]  = useState(false);
  const [showMon,  setShowMon]  = useState(false);
  const [form,     setForm]     = useState({ type:"expense", category:"food", amount:"", note:"" });
  const [chartT,   setChartT]   = useState("pie");
  const [toast,    setToast]    = useState(null);

  const user = USERS[userId];

  function logout() {
    localStorage.removeItem("ledger_token");
    localStorage.removeItem("ledger_user_id");
    setToken(null);
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }

  // ── Load records ─────────────────────────────────
  const loadRecords = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch(`/records?month=${month}`, token);
      setRecords(data);
    } catch (e) {
      if (e.message.includes("401")) logout();
      showToast("加载失败");
    } finally {
      setLoading(false);
    }
  }, [token, month]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  // ── Add ──────────────────────────────────────────
  async function handleAdd() {
    if (!form.amount || isNaN(+form.amount) || +form.amount <= 0) return;
    setSaving(true);
    try {
      const r = await apiFetch("/records", token, {
        method: "POST",
        body: JSON.stringify({
          type:     form.type,
          category: form.category,
          amount:   +form.amount,
          note:     form.note || (form.type === "expense" ? "支出" : "收入"),
          date:     new Date().toISOString().slice(0, 10),
          month,
        }),
      });
      setRecords(prev => [r, ...prev]);
      setForm({ type:"expense", category:"food", amount:"", note:"" });
      setShowAdd(false);
      showToast("✓ 记账成功");
    } catch {
      showToast("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ───────────────────────────────────────
  async function handleDelete(id) {
    try {
      await apiFetch(`/records/${id}`, token, { method: "DELETE" });
      setRecords(prev => prev.filter(r => r.id !== id));
      showToast("已删除");
    } catch {
      showToast("删除失败");
    }
  }

  // ── Stats ────────────────────────────────────────
  const totalIncome  = useMemo(() => records.filter(r => r.type==="income").reduce((s,r) => s+r.amount, 0), [records]);
  const totalExpense = useMemo(() => records.filter(r => r.type==="expense").reduce((s,r) => s+r.amount, 0), [records]);
  const balance      = totalIncome - totalExpense;

  const expByCategory = useMemo(() => {
    const map = {};
    records.filter(r => r.type==="expense").forEach(r => { map[r.category] = (map[r.category]||0) + r.amount; });
    return Object.entries(map).map(([id, value]) => ({
      name:  CATEGORIES.expense.find(c=>c.id===id)?.label || id,
      icon:  CATEGORIES.expense.find(c=>c.id===id)?.icon  || "📦",
      value,
    }));
  }, [records]);

  const barData = useMemo(() => {
    const days = {};
    records.filter(r => r.type==="expense").forEach(r => {
      const d = r.date.slice(8);
      days[d] = (days[d]||0) + r.amount;
    });
    return Object.entries(days).sort().map(([d, amt]) => ({ date: d+"日", amt }));
  }, [records]);

  const cats = CATEGORIES[form.type];
  const [yy, mm] = month.split("-");
  const monthLabel = `${yy}年${parseInt(mm)}月`;

  // ── No token → Login ─────────────────────────────
  if (!token) {
    return <LoginScreen onLogin={(tok, uid) => { setToken(tok); setUserId(uid); }} />;
  }

  // ── Record card ───────────────────────────────────
  function RecordCard({ r, deletable }) {
    const cat = ALL_CATS.find(c => c.id === r.category);
    return (
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"11px 14px", background:"#161410", borderRadius:14, marginBottom:7, border:"1px solid #1A1810" }}>
        <div style={{ display:"flex", alignItems:"center", gap:11 }}>
          <div style={{ width:38, height:38, borderRadius:11, background:r.type==="income"?"#1A2E1A":"#2A1A1A", display:"flex", alignItems:"center", justifyContent:"center", fontSize:17 }}>{cat?.icon||"📦"}</div>
          <div>
            <div style={{ color:"#DDD", fontSize:13 }}>{r.note}</div>
            <div style={{ color:"#444", fontSize:11, marginTop:1 }}>{r.date} · {cat?.label}</div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ color:r.type==="income"?"#3D9970":"#E05C5C", fontWeight:700, fontSize:14 }}>{r.type==="income"?"+":"-"}¥{fmt(r.amount)}</div>
          {deletable && <button onClick={() => handleDelete(r.id)} style={{ background:"none", border:"none", color:"#444", fontSize:16, cursor:"pointer", padding:"0 2px" }}>✕</button>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#0D0D0D,#1A1410)", display:"flex", justifyContent:"center", alignItems:"center", fontFamily:"'Georgia','Noto Serif SC',serif" }}>
      <div style={{ width:390, height:844, background:"#111008", borderRadius:44, boxShadow:"0 40px 120px rgba(0,0,0,0.8), 0 0 0 1px rgba(201,168,76,0.12)", overflow:"hidden", position:"relative", display:"flex", flexDirection:"column" }}>

        {/* Status */}
        <div style={{ height:44, background:"#0A0A08", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 28px" }}>
          <span style={{ color:"#555", fontSize:12 }}>{new Date().toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})}</span>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {saving && <span style={{ color:user.color, fontSize:10, fontFamily:"monospace" }}>保存中…</span>}
            <button onClick={logout} style={{ background:"none", border:"none", color:"#444", fontSize:11, cursor:"pointer", fontFamily:"monospace" }}>退出</button>
          </div>
        </div>

        {/* Header */}
        <div style={{ padding:"14px 22px 10px", background:"linear-gradient(180deg,#0A0A08 0%,transparent 100%)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <button onClick={()=>setShowMon(true)} style={{ background:"none", border:"none", cursor:"pointer", padding:0, textAlign:"left" }}>
              <div style={{ color:"#555", fontSize:11, letterSpacing:1.5, fontFamily:"monospace" }}>{monthLabel} <span style={{ color:user.color }}>▾</span></div>
            </button>
            <div style={{ color:user.color, fontSize:20, fontWeight:700, marginTop:2 }}>{user.name}的账单</div>
          </div>
          <div style={{ display:"flex", background:"#1C1A14", borderRadius:24, padding:3, gap:2, border:"1px solid rgba(201,168,76,0.1)" }}>
            {Object.entries(USERS).map(([key, u]) => (
              <button key={key} onClick={() => { setUserId(key); localStorage.setItem("ledger_user_id", key); }} style={{ padding:"6px 13px", borderRadius:20, border:"none", background:userId===key?u.color:"transparent", color:userId===key?"#000":"#555", fontSize:13, fontWeight:600, cursor:"pointer" }}>
                {u.avatar} {u.name}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:"auto", paddingBottom:84 }}>
          {loading
            ? <div style={{ display:"flex", justifyContent:"center", alignItems:"center", height:200, color:user.color, fontFamily:"monospace", fontSize:13 }}>加载中…</div>
            : <>
              {/* HOME */}
              {tab==="home" && <>
                <div style={{ margin:"8px 20px 0", background:"linear-gradient(135deg,#1C1A10,#241E0A)", borderRadius:24, padding:"22px 26px", border:`1px solid ${user.color}28`, position:"relative", overflow:"hidden" }}>
                  <div style={{ position:"absolute", top:-30, right:-30, width:110, height:110, borderRadius:"50%", background:`${user.color}08` }} />
                  <div style={{ color:"#555", fontSize:11, letterSpacing:1.5, fontFamily:"monospace" }}>本月结余</div>
                  <div style={{ color:balance>=0?user.color:"#E05C5C", fontSize:36, fontWeight:700, margin:"6px 0 4px", letterSpacing:-1 }}>¥ {fmt(balance)}</div>
                  <div style={{ display:"flex", gap:22, marginTop:10 }}>
                    <div><div style={{ color:"#3D9970", fontSize:10 }}>▲ 收入</div><div style={{ color:"#C8F0C8", fontSize:15, fontWeight:600 }}>¥{fmt(totalIncome)}</div></div>
                    <div style={{ width:1, background:"#2A2520" }} />
                    <div><div style={{ color:"#E05C5C", fontSize:10 }}>▼ 支出</div><div style={{ color:"#F4BBBB", fontSize:15, fontWeight:600 }}>¥{fmt(totalExpense)}</div></div>
                  </div>
                </div>

                {expByCategory.length > 0 && (
                  <div style={{ margin:"14px 20px 0", background:"#161410", borderRadius:20, padding:"15px 18px", border:"1px solid #1A1810" }}>
                    <div style={{ color:"#555", fontSize:11, letterSpacing:1, marginBottom:10, fontFamily:"monospace" }}>支出分布</div>
                    <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                      <PieChart width={90} height={90}>
                        <Pie data={expByCategory} cx={42} cy={42} innerRadius={24} outerRadius={42} paddingAngle={3} dataKey="value">
                          {expByCategory.map((_,i) => <Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]} />)}
                        </Pie>
                      </PieChart>
                      <div style={{ flex:1, display:"flex", flexDirection:"column", gap:5 }}>
                        {expByCategory.map((c,i) => (
                          <div key={i} style={{ display:"flex", justifyContent:"space-between" }}>
                            <span style={{ display:"flex", alignItems:"center", gap:5 }}>
                              <span style={{ display:"inline-block", width:7, height:7, borderRadius:2, background:PIE_COLORS[i%PIE_COLORS.length] }} />
                              <span style={{ color:"#999", fontSize:12 }}>{c.icon} {c.name}</span>
                            </span>
                            <span style={{ color:"#DDD", fontSize:12, fontWeight:600 }}>¥{fmt(c.value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ margin:"14px 20px 0" }}>
                  <div style={{ color:"#555", fontSize:11, letterSpacing:1.5, marginBottom:10, fontFamily:"monospace" }}>最近记录</div>
                  {records.length===0 && <div style={{ color:"#3A3730", fontSize:13, textAlign:"center", padding:"30px 0", fontFamily:"monospace" }}>本月还没有记录<br/>点 + 开始记账</div>}
                  {records.slice(0,5).map(r => <RecordCard key={r.id} r={r} deletable={false} />)}
                </div>
              </>}

              {/* RECORDS */}
              {tab==="records" && (
                <div style={{ padding:"8px 20px" }}>
                  <div style={{ color:"#555", fontSize:11, letterSpacing:1.5, marginBottom:12, fontFamily:"monospace" }}>全部记录 ({records.length})</div>
                  {records.length===0 && <div style={{ color:"#3A3730", fontSize:13, textAlign:"center", padding:"40px 0", fontFamily:"monospace" }}>本月暂无记录</div>}
                  {records.map(r => <RecordCard key={r.id} r={r} deletable={true} />)}
                </div>
              )}

              {/* CHART */}
              {tab==="chart" && (
                <div style={{ padding:"8px 20px" }}>
                  <div style={{ display:"flex", gap:8, marginBottom:14 }}>
                    {["pie","bar"].map(t => (
                      <button key={t} onClick={() => setChartT(t)} style={{ flex:1, padding:9, borderRadius:12, border:"none", background:chartT===t?user.color:"#1C1A14", color:chartT===t?"#000":"#777", fontWeight:600, fontSize:13, cursor:"pointer" }}>
                        {t==="pie"?"🥧 分类占比":"📊 日趋势"}
                      </button>
                    ))}
                  </div>
                  {chartT==="pie" && (
                    <div style={{ background:"#161410", borderRadius:20, padding:18, border:"1px solid #1A1810" }}>
                      <div style={{ color:"#555", fontSize:11, letterSpacing:1, marginBottom:12, fontFamily:"monospace" }}>本月支出分类</div>
                      {expByCategory.length===0
                        ? <div style={{ color:"#3A3730", fontSize:13, textAlign:"center", padding:"30px 0", fontFamily:"monospace" }}>暂无支出数据</div>
                        : <>
                          <PieChart width={310} height={185}>
                            <Pie data={expByCategory} cx={155} cy={88} innerRadius={46} outerRadius={84} paddingAngle={4} dataKey="value" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={{stroke:"#444"}}>
                              {expByCategory.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]} />)}
                            </Pie>
                            <Tooltip formatter={v=>`¥${fmt(v)}`} contentStyle={{ background:"#1C1A10", border:"1px solid #2A2520", borderRadius:8, color:"#CCC", fontSize:12 }} />
                          </PieChart>
                          {expByCategory.map((c,i) => (
                            <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid #1A1810" }}>
                              <span style={{ display:"flex", alignItems:"center", gap:7 }}>
                                <span style={{ display:"inline-block", width:9, height:9, borderRadius:3, background:PIE_COLORS[i%PIE_COLORS.length] }} />
                                <span style={{ color:"#AAA", fontSize:13 }}>{c.icon} {c.name}</span>
                              </span>
                              <span style={{ color:"#EEE", fontWeight:600, fontSize:13 }}>¥{fmt(c.value)}</span>
                            </div>
                          ))}
                        </>
                      }
                    </div>
                  )}
                  {chartT==="bar" && (
                    <div style={{ background:"#161410", borderRadius:20, padding:18, border:"1px solid #1A1810" }}>
                      <div style={{ color:"#555", fontSize:11, letterSpacing:1, marginBottom:12, fontFamily:"monospace" }}>每日支出趋势</div>
                      {barData.length===0
                        ? <div style={{ color:"#3A3730", fontSize:13, textAlign:"center", padding:"30px 0", fontFamily:"monospace" }}>暂无数据</div>
                        : <ResponsiveContainer width="100%" height={185}>
                            <BarChart data={barData} margin={{top:4,right:4,left:-26,bottom:0}}>
                              <XAxis dataKey="date" stroke="#333" tick={{fill:"#555",fontSize:10}} />
                              <YAxis stroke="#333" tick={{fill:"#555",fontSize:10}} />
                              <Tooltip formatter={v=>`¥${fmt(v)}`} contentStyle={{ background:"#1C1A10", border:"1px solid #2A2520", borderRadius:8, color:"#CCC", fontSize:12 }} />
                              <Bar dataKey="amt" fill={user.color} radius={[4,4,0,0]} />
                            </BarChart>
                          </ResponsiveContainer>
                      }
                    </div>
                  )}
                  <div style={{ marginTop:14, background:"#161410", borderRadius:20, padding:18, border:"1px solid #1A1810" }}>
                    <div style={{ color:"#555", fontSize:11, letterSpacing:1, marginBottom:12, fontFamily:"monospace" }}>收支总览</div>
                    {[{label:"总收入",value:totalIncome,color:"#3D9970"},{label:"总支出",value:totalExpense,color:"#E05C5C"},{label:"净结余",value:balance,color:user.color}].map(item=>(
                      <div key={item.label} style={{ display:"flex", justifyContent:"space-between", padding:"10px 0", borderBottom:"1px solid #1A1810" }}>
                        <span style={{ color:"#888", fontSize:13 }}>{item.label}</span>
                        <span style={{ color:item.color, fontWeight:700, fontSize:14 }}>¥{fmt(item.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          }
        </div>

        {/* Bottom nav */}
        <div style={{ position:"absolute", bottom:0, left:0, right:0, background:"rgba(8,8,6,0.96)", backdropFilter:"blur(20px)", borderTop:"1px solid #1A1810", display:"flex", justifyContent:"space-around", padding:"10px 0 22px" }}>
          {[{id:"home",icon:"⊞",label:"总览"},{id:"records",icon:"☰",label:"明细"},{id:"add",icon:"+",label:"记账",special:true},{id:"chart",icon:"◉",label:"图表"}].map(item =>
            item.special
              ? <button key="add" onClick={() => setShowAdd(true)} style={{ width:52, height:52, borderRadius:26, background:`linear-gradient(135deg,${user.color},${user.color}AA)`, border:"none", color:"#000", fontSize:26, fontWeight:700, cursor:"pointer", marginTop:-14, boxShadow:`0 8px 24px ${user.color}55`, display:"flex", alignItems:"center", justifyContent:"center" }}>+</button>
              : <button key={item.id} onClick={() => setTab(item.id)} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:3, padding:"0 14px" }}>
                  <span style={{ fontSize:19, opacity:tab===item.id?1:0.25 }}>{item.icon}</span>
                  <span style={{ fontSize:10, color:tab===item.id?user.color:"#888", fontFamily:"monospace" }}>{item.label}</span>
                </button>
          )}
        </div>

        {/* Month picker */}
        {showMon && (
          <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.88)", display:"flex", alignItems:"flex-end", zIndex:200 }} onClick={() => setShowMon(false)}>
            <div onClick={e=>e.stopPropagation()} style={{ width:"100%", background:"#161410", borderRadius:"26px 26px 0 0", border:"1px solid #2A2520", padding:"20px 22px 36px" }}>
              <div style={{ width:32, height:4, background:"#2A2520", borderRadius:2, margin:"0 auto 16px" }} />
              <div style={{ color:user.color, fontSize:16, fontWeight:700, marginBottom:14, fontFamily:"monospace" }}>选择月份</div>
              {MONTHS.map(ym => {
                const [y,m] = ym.split("-");
                return (
                  <button key={ym} onClick={() => { setMonth(ym); setShowMon(false); }} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", width:"100%", padding:"12px 16px", borderRadius:14, border:`1px solid ${month===ym?user.color+"60":"#1E1C16"}`, background:month===ym?`${user.color}15`:"#0D0D0A", marginBottom:7, cursor:"pointer" }}>
                    <span style={{ color:month===ym?user.color:"#AAA", fontSize:14, fontWeight:month===ym?700:400 }}>{y}年{parseInt(m)}月</span>
                    <span style={{ color:month===ym?user.color:"#555", fontSize:12 }}>{ym===THIS_MONTH?"本月":""}{month===ym?" ✓":""}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Add modal */}
        {showAdd && (
          <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.88)", display:"flex", alignItems:"flex-end", zIndex:100 }} onClick={() => setShowAdd(false)}>
            <div onClick={e=>e.stopPropagation()} style={{ width:"100%", background:"#161410", borderRadius:"26px 26px 0 0", border:"1px solid #2A2520", padding:"20px 22px 40px" }}>
              <div style={{ width:32, height:4, background:"#2A2520", borderRadius:2, margin:"0 auto 16px" }} />
              <div style={{ color:user.color, fontSize:17, fontWeight:700, marginBottom:16, fontFamily:"monospace" }}>+ 快速记账</div>
              <div style={{ display:"flex", background:"#0D0D0A", borderRadius:14, padding:3, marginBottom:14, gap:3 }}>
                {["expense","income"].map(t => (
                  <button key={t} onClick={() => setForm(f=>({...f,type:t,category:CATEGORIES[t][0].id}))} style={{ flex:1, padding:10, borderRadius:11, border:"none", background:form.type===t?(t==="expense"?"#2A1A1A":"#1A2E1A"):"transparent", color:form.type===t?(t==="expense"?"#E05C5C":"#3D9970"):"#444", fontWeight:600, fontSize:14, cursor:"pointer" }}>
                    {t==="expense"?"▼ 支出":"▲ 收入"}
                  </button>
                ))}
              </div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:7, marginBottom:14 }}>
                {cats.map(c => (
                  <button key={c.id} onClick={() => setForm(f=>({...f,category:c.id}))} style={{ padding:"7px 13px", borderRadius:11, border:`1px solid ${form.category===c.id?user.color:"#1E1C16"}`, background:form.category===c.id?`${user.color}20`:"#0D0D0A", color:form.category===c.id?user.color:"#777", fontSize:13, cursor:"pointer" }}>
                    {c.icon} {c.label}
                  </button>
                ))}
              </div>
              <div style={{ position:"relative", marginBottom:10 }}>
                <span style={{ position:"absolute", left:16, top:"50%", transform:"translateY(-50%)", color:user.color, fontSize:20, fontWeight:700 }}>¥</span>
                <input type="number" placeholder="0.00" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} style={{ width:"100%", background:"#0D0D0A", border:`1px solid ${user.color}40`, borderRadius:15, padding:"14px 14px 14px 40px", color:"#EEE", fontSize:22, fontWeight:700, outline:"none", boxSizing:"border-box" }} />
              </div>
              <input type="text" placeholder="备注（可选）" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} style={{ width:"100%", background:"#0D0D0A", border:"1px solid #1E1C16", borderRadius:13, padding:"11px 15px", color:"#CCC", fontSize:14, outline:"none", marginBottom:14, boxSizing:"border-box" }} />
              <button onClick={handleAdd} disabled={saving} style={{ width:"100%", padding:14, borderRadius:17, border:"none", background:saving?"#2A2520":`linear-gradient(135deg,${user.color},${user.color}BB)`, color:saving?"#555":"#000", fontSize:15, fontWeight:700, cursor:saving?"default":"pointer" }}>
                {saving?"保存中…":"确认记账"}
              </button>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div style={{ position:"absolute", top:60, left:"50%", transform:"translateX(-50%)", background:"#1C1A10", border:`1px solid ${user.color}50`, borderRadius:20, padding:"9px 20px", color:user.color, fontSize:13, fontFamily:"monospace", zIndex:300, whiteSpace:"nowrap", boxShadow:"0 8px 24px rgba(0,0,0,0.6)" }}>
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}