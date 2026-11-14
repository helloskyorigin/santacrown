'use strict';
// Explicit fail-closed checkout route. Do not take payments before merchant approval,
// final published terms, a transactional verified ledger and signed webhooks.
module.exports = async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Allow','POST');
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  return res.status(503).json({code:'CHECKOUT_NOT_OPEN',message:'SantaCrown checkout has not opened. No payment has been initiated.'});
};
