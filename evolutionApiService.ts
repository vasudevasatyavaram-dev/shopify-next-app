/**
 * Evolution API Service
 * Handles WhatsApp messaging via Evolution API
 */

// Environment variables
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE_NAME = process.env.EVOLUTION_INSTANCE_NAME;

// Check if we're using ngrok (for SSL workaround)
const isNgrok = EVOLUTION_API_URL?.includes('ngrok');

/**
 * Format phone number for WhatsApp
 * Removes the + prefix as Evolution API expects numbers without it
 * @param phone E.164 format phone number (e.g., +919876543210 or +12125551234)
 * @returns WhatsApp-formatted number (e.g., 919876543210 or 12125551234)
 */
export function formatPhoneForWhatsApp(phone: string): string {
    return phone.replace(/^\+/, '');
}

/**
 * Create OTP message text with branding
 * @param otp 6-digit OTP code
 * @param expiryMinutes Expiry time in minutes
 * @returns Formatted message string
 */
export function createOTPMessageText(otp: string, expiryMinutes: number): string {
    return `Your OTP for themanipalmarketplace is: ${otp}. Will expire in ${expiryMinutes} minutes.`;
}

/**
 * Send WhatsApp OTP message via Evolution API
 * @param phoneNumber E.164 format phone number (e.g., +919876543210 or +12125551234)
 * @param otpCode 6-digit OTP code
 * @param expiryMinutes OTP expiry time in minutes
 * @returns Promise with success status and optional error
 */
export async function sendWhatsAppOTP(
    phoneNumber: string,
    otpCode: string,
    expiryMinutes: number = 5
): Promise<{ success: boolean; error?: string }> {
    try {
        // Validate environment variables
        if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE_NAME) {
            console.error('Evolution API configuration missing:', {
                hasUrl: !!EVOLUTION_API_URL,
                hasKey: !!EVOLUTION_API_KEY,
                hasInstance: !!EVOLUTION_INSTANCE_NAME
            });
            return {
                success: false,
                error: 'Evolution API not configured'
            };
        }

        // Format phone number for WhatsApp
        const whatsappNumber = formatPhoneForWhatsApp(phoneNumber);

        // Create message text
        const messageText = createOTPMessageText(otpCode, expiryMinutes);

        // Build Evolution API endpoint
        const endpoint = `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE_NAME}`;

        console.log('Sending WhatsApp OTP:', {
            endpoint,
            to: phoneNumber,
            whatsappNumber
        });

        // Make API request
        // Note: For ngrok, we need to handle SSL certificate issues
        const fetchOptions: any = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': EVOLUTION_API_KEY
            },
            body: JSON.stringify({
                number: whatsappNumber,
                text: messageText
            })
        };

        // Workaround for ngrok SSL issues (development only)
        if (isNgrok && typeof process !== 'undefined') {
            // @ts-ignore - Node.js specific
            const https = await import('https');
            fetchOptions.agent = new https.Agent({
                rejectUnauthorized: false
            });
        }

        const response = await fetch(endpoint, fetchOptions);

        // Handle response
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Evolution API error response:', {
                status: response.status,
                statusText: response.statusText,
                body: errorText
            });

            return {
                success: false,
                error: `Evolution API returned ${response.status}: ${response.statusText}`
            };
        }

        const responseData = await response.json();
        console.log('WhatsApp OTP sent successfully:', {
            to: phoneNumber,
            messageId: responseData?.key?.id
        });

        return { success: true };

    } catch (error) {
        console.error('Error sending WhatsApp OTP:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}
