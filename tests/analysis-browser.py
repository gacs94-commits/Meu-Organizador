"""With a local HTTP server running, execute python3 tests/analysis-browser.py.
APP_TEST_URL overrides http://127.0.0.1:8767; requires Python Playwright and Chromium.
Only fictitious data and isolated browser contexts are used.
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE=os.environ.get('APP_TEST_URL','http://127.0.0.1:8767')
FIN=[{'id':1,'date':'2026-10-10','desc':'Exemplo outubro','val':100,'type':'saida','cat':'Alimentação'},
     {'id':2,'date':'2026-11-10','desc':'Exemplo novembro','val':60,'type':'saida','cat':'Alimentação'},
     {'id':3,'date':'2026-11-11','desc':'Exemplo lazer','val':60,'type':'saida','cat':'Lazer'},
     {'id':4,'date':'2026-11-12','desc':'Entrada de exemplo','val':1000,'type':'entrada','cat':'Outros'}]

def restore(page, data):
    page.set_input_files('#import-input',{'name':'backup.json','mimeType':'application/json','buffer':json.dumps(data).encode()})
    page.wait_for_function("document.querySelector('#import-input').value === ''")

with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    try:
        for width in [320,390,1440]:
            context=browser.new_context(viewport={'width':width,'height':1000},service_workers='block',accept_downloads=True,timezone_id='America/Sao_Paulo')
            context.route('**/*',lambda route:route.continue_() if route.request.url.startswith(BASE+'/') else route.abort())
            page=context.new_page()
            errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.on('dialog',lambda dialog:dialog.accept())
            page.goto(BASE)
            page.wait_for_load_state('networkidle')
            page.get_by_role('button',name='Análise do mês',exact=True).click()
            assert page.locator('#fpanel-analise').is_visible()
            assert not page.locator('#fpanel-extrato').is_visible()
            assert not page.locator('#fpanel-historico').is_visible()
            assert 'Sem gastos' in page.locator('#analysis-category-insight').inner_text()
            restore(page,{'version':1,'income':1000,'data':{'fin':FIN}})
            page.locator('#analysis-month').select_option('2026-11')
            assert '120,00' in page.locator('#analysis-spent').inner_text()
            assert '12%' in page.locator('#analysis-income').inner_text()
            assert '880,00' in page.locator('#analysis-income').inner_text()
            assert page.locator('#analysis-categories .analysis-category').count()==2
            assert '50%' in page.locator('#analysis-category-insight').inner_text()
            assert page.locator('.analysis-comparison-bars').count()==0
            page.locator('#analysis-complete').check()
            assert page.locator('.analysis-comparison-bars').count()==0
            page.locator('#analysis-month').select_option('2026-10')
            page.locator('#analysis-complete').check()
            page.locator('#analysis-month').select_option('2026-11')
            assert '20% a mais' in page.locator('#analysis-comparison').inner_text()
            assert page.locator('.analysis-comparison-bars progress').count()==2
            # Privacy must remove both income and derivable percentages from the panel.
            page.get_by_role('button',name='Ocultar renda mensal',exact=True).click()
            assert 'Renda oculta' in page.locator('#analysis-income').inner_text()
            assert '12%' not in page.locator('#analysis-income').inner_text()
            assert '1.000' not in page.locator('#analysis-income').inner_text()
            page.get_by_role('button',name='Mostrar renda mensal',exact=True).click()
            assert '12%' in page.locator('#analysis-income').inner_text()
            # Both completed months and selected new data survive normal backup round trips.
            with page.expect_download() as download:
                page.evaluate('exportBackup()')
            file=Path('/tmp')/f'analysis-backup-{width}.json'
            download.value.save_as(file)
            backup=json.loads(file.read_text())
            assert backup['analysis']['completedMonths']==['2026-10','2026-11']
            page.reload()
            page.get_by_role('button',name='Análise do mês',exact=True).click()
            page.locator('#analysis-month').select_option('2026-11')
            assert '20% a mais' in page.locator('#analysis-comparison').inner_text()
            # Failed financial writes must retain both the dataset and month confirmations.
            page.evaluate("""() => {const original=Storage.prototype.setItem;let failed=false;window.restoreAnalysisStorage=()=>{Storage.prototype.setItem=original;};Storage.prototype.setItem=function(key,value){if(key==='hub_fin'&&!failed){failed=true;throw new DOMException('quota','QuotaExceededError')}return original.call(this,key,value)};D.fin.push({id:6,date:'2026-11-20',desc:'Não salvar',val:5,type:'saida',cat:'Outros'});if(save('fin'))throw new Error('Unexpected successful save');renderFinance();}""")
            assert page.locator('#analysis-complete').is_checked()
            assert page.evaluate('D.fin.length')==len(FIN)
            assert json.loads(page.evaluate("localStorage.getItem('hub_fin_analysis')"))['completedMonths']==['2026-10','2026-11']
            page.evaluate('restoreAnalysisStorage()')
            # Saving a changed month invalidates only that month's completion flag.
            page.evaluate("() => {D.fin.push({id:5,date:'2026-11-20',desc:'Novo gasto',val:5,type:'saida',cat:'Outros'});if(!save('fin'))throw new Error('failed save');renderFinance();}")
            assert not page.locator('#analysis-complete').is_checked()
            assert json.loads(page.evaluate("localStorage.getItem('hub_fin_analysis')"))['completedMonths']==['2026-10']
            assert page.locator('.analysis-comparison-bars').count()==0
            # Restore the exported metadata, then check dark theme and responsive layout.
            restore(page,backup)
            page.locator('#analysis-month').select_option('2026-11')
            assert page.locator('#analysis-complete').is_checked()
            artifacts=os.environ.get('UI_TEST_ARTIFACTS')
            if artifacts:
                Path(artifacts).mkdir(parents=True,exist_ok=True)
                page.screenshot(path=str(Path(artifacts)/f'analysis-{width}.png'),full_page=True,animations='disabled')
            page.evaluate('toggleTheme()')
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
            # A month without a previous record can be explicitly reviewed as zero.
            page.locator('#analysis-month').select_option('2026-10')
            page.locator('#analysis-previous').click()
            assert page.locator('#analysis-month').input_value()=='2026-09'
            page.locator('#analysis-complete').check()
            page.locator('#analysis-month').select_option('2026-10')
            assert 'não há base' in page.locator('#analysis-comparison').inner_text()
            # An old backup cannot carry completeness over to a different dataset.
            restore(page,{'income':0,'data':{'fin':FIN}})
            assert not page.locator('#analysis-complete').is_checked()
            assert 'Defina sua renda' in page.locator('#analysis-income').inner_text()
            assert errors==[],errors
            context.close()
            print(f'PASS {width}px: tabs, totals, categories, complete-month comparison, privacy, persistence, invalidation, backup, zero baseline, dark theme, responsive layout')
    finally:
        browser.close()
