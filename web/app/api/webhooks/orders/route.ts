import {
    sendOrderNotification,
    formatPhoneForEvolution,
} from "@/lib/evolution-api";
import getShopify from "@/lib/shopify/initialize-context";
import { addHandlers } from "@/lib/shopify/register-webhooks";
import { headers } from "next/headers";

// Shopify order webhook payload types
interface ShopifyLineItem {
    title: string;
    quantity: number;
    vendor: string;
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

export async function POST(req: Request) {
    const topic = (await headers()).get("x-shopify-topic") as string;

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

        // Extract order details
        const orderDetails = {
            orderNumber: order.order_number.toString(),
            firstName: order.customer?.first_name || "Customer",
            items: order.line_items.map((item) => ({
                title: item.title,
                quantity: item.quantity,
                vendor: item.vendor,
            })),
            totalPrice: order.total_price,
            currency: order.currency,
            vendors: order.line_items.map((item) => item.vendor).filter(Boolean),
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
