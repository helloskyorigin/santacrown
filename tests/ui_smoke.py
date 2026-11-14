"""Optional SantaCrown UI smoke test; requires python -m pip install playwright.
No external network/server needed. Uses Chromium and local CSS/JS injected in memory.
"""
from pathlib import Path
import base64, re
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / 'index.html').read_text()
css = (ROOT / 'styles.css').read_text()
lib = (ROOT / 'lib.js').read_text()
app = (ROOT / 'app.js').read_text()
img = base64.b64encode((ROOT / 'assets' / 'santa.webp').read_bytes()).decode('ascii')
html = re.sub(r'<link[^>]*fonts\.googleapis\.com[^>]*>', '', html)
html = re.sub(r'<link[^>]*fonts\.gstatic\.com[^>]*>', '', html)
html = html.replace('<link rel="stylesheet" href="styles.css"/>', '<style>'+css+'</style>')
html = html.replace('src="assets/santa.png"', 'src="data:image/webp;base64,'+img+'"')
html = html.replace('<script src="lib.js" defer></script>', '<script>'+lib+'</script>')
html = html.replace('<script src="app.js" defer></script>', '<script>'+app+'</script>')

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for width in [320,360,393,768,1024,1440]:
        page = browser.new_page(viewport={'width':width,'height':840})
        page_errors=[]
        page.on('pageerror', lambda e: page_errors.append(str(e)))
        page.set_content(html, wait_until='domcontentloaded')
        assert not page_errors, (width,page_errors)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
        assert page.locator('.board-row').count() == 5, width
        assert page.locator('.demo-podium-label').is_visible(), width
        assert page.locator('input[aria-describedby="amount-error quote"]').count() == 1
        if width == 393:
            page.screenshot(path=str(ROOT/'tests'/'preview-mobile.png'), animations='disabled')
            assert page.locator('.r-mobile-link').first.is_visible()
        if width == 1440:
            page.screenshot(path=str(ROOT/'tests'/'preview-desktop.png'), animations='disabled')
        page.locator('#person').fill('Snow Princess')
        page.locator('#url').fill('https://x.com/snowprincess/?utm_source=threads')
        page.locator('#amount').fill('19.99')
        assert '$19.99' in page.locator('#quote').inner_text()
        page.locator('#entry-form button[type=submit]').click()
        assert page.locator('#overlay').get_attribute('aria-hidden') == 'false'
        assert 'snowprincess' in page.locator('.profile-preview a').inner_text().lower()
        page.keyboard.press('Escape')
        assert page.locator('#overlay').get_attribute('aria-hidden') == 'true'
        assert page.locator('#entry-form button[type=submit]').evaluate('(b)=>document.activeElement === b')
        page.locator('#url').fill('javascript:alert(1)')
        page.locator('#entry-form button[type=submit]').click()
        assert page.locator('#url').get_attribute('aria-invalid') == 'true'
        assert page.locator('#overlay').get_attribute('aria-hidden') == 'true'
        print('PASS',width)
        page.close()
    browser.close()
