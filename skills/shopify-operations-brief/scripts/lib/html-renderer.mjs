// Self-contained, zero-dependency shadcn-style HTML Dashboard Renderer with i18n
import { getLocaleDict } from './i18n.mjs';

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  }[character]));
}

export function renderDashboardHtml(data, lang = 'zh-CN') {
  const dict = getLocaleDict(lang);
  const isEn = (lang && lang.toLowerCase().startsWith('en'));
  const {
    shopName,
    currencySymbol: sym,
    periods,
    current,
    previous,
    deltas,
    inventoryRisks = [],
    seasonalAdvisory,
    todos = [],
    executiveSummary
  } = data;

  const periodLabel = isEn ? periods.current.labelEn : periods.current.labelZh;
  const dateRange = periods.current.displayRange;
  const compareRange = periods.previous.displayRange;
  const nowFormatted = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const safe = escapeHtml;
  const hasOrderData = current.ordersCount > 0;
  const primaryMarketName = current.geo[0]?.country || dict.noOrderData;
  const primaryMarketShare = hasOrderData
    ? ((current.geo[0]?.count || 0) / current.ordersCount * 100).toFixed(0)
    : '—';
  const otherMarketsShare = hasOrderData
    ? (100 - ((current.geo[0]?.count || 0) / current.ordersCount * 100)).toFixed(0)
    : '—';

  return `<!DOCTYPE html>
<html lang="${isEn ? 'en' : 'zh-CN'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safe(dict.title)} · ${safe(shopName)}</title>
  <style>
    :root {
      --bg: #fafafa;
      --card-bg: #ffffff;
      --card-subtle: #f8fafc;
      --border: #e4e4e7;
      --border-subtle: #f4f4f5;
      --text-main: #09090b;
      --text-muted: #71717a;
      --text-light: #a1a1aa;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;

      --green-text: #15803d;
      --green-bg: #f0fdf4;
      --green-border: #bbf7d0;

      --red-text: #b91c1c;
      --red-bg: #fef2f2;
      --red-border: #fecaca;

      --amber-text: #b45309;
      --amber-bg: #fffbeb;
      --amber-border: #fde68a;

      --blue-text: #1d4ed8;
      --blue-bg: #eff6ff;
      --blue-border: #bfdbfe;

      --purple-text: #6d28d9;
      --purple-bg: #faf5ff;
      --purple-border: #e9d5ff;

      --radius-sm: 6px;
      --radius-md: 10px;
      --radius-lg: 14px;
      --shadow-subtle: 0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px -1px rgba(0, 0, 0, 0.04);
      --shadow-card: 0 1px 3px 0 rgba(0, 0, 0, 0.05);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--font-sans);
      background-color: var(--bg);
      color: var(--text-main);
      line-height: 1.5;
      padding: 36px 20px 60px;
      -webkit-font-smoothing: antialiased;
    }

    .container {
      max-width: 1080px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    /* Header */
    .header {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 24px 28px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: var(--shadow-subtle);
      flex-wrap: wrap;
      gap: 16px;
    }

    .store-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 500;
      color: var(--text-muted);
      background: var(--border-subtle);
      padding: 4px 10px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border);
    }

    .header-title {
      font-size: 22px;
      font-weight: 700;
      color: var(--text-main);
      letter-spacing: -0.02em;
      margin-top: 4px;
    }

    .header-right {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 6px;
    }

    .period-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-main);
      background: #f4f4f5;
      border: 1px solid var(--border);
      padding: 6px 12px;
      border-radius: var(--radius-sm);
    }

    .compare-text {
      font-size: 12px;
      color: var(--text-muted);
    }

    /* Diagnosis Banner Callout */
    .diagnosis-callout {
      background: #ffffff;
      border: 1px solid var(--border);
      border-left: 4px solid #09090b;
      border-radius: var(--radius-md);
      padding: 18px 22px;
      display: flex;
      align-items: flex-start;
      gap: 14px;
      box-shadow: var(--shadow-card);
    }

    .diagnosis-callout svg {
      width: 22px;
      height: 22px;
      color: #09090b;
      flex-shrink: 0;
      margin-top: 1px;
    }

    .diagnosis-content {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .diagnosis-heading {
      font-size: 14px;
      font-weight: 700;
      color: var(--text-main);
      letter-spacing: -0.01em;
    }

    .diagnosis-body {
      font-size: 13px;
      color: #3f3f46;
      line-height: 1.6;
    }

    /* 4-Column Core Health Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
    }

    @media (max-width: 900px) { .kpi-grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 480px) { .kpi-grid { grid-template-columns: 1fr; } }

    .kpi-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      box-shadow: var(--shadow-subtle);
    }

    .kpi-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-muted);
    }

    .kpi-value {
      font-size: 26px;
      font-weight: 700;
      color: var(--text-main);
      letter-spacing: -0.03em;
    }

    .kpi-footer {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      flex-wrap: wrap;
    }

    .tag-badge {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: var(--radius-sm);
    }

    .tag-green { color: var(--green-text); background: var(--green-bg); border: 1px solid var(--green-border); }
    .tag-red { color: var(--red-text); background: var(--red-bg); border: 1px solid var(--red-border); }
    .tag-amber { color: var(--amber-text); background: var(--amber-bg); border: 1px solid var(--amber-border); }
    .tag-blue { color: var(--blue-text); background: var(--blue-bg); border: 1px solid var(--blue-border); }
    .tag-purple { color: var(--purple-text); background: var(--purple-bg); border: 1px solid var(--purple-border); }
    .tag-neutral { color: var(--text-muted); background: var(--border-subtle); border: 1px solid var(--border); }

    /* Deep Dive 2-Column Section */
    .section-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px;
    }

    @media (max-width: 768px) { .section-grid { grid-template-columns: 1fr; } }

    .module-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 22px 24px;
      box-shadow: var(--shadow-subtle);
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .module-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border-subtle);
      padding-bottom: 12px;
    }

    .module-title {
      font-size: 15px;
      font-weight: 700;
      color: var(--text-main);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .module-title svg {
      width: 16px;
      height: 16px;
      color: var(--text-muted);
    }

    /* Lists and Bars */
    .breakdown-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .breakdown-row {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .breakdown-meta {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
    }

    .breakdown-name {
      font-weight: 500;
      color: var(--text-main);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .breakdown-val {
      font-weight: 600;
      color: var(--text-muted);
    }

    .progress-bar-bg {
      width: 100%;
      height: 6px;
      background: #f1f5f9;
      border-radius: 999px;
      overflow: hidden;
    }

    .progress-bar-fill {
      height: 100%;
      border-radius: 999px;
      background: #09090b;
    }

    .progress-bar-fill.accent-blue { background: #2563eb; }
    .progress-bar-fill.accent-purple { background: #7c3aed; }
    .progress-bar-fill.accent-amber { background: #d97706; }

    .cooccur-box {
      background: #f8fafc;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 12px 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
    }

    .cooccur-pair {
      font-weight: 600;
      color: var(--text-main);
    }

    .cooccur-count {
      font-size: 12px;
      color: var(--text-muted);
      background: #ffffff;
      border: 1px solid var(--border);
      padding: 2px 8px;
      border-radius: var(--radius-sm);
    }

    .mini-stat-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }

    .mini-stat-box {
      background: #f8fafc;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .mini-stat-label {
      font-size: 11px;
      font-weight: 500;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .mini-stat-num {
      font-size: 17px;
      font-weight: 700;
      color: var(--text-main);
    }

    .mini-stat-sub {
      font-size: 11px;
      color: var(--text-light);
    }

    .warning-order-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .warning-order-item {
      background: var(--red-bg);
      border: 1px solid var(--red-border);
      border-radius: var(--radius-sm);
      padding: 10px 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
    }

    .warning-order-id { font-weight: 700; color: var(--red-text); }
    .warning-order-time { color: var(--red-text); font-weight: 600; }

    /* Actionable To-Do Section */
    .todo-section {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 24px 26px;
      box-shadow: var(--shadow-subtle);
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .todo-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .todo-heading {
      font-size: 16px;
      font-weight: 700;
      color: var(--text-main);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .todo-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
    }

    .todo-card {
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 16px;
      display: flex;
      align-items: flex-start;
      gap: 14px;
      transition: all 0.15s ease;
    }

    .todo-card:hover {
      border-color: #a1a1aa;
      box-shadow: var(--shadow-card);
    }

    .priority-tag {
      font-size: 11px;
      font-weight: 700;
      padding: 4px 8px;
      border-radius: var(--radius-sm);
      flex-shrink: 0;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }

    .p0 { background: var(--red-bg); color: var(--red-text); border: 1px solid var(--red-border); }
    .p1 { background: var(--green-bg); color: var(--green-text); border: 1px solid var(--green-border); }
    .p2 { background: var(--blue-bg); color: var(--blue-text); border: 1px solid var(--blue-border); }
    .p3 { background: var(--purple-bg); color: var(--purple-text); border: 1px solid var(--purple-border); }
    .p4 { background: var(--amber-bg); color: var(--amber-text); border: 1px solid var(--amber-border); }

    .todo-body {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .todo-name {
      font-size: 14px;
      font-weight: 700;
      color: var(--text-main);
    }

    .todo-reason {
      font-size: 13px;
      color: #3f3f46;
      line-height: 1.5;
    }

    .todo-action {
      margin-top: 4px;
      font-size: 12px;
      font-weight: 500;
      color: #09090b;
      background: #f4f4f5;
      padding: 6px 10px;
      border-radius: var(--radius-sm);
      display: inline-block;
      width: fit-content;
    }

    /* Footer */
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      color: var(--text-light);
      padding: 8px 4px;
      border-top: 1px solid var(--border-subtle);
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <header class="header">
      <div>
        <div class="store-badge">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>
          ${safe(shopName)}
        </div>
        <h1 class="header-title">${safe(periodLabel)}</h1>
      </div>
      <div class="header-right">
        <div class="period-badge">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          ${safe(dateRange)}
        </div>
        <span class="compare-text">${safe(dict.compareLabel)}: ${safe(compareRange)}</span>
      </div>
    </header>

    <!-- Period summary -->
    <div class="diagnosis-callout">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
      <div class="diagnosis-content">
        <div class="diagnosis-heading">${safe(dict.coreSummary)}：</div>
        <div class="diagnosis-body">${safe(executiveSummary)}</div>
      </div>
    </div>

    <!-- Four main numbers -->
    <section class="kpi-grid">
      <!-- 1. Sales -->
      <div class="kpi-card">
        <div class="kpi-header">
          <span>${dict.gmvTitle}</span>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
        </div>
        <div class="kpi-value">${sym}${current.gmv.toFixed(2)}</div>
        <div class="kpi-footer">
          <span class="tag-badge ${parseFloat(deltas.gmv) >= 0 ? 'tag-green' : 'tag-red'}">${parseFloat(deltas.gmv) >= 0 ? '↑' : '↓'} ${deltas.gmv}%</span>
          <span class="tag-badge tag-amber">${dict.discountPenetration} ${current.discountPenetration.toFixed(0)}%</span>
        </div>
      </div>

      <!-- 2. Average order value and items per order -->
      <div class="kpi-card">
        <div class="kpi-header">
          <span>${dict.aovTitle}</span>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
        </div>
        <div class="kpi-value">${sym}${current.aov.toFixed(2)}</div>
        <div class="kpi-footer">
          <span class="tag-badge tag-neutral">${dict.itemsPerOrder} ${current.upt.toFixed(2)} ${dict.uptLabel}</span>
          <span class="tag-badge tag-red">${dict.singleItemRatio} ${current.singleItemRatio.toFixed(0)}%</span>
        </div>
      </div>

      <!-- 3. Shipping time -->
      <div class="kpi-card">
        <div class="kpi-header">
          <span>${dict.leadTimeTitle}</span>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
        </div>
        <div class="kpi-value" style="${current.avgLeadTimeHours > 48 ? 'color:var(--red-text);' : ''}">${current.avgLeadTimeHours.toFixed(1)} <span style="font-size:15px; font-weight:600;">${dict.hours}</span></div>
        <div class="kpi-footer">
          <span class="tag-badge ${current.over48h > 0 ? 'tag-red' : 'tag-green'}">${current.over48h} ${dict.over48hOrders}</span>
          ${current.delayedUnfulfilled.length > 0 ? `<span class="tag-badge tag-amber">${current.delayedUnfulfilled.length} ${dict.delayedOrdersCount}</span>` : ''}
        </div>
      </div>

      <!-- 4. Order locations -->
      <div class="kpi-card">
        <div class="kpi-header">
          <span>${dict.globalTitle}</span>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
        </div>
        <div class="kpi-value">${current.geo.length} <span style="font-size:15px; font-weight:500; color:var(--text-muted);">${dict.countriesCount}</span></div>
        <div class="kpi-footer">
          <span class="tag-badge tag-blue">${safe(primaryMarketName)} ${primaryMarketShare}${hasOrderData ? '%' : ''}</span>
          <span class="tag-badge tag-purple">${dict.otherMarketsRatio} ${otherMarketsShare}${hasOrderData ? '%' : ''}</span>
        </div>
      </div>
    </section>

    <!-- Details: product combinations and promotions -->
    <div class="section-grid">
      <!-- Items per order and products bought together -->
      <div class="module-card">
        <div class="module-header">
          <div class="module-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v1"></path><path d="M18 8h4a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-4"></path><circle cx="8" cy="12" r="2"></circle></svg>
            ${dict.basketTitle}
          </div>
          <span class="tag-badge tag-neutral">${dict.basketTag}</span>
        </div>

        <div class="mini-stat-grid">
          <div class="mini-stat-box">
            <span class="mini-stat-label">${dict.singleItem}</span>
            <span class="mini-stat-num">${current.basketSize[1]} (${current.singleItemRatio.toFixed(1)}%)</span>
            <span class="mini-stat-sub">${dict.singleItemSub}</span>
          </div>
          <div class="mini-stat-box">
            <span class="mini-stat-label">${dict.multiItem}</span>
            <span class="mini-stat-num" style="color:var(--green-text);">${(current.basketSize[2] || 0) + (current.basketSize['3+'] || 0)} (${(100 - current.singleItemRatio).toFixed(1)}%)</span>
            <span class="mini-stat-sub">${dict.multiItemSub}</span>
          </div>
        </div>

        <div style="font-size:12px; font-weight:600; color:var(--text-muted); margin-top:2px;">${dict.cooccurHeader}</div>
        <div class="breakdown-list">
          ${current.coOccurrence.length > 0 ? current.coOccurrence.slice(0, 3).map(c => `
            <div class="cooccur-box">
              <span class="cooccur-pair">${safe(c.pair)}</span>
              <span class="cooccur-count">${dict.cooccurTimes.replace('{n}', c.count)}</span>
            </div>
          `).join('') : `<div class="cooccur-box" style="color:var(--text-light);">${dict.noCooccur}</div>`}
        </div>
      </div>

      <!-- Promotion results -->
      <div class="module-card">
        <div class="module-header">
          <div class="module-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="9" x2="15" y2="15"></line><circle cx="9" cy="15" r="1"></circle><circle cx="15" cy="9" r="1"></circle></svg>
            ${dict.discountTitle}
          </div>
          <span class="tag-badge tag-amber">${dict.discountTag.replace('{pct}', current.discountPenetration.toFixed(0))}</span>
        </div>

        <div class="mini-stat-grid">
          <div class="mini-stat-box">
            <span class="mini-stat-label">${dict.discountAov}</span>
            <span class="mini-stat-num">${sym}${current.discountedAov.toFixed(2)}</span>
            <span class="mini-stat-sub">${dict.discountAovSub.replace('{n}', current.discountedOrdersCount)}</span>
          </div>
          <div class="mini-stat-box">
            <span class="mini-stat-label">${dict.fullPriceAov}</span>
            <span class="mini-stat-num" style="color:var(--green-text);">${sym}${current.fullPriceAov.toFixed(2)}</span>
            <span class="mini-stat-sub">${dict.fullPriceAovSub.replace('{n}', current.fullPriceOrdersCount)}</span>
          </div>
        </div>

        <div style="font-size:12px; font-weight:600; color:var(--text-muted); margin-top:2px;">${dict.promoCodesHeader}</div>
        <div class="breakdown-list">
          ${current.promoCodes.slice(0, 3).map((p, idx) => {
            const pct = ((p.count / (current.discountedOrdersCount || 1)) * 100).toFixed(0);
            const colorClass = idx === 0 ? 'accent-purple' : idx === 1 ? 'accent-blue' : 'accent-amber';
            return `
              <div class="breakdown-row">
                <div class="breakdown-meta">
                  <span class="breakdown-name"><code>${safe(p.code)}</code></span>
                  <span class="breakdown-val">${p.count} (${pct}%)</span>
                </div>
                <div class="progress-bar-bg"><div class="progress-bar-fill ${colorClass}" style="width: ${pct}%;"></div></div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>

    <!-- Details: shipping and order locations -->
    <div class="section-grid">
      <!-- Shipping speed and orders still to ship -->
      <div class="module-card">
        <div class="module-header">
          <div class="module-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            ${dict.fulfillmentTitle}
          </div>
          <span class="tag-badge ${current.avgLeadTimeHours > 48 ? 'tag-red' : 'tag-green'}">${dict.fulfillmentTag}</span>
        </div>

        <div class="breakdown-list">
          <div class="breakdown-row">
            <div class="breakdown-meta">
              <span class="breakdown-name">${dict.fastTier}</span>
              <span class="breakdown-val">${current.under24h} (${((current.under24h / (current.ordersCount || 1)) * 100).toFixed(0)}%)</span>
            </div>
            <div class="progress-bar-bg"><div class="progress-bar-fill accent-blue" style="width: ${((current.under24h / (current.ordersCount || 1)) * 100)}%;"></div></div>
          </div>
          <div class="breakdown-row">
            <div class="breakdown-meta">
              <span class="breakdown-name">${dict.standardTier}</span>
              <span class="breakdown-val">${current.standard24to48h} (${((current.standard24to48h / (current.ordersCount || 1)) * 100).toFixed(0)}%)</span>
            </div>
            <div class="progress-bar-bg"><div class="progress-bar-fill accent-purple" style="width: ${((current.standard24to48h / (current.ordersCount || 1)) * 100)}%;"></div></div>
          </div>
          <div class="breakdown-row">
            <div class="breakdown-meta">
              <span class="breakdown-name">${dict.delayedTier}</span>
              <span class="breakdown-val" style="color:var(--red-text);">${current.over48h} (${((current.over48h / (current.ordersCount || 1)) * 100).toFixed(0)}%)</span>
            </div>
            <div class="progress-bar-bg"><div class="progress-bar-fill" style="background:var(--red-text); width: ${((current.over48h / (current.ordersCount || 1)) * 100)}%;"></div></div>
          </div>
        </div>

        ${current.delayedUnfulfilled.length > 0 ? `
          <div style="font-size:12px; font-weight:600; color:var(--red-text); margin-top:2px;">${dict.delayedAlertTitle}</div>
          <div class="warning-order-list">
            ${current.delayedUnfulfilled.slice(0, 2).map(o => `
              <div class="warning-order-item">
                <span class="warning-order-id">${safe(sym)}${o.gmv.toFixed(2)}</span>
                <span class="warning-order-time">${dict.orderDelayedHours.replace('{h}', o.ageHours)}</span>
              </div>
            `).join('')}
          </div>
        ` : `<div style="font-size:12px; color:var(--green-text); padding: 8px 0;">${dict.noDelayedOrders}</div>`}
      </div>

      <!-- Order countries and payment methods -->
      <div class="module-card">
        <div class="module-header">
          <div class="module-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="m4.93 4.93 4.24 4.24"></path><path d="m14.83 9.17 4.24-4.24"></path><path d="m14.83 14.83 4.24 4.24"></path><path d="m9.17 14.83-4.24 4.24"></path></svg>
            ${dict.globalModuleTitle}
          </div>
          <span class="tag-badge tag-blue">${dict.globalTag}</span>
        </div>

        <div class="breakdown-list">
          ${current.geo.slice(0, 3).map(g => {
            const pct = ((g.count / (current.ordersCount || 1)) * 100).toFixed(0);
            return `
              <div class="breakdown-row">
                <div class="breakdown-meta">
                  <span class="breakdown-name">${safe(g.country)}</span>
                  <span class="breakdown-val">${g.count} (${pct}%)</span>
                </div>
                <div class="progress-bar-bg"><div class="progress-bar-fill accent-blue" style="width: ${pct}%;"></div></div>
              </div>
            `;
          }).join('')}
        </div>

        <div style="font-size:12px; font-weight:600; color:var(--text-muted); margin-top:2px;">${dict.paymentTitle}</div>
        <div class="mini-stat-grid">
          ${current.gateways.slice(0, 2).map(gw => `
            <div class="mini-stat-box">
              <span class="mini-stat-label">${safe(gw.gateway)}</span>
              <span class="mini-stat-num">${gw.count} (${((gw.count / (current.ordersCount || 1)) * 100).toFixed(0)}%)</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    <!-- Low-stock section (shown only when needed) -->
    ${inventoryRisks.length > 0 ? `
      <div class="module-card">
        <div class="module-header">
          <div class="module-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path><path d="M3 6h18"></path><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
            ${dict.inventoryTitle}
          </div>
          <span class="tag-badge tag-red">${dict.inventoryTag}</span>
        </div>
        <div class="breakdown-list">
          <div style="font-size:12px; font-weight:600; color:var(--red-text);">${dict.stockoutRisk.replace('{threshold}', '8')}</div>
          ${inventoryRisks.slice(0, 3).map(inv => `
            <div class="cooccur-box" style="border-left: 3px solid var(--red-text);">
              <div>
                <span class="cooccur-pair">${safe(inv.productTitle)}</span>
                <span style="font-size:12px; color:var(--text-muted);">(${safe(inv.variantTitle)} · SKU: ${safe(inv.sku)})</span>
              </div>
              <span class="tag-badge tag-red">${dict.remainingUnits.replace('{qty}', inv.qty)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <!-- What to do next -->
    <section class="todo-section">
      <div class="todo-title-row">
        <h2 class="todo-heading">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
          ${dict.todoSectionTitle}
        </h2>
        <span class="tag-badge tag-neutral">${dict.todoTag}</span>
      </div>

      <div class="todo-grid">
        ${todos.map(todo => {
          const tagClass = todo.priority === 'p0' ? 'p0' : todo.priority === 'p1' ? 'p1' : todo.priority === 'p2' ? 'p2' : todo.priority === 'p3' ? 'p3' : 'p4';
          const tagLabel = todo.priority === 'p0' ? dict.p0Tag : todo.priority === 'p1' ? dict.p1Tag : todo.priority === 'p2' ? dict.p2Tag : todo.priority === 'p3' ? dict.p3Tag : dict.p4Tag;
          return `
            <div class="todo-card">
              <span class="priority-tag ${tagClass}">${tagLabel}</span>
              <div class="todo-body">
                <div class="todo-name">${safe(todo.title)}</div>
                <div class="todo-reason">${safe(todo.reason)}</div>
                <div class="todo-action">${safe(dict.actionLabel)}${safe(todo.action)}</div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </section>

    <!-- Footer -->
    <footer class="footer">
      <span>${dict.footerText}</span>
      <span>${nowFormatted}</span>
    </footer>
  </div>
</body>
</html>`;
}
