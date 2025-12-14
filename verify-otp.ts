import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Initialize Supabase client with Service Role Key for admin access
const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { phoneNumber, otp } = req.body;

    if (!phoneNumber || !otp) {
        return res.status(400).json({ error: 'Phone number and OTP are required' });
    }

    // Phone number should already include country code from frontend (+91 or +1)
    // No need to add prefix - use as-is
    const formattedPhone = phoneNumber;

    try {
        // 1. Verify OTP using Database RPC
        const { data: verifyResult, error: verifyError } = await supabase.rpc('verify_otp', {
            p_phone_number: formattedPhone,
            p_otp_code: otp
        });

        if (verifyError) {
            console.error('Error verifying OTP:', verifyError);
            return res.status(500).json({ error: 'Database error during verification' });
        }

        // Check if verification was successful (RPC returns a table with success boolean)
        // The RPC returns an array of objects, we take the first one
        const result = verifyResult[0];

        if (!result || !result.success) {
            return res.status(400).json({
                error: result?.message || 'Invalid OTP',
                remaining_attempts: result?.remaining_attempts
            });
        }

        // 2. OTP is valid! Now handle User Session
        // Check if user exists
        const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();

        if (userError) {
            console.error('Error listing users:', userError);
            return res.status(500).json({ error: 'Auth error' });
        }

        // Find user by phone number (formatting might be needed depending on how it's stored)
        // Assuming phone number is stored as is or we search by phone metadata
        // For simplicity/robustness in this demo, we'll try to get by phone if possible or just create

        // Better approach: Try to create user. If exists, it will fail, then we get the user.
        // Actually, listUsers is slow. Let's try to create a dummy email for this phone user if needed
        // Or simpler: Just use the phone number as the unique identifier.

        let userId;

        // Check if user exists by phone number
        // Note: Supabase Auth doesn't have a direct "getUserByPhone" in admin API easily exposed without listUsers filter
        // We will use a workaround: Try to create the user with phone. If it fails (already exists), we sign them in.

        // However, we need the User ID to create a session.
        // Let's try to find the user first.
        // Find user by exact phone number match
        const existingUser = users.find(u => u.phone === formattedPhone);

        if (existingUser) {
            userId = existingUser.id;
        } else {
            // Create new user
            const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
                phone: formattedPhone,
                phone_confirm: true, // Auto-confirm since we verified OTP
                user_metadata: { phone_number: formattedPhone }
            });

            if (createError) {
                console.error('Error creating user:', createError);
                return res.status(500).json({ error: 'Failed to create user account' });
            }
            userId = newUser.user.id;
        }

        // 3. Generate Session (Magic Link / OTP style login but programmatically)
        // Since we verified the OTP ourselves, we can now issue a token.
        // However, Supabase Admin API doesn't have a simple "createSession(userId)" that returns a full session object 
        // without a password or magic link flow usually.

        // ALTERNATIVE: We can use `signInWithOtp` on the server side? No, that sends an OTP.
        // We need to mint a token. 

        // Actually, the cleanest way with Supabase Admin is to generate a link or just sign in.
        // But we want to return the session *directly*.

        // Let's use `generateLink` which returns a session in some contexts, or `signInWithPhone`?
        // Wait, we are the server. We can just sign them in if we have the admin rights?
        // No, `signInWith...` is client side usually.

        // CORRECT APPROACH FOR SERVER-SIDE SESSION MINTING:
        // We can't easily "mint" a JWT without using the private key directly which Supabase wraps.
        // BUT, we can use `supabase.auth.admin.generateLink({ type: 'magiclink', email: ... })` 
        // OR, since we have the phone number, we can use `verifyOtp` from the auth api?
        // No, we built our OWN otp system.

        // Workaround for "Logging in" a user without their password (since we verified them):
        // We can't just "get" a token. 
        // We have to use a custom flow or...

        // WAIT! If we are using Supabase Auth, we should have used Supabase's `signInWithOtp` to send the SMS.
        // But we are using Evolution API + Our Own SQL Table.
        // So Supabase Auth *doesn't know* we verified them.

        // We need to tell Supabase Auth "Trust me, this user is verified, give me a token".
        // There isn't a direct API for this in the JS client for security reasons (unless we sign a JWT ourselves).

        // OPTION A: Sign a JWT ourselves using the JWT secret.
        // OPTION B: Create a "Magic Link" and verify it immediately? (Too complex)
        // OPTION C: Update the user with a dummy password and sign them in? (Hack)

        // Let's go with OPTION A (Sign JWT) if we had the library, but we want to stick to standard Supabase.
        // Actually, `supabase.auth.admin.generateLink` with `type: 'magiclink'` returns `action_link` and `hashed_token`.
        // It doesn't give the session directly.

        // Let's look at `signOut` / `signIn`.

        // RE-EVALUATION:
        // If we want to use Supabase Auth sessions, we really should use Supabase's OTP system.
        // But we can't because we need WhatsApp (Evolution API).

        // The standard workaround for "Custom OTP Provider":
        // 1. Verify OTP (Done).
        // 2. Admin gets user ID.
        // 3. Admin generates a custom JWT?

        // Let's try to use `supabase.auth.admin.updateUserById` to set a temporary password, sign in, then remove it? No.

        // Let's use the "Phone Change" trick? No.

        // ACTUALLY: There is `supabase.auth.admin.generateLink({ type: 'signup', ... })`
        // But for login?

        // Let's try this:
        // We can just return "Success" and let the frontend use a "Passwordless" flow? No.

        // OK, the standard way to do "Custom Auth" with Supabase is to mint the JWT.
        // We need `jsonwebtoken` package.
        // But we might not have it installed in the Vercel environment easily without package.json.

        // Let's check if we can use `supabase.auth.signInWithOtp` but *intercept* the SMS?
        // Supabase allows "Suppress OTP" in settings? No.

        // WAIT! We can use `supabase.auth.admin.createUser` which returns a user.
        // Does it return a session? No.

        // Let's assume we can't easily mint a standard Supabase JWT without the secret.
        // We have `SUPABASE_SERVICE_ROLE_KEY`.

        // Let's try to use a "Password" login.
        // 1. We set a random long password for the user: `updateUserById(uid, { password: '...' })`
        // 2. We `signInWithPassword({ phone, password })`
        // 3. We return the session.
        // 4. (Optional) We scramble the password again?

        // This is a bit hacky but works perfectly for "Server-side verified login".

        const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8) + "Aa1!";

        if (existingUser) {
            await supabase.auth.admin.updateUserById(existingUser.id, { password: tempPassword });
        } else {
            // Create with password
            const { error: createError } = await supabase.auth.admin.createUser({
                phone: formattedPhone,
                password: tempPassword,
                phone_confirm: true,
                user_metadata: { phone_number: formattedPhone }
            });
            if (createError) throw createError;
        }

        // Now sign in to get the session
        const { data: sessionData, error: signInError } = await supabase.auth.signInWithPassword({
            phone: formattedPhone,
            password: tempPassword
        });

        if (signInError) {
            console.error('Error generating session:', signInError);
            return res.status(500).json({ error: 'Failed to generate session' });
        }

        return res.status(200).json({
            success: true,
            message: 'OTP verified successfully',
            session: sessionData.session
        });

    } catch (error) {
        console.error('Unexpected error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
