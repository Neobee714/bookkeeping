/* 组装页面 */
const blockHTML = (s) => `
<section class="style-block" id="s-${s.id}">
  <div class="sb-head">
    <div class="sb-no">${s.no}</div>
    <div class="sb-title">
      <h2>${s.name} <span>${s.en}</span></h2>
      <p>${s.desc}</p>
    </div>
    <div class="swatches" aria-hidden="true">${s.sw.map((c) => `<i style="background:${c}"></i>`).join('')}</div>
  </div>
  <div class="tags">
    ${s.tags.map((t) => `<span>${t}</span>`).join('')}
    <span class="cost">${s.cost}</span>
  </div>
  <div class="phones">
    <div class="phone-col"><div class="phone-cap">首页 · 月度汇总 + 账单流</div>${homePhone(s.id)}</div>
    <div class="phone-col"><div class="phone-cap">图表 · 汇总 / 分布 / 排行 / 趋势</div>${statsPhone(s.id)}</div>
    <div class="phone-col"><div class="phone-cap">记一笔 · 底部弹层</div>${sheetPhone(s.id)}</div>
  </div>
</section>`;

document.getElementById('index').innerHTML = STYLES
  .map((s) => `<a href="#s-${s.id}"><b>${s.no}</b>${s.name}</a>`)
  .join('');

document.getElementById('board').innerHTML = STYLES.map(blockHTML).join('');
