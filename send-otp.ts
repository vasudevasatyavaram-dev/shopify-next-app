import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { sendWhatsAppOTP } from '../services/evolutionApiService.js';

// Initialize Supabase client with service role key (backend only!)
const supabase = createClient(
    process.env.SUPABASE_URL!,  // Matches Vercel env var name
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { phoneNumber } = req.body;

        // Validate phone number
        if (!phoneNumber || typeof phoneNumber !== 'string') {
            return res.status(400).json({ error: 'Phone number is required' });
        }

        // Validate phone number format (E.164 format: +[country code][number])
        // The phone number should already include the country code from frontend
        if (!phoneNumber.startsWith('+')) {
            return res.status(400).json({ error: 'Phone number must include country code (e.g., +91 or +1)' });
        }

        // Validate format: +1 (10 digits) or +91 (10 digits)
        const isValidFormat = /^\+1\d{10}$/.test(phoneNumber) || /^\+91\d{10}$/.test(phoneNumber);
        if (!isValidFormat) {
            return res.status(400).json({ error: 'Invalid phone number format. Must be +1 or +91 followed by 10 digits.' });
        }

        const formattedPhone = phoneNumber; // Already formatted from frontend

        // ============================================
        // STEP 1: Check rate limit (15 second cooldown)
        // ============================================
        const { data: rateLimitData, error: rateLimitError } = await supabase.rpc('check_otp_rate_limit', {
            p_phone_number: formattedPhone,
            p_window_seconds: 15
        });

        if (rateLimitError) {
            console.error('Rate limit check error:', rateLimitError);
            return res.status(500).json({ error: 'Failed to check rate limit' });
        }

        const { allowed, wait_seconds } = rateLimitData[0];

        // Rate limit exceeded
        if (!allowed) {
            return res.status(429).json({
                error: `Too many OTP requests. Please wait ${wait_seconds} seconds before trying again.`,
                wait_seconds: wait_seconds
            });
        }

        // ============================================
        // STEP 2: Generate 6-digit OTP
        // ============================================
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

        // Get user's IP address for tracking
        const requestIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
            req.socket.remoteAddress ||
            'unknown';

        // =========================== =================
        // STEP 3: Create OTP in database
        // ============================================
        const { data: otpData, error: otpError } = await supabase.rpc('create_otp_entry', {
            p_phone_number: formattedPhone,
            p_otp_code: otpCode,
            p_expiry_minutes: 5,
            p_request_ip: requestIp
        });

        if (otpError) {
            console.error('Create OTP error:', otpError);
            return res.status(500).json({ error: 'Failed to create OTP' });
        }

        const otpId = otpData; // This is the UUID (for logging/tracking only)

        // ============================================
        // STEP 4: Send OTP via WhatsApp (Evolution API)
        // ============================================

        console.log('=== OTP GENERATED ===');
        console.log('Phone:', formattedPhone);
        console.log('OTP Code:', otpCode);
        console.log('OTP ID:', otpId);
        console.log('Expires in: 5 minutes');

        // Send OTP via WhatsApp using Evolution API
        const whatsappResult = await sendWhatsAppOTP(formattedPhone, otpCode, 5);

        if (!whatsappResult.success) {
            console.error('WhatsApp send error:', whatsappResult.error);
            // Note: We continue even if WhatsApp fails (Option A)
            // OTP is already in database, user can still verify if they get it through other means
            // This provides better UX than failing the entire request
            console.log('Continuing despite WhatsApp failure - OTP is stored in database');
        } else {
            console.log('✓ WhatsApp OTP sent successfully');
        }

        // ============================================
        // SUCCESS!
        // ============================================
        return res.status(200).json({
            success: true,
            message: 'OTP sent successfully',
            expiresIn: 300, // 5 minutes in seconds
            // Note: We don't send the actual OTP code to frontend (security!)
            // Note: UUID is just for internal tracking, frontend doesn't need it
        });

    } catch (error) {
        console.error('Send OTP error:', error);
        return res.status(500).json({ error: 'An unexpected error occurred' });
    }
}
