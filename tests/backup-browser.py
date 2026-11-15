"""Run with a local server: python3 -m http.server 8767 --bind 127.0.0.1.
Then: python3 tests/backup-browser.py. Uses only isolated, fictitious data.
Requires Python Playwright and Chromium (CHROMIUM_PATH overrides its path).
"""
import json
import os
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE=os.environ.get('APP_TEST_URL','http://127.0.0.1:8767')
EXPECTED_CACHE=re.search(r"CACHE_NAME = '([^']+)'",(Path(__file__).resolve().parent.parent/'sw.js').read_text()).group(1)
FIN={'id':1,'date':'2026-11-10','desc':'Compra de exemplo','val':20,'type':'saida','cat':'Outros','importSource':'Nubank PF — cartão','importKind':'nubank-card'}

def upload_backup(page, data, income=0):
    page.set_input_files('#import-input',{'name':'backup.json','mimeType':'application/json','buffer':json.dumps({'version':1,'income':income,'data':data}).encode()})
    page.wait_for_function("document.querySelector('#import-input').value === ''")

def upload_csv(page):
    page.evaluate('openImporter()')
    page.set_input_files('#imp-file-input',{'name':'fatura.csv','mimeType':'text/csv','buffer':b'date,title,amount\n2026-11-12,Compra exemplo,20.00'})
    page.wait_for_function('impRows.length === 1')
    page.locator('#imp-invoice-month').fill('2026-12')
    page.locator('#imp-invoice-month').dispatch_event('change')

with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    try:
        for width in (390,1440):
            context=browser.new_context(viewport={'width':width,'height':900},service_workers='block',accept_downloads=True)
            context.route('**/*',lambda route: route.continue_() if route.request.url.startswith(BASE+'/') else route.abort())
            page=context.new_page()
            errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.on('dialog',lambda dialog:dialog.accept())
            page.goto(BASE)
            page.wait_for_load_state('networkidle')
            upload_backup(page,{
                'fin':[FIN],
                'wish':[{'id':2,'name':'Jogo','price':10,'priority':'média','platform':'PC','genre':'RPG'}],
                'col':[{'id':3,'name':'Coleção','played':'jogando','rating':4}],
                'mv':[{'id':4,'name':'Filme','genre':'<b>Drama</b>','score':8}],
                'bk':[{'id':5,'name':'Livro','author':'Autor','pages':100}],
                'sh':[{'id':6,'name':'Compras','qty':2,'price':10,'done':True}],
                'ot':[{'id':7,'name':'Objeto','status':'tenho'}],
                'gl':[{'id':8,'name':'Meta','target':100,'current':30,'unit':'<b>reais</b>','deadline':'2026-12-01'}],
                'attendance':['2026-11-10'],
                'diet':[{'date':'2026-11-10','name':'Almoço','details':'Arroz'}],
                'workout':[{'date':'2026-11-10','name':'Supino','sets':3,'reps':12,'weight':10}]
            },5000)
            assert page.evaluate('D.fin.length')==1
            assert page.evaluate('income')==5000
            original=page.evaluate("localStorage.getItem('hub_fin')")
            # Invalid backup cannot mutate valid storage or execute injected events.
            upload_backup(page,{'fin':{'invalid':True}})
            assert page.evaluate("localStorage.getItem('hub_fin')")==original
            assert 'inválido' in page.locator('#toast').inner_text()
            upload_backup(page,{'wish':[{'id':3,'name':'x','cover':'x" onerror="window.__reviewXss=1'}]})
            assert page.evaluate("typeof window.__reviewXss")== 'undefined'
            assert page.evaluate('D.wish[0].name')=='Jogo'
            page.reload()
            assert page.evaluate('D.fin.length')==1
            # HTML-like ordinary text is preserved and rendered as text.
            literal='<img src=x onerror="window.__reviewXss=1">'
            upload_backup(page,{'wish':[{'id':4,'name':'Seguro','genre':literal}]},0)
            assert page.evaluate('income')==0
            assert literal in page.locator('#w-list').inner_text()
            assert page.locator('#w-list img').count()==0
            assert page.evaluate("typeof window.__reviewXss")=='undefined'
            # Full exported backup must be accepted again without loss.
            with page.expect_download() as download:
                page.evaluate('exportBackup()')
            downloaded=download.value
            file=Path('/tmp')/f'backup-roundtrip-{width}.json'
            downloaded.save_as(file)
            exported=json.loads(file.read_text())
            assert exported['income']==0
            assert exported['data']['fin'][0]['importSource']=='Nubank PF — cartão'
            page.set_input_files('#import-input',str(file))
            page.wait_for_function("document.querySelector('#import-input').value === ''")
            assert page.evaluate('D.fin.length')==1
            # A collection move must roll both collections back on a partial failure.
            counts=page.evaluate('({wish:D.wish.length,col:D.col.length})')
            page.evaluate("""() => {const original=Storage.prototype.setItem;let failed=false;window.restoreStorage=()=>{Storage.prototype.setItem=original;};Storage.prototype.setItem=function(key,value){if(key==='hub_col'&&!failed){failed=true;throw new DOMException('quota','QuotaExceededError')}return original.call(this,key,value)};}""")
            page.evaluate('moveToCol(4)')
            assert page.evaluate('({wish:D.wish.length,col:D.col.length})')==counts
            assert 'sucesso' not in page.locator('#toast').inner_text()
            page.evaluate('restoreStorage()')
            # A simulated quota failure must roll memory back and leave the importer open.
            page.evaluate("""() => {const original=Storage.prototype.setItem;window.restoreStorage=()=>{Storage.prototype.setItem=original;};Storage.prototype.setItem=function(key,value){if(key==='hub_fin')throw new DOMException('quota','QuotaExceededError');return original.call(this,key,value)};}""")
            upload_csv(page)
            before=page.evaluate('D.fin.length')
            page.evaluate('confirmImport()')
            assert page.evaluate('D.fin.length')==before
            assert page.locator('#imp-modal').evaluate("e=>e.classList.contains('open')")
            assert 'cheio' in page.locator('#toast').inner_text()
            page.evaluate('restoreStorage()')
            page.evaluate('confirmImport()')
            assert page.evaluate('D.fin.length')==before+1
            assert 'sucesso' in page.locator('#toast').inner_text()
            page.reload()
            assert page.evaluate('D.fin.length')==before+1
            # Fail the second area once: the first area and income must also revert.
            before=page.evaluate("({fin:localStorage.getItem('hub_fin'),wish:localStorage.getItem('hub_wish'),income:localStorage.getItem('hub_income')})")
            page.evaluate("""() => {const original=Storage.prototype.setItem;let failed=false;window.restoreStorage=()=>{Storage.prototype.setItem=original;};Storage.prototype.setItem=function(key,value){if(key==='hub_fin'&&!failed){failed=true;throw new DOMException('quota','QuotaExceededError')}return original.call(this,key,value)};}""")
            upload_backup(page,{'wish':[{'id':99,'name':'Não deve permanecer'}],'fin':[]},1234)
            assert page.evaluate("({fin:localStorage.getItem('hub_fin'),wish:localStorage.getItem('hub_wish'),income:localStorage.getItem('hub_income')})")==before
            assert page.evaluate("localStorage.getItem('hub_restore_journal')") is None
            assert 'sucesso' not in page.locator('#toast').inner_text()
            page.evaluate('restoreStorage()')
            # Unreadable old data stays recoverable and cannot be silently overwritten.
            page.evaluate("localStorage.setItem('hub_fin','{invalid json')")
            page.reload()
            assert page.locator('#data-recovery-notice').is_visible()
            assert page.evaluate("localStorage.getItem('hub_fin')")=='{invalid json'
            assert page.evaluate('D.fin.length')==0
            with page.expect_download() as download:
                page.get_by_role('button',name='Baixar cópia de recuperação').click()
            recovered=Path('/tmp')/f'backup-recovery-{width}.json'
            download.value.save_as(recovered)
            assert json.loads(recovered.read_text())['rawStorage']['hub_fin']=='{invalid json'
            upload_backup(page,{'fin':[FIN]},0)
            assert page.locator('#data-recovery-notice').count()==0
            page.reload()
            assert page.evaluate('D.fin.length')==1
            # A simulated interruption is recovered before loading any area.
            page.evaluate("""() => {localStorage.setItem('hub_restore_journal',JSON.stringify({hub_fin:localStorage.getItem('hub_fin')}));localStorage.setItem('hub_fin','[]');}""")
            page.reload()
            assert page.evaluate('D.fin.length')==1
            assert page.evaluate("localStorage.getItem('hub_restore_journal')") is None
            for section in ['finance','games','movies','books','shopping','others','goals','health','invest']:
                page.evaluate('(s)=>goTo(s)',section)
                assert page.locator('#sec-'+section).is_visible()
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
            assert errors==[],errors
            context.close()
            print(f'PASS {width}px: malicious/invalid backup, text escaping, round trip, zero income, quota rollback, multi-key rollback, corrupt-data recovery, all sections')
        context=browser.new_context(service_workers='allow')
        page=context.new_page()
        page.goto(BASE)
        page.evaluate('navigator.serviceWorker.ready')
        page.wait_for_function('navigator.serviceWorker.controller !== null')
        assert page.evaluate("name=>caches.keys().then(keys=>keys.includes(name))",EXPECTED_CACHE)
        context.set_offline(True)
        page.reload()
        assert page.evaluate("typeof DataSafety.backup")=='function'
        assert page.evaluate("typeof FinanceAnalysis.summarize")=='function'
        page.get_by_role('button',name='Análise do mês',exact=True).click()
        assert page.locator('#fpanel-analise').is_visible()
        assert page.locator('#sec-finance').is_visible()
        context.close()
        print('PASS PWA: new validation module is cached and starts offline')
    finally:
        browser.close()
