export const API_VERSIONS = ["2026-07", "2026-04", "2026-01"];

export const MODULES = [
  "foundation",
  "domain",
  "policies",
  "checkout",
  "markets_shipping",
  "catalog",
  "navigation",
  "seo_theme",
  "marketing_discounts",
  "content_trust",
];

export const GROUP_WEIGHTS = {
  launch_payment: 25,
  markets_shipping: 20,
  catalog: 20,
  trust_navigation: 15,
  seo_theme: 10,
  marketing_discounts: 10,
};

export const MODULE_GROUPS = {
  foundation: "launch_payment",
  domain: "launch_payment",
  policies: "trust_navigation",
  checkout: "launch_payment",
  markets_shipping: "markets_shipping",
  catalog: "catalog",
  navigation: "trust_navigation",
  seo_theme: "seo_theme",
  marketing_discounts: "marketing_discounts",
  content_trust: "trust_navigation",
};

export const HIGH_IMPACT_ACTIONS = new Set([
  "product_publish",
  "inventory_quantity_set",
  "inventory_policy_update",
  "discount_update",
  "market_update",
  "market_shipping_update",
  "delivery_profile_update",
  "checkout_accounts_update",
  "theme_files_upsert",
]);
