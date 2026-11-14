import json
import os
import shutil
import base64
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE='https://santacrown.test/'
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'tests'
DATA=[{'rank':i+1,'name':name,'link':link,'total_cents':total}
      for i,(name,link,total) in enumerate([
       ('Northern Creator','https://example.com/northern',25000),
       ('Snow Maker','https://youtube.com/@snowmaker',16000),
       ('Frost Builder','https://x.com/frostbuilder',9000),
       ('Candy Cane','https://instagram.com/candycane',7000),
       ('Icy Website','https://iced.example.com/',4600),
       ('Gift Castle','https://example.com/castle',3900),
       ('Star Elf','https://threads.net/@star',3100),
       ('Comet Reindeer','https://example.com/comet',2600),
       ('Holiday Maker','https://example.com/holiday',2000),
       ('Santa Sidekick','https://example.com/sidekick',1900),
       ('North Wind','https://example.com/wind',1400),
       ('Snow Bell','https://example.com/bells',1000),
      ])]

def source_with_api(data):
    html=(ROOT/'index.html').read_text()
    html=re.sub(r'<link href="https://fonts.googleapis.com/[^>]+>', '', html)
    css=(ROOT/'styles.css').read_text()
    html=html.replace('<link rel="stylesheet" href="/styles.css?v=8">','<style>'+css+'</style>')
    html=html.replace('<script src="/lib.js" defer></script>','<script>'+(ROOT/'lib.js').read_text()+'</script>')
    prelude="""<script>window.fetch = async function(url,options){
     if(String(url).includes('api/leaderboard'))return new Response(JSON.stringify(window.__testBoard),{status:200,headers:{'Content-Type':'application/json'}});
     if(String(url).includes('api/listing'))return new Response(JSON.stringify({entry:null}),{status:200,headers:{'Content-Type':'application/json'}});
     return new Response('{}',{status:404}); };</script>"""
    html=html.replace('<script src="/app.js?v=8" defer></script>', '')
    html=html.replace('</body>', '<script>window.__testBoard='+json.dumps(data)+';</script>'+prelude+'<script>'+(ROOT/'app.js').read_text()+'</script></body>')
    for filename in ('santa-cut.webp','north-pole.webp'):
        html=html.replace('/assets/'+filename,'data:image/webp;base64,'+base64.b64encode((ROOT/'assets'/filename).read_bytes()).decode())
    return html

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path=os.getenv('CHROMIUM_BIN') or shutil.which('chromium') or None, args=['--no-sandbox'])
    for width in [320,360,393,430,768,1024,1440,1920]:
        page=browser.new_page(viewport={'width':width,'height':960},device_scale_factor=1)
        faults=[]
        page.on('pageerror',lambda e: faults.append(str(e)))
        page.goto('about:blank')
        page.set_content(source_with_api({'status':'ready','entries':DATA,'paymentsEnabled':False}),wait_until='domcontentloaded')
        page.wait_for_selector('.board-row')
        overflow=page.evaluate('document.documentElement.scrollWidth - window.innerWidth')
        assert overflow<=1,('overflow',width,overflow)
        assert len(page.locator('.board-row').all())==10,(width,'top10 count')
        assert page.locator('.board-row .leader-url').first.is_visible(),(width,'clickable link hidden')
        assert page.locator('.board-row .rank-action').first.is_visible(),(width,'action hidden')
        assert page.locator('.board-row .leader-identity .leader-name').first.is_visible(),(width,'name hidden')
        assert page.locator('.board-row .leader-total').first.is_visible(),(width,'total hidden')
        assert page.locator('.podium-card .slot-url a').count()==3,(width,'podium links missing')
        assert page.locator('#show-ten').get_attribute('aria-pressed')=='true'
        page.locator('#show-all').click()
        assert len(page.locator('.board-row').all())==12,(width,'all count')
        page.locator('#leader-search').fill('wind')
        assert len(page.locator('.board-row').all())==1,(width,'search count')
        assert 'North Wind' in page.locator('.board-row').first.inner_text()
        page.locator('#leader-search').fill('')
        page.locator('.board-row .rank-action').first.click()
        assert page.locator('#amount').input_value()=='251.00',(width,'challenge target')
        page.locator('#person').fill('Magic Elf')
        page.locator('#profile-link').fill('https://example.com/my-festive-project')
        assert page.locator('#join-name-preview').inner_text()=='Magic Elf'
        assert 'my-festive-project' in page.locator('#join-link-preview').inner_text()
        page.locator('#join-form .form-submit').click()
        assert page.locator('#dialog-backdrop').is_visible(),(width,'modal')
        page.keyboard.press('Escape')
        assert page.locator('#dialog-backdrop').is_hidden(),(width,'escape')
        if width in [393,768,1440]:
            page.screenshot(path=str(OUT/f'v8_{width}_full.png'),full_page=True,animations='disabled')
            page.screenshot(path=str(OUT/f'v8_{width}_fold.png'),full_page=False,animations='disabled')
        assert not faults,(width,faults)
        print('PASS',width,'viewport, search, outgoing links, challenge, preview, keyboard')
        page.close()
    page=browser.new_page()
    page.goto('about:blank')
    page.set_content(source_with_api({'status':'awaiting_database','entries':[],'paymentsEnabled':False}),wait_until='domcontentloaded')
    page.wait_for_timeout(350)
    assert len(page.locator('.board-row').all())==0
    assert page.locator('.empty-board').count()==1
    page.locator('.empty-board .empty-action').click()
    page.wait_for_timeout(480)
    assert page.locator('#person').evaluate('(el) => document.activeElement === el')
    print('PASS empty-state: no fake rank, clickable preview')
    browser.close()
