from pathlib import Path
from playwright.sync_api import sync_playwright
import re,base64
root=Path(__file__).parents[1]
html=(root/'index.html').read_text()
html=re.sub(r'<link[^>]*fonts\.googleapis\.com[^>]*>', '', html)
html=re.sub(r'<link[^>]*fonts\.gstatic\.com[^>]*>', '', html)
html=html.replace('<link rel="stylesheet" href="/styles.css?v=4">','<style>'+(root/'styles.css').read_text()+'</style>')
for name in ['santa-cut.webp','north-pole.webp']:
 html=html.replace('src="/assets/'+name+'"','src="data:image/webp;base64,'+base64.b64encode((root/'assets'/name).read_bytes()).decode()+'"')
html=html.replace('<script src="/lib.js" defer></script>','').replace('<script src="/app.js?v=4" defer></script>','')
html=html.replace('</body>','<script>'+(root/'lib.js').read_text()+'</script><script>'+(root/'app.js').read_text()+'</script></body>')
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page(accept_downloads=True,viewport={'width':393,'height':852})
 page.set_content(html,wait_until='domcontentloaded')
 page.locator('#person').fill('Santa Builder')
 page.locator('#profile-link').fill('https://x.com/SantaBuilder?utm_source=fb')
 page.locator('#amount').fill('19.99')
 page.locator('.form-submit').click()
 assert page.locator('#dialog-backdrop').is_visible()
 assert page.locator('#close-dialog').evaluate('(e)=>document.activeElement===e')
 page.keyboard.press('Shift+Tab')
 assert page.locator('.modal-actions .secondary').evaluate('(e)=>document.activeElement===e')
 with page.expect_download() as d:page.locator('.modal-actions button').first.click()
 download=d.value
 assert download.suggested_filename.endswith('.svg')
 page.keyboard.press('Escape')
 assert page.locator('#dialog-backdrop').is_hidden()
 assert page.locator('.form-submit').evaluate('(e)=>document.activeElement===e')
 print('PASS: modal focus trap, SVG download, Escape close, restored focus')
 for slug in ['terms','privacy','refunds']:
  legal=(root/(slug+'.html')).read_text()
  legal=re.sub(r'<link[^>]*fonts\.googleapis\.com[^>]*>', '', legal)
  legal=re.sub(r'<link[^>]*fonts\.gstatic\.com[^>]*>', '', legal)
  legal=legal.replace('<link rel="stylesheet" href="/legal.css">','<style>'+(root/'legal.css').read_text()+'</style>')
  for width in [320,393,1440]:
   pp=browser.new_page(viewport={'width':width,'height':850})
   pp.set_content(legal)
   assert not pp.evaluate('document.documentElement.scrollWidth>innerWidth'),(slug,width)
   assert pp.locator('a[href="mailto:hello.skyorigin@gmail.com"]').count()==1
   assert pp.locator('h1').inner_text()
   pp.close()
  print('PASS: legal',slug,'320/393/1440')
 browser.close()
