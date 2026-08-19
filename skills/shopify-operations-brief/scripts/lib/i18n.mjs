// Internationalization dictionary for shopify-operations-brief

export const I18N = {
  'zh-CN': {
    title: 'Shopify 店铺经营概览',
    subtitle: '销售、发货、库存与优惠，一目了然',
    periodPill: '统计周期',
    compareLabel: '与上一周期对比',
    generatedAt: '生成时间',
    coreSummary: '本期核心结论',

    // KPIs
    gmvTitle: '销售额',
    discountPenetration: '优惠订单占比',
    discountGiven: '优惠金额',
    aovTitle: '客单价',
    itemsPerOrder: '每单件数',
    uptLabel: '件',
    singleItemRatio: '单件订单占比',
    leadTimeTitle: '平均发货时效',
    hours: '小时',
    over48hOrders: '笔发货超 48 小时',
    delayedOrdersCount: '笔订单超 24 小时未发',
    globalTitle: '订单地区分布',
    countriesCount: '个国家/地区',
    otherMarketsRatio: '其他国家和地区',
    noOrderData: '暂无订单数据',

    // Deep modules
    basketTitle: '购物篮：顾客常一起买什么',
    basketTag: '单均件数',
    singleItem: '单件订单',
    singleItemSub: '建议做搭配推荐，提高件数',
    multiItem: '多件订单',
    multiItemSub: '多件订单客单价更高',
    cooccurHeader: '常被一起加购的组合：',
    cooccurTimes: '在 {n} 笔订单中一起出现',
    noCooccur: '本期暂无多件订单数据',

    discountTitle: '优惠与促销分析',
    discountTag: '优惠订单占比 {pct}%',
    discountAov: '用券订单客单价',
    discountAovSub: '{n} 笔用券',
    fullPriceAov: '原价订单客单价',
    fullPriceAovSub: '{n} 笔原价',
    promoCodesHeader: '用得最多的优惠码：',

    fulfillmentTitle: '发货时效与待发货',
    fulfillmentTag: '发货时效',
    fastTier: '24 小时内发货',
    standardTier: '24–48 小时发货',
    delayedTier: '超 48 小时才发货',
    delayedAlertTitle: '⚠️ 这些订单请尽快发出：',
    orderDelayedHours: '已等待 {h} 小时仍未发货',
    noDelayedOrders: '✅ 本期没有超 24 小时未发货的订单。',

    globalModuleTitle: '地区分布与收款方式',
    globalTag: '地区分布',
    paymentTitle: '主要收款方式：',

    inventoryTitle: '热销商品库存预警',
    inventoryTag: '库存预警',
    stockoutRisk: '⚠️ 库存告急（剩余不足 {threshold} 件）：',
    stockoutSafe: '✅ 本期卖出的商品库存暂时充足。',
    remainingUnits: '仅剩 {qty} 件',

    // To-Do
    todoSectionTitle: '建议接下来这样做',
    todoTag: '按紧急度排序',
    p0Tag: '🔴 立即处理',
    p1Tag: '🟢 本周提销量',
    p2Tag: '🔵 本周推广',
    p3Tag: '🟡 优化优惠',
    p4Tag: '🟣 提前备货',
    actionLabel: '✅ 建议动作：',

    footerText: 'Shopify 店铺经营概览 · Selofy Skill Hub'
  },

  'en': {
    title: 'Shopify Store Performance Overview',
    subtitle: 'Sales, shipping, inventory, and promotions',
    periodPill: 'Reporting period',
    compareLabel: 'Compared with the previous period',
    generatedAt: 'Generated At',
    coreSummary: 'This period at a glance',

    // KPIs
    gmvTitle: 'Sales',
    discountPenetration: 'Orders using a discount',
    discountGiven: 'Discount amount',
    aovTitle: 'Average order value',
    itemsPerOrder: 'Average items per order',
    uptLabel: 'items',
    singleItemRatio: 'Orders with one item',
    leadTimeTitle: 'Average time from order to shipment',
    hours: 'hours',
    over48hOrders: 'orders shipped after 48 hours',
    delayedOrdersCount: 'orders unshipped after 24 hours',
    globalTitle: 'Where orders come from',
    countriesCount: 'countries/regions',
    otherMarketsRatio: 'Other countries/regions',
    noOrderData: 'No order data',

    // Deep modules
    basketTitle: 'How many items customers buy and what they buy together',
    basketTag: 'Items per order',
    singleItem: 'Orders with one item',
    singleItemSub: 'Try suggesting a matching item',
    multiItem: 'Orders with 2 or more items',
    multiItemSub: 'Average value of multi-item orders',
    cooccurHeader: 'Products customers often buy together:',
    cooccurTimes: 'Bought together in {n} orders',
    noCooccur: 'There are no multi-item orders to review this period.',

    discountTitle: 'Promotion results',
    discountTag: '{pct}% of orders used a discount',
    discountAov: 'Orders using a discount',
    discountAovSub: '{n} orders',
    fullPriceAov: 'Orders without a discount',
    fullPriceAovSub: '{n} orders',
    promoCodesHeader: 'Most-used promo codes:',

    fulfillmentTitle: 'Shipping speed and orders still to ship',
    fulfillmentTag: 'Shipping speed',
    fastTier: 'Shipped within 24 hours',
    standardTier: 'Shipped in 24–48 hours',
    delayedTier: 'Shipped after 48 hours',
    delayedAlertTitle: '🚨 Orders that need to ship soon:',
    orderDelayedHours: 'Waiting {h} hours and not shipped yet',
    noDelayedOrders: '🎉 No orders have been unshipped for more than 24 hours.',

    globalModuleTitle: 'Order countries and payment methods',
    globalTag: 'Order locations',
    paymentTitle: 'Common payment methods:',

    inventoryTitle: 'Low-stock reminders for products sold this period',
    inventoryTag: 'Stock reminder',
    stockoutRisk: '🚨 Low-stock reminder (fewer than {threshold} left):',
    stockoutSafe: '✅ Stock looks sufficient for products sold this period.',
    remainingUnits: 'Only {qty} units left',

    // To-Do
    todoSectionTitle: 'What to do next',
    todoTag: 'Sorted by urgency',
    p0Tag: 'Do now (P0)',
    p1Tag: 'Improve sales this week (P1)',
    p2Tag: 'Promote this week (P2)',
    p3Tag: 'Review discounts (P3)',
    p4Tag: 'Prepare ahead (P4)',
    actionLabel: '👉 Suggested next step: ',

    footerText: 'Shopify Store Performance Overview · Selofy Skill Hub'
  }
};

export function getLocaleDict(lang = 'zh-CN') {
  return (lang && lang.toLowerCase().startsWith('en')) ? I18N.en : I18N['zh-CN'];
}
