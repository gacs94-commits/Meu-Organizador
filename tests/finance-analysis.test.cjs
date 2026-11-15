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
