CREATE TABLE IF NOT EXISTS public.otp_storage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL,
  otp_code TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER DEFAULT 0,
  verified BOOLEAN DEFAULT FALSE,
  request_ip TEXT,
  CONSTRAINT unique_active_otp UNIQUE (phone_number, verified)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_otp_storage_phone ON public.otp_storage(phone_number);
CREATE INDEX IF NOT EXISTS idx_otp_storage_expires ON public.otp_storage(expires_at);

-- Enable RLS (Row Level Security)
ALTER TABLE public.otp_storage ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Block all direct access to otp_storage
-- Users should ONLY access via SECURITY DEFINER functions
CREATE POLICY "Block direct access to otp_storage"
  ON public.otp_storage
  FOR ALL
  USING (false);  -- Deny all direct queries

-- Only service_role can access (our functions use SECURITY DEFINER)
-- This is already handled by SECURITY DEFINER, but we make it explicit

-- Function to create new OTP (invalidates old ones)
CREATE OR REPLACE FUNCTION public.create_otp_entry(
  p_phone_number TEXT,
  p_otp_code TEXT,
  p_expiry_minutes INTEGER DEFAULT 5,
  p_request_ip TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_otp_id UUID;
  deleted_count INTEGER;
BEGIN
  -- CRITICAL: Delete ALL existing OTPs for this phone number (both verified and unverified)
  -- This ensures only ONE valid OTP exists at a time
  DELETE FROM public.otp_storage
  WHERE phone_number = p_phone_number;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  IF deleted_count > 0 THEN
    RAISE NOTICE 'Invalidated % existing OTP(s) for phone %', deleted_count, p_phone_number;
  END IF;
  
  -- Create the new OTP
  INSERT INTO public.otp_storage (
    phone_number,
    otp_code,
    expires_at,
    request_ip
  ) VALUES (
    p_phone_number,
    p_otp_code,
    NOW() + (p_expiry_minutes || ' minutes')::INTERVAL,
    p_request_ip
  )
  RETURNING id INTO new_otp_id;
  
  RAISE NOTICE 'Created new OTP for phone % (ID: %)', p_phone_number, new_otp_id;
  RETURN new_otp_id;
END;
$$;

-- Function to verify OTP
CREATE OR REPLACE FUNCTION public.verify_otp(
  p_phone_number TEXT,
  p_otp_code TEXT
)
RETURNS TABLE(success BOOLEAN, message TEXT, remaining_attempts INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_otp RECORD;
  v_remaining INTEGER;
BEGIN
  -- Find the OTP entry
  SELECT * INTO v_otp
  FROM public.otp_storage
  WHERE phone_number = p_phone_number
    AND verified = FALSE
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- No OTP found
  IF v_otp IS NULL THEN
    RETURN QUERY SELECT FALSE, 'No OTP found for this phone number'::TEXT, 0::INTEGER;
    RETURN;
  END IF;
  
  -- Check if expired
  IF v_otp.expires_at < NOW() THEN
    DELETE FROM public.otp_storage WHERE id = v_otp.id;
    RETURN QUERY SELECT FALSE, 'OTP has expired'::TEXT, 0::INTEGER;
    RETURN;
  END IF;
  
  -- Check if max attempts reached
  IF v_otp.attempts >= 5 THEN
    DELETE FROM public.otp_storage WHERE id = v_otp.id;
    RETURN QUERY SELECT FALSE, 'Maximum verification attempts exceeded'::TEXT, 0::INTEGER;
    RETURN;
  END IF;
  
  -- Increment attempt counter
  UPDATE public.otp_storage
  SET attempts = attempts + 1
  WHERE id = v_otp.id;
  
  v_remaining := 5 - (v_otp.attempts + 1);
  
  -- Check if OTP matches
  IF v_otp.otp_code = p_otp_code THEN
    -- Success! Mark as verified and delete
    DELETE FROM public.otp_storage WHERE id = v_otp.id;
    RETURN QUERY SELECT TRUE, 'OTP verified successfully'::TEXT, v_remaining::INTEGER;
  ELSE
    -- Wrong OTP
    RETURN QUERY SELECT FALSE, 'Invalid OTP code'::TEXT, v_remaining::INTEGER;
  END IF;
END;
$$;

-- Cleanup function (same as before)
CREATE OR REPLACE FUNCTION public.cleanup_expired_otps()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.otp_storage
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RAISE NOTICE 'Deleted % expired OTP entries', deleted_count;
  RETURN deleted_count;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.create_otp_entry(TEXT, TEXT, INTEGER, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_otp(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_otps() TO service_role;