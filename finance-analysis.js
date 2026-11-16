// Deterministic analysis: no external services, model calls or inferred bank balance.
const FinanceAnalysis = (() => {
  const validMonth = value => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
  function isCard(row) { return Boolean(row.cycleMonth) || Boolean(row.invoiceMonth) || ['card','nubank-card'].includes(row.importKind); }
  function period(row) {
    if(validMonth(row.invoiceMonth)) return row.invoiceMonth;
    // Compatibility with records that explicitly stored only the cycle's starting month.
    if(validMonth(row.cycleMonth)) return nextMonth(row.cycleMonth);
    return isCard(row) ? '' : (row.date || '').slice(0,7);
  }
  function localMonth(now = new Date()) {
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  }
  function previousMonth(month) {
    if(!validMonth(month)) throw new Error('Mês inválido');
    const [year,number]=month.split('-').map(Number);
    return number === 1 ? `${String(year-1).padStart(4,'0')}-12` : `${year}-${String(number-1).padStart(2,'0')}`;
  }
  function nextMonth(month) {
    if(!validMonth(month)) throw new Error('Mês inválido');
    const [year,number]=month.split('-').map(Number);
    return number===12 ? `${year+1}-01` : `${year}-${String(number+1).padStart(2,'0')}`;
  }
  function invoiceForDate(date) {
    if(typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
    const month=date.slice(0,7);
    return validMonth(month) ? Number(date.slice(8))<=5 ? month : nextMonth(month) : '';
  }
  function invoiceInfo(month) {
    return {start:previousMonth(month)+'-06',end:month+'-05',due:month+'-13'};
  }
  function invoiceCaption(month) {
    const info=invoiceInfo(month), format=date=>date.split('-').reverse().join('/');
    return `Fatura de ${label(month)} · ${format(info.start)} a ${format(info.end)} · vence ${format(info.due)}`;
  }
  function currentMonth(records,now=new Date()) {
    return localMonth(now);
  }
  function label(month) {
    const names=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    return validMonth(month) ? `${names[Number(month.slice(5))-1]} ${month.slice(0,4)}` : '';
  }
  function summarize(records, month) {
    const categories=new Map();
    let cents=0, count=0, recordsCount=0;
    for(const row of records) {
      if(period(row) !== month) continue;
      recordsCount++;
      if(row.type !== 'saida' || !Number.isFinite(row.val) || row.val<=0) continue;
      const amount=Math.round(row.val*100);
      const category=String(row.cat || 'Sem categoria');
      cents+=amount; count++;
      categories.set(category,(categories.get(category)||0)+amount);
    }
    return {cents,count,recordsCount,categories:[...categories].map(([name,cents])=>({name,cents})).sort((a,b)=>b.cents-a.cents || a.name.localeCompare(b.name))};
  }
  function compare(records,month,completedMonths) {
    const previous=previousMonth(month);
    const current=summarize(records,month), before=summarize(records,previous);
    const ready=completedMonths.includes(month) && completedMonths.includes(previous);
    const difference=current.cents-before.cents;
    return {previous,current,before,ready,difference,percentage:ready && before.cents>0 ? difference/before.cents*100 : null};
  }
  function changedMonths(before,after) {
    const group = rows => {
      const groups=new Map();
      for(const row of rows) {
        const month=period(row);
        if(!validMonth(month)) continue;
        if(!groups.has(month)) groups.set(month,[]);
        groups.get(month).push(JSON.stringify(row));
      }
      return new Map([...groups].map(([month,rows])=>[month,JSON.stringify(rows.sort())]));
    };
    const old=group(before), next=group(after);
    return [...new Set([...old.keys(),...next.keys()])].filter(month=>old.get(month)!==next.get(month));
  }
  return {validMonth,isCard,period,localMonth,previousMonth,nextMonth,invoiceForDate,invoiceInfo,invoiceCaption,currentMonth,label,summarize,compare,changedMonths};
})();
if(typeof module !== 'undefined' && module.exports) module.exports=FinanceAnalysis;

function readFinanceAnalysisSettings() {
  try {
    const settings=DataSafety.analysisSettings(JSON.parse(localStorage.getItem('hub_fin_analysis') || '{"completedMonths":[]}'));
    return settings.periodBasis === 'invoice-due-6-5' ? settings : {periodBasis:'invoice-due-6-5',completedMonths:[]};
  } catch(error) { return {periodBasis:'invoice-due-6-5',completedMonths:[]}; }
}
function persistFinanceRecords(next,before) {
  const settings=readFinanceAnalysisSettings();
  const changed=new Set(FinanceAnalysis.changedMonths(before,next));
  const completedMonths=settings.completedMonths.filter(month=>!changed.has(month));
  if(completedMonths.length !== settings.completedMonths.length) {
    DataSafety.batch(localStorage,{hub_fin:JSON.stringify(next),hub_fin_analysis:JSON.stringify({periodBasis:'invoice-due-6-5',completedMonths})});
  } else DataSafety.write(localStorage,'hub_fin',next);
}
function setFinanceMonthComplete(checked) {
  const month=$('analysis-month').value;
  if(!FinanceAnalysis.validMonth(month) || restoreBlocked || blockedData.has('fin')) {
    toast('❌ Recupere os dados financeiros antes de confirmar o mês.');
    renderFinanceAnalysis();
    return;
  }
  const completed=new Set(readFinanceAnalysisSettings().completedMonths);
  if(checked) completed.add(month); else completed.delete(month);
  try { DataSafety.write(localStorage,'hub_fin_analysis',{periodBasis:'invoice-due-6-5',completedMonths:[...completed].sort()}); }
  catch(error) { storageError(error); renderFinanceAnalysis(); return; }
  renderFinanceAnalysis();
  toast(checked ? '✅ Período confirmado como completo.' : 'Período marcado como parcial.');
}
function renderFinanceAnalysisIfVisible() {
  const panel=$('fpanel-analise');
  if(panel && panel.style.display !== 'none') renderFinanceAnalysis();
}
function renderFinanceAnalysis() {
  const settings=readFinanceAnalysisSettings();
  const selector=$('analysis-month');
  const recorded=D.fin.map(FinanceAnalysis.period).filter(FinanceAnalysis.validMonth);
  const months=[...new Set([FinanceAnalysis.currentMonth(D.fin),...recorded,...settings.completedMonths,...(FinanceAnalysis.validMonth(selector.value)?[selector.value]:[])])].sort().reverse();
  const previousSelection=selector.value;
  selector.innerHTML=months.map(month=>`<option value="${month}">${FinanceAnalysis.label(month)}</option>`).join('');
  selector.value=months.includes(previousSelection) ? previousSelection : [...new Set(recorded)].sort().pop() || FinanceAnalysis.currentMonth(D.fin);
  const month=selector.value;
  $('analysis-cycle-description').textContent='Cartão: '+FinanceAnalysis.invoiceCaption(month)+'. Gastos fora do cartão continuam no mês do lançamento.';
  const data=FinanceAnalysis.compare(D.fin,month,settings.completedMonths);
  const complete=settings.completedMonths.includes(month);
  $('analysis-complete').checked=complete;
  $('analysis-completeness').textContent=complete ? 'Período confirmado como completo por você' : 'Período parcial — os registros podem estar incompletos';
  $('analysis-completeness').classList.toggle('is-complete',complete);
  const sum=data.current;
  const amount=sum.cents/100;
  $('analysis-spent').textContent=fp(amount);
  $('analysis-count').textContent=`${sum.count} ${sum.count===1?'gasto registrado':'gastos registrados'}`;
  const incomeBox=$('analysis-income');
  const incomeCents=Math.round(income*100);
  if(incomeHidden) {
    incomeBox.innerHTML='<p class="analysis-muted">Renda oculta. Use o olho no topo ou no menu para ver a relação com seus gastos.</p>';
  } else if(!Number.isFinite(incomeCents) || incomeCents<=0) {
    incomeBox.innerHTML='<p class="analysis-muted">Defina sua renda mensal no topo ou no menu para ver esta análise.</p>';
  } else if(!sum.recordsCount) {
    incomeBox.innerHTML='<p class="analysis-muted">Ainda não há lançamentos neste mês para relacionar à renda.</p>';
  } else {
    const percentage=sum.cents/incomeCents*100;
    const remaining=(incomeCents-sum.cents)/100;
    incomeBox.innerHTML=`<div class="analysis-income-value"><strong>${percentage.toLocaleString('pt-BR',{maximumFractionDigits:1})}%</strong><span>da renda cadastrada atualmente (${fp(income)})</span></div><progress max="100" value="${Math.min(100,percentage)}" aria-label="${percentage.toFixed(1)}% da renda comprometida pelos gastos registrados"></progress><p>${remaining>=0 ? `${fp(remaining)} da renda ainda não comprometidos pelos gastos registrados.` : `Os gastos registrados superam a renda cadastrada em ${fp(Math.abs(remaining))}.`}</p><p class="analysis-muted">Isso não é o saldo disponível da conta. Pode haver despesas fora do organizador.</p>`;
  }
  const categories=$('analysis-categories');
  const insight=$('analysis-category-insight');
  if(!sum.count) {
    insight.textContent='Sem gastos registrados neste mês.';
    categories.innerHTML='<p class="analysis-muted">Importe sua fatura ou registre um gasto para ver a distribuição.</p>';
  } else {
    const top=sum.categories[0];
    const percent=top.cents/sum.cents*100;
    insight.textContent=`${top.name} reúne ${percent.toLocaleString('pt-BR',{maximumFractionDigits:1})}% dos gastos registrados.`;
    categories.innerHTML=sum.categories.map(category=>{
      const percentage=category.cents/sum.cents*100;
      return `<div class="analysis-category"><div><span>${esc(category.name)}</span><strong>${fp(category.cents/100)} <small>(${percentage.toLocaleString('pt-BR',{maximumFractionDigits:1})}%)</small></strong></div><progress max="${sum.cents}" value="${category.cents}" aria-label="${esc(category.name)}: ${percentage.toFixed(1)}% dos gastos"></progress></div>`;
    }).join('');
  }
  const comparison=$('analysis-comparison');
  if(!data.ready) {
    comparison.innerHTML=`<p>Compare ${FinanceAnalysis.label(month)} com ${FinanceAnalysis.label(data.previous)} quando os dois meses estiverem completos.</p><p class="analysis-muted">Confirme apenas depois de registrar todos os lançamentos do período. Um mês parcial não será comparado com um mês inteiro.</p><button type="button" class="btn btn-secondary btn-sm" id="analysis-previous">Revisar ${FinanceAnalysis.label(data.previous)}</button>`;
    $('analysis-previous').addEventListener('click',()=>{
      if(![...selector.options].some(option=>option.value===data.previous)) selector.add(new Option(FinanceAnalysis.label(data.previous),data.previous));
      selector.value=data.previous;renderFinanceAnalysis();
    });
  } else {
    const difference=data.difference/100;
    let message;
    if(data.difference===0) message='O total registrado ficou igual ao mês anterior.';
    else if(data.percentage === null) message=`O mês anterior não teve gastos registrados. Neste mês há ${fp(amount)}; não há base para calcular uma variação percentual.`;
    else message=`Você registrou ${Math.abs(data.percentage).toLocaleString('pt-BR',{maximumFractionDigits:1})}% ${difference>0?'a mais':'a menos'} em gastos que no mês anterior (${fp(Math.abs(difference))} ${difference>0?'a mais':'a menos'}).`;
    comparison.innerHTML=`<p class="analysis-comparison-message">${message}</p><div class="analysis-comparison-bars">${[[data.previous,data.before],[month,sum]].map(([key,summary])=>`<div class="analysis-category"><div><span>${FinanceAnalysis.label(key)}</span><strong>${fp(summary.cents/100)}</strong></div><progress max="${Math.max(sum.cents,data.before.cents,1)}" value="${summary.cents}" aria-label="Gastos de ${FinanceAnalysis.label(key)}"></progress></div>`).join('')}</div><p class="analysis-muted">Comparação dos totais de gastos. Não avalia inflação, mudanças de renda ou despesas fora do aplicativo.</p>`;
  }
}
