-- ============================================
-- AUTO-CONFIRM BEFORE INSERT (Safest Bypass)
-- ============================================

-- 1. Drop the old RPC function if it exists
DROP FUNCTION IF EXISTS public.create_user_bypass(text, text, text, text);

-- 2. Create the BEFORE INSERT trigger function
CREATE OR REPLACE FUNCTION public.auto_confirm_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Set the confirmation time before GoTrue saves the user
  NEW.email_confirmed_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Attach it to auth.users BEFORE INSERT
DROP TRIGGER IF EXISTS auto_confirm_user_trigger ON auth.users;

CREATE TRIGGER auto_confirm_user_trigger
BEFORE INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.auto_confirm_user();
