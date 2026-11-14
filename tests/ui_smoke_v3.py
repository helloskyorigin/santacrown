from __future__ import annotations
from pathlib import Path
import json, subprocess, time, urllib.request, base64, re
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
def bundle_html():
    html = (root / 'index.html').read_text()
    css = (root / 'styles.css').read_text()
    svg64 = base64.b64encode((root / 'assets/north-pole.svg').read_bytes()).decode('ascii')
    css = css.replace("url('assets/north-pole.svg')", f'url("data:image/svg+xml;base64,{svg64}")')
    html = re.sub(r'<link rel="preconnect"[^>]*>', '', html)
    html = re.sub(r'<link href="https://fonts.googleapis.com[^>]*>', '', html)
    html = html.replace('<link rel="stylesheet" href="styles.css"/>', f'<style>{css}</style>')
    for filename in ['santa.webp', 'village.webp']:
        media = 'image/webp' if filename.endswith('.webp') else 'image/png'
        data = base64.b64encode((root / 'assets' / filename).read_bytes()).decode('ascii')
        html = html.replace(f'src="assets/{filename}"', f'src="data:{media};base64,{data}"')
    js_tail = ''
    for filename in ['lib.js', 'app.js']:
        js = (root / filename).read_text()
        html = html.replace(f'<script src="{filename}" defer></script>', '')
        js_tail += f'<script>{js}</script>'
    html = html.replace('</body>', js_tail+'</body>')
    return html
bundle=bundle_html()
results = []
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox','--allow-file-access-from-files'])
        for width, height in [(320, 760), (375, 812), (393, 852), (650, 900), (768, 900), (1024, 768), (1440, 900), (1920, 1080)]:
            page = browser.new_page(viewport={'width': width, 'height': height}, device_scale_factor=1)
            errors=[]
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.set_content(bundle, wait_until='load')
            page.locator('.santa-art').wait_for(state='visible')
            assert page.locator('.santa-art').evaluate('(e)=>e.complete && e.naturalWidth > 0'), 'Santa not loaded'
            assert page.locator('.north-pole-scene').count() == 1
            js=page.evaluate('''() => ({ doc: document.documentElement.scrollWidth, win: innerWidth, body: document.body.scrollWidth, h: document.body.scrollHeight, title: document.title })''')
            assert js['doc'] <= width+1, f'horizontal overflow {width}: {js}'
            assert len(errors)==0,f'console errors {width}: {errors}'
            assert page.locator('#preview-position').inner_text() == '#9'
            page.locator('[data-target="gold"]').click()
            assert page.locator('#amount').input_value() == '251'
            assert page.locator('#preview-position').inner_text() == '#1'
            page.locator('[data-target="bronze"]').click()
            assert page.locator('#amount').input_value() == '121'
            assert page.locator('#preview-position').inner_text() == '#3'
            page.locator('#person').fill('Winter Builder')
            page.locator('#url').fill('https://x.com/winter_builder')
            page.locator('#amount').fill('19.99')
            page.locator('#entry-form button[type=submit]').click()
            assert page.locator('#overlay').get_attribute('aria-hidden')=='false'
            assert 'Illustrative position' in page.locator('#dialog-content').inner_text()
            page.keyboard.press('Escape')
            assert page.locator('#overlay').get_attribute('aria-hidden')=='true'
            assert page.locator('#entry-form button[type=submit]').evaluate('(e)=>document.activeElement===e')
            page.locator('#url').fill('javascript:alert(1)')
            page.locator('#entry-form button[type=submit]').click()
            assert 'valid public' in page.locator('#url-error').inner_text()
            page.locator('#url').fill('x.com/winter_builder')
            page.locator('#amount').fill('1e7')
            page.locator('#entry-form button[type=submit]').click()
            assert 'Enter $1' in page.locator('#amount-error').inner_text()
            page.locator('#amount').fill('10')
            # reset scroll before captures
            page.evaluate('() => {document.documentElement.style.scrollBehavior="auto"; document.activeElement.blur(); window.scrollTo(0,0)}')
            page.screenshot(path=str(root / 'tests' / f'v3_{width}.png'), full_page=(width in [393,1440]), animations='disabled')
            results.append({'width':width, 'height':height, 'overflow':js['doc']-width, 'documentHeight':js['h'], 'errors':errors, 'status':'PASS'})
            page.close()
        browser.close()
    print(json.dumps(results,indent=2))
finally:
    pass
