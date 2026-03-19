import { useState, useEffect, useMemo, useCallback } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const THEMES = {
  me: {
    name: "我", avatar: "🧑",
    primary:"#6366f1", secondary:"#2dd4bf",
    grad:"linear-gradient(135deg,#6366f1,#2dd4bf)",
    gradText:"linear-gradient(135deg,#a5b4fc,#5eead4)",
    cardBg:"linear-gradient(145deg,rgba(99,102,241,0.13),rgba(20,184,166,0.06))",
    cardBorder:"rgba(99,102,241,0.22)",
    glow1:"rgba(99,102,241,0.16)", glow2:"rgba(20,184,166,0.10)",
    fabShadow:"rgba(99,102,241,0.55)",
    numGrad:"linear-gradient(135deg,#e0e7ff 30%,#a5f3fc 100%)",
    navActive:"linear-gradient(135deg,#818cf8,#22d3ee)",
    navBar:"linear-gradient(90deg,#6366f1,#22d3ee)",
    accent:"#818cf8", toastBorder:"rgba(99,102,241,0.4)",
  },
  gf: {
    name: "她", avatar: "👩",
    primary:"#ec4899", secondary:"#fb923c",
    grad:"linear-gradient(135deg,#ec4899,#fb923c)",
    gradText:"linear-gradient(135deg,#f9a8d4,#fdba74)",
    cardBg:"linear-gradient(145deg,rgba(244,114,182,0.13),rgba(251,146,60,0.07))",
    cardBorder:"rgba(244,114,182,0.28)",
    glow1:"rgba(244,114,182,0.18)", glow2:"rgba(251,146,60,0.12)",
    fabShadow:"rgba(236,72,153,0.55)",
    numGrad:"linear-gradient(135deg,#fce7f3 30%,#fed7aa 100%)",
    navActive:"linear-gradient(135deg,#f472b6,#fb923c)",
    navBar:"linear-gradient(90deg,#ec4899,#fb923c)",
    accent:"#f472b6", toastBorder:"rgba(236,72,153,0.4)",
  },
};

const CATEGORIES = {
  expense: [
    { id:"food",          label:"餐饮", icon:"🍜" },
    { id:"shop",          label:"购物", icon:"🛍️" },
    { id:"transport",     label:"交通", icon:"🚇" },
    { id:"health",        label:"医疗", icon:"💊" },
    { id:"entertainment", label:"娱乐", icon:"🎮" },
    { id:"other",         label:"其他", icon:"📦" },
  ],
  income: [
    { id:"salary", label:"工资",   icon:"💼" },
    { id:"bonus",  label:"奖金",   icon:"🎁" },
    { id:"invest", label:"投资",   icon:"📈" },
    { id:"other",  label:"其他",   icon:"💰" },
    { id:"living", label:"生活费", icon:"🏠" },
  ],
};

const PIE_COLORS_ME = ["#6366f1","#f87171","#2dd4bf","#a78bfa","#fbbf24","#34d399"];
const PIE_COLORS_GF = ["#ec4899","#fb923c","#f472b6","#fbbf24","#f43f5e","#fb7185"];
const ALL_CATS = [...CATEGORIES.expense, ...CATEGORIES.income];
const FONT = "'Outfit', 'PingFang SC', 'Noto Sans SC', sans-serif";

function fmt(n) { return Number(n).toLocaleString("zh-CN",{minimumFractionDigits:2}); }

function getMonthList() {
  const now = new Date();
  return Array.from({length:6},(_,i) => {
    const d = new Date(now.getFullYear(),now.getMonth()-i,1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  });
}
const MONTHS = getMonthList();
const THIS_MONTH = MONTHS[0];

async function apiFetch(path, token, opts={}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type":"application/json", ...(token?{Authorization:`Bearer ${token}`}:{}), ...opts.headers },
  });
  if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.detail||"请求失败"); }
  return res.json();
}

function GradText({ grad, children, style={} }) {
  return <span style={{ background:grad, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text", color:"#fff", ...style }}>{children}</span>;
}
function LoginScreen({ onLogin }) {
  const [userId, setUserId]     = useState("me");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const theme = THEMES[userId];

  async function handleLogin() {
    setLoading(true); setError("");
    try {
      const form = new URLSearchParams({ username: userId, password });
      const data = await fetch(`${API}/login`, { method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded"}, body:form });
      if (!data.ok) throw new Error("密码错误");
      const json = await data.json();
      localStorage.setItem("ledger_token", json.access_token);
      localStorage.setItem("ledger_user_id", userId);
      onLogin(json.access_token, userId);
    } catch(e) { setError(e.message); } finally { setLoading(false); }
  }

  return (
    <div style={{ minHeight:"100vh", fontFamily:FONT, background:"#07070f", display:"flex", justifyContent:"center", alignItems:"center" }}>
      <div style={{ position:"fixed", inset:0, pointerEvents:"none",
        background:`radial-gradient(ellipse 500px 400px at 80% 20%,${theme.glow1} 0%,transparent 65%),radial-gradient(ellipse 400px 350px at 10% 80%,${theme.glow2} 0%,transparent 65%)`,
        transition:"background 0.5s" }} />
      <div style={{ width:340, position:"relative", zIndex:1,
        background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)",
        borderRadius:32, padding:"40px 28px 44px",
        boxShadow:"0 32px 80px rgba(0,0,0,0.7),inset 0 1px 0 rgba(255,255,255,0.06)" }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ width:68, height:68, borderRadius:22, background:theme.cardBg,
            border:`1px solid ${theme.cardBorder}`, display:"flex", alignItems:"center",
            justifyContent:"center", fontSize:30, margin:"0 auto 16px",
            boxShadow:`0 8px 32px ${theme.fabShadow}40`, transition:"all 0.4s" }}>💰</div>
          <div style={{ fontSize:26, fontWeight:800, color:"#fff", marginBottom:4 }}>
            <span key={userId} style={{background:theme.gradText,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",display:"inline-block"}}>账本</span>
          </div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.22)", letterSpacing:3, textTransform:"uppercase" }}>couple ledger</div>
        </div>
        <div style={{ display:"flex", background:"rgba(0,0,0,0.3)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:22, padding:3, marginBottom:20, gap:2 }}>
          {Object.entries(THEMES).map(([key,t]) => (
            <button key={key} onClick={() => setUserId(key)} style={{ flex:1, padding:"10px 0", borderRadius:18, border:"none",
              background:userId===key?t.grad:"transparent",
              color:userId===key?"#fff":"rgba(255,255,255,0.3)",
              fontWeight:600, fontSize:14, cursor:"pointer", fontFamily:FONT, transition:"all 0.25s" }}>
              {t.avatar} {t.name}
            </button>
          ))}
        </div>
        <input type="password" placeholder="输入密码" value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key==="Enter" && handleLogin()}
          style={{ width:"100%", background:"rgba(255,255,255,0.04)", border:`1px solid ${theme.cardBorder}`,
            borderRadius:14, padding:"14px 16px", color:"#fff", fontSize:15, outline:"none",
            marginBottom:10, boxSizing:"border-box", fontFamily:FONT }} />
        {error && <div style={{ color:"#f87171", fontSize:12, marginBottom:10 }}>✕ {error}</div>}
        <button onClick={handleLogin} disabled={loading||!password} style={{ width:"100%", padding:14, borderRadius:16, border:"none",
          background:loading||!password?"rgba(255,255,255,0.06)":theme.grad,
          color:loading||!password?"rgba(255,255,255,0.25)":"#fff",
          fontWeight:700, fontSize:15, cursor:loading||!password?"default":"pointer",
          fontFamily:FONT, transition:"all 0.25s",
          boxShadow:loading||!password?"none":`0 6px 24px ${theme.fabShadow}60` }}>
          {loading ? "登录中…" : "登 录"}
        </button>
      </div>
    </div>
  );
}
export default function App() {
  const [token,   setToken]   = useState(() => localStorage.getItem("ledger_token")||null);
  const [ownerId, setOwnerId] = useState(() => localStorage.getItem("ledger_user_id")||"me");
  const [userId,  setUserId]  = useState(() => localStorage.getItem("ledger_user_id")||"me");
  const [month,   setMonth]   = useState(THIS_MONTH);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [tab,     setTab]     = useState("home");
  const [showAdd, setShowAdd] = useState(false);
  const [showMon, setShowMon] = useState(false);
  const [form,    setForm]    = useState({ type:"expense", category:"food", amount:"", note:"" });
  const [chartT,  setChartT]  = useState("pie");
  const [toast,   setToast]   = useState(null);

  const theme = THEMES[userId];
  const PIE_COLORS = userId==="me" ? PIE_COLORS_ME : PIE_COLORS_GF;

  function logout() { localStorage.removeItem("ledger_token"); localStorage.removeItem("ledger_user_id"); setToken(null); setOwnerId("me"); setUserId("me"); }
  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(null),2200); }

  const loadRecords = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const viewAs = userId !== ownerId ? `&view_as=${userId}` : "";
      const data = await apiFetch(`/records?month=${month}${viewAs}`, token);
      setRecords(data);
    }
    catch(e) { if(e.message.includes("401")) logout(); showToast("加载失败"); }
    finally { setLoading(false); }
  }, [token, month, userId, ownerId]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  async function handleAdd() {
    if (!form.amount||isNaN(+form.amount)||+form.amount<=0) return;
    setSaving(true);
    try {
      const r = await apiFetch("/records",token,{ method:"POST", body:JSON.stringify({
        type:form.type, category:form.category, amount:+form.amount,
        note:form.note||(form.type==="expense"?"支出":"收入"),
        date:new Date().toISOString().slice(0,10), month,
      })});
      setRecords(prev=>[r,...prev]);
      setForm({type:"expense",category:"food",amount:"",note:""});
      setShowAdd(false); showToast("✓ 记账成功");
    } catch { showToast("保存失败，请重试"); } finally { setSaving(false); }
  }

  async function handleDelete(id) {
    try {
      await apiFetch(`/records/${id}`,token,{method:"DELETE"});
      setRecords(prev=>prev.filter(r=>r.id!==id));
      showToast("已删除");
    } catch { showToast("删除失败"); }
  }

  const totalIncome  = useMemo(()=>records.filter(r=>r.type==="income").reduce((s,r)=>s+r.amount,0),[records]);
  const totalExpense = useMemo(()=>records.filter(r=>r.type==="expense").reduce((s,r)=>s+r.amount,0),[records]);
  const balance = totalIncome - totalExpense;

  const expByCategory = useMemo(()=> {
    const map={};
    records.filter(r=>r.type==="expense").forEach(r=>{ map[r.category]=(map[r.category]||0)+r.amount; });
    return Object.entries(map).map(([id,value])=>({
      name:CATEGORIES.expense.find(c=>c.id===id)?.label||id,
      icon:CATEGORIES.expense.find(c=>c.id===id)?.icon||"📦", value,
    }));
  },[records]);

  const barData = useMemo(()=> {
    const days={};
    records.filter(r=>r.type==="expense").forEach(r=>{ const d=r.date.slice(8); days[d]=(days[d]||0)+r.amount; });
    return Object.entries(days).sort().map(([d,amt])=>({date:d+"日",amt}));
  },[records]);

  const cats = CATEGORIES[form.type];
  const [yy,mm] = month.split("-");
  const monthLabel = `${yy}年${parseInt(mm)}月`;

  if (!token) return <LoginScreen onLogin={(tok,uid)=>{setToken(tok);setOwnerId(uid);setUserId(uid);}} />;

  function RecordCard({r, deletable}) {
    const cat = ALL_CATS.find(c=>c.id===r.category);
    const isInc = r.type==="income";
    return (
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 12px",
        background:"rgba(255,255,255,0.025)",border:"1px solid rgba(255,255,255,0.055)",
        borderRadius:16,marginBottom:6}}>
        <div style={{width:38,height:38,borderRadius:12,fontSize:16,flexShrink:0,
          display:"flex",alignItems:"center",justifyContent:"center",
          background:isInc?"rgba(20,184,166,0.12)":"rgba(239,68,68,0.12)"}}>{cat?.icon||"📦"}</div>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:500,color:"rgba(255,255,255,0.85)"}}>{r.note}</div>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.25)",marginTop:2}}>{r.date} · {cat?.label}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{fontSize:14,fontWeight:700,color:isInc?"#2dd4bf":"#f87171"}}>
            {isInc?"+":"-"}¥{fmt(r.amount)}
          </div>
          {deletable&&<button onClick={()=>handleDelete(r.id)}
            style={{background:"none",border:"none",color:"rgba(255,255,255,0.25)",fontSize:15,cursor:"pointer",padding:"0 2px"}}>✕</button>}
        </div>
      </div>
    );
  }

  const ttStyle = {background:"#111126",border:"1px solid rgba(255,255,255,0.08)",borderRadius:10,color:"#ccc",fontSize:12};
  return (
    <div style={{minHeight:"100vh",fontFamily:FONT,background:"#07070f",display:"flex",justifyContent:"center",alignItems:"flex-start"}}>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,
        background:`radial-gradient(ellipse 500px 400px at 85% 0%,${theme.glow1} 0%,transparent 65%),radial-gradient(ellipse 400px 350px at 0% 70%,${theme.glow2} 0%,transparent 65%)`,
        transition:"background 0.5s"}} />
      <div style={{width:"100%",maxWidth:430,height:"100dvh",background:"rgba(13,13,26,0.95)",
        boxShadow:"0 0 0 1px rgba(255,255,255,0.05),0 40px 120px rgba(0,0,0,0.8)",
        overflow:"hidden",position:"relative",display:"flex",flexDirection:"column",zIndex:1}}>

        {/* 状态栏 */}
        <div style={{height:44,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 24px",background:"rgba(0,0,0,0.3)"}}>
          <span style={{fontSize:13,fontWeight:600,color:"rgba(255,255,255,0.7)"}}>
            {new Date().toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})}
          </span>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {saving&&<span style={{fontSize:11,color:theme.accent}}>保存中…</span>}
            <button onClick={logout} style={{background:"none",border:"none",color:"rgba(255,255,255,0.28)",fontSize:11,cursor:"pointer",fontFamily:FONT}}>退出</button>
          </div>
        </div>

        {/* 头部 */}
        <div style={{padding:"8px 20px 10px",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <button onClick={()=>setShowMon(true)} style={{background:"none",border:"none",cursor:"pointer",padding:0}}>
              <div style={{fontSize:10,fontWeight:600,color:theme.accent,letterSpacing:2,textTransform:"uppercase"}}>{monthLabel} ▾</div>
            </button>
            <div style={{fontSize:22,fontWeight:800,color:"#fff",marginTop:3,letterSpacing:-0.5}}>
              {theme.name}的<span key={userId} style={{background:theme.gradText,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",display:"inline-block"}}>账单</span>
            </div>
          </div>
          <div style={{display:"flex",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:22,padding:3,gap:2}}>
            {Object.entries(THEMES).map(([key,t])=>(
              <button key={key} onClick={()=>setUserId(key)} style={{
                padding:"5px 12px",borderRadius:18,border:"none",
                background:userId===key?t.grad:"transparent",
                color:userId===key?"#fff":"rgba(255,255,255,0.28)",
                fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:FONT,transition:"all 0.25s"}}>
                {t.avatar} {t.name}
              </button>
            ))}
          </div>
        </div>

        {/* 内容区 */}
        <div style={{flex:1,overflowY:"auto",paddingBottom:88}}>
          {loading ? (
            <div style={{display:"flex",justifyContent:"center",alignItems:"center",height:200}}>
              <GradText grad={theme.grad} style={{fontSize:13}}>加载中…</GradText>
            </div>
          ) : (<>
            {/* 主页 */}
            {tab==="home"&&(<>
              <div style={{margin:"8px 16px 0",background:theme.cardBg,border:`1px solid ${theme.cardBorder}`,
                borderRadius:26,padding:"20px 22px 18px",position:"relative",overflow:"hidden",transition:"all 0.4s"}}>
                <div style={{position:"absolute",top:-50,right:-50,width:170,height:170,borderRadius:"50%",pointerEvents:"none",
                  background:`radial-gradient(circle,${theme.glow1} 0%,transparent 65%)`}} />
                <div style={{position:"absolute",bottom:-40,left:5,width:130,height:130,borderRadius:"50%",pointerEvents:"none",
                  background:`radial-gradient(circle,${theme.glow2} 0%,transparent 65%)`}} />
                <div style={{fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.32)",letterSpacing:2.5,textTransform:"uppercase"}}>本月结余</div>
                <div style={{fontSize:44,fontWeight:800,letterSpacing:-2,margin:"6px 0 2px",lineHeight:1,
                  background: balance >= 0 ? theme.numGrad : "linear-gradient(135deg,#fca5a5,#f87171)",
                  WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>¥ {fmt(balance)}</div>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.2)",marginBottom:14}}>{balance>=0?"收支平衡":"本月超支"}</div>
                <div style={{display:"flex",background:"rgba(0,0,0,0.22)",borderRadius:14,overflow:"hidden",border:"1px solid rgba(255,255,255,0.05)"}}>
                  {[{label:"收入",val:totalIncome,icon:"▲",col:"#2dd4bf",bg:"rgba(20,184,166,0.18)"},
                    {label:"支出",val:totalExpense,icon:"▼",col:"#f87171",bg:"rgba(239,68,68,0.18)"}]
                  .map((item,i)=>(
                    <div key={i} style={{flex:1,padding:"10px 13px",display:"flex",alignItems:"center",gap:8,
                      borderLeft:i>0?"1px solid rgba(255,255,255,0.05)":"none"}}>
                      <div style={{width:28,height:28,borderRadius:9,background:item.bg,
                        display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0}}>{item.icon}</div>
                      <div>
                        <div style={{fontSize:10,color:"rgba(255,255,255,0.28)",letterSpacing:1}}>{item.label}</div>
                        <div style={{fontSize:14,fontWeight:700,color:item.col,marginTop:1}}>¥{fmt(item.val)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {expByCategory.length>0&&(
                <div style={{margin:"10px 16px 0",background:"rgba(255,255,255,0.025)",
                  border:"1px solid rgba(255,255,255,0.06)",borderRadius:20,padding:"14px 16px"}}>
                  <div style={{fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.3)",letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>支出分布</div>
                  <div style={{display:"flex",alignItems:"center",gap:14}}>
                    <PieChart width={80} height={80}>
                      <Pie data={expByCategory} cx={38} cy={38} innerRadius={22} outerRadius={38} paddingAngle={3} dataKey="value">
                        {expByCategory.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                      </Pie>
                    </PieChart>
                    <div style={{flex:1,display:"flex",flexDirection:"column",gap:6}}>
                      {expByCategory.map((c,i)=>(
                        <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <span style={{display:"flex",alignItems:"center",gap:6}}>
                            <span style={{width:7,height:7,borderRadius:3,background:PIE_COLORS[i%PIE_COLORS.length],display:"inline-block",flexShrink:0}}/>
                            <span style={{fontSize:11,color:"rgba(255,255,255,0.5)"}}>{c.icon} {c.name}</span>
                          </span>
                          <span style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,0.82)"}}>¥{fmt(c.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div style={{padding:"10px 16px 0"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <span style={{fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.3)",letterSpacing:2,textTransform:"uppercase"}}>最近记录</span>
                  <span style={{fontSize:11,fontWeight:600,color:theme.accent,cursor:"pointer"}} onClick={()=>setTab("records")}>查看全部</span>
                </div>
                {records.length===0&&<div style={{color:"rgba(255,255,255,0.15)",fontSize:13,textAlign:"center",padding:"30px 0"}}>本月还没有记录<br/>点 + 开始记账</div>}
                {records.slice(0,5).map(r=><RecordCard key={r.id} r={r} deletable={false}/>)}
              </div>
            </>)}

            {/* 明细 */}
            {tab==="records"&&(
              <div style={{padding:"8px 16px"}}>
                <div style={{fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.3)",letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>全部记录 ({records.length})</div>
                {records.length===0&&<div style={{color:"rgba(255,255,255,0.15)",fontSize:13,textAlign:"center",padding:"40px 0"}}>本月暂无记录</div>}
                {records.map(r=><RecordCard key={r.id} r={r} deletable={userId===ownerId}/>)}
              </div>
            )}
            {/* 图表 */}
            {tab==="chart"&&(
              <div style={{padding:"8px 16px"}}>
                <div style={{display:"flex",gap:8,marginBottom:14}}>
                  {[["pie","🥧 分类占比"],["bar","📊 日趋势"]].map(([t,lbl])=>(
                    <button key={t} onClick={()=>setChartT(t)} style={{flex:1,padding:9,borderRadius:14,border:"none",
                      background:chartT===t?theme.grad:"rgba(255,255,255,0.04)",
                      color:chartT===t?"#fff":"rgba(255,255,255,0.4)",
                      fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:FONT,
                      boxShadow:chartT===t?`0 4px 16px ${theme.fabShadow}50`:"none",transition:"all 0.2s"}}>{lbl}</button>
                  ))}
                </div>
                {chartT==="pie"&&(
                  <div style={{background:"rgba(255,255,255,0.025)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:20,padding:18}}>
                    <div style={{fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.3)",letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>本月支出分类</div>
                    {expByCategory.length===0
                      ? <div style={{color:"rgba(255,255,255,0.15)",fontSize:13,textAlign:"center",padding:"30px 0"}}>暂无支出数据</div>
                      : <>
                        <PieChart width={310} height={180}>
                          <Pie data={expByCategory} cx={155} cy={86} innerRadius={44} outerRadius={82}
                            paddingAngle={4} dataKey="value"
                            label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`}
                            labelLine={{stroke:"rgba(255,255,255,0.2)"}}  >
                            {expByCategory.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                          </Pie>
                          <Tooltip formatter={v=>`¥${fmt(v)}`} contentStyle={ttStyle}/>
                        </PieChart>
                        {expByCategory.map((c,i)=>(
                          <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                            <span style={{display:"flex",alignItems:"center",gap:7}}>
                              <span style={{width:8,height:8,borderRadius:3,background:PIE_COLORS[i%PIE_COLORS.length],display:"inline-block"}}/>
                              <span style={{fontSize:13,color:"rgba(255,255,255,0.55)"}}>{c.icon} {c.name}</span>
                            </span>
                            <span style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,0.85)"}}>¥{fmt(c.value)}</span>
                          </div>
                        ))}
                      </>
                    }
                  </div>
                )}
                {chartT==="bar"&&(
                  <div style={{background:"rgba(255,255,255,0.025)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:20,padding:18}}>
                    <div style={{fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.3)",letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>每日支出趋势</div>
                    {barData.length===0
                      ? <div style={{color:"rgba(255,255,255,0.15)",fontSize:13,textAlign:"center",padding:"30px 0"}}>暂无数据</div>
                      : <ResponsiveContainer width="100%" height={185}>
                          <BarChart data={barData} margin={{top:4,right:4,left:-26,bottom:0}}>
                            <XAxis dataKey="date" stroke="rgba(255,255,255,0.1)" tick={{fill:"rgba(255,255,255,0.35)",fontSize:10}}/>
                            <YAxis stroke="rgba(255,255,255,0.1)" tick={{fill:"rgba(255,255,255,0.35)",fontSize:10}}/>
                            <Tooltip formatter={v=>`¥${fmt(v)}`} contentStyle={ttStyle}/>
                            <Bar dataKey="amt" fill={theme.primary} radius={[6,6,0,0]}/>
                          </BarChart>
                        </ResponsiveContainer>
                    }
                  </div>
                )}
                <div style={{marginTop:12,background:"rgba(255,255,255,0.025)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:20,padding:18}}>
                  <div style={{fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.3)",letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>收支总览</div>
                  {[
                    {label:"总收入",value:totalIncome,color:"#2dd4bf"},
                    {label:"总支出",value:totalExpense,color:"#f87171"},
                    {label:"净结余",value:balance,color:theme.accent},
                  ].map(item=>(
                    <div key={item.label} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                      <span style={{color:"rgba(255,255,255,0.5)",fontSize:13}}>{item.label}</span>
                      <span style={{color:item.color,fontWeight:700,fontSize:14}}>¥{fmt(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>)}
        </div>
        {/* 底部导航 */}
        <div style={{position:"absolute",bottom:0,left:0,right:0,height:84,
          background:"rgba(8,8,20,0.92)",backdropFilter:"blur(28px)",WebkitBackdropFilter:"blur(28px)",
          borderTop:"1px solid rgba(255,255,255,0.055)",
          display:"flex",alignItems:"center",justifyContent:"space-around",padding:"0 8px 16px"}}>
          {[
            {id:"home",   icon:"⊞", label:"总览"},
            {id:"records",icon:"☰", label:"明细"},
            {id:"add",    icon:"+", label:"记账", fab:true, ownerOnly:true},
            {id:"chart",  icon:"◉", label:"图表"},
          ].map(item=>item.fab ? (
            userId!==ownerId ? <div key="add" style={{width:54}} /> : (
            <button key="add" onClick={()=>setShowAdd(true)} style={{
              width:54,height:54,borderRadius:19,background:theme.grad,border:"none",
              display:"flex",alignItems:"center",justifyContent:"center",
              marginTop:-20,cursor:"pointer",flexShrink:0,
              boxShadow:`0 8px 28px ${theme.fabShadow}`,
              fontSize:26,color:"#fff",fontWeight:300,lineHeight:1}}>+</button>
            )
          ) : (
            <button key={item.id} onClick={()=>setTab(item.id)} style={{
              background:"none",border:"none",cursor:"pointer",
              display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"0 10px"}}>
              <span style={{fontSize:19,color:tab===item.id?theme.accent:"rgba(255,255,255,0.55)"}}>{item.icon}</span>
              <span style={{
                fontSize:10,fontWeight:600,
                ...(tab===item.id
                  ? {background:theme.navActive,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}
                  : {color:"rgba(255,255,255,0.45)"})
              }}>{item.label}</span>
              {tab===item.id&&<div style={{width:18,height:3,borderRadius:2,background:theme.navBar,marginTop:1}}/>}
            </button>
          ))}
        </div>

        {/* 月份选择 */}
        {showMon&&(
          <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.8)",display:"flex",alignItems:"flex-end",zIndex:200}}
            onClick={()=>setShowMon(false)}>
            <div onClick={e=>e.stopPropagation()} style={{
              width:"100%",background:"#0f0f22",borderRadius:"30px 30px 0 0",
              border:"1px solid rgba(255,255,255,0.08)",padding:"0 20px 36px"}}>
              <div style={{width:34,height:4,background:"rgba(255,255,255,0.1)",borderRadius:2,margin:"14px auto 18px"}}/>
              <div style={{fontSize:15,fontWeight:700,color:"#fff",marginBottom:14}}>
                <GradText grad={theme.gradText}>选择月份</GradText>
              </div>
              {MONTHS.map(ym=>{
                const [y,m]=ym.split("-");
                const active=month===ym;
                return (
                  <button key={ym} onClick={()=>{setMonth(ym);setShowMon(false);}} style={{
                    display:"flex",justifyContent:"space-between",alignItems:"center",
                    width:"100%",padding:"12px 16px",borderRadius:14,marginBottom:7,
                    border:`1px solid ${active?theme.cardBorder:"rgba(255,255,255,0.06)"}`,
                    background:active?theme.cardBg:"rgba(255,255,255,0.02)",
                    cursor:"pointer",fontFamily:FONT}}>
                    <span style={{fontSize:14,fontWeight:active?700:400,color:active?"#fff":"rgba(255,255,255,0.55)"}}>
                      {y}年{parseInt(m)}月
                    </span>
                    <span style={{fontSize:12,color:active?theme.accent:"rgba(255,255,255,0.25)"}}>
                      {ym===THIS_MONTH?"本月":""}{active?" ✓":""}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {/* 记账弹窗 */}
        {showAdd&&(
          <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.78)",display:"flex",alignItems:"flex-end",zIndex:100}}
            onClick={()=>setShowAdd(false)}>
            <div onClick={e=>e.stopPropagation()} style={{
              width:"100%",background:"#0f0f22",borderRadius:"30px 30px 0 0",
              border:"1px solid rgba(255,255,255,0.08)",padding:"0 18px 40px",
              maxHeight:"90vh",overflowY:"auto"}}>
              <div style={{width:34,height:4,background:"rgba(255,255,255,0.1)",borderRadius:2,margin:"14px auto 16px"}}/>
              <div style={{fontSize:17,fontWeight:700,marginBottom:14}}>
                <GradText grad={theme.gradText}>+ 快速记账</GradText>
              </div>
              <div style={{display:"flex",background:"rgba(0,0,0,0.35)",borderRadius:14,padding:4,gap:4,marginBottom:13}}>
                {[["expense","▼ 支出"],["income","▲ 收入"]].map(([t,lbl])=>(
                  <button key={t} onClick={()=>setForm(f=>({...f,type:t,category:CATEGORIES[t][0].id}))} style={{
                    flex:1,padding:9,borderRadius:10,border:"none",
                    background:form.type===t?(t==="expense"?"rgba(239,68,68,0.18)":"rgba(20,184,166,0.18)"):"transparent",
                    color:form.type===t?(t==="expense"?"#f87171":"#2dd4bf"):"rgba(255,255,255,0.25)",
                    fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:FONT}}>{lbl}</button>
                ))}
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
                {cats.map(c=>(
                  <button key={c.id} onClick={()=>setForm(f=>({...f,category:c.id}))} style={{
                    padding:"6px 12px",borderRadius:11,
                    border:`1px solid ${form.category===c.id?theme.cardBorder:"rgba(255,255,255,0.07)"}`,
                    background:form.category===c.id?theme.cardBg:"rgba(255,255,255,0.03)",
                    color:form.category===c.id?theme.accent:"rgba(255,255,255,0.4)",
                    fontSize:12,fontWeight:500,cursor:"pointer",fontFamily:FONT}}>
                    {c.icon} {c.label}
                  </button>
                ))}
              </div>
              <div style={{position:"relative",marginBottom:10}}>
                <span style={{position:"absolute",left:16,top:"50%",transform:"translateY(-50%)",
                  fontSize:20,fontWeight:700,background:theme.gradText,
                  WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>¥</span>
                <input type="number" placeholder="0.00" value={form.amount}
                  onChange={e=>setForm(f=>({...f,amount:e.target.value}))}
                  style={{width:"100%",background:"rgba(0,0,0,0.3)",
                    border:`1px solid ${theme.cardBorder}`,borderRadius:15,
                    padding:"15px 16px 15px 42px",color:"#fff",fontSize:26,fontWeight:800,
                    outline:"none",fontFamily:FONT,letterSpacing:-0.5,boxSizing:"border-box"}}/>
              </div>
              <input type="text" placeholder="备注（可选）" value={form.note}
                onChange={e=>setForm(f=>({...f,note:e.target.value}))}
                style={{width:"100%",background:"rgba(255,255,255,0.04)",
                  border:"1px solid rgba(255,255,255,0.07)",borderRadius:13,
                  padding:"11px 14px",color:"rgba(255,255,255,0.7)",fontSize:13,
                  outline:"none",fontFamily:FONT,marginBottom:13,boxSizing:"border-box"}}/>
              <button onClick={handleAdd} disabled={saving} style={{
                width:"100%",padding:14,borderRadius:16,border:"none",
                background:saving?"rgba(255,255,255,0.06)":theme.grad,
                color:saving?"rgba(255,255,255,0.25)":"#fff",
                fontSize:15,fontWeight:700,cursor:saving?"default":"pointer",
                fontFamily:FONT,boxShadow:saving?"none":`0 6px 24px ${theme.fabShadow}60`}}>
                {saving?"保存中…":"确认记账"}
              </button>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast&&(
          <div style={{position:"absolute",top:60,left:"50%",transform:"translateX(-50%)",
            background:"#111126",border:`1px solid ${theme.toastBorder}`,
            borderRadius:20,padding:"9px 20px",color:theme.accent,
            fontSize:13,fontFamily:FONT,zIndex:300,whiteSpace:"nowrap",
            boxShadow:"0 8px 24px rgba(0,0,0,0.6)"}}>
            {toast}
          </div>
        )}

      </div>
    </div>
  );
}
