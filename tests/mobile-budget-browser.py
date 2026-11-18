"""Run with a local server using python3 tests/mobile-budget-browser.py.
Checks fixed-header metrics with fictitious data, without changing period semantics.
"""
import json
import os
from datetime import datetime,timezone
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.environ.get('APP_TEST_URL','http://127.0.0.1:8767')
ROWS=[{'id':1,'desc':'Compra novembro','val':1250,'date':'2026-10-08','type':'saida','importKind':'card','cycleMonth':'2026-10','invoiceMonth':'2026-11'},
      {'id':2,'desc':'Compra dezembro','val':999,'date':'2026-11-08','type':'saida','importKind':'card','cycleMonth':'2026-11','invoiceMonth':'2026-12'}]
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    try:
        for width in [320,390,1440]:
            context=browser.new_context(viewport={'width':width,'height':900},service_workers='block')
            page=context.new_page()
            errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('dialog',lambda d:d.accept())
            page.clock.install(time=datetime(2026,11,17,12,tzinfo=timezone.utc))
            page.goto(BASE)
            assert page.locator('#income-mobile-avail').inner_text()=='—'
            page.set_input_files('#import-input',{'name':'test.json','mimeType':'application/json','buffer':json.dumps({'income':5000,'data':{'fin':ROWS}}).encode()})
            page.wait_for_function("document.querySelector('#import-input').value === ''")
            assert '3.750,00' in page.locator('#income-mobile-avail').inner_text()
            assert page.locator('#income-mobile-pct').inner_text()=='25%'
            assert page.locator('#income-pct-lbl').inner_text()=='25%'
            assert page.evaluate('FinanceAnalysis.period(D.fin[1])')=='2026-12'
            if width<701:
                assert page.locator('header .income-mobile-summary').is_visible()
                for section in ['finance','health','shopping','books']:
                    page.evaluate('(s)=>goTo(s)',section)
                    page.evaluate('window.scrollTo(0,document.body.scrollHeight)')
                    assert page.locator('#income-mobile-avail').is_visible()
                    assert page.locator('.mobile-topbar').evaluate('e=>Math.round(e.getBoundingClientRect().top)')==0
                page.evaluate("goTo('finance')")
                # Menus must still work below the taller header.
                page.locator('#mobile-menu').click()
                assert page.locator('#sidebar').evaluate("e=>e.classList.contains('open')")
                page.locator('#mobile-menu').click()
                page.get_by_role('button',name='Abrir perfil',exact=True).click()
                assert page.locator('#profile-panel').is_visible()
                assert page.locator('#profile-panel').evaluate('e=>e.getBoundingClientRect().top')>=96
                page.get_by_role('button',name='Abrir perfil',exact=True).click()
            else:
                assert page.locator('.income-mobile-summary').is_hidden()
                assert page.locator('#sidebar #income-widget').is_visible()
            page.get_by_role('button',name='Ocultar renda mensal',exact=True).click()
            assert page.locator('#income-mobile-avail').inner_text()=='••••••'
            assert page.locator('#income-mobile-pct').inner_text()=='••%'
            page.reload()
            assert page.locator('#income-mobile-avail').inner_text()=='••••••'
            page.get_by_role('button',name='Mostrar renda mensal',exact=True).click()
            assert '3.750,00' in page.locator('#income-mobile-avail').inner_text()
            # Ratios greater than 100% stay accurate; only the visual bar is capped.
            page.evaluate("income=1000;renderIncomeWidget()")
            assert page.locator('#income-mobile-pct').inner_text()=='125%'
            assert '-250,00' in page.locator('#income-mobile-avail').inner_text()
            assert page.locator('#income-bar-fill').evaluate('e=>e.style.width')=='100%'
            page.evaluate('income=5000;renderIncomeWidget();toggleTheme()')
            assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
            artifacts=os.environ.get('UI_TEST_ARTIFACTS')
            if artifacts:
                Path(artifacts).mkdir(parents=True,exist_ok=True)
                page.screenshot(path=str(Path(artifacts)/f'mobile-budget-{width}.png'),animations='disabled')
            assert errors==[],errors
            context.close()
            print(f'PASS {width}px: available income, percentage, period unchanged, persistent privacy, fixed header, menu/profile, overspending, desktop and dark theme')
    finally:
        browser.close()
