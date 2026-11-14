-- SantaCrown v5: immutable, append-only payment accounting.
-- Run in a dedicated Supabase project's SQL Editor BEFORE configuring Vercel.
-- An order is never a leaderboard entry until the provider verifies success.
-- All amounts are integer US cents, never floating point.
create extension if not exists pgcrypto;

create table if not exists public.sc_entries (
  id uuid primary key default gen_random_uuid(),
  link text not null unique check (char_length(link) between 9 and 240 and link like 'https://%'),
  name text not null check (char_length(name) between 2 and 36),
  created_at timestamptz not null default now()
);

create table if not exists public.sc_intents (
  id uuid primary key default gen_random_uuid(),
  link text not null check (char_length(link) between 9 and 240 and link like 'https://%'),
  name text not null check (char_length(name) between 2 and 36),
  target_cents bigint not null check (target_cents >= 100 and target_cents <= 9000000000000000),
  charge_cents bigint not null check (charge_cents >= 100 and charge_cents <= 2000000000),
  state text not null default 'created' check (state in ('created','open','paid','failed')),
  provider_session_id text unique,
  rate_tag text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);
create index if not exists sc_intents_rate_created_idx on public.sc_intents(rate_tag,created_at desc);
create index if not exists sc_intents_link_idx on public.sc_intents(link);

create table if not exists public.sc_payments (
  payment_id text primary key,
  intent_id uuid not null unique references public.sc_intents(id),
  entry_id uuid not null references public.sc_entries(id),
  credit_cents bigint not null check (credit_cents >= 100),
  charged_cents bigint not null check (charged_cents >= credit_cents),
  currency text not null default 'USD' check (currency = 'USD'),
  created_at timestamptz not null default now()
);
create index if not exists sc_payments_entry_idx on public.sc_payments(entry_id);

-- Refunds/disputes have deliberately NO foreign key to payments: they may arrive first.
create table if not exists public.sc_refunds (
  refund_id text primary key,
  payment_id text not null,
  amount_cents bigint not null check (amount_cents > 0),
  created_at timestamptz not null default now()
);
create index if not exists sc_refunds_payment_idx on public.sc_refunds(payment_id);

create table if not exists public.sc_disputes (
  dispute_id text primary key,
  payment_id text not null,
  state text not null check (state in ('opened','won','lost')),
  observed_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index if not exists sc_disputes_payment_idx on public.sc_disputes(payment_id);

create table if not exists public.sc_events (
  event_id text primary key,
  kind text not null,
  created_at timestamptz not null default now()
);

-- Refund and chargeback effects are computed from a ledger, rather than
-- mutating an amount counter. Multiple concurrent successes cannot lose updates.
create or replace view public.sc_payment_net as
select p.entry_id, p.payment_id,
  case when exists (
      select 1 from public.sc_disputes d
      where d.payment_id = p.payment_id and d.state in ('opened','lost')
    ) then 0::bigint
    else floor(
      (p.credit_cents::numeric * greatest(0::bigint,
        p.charged_cents - coalesce(r.total_refunded, 0::bigint))::numeric)
      / p.charged_cents::numeric
    )::bigint
  end as net_cents
from public.sc_payments p
left join (
  select payment_id, sum(amount_cents)::bigint as total_refunded
  from public.sc_refunds group by payment_id
) r on r.payment_id = p.payment_id;

create or replace view public.sc_totals as
select e.id, e.name, e.link, e.created_at,
       coalesce(sum(n.net_cents),0)::bigint as total_cents
from public.sc_entries e
left join public.sc_payment_net n on n.entry_id=e.id
group by e.id,e.name,e.link,e.created_at;

create or replace view public.santacrown_leaderboard as
select row_number() over (order by total_cents desc, created_at asc, link asc)::int as rank,
       name,link,total_cents,created_at
from public.sc_totals where total_cents > 0;

-- Only server-held service role may call RPC or access ledger.
-- These functions run with invoker privileges and require service_role grants.
create or replace function public.sc_prepare_checkout(
  p_link text, p_name text, p_target_cents bigint, p_rate_tag text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_current bigint := 0; v_charge bigint; v_id uuid;
begin
  if p_link is null or char_length(p_link) not between 9 and 240
     or p_link not like 'https://%' or p_name is null or char_length(p_name) not between 2 and 36
     or p_name ~ '[[:cntrl:]]' or p_rate_tag is null or p_rate_tag !~ '^[0-9a-f]{64}$'
     or p_target_cents is null or p_target_cents < 100 or p_target_cents > 9000000000000000 then
    raise exception 'INVALID_CHECKOUT_DETAILS';
  end if;
  -- Soft abuse limit (not a substitute for CDN/WAF).
  if (select count(*) from public.sc_intents where rate_tag=p_rate_tag and created_at > now()-interval '1 hour') >= 8 then
    raise exception 'RATE_LIMIT';
  end if;
  select total_cents into v_current from public.sc_totals where link=p_link;
  v_current := coalesce(v_current,0);
  v_charge := p_target_cents - v_current;
  if v_charge < 100 then raise exception 'TARGET_TOO_LOW'; end if;
  if v_charge > 2000000000 then raise exception 'PROCESSOR_AMOUNT_LIMIT'; end if;
  insert into public.sc_intents(link,name,target_cents,charge_cents,rate_tag)
  values(p_link,p_name,p_target_cents,v_charge,p_rate_tag) returning id into v_id;
  return pg_catalog.jsonb_build_object('intent_id',v_id,'charge_cents',v_charge,'current_cents',v_current,'target_cents',p_target_cents);
end $$;

create or replace function public.sc_mark_checkout(p_intent_id uuid,p_session_id text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_session_id is null or char_length(p_session_id) < 4 then raise exception 'INVALID_SESSION_ID'; end if;
  -- A signed payment webhook can race the checkout API response.
  -- Preserve a paid intent rather than accidentally changing it back to open.
  update public.sc_intents
    set state=case when state='paid' then 'paid' else 'open' end,provider_session_id=p_session_id
  where id=p_intent_id and state in ('created','paid') and provider_session_id is null;
  if not found then raise exception 'SESSION_NOT_PENDING'; end if;
end $$;

create or replace function public.sc_mark_failed(p_intent_id uuid)
returns void language sql security invoker set search_path = '' as $$
  update public.sc_intents set state='failed' where id=p_intent_id and state='created';
$$;

create or replace function public.sc_record_success(
  p_event_id text,p_intent_id uuid,p_payment_id text,p_charged_cents bigint
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_intent public.sc_intents%rowtype;v_entry_id uuid;v_prev public.sc_payments%rowtype;
begin
  if p_event_id is null or p_payment_id is null or char_length(p_event_id) not between 4 and 160
     or char_length(p_payment_id) not between 4 and 160 or p_charged_cents is null then
    raise exception 'INVALID_PAYMENT_EVENT';
  end if;
  select * into v_intent from public.sc_intents where id=p_intent_id for update;
  if not found then raise exception 'UNKNOWN_INTENT'; end if;
  if p_charged_cents < v_intent.charge_cents or p_charged_cents > 2147483647 then
    raise exception 'PAYMENT_AMOUNT_MISMATCH';
  end if;
  select * into v_prev from public.sc_payments where intent_id=p_intent_id or payment_id=p_payment_id;
  if found then
    if v_prev.payment_id != p_payment_id or v_prev.intent_id != p_intent_id
       or v_prev.credit_cents != v_intent.charge_cents then
      raise exception 'PAYMENT_CONFLICT';
    end if;
    return pg_catalog.jsonb_build_object('applied',false,'duplicate',true);
  end if;
  insert into public.sc_events(event_id,kind) values(p_event_id,'payment.succeeded')
  on conflict (event_id) do nothing;
  if not found then return pg_catalog.jsonb_build_object('applied',false,'duplicate',true); end if;
  insert into public.sc_entries(link,name) values(v_intent.link,v_intent.name)
    on conflict (link) do nothing;
  select id into v_entry_id from public.sc_entries where link=v_intent.link for update;
  insert into public.sc_payments(payment_id,intent_id,entry_id,credit_cents,charged_cents)
     values(p_payment_id,p_intent_id,v_entry_id,v_intent.charge_cents,p_charged_cents);
  update public.sc_intents set state='paid' where id=p_intent_id;
  return pg_catalog.jsonb_build_object('applied',true,'duplicate',false);
end $$;

create or replace function public.sc_record_refund(
  p_event_id text,p_refund_id text,p_payment_id text,p_amount_cents bigint
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_existing public.sc_refunds%rowtype;
begin
  if p_event_id is null or p_refund_id is null or p_payment_id is null
     or char_length(p_event_id) not between 4 and 160 or char_length(p_refund_id) not between 4 and 160
     or char_length(p_payment_id) not between 4 and 160 or p_amount_cents <= 0 then
    raise exception 'INVALID_REFUND_EVENT';
  end if;
  select * into v_existing from public.sc_refunds where refund_id=p_refund_id for update;
  if found then
    if v_existing.payment_id != p_payment_id or v_existing.amount_cents != p_amount_cents then
       raise exception 'REFUND_CONFLICT';
    end if;
    return pg_catalog.jsonb_build_object('applied',false,'duplicate',true);
  end if;
  insert into public.sc_events(event_id,kind) values(p_event_id,'refund.succeeded')
    on conflict (event_id) do nothing;
  if not found then return pg_catalog.jsonb_build_object('applied',false,'duplicate',true); end if;
  insert into public.sc_refunds(refund_id,payment_id,amount_cents)
    values(p_refund_id,p_payment_id,p_amount_cents);
  return pg_catalog.jsonb_build_object('applied',true,'duplicate',false);
end $$;

create or replace function public.sc_record_dispute(
  p_event_id text,p_dispute_id text,p_payment_id text,p_state text,p_observed_at timestamptz
) returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if p_event_id is null or p_dispute_id is null or p_payment_id is null
     or char_length(p_event_id) not between 4 and 160 or char_length(p_dispute_id) not between 4 and 160
     or char_length(p_payment_id) not between 4 and 160
     or p_state not in ('opened','won','lost') or p_observed_at is null then
    raise exception 'INVALID_DISPUTE_EVENT';
  end if;
  insert into public.sc_events(event_id,kind) values(p_event_id,'dispute.'||p_state)
    on conflict(event_id) do nothing;
  if not found then return pg_catalog.jsonb_build_object('applied',false,'duplicate',true); end if;
  insert into public.sc_disputes(dispute_id,payment_id,state,observed_at)
    values(p_dispute_id,p_payment_id,p_state,p_observed_at)
    on conflict(dispute_id) do update set state=excluded.state,observed_at=excluded.observed_at,updated_at=now()
    where public.sc_disputes.payment_id=excluded.payment_id
      and public.sc_disputes.observed_at <= excluded.observed_at;
  return pg_catalog.jsonb_build_object('applied',true);
end $$;

create or replace function public.sc_get_intent_status(p_intent_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_intent public.sc_intents%rowtype;v_total bigint;v_rank int;
begin
  select * into v_intent from public.sc_intents where id=p_intent_id;
  if not found then return pg_catalog.jsonb_build_object('status','unknown'); end if;
  if v_intent.state <> 'paid' then
    return pg_catalog.jsonb_build_object('status',v_intent.state);
  end if;
  select total_cents,rank into v_total,v_rank from public.santacrown_leaderboard where link=v_intent.link;
  return pg_catalog.jsonb_build_object('status','paid','total_cents',coalesce(v_total,0),'rank',v_rank);
end $$;

-- Revoke on every object explicitly: Supabase's defaults often grant access to PUBLIC.
revoke all on public.sc_entries,public.sc_intents,public.sc_payments,public.sc_refunds,
  public.sc_disputes,public.sc_events,public.sc_payment_net,public.sc_totals,
  public.santacrown_leaderboard from public,anon,authenticated;
revoke all on function public.sc_prepare_checkout(text,text,bigint,text) from public,anon,authenticated;
revoke all on function public.sc_mark_checkout(uuid,text) from public,anon,authenticated;
revoke all on function public.sc_mark_failed(uuid) from public,anon,authenticated;
revoke all on function public.sc_record_success(text,uuid,text,bigint) from public,anon,authenticated;
revoke all on function public.sc_record_refund(text,text,text,bigint) from public,anon,authenticated;
revoke all on function public.sc_record_dispute(text,text,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.sc_get_intent_status(uuid) from public,anon,authenticated;
grant select on public.sc_entries,public.sc_intents,public.sc_payments,public.sc_refunds,
  public.sc_disputes,public.sc_events,public.sc_payment_net,public.sc_totals,
  public.santacrown_leaderboard to service_role;
grant insert,update on public.sc_entries,public.sc_intents,public.sc_payments,
  public.sc_refunds,public.sc_disputes,public.sc_events to service_role;
grant execute on function public.sc_prepare_checkout(text,text,bigint,text) to service_role;
grant execute on function public.sc_mark_checkout(uuid,text) to service_role;
grant execute on function public.sc_mark_failed(uuid) to service_role;
grant execute on function public.sc_record_success(text,uuid,text,bigint) to service_role;
grant execute on function public.sc_record_refund(text,text,text,bigint) to service_role;
grant execute on function public.sc_record_dispute(text,text,text,text,timestamptz) to service_role;
grant execute on function public.sc_get_intent_status(uuid) to service_role;
alter table public.sc_entries enable row level security;
alter table public.sc_intents enable row level security;
alter table public.sc_payments enable row level security;
alter table public.sc_refunds enable row level security;
alter table public.sc_disputes enable row level security;
alter table public.sc_events enable row level security;
