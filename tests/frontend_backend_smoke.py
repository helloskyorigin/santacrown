#!/usr/bin/env python3
"""Offline Playwright smoke test using inlined resources and a stubbed API.
No live Dodo, Supabase or remote browser navigation used.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import base64, json, re

ROOT = Path(__file__).resolve().parents[1]
rows = [
 {'rank':1,'name':'Verified One','link':'https://one.com/','total_cents':25000},
 {'rank':2,'name':'Verified Two','link':'https://two.com/','total_cents':18000},
 {'rank':3,'name':'Verified Three','link':'https://three.com/','total_cents':12000},
 {'rank':4,'name':'Repeat Test','link':'https://repeat.com/','total_cents':10000},
]

script_stub = """
window.fetch = async function(url, options={}) {
  const uri=String(url);
  const reply = obj=>({ok:true,status:200,json:async()=>obj});
  if(uri.startsWith('/api/leaderboard')) return reply({entries:window.__TEST_ROWS__,status:'ready',paymentsEnabled:false});
  if(uri.startsWith('/api/listing')) return reply({entry: window.__TEST_ROWS__[3]});
  if(uri.startsWith('/api/status')) return reply({status:'created'});
  throw new Error('Unexpected fetch: '+uri);
};
"""

def fixture(page_name='index.html'):
    html=(ROOT/page_name).read_text()
    style=(ROOT/'styles.css').read_text()
    # Inline fonts and assets: browser blocks local-server navigation here.
    for asset in ['santa-cut.webp','north-pole.webp']:
        b64=base64.b64encode((ROOT/'assets'/asset).read_bytes()).decode()
        html=html.replace('/assets/'+asset, 'data:image/webp;base64,'+b64)
        style=style.replace('/assets/'+asset, 'data:image/webp;base64,'+b64)
    html=re.sub(r'<link[^>]+(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>', '', html)
    html=re.sub(r'<link[^>]+href="/styles\.css[^\"]*"[^>]*>', '<style>'+style+'</style>',html)
    js='\nwindow.__TEST_ROWS__ = '+json.dumps(rows)+';\n'+script_stub
    for path in ['lib.js','app.js']:
        js+='\n'+(ROOT/path).read_text()+'\n'
    html=re.sub(r'<script[^>]+src="/(?:lib|app)\.js[^\"]*"[^>]*><\/script>', '', html)
    return html.replace('</body>', '<script>'+js.replace('</script>', '<\\/script>')+'</script></body>')

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-web-security'])
    for width in [320,360,393,768,1024,1440,1920]:
        page=browser.new_page(viewport={'width':width,'height':900},device_scale_factor=1,accept_downloads=True)
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.set_content(fixture(),wait_until='load')
        page.wait_for_timeout(450)
        assert page.get_by_text('Verified One').count()>=1, ('missing genuine name',width)
        assert page.locator('#board-indicator').inner_text()=='4 verified entries', (width,page.locator('#board-indicator').inner_text())
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth + 1'), ('horizontal overflow',width)
        assert not errors, (width,errors)
        if width==393:
            page.locator('#person').fill('Actual Santa')
            page.locator('#profile-link').fill('https://repeat.com/')
            page.wait_for_timeout(650)
            page.locator('#amount').fill('149.99')
            assert '$49.99' in page.locator('#price-estimate').inner_text(), page.locator('#price-estimate').inner_text()
            page.locator('.form-submit').click()
            assert page.locator('#dialog-backdrop').is_visible()
            page.keyboard.press('Escape')
            assert not page.locator('#dialog-backdrop').is_visible()
            page.locator('#amount').fill('19.999')
            page.locator('.form-submit').click()
            assert page.locator('#amount-error').inner_text()
        print('PASS viewport',width)
        page.close()
    # A forged success redirect must not grant a rank without a verified status RPC.
    thanks=(ROOT/'thanks.html').read_text()
    thanks=re.sub(r'<link[^>]+href="/legal.css"[^>]*>', '<style>'+(ROOT/'legal.css').read_text()+'</style>',thanks)
    thanks=re.sub(r'<script[^>]+src="/thanks.js"[^>]*><\/script>', '', thanks)
    js='window.fetch = async () => ({ok:true,status:200,json: async () => ({status:"created"})});\n'+(ROOT/'thanks.js').read_text().replace('new URLSearchParams(location.search)', 'new URLSearchParams("?intent=5cfda37c-13c4-4e76-b811-10d70bc751af&status=succeeded")')
    thanks=thanks.replace('</body>', '<script>'+js+'</script></body>')
    page=browser.new_page()
    page.set_content(thanks,wait_until='load')
    page.wait_for_timeout(100)
    assert 'Waiting for verified payment' in page.locator('#status-title').inner_text()
    assert not page.locator('#status-rank').inner_text()
    print('PASS fake success redirect cannot claim rank')
    page.close()
    browser.close()
print('PASS browser-based leaderboard UI smoke')
