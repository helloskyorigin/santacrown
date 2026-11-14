#!/usr/bin/env python3
"""Isolated Chromium E2E: inlined live frontend + deterministic simulated API.
Local HTTP navigation is blocked in this environment. These checks do not
access a real provider or Supabase and do not collect funds.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import base64, json, re
ROOT=Path(__file__).resolve().parents[1]
ROWS=[
 {'rank':1,'name':'Verified One','link':'https://one.com/','total_cents':25000},
 {'rank':2,'name':'Verified Two','link':'https://two.com/','total_cents':18000},
 {'rank':3,'name':'Verified Three','link':'https://three.com/','total_cents':12000},
 {'rank':4,'name':'Repeat Test','link':'https://repeat.com/','total_cents':10000},
]
STUB='''
window.__MOCK = {rows: __ROWS__,mode:'ready',paid:false,checkoutCalls:0};
window.fetch = async function(input) {
  const url=String(input), s=window.__MOCK;
  const reply=(o,status=200)=>({ok:status>=200&&status<300,status,async json(){return o}});
  if(url.startsWith('/api/leaderboard')){
    if(s.mode==='fail')return reply({code:'DB_DOWN'},503);
    if(s.mode==='prelaunch')return reply({status:'awaiting_database',entries:[],paymentsEnabled:false});
    return reply({status:'ready',entries:s.rows,paymentsEnabled:s.paid});
  }
  if(url.startsWith('/api/listing'))return reply({entry:__ROWS__[3]});
  if(url.startsWith('/api/status'))return reply({status:'created'});
  if(url.startsWith('/api/checkout')){s.checkoutCalls++;return reply({code:'TEST_ONLY',message:'Test provider is deliberately unavailable'},503)}
  throw Error('Unexpected fetch: '+url);
};
'''.replace('__ROWS__',json.dumps(ROWS))

def fixture():
 html=(ROOT/'index.html').read_text()
 css=(ROOT/'styles.css').read_text()
 for asset in ['santa-cut.webp','north-pole.webp']:
  b64=base64.b64encode((ROOT/'assets'/asset).read_bytes()).decode()
  html=html.replace('/assets/'+asset,'data:image/webp;base64,'+b64)
  css=css.replace('/assets/'+asset,'data:image/webp;base64,'+b64)
 html=re.sub(r'<link[^>]+(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>','',html)
 html=re.sub(r'<link[^>]+href="/styles\.css[^\"]*"[^>]*>','<style>'+css+'</style>',html)
 html=re.sub(r'<script[^>]+src="/(?:lib|app)\.js[^\"]*"[^>]*></script>','',html)
 js=STUB+'\n'+(ROOT/'lib.js').read_text()+'\n'+(ROOT/'app.js').read_text()
 return html.replace('</body>','<script>'+js.replace('</script>','<\\/script>')+'</script></body>')

def run():
 with sync_playwright() as pw:
  browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-web-security'])
  for width in [320,360,393,768,1024,1440,1920]:
   page=browser.new_page(viewport={'width':width,'height':880},accept_downloads=True,reduced_motion='reduce')
   errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.set_content(fixture(),wait_until='load')
   page.wait_for_function('document.querySelector("#board-indicator").textContent.includes("verified")')
   assert page.get_by_text('Verified One').count()>=1,(width,'verified name absent')
   assert not page.evaluate('document.documentElement.scrollWidth > innerWidth+1'),width
   assert not errors,(width,errors)
   if width==393:
    a=page.locator('.board-row .leader-url').first
    assert a.is_visible(),'Mobile participant link should remain visible'
    assert a.get_attribute('href')=='https://one.com/'
    page.locator('#challenge-first').click()
    assert page.locator('#amount').input_value()=='251.00'
    page.locator('#person').fill('Christmas Creator')
    page.locator('#profile-link').fill('https://repeat.com')
    page.wait_for_timeout(550)
    page.locator('#amount').fill('149.99')
    assert '$49.99' in page.locator('#price-estimate').inner_text()
    page.locator('.form-submit').click()
    assert page.locator('#dialog-backdrop').is_visible()
    page.keyboard.press('Escape')
    assert not page.locator('#dialog-backdrop').is_visible()
    page.locator('#amount').fill('19.999');page.locator('.form-submit').click()
    assert page.locator('#amount-error').inner_text()
    page.evaluate("window.__MOCK.rows=[{rank:1,name:'New Crown',link:'https://newcrown.com/',total_cents:50000},...window.__MOCK.rows.map(e=>({...e,rank:e.rank+1}))]")
    page.locator('#refresh-board').click()
    page.wait_for_function('document.querySelector("#board-status").textContent.includes("New Crown")')
    page.evaluate("window.__MOCK.mode='fail'")
    page.locator('#refresh-board').click()
    page.wait_for_function('document.querySelector("#board-indicator").textContent.includes("Connection")')
    assert 'last verified snapshot' in page.locator('#board-updated').inner_text()
    assert page.locator('#checkout-consent').is_hidden()
    page.evaluate("window.__MOCK.mode='ready';window.__MOCK.rows="+json.dumps(ROWS)+";window.__MOCK.paid=true")
    page.locator('#refresh-board').click()
    page.wait_for_function('document.querySelector("#checkout-consent").hidden === false')
    page.locator('#amount').fill('149.99')
    page.locator('.form-submit').click()
    assert 'accept the Terms' in page.locator('#toast').inner_text()
    assert page.evaluate('window.__MOCK.checkoutCalls')==0
    page.locator('#consent').check();page.locator('.form-submit').click()
    page.wait_for_function('document.querySelector("#toast").textContent.includes("Test provider")')
    assert page.evaluate('window.__MOCK.checkoutCalls')==1
    page.evaluate('window.__MOCK.paid=false')
   if width==1440:page.screenshot(path=str(ROOT/'tests'/'launch_desktop.png'),full_page=True,animations='disabled')
   if width==393:page.screenshot(path=str(ROOT/'tests'/'launch_mobile.png'),full_page=True,animations='disabled')
   print('PASS mock API + browser',width)
   page.close()
  for route in ['terms','privacy','refunds','404']:
   html=(ROOT/(route+'.html')).read_text()
   html=re.sub(r'<link[^>]+(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>','',html)
   html=html.replace('<link rel="stylesheet" href="/legal.css">','<style>'+(ROOT/'legal.css').read_text()+'</style>')
   page=browser.new_page(viewport={'width':393,'height':800})
   page.set_content(html)
   assert 'hello.skyorigin@gmail.com' in html
   assert not page.evaluate('document.documentElement.scrollWidth > innerWidth+1'),route
   print('PASS policy page',route)
   page.close()
  thanks=(ROOT/'thanks.html').read_text()
  thanks=thanks.replace('<link rel="stylesheet" href="/legal.css">','<style>'+(ROOT/'legal.css').read_text()+'</style>')
  thanks=re.sub(r'<script[^>]+src="/thanks.js"[^>]*></script>','',thanks)
  js="window.fetch=async()=>({ok:true,status:200,json:async()=>({status:'created'})});\n"+(ROOT/'thanks.js').read_text().replace('new URLSearchParams(location.search)','new URLSearchParams("?intent=5cfda37c-13c4-4e76-b811-10d70bc751af&status=succeeded")')
  thanks=thanks.replace('</body>','<script>'+js+'</script></body>')
  page=browser.new_page();page.set_content(thanks)
  page.wait_for_function('document.querySelector("#status-title").textContent.includes("Waiting")')
  assert not page.locator('#status-rank').inner_text()
  page.locator('#retry-status').click()
  print('PASS forged success redirect cannot grant rank')
  page.close();browser.close()

if __name__=='__main__':run()
