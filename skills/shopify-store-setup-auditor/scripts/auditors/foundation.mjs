import { adminAudit, pass, warn } from "./helpers.mjs";

const QUERY = `query FoundationAudit { shop { id name email contactEmail currencyCode unitSystem weightUnit myshopifyDomain primaryDomain { host sslEnabled } } onlineStore { passwordProtection { enabled } } }`;

export async function audit({ config }) {
  return adminAudit("foundation", config, QUERY, {}, (data) => {
    const shop = data.shop || {};
    const password = data.onlineStore?.passwordProtection?.enabled;
    return [
      shop.name && shop.email ? pass("foundation", "store-profile", "Store name and sender email are present.", { name: shop.name, email: shop.email }) : warn("foundation", "store-profile", "Store profile or sender email is missing.", { name: shop.name || null, email: shop.email || null }, 2, null, { path: "Settings > Store details", reason: "Review the store profile and sender email manually; this skill does not update shop identity fields." }),
      password === false ? pass("foundation", "password-protection", "Online store password protection is off.", { enabled: false }, 3) : warn("foundation", "password-protection", "Password protection may block public visitors.", { enabled: password ?? null }, 3, null, { path: "Settings > Online store > Preferences", reason: "Shopify does not expose a supported API to disable password protection." }),
      shop.currencyCode && shop.weightUnit && shop.unitSystem ? pass("foundation", "units", "Store currency and measurement units are configured.", { currencyCode: shop.currencyCode, weightUnit: shop.weightUnit, unitSystem: shop.unitSystem }) : warn("foundation", "units", "Currency or measurement units need merchant review.", { currencyCode: shop.currencyCode, weightUnit: shop.weightUnit, unitSystem: shop.unitSystem }, 1, null, { path: "Settings > Store details", reason: "Confirm currency and measurement units manually; this skill does not change shop-level defaults." }),
    ];
  });
}
