// Read-only, paginated Shopify Admin GraphQL data fetcher.

const QUERY_SHOP = `
  query GetShopMetadata {
    shop {
      name
      myshopifyDomain
      currencyCode
      timezoneAbbreviation
      ianaTimezone
      plan { displayName }
    }
  }
`;

const QUERY_ORDERS = `
  query GetPeriodOrders($query: String!, $cursor: String) {
    orders(first: 100, query: $query, after: $cursor, sortKey: CREATED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          createdAt
          displayFulfillmentStatus
          totalPriceSet { shopMoney { amount currencyCode } }
          subtotalPriceSet { shopMoney { amount } }
          totalDiscountsSet { shopMoney { amount } }
          totalRefundedSet { shopMoney { amount } }
          paymentGatewayNames
          shippingAddress { country countryCodeV2 }
          customer { numberOfOrders }
          customerJourneySummary {
            firstVisit { source referrerUrl utmParameters { campaign source medium content } }
            lastVisit { source referrerUrl utmParameters { campaign source medium content } }
          }
          discountApplications(first: 50) {
            edges {
              node {
                ... on DiscountCodeApplication { code }
                ... on ManualDiscountApplication { title }
              }
            }
          }
          lineItems(first: 250) {
            pageInfo { hasNextPage }
            edges {
              node {
                title
                quantity
                originalUnitPriceSet { shopMoney { amount } }
              }
            }
          }
          fulfillments { createdAt status }
          refunds { totalRefundedSet { shopMoney { amount } } }
        }
      }
    }
  }
`;

const QUERY_ABANDONED = `
  query GetAbandonedCheckouts($query: String!, $cursor: String) {
    abandonedCheckouts(first: 100, query: $query, after: $cursor, reverse: true) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          createdAt
          totalPriceSet { shopMoney { amount currencyCode } }
        }
      }
    }
  }
`;

const QUERY_INVENTORY = `
  query GetInventoryHealth($cursor: String) {
    products(first: 100, query: "status:ACTIVE", after: $cursor) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          productType
          variants(first: 250) {
            pageInfo { hasNextPage }
            edges {
              node {
                id
                title
                sku
                inventoryQuantity
                inventoryItem { tracked }
              }
            }
          }
        }
      }
    }
  }
`;

function assertCompleteNestedConnection(connection, label) {
  if (connection?.pageInfo?.hasNextPage) {
    throw new Error(`DATA_TRUNCATED_${label}: The result exceeds the safe per-record limit; narrow the period or use a bulk analysis workflow.`);
  }
}

async function fetchOrders(client, filter) {
  const orders = [];
  let cursor = null;
  do {
    const data = await client.query(QUERY_ORDERS, { query: filter, cursor });
    const connection = data.orders;
    for (const edge of connection?.edges || []) {
      assertCompleteNestedConnection(edge.node.lineItems, 'LINE_ITEMS');
      orders.push(edge.node);
    }
    cursor = connection?.pageInfo?.hasNextPage ? connection.pageInfo.endCursor : null;
  } while (cursor);
  return orders;
}

async function fetchAbandoned(client, filter) {
  const abandoned = [];
  let cursor = null;
  do {
    const data = await client.query(QUERY_ABANDONED, { query: filter, cursor });
    const connection = data.abandonedCheckouts;
    abandoned.push(...(connection?.edges || []).map((edge) => edge.node));
    cursor = connection?.pageInfo?.hasNextPage ? connection.pageInfo.endCursor : null;
  } while (cursor);
  return abandoned;
}

async function fetchProducts(client) {
  const products = [];
  let cursor = null;
  do {
    const data = await client.query(QUERY_INVENTORY, { cursor });
    const connection = data.products;
    for (const edge of connection?.edges || []) {
      assertCompleteNestedConnection(edge.node.variants, 'PRODUCT_VARIANTS');
      products.push(edge.node);
    }
    cursor = connection?.pageInfo?.hasNextPage ? connection.pageInfo.endCursor : null;
  } while (cursor);
  return products;
}

export async function fetchShopMetadata(client) {
  const data = await client.query(QUERY_SHOP);
  if (!data.shop) throw new Error('SHOP_METADATA_UNAVAILABLE: Shopify did not return the shop metadata.');
  return data.shop;
}

export async function fetchAllDiagnosticData(client, periods, shopMeta = null) {
  const metadata = shopMeta || await fetchShopMetadata(client);
  const [products, currentOrders, currentAbandoned, previousOrders, previousAbandoned] = await Promise.all([
    fetchProducts(client),
    fetchOrders(client, periods.current.filter),
    fetchAbandoned(client, periods.current.filter),
    fetchOrders(client, periods.previous.filter),
    fetchAbandoned(client, periods.previous.filter),
  ]);

  return {
    shopMeta: metadata,
    products,
    current: { orders: currentOrders, abandoned: currentAbandoned },
    previous: { orders: previousOrders, abandoned: previousAbandoned },
  };
}
