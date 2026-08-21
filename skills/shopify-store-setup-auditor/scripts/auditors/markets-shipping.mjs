import { completed, finding, unavailable } from "../core/results.mjs";
import { safeShopifyRead } from "../core/graphql.mjs";

const FEATURE_QUERY = `query ShippingModelAudit { shop { features { marketDrivenShipping } } }`;
const MARKET_QUERY = `query MarketsAudit { markets(first: 50) { nodes { id name status currencySettings { baseCurrency { currencyCode enabled } localCurrencies roundingEnabled } webPresences(first: 20) { nodes { rootUrls { locale url } } } catalogs(first: 20) { nodes { id } } conditions { regionsCondition { regions(first: 100) { nodes { name ... on MarketRegionCountry { code } } } } } } } }`;
const MARKET_DELIVERY_QUERY = `query MarketDeliveryAudit { markets(first: 50) { nodes { id name delivery { shipping { isEnabled optionDefinitionsCount { count } activeOptionDefinitionsCount: optionDefinitionsCount(active: true) { count } } } } } }`;
const LEGACY_QUERY = `query LegacyDeliveryAudit { deliveryProfiles(first: 20) { nodes { id name profileLocationGroups { locationGroupZones(first: 100) { nodes { zone { id name countries { code { countryCode restOfWorld } } } methodDefinitions(first: 100) { nodes { id name } } } } } } } }`;

function result(module, severity, id, title, evidence, weight, manual = null) {
  return finding({ module, severity, id, title, evidence, source: "admin_api", confidence: "high", weight, manual });
}

export async function audit({ config }) {
  if (!config) return unavailable("markets_shipping", "CONNECTION_NOT_CONFIGURED", "No authorized Shopify Admin connection was supplied.");
  const feature = await safeShopifyRead(config, FEATURE_QUERY);
  const marketDrivenShipping = feature.available ? feature.data.shop?.features?.marketDrivenShipping : null;
  const marketsRead = await safeShopifyRead(config, MARKET_QUERY);
  if (!marketsRead.available) return unavailable("markets_shipping", marketsRead.code, marketsRead.error);
  const markets = marketsRead.data.markets?.nodes || [];
  const findings = [result("markets_shipping", markets.length ? "pass" : "warning", "markets-present", markets.length ? "Markets configuration was returned." : "No Market configuration was returned.", { count: markets.length, marketDrivenShipping }, 2)];
  if (!feature.available) findings.push(result("markets_shipping", "warning", "shipping-model-unavailable", "The market-driven-shipping feature probe is unavailable.", { code: feature.code }, 4, { reason: "Do not infer cross-border shipping coverage from legacy delivery profiles until the current model is known." }));
  for (const market of markets) {
    const regions = market.conditions?.regionsCondition?.regions?.nodes || [];
    const currency = market.currencySettings; const roots = (market.webPresences?.nodes || []).flatMap((presence) => presence.rootUrls || []); const catalogs = market.catalogs?.nodes || [];
    findings.push(result("markets_shipping", market.status === "ACTIVE" && regions.length ? "pass" : "warning", `market-${market.id}`, `Market ${market.name} ${market.status === "ACTIVE" ? "is active" : "needs status review"}.`, { id: market.id, status: market.status, regionCount: regions.length, baseCurrency: currency?.baseCurrency?.currencyCode || null, localCurrencies: currency?.localCurrencies ?? null, catalogCount: catalogs.length, localeCount: roots.length }, 1));
    findings.push(result("markets_shipping", roots.length ? "pass" : "warning", `market-languages-${market.id}`, `Market ${market.name} ${roots.length ? "has" : "has no"} web-presence language URL evidence.`, { marketId: market.id, rootUrls: roots }, 1));
  }
  if (marketDrivenShipping) {
    const delivery = await safeShopifyRead(config, MARKET_DELIVERY_QUERY);
    if (!delivery.available) {
      findings.push(result("markets_shipping", "warning", "market-driven-shipping-unavailable", "Market.delivery.shipping evidence is unavailable.", { code: delivery.code }, 4, { reason: "The shipping read/write path is market-scoped. Legacy delivery profiles cannot establish cross-border coverage for this shop." }));
      return completed("markets_shipping", findings, { source: "admin_api", shippingModel: "market_driven", coverage: "partial" });
    }
    for (const market of delivery.data.markets?.nodes || []) {
      const shipping = market.delivery?.shipping;
      const configured = shipping?.isEnabled && Number(shipping.activeOptionDefinitionsCount?.count ?? 0) > 0;
      findings.push(result("markets_shipping", configured ? "pass" : "critical", `market-shipping-${market.id}`, configured ? `Market ${market.name} has active shipping options.` : `Market ${market.name} has no active shipping options.`, { marketId: market.id, isEnabled: shipping?.isEnabled ?? null, optionDefinitionsCount: shipping?.optionDefinitionsCount?.count ?? null, activeOptionDefinitionsCount: shipping?.activeOptionDefinitionsCount?.count ?? null }, 4, configured ? null : { reason: "Define merchant-approved Market delivery shipping options before launch." }));
    }
    return completed("markets_shipping", findings, { source: "admin_api", shippingModel: "market_driven" });
  }
  if (marketDrivenShipping !== false) return completed("markets_shipping", findings, { source: "admin_api", shippingModel: "unknown", coverage: "partial" });
  const legacy = await safeShopifyRead(config, LEGACY_QUERY);
  if (!legacy.available) {
    findings.push(result("markets_shipping", "warning", "legacy-delivery-unavailable", "Legacy delivery-profile evidence is unavailable.", { code: legacy.code }, 4));
    return completed("markets_shipping", findings, { source: "admin_api", shippingModel: "legacy", coverage: "partial" });
  }
  const profiles = legacy.data.deliveryProfiles?.nodes || [];
  const methods = profiles.flatMap((profile) => profile.profileLocationGroups || []).flatMap((group) => group.locationGroupZones?.nodes || []).flatMap((zone) => zone.methodDefinitions?.nodes || []);
  findings.push(result("markets_shipping", methods.length ? "pass" : "critical", "legacy-delivery-methods", methods.length ? "Legacy delivery profiles contain delivery methods." : "No legacy delivery methods were found.", { profileCount: profiles.length, methodCount: methods.length }, 4, methods.length ? null : { path: "Settings > Shipping and delivery", reason: "Define merchant-approved zones and rates before launch." }));
  return completed("markets_shipping", findings, { source: "admin_api", shippingModel: "legacy" });
}
