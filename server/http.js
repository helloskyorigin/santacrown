'use strict';
function json(res,code,obj){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  return res.status(code).json(obj);
}
function allow(req,res,method){
  if(req.method===method) return true;
  res.setHeader('Allow',method);
  json(res,405,{error:'Method not allowed'});
  return false;
}
function bodyJSON(req,max=4096){
  if(!String(req.headers['content-type']||'').toLowerCase().includes('application/json')) throw new Error('JSON_REQUIRED');
  if(Number(req.headers['content-length'])>max) throw new Error('BODY_TOO_LARGE');
  const body=req.body;
  if(typeof body!=='object'||body===null||Array.isArray(body)||
       Buffer.byteLength(JSON.stringify(body))>max) throw new Error('INVALID_BODY');
  return body;
}
async function rawBody(req,max=250000){
  // Never read req.body; Vercel's body helper parses on access.
  let size=0;const chunks=[];
  for await(const chunk of req){
    const buf=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
    size+=buf.length;
    if(size>max) throw Error('BODY_TOO_LARGE');
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}
module.exports={json,allow,bodyJSON,rawBody};
