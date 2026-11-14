(() => {
  'use strict';
  const title=document.getElementById('status-title');
  const copy=document.getElementById('status-copy');
  const rank=document.getElementById('status-rank');
  const intent=new URLSearchParams(location.search).get('intent');
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(intent||'')){
    title.textContent='No payment record selected';
    copy.textContent='Please return to SantaCrown to see the public leaderboard.';
    return;
  }
  let attempts=0;
  async function poll(){
    try{
      const r=await fetch('/api/status?intent='+encodeURIComponent(intent),{cache:'no-store'});
      if(!r.ok)throw Error('Unavailable');
      const data=await r.json();
      if(data.status==='paid'){
        title.textContent='🎅 Payment verified!';
        copy.textContent='Your verified contribution is recorded. Public ranks can change as other participants pay.';
        if(Number.isInteger(data.rank)&&data.rank>0)rank.textContent='👑 Current position: #'+data.rank;
        else rank.textContent='Your payment is recorded; the listing may have been adjusted after a refund or dispute.';
        return;
      }
      if(data.status==='failed'||data.status==='unknown'){
        title.textContent='Payment not confirmed';
        copy.textContent='No paid rank has been added. For a charge you do not recognize, contact support.';
        return;
      }
      title.textContent='⏳ Waiting for verified payment';
      copy.textContent='This can take a little while. You can return to the leaderboard; payment verification continues securely.';
      if(attempts++<20)setTimeout(poll,3500);
    }catch{
      title.textContent='Unable to check status';
      copy.textContent='No rank has been claimed from this browser. Check again or contact support.';
    }
  }
  poll();
})();
