const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function render(fin){
 const el={};const code=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
 const ctx=vm.createContext({D:{fin},$:()=>el,fp:n=>String(n),emptyHTML:s=>s});
 vm.runInContext(code.slice(code.indexOf('function renderFinHistory()'),code.indexOf('function viewFinanceMonth(')),ctx);
 vm.runInContext('renderFinHistory()',ctx);return el.innerHTML;
}
test('monthly history compares expense totals, excludes income, keeps years separate and omits purchase names',()=>{
 const html=render([{date:'2026-12-10',type:'saida',val:100,desc:'Private purchase'}, {date:'2026-12-12',type:'saida',val:50}, {date:'2026-12-13',type:'entrada',val:500}, {date:'2025-12-10',type:'saida',val:75}]);
 assert.match(html,/Dezembro 2026/);assert.match(html,/Dezembro 2025/);
 assert.match(html,/<strong>225<\/strong>/);assert.match(html,/max="150" value="150"/);assert.match(html,/max="150" value="75"/);
 assert.doesNotMatch(html,/Private purchase|500/);assert.equal((html.match(/class="finance-month"/g)||[]).length,2);
 assert(html.indexOf('Dezembro 2026')<html.indexOf('Dezembro 2025'));
});
test('empty history and income-only month have honest zero states',()=>{
 assert.match(render([]),/primeira importação/);
 const html=render([{date:'2026-11-10',type:'entrada',val:500}]);
 assert.match(html,/max="1" value="0"/);assert.match(html,/0 gastos registrados/);assert.doesNotMatch(html,/NaN|Infinity/);
});
