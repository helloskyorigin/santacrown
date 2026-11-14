(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const title=$('status-title'),copy=$('status-copy'),rank=$('status-rank');
  const updated=$('status-updated'),retry=$('retry-status');
  const intent=new URLSearchParams(location.search).get('intent');
  const valid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(intent||'');
  let timer=null,attempts=0,busy=false,complete=false;
  if(!valid){title.textContent='No payment reference selected';copy.textContent='Return to SantaCrown to view the leaderboard.';retry.disabled=true;return;}
  async function checkStatus(){
    if(busy)return;
    busy=true;retry.disabled=true;
    clearTimeout(timer);
    const controller=new AbortController();const abort=setTimeout(()=>controller.abort(),10000);
    try{
      const r=await fetch('/api/status?intent='+encodeURIComponent(intent),{cache:'no-store',signal:controller.signal});
      if(!r.ok)throw Error('Status unavailable');
      const data=await r.json();
      updated.textContent='Last checked '+new Date().toLocaleTimeString();
      if(data.status==='paid'){
        complete=true;
        title.textContent='🎅 Payment verified!';
        if(Number.isInteger(data.rank)&&data.rank>0){
          copy.textContent='Your payment was verified and credited to the public leaderboard. Rankings can still change.';
          rank.textContent='👑 Current rank: #'+data.rank;
        }else{
          copy.textContent='Payment recorded. There is currently no active rank for this listing (for example after a refund, dispute or moderation action).';
          rank.textContent='Contact support if this looks incorrect.';
        }
        return;
      }
      rank.textContent='';
      if(data.status==='failed'||data.status==='unknown'){
        complete=true;
        title.textContent='Payment not confirmed';
        copy.textContent='No paid rank has been added. If you were charged, contact support with your payment reference.';
        return;
      }
      title.textContent='⏳ Waiting for verified payment';
      copy.textContent='Payment verification is pending. A redirect or screenshot does not create a paid rank.';
      if(attempts++<20&&!document.hidden) timer=setTimeout(checkStatus,3500);
    }catch{
      title.textContent='Unable to check status';
      copy.textContent='We could not confirm payment right now. A rank has not been claimed from this browser. Please retry or contact support.';
      updated.textContent='Connection unavailable';
    }finally{
      clearTimeout(abort);busy=false;retry.disabled=false;
    }
  }
  retry.addEventListener('click',()=>{attempts=0;checkStatus()});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)clearTimeout(timer);
    else if(!complete)checkStatus();
  });
  window.addEventListener('online',()=>{if(!complete)checkStatus()});
  checkStatus();
})();
