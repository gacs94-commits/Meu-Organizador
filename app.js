// ═══════ DATA ═══════
const D = {
  wish: JSON.parse(localStorage.getItem('hub_wish')||'[]'),
  col:  JSON.parse(localStorage.getItem('hub_col')||'[]'),
  mv:   JSON.parse(localStorage.getItem('hub_mv')||'[]'),
  bk:   JSON.parse(localStorage.getItem('hub_bk')||'[]'),
  fin:  JSON.parse(localStorage.getItem('hub_fin')||'[]'),
  sh:   JSON.parse(localStorage.getItem('hub_sh')||'[]'),
  ot:   JSON.parse(localStorage.getItem('hub_ot')||'[]'),
  gl:   JSON.parse(localStorage.getItem('hub_gl')||'[]'),
};
const save = k => {
  try {
    localStorage.setItem('hub_'+k, JSON.stringify(D[k]));
  } catch(e) {
    if(e.name === 'QuotaExceededError' || e.code === 22) {
      toast('⚠️ Armazenamento cheio! Exporte um backup e remova itens com capa para liberar espaço.');
    } else {
      toast('❌ Erro ao salvar. Tente novamente.');
    }
  }
};

// ═══════ STATE ═══════
const F = { w:'all',c:'all',mv:'all',bk:'all',fin:'all',sh:'all',ot:'all',gl:'all' };
const V = { w:'list',c:'list',mv:'list',bk:'list' };
let finType = 'entrada';
const covers = {};
let editCtx = null;

// ═══════ THEME ═══════
let dark = localStorage.getItem('hub_theme')==='dark';
function applyTheme() {
  document.documentElement.setAttribute('data-theme', dark?'dark':'light');
  document.getElementById('theme-label').textContent = dark?'Tema escuro':'Tema claro';
  localStorage.setItem('hub_theme', dark?'dark':'light');
}
function toggleTheme() { dark=!dark; applyTheme(); }
applyTheme();

// ═══════ NAV ═══════
const secs = ['games','movies','books','finance','shopping','others','goals','invest'];
function goTo(s) {
  secs.forEach(id => {
    document.getElementById('sec-'+id).classList.toggle('active', id===s);
  });
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.getAttribute('onclick')===`goTo('${s}')`));
  if(window.innerWidth<=700) closeSidebar();
}

// ═══════ GAMES SUB TABS ═══════
function gamesTab(t) {
  document.getElementById('gpanel-wish').style.display = t==='wish'?'block':'none';
  document.getElementById('gpanel-col').style.display  = t==='col'?'block':'none';
  document.getElementById('gtab-wish').classList.toggle('active', t==='wish');
  document.getElementById('gtab-col').classList.toggle('active', t==='col');
}

// ═══════ FILTERS / VIEWS ═══════
function setF(k, val, btn) {
  F[k] = val;
  btn.closest('.filters').querySelectorAll('.fbtn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renders[k]();
}
function setView(k, v) {
  V[k] = v;
  document.getElementById(`${k}v-list`).classList.toggle('active', v==='list');
  document.getElementById(`${k}v-grid`).classList.toggle('active', v==='grid');
  renders[k]();
}

// ═══════ HELPERS ═══════
const $ = id => document.getElementById(id);
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fp = v => 'R$ '+Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const uid = () => Date.now() + Math.random();
const today = () => new Date().toLocaleDateString('pt-BR');

function toast(msg) {
  const t=$('toast'); t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2200);
}
function closeLb() { $('lightbox').classList.remove('open'); }
function openLb(src) { $('lb-img').src=src; $('lightbox').classList.add('open'); }
function closeModal() { $('modal-edit').classList.remove('open'); editCtx=null; }

function platEmoji(p) {
  if(!p) return '🎮';
  if(p==='PC') return '🖥️';
  if(p.startsWith('PS')) return '🎮';
  if(p.startsWith('Xbox')) return '🟢';
  if(p.startsWith('Nintendo')) return '🔴';
  if(p==='Mobile') return '📱';
  return '🎮';
}

// ═══════ COVERS ═══════
function handleCover(pfx, inp) {
  const f = inp.files[0];
  if(!f) return;

  // Check type
  if(!f.type.startsWith('image/')) {
    showCoverError(pfx, `❌ "${f.name}" não é uma imagem. Use JPG, PNG, WEBP ou GIF.`);
    inp.value = ''; return;
  }
  if(f.size < 1024) {
    showCoverError(pfx, `❌ Arquivo muito pequeno. Provavelmente não é uma imagem válida.`);
    inp.value = ''; return;
  }
  // Warn if very large before even reading
  if(f.size > 8*1024*1024) {
    showCoverError(pfx, `❌ Imagem muito grande (${(f.size/1024/1024).toFixed(1)}MB). Limite máximo é 8MB.`);
    inp.value = ''; return;
  }

  clearCoverError(pfx);

  const r = new FileReader();
  r.onerror = () => { showCoverError(pfx, '❌ Erro ao ler o arquivo. Tente novamente.'); inp.value=''; };
  r.onload = e => {
    const original = new Image();
    original.onerror = () => { showCoverError(pfx, `❌ Não foi possível carregar a imagem. O arquivo pode estar corrompido.`); inp.value=''; };
    original.onload = () => {
      // Compress: max 300×400px, quality 0.82
      const MAX_W = 300, MAX_H = 400;
      let w = original.width, h = original.height;
      if(w > MAX_W || h > MAX_H) {
        const ratio = Math.min(MAX_W/w, MAX_H/h);
        w = Math.round(w*ratio);
        h = Math.round(h*ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(original, 0, 0, w, h);

      // Try quality 0.82 first, then reduce if still too big
      let quality = 0.82;
      let compressed = canvas.toDataURL('image/jpeg', quality);

      // If still over ~400KB in base64, reduce quality further
      if(compressed.length > 550000) {
        quality = 0.65;
        compressed = canvas.toDataURL('image/jpeg', quality);
      }
      if(compressed.length > 550000) {
        quality = 0.5;
        compressed = canvas.toDataURL('image/jpeg', quality);
      }

      const kb = Math.round(compressed.length * 0.75 / 1024);
      covers[pfx] = compressed;
      showCover(pfx, compressed);

      // Show size info to user
      clearCoverError(pfx);
      showCoverInfo(pfx, `✅ Capa salva (${w}×${h}px · ~${kb}KB)`);
    };
    original.src = e.target.result;
  };
  r.readAsDataURL(f);
}

function showCoverInfo(pfx, msg) {
  const box = $(pfx+'-cover-box');
  if(!box) return;
  let el = document.getElementById(pfx+'-cover-info');
  if(!el) {
    el = document.createElement('div');
    el.id = pfx+'-cover-info';
    el.style.cssText = 'font-size:10px;color:var(--green);margin-top:4px;line-height:1.4';
    box.parentNode.insertBefore(el, box.nextSibling);
  }
  el.textContent = msg;
  setTimeout(() => { if(el) el.remove(); }, 3000);
}

function showCoverError(pfx, msg) {
  // Find the nearest container to show the error below the cover box
  const box = $(pfx+'-cover-box');
  if(!box) { toast(msg); return; }
  let errEl = document.getElementById(pfx+'-cover-err');
  if(!errEl) {
    errEl = document.createElement('div');
    errEl.id = pfx+'-cover-err';
    errEl.style.cssText = 'font-size:11px;color:var(--red);margin-top:5px;line-height:1.4;max-width:200px';
    box.parentNode.insertBefore(errEl, box.nextSibling);
  }
  errEl.textContent = msg;
}

function clearCoverError(pfx) {
  const errEl = document.getElementById(pfx+'-cover-err');
  if(errEl) errEl.remove();
}
function showCover(pfx, src) {
  const box=$(pfx+'-cover-box'); if(!box) return;
  let img=box.querySelector('img');
  if(!img){img=document.createElement('img');box.appendChild(img);}
  img.src=src;
  const sv=box.querySelector('svg'); if(sv) sv.style.display='none';
  const sp=box.querySelector('span'); if(sp) sp.style.display='none';
}
function rmCover(pfx, e) {
  e.stopPropagation(); covers[pfx]=null;
  clearCoverError(pfx);
  const box=$(pfx+'-cover-box'); if(!box) return;
  const img=box.querySelector('img'); if(img) img.remove();
  const sv=box.querySelector('svg'); if(sv) sv.style.display='';
  const sp=box.querySelector('span'); if(sp) sp.style.display='';
  const fi=box.querySelector('input[type=file]'); if(fi) fi.value='';
}
function clearCover(pfx) {
  covers[pfx]=null;
  const box=$(pfx+'-cover-box'); if(!box) return;
  const img=box.querySelector('img'); if(img) img.remove();
  ['svg','span'].forEach(tag=>{const el=box.querySelector(tag);if(el)el.style.display='';});
  const fi=box.querySelector('input[type=file]'); if(fi) fi.value='';
}

// ═══════ RENDER HELPERS ═══════
function thumbHTML(cover, emoji) {
  if(cover) return `<div class="item-thumb"><img src="${cover}" onclick="openLb(this.src)" style="cursor:zoom-in"/></div>`;
  return `<div class="item-thumb">${emoji}</div>`;
}
function gridCoverHTML(cover, emoji, badge, sub) {
  const inner = cover ? `<img src="${cover}" onclick="openLb(this.src)" style="cursor:zoom-in"/>` : emoji;
  return `<div class="grid-cover">${inner}${sub?`<span class="g-platform">${esc(sub)}</span>`:''}</div>`;
}
function emptyHTML(msg) {
  return `<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><p>${msg}</p></div>`;
}
function iconBtn(cls, title, icon, onclick) {
  return `<button class="icon-btn ${cls}" title="${title}" onclick="${onclick}">${icon}</button>`;
}
const EDIT_ICO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const DEL_ICO  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>`;
const MOVE_ICO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`;

// ═══════ WISHLIST ═══════
function addWish() {
  const name=$('w-name').value.trim(); if(!name){$('w-name').focus();toast('⚠️ Informe o nome');return;}
  D.wish.push({id:uid(),name,platform:$('w-plat').value,priority:$('w-prio').value,
    price:parseFloat($('w-price').value)||0,genre:$('w-genre').value.trim(),
    note:$('w-note').value.trim(),cover:covers['w']||null,addedAt:today()});
  ['w-name','w-price','w-genre','w-note'].forEach(id=>$(id).value='');
  $('w-plat').value=''; $('w-prio').value='média'; clearCover('w');
  save('wish'); renderWish(); toast('✅ Jogo adicionado à wishlist!');
}
function delWish(id) {
  if(!confirm('Remover?')) return;
  D.wish=D.wish.filter(g=>g.id!==id); save('wish'); renderWish(); toast('🗑️ Removido');
}
function moveToCol(id) {
  const g=D.wish.find(g=>g.id===id); if(!g) return;
  if(!confirm(`Mover "${g.name}" para a coleção?`)) return;
  D.col.push({id:uid(),name:g.name,platform:g.platform,genre:g.genre,price:g.price,
    note:g.note,cover:g.cover,played:'nao',addedAt:today()});
  D.wish=D.wish.filter(x=>x.id!==id);
  save('wish'); save('col'); renderWish(); renderCol(); toast('🎮 Movido para a coleção!');
}
function renderWish() {
  const s=$('w-search').value.toLowerCase();
  let list = F.w==='all'?[...D.wish]:D.wish.filter(g=>g.priority===F.w);
  if(s) list=list.filter(g=>g.name.toLowerCase().includes(s)||(g.genre||'').toLowerCase().includes(s));
  const st=$('w-stats');
  if(D.wish.length){
    st.style.display='grid';
    $('w-s1').textContent=D.wish.length;
    $('w-s2').textContent=fp(D.wish.reduce((a,g)=>a+g.price,0));
    $('w-s3').textContent=D.wish.filter(g=>g.priority==='alta').length;
    $('w-s4').textContent=D.wish.filter(g=>g.priority==='baixa').length;
  } else st.style.display='none';
  $('w-title').textContent=`Wishlist (${D.wish.length})`;
  const wTotal = D.wish.reduce((a,g)=>a+g.price,0);
  $('w-insight').innerHTML = (income && wTotal>0)
    ? incomeInsight(`Wishlist custa <strong>${fp(wTotal)}</strong> — equivale a <strong>${monthsOfIncome(wTotal)} meses</strong> de renda (${pctOfIncome(wTotal)}% total)`)
    : '';
  renderGamesList('w-list', list, 'wish', V.w);
}

function renderCol() {
  const s=$('c-search').value.toLowerCase();
  let list = F.c==='all'?[...D.col]:D.col.filter(g=>g.played===F.c);
  if(s) list=list.filter(g=>g.name.toLowerCase().includes(s)||(g.genre||'').toLowerCase().includes(s));
  const st=$('c-stats');
  if(D.col.length){
    st.style.display='grid';
    $('c-s1').textContent=D.col.length;
    $('c-s2').textContent=D.col.filter(g=>g.played==='zerado'||g.played==='platinado').length;
    $('c-s3').textContent=D.col.filter(g=>g.played==='parei').length;
    const rated=D.col.filter(g=>g.rating>0);
    $('c-s4').textContent=rated.length?'★ '+(rated.reduce((a,g)=>a+g.rating,0)/rated.length).toFixed(1):'—';
  } else st.style.display='none';
  $('c-title').textContent=`Coleção (${D.col.length})`;
  renderGamesList('c-list', list, 'col', V.c);
}

function addCol() {
  const name=$('c-name').value.trim(); if(!name){$('c-name').focus();toast('⚠️ Informe o nome');return;}
  D.col.push({id:uid(),name,platform:$('c-plat').value,genre:$('c-genre').value.trim(),
    price:parseFloat($('c-price').value)||0,played:$('c-status').value,
    note:$('c-note').value.trim(),cover:covers['c']||null,
    rating:parseInt($('c-stars').dataset.val)||0,addedAt:today()});
  ['c-name','c-price','c-genre','c-note'].forEach(id=>$(id).value='');
  $('c-plat').value=''; $('c-status').value='nao'; clearCover('c');
  setFormStar('c',0);
  save('col'); renderCol(); toast('✅ Adicionado à coleção!');
}
function delCol(id) {
  if(!confirm('Remover?')) return;
  D.col=D.col.filter(g=>g.id!==id); save('col'); renderCol(); toast('🗑️ Removido');
}
function cycleStatus(id) {
  const g=D.col.find(g=>g.id===id); if(!g) return;
  const cy=['nao','jogando','parei','zerado','platinado'];
  g.played=cy[(cy.indexOf(g.played)+1)%cy.length];
  save('col'); renderCol();
}

const statusLbl = s=>({nao:'⏳ Não joguei',jogando:'🎮 Jogando',parei:'🛑 Joguei e parei',zerado:'🏆 Zerado',platinado:'💎 Platinado'}[s]||s);
const statusCls = s=>(s==='zerado'||s==='platinado')?'badge-green':s==='parei'?'badge-red':s==='jogando'?'badge-purple':'badge-amber';
const prioCls   = p=>({alta:'badge-red',média:'badge-amber',baixa:'badge-purple'}[p]||'badge-gray');

function renderGamesList(elId, list, type, view) {
  const el=$(elId);
  if(!list.length){el.innerHTML=emptyHTML('Nada aqui ainda. Adicione o primeiro!');return;}
  const isWish = type==='wish';

  const actions = g => isWish
    ? `${iconBtn('edit-btn','Mover p/ coleção',MOVE_ICO,`moveToCol(${g.id})`)}${iconBtn('edit-btn','Editar',EDIT_ICO,`openEdit('wish',${g.id})`)}${iconBtn('','Remover',DEL_ICO,`delWish(${g.id})`)}`
    : `<span class="badge ${statusCls(g.played)} clickable" onclick="cycleStatus(${g.id})" title="Clique para mudar">${statusLbl(g.played)}</span>${iconBtn('edit-btn','Editar',EDIT_ICO,`openEdit('col',${g.id})`)}${iconBtn('','Remover',DEL_ICO,`delCol(${g.id})`)}`;

  if(view==='grid') {
    const badge = isWish
      ? {cls:prioCls(null),txt:'?'} // overridden per item
      : null;
    el.innerHTML=`<div class="items-grid">${list.map(g=>`
      <div class="grid-card">
        ${gridCoverHTML(g.cover,platEmoji(g.platform),null,g.platform)}
        ${isWish?`<div class="grid-status"><span class="badge ${prioCls(g.priority)}">${g.priority}</span></div>`:''}
        <div class="grid-body">
          <div class="grid-name">${esc(g.name)}</div>
          <div class="grid-meta">${esc(g.genre||'')}</div>
          ${!isWish&&g.price>0?`<div class="grid-price" style="color:var(--text2);font-size:12px">${fp(g.price)}</div>`:''}
          ${isWish&&g.price>0?`<div class="grid-price">${fp(g.price)}</div>`:''}
          ${!isWish&&g.rating?`<div style="margin-top:4px">${starDisplayHTML(g.rating)}</div>`:''}
        </div>
        <div class="grid-actions">${actions(g)}</div>
      </div>`).join('')}</div>`;
  } else {
    let html=`<div class="items-list">${list.map(g=>`
      <div class="item-card">
        ${thumbHTML(g.cover,platEmoji(g.platform))}
        <div class="item-inner">
          <div class="item-body">
            <div class="item-name">${esc(g.name)}</div>
            <div class="item-meta">${[g.genre,g.platform,g.addedAt?'Adicionado '+g.addedAt:''].filter(Boolean).join(' · ')}</div>
            ${g.note?`<div class="item-note">${esc(g.note)}</div>`:''}
            ${!isWish&&g.rating?starDisplayHTML(g.rating):''}
          </div>
          <div class="item-actions">
            ${g.price>0?`<span style="font-size:13px;font-weight:700;color:var(--accent);white-space:nowrap">${fp(g.price)}</span>`:''}
            ${isWish?`<span class="badge ${prioCls(g.priority)}">${g.priority}</span>`:''}
            ${actions(g)}
          </div>
        </div>
      </div>`).join('')}</div>`;
    if(isWish && list.length>1){const t=list.reduce((a,g)=>a+g.price,0);if(t>0)html+=`<div class="total-row">Total estimado: <strong>${fp(t)}</strong></div>`;}
    el.innerHTML=html;
  }
}

// ═══════ MOVIES ═══════
const mvTypeLbl = t=>({filme:'🎬 Filme',serie:'📺 Série',anime:'⛩️ Anime',doc:'🎥 Doc.'}[t]||t);
const mvStatusLbl = s=>({quero:'👀 Quero ver',assistindo:'▶️ Assistindo',assistido:'✅ Assistido'}[s]||s);
const mvStatusCls = s=>s==='assistido'?'badge-green':s==='assistindo'?'badge-amber':'badge-purple';

function addMovie() {
  const name=$('mv-name').value.trim(); if(!name){$('mv-name').focus();toast('⚠️ Informe o título');return;}
  D.mv.push({id:uid(),name,type:$('mv-type').value,status:$('mv-status').value,
    genre:$('mv-genre').value.trim(),platform:$('mv-plat').value.trim(),
    score:parseInt($('mv-score').value)||0,cover:covers['mv']||null,addedAt:today()});
  ['mv-name','mv-genre','mv-plat','mv-score'].forEach(id=>$(id).value='');
  $('mv-type').value='filme'; $('mv-status').value='quero'; clearCover('mv');
  save('mv'); renderMovies(); toast('✅ Título adicionado!');
}
function delMovie(id) {
  if(!confirm('Remover?')) return;
  D.mv=D.mv.filter(m=>m.id!==id); save('mv'); renderMovies(); toast('🗑️ Removido');
}
function renderMovies() {
  const s=$('mv-search').value.toLowerCase();
  let list = F.mv==='all'?[...D.mv]:D.mv.filter(m=>m.status===F.mv);
  if(s) list=list.filter(m=>m.name.toLowerCase().includes(s)||(m.genre||'').toLowerCase().includes(s));
  const st=$('mv-stats');
  if(D.mv.length){
    st.style.display='grid';
    $('mv-s1').textContent=D.mv.length;
    $('mv-s2').textContent=D.mv.filter(m=>m.status==='assistido').length;
    $('mv-s3').textContent=D.mv.filter(m=>m.status==='quero').length;
    const scored=D.mv.filter(m=>m.score>0);
    $('mv-s4').textContent=scored.length?(scored.reduce((a,m)=>a+m.score,0)/scored.length).toFixed(1)+'⭐':'—';
  } else st.style.display='none';
  $('mv-title').textContent=`Filmes & Séries (${D.mv.length})`;
  const el=$('mv-list');
  if(!list.length){el.innerHTML=emptyHTML('Nenhum título adicionado ainda.');return;}
  if(V.mv==='grid') {
    el.innerHTML=`<div class="items-grid">${list.map(m=>`
      <div class="grid-card">
        ${gridCoverHTML(m.cover,m.type==='serie'?'📺':m.type==='anime'?'⛩️':m.type==='doc'?'🎥':'🎬',null,m.platform||m.type)}
        <div class="grid-status"><span class="badge ${mvStatusCls(m.status)}">${mvStatusLbl(m.status)}</span></div>
        <div class="grid-body">
          <div class="grid-name">${esc(m.name)}</div>
          <div class="grid-meta">${esc(m.genre||'')}${m.score?` · ⭐${m.score}`:''}</div>
        </div>
        <div class="grid-actions">${iconBtn('edit-btn','Editar',EDIT_ICO,`openEdit('mv',${m.id})`)}${iconBtn('','Remover',DEL_ICO,`delMovie(${m.id})`)}</div>
      </div>`).join('')}</div>`;
  } else {
    el.innerHTML=`<div class="items-list">${list.map(m=>`
      <div class="item-card">
        ${thumbHTML(m.cover, m.type==='serie'?'📺':m.type==='anime'?'⛩️':'🎬')}
        <div class="item-inner">
          <div class="item-body">
            <div class="item-name">${esc(m.name)}</div>
            <div class="item-meta">${[mvTypeLbl(m.type),m.genre,m.platform,m.score?'⭐'+m.score:''].filter(Boolean).join(' · ')}</div>
          </div>
          <div class="item-actions">
            <span class="badge ${mvStatusCls(m.status)}">${mvStatusLbl(m.status)}</span>
            ${iconBtn('edit-btn','Editar',EDIT_ICO,`openEdit('mv',${m.id})`)}${iconBtn('','Remover',DEL_ICO,`delMovie(${m.id})`)}
          </div>
        </div>
      </div>`).join('')}</div>`;
  }
}

// ═══════ BOOKS ═══════
const bkStatusLbl = s=>({quero:'📖 Quero ler',lendo:'🔖 Lendo',lido:'✅ Lido'}[s]||s);
const bkStatusCls = s=>s==='lido'?'badge-green':s==='lendo'?'badge-amber':'badge-purple';

function addBook() {
  const name=$('bk-name').value.trim(); if(!name){$('bk-name').focus();toast('⚠️ Informe o título');return;}
  D.bk.push({id:uid(),name,author:$('bk-author').value.trim(),status:$('bk-status').value,
    genre:$('bk-genre').value.trim(),pages:parseInt($('bk-pages').value)||0,
    score:parseInt($('bk-score').value)||0,cover:covers['bk']||null,addedAt:today()});
  ['bk-name','bk-author','bk-genre','bk-pages','bk-score'].forEach(id=>$(id).value='');
  $('bk-status').value='quero'; clearCover('bk');
  save('bk'); renderBooks(); toast('✅ Livro adicionado!');
}
function delBook(id) {
  if(!confirm('Remover?')) return;
  D.bk=D.bk.filter(b=>b.id!==id); save('bk'); renderBooks(); toast('🗑️ Removido');
}
function renderBooks() {
  const s=$('bk-search').value.toLowerCase();
  let list = F.bk==='all'?[...D.bk]:D.bk.filter(b=>b.status===F.bk);
  if(s) list=list.filter(b=>b.name.toLowerCase().includes(s)||(b.author||'').toLowerCase().includes(s));
  const st=$('bk-stats');
  if(D.bk.length){
    st.style.display='grid';
    $('bk-s1').textContent=D.bk.length;
    $('bk-s2').textContent=D.bk.filter(b=>b.status==='lido').length;
    $('bk-s3').textContent=D.bk.filter(b=>b.status==='quero').length;
    const scored=D.bk.filter(b=>b.score>0);
    $('bk-s4').textContent=scored.length?(scored.reduce((a,b)=>a+b.score,0)/scored.length).toFixed(1)+'⭐':'—';
  } else st.style.display='none';
  $('bk-title').textContent=`Livros (${D.bk.length})`;
  const el=$('bk-list');
  if(!list.length){el.innerHTML=emptyHTML('Nenhum livro adicionado ainda.');return;}
  if(V.bk==='grid') {
    el.innerHTML=`<div class="items-grid">${list.map(b=>`
      <div class="grid-card">
        ${gridCoverHTML(b.cover,'📚',null,b.author||'')}
        <div class="grid-status"><span class="badge ${bkStatusCls(b.status)}">${bkStatusLbl(b.status)}</span></div>
        <div class="grid-body">
          <div class="grid-name">${esc(b.name)}</div>
          <div class="grid-meta">${esc(b.author||'')}${b.score?` · ⭐${b.score}`:''}</div>
        </div>
        <div class="grid-actions">${iconBtn('edit-btn','Editar',EDIT_ICO,`openEdit('bk',${b.id})`)}${iconBtn('','Remover',DEL_ICO,`delBook(${b.id})`)}</div>
      </div>`).join('')}</div>`;
  } else {
    el.innerHTML=`<div class="items-list">${list.map(b=>`
      <div class="item-card">
        ${thumbHTML(b.cover,'📚')}
        <div class="item-inner">
          <div class="item-body">
            <div class="item-name">${esc(b.name)}</div>
            <div class="item-meta">${[b.author,b.genre,b.pages?b.pages+' pgs':'',b.score?'⭐'+b.score:''].filter(Boolean).join(' · ')}</div>
          </div>
          <div class="item-actions">
            <span class="badge ${bkStatusCls(b.status)}">${bkStatusLbl(b.status)}</span>
            ${iconBtn('edit-btn','Editar',EDIT_ICO,`openEdit('bk',${b.id})`)}${iconBtn('','Remover',DEL_ICO,`delBook(${b.id})`)}
          </div>
        </div>
      </div>`).join('')}</div>`;
  }
}

// ═══════ FINANCE TAB ═══════
function finTab(t) {
  $('fpanel-extrato').style.display   = t==='extrato'   ? 'block' : 'none';
  $('fpanel-historico').style.display = t==='historico' ? 'block' : 'none';
  $('ftab-extrato').classList.toggle('active',   t==='extrato');
  $('ftab-historico').classList.toggle('active', t==='historico');
  if(t==='historico') renderFinHistory();
}

function renderFinHistory() {
  const el = $('fin-history');
  if(!D.fin.length) { el.innerHTML = emptyHTML('Nenhuma transação registrada ainda.<br>Adicione no Extrato para ver o histórico.'); return; }

  const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  // Group transactions by YYYY-MM
  const groups = {};
  D.fin.forEach(f => {
    const key = (f.date||'0000-00').slice(0,7);
    if(!groups[key]) groups[key] = [];
    groups[key].push(f);
  });

  // Sort months descending
  const sorted = Object.keys(groups).sort((a,b)=>b.localeCompare(a));

  // Accumulate running balance for each month (oldest to newest)
  const monthBalances = {};
  let running = 0;
  sorted.slice().reverse().forEach(key => {
    groups[key].forEach(f => { running += f.type==='entrada' ? f.val : -f.val; });
    monthBalances[key] = running;
  });

  const chevronSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`;

  el.innerHTML = sorted.map((key, idx) => {
    const txs = groups[key].slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    const entradas = txs.filter(f=>f.type==='entrada').reduce((a,f)=>a+f.val,0);
    const saidas   = txs.filter(f=>f.type==='saida').reduce((a,f)=>a+f.val,0);
    const saldo    = entradas - saidas;
    const [y,m]    = key.split('-');
    const monthName = `${MONTHS_PT[parseInt(m)-1]} ${y}`;
    const isCurrentMonth = key === new Date().toISOString().slice(0,7);
    const openClass = idx === 0 ? 'open' : '';

    // Spending bar: what % of entradas was spent
    const spendPct = entradas > 0 ? Math.min(100, Math.round((saidas/entradas)*100)) : 0;
    const barColor = spendPct > 90 ? 'var(--red)' : spendPct > 70 ? 'var(--amber)' : 'var(--green)';

    // Income comparison
    let incomeNote = '';
    if(income) {
      const pct = Math.round((saidas/income)*100);
      incomeNote = `<span style="font-size:11px;color:var(--text3);margin-left:6px">${pct}% da renda</span>`;
    }

    return `<div class="month-card ${openClass}" id="mc-${key}">
      <div class="month-header" onclick="toggleMonth('${key}')">
        <div>
          <div class="month-name">${isCurrentMonth?'📍 ':''} ${monthName}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">${txs.length} transaç${txs.length===1?'ão':'ões'}</div>
        </div>
        <div class="month-stats">
          <div class="month-stat">
            <div class="month-stat-lbl">Entradas</div>
            <div class="month-stat-val c-green">+${fp(entradas)}</div>
          </div>
          <div class="month-stat">
            <div class="month-stat-lbl">Saídas</div>
            <div class="month-stat-val c-red">−${fp(saidas)}</div>
          </div>
          <div class="month-stat">
            <div class="month-stat-lbl">Saldo</div>
            <div class="month-stat-val" style="color:${saldo>=0?'var(--green)':'var(--red)'}">${saldo>=0?'+':''}${fp(saldo)}</div>
          </div>
        </div>
        <div class="month-chevron">${chevronSVG}</div>
      </div>
      <div class="month-body">
        <div class="month-bar">
          <div class="month-bar-item"><div class="lbl">Entradas</div><div class="val c-green">${fp(entradas)}</div></div>
          <div class="month-bar-item"><div class="lbl">Saídas</div><div class="val c-red">${fp(saidas)}${incomeNote}</div></div>
          <div class="month-bar-item"><div class="lbl">Saldo do mês</div><div class="val" style="color:${saldo>=0?'var(--green)':'var(--red)'}">${fp(saldo)}</div></div>
        </div>
        ${entradas>0?`
        <div style="padding:10px 16px 4px">
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text3);margin-bottom:5px">
            <span>Comprometimento da renda do mês</span><span style="font-weight:700;color:${barColor}">${spendPct}%</span>
          </div>
          <div class="month-saldo-bar" style="margin:0 0 10px">
            <div class="month-saldo-fill" style="width:${spendPct}%;background:${barColor}"></div>
          </div>
        </div>`:''}
        <div class="month-txs">
          ${txs.map(f=>`
            <div class="month-tx">
              <div class="fin-dot ${f.type}" style="flex-shrink:0"></div>
              <div class="month-tx-body">
                <div class="month-tx-name">${esc(f.desc)}</div>
                <div class="month-tx-meta">${[f.cat, f.date?new Date(f.date+'T00:00:00').toLocaleDateString('pt-BR'):''].filter(Boolean).join(' · ')}</div>
              </div>
              <span class="fin-amount ${f.type}" style="font-size:13px">${f.type==='entrada'?'+':'−'}${fp(f.val)}</span>
              ${iconBtn('','Remover',DEL_ICO,`delFinance(${f.id});renderFinHistory()`)}
            </div>`).join('')}
        </div>
      </div>
    </div>`;
  }).join('');
}

function toggleMonth(key) {
  $('mc-'+key).classList.toggle('open');
}

// ═══════ FINANCE (original) ═══════
function setFinType(t) {
  finType=t;
  $('fin-btn-entrada').classList.toggle('active', t==='entrada');
  $('fin-btn-saida').classList.toggle('active', t==='saida');
}
function addFinance() {
  const desc=$('fin-desc').value.trim(); if(!desc){$('fin-desc').focus();toast('⚠️ Informe a descrição');return;}
  const val=parseFloat($('fin-val').value); if(!val||val<=0){$('fin-val').focus();toast('⚠️ Informe o valor');return;}
  D.fin.push({id:uid(),desc,val,type:finType,cat:$('fin-cat').value,
    date:$('fin-date').value||new Date().toISOString().slice(0,10)});
  ['fin-desc','fin-val'].forEach(id=>$(id).value='');
  $('fin-cat').value=''; $('fin-date').value='';
  save('fin'); renderFinance(); toast(finType==='entrada'?'⬆️ Entrada registrada!':'⬇️ Saída registrada!');
}
function delFinance(id) {
  if(!confirm('Remover?')) return;
  D.fin=D.fin.filter(f=>f.id!==id); save('fin'); renderFinance(); toast('🗑️ Removido');
}
function renderFinance() {
  const s=$('fin-search').value.toLowerCase();
  let list = F.fin==='all'?[...D.fin]:D.fin.filter(f=>f.type===F.fin);
  if(s) list=list.filter(f=>f.desc.toLowerCase().includes(s)||(f.cat||'').toLowerCase().includes(s));
  list.sort((a,b)=>b.date.localeCompare(a.date));
  const st=$('fin-stats');
  if(D.fin.length){
    st.style.display='grid';
    const entradas=D.fin.filter(f=>f.type==='entrada').reduce((a,f)=>a+f.val,0);
    const saidas=D.fin.filter(f=>f.type==='saida').reduce((a,f)=>a+f.val,0);
    const saldo=entradas-saidas;
    $('fin-s1').textContent=fp(saldo);
    $('fin-s1').style.color=saldo>=0?'var(--green)':'var(--red)';
    $('fin-s2').textContent=fp(entradas);
    $('fin-s3').textContent=fp(saidas);
    $('fin-s4').textContent=D.fin.length;
  } else st.style.display='none';
  $('fin-title').textContent=`Extrato (${D.fin.length})`;
  // income insight
  const now2 = new Date(); const ms = now2.toISOString().slice(0,7);
  const mSpent = D.fin.filter(f=>f.type==='saida'&&(f.date||'').startsWith(ms)).reduce((a,f)=>a+f.val,0);
  const mIn    = D.fin.filter(f=>f.type==='entrada'&&(f.date||'').startsWith(ms)).reduce((a,f)=>a+f.val,0);
  let finInsight = '';
  if(income) {
    const pct = pctOfIncome(mSpent);
    const avail = income - mSpent;
    const color = pct>90?'var(--red)':pct>70?'var(--amber)':'inherit';
    finInsight = incomeInsight(`Este mês: <strong>${fp(mSpent)}</strong> gasto (<strong style="color:${color}">${pct}% da renda</strong>) · <strong style="color:var(--green)">${fp(avail>=0?avail:0)}</strong> ainda disponível`);
  }
  const fiEl = $('fin-insight'); if(fiEl) fiEl.innerHTML = finInsight;
  else { const d=document.createElement('div');d.id='fin-insight';d.innerHTML=finInsight;$('fin-list').insertAdjacentElement('beforebegin',d); }
  renderIncomeWidget();
  const el=$('fin-list');
  if(!list.length){el.innerHTML=emptyHTML('Nenhuma transação registrada.');return;}
  el.innerHTML=`<div class="items-list">${list.map(f=>`
    <div class="fin-item">
      <div class="fin-dot ${f.type}"></div>
      <div style="flex:1;min-width:0">
        <div class="item-name">${esc(f.desc)}</div>
        <div class="item-meta">${[f.cat, f.date?new Date(f.date+'T00:00:00').toLocaleDateString('pt-BR'):''].filter(Boolean).join(' · ')}</div>
      </div>
      <div class="item-actions">
        <span class="fin-amount ${f.type}">${f.type==='entrada'?'+':'−'}${fp(f.val)}</span>
        ${iconBtn('','Remover',DEL_ICO,`delFinance(${f.id})`)}
      </div>
    </div>`).join('')}</div>`;
}

// ═══════ SHOPPING ═══════
function addShopping() {
  const name=$('sh-name').value.trim(); if(!name){$('sh-name').focus();toast('⚠️ Informe o item');return;}
  D.sh.push({id:uid(),name,qty:parseInt($('sh-qty').value)||1,
    price:parseFloat($('sh-price').value)||0,cat:$('sh-cat').value,
    done:false,addedAt:today()});
  ['sh-name','sh-price'].forEach(id=>$(id).value='');
  $('sh-qty').value='1'; $('sh-cat').value='';
  save('sh'); renderShopping(); toast('✅ Item adicionado!');
}
function delShopping(id) {
  if(!confirm('Remover?')) return;
  D.sh=D.sh.filter(s=>s.id!==id); save('sh'); renderShopping(); toast('🗑️ Removido');
}
function toggleShop(id) {
  const s=D.sh.find(s=>s.id===id); if(s){s.done=!s.done; save('sh'); renderShopping();}
}
function openEditShopping(id) {
  const i=D.sh.find(i=>i.id===id); if(!i) return;
  editState = { type:'sh', id };
  $('modal-title').textContent = '✏️ Editar item';
  $('modal-body').innerHTML = `
    <div class="form-grid cols-2" style="gap:12px">
      <div class="field"><label>Nome *</label><input id="esh-name" value="${esc(i.name)}"/></div>
      <div class="field"><label>Categoria</label>
        <select id="esh-cat">
          <option value="">—</option>
          <option ${i.cat==='Alimentos'?'selected':''}>Alimentos</option>
          <option ${i.cat==='Bebidas'?'selected':''}>Bebidas</option>
          <option ${i.cat==='Limpeza'?'selected':''}>Limpeza</option>
          <option ${i.cat==='Higiene'?'selected':''}>Higiene</option>
          <option ${i.cat==='Eletrônicos'?'selected':''}>Eletrônicos</option>
          <option ${i.cat==='Roupas'?'selected':''}>Roupas</option>
          <option ${i.cat==='Casa'?'selected':''}>Casa</option>
          <option ${i.cat==='Outros'?'selected':''}>Outros</option>
        </select>
      </div>
      <div class="field"><label>Quantidade</label><input type="number" id="esh-qty" value="${i.qty||1}" min="1"/></div>
      <div class="field"><label>Preço unit. (R$)</label><input type="number" id="esh-price" value="${i.price||''}" min="0" step="0.01"/></div>
    </div>`;
  $('modal-edit').classList.add('open');
}
function saveEditShopping(id) {
  const name=$('esh-name').value.trim(); if(!name){toast('⚠️ Informe o nome');return;}
  const i=D.sh.find(i=>i.id===id); if(!i) return;
  i.name  = name;
  i.cat   = $('esh-cat').value;
  i.qty   = parseInt($('esh-qty').value)||1;
  i.price = parseFloat($('esh-price').value)||0;
  save('sh'); renderShopping(); closeModal(); toast('✅ Item atualizado!');
}
function renderShopping() {
  const s=$('sh-search').value.toLowerCase();
  let list = F.sh==='all'?[...D.sh]:F.sh==='done'?D.sh.filter(i=>i.done):D.sh.filter(i=>!i.done);
  if(s) list=list.filter(i=>i.name.toLowerCase().includes(s));
  const st=$('sh-stats');
  if(D.sh.length){
    st.style.display='grid';
    $('sh-s1').textContent=D.sh.length;
    $('sh-s2').textContent=D.sh.filter(i=>i.done).length;
    $('sh-s3').textContent=D.sh.filter(i=>!i.done).length;
    $('sh-s4').textContent=fp(D.sh.reduce((a,i)=>a+i.price*i.qty,0));
  } else st.style.display='none';
  $('sh-title').textContent=`Lista de compras (${D.sh.length})`;
  const el=$('sh-list');
  if(!list.length){el.innerHTML=emptyHTML('Nenhum item na lista.');return;}
  const total=list.reduce((a,i)=>a+(i.price*i.qty),0);
  // income insight
  let shInsight = '';
  if(income && total>0) {
    const pct=pctOfIncome(total);
    shInsight = incomeInsight(`Total da lista: <strong>${fp(total)}</strong> = <strong>${pct}%</strong> da sua renda mensal`);
  }
  el.innerHTML = (shInsight||'') + `<div class="items-list">${list.map(i=>`
    <div class="item-card shop-item${i.done?' checked':''}">
      <div class="item-inner">
        <button class="check-btn${i.done?' checked':''}" onclick="toggleShop(${i.id})">${i.done?'✓':''}</button>
        <div class="item-body">
          <div class="item-name">${esc(i.name)}${i.qty>1?` <span style="color:var(--text3);font-weight:400">×${i.qty}</span>`:''}</div>
          <div class="item-meta">${[i.cat,i.price>0?fp(i.price)+' un.':''].filter(Boolean).join(' · ')}</div>
        </div>
        <div class="item-actions">
          ${i.price>0&&i.qty>1?`<span style="font-size:13px;font-weight:700;color:var(--accent)">${fp(i.price*i.qty)}</span>`:(i.price>0?`<span style="font-size:13px;font-weight:700;color:var(--accent)">${fp(i.price)}</span>`:'')}
          ${iconBtn('edit-btn','Editar',EDIT_ICO,`openEditShopping(${i.id})`)}
          ${iconBtn('','Remover',DEL_ICO,`delShopping(${i.id})`)}
        </div>
      </div>
    </div>`).join('')}</div>${total>0?`<div class="total-row">Total estimado: <strong>${fp(total)}</strong></div>`:''}`;
}

// ═══════ OTHERS ═══════
function addOther() {
  const name=$('ot-name').value.trim(); if(!name){$('ot-name').focus();toast('⚠️ Informe o nome');return;}
  D.ot.push({id:uid(),name,cat:$('ot-cat').value,price:parseFloat($('ot-price').value)||0,
    status:$('ot-status').value,priority:$('ot-prio').value,note:$('ot-note').value.trim(),addedAt:today()});
  ['ot-name','ot-price','ot-note'].forEach(id=>$(id).value='');
  $('ot-cat').value=''; $('ot-status').value='quero'; $('ot-prio').value='média';
  save('ot'); renderOthers(); toast('✅ Item adicionado!');
}
function delOther(id) {
  if(!confirm('Remover?')) return;
  D.ot=D.ot.filter(o=>o.id!==id); save('ot'); renderOthers(); toast('🗑️ Removido');
}
function renderOthers() {
  const s=$('ot-search').value.toLowerCase();
  let list = F.ot==='all'?[...D.ot]:D.ot.filter(o=>o.status===F.ot);
  if(s) list=list.filter(o=>o.name.toLowerCase().includes(s)||(o.cat||'').toLowerCase().includes(s));
  const st=$('ot-stats');
  if(D.ot.length){
    st.style.display='grid';
    $('ot-s1').textContent=D.ot.length;
    $('ot-s2').textContent=D.ot.filter(o=>o.status==='tenho').length;
    $('ot-s3').textContent=D.ot.filter(o=>o.status==='quero').length;
    $('ot-s4').textContent=fp(D.ot.filter(o=>o.status==='quero').reduce((a,o)=>a+o.price,0));
  } else st.style.display='none';
  $('ot-title').textContent=`Outros itens (${D.ot.length})`;
  const catEmoji=c=>({Eletrônicos:'💻',Roupas:'👕',Calçados:'👟',Casa:'🏠',Esportes:'⚽',Acessórios:'💍'}[c]||'📦');
  const el=$('ot-list');
  if(!list.length){el.innerHTML=emptyHTML('Nenhum item adicionado.');return;}
  const otWantTotal = D.ot.filter(o=>o.status==='quero').reduce((a,o)=>a+o.price,0);
  let otInsight = '';
  if(income && otWantTotal>0) {
    const pct=pctOfIncome(otWantTotal); const months=monthsOfIncome(otWantTotal);
    otInsight = incomeInsight(`Itens na lista de desejos: <strong>${fp(otWantTotal)}</strong> = <strong>${months} meses</strong> de renda (${pct}%)`);
  }
  el.innerHTML = (otInsight||'') + `<div class="items-list">${list.map(o=>`
    <div class="item-card">
      <div class="item-thumb">${catEmoji(o.cat)}</div>
      <div class="item-inner">
        <div class="item-body">
          <div class="item-name">${esc(o.name)}</div>
          <div class="item-meta">${[o.cat,o.addedAt?'Adicionado '+o.addedAt:''].filter(Boolean).join(' · ')}</div>
          ${o.note?`<div class="item-note">${esc(o.note)}</div>`:''}
        </div>
        <div class="item-actions">
          ${o.price>0?`<span style="font-size:13px;font-weight:700;color:var(--accent)">${fp(o.price)}</span>`:''}
          <span class="badge ${o.status==='tenho'?'badge-green':'badge-amber'}">${o.status==='tenho'?'✅ Tenho':'🤩 Quero'}</span>
          <span class="badge ${prioCls(o.priority)}">${o.priority}</span>
          ${iconBtn('edit-btn','Editar',EDIT_ICO,`openEdit('ot',${o.id})`)}${iconBtn('','Remover',DEL_ICO,`delOther(${o.id})`)}
        </div>
      </div>
    </div>`).join('')}</div>`;
}

// ═══════ GOALS ═══════
function addGoal() {
  const name=$('gl-name').value.trim(); if(!name){$('gl-name').focus();toast('⚠️ Informe a meta');return;}
  D.gl.push({id:uid(),name,cat:$('gl-cat').value,target:parseFloat($('gl-target').value)||0,
    current:parseFloat($('gl-current').value)||0,unit:$('gl-unit').value.trim(),
    deadline:$('gl-deadline').value,status:$('gl-status').value,addedAt:today()});
  ['gl-name','gl-target','gl-current','gl-unit','gl-deadline'].forEach(id=>$(id).value='');
  $('gl-cat').value=''; $('gl-status').value='ativa';
  save('gl'); renderGoals(); toast('✅ Meta criada!');
}
function delGoal(id) {
  if(!confirm('Remover meta?')) return;
  D.gl=D.gl.filter(g=>g.id!==id); save('gl'); renderGoals(); toast('🗑️ Removida');
}
function renderGoals() {
  const s=$('gl-search').value.toLowerCase();
  let list = F.gl==='all'?[...D.gl]:D.gl.filter(g=>g.status===F.gl);
  if(s) list=list.filter(g=>g.name.toLowerCase().includes(s));
  const st=$('gl-stats');
  if(D.gl.length){
    st.style.display='grid';
    $('gl-s1').textContent=D.gl.length;
    $('gl-s2').textContent=D.gl.filter(g=>g.status==='ativa').length;
    $('gl-s3').textContent=D.gl.filter(g=>g.status==='concluida').length;
    $('gl-s4').textContent=D.gl.filter(g=>g.status==='pausada').length;
  } else st.style.display='none';
  $('gl-title').textContent=`Metas (${D.gl.length})`;
  const glStatusLbl=s=>({ativa:'🔥 Ativa',pausada:'⏸️ Pausada',concluida:'✅ Concluída'}[s]||s);
  const glStatusCls=s=>({ativa:'badge-amber',pausada:'badge-gray',concluida:'badge-green'}[s]||'badge-gray');
  const el=$('gl-list');
  if(!list.length){el.innerHTML=emptyHTML('Nenhuma meta criada ainda. Comece agora!');return;}
  // income insight for goals
  let glInsight = '';
  if(income) {
    const active = D.gl.filter(g=>g.status==='ativa');
    const saving20 = income * 0.20;
    glInsight = incomeInsight(`Poupando <strong>20% da renda</strong> = <strong>${fp(saving20)}/mês</strong> para investir nas suas metas`);
  }
  el.innerHTML = (glInsight||'') + `<div class="items-list">${list.map(g=>{
    const pct = g.target>0 ? Math.min(100,Math.round((g.current/g.target)*100)) : (g.status==='concluida'?100:0);
    const deadlineStr = g.deadline ? new Date(g.deadline+'T00:00:00').toLocaleDateString('pt-BR') : '';
    const remaining = g.target>0 ? Math.max(0,g.target-g.current) : 0;
    const monthsNeeded = (income>0 && remaining>0) ? Math.ceil(remaining/(income*0.2)) : 0;
    return `<div class="item-card" style="padding:0">
      <div style="flex:1;padding:13px 16px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
          <div class="item-name" style="flex:1">${esc(g.name)}</div>
          <span class="badge ${glStatusCls(g.status)}">${glStatusLbl(g.status)}</span>
          ${g.cat?`<span class="badge badge-gray">${esc(g.cat)}</span>`:''}
          ${iconBtn('edit-btn','Editar',EDIT_ICO,`openEdit('gl',${g.id})`)}${iconBtn('','Remover',DEL_ICO,`delGoal(${g.id})`)}
        </div>
        ${g.target>0?`
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text2);margin-bottom:4px">
            <span>${g.current}${g.unit?' '+g.unit:''} de ${g.target}${g.unit?' '+g.unit:''}</span>
            <span style="font-weight:700;color:var(--accent)">${pct}%</span>
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
          ${income&&monthsNeeded>0&&g.status==='ativa'?`<div style="font-size:11px;color:var(--text3);margin-top:5px">💡 Poupando 20% da renda: meta em ~<strong>${monthsNeeded} mês${monthsNeeded>1?'es':''}</strong></div>`:''}`
        :''}
        ${deadlineStr?`<div style="font-size:11px;color:var(--text3);margin-top:5px">📅 Prazo: ${deadlineStr}</div>`:''}
      </div>
    </div>`;
  }).join('')}</div>`;
}

// ═══════ EDIT MODAL ═══════
let editState = null;

function saveCurrentEdit() {
  if(!editState) return;
  const { type, id } = editState;

  if(type==='wish') {
    const g=D.wish.find(g=>g.id===id); if(!g) return;
    g.name    = $('edit-name').value.trim()  || g.name;
    g.platform= $('edit-plat').value;
    g.price   = parseFloat($('edit-price').value)||0;
    g.priority= $('edit-prio').value;
    g.genre   = $('edit-genre').value.trim();
    g.note    = $('edit-note').value.trim();
    if(covers['edit']!==undefined) g.cover=covers['edit'];
    save('wish'); renderWish();

  } else if(type==='col') {
    const g=D.col.find(g=>g.id===id); if(!g) return;
    g.name    = $('editc-name').value.trim() || g.name;
    g.platform= $('editc-plat').value;
    g.price   = parseFloat($('editc-price').value)||0;
    g.played  = $('editc-status').value;
    g.genre   = $('editc-genre').value.trim();
    g.note    = $('editc-note').value.trim();
    g.rating  = parseInt($('editc-stars')?.dataset.val)||0;
    if(covers['editc']!==undefined) g.cover=covers['editc'];
    save('col'); renderCol();

  } else if(type==='mv') {
    const m=D.mv.find(m=>m.id===id); if(!m) return;
    m.name    = $('em-name').value.trim()    || m.name;
    m.type    = $('em-type').value;
    m.status  = $('em-status').value;
    m.genre   = $('em-genre').value.trim();
    m.platform= $('em-plat').value.trim();
    m.score   = parseInt($('em-score').value)||0;
    save('mv'); renderMovies();

  } else if(type==='bk') {
    const b=D.bk.find(b=>b.id===id); if(!b) return;
    b.name  = $('eb-name').value.trim()   || b.name;
    b.author= $('eb-author').value.trim();
    b.status= $('eb-status').value;
    b.genre = $('eb-genre').value.trim();
    b.pages = parseInt($('eb-pages').value)||0;
    b.score = parseInt($('eb-score').value)||0;
    save('bk'); renderBooks();

  } else if(type==='ot') {
    const o=D.ot.find(o=>o.id===id); if(!o) return;
    o.name    = $('eo-name').value.trim()  || o.name;
    o.cat     = $('eo-cat').value;
    o.price   = parseFloat($('eo-price').value)||0;
    o.status  = $('eo-status').value;
    o.priority= $('eo-prio').value;
    o.note    = $('eo-note').value.trim();
    save('ot'); renderOthers();

  } else if(type==='gl') {
    const g=D.gl.find(g=>g.id===id); if(!g) return;
    g.name    = $('egl-name').value.trim()    || g.name;
    g.cat     = $('egl-cat').value.trim();
    g.target  = parseFloat($('egl-target').value)||0;
    g.current = parseFloat($('egl-current').value)||0;
    g.unit    = $('egl-unit').value.trim();
    g.deadline= $('egl-deadline').value;
    g.status  = $('egl-status').value;
    save('gl'); renderGoals();

  } else if(type==='sh') {
    const i=D.sh.find(i=>i.id===id); if(!i) return;
    const name=$('esh-name').value.trim(); if(!name){toast('⚠️ Informe o nome');return;}
    i.name  = name;
    i.cat   = $('esh-cat').value;
    i.qty   = parseInt($('esh-qty').value)||1;
    i.price = parseFloat($('esh-price').value)||0;
    save('sh'); renderShopping();
  }

  closeModal();
  editState = null;
  toast('✅ Alterações salvas!');
}

function openEdit(type, id) {
  editState = { type, id };
  let item, html;

  if(type==='wish') {
    item=D.wish.find(g=>g.id===id);
    html=editGameForm('edit',item,true);
  } else if(type==='col') {
    item=D.col.find(g=>g.id===id);
    html=editGameForm('editc',item,false);
  } else if(type==='mv') {
    item=D.mv.find(m=>m.id===id);
    html=`<div class="form-grid cols-2" style="gap:10px">
      <div class="field"><label>Título</label><input id="em-name" value="${esc(item.name)}"/></div>
      <div class="field"><label>Tipo</label><select id="em-type"><option value="filme" ${item.type==='filme'?'selected':''}>🎬 Filme</option><option value="serie" ${item.type==='serie'?'selected':''}>📺 Série</option><option value="anime" ${item.type==='anime'?'selected':''}>⛩️ Anime</option><option value="doc" ${item.type==='doc'?'selected':''}>🎥 Doc.</option></select></div>
      <div class="field"><label>Status</label><select id="em-status"><option value="quero" ${item.status==='quero'?'selected':''}>👀 Quero ver</option><option value="assistindo" ${item.status==='assistindo'?'selected':''}>▶️ Assistindo</option><option value="assistido" ${item.status==='assistido'?'selected':''}>✅ Assistido</option></select></div>
      <div class="field"><label>Gênero</label><input id="em-genre" value="${esc(item.genre||'')}"/></div>
      <div class="field"><label>Plataforma</label><input id="em-plat" value="${esc(item.platform||'')}"/></div>
      <div class="field"><label>Nota (1-10)</label><input type="number" id="em-score" value="${item.score||''}" min="1" max="10"/></div>
    </div>`;
  } else if(type==='bk') {
    item=D.bk.find(b=>b.id===id);
    html=`<div class="form-grid cols-2" style="gap:10px">
      <div class="field"><label>Título</label><input id="eb-name" value="${esc(item.name)}"/></div>
      <div class="field"><label>Autor</label><input id="eb-author" value="${esc(item.author||'')}"/></div>
      <div class="field"><label>Status</label><select id="eb-status"><option value="quero" ${item.status==='quero'?'selected':''}>📖 Quero ler</option><option value="lendo" ${item.status==='lendo'?'selected':''}>🔖 Lendo</option><option value="lido" ${item.status==='lido'?'selected':''}>✅ Lido</option></select></div>
      <div class="field"><label>Gênero</label><input id="eb-genre" value="${esc(item.genre||'')}"/></div>
      <div class="field"><label>Páginas</label><input type="number" id="eb-pages" value="${item.pages||''}"/></div>
      <div class="field"><label>Nota</label><input type="number" id="eb-score" value="${item.score||''}" min="1" max="10"/></div>
    </div>`;
  } else if(type==='ot') {
    item=D.ot.find(o=>o.id===id);
    html=`<div class="form-grid cols-2" style="gap:10px">
      <div class="field"><label>Nome</label><input id="eo-name" value="${esc(item.name)}"/></div>
      <div class="field"><label>Categoria</label><select id="eo-cat"><option value="">—</option><option ${item.cat==='Eletrônicos'?'selected':''}>Eletrônicos</option><option ${item.cat==='Roupas'?'selected':''}>Roupas</option><option ${item.cat==='Calçados'?'selected':''}>Calçados</option><option ${item.cat==='Casa'?'selected':''}>Casa</option><option ${item.cat==='Esportes'?'selected':''}>Esportes</option><option ${item.cat==='Acessórios'?'selected':''}>Acessórios</option><option ${item.cat==='Outros'?'selected':''}>Outros</option></select></div>
      <div class="field"><label>Preço (R$)</label><input type="number" id="eo-price" value="${item.price||''}"/></div>
      <div class="field"><label>Status</label><select id="eo-status"><option value="quero" ${item.status==='quero'?'selected':''}>🤩 Quero</option><option value="tenho" ${item.status==='tenho'?'selected':''}>✅ Tenho</option></select></div>
      <div class="field"><label>Prioridade</label><select id="eo-prio"><option value="alta" ${item.priority==='alta'?'selected':''}>🔴 Alta</option><option value="média" ${item.priority==='média'?'selected':''}>🟡 Média</option><option value="baixa" ${item.priority==='baixa'?'selected':''}>🔵 Baixa</option></select></div>
      <div class="field"><label>Obs.</label><input id="eo-note" value="${esc(item.note||'')}"/></div>
    </div>`;
  } else if(type==='gl') {
    item=D.gl.find(g=>g.id===id);
    html=`<div class="form-grid cols-2" style="gap:10px">
      <div class="field"><label>Meta</label><input id="egl-name" value="${esc(item.name)}"/></div>
      <div class="field"><label>Categoria</label><input id="egl-cat" value="${esc(item.cat||'')}"/></div>
      <div class="field"><label>Valor alvo</label><input type="number" id="egl-target" value="${item.target||''}"/></div>
      <div class="field"><label>Progresso atual</label><input type="number" id="egl-current" value="${item.current||0}"/></div>
      <div class="field"><label>Unidade</label><input id="egl-unit" value="${esc(item.unit||'')}"/></div>
      <div class="field"><label>Prazo</label><input type="date" id="egl-deadline" value="${item.deadline||''}"/></div>
      <div class="field"><label>Status</label><select id="egl-status"><option value="ativa" ${item.status==='ativa'?'selected':''}>🔥 Ativa</option><option value="pausada" ${item.status==='pausada'?'selected':''}>⏸️ Pausada</option><option value="concluida" ${item.status==='concluida'?'selected':''}>✅ Concluída</option></select></div>
    </div>`;
  }

  $('modal-title').textContent = '✏️ Editar';
  $('modal-body').innerHTML = html;
  $('modal-edit').classList.add('open');

  if(type==='wish'||type==='col') {
    const pfx = type==='wish'?'edit':'editc';
    clearCover(pfx);
    if(item.cover){ covers[pfx]=item.cover; showCover(pfx,item.cover); }
  }
}

function editGameForm(pfx, g, isWish) {
  return `<div style="display:flex;gap:14px;align-items:flex-start">
    <div class="cover-up" id="${pfx}-cover-box" style="width:80px;height:107px">
      <input type="file" accept="image/*" onchange="handleCover('${pfx}',this)"/>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
      <span style="font-size:10px">Capa</span>
      <button class="rm" type="button" onclick="rmCover('${pfx}',event)">✕</button>
    </div>
    <div class="form-grid cols-2" style="gap:10px;flex:1">
      <div class="field"><label>Nome</label><input id="${pfx}-name" value="${esc(g.name)}"/></div>
      <div class="field"><label>Plataforma</label><select id="${pfx}-plat"><option value="">—</option><option ${g.platform==='PC'?'selected':''}>PC</option><option ${g.platform==='PS5'?'selected':''}>PS5</option><option ${g.platform==='PS4'?'selected':''}>PS4</option><option ${g.platform==='Xbox Series X/S'?'selected':''}>Xbox Series X/S</option><option ${g.platform==='Xbox One'?'selected':''}>Xbox One</option><option ${g.platform==='Nintendo Switch'?'selected':''}>Nintendo Switch</option><option ${g.platform==='Mobile'?'selected':''}>Mobile</option></select></div>
      <div class="field"><label>Preço (R$)</label><input type="number" id="${pfx}-price" value="${g.price||''}"/></div>
      ${isWish?`<div class="field"><label>Prioridade</label><select id="${pfx}-prio"><option value="alta" ${g.priority==='alta'?'selected':''}>🔴 Alta</option><option value="média" ${g.priority==='média'?'selected':''}>🟡 Média</option><option value="baixa" ${g.priority==='baixa'?'selected':''}>🔵 Baixa</option></select></div>`
      :`<div class="field"><label>Status</label><select id="${pfx}-status"><option value="nao" ${g.played==='nao'?'selected':''}>⏳ Não joguei</option><option value="jogando" ${g.played==='jogando'?'selected':''}>🎮 Jogando</option><option value="parei" ${g.played==='parei'?'selected':''}>🛑 Joguei e parei</option><option value="zerado" ${g.played==='zerado'?'selected':''}>🏆 Zerado</option><option value="platinado" ${g.played==='platinado'?'selected':''}>💎 Platinado</option></select></div>`}
      <div class="field"><label>Gênero</label><input id="${pfx}-genre" value="${esc(g.genre||'')}"/></div>
      <div class="field"><label>Obs.</label><input id="${pfx}-note" value="${esc(g.note||'')}"/></div>
      ${!isWish?`<div class="field" style="grid-column:1/-1"><label>Minha avaliação</label>${starPickerHTML(pfx, g.rating||0)}</div>`:''}
    </div>
  </div>`;
}

// ═══════ RENDERS MAP ═══════
const renders = { w:renderWish, c:renderCol, mv:renderMovies, bk:renderBooks, fin:renderFinance, sh:renderShopping, ot:renderOthers, gl:renderGoals };

// ═══════ INCOME ═══════
let income = parseFloat(localStorage.getItem('hub_income')||'0');

function editIncome() {
  const display = $('income-display');
  display.style.display = 'none';
  const inp = document.createElement('input');
  inp.className = 'income-inline-input';
  inp.type = 'number'; inp.min = '0'; inp.step = '0.01';
  inp.value = income || ''; inp.placeholder = 'ex: 5000,00';
  $('income-widget').insertBefore(inp, display.nextSibling);
  inp.focus(); inp.select();
  const confirm = () => {
    income = parseFloat(inp.value) || 0;
    localStorage.setItem('hub_income', income);
    inp.remove(); display.style.display = '';
    renderIncomeWidget();
    renderWish(); renderFinance(); renderShopping(); renderOthers(); renderGoals();
    if(income > 0) toast('✅ Renda de ' + fp(income) + ' salva!');
  };
  inp.addEventListener('blur', confirm);
  inp.addEventListener('keydown', e => {
    if(e.key==='Enter') { inp.blur(); }
    if(e.key==='Escape') { inp.remove(); display.style.display=''; }
  });
}

function renderIncomeWidget() {
  const amtEl = $('income-amt');
  const barWrap = $('income-bar-wrap');
  if(!income) {
    amtEl.textContent = 'Definir renda...';
    amtEl.className = 'income-amount empty';
    barWrap.style.display = 'none';
    return;
  }
  amtEl.textContent = fp(income);
  amtEl.className = 'income-amount';
  const now = new Date();
  const monthStr = now.toISOString().slice(0,7);
  const spent = D.fin.filter(f=>f.type==='saida'&&(f.date||'').startsWith(monthStr)).reduce((a,f)=>a+f.val,0);
  const pct = Math.min(100, Math.round((spent/income)*100));
  const avail = income - spent;
  barWrap.style.display = 'block';
  const fill = $('income-bar-fill');
  fill.style.width = pct+'%';
  fill.style.background = pct>90 ? 'var(--red)' : pct>70 ? 'var(--amber)' : 'var(--accent)';
  $('income-spent-lbl').textContent = fp(spent)+' gasto';
  $('income-pct-lbl').textContent = pct+'%';
  $('income-pct-lbl').style.color = pct>90?'var(--red)':pct>70?'var(--amber)':'var(--accent)';
  const availEl = $('income-avail');
  availEl.textContent = avail>=0 ? '✓ '+fp(avail)+' disponível' : '⚠ Excedido em '+fp(Math.abs(avail));
  availEl.style.color = avail>=0 ? 'var(--green)' : 'var(--red)';
}

function incomeInsight(html) {
  if(!income || !html) return '';
  return `<div class="income-insight"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>${html}</div>`;
}
function pctOfIncome(val) { return income>0 ? Math.round((val/income)*100) : 0; }
function monthsOfIncome(val) { return income>0 ? (val/income).toFixed(1) : 0; }

// ═══════ BACKUP ═══════
function exportBackup() {
  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    income: income,
    data: D
  };
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toLocaleDateString('pt-BR').replace(/\//g,'-');
  a.href = url;
  a.download = `meu-organizador-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('✅ Backup exportado com sucesso!');
}

function importBackup(input) {
  const file = input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const backup = JSON.parse(e.target.result);
      if(!backup.data) throw new Error('Arquivo inválido');
      if(!confirm(`Importar backup de ${backup.exportedAt ? new Date(backup.exportedAt).toLocaleString('pt-BR') : 'data desconhecida'}?\n\nIsso vai SUBSTITUIR todos os dados atuais.`)) {
        input.value = ''; return;
      }
      // Restore all data
      const keys = ['wish','col','mv','bk','fin','sh','ot','gl'];
      keys.forEach(k => {
        if(backup.data[k]) {
          D[k] = backup.data[k];
          save(k);
        }
      });
      if(backup.income) {
        income = backup.income;
        localStorage.setItem('hub_income', income);
      }
      // Re-render everything
      renderIncomeWidget();
      renderWish(); renderCol(); renderMovies(); renderBooks();
      renderFinance(); renderShopping(); renderOthers(); renderGoals();
      input.value = '';
      toast('✅ Backup importado com sucesso!');
    } catch(err) {
      toast('❌ Arquivo inválido ou corrompido');
      input.value = '';
    }
  };
  reader.readAsText(file);
}

// ═══════ INVESTIMENTOS ═══════
function investTab(t) {
  $('ipanel-prazo').style.display   = t==='prazo'   ? 'block' : 'none';
  $('ipanel-acumulo').style.display = t==='acumulo' ? 'block' : 'none';
  $('itab-prazo').classList.toggle('active',   t==='prazo');
  $('itab-acumulo').classList.toggle('active', t==='acumulo');
}

function toggleCustomRate(mode) {
  const sel   = $(mode==='p'?'ip-taxa':'ia-taxa').value;
  const wrap  = $(mode==='p'?'ip-custom-wrap':'ia-custom-wrap');
  wrap.style.display = sel==='custom' ? 'grid' : 'none';
}

function getMonthlyRate(mode) {
  const sel = $(mode==='p'?'ip-taxa':'ia-taxa').value;
  if(sel==='custom') {
    const val = parseFloat($(mode==='p'?'ip-custom-val':'ia-custom-val').value)||0;
    const period = $(mode==='p'?'ip-custom-period':'ia-custom-period').value;
    if(period==='year') return (Math.pow(1+val/100, 1/12)-1);
    return val/100;
  }
  return parseFloat(sel)/100;
}

function fmtMonths(n) {
  n = Math.ceil(n);
  const y = Math.floor(n/12), m = n%12;
  if(y===0) return `${m} ${m===1?'mês':'meses'}`;
  if(m===0) return `${y} ${y===1?'ano':'anos'}`;
  return `${y} ${y===1?'ano':'anos'} e ${m} ${m===1?'mês':'meses'}`;
}

function buildBarCard(aportado, juros) {
  const total = aportado + juros;
  const pctA  = total>0 ? (aportado/total*100).toFixed(1) : 0;
  const pctJ  = total>0 ? (juros/total*100).toFixed(1)    : 0;
  return `<div class="inv-bar-card">
    <h4>Composição do valor final</h4>
    <div class="inv-bar-row">
      <div class="inv-bar-label">Você aportou</div>
      <div class="inv-bar-track"><div class="inv-bar-fill" style="width:${pctA}%;background:var(--accent)"><span>${pctA}%</span></div></div>
      <div class="inv-bar-val c-accent">${fp(aportado)}</div>
    </div>
    <div class="inv-bar-row">
      <div class="inv-bar-label">Juros ganhos</div>
      <div class="inv-bar-track"><div class="inv-bar-fill" style="width:${pctJ}%;background:var(--green)"><span>${pctJ}%</span></div></div>
      <div class="inv-bar-val c-green">${fp(juros)}</div>
    </div>
  </div>`;
}

function buildProjectionTable(initial, aporte, r, totalMonths, goalMonth) {
  const years = [];
  let bal = initial;
  let totalAportado = initial;
  // build year-by-year rows
  const maxYear = Math.ceil(totalMonths/12);
  for(let y=1; y<=Math.min(maxYear,50); y++) {
    const startBal = bal;
    const mths = Math.min(12, totalMonths-(y-1)*12);
    for(let m=0; m<mths; m++) { bal = bal*(1+r)+aporte; }
    totalAportado += aporte*mths;
    const juros = bal - totalAportado;
    const isGoalYear = goalMonth && (y===Math.ceil(goalMonth/12));
    years.push({year:y, balance:bal, aportado:totalAportado, juros, isGoalYear});
  }
  const rows = years.map(row=>`
    <tr class="${row.isGoalYear?'inv-table td-highlight':''}">
      <td>${row.year}º ano</td>
      <td class="td-accent">${fp(row.balance)}</td>
      <td>${fp(row.aportado)}</td>
      <td class="td-green">${fp(Math.max(0,row.juros))}</td>
    </tr>`).join('');
  return `<div class="inv-table-card">
    <h4>📊 Projeção ano a ano</h4>
    <div style="overflow-x:auto">
      <table class="inv-table">
        <thead><tr><th>Período</th><th>Saldo total</th><th>Total aportado</th><th>Juros acumulados</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

function calcPrazo() {
  const goal    = parseFloat($('ip-goal').value)   || 0;
  const aporte  = parseFloat($('ip-aporte').value) || 0;
  const initial = parseFloat($('ip-inicial').value)|| 0;
  const r       = getMonthlyRate('p');
  const el      = $('ip-result');

  if(!goal || !aporte) {
    el.innerHTML = `<div class="inv-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14"/></svg>Preencha o valor alvo e o aporte mensal para simular.</div>`;
    return;
  }
  if(initial >= goal) {
    el.innerHTML = `<div class="inv-empty">Você já tem o valor alvo no saldo inicial! 🎉</div>`;
    return;
  }

  let months, finalBalance;
  if(r===0) {
    months = Math.ceil((goal-initial)/aporte);
    finalBalance = initial + aporte*months;
  } else {
    // n = log((FV*r + PMT) / (PV*r + PMT)) / log(1+r)
    months = Math.log((goal*r + aporte) / (initial*r + aporte)) / Math.log(1+r);
    months = Math.ceil(months);
    // recalc final balance at that exact month
    let bal = initial;
    for(let m=0; m<months; m++) bal = bal*(1+r)+aporte;
    finalBalance = bal;
  }

  const totalAportado = initial + aporte*months;
  const juros = finalBalance - totalAportado;
  const incomeNote = income && aporte ? `<div class="inv-tip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>Este aporte representa <strong>${Math.round(aporte/income*100)}% da sua renda mensal</strong> (R$ ${fp(income)}).</div>` : '';

  el.innerHTML = incomeNote + `
    <div class="inv-result-grid">
      <div class="inv-stat inv-highlight">
        <div class="inv-stat-lbl">⏱ Tempo para juntar</div>
        <div class="inv-stat-val">${fmtMonths(months)}</div>
        <div class="inv-stat-sub">${months} meses no total</div>
      </div>
      <div class="inv-stat">
        <div class="inv-stat-lbl">💰 Valor final</div>
        <div class="inv-stat-val">${fp(finalBalance)}</div>
        <div class="inv-stat-sub">Meta: ${fp(goal)}</div>
      </div>
      <div class="inv-stat">
        <div class="inv-stat-lbl">📥 Total aportado</div>
        <div class="inv-stat-val" style="color:var(--accent)">${fp(totalAportado)}</div>
        <div class="inv-stat-sub">${fp(aporte)}/mês × ${months} meses</div>
      </div>
      <div class="inv-stat">
        <div class="inv-stat-lbl">✨ Juros ganhos</div>
        <div class="inv-stat-val" style="color:var(--green)">${fp(Math.max(0,juros))}</div>
        <div class="inv-stat-sub">${r>0?(juros/totalAportado*100).toFixed(1)+'% sobre o aportado':'Sem juros na simulação'}</div>
      </div>
    </div>
    ${buildBarCard(totalAportado, Math.max(0,juros))}
    ${buildProjectionTable(initial, aporte, r, months, months)}`;
}

function calcAcumulo() {
  const aporte  = parseFloat($('ia-aporte').value)  || 0;
  const initial = parseFloat($('ia-inicial').value) || 0;
  const unit    = $('ia-periodo-unit').value;
  const rawPer  = parseInt($('ia-periodo').value)   || 0;
  const months  = unit==='years' ? rawPer*12 : rawPer;
  const r       = getMonthlyRate('a');
  const el      = $('ia-result');

  if(!aporte || !months) {
    el.innerHTML = `<div class="inv-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14"/></svg>Preencha o aporte mensal e o período para simular.</div>`;
    return;
  }

  let bal = initial;
  for(let m=0; m<months; m++) bal = bal*(1+r)+aporte;
  const totalAportado = initial + aporte*months;
  const juros = bal - totalAportado;
  const incomeNote = income && aporte ? `<div class="inv-tip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>Este aporte representa <strong>${Math.round(aporte/income*100)}% da sua renda mensal</strong>. Poupando 20% da renda = <strong>${fp(income*0.2)}/mês</strong>.</div>` : '';
  const perUnit = unit==='years' ? `${rawPer} ${rawPer===1?'ano':'anos'}` : `${rawPer} ${rawPer===1?'mês':'meses'}`;

  el.innerHTML = incomeNote + `
    <div class="inv-result-grid">
      <div class="inv-stat inv-highlight">
        <div class="inv-stat-lbl">🏆 Valor acumulado</div>
        <div class="inv-stat-val">${fp(bal)}</div>
        <div class="inv-stat-sub">Em ${perUnit}</div>
      </div>
      <div class="inv-stat">
        <div class="inv-stat-lbl">📥 Total aportado</div>
        <div class="inv-stat-val" style="color:var(--accent)">${fp(totalAportado)}</div>
        <div class="inv-stat-sub">${fp(aporte)}/mês × ${months} meses</div>
      </div>
      <div class="inv-stat">
        <div class="inv-stat-lbl">✨ Juros ganhos</div>
        <div class="inv-stat-val" style="color:var(--green)">${fp(Math.max(0,juros))}</div>
        <div class="inv-stat-sub">${r>0?(juros/totalAportado*100).toFixed(1)+'% sobre o aportado':'Sem juros na simulação'}</div>
      </div>
      <div class="inv-stat">
        <div class="inv-stat-lbl">📅 Aporte × Período</div>
        <div class="inv-stat-val" style="font-size:15px;padding-top:4px">${fp(aporte)} × ${perUnit}</div>
        <div class="inv-stat-sub">${initial>0?'Inicial: '+fp(initial):''}</div>
      </div>
    </div>
    ${buildBarCard(totalAportado, Math.max(0,juros))}
    ${buildProjectionTable(initial, aporte, r, months, null)}`;
}

// ═══════ STAR RATING ═══════
const STAR_LABELS = ['','Horrível','Ruim','Ok','Bom','Excelente'];

function setFormStar(pfx, val) {
  const container = $(pfx+'-stars');
  if(!container) return;
  // toggle off if clicking same star
  const current = parseInt(container.dataset.val)||0;
  const newVal = current===val ? 0 : val;
  container.dataset.val = newVal;
  container.querySelectorAll('.star').forEach(s => {
    s.classList.toggle('on', parseInt(s.dataset.i) <= newVal);
  });
  const lbl = $(pfx+'-stars-lbl');
  if(lbl) lbl.textContent = newVal ? `(${STAR_LABELS[newVal]})` : '(Horrível / Ruim / Ok / Bom / Excelente)';
}

function hoverStar(pfx, val) {
  const container = $(pfx+'-stars');
  if(!container) return;
  const current = parseInt(container.dataset.val)||0;
  container.querySelectorAll('.star').forEach(s => {
    const i = parseInt(s.dataset.i);
    s.classList.toggle('on', i <= (val || current));
  });
}

function starPickerHTML(pfx, currentVal) {
  const val = currentVal || 0;
  const stars = [1,2,3,4,5].map(i =>
    `<span class="star${i<=val?' on':''}" data-i="${i}"
      onclick="setFormStar('${pfx}',${i})"
      onmouseenter="hoverStar('${pfx}',${i})"
      onmouseleave="hoverStar('${pfx}',0)">★</span>`
  ).join('');
  return `<div class="star-picker" id="${pfx}-stars" data-val="${val}">
    ${stars}
    <span style="font-size:12px;color:var(--text3);margin-left:6px" id="${pfx}-stars-lbl">${val?`(${STAR_LABELS[val]})`:'(Horrível / Ruim / Ok / Bom / Excelente)'}</span>
  </div>`;
}

function starDisplayHTML(val) {
  if(!val) return '';
  const stars = [1,2,3,4,5].map(i=>`<span class="${i<=val?'s-on':'s-off'}">★</span>`).join('');
  return `<span class="star-display" title="${STAR_LABELS[val]}">${stars} <span style="font-size:11px;color:var(--text2)">(${STAR_LABELS[val]})</span></span>`;
}

// ═══════ GAME SEARCH (RAWG) ═══════
const RAWG_KEY = '48bbd3bd60ba4c3cbe1ccdaaa08febc1';
let gameSearchTarget = null;
let gsDebounce = null;

function openGameSearch(target) {
  gameSearchTarget = target;
  $('gs-input').value = '';
  $('gs-results').innerHTML = '<div style="text-align:center;padding:30px 16px;color:var(--text3);font-size:13px">Digite o nome do jogo para buscar</div>';
  $('gs-status').textContent = '';
  $('gs-modal').classList.add('open');
  setTimeout(() => $('gs-input').focus(), 80);
}

function closeGameSearch() {
  $('gs-modal').classList.remove('open');
  gameSearchTarget = null;
  clearTimeout(gsDebounce);
}

function onGameSearchInput() {
  clearTimeout(gsDebounce);
  const q = $('gs-input').value.trim();
  if(q.length < 2) {
    $('gs-results').innerHTML = '<div style="text-align:center;padding:30px 16px;color:var(--text3);font-size:13px">Digite pelo menos 2 caracteres</div>';
    $('gs-status').textContent = '';
    return;
  }
  $('gs-status').textContent = '⏳ Buscando...';
  gsDebounce = setTimeout(() => fetchRAWG(q), 450);
}

async function fetchRAWG(query) {
  try {
    const url = `https://api.rawg.io/api/games?key=${RAWG_KEY}&search=${encodeURIComponent(query)}&page_size=8&search_precise=false`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if(!res.ok) throw new Error('API error ' + res.status);
    const data = await res.json();
    $('gs-status').textContent = data.results?.length ? `${data.results.length} resultado(s) encontrado(s)` : '';
    renderGSResults(data.results || []);
  } catch(e) {
    $('gs-status').textContent = '❌ Erro ao buscar. Verifique sua conexão.';
    $('gs-results').innerHTML = '';
  }
}

function renderGSResults(games) {
  const el = $('gs-results');
  if(!games.length) {
    el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text3);font-size:13px">Nenhum jogo encontrado. Tente outro nome.</div>';
    return;
  }
  el.innerHTML = games.map(g => {
    const cover  = g.background_image || '';
    const genres = (g.genres   ||[]).slice(0,2).map(x=>x.name).join(', ');
    const plats  = (g.platforms||[]).slice(0,3).map(x=>x.platform.name).join(', ');
    const rating = g.rating ? `⭐ ${g.rating.toFixed(1)}` : '';
    const coverData = cover ? `data-cover="${esc(cover)}"` : '';
    return `<div class="gs-result" ${coverData}
      data-name="${esc(g.name)}"
      data-genres="${esc(genres)}"
      data-plats="${esc(plats)}"
      onclick="selectGSGame(this)">
      <div class="gs-result-cover">
        ${cover ? `<img src="${cover}" alt="" loading="lazy" onerror="this.parentNode.innerHTML='🎮'"/>` : '🎮'}
      </div>
      <div class="gs-result-info">
        <div class="gs-result-name">${esc(g.name)}</div>
        <div class="gs-result-meta">${[genres, plats].filter(Boolean).join(' · ')}</div>
        ${rating ? `<div class="gs-result-rating">${rating}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

function selectGSGame(el) {
  const name   = el.dataset.name   || '';
  const genres = el.dataset.genres || '';
  const plats  = el.dataset.plats  || '';
  const cover  = el.dataset.cover  || '';
  const pfx    = gameSearchTarget;

  const isWish = pfx === 'w';
  $(isWish ? 'w-name'  : 'c-name').value  = name;
  $(isWish ? 'w-genre' : 'c-genre').value = genres.split(',')[0].trim();

  // Map RAWG platform name to our select options
  const platMap = {
    'PC':'PC','PlayStation 5':'PS5','PlayStation 4':'PS4',
    'Xbox Series S/X':'Xbox Series X/S','Xbox One':'Xbox One',
    'Nintendo Switch':'Nintendo Switch','iOS':'Mobile','Android':'Mobile'
  };
  const firstPlat = plats.split(',')[0].trim();
  const mapped = platMap[firstPlat] || '';
  if(mapped) $(isWish ? 'w-plat' : 'c-plat').value = mapped;

  // Set cover URL directly — works as img src without needing base64
  if(cover) {
    covers[pfx] = cover;
    showCover(pfx, cover);
  }

  closeGameSearch();
  toast(`✅ "${name}" selecionado! Complete os campos restantes.`);
}

// ═══════ SIDEBAR MOBILE ═══════
function toggleSidebar() {
  const sb = $('sidebar'), hb = $('hamburger'), bd = $('sidebar-backdrop');
  const open = sb.classList.toggle('open');
  hb.classList.toggle('open', open);
  bd.classList.toggle('open', open);
}
function closeSidebar() {
  $('sidebar').classList.remove('open');
  $('hamburger').classList.remove('open');
  $('sidebar-backdrop').classList.remove('open');
}
document.querySelectorAll('.overlay').forEach(o=>{
  o.addEventListener('click',e=>{if(e.target===o)closeModal();});
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){closeModal();closeLb();closeGameSearch();}
});
// Set today as default date for finance
$('fin-date').value = new Date().toISOString().slice(0,10);

// ═══════ INIT ═══════
renderIncomeWidget();
renderWish(); renderCol(); renderMovies(); renderBooks();
renderFinance(); renderShopping(); renderOthers(); renderGoals();
