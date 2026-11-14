'use strict';
// Non-payment production smoke test. Requires outbound network access where run.
// Safe to execute from a CI runner; it never creates an order.
const origin=process.env.SANTACROWN_SITE_ORIGIN||'https://santacrown.vercel.app';
const base=new URL(origin);
if(base.protocol!=='https:'||base.pathname!=='/'||base.search||base.hash)throw Error('Use a valid HTTPS origin');
const routes=['/','/terms.html','/privacy.html','/refunds.html','/api/health','/api/leaderboard'];
(async()=>{
  let failed=false;
  for(const path of routes){
    try{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);
      const r=await fetch(base.origin+path,{cache:'no-store',signal:controller.signal});clearTimeout(timer);
      const type=r.headers.get('content-type')||'';
      if(!r.ok)throw Error('HTTP '+r.status);
      if(path.startsWith('/api/')){
        if(!type.includes('application/json'))throw Error('Incorrect JSON Content-Type');
        const body=await r.json();
        if(path==='/api/leaderboard'&&!Array.isArray(body.entries))throw Error('Missing entries array');
        if(path==='/api/health'&&!['ready','awaiting_database'].includes(body.status))throw Error('Unexpected readiness '+body.status);
        console.log('PASS',path,body.status||'',body.paymentsEnabled?'TEST/LIVE CHECKOUT ENABLED':'checkout off');
      }else{
        if(!type.includes('text/html'))throw Error('Incorrect HTML Content-Type');
        const text=await r.text();if(!text.includes('SantaCrown'))throw Error('Expected SantaCrown content missing');
        console.log('PASS',path);
      }
    }catch(err){failed=true;console.error('FAIL',path,err.message)}
  }
  if(failed)process.exitCode=1;
})().catch(err=>{console.error(err);process.exitCode=1});
