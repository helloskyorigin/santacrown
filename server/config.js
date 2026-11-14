'use strict';
const BASE = 'https://santacrown.vercel.app';

// Checkout can be intentionally paused while refunds, disputes and already-paid
// webhook events MUST still reconcile. Never couple webhook health to sales flags.
function webhookConfigured(env=process.env){
  return !!env.DODO_PAYMENTS_API_KEY && !!env.DODO_PAYMENTS_WEBHOOK_KEY &&
    !!env.SUPABASE_URL && !!(env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY) &&
    ['test_mode','live_mode'].includes(env.DODO_PAYMENTS_ENVIRONMENT);
}
function paymentsConfigured(env=process.env){
  return webhookConfigured(env) && env.SANTACROWN_CHECKOUT_ENABLED==='true' &&
    env.DODO_PAYMENTS_APPROVED==='true' && !!env.DODO_PAYMENTS_PRODUCT_ID &&
    !!env.SANTACROWN_RATE_SALT;
}
function canCharge(env=process.env,now=Date.now()){
  if(!paymentsConfigured(env)) return false;
  if(env.DODO_PAYMENTS_ENVIRONMENT==='test_mode') return true;
  const cutoff=Date.parse(env.SANTACROWN_EVENT_CUTOFF_AT||'');
  return env.DODO_PAYMENTS_ENVIRONMENT==='live_mode' &&
    env.SANTACROWN_LIVE_CONFIRMED==='true' &&
    env.SANTACROWN_COMMERCIAL_TERMS_READY==='true' &&
    !!env.SANTACROWN_MERCHANT_LEGAL_NAME?.trim() &&
    Number.isFinite(cutoff) && cutoff>now;
}
function siteOrigin(env=process.env){
  const value=env.SANTACROWN_SITE_ORIGIN||BASE;
  const u=new URL(value);
  if(u.protocol!=='https:' || u.pathname!=='/' || u.search || u.hash || u.username || u.password)
    throw Error('Invalid site origin');
  return u.origin;
}
module.exports={webhookConfigured,paymentsConfigured,canCharge,siteOrigin};
