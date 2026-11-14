-- SantaCrown v7: reconciliation and deployment-readiness patch.
-- Apply after db/001_santacrown.sql and db/002_visibility.sql.
-- Designed for existing ledgers: no payment, refund or event records are changed.

-- Treat an individual payment that was fully refunded or charged back as reversed.
-- A different payment to the same link can still retain its own active rank.
CREATE OR REPLACE FUNCTION public.sc_get_intent_status(p_intent_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_intent public.sc_intents%ROWTYPE;
  v_total bigint;
  v_rank int;
  v_net bigint;
BEGIN
  SELECT * INTO v_intent FROM public.sc_intents WHERE id=p_intent_id;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status','unknown');
  END IF;
  IF v_intent.state <> 'paid' THEN
    RETURN pg_catalog.jsonb_build_object('status',v_intent.state);
  END IF;
  SELECT n.net_cents INTO v_net
    FROM public.sc_payments p
    JOIN public.sc_payment_net n ON n.payment_id=p.payment_id
    WHERE p.intent_id=p_intent_id;
  IF coalesce(v_net,0)=0 THEN
    RETURN pg_catalog.jsonb_build_object('status','reversed','rank',NULL);
  END IF;
  SELECT total_cents,rank INTO v_total,v_rank FROM public.santacrown_leaderboard
    WHERE link=v_intent.link;
  RETURN pg_catalog.jsonb_build_object('status','paid','total_cents',coalesce(v_total,0),'rank',v_rank);
END $$;

-- The public lookup uses an exact parameterized RPC, not a PostgREST filter
-- composed with a user-controlled URL. Always read the moderated public totals.
CREATE OR REPLACE FUNCTION public.sc_public_listing(p_link text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
 SELECT coalesce((
   SELECT pg_catalog.jsonb_build_object('name',name,'link',link,'total_cents',total_cents)
   FROM public.sc_public_totals WHERE link=p_link LIMIT 1
 ),'null'::jsonb);
$$;

-- A version marker protects production against partially applied SQL upgrades.
CREATE TABLE IF NOT EXISTS public.sc_schema_meta (
 id integer PRIMARY KEY CHECK(id=1),
 version integer NOT NULL CHECK(version>=1),
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.sc_schema_meta(id,version) VALUES(1,3)
ON CONFLICT(id) DO UPDATE SET version=greatest(public.sc_schema_meta.version,3),updated_at=now();

REVOKE ALL ON public.sc_schema_meta FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.sc_get_intent_status(uuid) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.sc_public_listing(text) FROM public,anon,authenticated;
GRANT SELECT ON public.sc_schema_meta TO service_role;
GRANT EXECUTE ON FUNCTION public.sc_get_intent_status(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sc_public_listing(text) TO service_role;
ALTER TABLE public.sc_schema_meta ENABLE ROW LEVEL SECURITY;
