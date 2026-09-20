// Health records use local calendar dates, never UTC dates.
function healthDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
let healthMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
const healthEditing = {diet:null, workout:null};
function validHealthDate(value) {
  if(typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value+'T12:00:00');
  return !isNaN(date) && healthDate(date) === value;
}
function validHealthRecord(kind, row) {
  if(!row || !validHealthDate(row.date) || typeof row.name !== 'string' || !row.name.trim()) return false;
  if(kind === 'diet') return typeof row.details === 'string' && !!row.details.trim();
  return Number.isInteger(row.sets) && row.sets > 0 && row.sets <= 100 &&
    Number.isInteger(row.reps) && row.reps > 0 && row.reps <= 10000 &&
    Number.isFinite(row.weight) && row.weight >= 0 && row.weight <= 10000;
}
function validateHealthBackup(data) {
  for(const kind of ['attendance','diet','workout']) {
    if(data[kind] === undefined) continue; // Older backups preserve existing health data.
    if(!Array.isArray(data[kind]) || !data[kind].every(row => kind === 'attendance' ? validHealthDate(row) : validHealthRecord(kind,row))) {
      throw new Error('Dados de saúde inválidos');
    }
  }
}
function healthTab(tab) {
  for(const name of ['attendance','diet','workout']) {
    $('hpanel-'+name).hidden = name !== tab;
    $('htab-'+name).classList.toggle('active', name === tab);
    $('htab-'+name).setAttribute('aria-pressed', String(name === tab));
  }
}
function selectHealthMonth() {
  const yearInput = $('health-year-select');
  if(!yearInput.reportValidity()) return;
  const year = Number(yearInput.value), month = Number($('health-month-select').value);
  if(!Number.isInteger(year) || year < 1000 || year > 9999 || !Number.isInteger(month) || month < 0 || month > 11) return;
  healthMonth = new Date(year,month,1);
  renderHealthCalendar();
}
// Commit before updating the screen; a storage failure leaves the saved state intact.
function commitHealth(kind, records) {
  try { localStorage.setItem('hub_'+kind, JSON.stringify(records)); }
  catch(error) { toast('❌ Não foi possível salvar. Verifique o armazenamento e tente novamente.'); return false; }
  D[kind] = records;
  return true;
}
function toggleHealthDay(date) {
  if(!validHealthDate(date) || date > healthDate()) return;
  const records = D.attendance.includes(date) ? D.attendance.filter(day=>day!==date) : [...D.attendance,date];
  if(commitHealth('attendance',records)) {
    renderHealthCalendar();
    document.querySelector(`[data-health-day="${date}"]`)?.focus();
  }
}
function renderHealthCalendar() {
  const year=healthMonth.getFullYear(), month=healthMonth.getMonth();
  const prefix=healthDate(healthMonth).slice(0,7), current=healthDate();
  const monthLabel=healthMonth.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  $('health-month-select').value=String(month);
  $('health-year-select').value=String(year);
  let html=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(day=>`<span class="health-weekday">${day}</span>`).join('');
  html += '<span aria-hidden="true"></span>'.repeat(healthMonth.getDay());
  const count=new Date(year,month+1,0).getDate();
  for(let day=1; day<=count; day++) {
    const date=`${prefix}-${String(day).padStart(2,'0')}`, checked=D.attendance.includes(date);
    html+=`<button type="button" class="health-day ${checked?'checked':''} ${date===current?'today':''}" data-health-day="${date}" aria-label="${day} de ${esc(monthLabel)}: ${checked?'fui à academia':'presença não marcada'}" aria-pressed="${checked}" ${date===current?'aria-current="date"':''} ${date>current?'disabled':''} onclick="toggleHealthDay('${date}')"><span>${day}</span><span aria-hidden="true">${checked?'✓':'□'}</span></button>`;
  }
  $('health-calendar').innerHTML=html;
  const total=new Set(D.attendance.filter(day=>day.startsWith(prefix+'-'))).size;
  $('health-summary').textContent=`${total} ${total===1?'dia marcado':'dias marcados'} neste mês`;
}
function resetHealthForm(kind) {
  healthEditing[kind]=null;
  $('health-'+kind+'-form').reset();
  $(kind==='diet'?'hd-date':'hw-date').value=healthDate();
  $('health-'+kind+'-heading').textContent=kind==='diet'?'Registrar refeição':'Registrar exercício';
}
function saveHealthRecord(event,kind) {
  event.preventDefault();
  const form=$('health-'+kind+'-form');
  if(!form.reportValidity()) return;
  const prefix=kind==='diet'?'hd':'hw';
  const record={date:$(prefix+'-date').value,name:$(prefix+'-name').value.trim()};
  if(kind==='diet') record.details=$('hd-details').value.trim();
  else Object.assign(record,{sets:Number($('hw-sets').value),reps:Number($('hw-reps').value),weight:Number($('hw-weight').value)});
  if(!validHealthRecord(kind,record)) { toast('Preencha os campos com valores válidos.'); return; }
  const index=healthEditing[kind], records=[...D[kind]];
  if(index===null) records.push(record); else records[index]=record;
  if(!commitHealth(kind,records)) return;
  resetHealthForm(kind); renderHealthRecords(kind); toast('✅ Registro salvo!');
}
function editHealthRecord(kind,index) {
  const record=D[kind][index]; if(!record) return;
  healthEditing[kind]=index;
  const prefix=kind==='diet'?'hd':'hw';
  for(const key of (kind==='diet'?['date','name','details']:['date','name','sets','reps','weight'])) $(prefix+'-'+key).value=record[key];
  $('health-'+kind+'-heading').textContent=kind==='diet'?'Editar refeição':'Editar exercício';
  revealMobileForm($(prefix+'-name'));
  $(prefix+'-name').focus();
}
function deleteHealthRecord(kind,index) {
  if(!confirm('Excluir este registro?')) return;
  if(!commitHealth(kind,D[kind].filter((_,i)=>i!==index))) return;
  resetHealthForm(kind); renderHealthRecords(kind); toast('Registro excluído.');
}
function renderHealthRecords(kind) {
  const list=$('health-'+kind+'-list');
  if(!D[kind].length) { list.innerHTML=`<div class="card health-empty">${kind==='diet'?'Nenhuma refeição registrada. Comece adicionando sua alimentação acima.':'Nenhum exercício registrado. Adicione seu primeiro treino acima.'}</div>`; return; }
  const rows=D[kind].map((record,index)=>({record,index})).sort((a,b)=>b.record.date.localeCompare(a.record.date));
  let lastDate='';
  list.innerHTML=rows.map(({record:r,index})=>{
    const heading=r.date!==lastDate?`<h3 class="health-date-heading">${esc(new Date(r.date+'T12:00:00').toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric'}))}</h3>`:'';
    lastDate=r.date;
    const description=kind==='diet'?esc(r.details):`${r.sets} séries × ${r.reps} repetições · ${r.weight.toLocaleString('pt-BR')} kg`;
    return `${heading}<article class="card health-record"><div><strong>${esc(r.name)}</strong><p>${description}</p></div><div class="health-record-actions"><button class="btn btn-secondary btn-sm" onclick="editHealthRecord('${kind}',${index})">Editar</button><button class="btn btn-secondary btn-sm" onclick="deleteHealthRecord('${kind}',${index})">Excluir</button></div></article>`;
  }).join('');
}
function renderHealth() { renderHealthCalendar(); renderHealthRecords('diet'); renderHealthRecords('workout'); }
resetHealthForm('diet'); resetHealthForm('workout'); renderHealth();
