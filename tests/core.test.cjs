const {test}=require('node:test'),assert=require('node:assert/strict'),L=require('../core.js');
// Deliberately synthetic amounts; never place personal ledger data in tests.
function fixture(){const c=L.defaults();delete c.budgets;c.income=1000;c.savingTarget=100;c.fixed.push({id:'legacy',name:'舊項目',category:'其他',budget:null,actual:null,done:false,date:null});c.fixed.forEach((x,i)=>{x.budget=[100,20,10][i];});return c;}
test('5日至次月4日：跨年、閏年、4日與5日切換',()=>{
 assert.equal(L.cycleKey(new Date(2026,0,4)),'2025-12');assert.equal(L.cycleKey(new Date(2026,0,5)),'2026-01');
 assert.equal(L.dates('2024-02').length,29);assert.equal(L.dates('2025-02').length,28);
 assert.equal(L.dates('2026-12').at(-1),'2027-01-04');assert.equal(L.dates('2026-11')[0],'2026-11-05');
});
test('實際支出與存款不捏造；預算與收入正確加總',()=>{const c=fixture(),s=L.stats({...c,key:'2026-11'});assert.equal(s.budget,130);assert.equal(s.spent,0);assert.equal(s.projected,870);assert.equal(s.available,1000);assert.ok(s.unknown>0);assert.equal(L.initial().savings,null);assert.ok(L.defaults().fixed.every(x=>x.actual===null));});
test('固定付款只算一次；多筆分類明細、超支與完成後剩餘預算釋放',()=>{
 const c=fixture();Object.assign(c.fixed[0],{actual:100,done:true,date:'2026-11-06'});
 const d=L.day(c,'2026-11-06');d.meals[0]={budget:100,actual:80,done:true};d.meals[1]={budget:100,actual:150,done:false};d.other=[{category:'飲料',note:'茶',budget:50,actual:30,done:true},{category:'醫療',note:'回診',budget:500,actual:null,done:false}];
 const s=L.stats({...c,key:'2026-11'});assert.equal(s.spent,360);assert.equal(s.forecast,890);assert.equal(s.projected,110);
 c.fixed[0].date='2026-11-07';assert.equal(L.stats({...c,key:'2026-11'}).spent,360);
});
test('備份可完整往返；拒絕不合法日期、分類、金額與完成狀態',()=>{
 const s=L.initial();s.cycles['2026-11']=L.defaults();L.day(s.cycles['2026-11'],'2026-11-06').other.push({category:'其他',note:'<script>test</script>',budget:0.29,actual:0,done:true});assert.deepEqual(L.validate(JSON.parse(JSON.stringify(s))),s);
 for(const n of [-1,Infinity,NaN,1.234,'100',1000000001])assert.equal(L.validMoney(n),false);
 const bad=L.clone(s);bad.cycles['2026-11'].days['2026-11-01']={meals:[L.item(),L.item(),L.item()],other:[]};assert.throws(()=>L.validate(bad));
 const bad2=L.clone(s);bad2.cycles['2026-11'].fixed[0].done=true;assert.throws(()=>L.validate(bad2));
 const bad3=L.clone(s);bad3.cycles['2026-11'].days['2026-11-06'].other[0].category='不存在';assert.throws(()=>L.validate(bad3));
});
test('週期設定隔離、零元完成及負餘額',()=>{const a=fixture(),b=fixture();a.income=1;a.fixed[0].actual=100;L.day(a,'2026-11-06').meals[0]={budget:100,actual:0,done:true};assert.equal(b.income,1000);assert.equal(L.stats({...a,key:'2026-11'}).available,-99);});
