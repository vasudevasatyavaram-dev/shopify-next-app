-- Function: Check OTP Rate Limit (server-side, 15 second cooldown)
CREATE OR REPLACE FUNCTION public.check_otp_rate_limit(
  p_phone_number TEXT,
  p_window_seconds INTEGER DEFAULT 15
)
RETURNS TABLE(allowed BOOLEAN, wait_seconds INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last_created TIMESTAMPTZ;
  v_wait INTEGER;
BEGIN
  -- Find most recent OTP creation time for this phone
  SELECT created_at INTO v_last_created
  FROM public.otp_storage
  WHERE phone_number = p_phone_number
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- No previous OTP, allow
  IF v_last_created IS NULL THEN
    RETURN QUERY SELECT TRUE, 0::INTEGER;
    RETURN;
  END IF;
  
  -- Calculate wait time remaining
  v_wait := p_window_seconds - EXTRACT(EPOCH FROM (NOW() - v_last_created))::INTEGER;
  
  IF v_wait > 0 THEN
    -- Too soon, deny
    RETURN QUERY SELECT FALSE, v_wait;
  ELSE
    -- Enough time passed, allow
    RETURN QUERY SELECT TRUE, 0::INTEGER;
  END IF;
END;
$$;

-- Grant permission
GRANT EXECUTE ON FUNCTION public.check_otp_rate_limit(TEXT, INTEGER) TO service_role;