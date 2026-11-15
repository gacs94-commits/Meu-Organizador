const {test}=require('node:test');
const assert=require('node:assert/strict');
const safety=require('../data-safety.js');
function storage(seed={},fail=()=>false){
 const data=new Map(Object.entries(seed));
 return {getItem:key=>data.has(key)?data.get(key):null,setItem(key,value){if(fail(key,value))throw new DOMException('quota','QuotaExceededError');data.set(key,String(value));},removeItem:key=>data.delete(key),dump:()=>Object.fromEntries(data)};
}
const fin={id:1,desc:'Mercado',val:20,type:'saida',cat:'Alimentação',date:'2026-11-10',importSource:'Nubank PF — cartão',importKind:'nubank-card'};
test('backup round trip preserves all supported collections, financial provenance and explicit zero income',()=>{
 const data={fin:[fin],wish:[{id:2,name:'Jogo',price:12,platform:'PC',priority:'média',cover:'https://example.com/game.png'}],col:[{id:3,name:'Coleção',played:'jogando',rating:4}],mv:[{id:4,name:'Filme',type:'filme',status:'assistindo',score:8}],bk:[{id:5,name:'Livro',author:'Autor',status:'lendo',pages:100}],sh:[{id:6,name:'Item',qty:2,price:10,done:true}],ot:[{id:7,name:'Objeto',status:'tenho'}],gl:[{id:8,name:'Meta',target:100,current:30,unit:'reais',deadline:'2026-12-01'}],attendance:['2026-11-10'],diet:[{date:'2026-11-10',name:'Almoço',details:'Arroz'}],workout:[{date:'2026-11-10',name:'Supino',sets:3,reps:12,weight:10}]};
 const parsed=safety.backup({version:1,income:0,data});
 assert.equal(parsed.income,0);assert.deepEqual(parsed.data.fin,[fin]);assert.equal(parsed.data.sh[0].qty,2);assert.deepEqual(safety.backup(JSON.parse(JSON.stringify(parsed))),parsed);
});
test('invalid objects, IDs, enum injections, numbers and calendar dates are rejected',()=>{
 for(const data of [{fin:{}},{fin:[{...fin,id:'1);alert(1)'}]},{fin:[{...fin,val:'20'}]},{fin:[{...fin,date:'2026-02-30'}]},{fin:[{...fin,type:'saida"><img onerror=alert(1)>'}]},{sh:[{id:1,name:'x',done:'false'}]}]) assert.throws(()=>safety.backup({data}));
 assert.throws(()=>safety.backup({version:2,data:{fin:[]}}));
 assert.throws(()=>safety.backup({income:-1,data:{fin:[]}}));
 assert.throws(()=>safety.backup({income:Infinity,data:{fin:[]}}));
});
test('malicious image attributes and active protocols are rejected; text stays text',()=>{
 for(const cover of ['x" onerror="alert(1)','javascript:alert(1)','data:image/svg+xml;base64,PHN2Zz4=','http://example.com/a.png']) assert.throws(()=>safety.backup({data:{wish:[{id:1,name:'x',cover}]}}));
 assert.equal(safety.image('data:image/png;base64,aGVsbG8='),'data:image/png;base64,aGVsbG8=');
 assert.equal(safety.backup({data:{wish:[{id:1,name:'<img onerror=alert(1)>',genre:'<b>x</b>'}]}}).data.wish[0].genre,'<b>x</b>');
});
test('batch restores old bytes, missing keys and income when a write fails',()=>{
 let failed=false;
 const original={hub_fin:'old-fin',hub_income:'5000'};
 const store=storage(original,(key,value)=>key==='hub_col'&&value==='new-col'&&!failed&&(failed=true));
 assert.throws(()=>safety.batch(store,{hub_fin:'new-fin',hub_col:'new-col',hub_income:'0'}));
 assert.deepEqual(store.dump(),original);
});
test('journal allocation failure performs no data writes',()=>{
 const store=storage({hub_fin:'original'},key=>key===safety.journalKey);
 assert.throws(()=>safety.batch(store,{hub_fin:'next'}));assert.deepEqual(store.dump(),{hub_fin:'original'});
});
test('interrupted batch is recovered on startup; completed batch has no journal',()=>{
 const store=storage({hub_fin:'partial',hub_income:'0',[safety.journalKey]:JSON.stringify({hub_fin:'old',hub_income:'5000',hub_col:null})});
 safety.recover(store);assert.deepEqual(store.dump(),{hub_fin:'old',hub_income:'5000'});
 safety.batch(store,{hub_fin:'next',hub_income:'0'});assert.deepEqual(store.dump(),{hub_fin:'next',hub_income:'0'});
});
test('recovery journal cannot restore unrelated storage keys',()=>{
 const store=storage({unrelated:'keep',[safety.journalKey]:'{"unrelated":"change"}'});
 assert.throws(()=>safety.recover(store));assert.equal(store.getItem('unrelated'),'keep');
});
test('failed rollback retains the original journal so a later startup can recover',()=>{
 let unavailable=true;
 const original={hub_fin:'original',hub_income:'5000'};
 const store=storage(original,key=>key==='hub_fin'&&unavailable);
 assert.throws(()=>safety.batch(store,{hub_fin:'next',hub_income:'0'}));
 assert.deepEqual(JSON.parse(store.getItem(safety.journalKey)),original);
 unavailable=false;
 safety.recover(store);
 assert.deepEqual(store.dump(),original);
});
test('legacy backup without version or income keeps absent areas absent',()=>{
 const parsed=safety.backup({data:{fin:[]}});
 assert.deepEqual(parsed,{data:{fin:[]}});
});
test('profile backup preserves name, safe photo and appearance while rejecting active content',()=>{
 const profile={name:'Meu nome',avatar:'data:image/png;base64,aGVsbG8=',accentIndex:2,bgPreset:'deep-dark'};
 assert.deepEqual(safety.backup({data:{fin:[]},profile,theme:'dark'}).profile,profile);
 assert.equal(safety.backup({data:{fin:[]},profile,theme:'dark'}).theme,'dark');
 for(const bad of [{...profile,avatar:'x" onerror="alert(1)'},{...profile,accentIndex:7},{...profile,bgPreset:'invalid'},{...profile,name:{invalid:true}}]) assert.throws(()=>safety.backup({data:{fin:[]},profile:bad}));
 assert.throws(()=>safety.backup({data:{fin:[]},theme:'invalid'}));
 assert.equal('profile' in safety.backup({data:{fin:[]}}),false);
});
test('profile and theme roll back with other backup data after a storage error',()=>{
 let failed=false;
 const original={hub_fin:'old-fin',hub_profile:'old-profile',hub_theme:'light'};
 const store=storage(original,(key,value)=>key==='hub_theme'&&value==='dark'&&!failed&&(failed=true));
 assert.throws(()=>safety.batch(store,{hub_fin:'new-fin',hub_profile:'new-profile',hub_theme:'dark'}));
 assert.deepEqual(store.dump(),original);
});
