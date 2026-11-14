"""Visual and functional smoke tests with in-memory assets; no network needed."""
from pathlib import Path
import base64,re
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).parents[1]
html=(ROOT/'index.html').read_text()
css=(ROOT/'styles.css').read_text()
lib=(ROOT/'lib.js').read_text()
app=(ROOT/'app.js').read_text()
html=re.sub(r'<link[^>]*fonts\.googleapis\.com[^>]*>', '', html)
html=re.sub(r'<link[^>]*fonts\.gstatic\.com[^>]*>', '', html)
html=html.replace('<link rel="stylesheet" href="/styles.css?v=4">','<style>'+css+'</style>')
for file in ['santa-cut.webp','north-pole.webp']:
 data=base64.b64encode((ROOT/'assets'/file).read_bytes()).decode('ascii')
 html=html.replace('src="/assets/'+file+'"','src="data:image/webp;base64,'+data+'"')
html=html.replace('<script src="/lib.js" defer></script>', '')
html=html.replace('<script src="/app.js?v=4" defer></script>', '')
html=html.replace('</body>', '<script>'+lib+'</script><script>'+app+'</script></body>')
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for w,h in [(1440,900),(393,852),(320,780),(768,920),(1024,768),(1920,1080)]:
  page=browser.new_page(viewport={'width':w,'height':h},device_scale_factor=1,reduced_motion='reduce')
  errors=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  page.set_content(html, wait_until='domcontentloaded')
  page.wait_for_timeout(200)
  page.screenshot(path=str(ROOT/'tests'/f'v4_{w}_fold.png'),full_page=False,animations='disabled')
  page.screenshot(path=str(ROOT/'tests'/f'v4_{w}_full.png'),full_page=True,animations='disabled')
  overflow=page.evaluate('document.documentElement.scrollWidth>window.innerWidth')
  imgs=page.evaluate('Array.from(document.images).map(x=>x.complete&&x.naturalWidth>0)')
  print(w,'overflow',overflow,'errors',errors,'images',imgs)
  assert not overflow and not errors and all(imgs),f'QA failed {w}'
  assert page.locator('#leaderboard-list .board-row').count()==0
  assert 'No paid entries' in page.locator('#board-indicator').inner_text()
  page.locator('#person').fill('North Pole Founder')
  page.locator('#profile-link').fill('https://x.com/northpolefounder')
  page.locator('#amount').fill('19.99')
  assert '$19.99' in page.locator('#price-estimate').inner_text()
  page.locator('.form-submit').click()
  assert page.locator('#dialog-backdrop').is_visible()
  assert 'North Pole Founder' in page.locator('.preview-card').inner_text()
  page.keyboard.press('Escape')
  assert page.locator('#dialog-backdrop').is_hidden()
  page.locator('#profile-link').fill('javascript:alert(1)')
  page.locator('.form-submit').click()
  assert page.locator('#profile-link').get_attribute('aria-invalid')=='true'
  page.close()
 browser.close()
