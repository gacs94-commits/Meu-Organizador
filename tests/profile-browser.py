"""Run against a local server with python3 tests/profile-browser.py.
Requires Python Playwright, Chromium, and Pillow for fictitious avatar fixtures.
APP_TEST_URL and CHROMIUM_PATH may override the defaults.
"""
import io
import json
import os
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

BASE=os.environ.get('APP_TEST_URL','http://127.0.0.1:8767')
buffer=io.BytesIO()
Image.new('RGB',(32,48),(70,100,220)).save(buffer,format='PNG')
PHOTO=buffer.getvalue()

with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    try:
        for width in [390,1440]:
            context=browser.new_context(viewport={'width':width,'height':1000},service_workers='block',accept_downloads=True)
            context.route('**/*',lambda route:route.continue_() if route.request.url.startswith(BASE+'/') else route.abort())
            page=context.new_page()
            errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.on('dialog',lambda dialog:dialog.accept())
            page.goto(BASE)
            page.wait_for_load_state('networkidle')
            page.get_by_role('button',name='Abrir perfil',exact=True).click()
            page.get_by_role('textbox',name='Nome do perfil').fill('Nome de exemplo')
            assert json.loads(page.evaluate("localStorage.getItem('hub_profile')"))['name']=='Nome de exemplo'
            # Delay file reading to reproduce clicking Save before the photo is ready.
            page.evaluate("""() => {const read=FileReader.prototype.readAsDataURL;FileReader.prototype.readAsDataURL=function(file){setTimeout(()=>read.call(this,file),150)};}""")
            page.get_by_label('Escolher foto do perfil').set_input_files({'name':'avatar.png','mimeType':'image/png','buffer':PHOTO})
            assert page.locator('#pp-save-btn').is_disabled()
            assert page.evaluate('saveProfile()') is False
            page.wait_for_function("profileData.avatar && profileData.avatar.startsWith('data:image/jpeg') && !profilePhotoLoading")
            saved=json.loads(page.evaluate("localStorage.getItem('hub_profile')"))
            assert saved['name']=='Nome de exemplo'
            assert saved['avatar'].startswith('data:image/jpeg')
            assert page.locator('#profile-btn-avatar img').count()==1
            page.reload()
            assert page.evaluate('profileData.name')=='Nome de exemplo'
            assert page.evaluate('profileData.avatar')==saved['avatar']
            page.get_by_role('button',name='Abrir perfil',exact=True).click()
            assert page.get_by_role('textbox',name='Nome do perfil').input_value()=='Nome de exemplo'
            # All backgrounds persist without recursion, and a separate theme toggle survives reload.
            for preset in ['deep-dark','navy-dark','default-dark','cream','white','default-light']:
                page.evaluate('(preset)=>selectBgPreset(preset)',preset)
                page.reload()
                assert page.evaluate('profileData.bgPreset')==preset
                assert page.locator('html').get_attribute('data-theme')==('dark' if 'dark' in preset else 'light')
            page.get_by_role('button',name='Abrir perfil',exact=True).click()
            page.evaluate("selectBgPreset('deep-dark');selectAccent(1)")
            page.evaluate('toggleTheme()')
            page.reload()
            assert page.locator('html').get_attribute('data-theme')=='light'
            assert page.evaluate('profileData.accentIndex')==1
            assert page.evaluate('profileData.name')=='Nome de exemplo'
            # The actual backup includes the photo/name and restores on another isolated browser.
            with page.expect_download() as download:
                page.evaluate('exportBackup()')
            file=Path('/tmp')/f'profile-backup-{width}.json'
            download.value.save_as(file)
            exported=json.loads(file.read_text())
            assert exported['profile']['avatar']==saved['avatar']
            second=browser.new_context(viewport={'width':width,'height':1000},service_workers='block')
            destination=second.new_page()
            destination.on('pageerror',lambda error:errors.append(str(error)))
            destination.on('dialog',lambda dialog:dialog.accept())
            destination.goto(BASE)
            destination.set_input_files('#import-input',str(file))
            destination.wait_for_function("document.querySelector('#import-input').value === ''")
            destination.reload()
            assert destination.evaluate('profileData.name')=='Nome de exemplo'
            assert destination.evaluate('profileData.avatar')==saved['avatar']
            assert destination.locator('html').get_attribute('data-theme')=='light'
            second.close()
            # Failed writes preserve the saved profile, keep editing open and allow retry.
            page.get_by_role('button',name='Abrir perfil',exact=True).click()
            before=page.evaluate("localStorage.getItem('hub_profile')")
            page.evaluate("""() => {const set=Storage.prototype.setItem;window.restoreProfileStorage=()=>{Storage.prototype.setItem=set;};Storage.prototype.setItem=function(key,value){if(key==='hub_profile')throw new DOMException('quota','QuotaExceededError');return set.call(this,key,value)};}""")
            page.get_by_role('textbox',name='Nome do perfil').fill('Nome não salvo')
            assert page.evaluate("localStorage.getItem('hub_profile')")==before
            assert page.evaluate('profileData.name')=='Nome de exemplo'
            assert 'Não foi possível salvar' in page.locator('#pp-save-status').inner_text()
            assert page.locator('#profile-panel').is_visible()
            page.evaluate('restoreProfileStorage()')
            page.get_by_role('button',name='Salvar agora',exact=True).click()
            page.reload()
            assert page.evaluate('profileData.name')=='Nome não salvo'
            # Corrupted photos are rejected without replacing the previous avatar.
            page.get_by_role('button',name='Abrir perfil',exact=True).click()
            page.get_by_label('Escolher foto do perfil').set_input_files({'name':'bad.png','mimeType':'image/png','buffer':b'not an image'})
            page.wait_for_function("document.querySelector('#pp-save-status').classList.contains('is-error')")
            assert page.evaluate('profileData.avatar')==saved['avatar']
            assert not page.locator('#pp-save-btn').is_disabled()
            # Legacy backups preserve the existing profile; malformed local profiles stay recoverable.
            page.set_input_files('#import-input',{'name':'legacy.json','mimeType':'application/json','buffer':json.dumps({'data':{'fin':[]}}).encode()})
            page.wait_for_function("document.querySelector('#import-input').value === ''")
            assert page.evaluate('profileData.name')=='Nome não salvo'
            page.evaluate("localStorage.setItem('hub_profile','{broken profile')")
            page.reload()
            assert page.locator('#data-recovery-notice').is_visible()
            assert page.evaluate("localStorage.getItem('hub_profile')")=='{broken profile'
            page.set_input_files('#import-input',str(file))
            page.wait_for_function("document.querySelector('#import-input').value === ''")
            assert page.locator('#data-recovery-notice').count()==0
            assert page.evaluate('profileData.name')=='Nome de exemplo'
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
            assert errors==[],errors
            context.close()
            print(f'PASS {width}px: automatic name/photo saving, photo-processing race, reload, all backgrounds, theme toggle, cross-browser backup, quota failure/retry, invalid photo')
    finally:
        browser.close()
