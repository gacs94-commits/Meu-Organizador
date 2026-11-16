"""Run against APP_TEST_URL (default http://127.0.0.1:8767) with Python Playwright.
All destructive operations target isolated fictitious browser data only.
"""
import json
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('APP_TEST_URL','http://127.0.0.1:8767')
ROWS=[{'id':1,'desc':'Compra visível','date':'2026-12-06','val':10,'type':'saida','importKind':'card','cycleMonth':'2026-12','invoiceMonth':'2027-01'},
      {'id':2,'desc':'Crédito oculto','date':'2027-01-05','val':2,'type':'entrada','importKind':'card','cycleMonth':'2026-12','invoiceMonth':'2027-01'},
      {'id':3,'desc':'Manual oculto','date':'2027-01-01','val':8,'type':'saida'},
      {'id':4,'desc':'Outro ciclo','date':'2027-01-06','val':20,'type':'saida','importKind':'card','cycleMonth':'2027-01','invoiceMonth':'2027-02'},
      {'id':5,'desc':'Ciclo indefinido','date':'2026-11-10','val':5,'type':'saida','importKind':'nubank-card'}]
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    try:
        for width in [390,1440]:
            context=browser.new_context(viewport={'width':width,'height':1000},service_workers='block')
            page=context.new_page()
            errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            def accept(dialog): dialog.accept()
            page.on('dialog',accept)
            page.goto(BASE)
            page.set_input_files('#import-input',{'name':'test.json','mimeType':'application/json','buffer':json.dumps({'data':{'fin':ROWS},'analysis':{'periodBasis':'invoice-due-6-5','completedMonths':['2027-01','2027-02']}}).encode()})
            page.wait_for_function("document.querySelector('#import-input').value === ''")
            page.locator('#fin-month').select_option('')
            assert page.locator('#fin-delete-month').is_hidden()
            page.evaluate('deleteFinanceMonth()')
            assert page.evaluate('D.fin.length')==5
            page.locator('#fin-month').select_option('2027-01')
            page.locator('#fin-search').fill('visível')
            assert page.locator('#fin-list .fin-item').count()==1
            # Cancel must preserve every entry, despite a filtered view.
            page.remove_listener('dialog',accept)
            messages=[]
            def cancel(dialog):
                messages.append(dialog.message)
                dialog.dismiss()
            page.on('dialog',cancel)
            page.locator('#fin-delete-month').click()
            assert '3 lançamentos' in messages[-1]
            assert '06/12/2026 a 05/01/2027' in messages[-1]
            assert page.evaluate('D.fin.length')==5
            page.remove_listener('dialog',cancel)
            page.on('dialog',accept)
            # A failed write must retain all rows and completeness flags.
            page.evaluate("""() => {const set=Storage.prototype.setItem;let failed=false;window.restoreDeleteStorage=()=>{Storage.prototype.setItem=set;};Storage.prototype.setItem=function(key,value){if(key==='hub_fin'&&!failed){failed=true;throw new DOMException('quota','QuotaExceededError')}return set.call(this,key,value)};}""")
            page.locator('#fin-delete-month').click()
            assert page.evaluate('D.fin.length')==5
            assert page.evaluate('readFinanceAnalysisSettings().completedMonths.length')==2
            assert 'excluído' not in page.locator('#toast').inner_text()
            page.evaluate('restoreDeleteStorage()')
            page.locator('#fin-delete-month').click()
            assert page.evaluate('D.fin.map(row=>row.id)')==[4,5]
            assert page.evaluate('readFinanceAnalysisSettings().completedMonths')==['2027-02']
            assert page.locator('#fin-month').input_value()=='2027-01'
            assert page.locator('#fin-delete-month').is_disabled()
            page.reload()
            assert page.evaluate('D.fin.map(row=>row.id)')==[4,5]
            # The history button targets its own month, even if the main selector points elsewhere.
            page.locator('#ftab-historico').click()
            page.get_by_role('button',name='Excluir todos os lançamentos de Fevereiro 2027',exact=True).click()
            assert page.evaluate('D.fin.map(row=>row.id)')==[5]
            assert page.evaluate('readFinanceAnalysisSettings().completedMonths')==[]
            assert page.locator('#fin-invoice-notice').is_visible()
            page.evaluate('toggleTheme()')
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
            assert errors==[],errors
            context.close()
            print(f'PASS {width}px: scoped deletion, confirmation/cancel, hidden entries, quota rollback, other periods and unassigned preserved, history action, reload, dark theme')
    finally:
        browser.close()
