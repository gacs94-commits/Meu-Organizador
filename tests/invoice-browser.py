"""Run with a local server using python3 tests/invoice-browser.py.
Checks purchase dates vs. invoice periods using fictitious data only.
"""
import json
import os
from pathlib import Path
from datetime import datetime,timezone
from playwright.sync_api import sync_playwright
BASE=os.environ.get('APP_TEST_URL','http://127.0.0.1:8767')
CSV=b'date,title,amount\n2025-12-06,Compra antiga,100.00\n2026-01-04,Compra nova,20.00\n2026-01-06,Pagamento recebido,-100.00'
LEGACY={'id':1,'date':'2025-12-06','desc':'Compra antiga','val':100,'type':'saida','cat':'Lazer','importSource':'Nubank PF — cartão','importKind':'nubank-card'}
def upload(page,name='Nubank_2026-01-13.csv'):
    page.evaluate('openImporter()')
    page.set_input_files('#imp-file-input',{'name':name,'mimeType':'text/csv','buffer':CSV})
    page.wait_for_function('impRows.length===3')
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    try:
        for width in [320,390,1440]:
            context=browser.new_context(viewport={'width':width,'height':1000},service_workers='block',timezone_id='America/Sao_Paulo',accept_downloads=True)
            page=context.new_page()
            errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.on('dialog',lambda dialog:dialog.accept())
            page.clock.install(time=datetime(2026,1,10,12,tzinfo=timezone.utc))
            page.goto(BASE)
            # Existing records stored the payment month: retain bytes/identity but read them as the due month.
            known={**LEGACY,'cycleMonth':'2025-12','invoiceMonth':'2026-01'}
            page.set_input_files('#import-input',{'name':'known.json','mimeType':'application/json','buffer':json.dumps({'income':1000,'data':{'fin':[known]},'analysis':{'periodBasis':'invoice','completedMonths':['2026-01']}}).encode()})
            page.wait_for_function("document.querySelector('#import-input').value === ''")
            assert page.evaluate('FinanceAnalysis.period(D.fin[0])')=='2026-01'
            assert page.evaluate('D.fin[0].invoiceMonth')=='2026-01'
            assert page.evaluate('readFinanceAnalysisSettings().completedMonths.length')==0
            upload(page)
            assert page.locator('#imp-invoice-month').input_value()=='2026-01'
            assert page.evaluate("impRows.filter(r=>r.status==='existing').length")==1
            page.evaluate('confirmImport()')
            assert page.evaluate('D.fin.length')==2
            assert page.evaluate('D.fin[0].id')==1
            page.set_input_files('#import-input',{'name':'legacy.json','mimeType':'application/json','buffer':json.dumps({'income':1000,'data':{'fin':[LEGACY]},'analysis':{'completedMonths':['2026-11']}}).encode()})
            page.wait_for_function("document.querySelector('#import-input').value === ''")
            assert page.locator('#fin-invoice-notice').is_visible()
            assert page.evaluate("FinanceAnalysis.summarize(D.fin,'2026-11').cents")==0
            assert page.evaluate('readFinanceAnalysisSettings().completedMonths.length')==0
            upload(page,'invoice.csv')
            assert page.locator('#imp-invoice-month').input_value()==''
            page.evaluate('confirmImport()')
            assert 'vencimento' in page.locator('#toast').inner_text()
            assert page.evaluate('D.fin.length')==1
            page.locator('#imp-invoice-month').fill('2026-01')
            page.locator('#imp-invoice-month').dispatch_event('change')
            assert page.evaluate("impRows.filter(r=>r.status==='assign').length")==1
            page.evaluate('confirmImport()')
            assert page.evaluate('D.fin.length')==2
            assert page.evaluate('D.fin[0].id')==1
            assert page.evaluate('D.fin[0].cat')=='Lazer'
            assert page.evaluate('D.fin[0].date')=='2025-12-06'
            assert page.evaluate('D.fin[0].invoiceMonth')=='2026-01'
            assert page.locator('#fin-month').input_value()=='2026-01'
            assert '120,00' in page.locator('#fin-s1').inner_text()
            assert page.locator('#fin-invoice-notice').is_hidden()
            assert page.evaluate("FinanceAnalysis.summarize(D.fin,'2025-12').cents")==0
            assert '06/12/2025 a 05/01/2026' in page.locator('#fin-cycle-description').inner_text()
            assert '13/01/2026' in page.locator('#fin-cycle-description').inner_text()
            page.locator('#ftab-historico').click()
            assert 'Janeiro 2026' in page.locator('#fin-history').inner_text()
            assert 'Dezembro 2025' not in page.locator('#fin-history').inner_text()
            page.locator('#ftab-analise').click()
            page.locator('#analysis-month').select_option('2026-01')
            assert '120,00' in page.locator('#analysis-spent').inner_text()
            page.locator('#analysis-complete').check()
            upload(page)
            assert page.locator('#imp-invoice-month').input_value()=='2026-01'
            assert page.evaluate("impRows.filter(r=>r.status==='existing').length")==2
            page.evaluate('confirmImport()')
            assert page.evaluate('D.fin.length')==2
            page.evaluate('closeImporter();finTab("extrato");openFinanceInvoice(1)')
            page.locator('#edit-fin-invoice').fill('2026-02')
            page.get_by_role('button',name='Salvar fatura',exact=True).click()
            assert page.evaluate('D.fin[0].invoiceMonth')=='2026-02'
            assert page.evaluate('D.fin[0].cycleMonth')=='2026-01'
            assert page.evaluate('D.fin[0].date')=='2025-12-06'
            assert 'Janeiro 2026' not in page.locator('#fin-list').inner_text()
            assert page.evaluate('readFinanceAnalysisSettings().completedMonths.length')==0
            with page.expect_download() as download:
                page.evaluate('exportBackup()')
            file=Path('/tmp')/f'invoice-backup-{width}.json'
            download.value.save_as(file)
            assert json.loads(file.read_text())['data']['fin'][0]['invoiceMonth']=='2026-02'
            page.reload()
            assert page.evaluate('D.fin[0].invoiceMonth')=='2026-02'
            assert page.evaluate('D.fin[0].date')=='2025-12-06'
            page.evaluate('toggleTheme()')
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
            assert errors==[],errors
            context.close()
            print(f'PASS {width}px: legacy invoice review, required month, filename suggestion, linking without duplicates, January-2026 totals/history/analysis, reassignment, backup and reload')
    finally:
        browser.close()
