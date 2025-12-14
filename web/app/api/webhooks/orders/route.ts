import {
    sendOrderNotification,
    formatPhoneForEvolution,
    VendorInfo,
} from "@/lib/evolution-api";
import getShopify from "@/lib/shopify/initialize-context";
import { addHandlers } from "@/lib/shopify/register-webhooks";
import { findSessionsByShop } from "@/lib/db/session-storage";
import { headers } from "next/headers";
import { Session } from "@shopify/shopify-api";

// Shopify order webhook payload types
interface ShopifyLineItem {
    title: string;
    quantity: number;
    product_id: number;
}

interface ShopifyCustomer {
    first_name: string;
    last_name: string;
    phone: string | null;
    tags: string;
}

interface ShopifyAddress {
    phone: string | null;
}

interface ShopifyOrder {
    id: number;
    order_number: number;
    customer: ShopifyCustomer | null;
    shipping_address: ShopifyAddress | null;
    billing_address: ShopifyAddress | null;
    line_items: ShopifyLineItem[];
    total_price: string;
    currency: string;
}

// GraphQL response types
interface MetaobjectField {
    key: string;
    value: string;
}

interface VendorMetafieldResponse {
    product: {
        metafield: {
            reference: {
                fields: MetaobjectField[];
            } | null;
        } | null;
    } | null;
}

/**
 * Fetch vendor info from product metafield custom.vendor
 */
async function fetchVendorInfo(
    productId: number,
    session: Session
): Promise<VendorInfo> {
    try {
        const client = new (getShopify().clients.Graphql)({ session });
        const gid = `gid://shopify/Product/${productId}`;

        const { data } = await client.request<VendorMetafieldResponse>(
            `
            query getProductVendor($id: ID!) {
                product(id: $id) {
                    metafield(namespace: "custom", key: "vendor") {
                        reference {
                            ... on Metaobject {
                                fields {
                                    key
                                    value
                                }
                            }
                        }
                    }
                }
            }
        `,
            { variables: { id: gid } }
        );

        const fields = data?.product?.metafield?.reference?.fields || [];
        const name = fields.find((f) => f.key === "name")?.value || "Vendor";
        const phone = fields.find((f) => f.key === "phone")?.value || null;

        return { name, phone };
    } catch (error) {
        console.error(`Error fetching vendor for product ${productId}:`, error);
        return { name: "Vendor", phone: null };
    }
}

export async function POST(req: Request) {
    const topic = (await headers()).get("x-shopify-topic") as string;
    const shopDomain = (await headers()).get("x-shopify-shop-domain") as string;

    // Only process orders/create webhook
    if (topic !== "orders/create") {
        console.log(`Ignoring webhook topic: ${topic}`);
        return new Response(null, { status: 200 });
    }

    // Ensure handlers are registered (serverless behavior workaround)
    const handlers = getShopify().webhooks.getHandlers(topic);
    if (handlers.length === 0) {
        console.log(`No handlers found for topic: ${topic}`);
        addHandlers();
    }

    try {
        const rawBody = await req.text();
        const order: ShopifyOrder = JSON.parse(rawBody);

        console.log("=== ORDER WEBHOOK RECEIVED ===");
        console.log("Order ID:", order.id);
        console.log("Order Number:", order.order_number);
        console.log("Shop:", shopDomain);

        // Extract customer phone number
        const phone =
            order.customer?.phone ||
            order.shipping_address?.phone ||
            order.billing_address?.phone;

        if (!phone) {
            console.log("No phone number found for order - skipping WhatsApp");
            return new Response(null, { status: 200 });
        }

        // Validate phone format before proceeding
        const formattedPhone = formatPhoneForEvolution(phone);
        if (!formattedPhone) {
            console.log("Invalid phone number format - skipping WhatsApp");
            return new Response(null, { status: 200 });
        }

        // Get session for GraphQL calls
        const sessions = await findSessionsByShop(shopDomain);
        if (sessions.length === 0) {
            console.error("No session found for shop:", shopDomain);
            return new Response(
                JSON.stringify({ error: "No session found" }),
                { status: 500 }
            );
        }
        const session = sessions[0];

        // Fetch vendor info for each product
        console.log("Fetching vendor info for", order.line_items.length, "items");
        const vendorPromises = order.line_items.map((item) =>
            fetchVendorInfo(item.product_id, session)
        );
        const vendors = await Promise.all(vendorPromises);

        // Extract order details
        const orderDetails = {
            orderNumber: order.order_number.toString(),
            firstName: order.customer?.first_name || "Customer",
            items: order.line_items.map((item) => ({
                title: item.title,
                quantity: item.quantity,
            })),
            totalPrice: order.total_price,
            currency: order.currency,
            vendors: vendors,
        };

        // Send WhatsApp notification
        const result = await sendOrderNotification(phone, orderDetails);

        if (!result.success) {
            console.error("Failed to send WhatsApp notification:", result.error);
            // Return 500 so Shopify retries the webhook
            return new Response(JSON.stringify({ error: result.error }), {
                status: 500,
            });
        }

        console.log("Order webhook processed successfully");
        return new Response(null, { status: 200 });
    } catch (error) {
        console.error("Order webhook error:", error);
        // Return 500 so Shopify retries
        return new Response(
            JSON.stringify({
                error: error instanceof Error ? error.message : "Unknown error",
            }),
            { status: 500 }
        );
    }
}
