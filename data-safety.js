// Validation and persistence shared by backup restore and local data loading.
const DataSafety = (() => {
  const keys = ['wish','col','mv','bk','fin','sh','ot','gl','attendance','diet','workout'];
  const journalKey = 'hub_restore_journal';
  const own = (object,key) => Object.prototype.hasOwnProperty.call(object,key);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const fail = () => { throw new Error('Dados inválidos no backup. Nenhuma alteração foi aplicada.'); };
  function text(value, fallback = '') {
    if(value === undefined || value === null) return fallback;
    if(typeof value !== 'string') fail();
    return value;
  }
  function number(value, fallback = 0) {
    if(value === undefined) return fallback;
    if(typeof value !== 'number' || !Number.isFinite(value) || value < 0) fail();
    return value;
  }
  function choice(value, options, fallback) {
    if(value === undefined) return fallback;
    if(!options.includes(value)) fail();
    return value;
  }
  function date(value) {
    if(typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail();
    const parsed = new Date(value+'T12:00:00Z');
    if(!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== value) fail();
    return value;
  }
  function image(value) {
    if(!value) return null;
    if(typeof value !== 'string' || /[\s"'<>]/.test(value)) fail();
    if(/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(value)) return value;
    try { const url = new URL(value); if(url.protocol === 'https:' && !url.username && !url.password) return url.href; } catch(error) { /* Reject unsupported image sources. */ }
    fail();
  }
  function record(kind,row) {
    if(kind === 'attendance') return date(row);
    if(!object(row)) fail();
    if(kind === 'diet' || kind === 'workout') {
      const result = {date:date(row.date),name:text(row.name)};
      if(!result.name.trim()) fail();
      if(kind === 'diet') { result.details = text(row.details); if(!result.details.trim()) fail(); }
      else {
        result.sets=number(row.sets); result.reps=number(row.reps); result.weight=number(row.weight);
        if(!Number.isInteger(result.sets) || result.sets<1 || result.sets>100 || !Number.isInteger(result.reps) || result.reps<1 || result.reps>10000 || result.weight>10000) fail();
      }
      return result;
    }
    const result = {id:number(row.id)};
    if(!own(row,'id')) fail();
    if(kind === 'fin') {
      Object.assign(result,{desc:text(row.desc),val:number(row.val),type:choice(row.type,['entrada','saida']),cat:text(row.cat),date:date(row.date)});
      if(!result.desc.trim() || !own(row,'val') || !result.type) fail();
      if(row.invoiceMonth !== undefined) {
        if(typeof row.invoiceMonth !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.invoiceMonth)) fail();
        result.invoiceMonth=row.invoiceMonth;
      }
      if(row.cycleMonth !== undefined) {
        if(typeof row.cycleMonth !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.cycleMonth)) fail();
        const [year,month]=row.cycleMonth.split('-').map(Number);
        const due=month===12 ? `${year+1}-01` : `${year}-${String(month+1).padStart(2,'0')}`;
        if(row.invoiceMonth !== undefined && row.invoiceMonth !== due) fail();
        result.cycleMonth=row.cycleMonth;
      }
      if(row.importSource !== undefined) result.importSource=text(row.importSource);
      if(row.importKind !== undefined) result.importKind=choice(row.importKind,['statement','nubank-card','card']);
      return result;
    }
    result.name=text(row.name); if(!result.name.trim()) fail();
    result.addedAt=text(row.addedAt);
    const priorities=['alta','média','baixa'];
    if(['wish','col','mv','bk'].includes(kind)) {
      result.cover=image(row.cover); result.genre=text(row.genre);
    }
    if(['wish','col','ot'].includes(kind)) { result.price=number(row.price); result.note=text(row.note); }
    if(['wish','col','mv'].includes(kind)) result.platform=text(row.platform);
    if(['wish','ot'].includes(kind)) result.priority=choice(row.priority,priorities,'média');
    if(kind === 'col') { result.played=choice(row.played,['nao','jogando','parei','zerado','platinado'],'nao');result.rating=number(row.rating);if(result.rating>5) fail(); }
    if(kind === 'mv') { result.type=choice(row.type,['filme','serie','anime','doc'],'filme');result.status=choice(row.status,['quero','assistindo','assistido'],'quero');result.score=number(row.score);if(result.score>10) fail(); }
    if(kind === 'bk') { result.author=text(row.author);result.pages=number(row.pages);result.score=number(row.score);result.status=choice(row.status,['quero','lendo','lido'],'quero');if(result.score>10) fail(); }
    if(kind === 'ot') { result.cat=text(row.cat);result.status=choice(row.status,['quero','tenho'],'quero'); }
    if(kind === 'sh') {
      Object.assign(result,{cat:text(row.cat),qty:number(row.qty,1),price:number(row.price),done:row.done === undefined ? false : row.done});
      if(!Number.isInteger(result.qty) || result.qty<1 || typeof result.done !== 'boolean') fail();
    }
    if(kind === 'gl') Object.assign(result,{cat:text(row.cat),target:number(row.target),current:number(row.current),unit:text(row.unit),deadline:row.deadline ? date(row.deadline) : '',status:choice(row.status,['ativa','pausada','concluida'],'ativa')});
    return result;
  }
  function collection(kind,value) {
    if(!keys.includes(kind) || !Array.isArray(value)) fail();
    const rows=value.map(row=>record(kind,row));
    return rows;
  }
  function analysisSettings(value) {
    if(!object(value) || !Array.isArray(value.completedMonths) || value.completedMonths.some(month=>typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))) fail();
    if(value.periodBasis !== undefined && !['invoice','cycle-6-5'].includes(value.periodBasis)) fail();
    return {...(value.periodBasis ? {periodBasis:value.periodBasis} : {}),completedMonths:[...new Set(value.completedMonths)].sort()};
  }
  function profile(value) {
    if(!object(value)) fail();
    const name=text(value.name,'Meu Perfil').trim() || 'Meu Perfil';
    if(name.length>30) fail();
    const accentIndex=number(value.accentIndex);
    if(!Number.isInteger(accentIndex) || accentIndex>6) fail();
    return {
      name, avatar:image(value.avatar), accentIndex,
      bgPreset:choice(value.bgPreset,['default-light','white','cream','default-dark','deep-dark','navy-dark'],'default-light')
    };
  }
  function backup(value) {
    if(!object(value) || !object(value.data) || (value.version !== undefined && value.version !== 1)) fail();
    const data={};
    for(const key of keys) if(own(value.data,key)) data[key]=collection(key,value.data[key]);
    if(!Object.keys(data).length) fail();
    const result={data};
    if(own(value,'income')) result.income=number(value.income);
    if(own(value,'profile')) result.profile=profile(value.profile);
    if(own(value,'theme')) result.theme=choice(value.theme,['light','dark']);
    if(own(value,'analysis')) {
      if(!own(data,'fin')) fail();
      result.analysis=analysisSettings(value.analysis);
    }
    return result;
  }
  // Persist one key before exposing it to the rest of the application.
  function write(storage,key,value) { storage.setItem(key,JSON.stringify(value)); }
  // A journal allows an interrupted restore to recover its previous state on startup.
  function recover(storage) {
    const raw=storage.getItem(journalKey);
    if(raw === null) return;
    const before=JSON.parse(raw);
    if(!object(before) || Object.entries(before).some(([key,value])=>!['hub_income','hub_fin_analysis','hub_profile','hub_theme',...keys.map(k=>'hub_'+k)].includes(key) || (value !== null && typeof value !== 'string'))) fail();
    for(const key of Object.keys(before)) storage.removeItem(key);
    for(const [key,value] of Object.entries(before)) if(value !== null) storage.setItem(key,value);
    storage.removeItem(journalKey);
  }
  function batch(storage,entries) {
    recover(storage);
    const before={};
    for(const key of Object.keys(entries)) {
      if(!['hub_income','hub_fin_analysis','hub_profile','hub_theme',...keys.map(k=>'hub_'+k)].includes(key)) fail();
      before[key]=storage.getItem(key);
    }
    storage.setItem(journalKey,JSON.stringify(before));
    try {
      for(const [key,value] of Object.entries(entries)) storage.setItem(key,value);
      storage.removeItem(journalKey);
    } catch(error) {
      try { recover(storage); } catch(recoveryError) { throw new Error('Não foi possível concluir a recuperação. Os dados anteriores foram preservados em uma cópia local. Reabra o aplicativo antes de continuar.'); }
      throw error;
    }
  }
  return {keys,journalKey,own,collection,analysisSettings,profile,backup,image,write,batch,recover};
})();
if(typeof module !== 'undefined' && module.exports) module.exports=DataSafety;
