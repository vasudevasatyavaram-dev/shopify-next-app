/**
 * Evolution API Service for WhatsApp Notifications
 * Sends order confirmation messages via WhatsApp
 */

interface SendMessageResult {
    success: boolean;
    error?: string;
}

export interface VendorInfo {
    name: string;
    phone: string | null; // Domestic format (10 digits)
}

export interface OrderDetails {
    orderNumber: string;
    firstName: string;
    items: Array<{ title: string; quantity: number }>;
    totalPrice: string;
    currency: string;
    vendors: VendorInfo[];
}

/**
 * Format phone number for Evolution API
 * Removes + prefix and validates format
 */
export function formatPhoneForEvolution(phone: string | null): string | null {
    if (!phone) return null;

    // Clean the phone number (remove spaces, dashes)
    let cleaned = phone.replace(/\s+/g, "").replace(/-/g, "");

    // If it starts with +, remove it (Evolution API preference)
    if (cleaned.startsWith("+")) {
        cleaned = cleaned.substring(1);
    }

    // Basic validation: should be numeric and reasonable length (10-15 digits)
    if (!/^\d{10,15}$/.test(cleaned)) {
        return null;
    }

    return cleaned;
}

/**
 * Build WhatsApp message from order details
 * Includes wa.me links for vendor contact
 */
export function buildOrderMessage(order: OrderDetails): string {
    const itemsList = order.items
        .map((item) => `• ${item.title} x${item.quantity}`)
        .join("\n");

    // Deduplicate vendors by name
    const uniqueVendorsMap = new Map<string, VendorInfo>();
    for (const vendor of order.vendors) {
        if (!uniqueVendorsMap.has(vendor.name)) {
            uniqueVendorsMap.set(vendor.name, vendor);
        }
    }
    const uniqueVendors = Array.from(uniqueVendorsMap.values());

    // Build vendor contact list with wa.me links
    const vendorLinks = uniqueVendors.map((v) => {
        if (v.phone) {
            // Add 91 prefix for Indian numbers (domestic format)
            const cleanPhone = v.phone.replace(/\D/g, "");
            const intlPhone = `91${cleanPhone}`;
            return `${v.name}: https://wa.me/${intlPhone}`;
        }
        return v.name;
    });

    return `Thank you for your order ${order.firstName}! 🎉

📦 Order #${order.orderNumber}
${itemsList}

💰 Total: ${order.currency} ${order.totalPrice}

Please contact:
${vendorLinks.join("\n")}`;
}

/**
 * Send order confirmation via WhatsApp using Evolution API
 */
export async function sendOrderNotification(
    phoneNumber: string,
    orderDetails: OrderDetails
): Promise<SendMessageResult> {
    try {
        const apiUrl = process.env.EVOLUTION_API_URL;
        const apiKey = process.env.EVOLUTION_API_KEY;
        const instanceName = process.env.EVOLUTION_INSTANCE_NAME;

        if (!apiUrl || !apiKey || !instanceName) {
            console.error("Evolution API not configured - missing env vars");
            return { success: false, error: "Evolution API not configured" };
        }

        // Format phone number for Evolution API
        const formattedPhone = formatPhoneForEvolution(phoneNumber);
        if (!formattedPhone) {
            console.error("Invalid phone number format:", phoneNumber);
            return { success: false, error: "Invalid phone number format" };
        }

        // Build message
        const message = buildOrderMessage(orderDetails);

        console.log("=== SENDING WHATSAPP ORDER NOTIFICATION ===");
        console.log("Phone:", formattedPhone);
        console.log("Order:", orderDetails.orderNumber);

        // Remove trailing slash from apiUrl if present
        const baseUrl = apiUrl.replace(/\/+$/, "");

        // POST to Evolution API
        const response = await fetch(
            `${baseUrl}/message/sendText/${instanceName}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    apikey: apiKey,
                },
                body: JSON.stringify({
                    number: formattedPhone,
                    text: message,
                }),
            }
        );

        if (!response.ok) {
            const errorData = await response.text();
            console.error("Evolution API error:", errorData);
            return { success: false, error: errorData };
        }

        console.log("✓ WhatsApp order notification sent successfully");
        return { success: true };
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
        console.error("sendOrderNotification error:", errorMessage);
        return { success: false, error: errorMessage };
    }
}
