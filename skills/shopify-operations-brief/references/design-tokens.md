# Report layout and writing standard

This document defines the layout and writing rules for the single-file HTML report produced by `shopify-operations-brief`. Every visible label must use everyday ecommerce language and tell the reader what they are seeing.

---

## 1. Colour palette

```css
:root {
  /* Surfaces & Structural Borders */
  --bg: #fafafa;
  --card-bg: #ffffff;
  --card-subtle: #f8fafc;
  --border: #e4e4e7;
  --border-subtle: #f4f4f5;

  /* Typography */
  --text-main: #09090b;
  --text-muted: #71717a;
  --text-light: #a1a1aa;
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;

  /* Semantic Status Tokens */
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

  /* Border Radii */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
}
```

---

## 2. Report structure and plain-language labels

1. **Header Component**:
   - Store identifier badge with store icon.
   - Main page title: `Shopify 店铺经营概览` / `Shopify Store Performance Overview`.
   - Selected period (for example `2026.08.08 - 2026.08.15`) and the previous period used for comparison.
2. **This period at a glance**:
   - White card with 4px dark neutral left border (`#09090b`), summarizing high-impact highlights and urgent risks in plain operator language.
3. **Four main numbers**:
   - Card 1: Sales and the share of orders that used a discount.
   - Card 2: Average order value, average items per order, and the share of orders with one item.
   - Card 3: Average time from order to shipment and orders that took too long to ship.
   - Card 4: Where orders came from.
4. **Details (two columns)**:
   - `顾客一次买几件、常一起买什么` / `What customers buy together`.
   - `优惠活动效果` / `Promotion results`.
   - `发货速度与待发货订单` / `Shipping speed and orders still to ship`.
   - `订单国家和付款方式` / `Order countries and payment methods`.
   - `热销商品库存提醒` / `Low-stock reminders for products sold this period`.
5. **What to do next**:
   - Use clear priority labels such as `现在处理（P0）` and `本周提升销售（P1）`.
   - Each card contains a short title, a plain explanation, and one concrete suggested next step.
