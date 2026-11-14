'use strict';
// Webhooks are intentionally not acknowledged as payments until signed verification
// and idempotent ledger processing are implemented and audited.
module.exports = function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.status(503).json({code:'WEBHOOK_NOT_CONFIGURED'});
};
