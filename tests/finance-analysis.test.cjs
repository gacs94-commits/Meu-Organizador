const {test}=require('node:test');
const assert=require('node:assert/strict');
const analysis=require('../finance-analysis.js');
const safety=require('../data-safety.js');
const records=[{id:1,date:'2026-10-10',type:'saida',val:100,cat:'Alimentação'},{id:2,date:'2026-11-10',type:'saida',val:60,cat:'Alimentação'},{id:3,date:'2026-11-11',type:'saida',val:60,cat:'Lazer'},{id:4,date:'2026-11-12',type:'entrada',val:1000}];
test('analysis totals only expenses in the selected calendar month and groups categories',()=>{
 const sum=analysis.summarize(records,'2026-11');
 assert.equal(sum.cents,12000);assert.equal(sum.count,2);assert.equal(sum.recordsCount,3);
 assert.deepEqual(sum.categories,[{name:'Alimentação',cents:6000},{name:'Lazer',cents:6000}]);
 assert.equal(analysis.summarize([{date:'2026-11-10',type:'saida',val:.1},{date:'2026-11-11',type:'saida',val:.2}],'2026-11').cents,30);
});
test('comparison requires both complete months and compares the immediate calendar predecessor',()=>{
 assert.equal(analysis.compare(records,'2026-11',[]).ready,false);
 assert.equal(analysis.compare(records,'2026-11',['2026-11']).ready,false);
 const comparison=analysis.compare(records,'2026-11',['2026-10','2026-11']);
 assert.equal(comparison.ready,true);assert.equal(comparison.difference,2000);assert.equal(comparison.percentage,20);
 assert.equal(analysis.previousMonth('2026-01'),'2025-12');
 assert.equal(analysis.compare(records,'2026-12',['2026-10','2026-12']).ready,false);
});
test('zero previous expenses never produces a fabricated percentage or NaN',()=>{
 const result=analysis.compare(records.filter(row=>row.date.startsWith('2026-11')),'2026-11',['2026-10','2026-11']);
 assert.equal(result.ready,true);assert.equal(result.percentage,null);assert.equal(result.difference,12000);
 assert.equal(analysis.summarize([],'2026-11').cents,0);
});
test('only affected months lose confirmation, regardless of array ordering',()=>{
 assert.deepEqual(analysis.changedMonths(records,[...records].reverse()),[]);
 assert.deepEqual(analysis.changedMonths(records,[...records,{id:5,date:'2026-11-20',type:'saida',val:10}]),['2026-11']);
 assert.deepEqual(analysis.changedMonths(records,records.filter(row=>row.id!==1)),['2026-10']);
 const moved=records.map(row=>row.id===1?{...row,date:'2026-09-10'}:row);
 assert.deepEqual(analysis.changedMonths(records,moved).sort(),['2026-09','2026-10']);
});
test('completion settings survive backup validation, and malicious settings are rejected',()=>{
 const fin=records.map(row=>({...row,desc:'Exemplo'}));
 assert.deepEqual(safety.backup({data:{fin},analysis:{completedMonths:['2026-11','2026-10','2026-11']}}).analysis,{completedMonths:['2026-10','2026-11']});
 assert.throws(()=>safety.backup({data:{fin},analysis:{completedMonths:['<script>']}}));
 assert.throws(()=>safety.backup({data:{fin},analysis:{completedMonths:'2026-11'}}));
 assert.throws(()=>safety.backup({data:{sh:[]},analysis:{completedMonths:[]}}));
 assert.equal('analysis' in safety.backup({data:{fin:[]}}),false);
});
test('card purchases use cycle start month; old payment-month metadata is read compatibly',()=>{
 const card={id:1,date:'2026-12-10',type:'saida',val:100,importKind:'nubank-card',cycleMonth:'2026-12',invoiceMonth:'2027-01'};
 assert.equal(analysis.period(card),'2026-12');
 assert.equal(analysis.summarize([card],'2026-11').cents,0);
 assert.equal(analysis.summarize([card],'2026-12').cents,10000);
 assert.equal(analysis.period({...card,cycleMonth:undefined}),'2026-12');
 assert.equal(analysis.period({...card,cycleMonth:undefined,invoiceMonth:undefined}),'');
 assert.equal(analysis.period({date:'2026-11-10',importKind:'statement'}),'2026-11');
 assert.equal(analysis.period({date:'2026-11-10'}),'2026-11');
 assert.deepEqual(analysis.changedMonths([card],[{...card,cycleMonth:'2027-01',invoiceMonth:'2027-02'}]).sort(),['2026-12','2027-01']);
});
test('invoice metadata and comparison basis survive backup validation',()=>{
 const row={id:1,desc:'Exemplo',date:'2026-11-10',val:100,type:'saida',importKind:'card',invoiceMonth:'2026-12'};
 const backup=safety.backup({data:{fin:[row]},analysis:{periodBasis:'invoice',completedMonths:['2026-12']}});
 assert.equal(backup.data.fin[0].date,'2026-11-10');
 assert.equal(backup.data.fin[0].invoiceMonth,'2026-12');
 assert.equal(backup.analysis.periodBasis,'invoice');
 assert.throws(()=>safety.backup({data:{fin:[{...row,invoiceMonth:'2026-13'}]}}));
});

test('cycles start on day 6, close on day 5, and are due on day 13 of the next month',()=>{
 assert.equal(analysis.cycleForDate('2026-12-05'),'2026-11');
 assert.equal(analysis.cycleForDate('2026-12-06'),'2026-12');
 assert.equal(analysis.cycleForDate('2027-01-05'),'2026-12');
 assert.equal(analysis.cycleForDate('2027-01-06'),'2027-01');
 assert.equal(analysis.cycleForDate('2028-02-29'),'2028-02');
 assert.deepEqual(analysis.cycleInfo('2026-12'),{start:'2026-12-06',end:'2027-01-05',due:'2027-01-13'});
 assert.equal(analysis.nextMonth('2026-12'),'2027-01');
 assert.match(analysis.cycleCaption('2026-12'),/06\/12\/2026 a 05\/01\/2027.*13\/01\/2027/);
 const backup=safety.backup({data:{fin:[{id:1,desc:'Compra',val:10,type:'saida',date:'2027-01-05',cycleMonth:'2026-12',invoiceMonth:'2027-01'}]},analysis:{periodBasis:'cycle-6-5',completedMonths:['2026-12']}});
 assert.equal(backup.data.fin[0].cycleMonth,'2026-12');
 assert.equal(backup.analysis.periodBasis,'cycle-6-5');
 assert.throws(()=>safety.backup({data:{fin:[{id:1,desc:'Compra',val:10,type:'saida',date:'2027-01-05',cycleMonth:'2026-12',invoiceMonth:'2026-12'}]}}));
});

test('active card cycle switches on day 6 while account-only records keep calendar months',()=>{
 const cards=[{importKind:'nubank-card'}];
 assert.equal(analysis.currentMonth(cards,new Date(2027,0,5,12)),'2026-12');
 assert.equal(analysis.currentMonth(cards,new Date(2027,0,6,12)),'2027-01');
 assert.equal(analysis.currentMonth([],new Date(2027,0,5,12)),'2027-01');
});
