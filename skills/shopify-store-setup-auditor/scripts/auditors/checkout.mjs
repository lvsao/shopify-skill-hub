import { completed, finding, unavailable } from "../core/results.mjs";
import { safeShopifyRead } from "../core/graphql.mjs";

const QUERY = `query CheckoutEvidenceAudit { shop { paymentSettings { supportedDigitalWallets } } }`;
const CONFIGURATION_QUERY = `query CheckoutConfigurationsAudit { checkoutAndAccountsConfigurations(first: 20) { nodes { id name isPublished updatedAt } } }`;

export async function audit({ config }) {
  if (!config) return unavailable("checkout", "CONNECTION_NOT_CONFIGURED", "No authorized Shopify Admin connection was supplied.");
  const payment = await safeShopifyRead(config, QUERY);
  if (!payment.available) return unavailable("checkout", payment.code, payment.error);
  const wallets = payment.data.shop?.paymentSettings?.supportedDigitalWallets || [];
  const findings = [
    finding({ module: "checkout", id: "wallet-evidence", severity: wallets.length ? "pass" : "warning", title: wallets.length ? "Shopify reports supported accelerated wallets." : "No accelerated-wallet evidence was returned.", evidence: { wallets }, source: "admin_api", weight: 1, manual: wallets.length ? null : { reason: "Confirm card gateway, Shopify Payments status, test/bogus mode, guest checkout, and account requirements in Shopify Admin; these cannot be safely proven or changed here." } }),
    finding({ module: "checkout", id: "payment-test-mode", severity: "warning", title: "Payment activation and test/bogus-mode evidence require manual confirmation.", evidence: { checked: "not exposed by supported Admin query" }, source: "admin_api", weight: 3, manual: { path: "Settings > Payments", reason: "Gateway credentials and test mode are not safely exposed for automated audit or repair." } }),
  ];
  const configurations = await safeShopifyRead(config, CONFIGURATION_QUERY);
  if (!configurations.available) findings.push(finding({ module: "checkout", id: "checkout-configuration-unavailable", severity: "info", title: "Checkout and account configuration evidence is unavailable.", evidence: { code: configurations.code }, source: "admin_api", weight: 0 }));
  else {
    const nodes = configurations.data.checkoutAndAccountsConfigurations?.nodes || [];
    findings.push(finding({ module: "checkout", id: "checkout-configuration", severity: nodes.some((node) => node.isPublished) ? "pass" : "warning", title: nodes.some((node) => node.isPublished) ? "A published checkout and accounts configuration was returned." : "No published checkout and accounts configuration was returned.", evidence: { count: nodes.length, publishedCount: nodes.filter((node) => node.isPublished).length }, source: "admin_api", weight: 1, manual: nodes.length ? null : { path: "Settings > Checkout", reason: "Confirm guest checkout and account requirements manually." } }));
  }
  findings.push(finding({ module: "checkout", id: "guest-checkout", severity: "warning", title: "Guest checkout/account requirements require manual confirmation.", evidence: { checked: "configuration may not expose shopper-account requirement" }, source: "manual", weight: 1, manual: { path: "Settings > Customer accounts", reason: "Confirm customers can complete checkout without an unnecessary account barrier." } }));
  return completed("checkout", findings, { source: "admin_api" });
}
