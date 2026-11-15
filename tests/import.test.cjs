const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function setup() {
  const elements = new Map();
  const context = vm.createContext({
    localStorage: {setItem(){}},
    D: { fin: [] }, uid: (() => { let n=0; return () => ++n; })(),
    $: id => { if(!elements.has(id)) elements.set(id,{value:'Nubank PF — cartão',style:{},classList:{remove(){}}}); return elements.get(id); },
    save(){}, renderFinance(){}, renderIncomeWidget(){}, toast(){}, confirm:()=>true,
    esc: x=>x, fp: x=>String(x),
  });
  const source = fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
  const start = source.indexOf('// ═══════ OFX / CSV IMPORTER');
  vm.runInContext(source.slice(start,source.indexOf('// Drag & drop',start)),context);
  return code => vm.runInContext(code,context);
}
test('Nubank descriptions, signs, installments and payment are interpreted correctly',()=>{
 const run=setup();
 run(`impRows=parseCSV('date,title,amount\\n2026-12-10,Loja - Parcela 1/3,"20,00"\\n2026-12-11,Pagamento recebido,"- 1.234,56"').map((r,id)=>({...r,id}));refreshImportSource()`);
 assert.equal(run('impRows[0].desc'),'Loja - Parcela 1/3');
 assert.equal(run('impRows[0].type'),'saida');
 assert.equal(run('impRows[1].amount'),1234.56);
 assert.equal(run('impRows[1].checked'),false);
 run('confirmImport()');assert.equal(run('D.fin.length'),1);
});
test('reimport preserves categories and counts identical purchases individually',()=>{
 const run=setup();
 const load=`impRows=parseCSV('date,title,amount\\n2026-12-10,Loja,20.00\\n2026-12-10,Loja,20.00').map((r,id)=>({...r,id}));refreshImportSource();`;
 run(load+'confirmImport();D.fin[0].cat="Lazer";');
 run(load+'confirmImport()');assert.equal(run('D.fin.length'),2);assert.equal(run('D.fin[0].cat'),'Lazer');
 run(`impRows=parseCSV('date,title,amount\\n2026-12-11,Nova,10.00').map((r,id)=>({...r,id}));refreshImportSource();confirmImport()`);
 assert.equal(run('D.fin.length'),3);
});
test('legacy and changed purchases require review; other sources remain independent',()=>{
 const run=setup();run(`D.fin=[{id:1,date:'2026-12-10',desc:'Loja',val:20,type:'saida',cat:'Lazer'}];impRows=parseCSV('date,title,amount\\n2026-12-10,Loja,20.00').map((r,id)=>({...r,id}));refreshImportSource()`);
 assert.equal(run('impRows[0].status'),'review');assert.equal(run('impRows[0].checked'),false);
 run(`D.fin[0].importSource='Outro cartão';refreshImportSource()`);assert.equal(run('impRows[0].status'),'new');
 run(`D.fin[0].importSource=$('imp-source').value;D.fin[0].val=25;refreshImportSource()`);assert.equal(run('impRows[0].status'),'review');
});
