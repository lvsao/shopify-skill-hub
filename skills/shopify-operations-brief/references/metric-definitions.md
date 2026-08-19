# What each number means

This report helps with day-to-day store decisions. It is not an accounting report and cannot prove which marketing activity caused a sale. It reads only the data below and stops when Shopify reports an error or the result would be incomplete.

| What you see in the report | How it is calculated | Data used |
| --- | --- | --- |
| Sales | Sum of each order's total amount | Orders in the selected period |
| Product subtotal | Sum of each order's product subtotal; this is not an accounting net-sales figure | Orders in the selected period |
| Average order value | Sales divided by the number of orders | The orders read for this report |
| Average items per order | Total quantity sold divided by the number of orders | Product quantities in each order |
| Orders using a discount | Orders with a discount divided by all orders | Order discount amounts |
| Refund share | Refunded amount divided by sales | Order refund amounts |
| Time from order to shipment | The first shipment time minus the order time | Order and shipment timestamps |
| Orders still waiting to ship | Orders that have not shipped after 24 hours | Order time and shipping status |
| Products bought together | Pairs of product titles that appear in the same order | Product titles in each order |
| Low-stock reminder | Tracked, non-gift-card variants with 0–8 units that sold this period | Active products and their available stock |

## Privacy and data minimization

The fetcher does not request abandoned-checkout emails, customer display names, customer addresses beyond destination country, tracking numbers, or order-line metadata that this report does not use. The generated report remains private because product names, order-derived aggregates, discount codes, and market data are still merchant data.

## Completeness rules

- Orders, abandoned checkouts, and active products are cursor-paginated until complete.
- Each order supports up to 250 line items and each product supports up to 250 variants. If either nested connection is larger, the script stops with a data-truncation error instead of calculating a partial result.
- Any GraphQL error, HTTP error, API-version mismatch, or missing scope stops the run. A successful report never represents a failed request as zero orders, zero stock risk, or healthy fulfillment.
- Date filters are constructed from the shop's IANA timezone. The comparison range has the same number of calendar days as the selected range.

## Interpretation limits

- Sales is the total recorded on orders; it is not a tax, payout, or profit figure.
- Comparing orders with and without discounts describes what happened; it does not prove that a discount caused a sale.
- Low-stock reminders cover only products that sold in the selected period. They are not a full purchasing forecast.
- If there are no orders, the report says so and does not create urgent shipping or stock warnings.
