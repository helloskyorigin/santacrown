-- Run AFTER 001_santacrown.sql. Keep verified payments in immutable ledger;
-- hide abusive or fraudulent listings instead of deleting accounting records.
-- Checkout intents can be created by the server only after an explicit form checkbox.
-- This timestamp provides a durable record of checkout consent; versioned terms
-- must be formally approved and published before any real-money checkout.
ALTER TABLE public.sc_intents ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.sc_entries ADD COLUMN IF NOT EXISTS is_visible boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS sc_entries_visibility_idx ON public.sc_entries(is_visible) WHERE is_visible = true;

CREATE OR REPLACE VIEW public.sc_public_totals AS
SELECT t.name,t.link,t.total_cents
FROM public.sc_totals t JOIN public.sc_entries e ON e.id=t.id
WHERE e.is_visible=true AND t.total_cents>=100;

CREATE OR REPLACE VIEW public.santacrown_leaderboard AS
SELECT row_number() over (ORDER BY t.total_cents DESC,t.created_at ASC,t.link ASC)::int AS rank,
       t.name,t.link,t.total_cents,t.created_at
FROM public.sc_totals t JOIN public.sc_entries e ON e.id=t.id
WHERE t.total_cents>0 AND e.is_visible=true;

-- Prevent new checkout intents for hidden listings.
CREATE OR REPLACE FUNCTION public.sc_reject_hidden_entry()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.sc_entries WHERE link=NEW.link AND is_visible=false) THEN
   RAISE EXCEPTION 'LISTING_RESTRICTED';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sc_block_hidden_checkout ON public.sc_intents;
CREATE TRIGGER sc_block_hidden_checkout BEFORE INSERT ON public.sc_intents
FOR EACH ROW EXECUTE FUNCTION public.sc_reject_hidden_entry();

REVOKE ALL ON public.sc_public_totals FROM public,anon,authenticated;
GRANT SELECT ON public.sc_public_totals TO service_role;
REVOKE ALL ON FUNCTION public.sc_reject_hidden_entry() FROM public,anon,authenticated;
-- Moderation is performed by an authorized operator in the Supabase SQL Editor:
-- UPDATE public.sc_entries SET is_visible=false WHERE link='https://abusive.example/';
-- Legal / refund decisions remain separate from visibility; do not delete paid ledger rows.
