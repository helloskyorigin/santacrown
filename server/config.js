'use strict';
const BASE = 'https://santacrown.vercel.app';
function paymentsConfigured(env=process.env){
  return env.SANTACROWN_CHECKOUT_ENABLED==='true' && env.DODO_PAYMENTS_APPROVED==='true' &&
    !!env.DODO_PAYMENTS_API_KEY && !!env.DODO_PAYMENTS_PRODUCT_ID &&
    !!env.DODO_PAYMENTS_WEBHOOK_KEY && !!env.SUPABASE_URL &&
    !!(env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY) && !!env.SANTACROWN_RATE_SALT &&
    ['test_mode','live_mode'].includes(env.DODO_PAYMENTS_ENVIRONMENT);
}
function canCharge(env=process.env){
  // Intentionally fail closed for live charges; the approval flag must be explicit.
  return paymentsConfigured(env) && (
    env.DODO_PAYMENTS_ENVIRONMENT==='test_mode' ||
    (env.DODO_PAYMENTS_ENVIRONMENT==='live_mode' && env.SANTACROWN_LIVE_CONFIRMED==='true')
  );
}
function siteOrigin(env=process.env){
  const text=env.SANTACROWN_SITE_ORIGIN||BASE;
  const u=new URL(text);
  if(u.protocol!=='https:' || u.pathname!=='/' || u.search || u.hash) throw Error('Invalid site origin');
  return u.origin;
}
module.exports={paymentsConfigured,canCharge,siteOrigin};
