/* 预览数据：10 个方向共用同一份内容 */
const STYLES = [
  {
    id: 'editorial', no: '01', name: '极简编辑', en: 'Editorial',
    desc: '去掉卡片、阴影和渐变，用留白、发丝线和宋体大数字建立层级。第一眼像一本排版干净的书，而不是理财产品。',
    tags: ['克制', '纸质', '高留白'],
    sw: ['#FBFAF6', '#17160F', '#B4441F', '#E3E0D2'],
    cost: '成本低：只换 token 与分隔方式'
  },
  {
    id: 'journal', no: '02', name: '纸感手账', en: 'Paper Journal',
    desc: '米色纸底、宋体标题、朱红小印章、虚线分隔与横格纹。记一笔像在本子上落笔，适合把记账当日常习惯的人。',
    tags: ['温暖', '手账', '新中式'],
    sw: ['#F7F0E2', '#FFFCF3', '#B23A2E', '#E2D5BD'],
    cost: '成本低：纹理用 CSS 画，无需图片'
  },
  {
    id: 'glass', no: '03', name: '玻璃拟态', en: 'Glass',
    desc: '紫粉蓝流体渐变打底，半透明磨砂卡片、亮边与浮空 Tab。视觉冲击最强，但小字号在复杂背景上要盯对比度。',
    tags: ['通透', '潮流', '视觉强'],
    sw: ['#5B21B6', '#C026D3', '#0EA5E9', '#FFFFFF'],
    cost: '成本中：磨砂依赖 backdrop-filter，老安卓有掉帧风险'
  },
  {
    id: 'neumorph', no: '04', name: '柔和浮雕', en: 'Neumorph',
    desc: '同色系双向软阴影，元素像从背景里压出来，输入区则是内凹。触感强、噪声低，安静但对比度偏弱。',
    tags: ['安静', '触感', '低对比'],
    sw: ['#E9EDF4', '#FFFFFF', '#4F6BED', '#C8D0DE'],
    cost: '成本低：纯阴影，无额外依赖；需额外检查无障碍对比'
  },
  {
    id: 'brutalist', no: '05', name: '硬边粗野', en: 'Brutalist',
    desc: '黑描边、硬投影、荧光黄底与等宽数字。个性最强、辨识度最高，代价是配色容错率低，且只适合单主色。',
    tags: ['张扬', '高对比', '有记忆点'],
    sw: ['#F4F04A', '#0B0B0B', '#FF4D2E', '#FFFFFF'],
    cost: '成本低：全是 1–2px 边框与硬阴影'
  },
  {
    id: 'neon', no: '06', name: '暗夜霓虹', en: 'Neon Night',
    desc: '近黑底、紫青渐变描边、发光数字。默认深色为主模式，夜间记账最舒服，白天户外亮度需要接受。',
    tags: ['深色', '科技', '夜间'],
    sw: ['#08080F', '#7C5CFF', '#00E0FF', '#EDEDF7'],
    cost: '成本中：需保证浅色模式也有对等方案'
  },
  {
    id: 'terminal', no: '07', name: '金融终端', en: 'Fintech Terminal',
    desc: '藏青数据头、表格化列表、等宽数字与极细分隔线。信息密度最高，最像“认真在对账”，亲和力最低。',
    tags: ['专业', '数据感', '高密度'],
    sw: ['#0B1B33', '#FFFFFF', '#0B4FD9', '#DCE3EC'],
    cost: '成本低：去掉圆角与阴影，反而更省渲染'
  },
  {
    id: 'candy', no: '08', name: '糖果马卡龙', en: 'Candy',
    desc: '低饱和糖果色、超大圆角、圆形图标底与奶油渐变。亲和力最高，双人记账的“共同感”最强，但偏年轻化。',
    tags: ['可爱', '柔和', '双人感'],
    sw: ['#FFF7F3', '#FF8FB1', '#FFC58B', '#7FD8C7'],
    cost: '成本低：只改圆角、配色与渐变'
  },
  {
    id: 'leather', no: '09', name: '皮革账本', en: 'Leather Ledger',
    desc: '墨绿皮革、烫金标题、米色内页与缝线边框。仪式感最强，像翻开一本真正的家用账本；深色底不适合弱光下长时间看。',
    tags: ['复古', '仪式感', '重质感'],
    sw: ['#123028', '#F5ECD8', '#B08A3E', '#E8CF98'],
    cost: '成本中：皮革/纸纹建议用 CSS 渐变，避免引入位图'
  },
  {
    id: 'aurora', no: '10', name: '流动极光', en: 'Aurora',
    desc: '浅底柔和彩雾、白色大卡、渐变描边与结余率环。现代主流 App 气质，克制但有细节，是这 10 个里落地最稳的。',
    tags: ['现代', '平衡', '推荐'],
    sw: ['#F7F8FC', '#6D5BFF', '#23C4A2', '#FFFFFF'],
    cost: '成本低：与现有结构最接近，替换 token 即可'
  }
];

const DAYS = [
  {
    label: '10月23日 · 今天', total: '支出 ¥38.00',
    items: [
      { icon: '🍜', cat: '餐饮', note: '午饭 · 公司楼下', amt: '-¥32.00', type: 'out' },
      { icon: '🚇', cat: '交通', note: '地铁 2 号线', amt: '-¥6.00', type: 'out' },
      { icon: '💰', cat: '收入', note: '工资到账', amt: '+¥12,000.00', type: 'in' }
    ]
  },
  {
    label: '10月22日 · 昨天', total: '支出 ¥164.90',
    items: [
      { icon: '🛒', cat: '日用', note: '洗衣液 · 纸巾', amt: '-¥68.90', type: 'out' },
      { icon: '🎮', cat: '娱乐', note: '电影票 ×2', amt: '-¥96.00', type: 'out' }
    ]
  },
  {
    label: '10月21日', total: '支出 ¥177.00',
    items: [
      { icon: '🍲', cat: '餐饮', note: '火锅 · 阿岚', amt: '-¥158.00', type: 'out' },
      { icon: '🍿', cat: '零食', note: '奶茶 · 少糖', amt: '-¥19.00', type: 'out' }
    ]
  }
];

const KPIS = [
  { label: '收入', value: '12,800.00', tone: 'in' },
  { label: '支出', value: '9,513.50', tone: 'out' },
  { label: '结余', value: '3,286.50', tone: 'in' },
  { label: '记录笔数', value: '38', tone: '' }
];

const DIST = [
  { icon: '🍜', name: '餐饮', amount: '¥3,240', pct: '34%', w: 100 },
  { icon: '🛒', name: '日用', amount: '¥2,180', pct: '23%', w: 67 },
  { icon: '🎮', name: '娱乐', amount: '¥1,760', pct: '18%', w: 54 },
  { icon: '🚇', name: '交通', amount: '¥1,120', pct: '12%', w: 35 }
];

const NOTES = [
  { name: '火锅', amount: '¥486 · 3 笔', w: 100 },
  { name: '奶茶', amount: '¥95 · 5 笔', w: 44 },
  { name: '地铁', amount: '¥48 · 8 笔', w: 22 }
];

const TREND = {
  months: ['5月', '6月', '7月', '8月', '9月', '10月'],
  income: [12800, 12800, 13600, 12800, 12800, 12800],
  expense: [8200, 7460, 9150, 8380, 10240, 9513]
};

const CATEGORIES = [
  ['🍜', '餐饮', true], ['🚇', '交通'], ['🛒', '日用'], ['🎮', '娱乐'],
  ['💊', '医疗'], ['📚', '教育'], ['🛍️', '购物'], ['🍿', '零食'],
  ['💰', '收入'], ['💵', '生活费'], ['📌', '其他']
];

const TABS = [['🏠', '首页'], ['📊', '图表'], ['✨', '小光'], ['🎯', '规划'], ['👤', '我的']];
