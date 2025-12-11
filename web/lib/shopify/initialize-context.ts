import "@shopify/shopify-api/adapters/web-api";
import { shopifyApi, ApiVersion, LogSeverity, Shopify } from "@shopify/shopify-api";

// Lazy initialization to prevent build-time errors when env vars are missing
let shopifyInstance: Shopify | null = null;

function getShopify(): Shopify {
  if (!shopifyInstance) {
    const apiKey = process.env.SHOPIFY_API_KEY;
    const apiSecretKey = process.env.SHOPIFY_API_SECRET;
    const hostName = process.env.HOST?.replace(/https?:\/\//, "");

    if (!apiKey || !apiSecretKey || !hostName) {
      throw new Error(
        `Missing required Shopify environment variables. ` +
        `SHOPIFY_API_KEY: ${apiKey ? 'set' : 'missing'}, ` +
        `SHOPIFY_API_SECRET: ${apiSecretKey ? 'set' : 'missing'}, ` +
        `HOST: ${hostName ? 'set' : 'missing'}`
      );
    }

    shopifyInstance = shopifyApi({
      apiKey,
      apiSecretKey,
      scopes: process.env.SCOPES?.split(",") || ["write_products"],
      hostName,
      hostScheme: "https",
      isEmbeddedApp: true,
      apiVersion: ApiVersion.October25,
      logger: {
        level:
          process.env.NODE_ENV === "development"
            ? LogSeverity.Debug
            : LogSeverity.Error,
      },
    });
  }
  return shopifyInstance;
}

export default getShopify;
