/* 手机屏渲染 */
const statusBar = () => `
  <div class="status"><span>9:41</span><span class="si">●●● ⌁ ▮</span></div>`;

const tabBar = (active) => `
  <nav class="tabs">${TABS.map(([icon, label], i) => `
    <span class="tab${i === active ? ' on' : ''}"><i>${icon}</i>${label}</span>`).join('')}
  </nav>`;

const homeInner = () => `
  ${statusBar()}
  <div class="home-top">
    <div>
      <div class="greet">Hi，小光</div>
      <div class="wordmark">拾光</div>
    </div>
    <div class="avatar">光</div>
  </div>

  <section class="hero">
    <div class="month">
      <span class="mnav">‹</span><span class="mlabel">2026 年 10 月</span><span class="mnav">›</span>
    </div>
    <div class="blabel">本月结余</div>
    <div class="bnum"><i>¥</i>3,286<span class="dec">.50</span></div>
    <div class="split">
      <div class="cell"><span>收入</span><b>12,800.00</b></div>
      <div class="vline"></div>
      <div class="cell"><span>支出</span><b>9,513.50</b></div>
    </div>
    <div class="ring"><span><b>25.7<em>%</em></b><small>结余率</small></span></div>
  </section>

  <div class="views"><span class="on">我的</span><span>阿岚</span></div>

  <div class="feed"><div class="feed-inner">${DAYS.map((day) => `
    <div class="day"><span>${day.label}</span><span class="dt">${day.total}</span></div>
    ${day.items.map((t) => `
      <div class="tx">
        <div class="ico">${t.icon}</div>
        <div class="tx-main"><b>${t.cat}</b><em>${t.note}</em></div>
        <div class="amt ${t.type}">${t.amt}</div>
      </div>`).join('')}`).join('')}
  </div></div>

  <button class="fab">＋</button>
  ${tabBar(0)}`;

const homePhone = (skin) => `
<div class="device"><div class="screen" data-skin="${skin}">${homeInner()}</div></div>`;

const trendChart = () => {
  const w = 288, h = 84, px = 5, top = 6, bottom = 12, max = 15000;
  const x = (i) => px + (i * (w - px * 2)) / 5;
  const y = (v) => h - bottom - (v / max) * (h - bottom - top);
  const line = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line(TREND.expense)} L${x(5).toFixed(1)},${h - bottom} L${x(0).toFixed(1)},${h - bottom} Z`;
  const grid = [5000, 10000, 15000].map((v) => `<line class="grid" x1="${px}" y1="${y(v)}" x2="${w - px}" y2="${y(v)}"/>`).join('');
  const expDots = TREND.expense.map((v, i) => `<circle class="dot" cx="${x(i)}" cy="${y(v)}" r="2" fill="var(--expense)"/>`).join('');
  const incDots = TREND.income.map((v, i) => `<circle class="dot" cx="${x(i)}" cy="${y(v)}" r="2" fill="var(--income)"/>`).join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    ${grid}
    <path d="${area}" fill="var(--expense)" opacity=".09"/>
    <path class="ln in" d="${line(TREND.income)}"/>
    <path class="ln out" d="${line(TREND.expense)}"/>
    ${incDots}${expDots}
  </svg>
  <div class="xlabels">${TREND.months.map((m) => `<span>${m}</span>`).join('')}</div>`;
};

const statsPhone = (skin) => `
<div class="device"><div class="screen" data-skin="${skin}">
  ${statusBar()}
  <div class="sp-head">
    <h2>图表</h2>
    <div class="month small">
      <span class="mnav">‹</span><span class="mlabel">2026 年 10 月</span><span class="mnav">›</span>
    </div>
  </div>

  <div class="kpis">${KPIS.map((k) => `
    <div class="kpi"><span>${k.label}</span><b class="${k.tone}">${k.value}</b></div>`).join('')}
  </div>

  <div class="views"><span class="on">我的</span><span>阿岚</span></div>

  <div class="panel">
    <div class="p-head"><span>支出分布</span><span>本月</span></div>
    ${DIST.map((d) => `
      <div class="cat-bar">
        <div class="cb-head">
          <span class="cb-name"><i>${d.icon}</i>${d.name}</span>
          <span class="cb-val">${d.amount} · ${d.pct}</span>
        </div>
        <div class="track"><i style="width:${d.w}%"></i></div>
      </div>`).join('')}
  </div>

  <div class="panel">
    <div class="p-head"><span>备注排行</span><b>TOP 3</b></div>
    ${NOTES.map((n, i) => `
      <div class="rank">
        <span class="rk">${i + 1}</span><span class="nm">${n.name}</span>
        <span class="bar"><i style="width:${n.w}%"></i></span>
        <span class="val">${n.amount}</span>
      </div>`).join('')}
  </div>

  <div class="panel">
    <div class="p-head"><span>收支趋势 · 近 6 个月</span>
      <span class="legend"><i class="i-in"></i>收入<i class="i-out"></i>支出</span>
    </div>
    ${trendChart()}
  </div>

  ${tabBar(1)}
</div></div>`;

const sheetPhone = (skin) => `
<div class="device"><div class="screen sheet-screen" data-skin="${skin}">
  <div class="ghost">${homeInner()}</div>
  <div class="dim"></div>
  <div class="sheet">
    <div class="grab"></div>
    <div class="s-head"><b>记一笔</b><span class="close">关闭</span></div>

    <div class="seg"><span class="on">支出</span><span>收入</span></div>

    <div class="flabel">金额</div>
    <div class="amount"><i>¥</i><b>32.00</b><span class="caret"></span></div>

    <div class="flabel">备注（可选）</div>
    <div class="input"><span>午饭</span><em>＋收藏</em></div>
    <div class="chips">
      <span class="chip pin">★ 午饭</span><span class="chip">地铁</span>
      <span class="chip">奶茶</span><span class="chip">超市</span>
    </div>

    <div class="flabel">日期</div>
    <div class="input"><span>2026-10-23</span><span class="chip pin">✓ 同上次 10-22</span></div>

    <div class="flabel">分类</div>
    <div class="cats">${CATEGORIES.map(([icon, name, on]) => `
      <div class="cat${on ? ' on' : ''}"><b>${icon}</b>${name}</div>`).join('')}
    </div>

    <button class="save">保存这笔账</button>
  </div>
</div></div>`;
