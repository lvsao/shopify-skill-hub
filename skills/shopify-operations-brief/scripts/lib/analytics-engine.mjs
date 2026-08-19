// Store report calculations and next-step suggestions.

export function processStoreDiagnostics(rawData, periods, lang = 'zh-CN', currentDateInput = null, timezone = 'UTC') {
  const isEn = (lang && lang.toLowerCase().startsWith('en'));
  const currency = rawData.shopMeta?.currencyCode || 'USD';
  const currencySymbol = currency === 'GBP' ? '£' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency + ' ';
  const now = currentDateInput ? new Date(currentDateInput) : new Date();

  // 1. Process Current & Previous Period Metrics
  const currentMetrics = analyzePeriodOrders(rawData.current.orders, rawData.current.abandoned, now);
  const previousMetrics = analyzePeriodOrders(rawData.previous.orders, rawData.previous.abandoned, now);

  // Compare this period with the previous period.
  const gmvDelta = computeDelta(currentMetrics.gmv, previousMetrics.gmv);
  const aovDelta = computeDelta(currentMetrics.aov, previousMetrics.aov);
  const ordersDelta = computeDelta(currentMetrics.ordersCount, previousMetrics.ordersCount);

  // Check low stock on products sold this period.
  const inventoryRisks = analyzeInventoryHealth(rawData.products, currentMetrics.topProducts);

  // Check whether an upcoming shopping period needs preparation.
  const seasonalAdvisory = getUpcomingMarketingHoliday(now, isEn, timezone);

  // Create clear next-step suggestions.
  const todos = generateActionableTodos({
    current: currentMetrics,
    previous: previousMetrics,
    inventoryRisks,
    seasonalAdvisory,
    currencySymbol,
    isEn
  });

  // Write the plain-language summary.
  const executiveSummary = generateExecutiveSummary({
    current: currentMetrics,
    previous: previousMetrics,
    gmvDelta,
    currencySymbol,
    isEn
  });

  return {
    shopName: rawData.shopMeta?.name || 'Shopify Store',
    currency,
    currencySymbol,
    periods,
    current: currentMetrics,
    previous: previousMetrics,
    deltas: {
      gmv: gmvDelta,
      aov: aovDelta,
      orders: ordersDelta
    },
    inventoryRisks,
    seasonalAdvisory,
    todos,
    executiveSummary
  };
}

function analyzePeriodOrders(orders, abandoned, now) {
  let gmv = 0;
  let net = 0;
  let discounts = 0;
  let refunds = 0;
  let totalItemsSold = 0;
  let unfulfilled = 0;
  let fulfilled = 0;
  let newCust = 0;
  let retCust = 0;

  // How many items customers buy in one order.
  const basketSize = { 1: 0, 2: 0, '3+': 0 };
  const coOccurrenceMap = {};

  // Orders with and without a discount.
  let discountedOrdersCount = 0;
  let discountedGMV = 0;
  let fullPriceGMV = 0;
  const promoCodeMap = {};

  // Time from order to shipment.
  const leadTimesHours = [];
  const delayedUnfulfilled = [];

  // Order countries, payment methods, and available marketing source data.
  const geoMap = {};
  const gatewayMap = {};
  const trafficMap = {};
  const productMap = {};

  orders.forEach(order => {
    const g = parseFloat(order.totalPriceSet?.shopMoney?.amount || '0');
    const n = parseFloat(order.subtotalPriceSet?.shopMoney?.amount || '0');
    const d = parseFloat(order.totalDiscountsSet?.shopMoney?.amount || '0');
    const r = parseFloat(order.totalRefundedSet?.shopMoney?.amount || '0');

    gmv += g;
    net += n;
    discounts += d;
    refunds += r;

    // Customer
    const numOrders = parseInt(order.customer?.numberOfOrders || '1', 10);
    if (numOrders <= 1) newCust++;
    else retCust++;

    // Whether the order has shipped.
    if (order.displayFulfillmentStatus === 'UNFULFILLED') {
      unfulfilled++;
      const orderDate = new Date(order.createdAt);
      const ageHours = (now - orderDate) / (1000 * 60 * 60);
      if (ageHours >= 24) {
        delayedUnfulfilled.push({
          ageHours: Math.round(ageHours),
          gmv: g
        });
      }
    } else if (order.displayFulfillmentStatus === 'FULFILLED') {
      fulfilled++;
    }

    if (order.fulfillments && order.fulfillments.length > 0) {
      const orderDate = new Date(order.createdAt);
      const fulfillDate = new Date(order.fulfillments[0].createdAt);
      const diffHours = Math.max(0, (fulfillDate - orderDate) / (1000 * 60 * 60));
      leadTimesHours.push(diffHours);
    }

    // Discounts
    if (d > 0) {
      discountedOrdersCount++;
      discountedGMV += g;
    } else {
      fullPriceGMV += g;
    }

    (order.discountApplications?.edges || []).forEach(e => {
      const code = e.node?.code || e.node?.title || 'Auto / Promotion';
      promoCodeMap[code] = (promoCodeMap[code] || 0) + 1;
    });

    // LineItems & Basket
    const items = (order.lineItems?.edges || []).map(e => e.node);
    const orderItemQty = items.reduce((sum, it) => sum + (it.quantity || 1), 0);
    totalItemsSold += orderItemQty;

    if (orderItemQty === 1) basketSize[1]++;
    else if (orderItemQty === 2) basketSize[2]++;
    else basketSize['3+']++;

    // Products bought together in one order.
    if (items.length > 1) {
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const pairKey = [items[i].title, items[j].title].sort().join(' + ');
          coOccurrenceMap[pairKey] = (coOccurrenceMap[pairKey] || 0) + 1;
        }
      }
    }

    // Product breakdown
    items.forEach(it => {
      const title = it.title;
      const qty = it.quantity || 1;
      const unitPrice = parseFloat(it.originalUnitPriceSet?.shopMoney?.amount || '0');
      if (!productMap[title]) productMap[title] = { qty: 0, revenue: 0 };
      productMap[title].qty += qty;
      productMap[title].revenue += unitPrice * qty;
    });

    // Geo
    const country = order.shippingAddress?.country || 'Unknown';
    geoMap[country] = (geoMap[country] || 0) + 1;

    // Gateways
    (order.paymentGatewayNames || []).forEach(gw => {
      gatewayMap[gw] = (gatewayMap[gw] || 0) + 1;
    });

    // Journey
    const journey = order.customerJourneySummary?.firstVisit || order.customerJourneySummary?.lastVisit;
    let sourceKey = 'Direct / Organic';
    if (journey) {
      const utm = journey.utmParameters;
      if (utm?.source) {
        sourceKey = `${utm.source} (${utm.campaign || utm.medium || 'ad'})`;
      } else if (journey.source) {
        sourceKey = journey.source;
      } else if (journey.referrerUrl) {
        try {
          sourceKey = new URL(journey.referrerUrl).hostname.replace('www.', '');
        } catch {
          sourceKey = journey.referrerUrl;
        }
      }
    }
    trafficMap[sourceKey] = (trafficMap[sourceKey] || 0) + 1;
  });

  const ordersCount = orders.length;
  const aov = ordersCount > 0 ? gmv / ordersCount : 0;
  const upt = ordersCount > 0 ? totalItemsSold / ordersCount : 0;
  const refundRate = gmv > 0 ? (refunds / gmv) * 100 : 0;
  const discountPenetration = ordersCount > 0 ? (discountedOrdersCount / ordersCount) * 100 : 0;

  const fullPriceOrdersCount = ordersCount - discountedOrdersCount;
  const discountedAov = discountedOrdersCount > 0 ? discountedGMV / discountedOrdersCount : 0;
  const fullPriceAov = fullPriceOrdersCount > 0 ? fullPriceGMV / fullPriceOrdersCount : 0;

  // Lead times tier
  const avgLeadTimeHours = leadTimesHours.length > 0
    ? leadTimesHours.reduce((a, b) => a + b, 0) / leadTimesHours.length
    : 0;
  const under24h = leadTimesHours.filter(h => h <= 24).length;
  const standard24to48h = leadTimesHours.filter(h => h > 24 && h <= 48).length;
  const over48h = leadTimesHours.filter(h => h > 48).length;

  // Abandoned Checkouts
  let abandonedValue = 0;
  abandoned.forEach(c => {
    abandonedValue += parseFloat(c.totalPriceSet?.shopMoney?.amount || '0');
  });

  return {
    ordersCount,
    gmv,
    net,
    discounts,
    refunds,
    refundRate,
    aov,
    upt,
    totalItemsSold,
    newCust,
    retCust,
    unfulfilled,
    fulfilled,
    delayedUnfulfilled,
    basketSize,
    singleItemRatio: ordersCount > 0 ? (basketSize[1] / ordersCount) * 100 : 0,
    coOccurrence: Object.entries(coOccurrenceMap).map(([pair, count]) => ({ pair, count })).sort((a, b) => b.count - a.count),
    discountedOrdersCount,
    fullPriceOrdersCount,
    discountPenetration,
    discountedAov,
    fullPriceAov,
    promoCodes: Object.entries(promoCodeMap).map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count),
    avgLeadTimeHours,
    under24h,
    standard24to48h,
    over48h,
    geo: Object.entries(geoMap).map(([country, count]) => ({ country, count })).sort((a, b) => b.count - a.count),
    gateways: Object.entries(gatewayMap).map(([gateway, count]) => ({ gateway, count })).sort((a, b) => b.count - a.count),
    traffic: Object.entries(trafficMap).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
    topProducts: Object.entries(productMap).map(([title, d]) => ({ title, ...d })).sort((a, b) => b.revenue - a.revenue),
    abandonedCount: abandoned.length,
    abandonedValue
  };
}

function computeDelta(curr, prev) {
  if (!prev || prev === 0) return curr > 0 ? '+100.0' : '0.0';
  const diff = ((curr - prev) / prev) * 100;
  return (diff >= 0 ? '+' : '') + diff.toFixed(1);
}

export function analyzeInventoryHealth(products, topProducts) {
  const lowStockItems = [];
  const topProductTitles = new Set(topProducts.map(p => p.title));

  products.forEach(p => {
    const isTopSeller = topProductTitles.has(p.title);
    const variants = (p.variants?.edges || []).map(e => e.node);
    variants.forEach(v => {
      const qty = v.inventoryQuantity;
      const tracked = v.inventoryItem?.tracked === true;
      const isGiftCard = /gift\s*card/i.test(p.productType || '') || /gift\s*card/i.test(p.title || '');
      if (isTopSeller && tracked && !isGiftCard && Number.isFinite(qty) && qty >= 0 && qty <= 8) {
        lowStockItems.push({
          productTitle: p.title,
          variantTitle: v.title,
          sku: v.sku || 'N/A',
          qty,
          isTopSeller
        });
      }
    });
  });

  return lowStockItems.sort((a, b) => a.qty - b.qty);
}

function localDateString(now, timezone) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

function fourthThursdayOfNovember(year) {
  const date = new Date(Date.UTC(year, 10, 1));
  const firstThursdayOffset = (4 - date.getUTCDay() + 7) % 7;
  date.setUTCDate(1 + firstThursdayOffset + 21);
  return date.toISOString().slice(0, 10);
}

function daysBetween(start, end) {
  return Math.round((new Date(`${end}T12:00:00Z`) - new Date(`${start}T12:00:00Z`)) / 86_400_000);
}

export function getUpcomingMarketingHoliday(now, isEn, timezone = 'UTC') {
  const today = localDateString(now, timezone);
  const year = Number(today.slice(0, 4));
  const events = [
    {
      name: isEn ? 'Back to School / Labor Day' : '返校季与劳动节促销',
      date: `${year}-09-01`,
      window: 31,
      actionZh: '提前配好多件阶梯优惠，并核对热销 SKU 的备货和发货时效。',
      actionEn: 'Prepare tiered multi-item offers and confirm stock and delivery capacity for top SKUs.',
    },
    {
      name: isEn ? 'Halloween' : '万圣节',
      date: `${year}-10-31`,
      window: 45,
      actionZh: '备好节日组合和营销素材，并盯紧跨境发货截止日。',
      actionEn: 'Prepare seasonal bundles, creative assets, and cross-border delivery cutoffs.',
    },
    {
      name: isEn ? 'Black Friday & Cyber Monday' : '黑五网一',
      date: fourthThursdayOfNovember(year),
      window: 45,
      actionZh: '做好 VIP 预热、阶梯优惠，并为核心爆款留足安全库存。',
      actionEn: 'Complete VIP warm-up, tiered offers, and safety-stock planning for top sellers.',
    },
    {
      name: isEn ? 'Christmas' : '圣诞节',
      date: `${year}-12-25`,
      window: 45,
      actionZh: '备好礼品组合和送达承诺，并提前想好节后清仓。',
      actionEn: 'Prepare gift bundles, delivery promises, and a post-holiday clearance plan.',
    },
  ];

  for (const event of events) {
    const daysLeft = daysBetween(today, event.date);
    if (daysLeft >= 0 && daysLeft <= event.window) return { ...event, daysLeft };
  }
  return null;
}

function generateActionableTodos({ current, previous, inventoryRisks, seasonalAdvisory, currencySymbol, isEn }) {
  const todos = [];

  // P0: Orders waiting too long to ship.
  if (current.delayedUnfulfilled && current.delayedUnfulfilled.length > 0) {
    todos.push({
      priority: 'p0',
      title: isEn
        ? `Ship ${current.delayedUnfulfilled.length} orders that have been waiting more than 24 hours`
        : `尽快发出 ${current.delayedUnfulfilled.length} 笔积压订单（已超 24 小时未发货）`,
      reason: isEn
        ? `${current.over48h} orders took more than 48 hours to ship this period. Orders left unshipped for more than 24 hours can lead to customer questions, cancellations, or refunds.`
        : `本期有 ${current.over48h} 笔订单超过 48 小时才发出。订单拖太久不发货，顾客更容易催单、取消甚至申请退款。`,
      action: isEn
        ? 'Ask the warehouse to pack and ship these orders first, then send customers a short update about when their orders will ship.'
        : '让仓库优先打包这些订单并发出，再主动给顾客一个预计发货时间。'
    });
  }

  // P0: Low stock on a product that sold this period.
  const criticalStockouts = inventoryRisks.filter(i => i.isTopSeller && i.qty <= 3);
  if (criticalStockouts.length > 0) {
    const firstItem = criticalStockouts[0];
    todos.push({
      priority: 'p0',
      title: isEn
        ? `Restock now: "${firstItem.productTitle}" has only ${firstItem.qty} units left`
        : `热销品「${firstItem.productTitle}」只剩 ${firstItem.qty} 件，尽快补货`,
      reason: isEn
        ? 'This product sold during the reporting period and its available stock is low. Selling out can interrupt orders and waste active promotion spend.'
        : '这款商品本期有成交，但可卖库存已经很低。卖完会影响正常出单，也可能浪费正在投放的推广费用。',
      action: isEn
        ? 'Confirm the next delivery date with the supplier. If replenishment will be late, pause promotion or clearly offer a pre-order with the expected ship date.'
        : '先和供应商确认到货日期；若补货赶不上，就暂停推广，或明确写清预计发货时间后再开放预售。'
    });
  }

  // P1: Help customers add a matching item to one-item orders.
  if (current.singleItemRatio >= 85) {
    const topPair = current.coOccurrence[0]?.pair || (isEn ? 'a top product and a complementary accessory' : '爆款与配套配件');
    todos.push({
      priority: 'p1',
      title: isEn
        ? `Try a simple product bundle: ${current.singleItemRatio.toFixed(1)}% of orders contain only one item`
        : `做组合套餐：${current.singleItemRatio.toFixed(1)}% 的订单只有 1 件`,
      reason: isEn
        ? `Customers buy ${current.upt.toFixed(2)} items per order on average. Orders show that products such as "${topPair}" are often bought together.`
        : `顾客平均每单只买 ${current.upt.toFixed(2)} 件；订单数据显示「${topPair}」经常被一起加购。`,
      action: isEn
        ? `On the best-selling product page, add a clear “buy together” option, such as “Add the matching accessory for ${currencySymbol}19.99”.`
        : `在热销商品详情页加一个清楚的“搭配购买”选项，例如“加 ${currencySymbol}19.99 带走配套配件”。`
    });
  }

  // P2: Reuse a promo code that was used this period.
  const topAffiliate = current.promoCodes.find(p => p.code !== 'Auto / Promotion');
  if (topAffiliate) {
    todos.push({
      priority: 'p2',
      title: isEn
        ? `Keep using promo code ${topAffiliate.code}: it was used in ${topAffiliate.count} orders`
        : `继续用优惠码 ${topAffiliate.code}：已带来 ${topAffiliate.count} 笔订单`,
      reason: isEn
        ? 'This code was used by real customers this period. It is worth checking which campaign, creator, or partner shared it before expanding that activity.'
        : '这个码本期被真实顾客用过。先弄清它来自哪场活动、哪位达人还是哪个合作方，再决定是否加大投放。',
      action: isEn
        ? 'Keep the code in the campaign that generated these orders, and give each new partner a separate code so you can compare results next time.'
        : '保留这个码对应的有效活动；给新的合作方各发一个不同的码，下次就能直接比较谁带来了订单。'
    });
  }

  // P3: Check whether discounts are being used too often.
  if (current.discountPenetration >= 50) {
    todos.push({
      priority: 'p3',
      title: isEn
        ? `Review discounts: ${current.discountPenetration.toFixed(1)}% of orders used one`
        : `优惠是否用太多：${current.discountPenetration.toFixed(1)}% 的订单都用了券`,
      reason: isEn
        ? 'When many orders use an unrestricted discount, it can reduce profit without encouraging customers to buy more items.'
        : '太多订单都能直接打折，往往只是少收了钱，却没让顾客多买一件。',
      action: isEn
        ? `Test a minimum-spend offer instead, such as “Spend ${currencySymbol}80, save ${currencySymbol}10” or “Buy 2, get 20% off the second item”.`
        : `试试改成有门槛的优惠，例如“满 ${currencySymbol}80 减 ${currencySymbol}10”或“第 2 件 8 折”。`
    });
  }

  // P4: Prepare for an upcoming selling season.
  if (seasonalAdvisory) {
    todos.push({
      priority: 'p4',
      title: isEn
        ? `Prepare for ${seasonalAdvisory.name} (about ${seasonalAdvisory.daysLeft} days away)`
        : `提前备货 ${seasonalAdvisory.name}：还有约 ${seasonalAdvisory.daysLeft} 天`,
      reason: isEn
        ? 'Major shopping periods need product images, stock, offers, and customer messages ready several weeks early.'
        : '大促节点最好提前几周准备：商品图、库存、优惠和给顾客的通知都要就位。',
      action: isEn ? seasonalAdvisory.actionEn : seasonalAdvisory.actionZh
    });
  }

  return todos;
}

function generateExecutiveSummary({ current, previous, gmvDelta, currencySymbol, isEn }) {
  if (current.ordersCount === 0) {
    if (isEn) {
      return previous.ordersCount === 0
        ? 'No orders were found in either this period or the previous period. There is nothing to chase for shipping, restocking, or product bundles yet; first check the date range, order source, and app permissions.'
        : `No orders were found in this period, compared with ${previous.ordersCount} orders in the previous period. There is nothing to chase for shipping, restocking, or product bundles yet; first check the date range, order source, and app permissions.`;
    }
    return previous.ordersCount === 0
      ? '这段时间与上一段时间都没有订单。暂时没有要催发、补货或做组合购买的活儿；请先核对时间范围、订单来源和店铺权限。'
        : `这段时间没有订单，而上一段时间有 ${previous.ordersCount} 笔。暂时没有要催发、补货或做组合购买的活儿；请先核对时间范围、订单来源和店铺权限。`;
  }
  if (isEn) {
    return `Sales were ${currencySymbol}${current.gmv.toFixed(2)} from ${current.ordersCount} orders (${gmvDelta}% compared with the previous period). The average order was ${currencySymbol}${current.aov.toFixed(2)}. ${current.singleItemRatio.toFixed(0)}% of orders contained one item, customers bought ${current.upt.toFixed(2)} items per order on average, ${current.discountPenetration.toFixed(0)}% of orders used a discount, and orders took ${current.avgLeadTimeHours.toFixed(1)} hours on average to ship. ${current.delayedUnfulfilled.length} orders still need to ship.`;
  }
  return `本期销售额 ${currencySymbol}${current.gmv.toFixed(2)}，共 ${current.ordersCount} 笔订单，环比上一段时间 ${gmvDelta}%。客单价 ${currencySymbol}${current.aov.toFixed(2)}；其中 ${current.singleItemRatio.toFixed(0)}% 的订单只买了 1 件，单均 ${current.upt.toFixed(2)} 件，${current.discountPenetration.toFixed(0)}% 的订单用了优惠。订单平均在下单后 ${current.avgLeadTimeHours.toFixed(1)} 小时发出，目前仍有 ${current.delayedUnfulfilled.length} 笔待发货。`;
}
