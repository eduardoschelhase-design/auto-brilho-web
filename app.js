
'use strict';

const DB_NAME='AutoBrilhoDB', DB_VERSION=1;

const modules={
 clients:{label:'Clientes',singular:'cliente',icon:'♙',store:'clients',fields:[['name','Nome completo','text',true],['phone','Telefone / WhatsApp','tel',false],['email','E-mail','email',false],['document','CPF / CNPJ','text',false],['address','Endereço','text',false],['notes','Observações','textarea',false]],columns:[['name','Nome'],['phone','Telefone'],['document','CPF / CNPJ']]},
 vehicles:{label:'Veículos',singular:'veículo',icon:'🚗',store:'vehicles',fields:[['client','Cliente','text',true],['plate','Placa','text',true],['type','Tipo de veículo','select',true,['Carro','SUV','Utilitário','Moto','Camionete','Caminhão 3/4','Caminhão','Carreta','Ônibus','Outro']],['brand','Marca','text',false],['model','Modelo','text',false],['color','Cor','text',false],['notes','Observações','textarea',false]],columns:[['plate','Placa'],['client','Cliente'],['type','Tipo'],['model','Modelo']]},
 services:{label:'Serviços realizados',singular:'serviço',icon:'✦',store:'services',fields:[['date','Data','date',true],['client','Cliente','text',true],['vehicle','Veículo / placa','text',true],['service','Serviço executado','text',true],['value','Valor (R$)','number',true],['status','Situação','select',true,['Aguardando','Em andamento','Pronto para retirada','Concluído','Cancelado']],['paymentStatus','Situação financeira','select',false,['Recebido','Pendente']],['paymentMethod','Tipo de pagamento','select',false,['Dinheiro','Pix','Cartão','Brinde']],['notes','Observações','textarea',false]],columns:[['date','Data'],['client','Cliente'],['vehicle','Veículo'],['service','Serviço'],['value','Valor'],['status','Situação'],['paymentStatus','Pagamento'],['paymentMethod','Forma']]},
 appointments:{label:'Agendamentos',singular:'agendamento',icon:'▦',store:'appointments',fields:[['date','Data','date',true],['time','Horário','time',true],['client','Cliente','text',true],['vehicle','Veículo / placa','text',true],['service','Serviço solicitado','text',true],['value','Valor (R$)','number',false],['status','Situação','select',true,['Agendado','Confirmado','Concluído','Cancelado']],['notes','Observações','textarea',false]],columns:[['date','Data'],['time','Horário'],['client','Cliente'],['vehicle','Veículo'],['service','Serviço'],['value','Valor'],['status','Situação']]},
 payments:{label:'Receitas e pagamentos',singular:'pagamento',icon:'R$',store:'payments',fields:[['date','Data','date',true],['client','Cliente','text',true],['description','Descrição','text',true],['method','Forma de pagamento','select',true,['Pix','Dinheiro','Cartão','Cartão de débito','Cartão de crédito','Transferência','Brinde','Outro']],['value','Valor (R$)','number',true],['status','Situação','select',true,['Pago','Pendente','Brinde','Estornado']],['notes','Observações','textarea',false]],columns:[['date','Data'],['client','Cliente'],['description','Descrição'],['method','Forma'],['value','Valor'],['status','Situação']]},
 expenses:{label:'Despesas',singular:'despesa',icon:'−',store:'expenses',fields:[['date','Data do pagamento','date',false],['dueDate','Data de vencimento','date',false],['category','Categoria','select',false,['Produtos','Funcionários','Pró-labore','Despesa mensal','Diversos','Cartão / empréstimo']],['subcategory','Subcategoria','text',false],['description','Descrição','text',true],['supplier','Fornecedor','text',false],['value','Valor (R$)','number',true],['payment','Forma de pagamento','select',false,['Pix','Dinheiro','Cartão','Transferência','Débito automático','Outro']],['paymentStatus','Situação','select',false,['Em aberto','Pago']],['notes','Observações','textarea',false]],columns:[['date','Data'],['category','Categoria'],['subcategory','Subcategoria'],['description','Descrição'],['value','Valor']]}
};

let sbClient, active='home', editId=null, installPrompt=null, realtimeChannel=null, recoveryMode=false, editingVehicleId=null;
let dashboardPeriod='current';
let dashboardChartRange=12;
let returnToServicesAfterVehicleRegistration=false;
const $=id=>document.getElementById(id);

const configured=()=>window.AUTO_BRILHO_CONFIG && /^https:\/\//.test(window.AUTO_BRILHO_CONFIG.supabaseUrl) && !window.AUTO_BRILHO_CONFIG.supabaseUrl.includes('COLE_AQUI') && window.AUTO_BRILHO_CONFIG.supabaseAnonKey && !window.AUTO_BRILHO_CONFIG.supabaseAnonKey.includes('COLE_AQUI');

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function money(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
function decimalValue(v){
 let s=String(v??'').trim().replace(/R\$/gi,'').replace(/\s/g,'');
 if(!s)return 0;
 if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.');
 else if(s.includes(','))s=s.replace(',','.');
 const n=Number(s);
 return Number.isFinite(n)?Math.round(n*100)/100:NaN;
}
function decimalText(v){return Number(v||0).toFixed(2)}
function bindDecimalInput(input){
 if(!input)return;
 input.addEventListener('blur',()=>{
  const n=decimalValue(input.value);
  if(Number.isFinite(n))input.value=decimalText(n);
 });
}
function localISODate(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function dateBR(v){if(!v)return '';const p=String(v).split('-');return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:v}
function showToast(msg){$('toast').textContent=msg;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),2600)}
function setLoginMessage(msg){$('loginMessage').textContent=msg}
function showApp(show){$('loginScreen').classList.toggle('hidden',show);$('appShell').classList.toggle('hidden',!show);$('logoutBtn').classList.toggle('hidden',!show)}

// Cache em memória: evita baixar a mesma tabela inteira a cada tela, busca ou atualização.
const DATA_CACHE_TTL=120000; // 2 min de segurança; gravações e tempo real invalidam antes disso
const dataCache=new Map(), dataInflight=new Map();
function invalidateCache(store){if(store){dataCache.delete(store);dataInflight.delete(store);}else{dataCache.clear();dataInflight.clear();}}
function mapRows(rows){return rows.map(r=>({...r.data,id:r.id,createdAt:r.created_at,updatedAt:r.updated_at}));}
async function fetchAllRows(store){
 // Supabase limita cada resposta; buscar em páginas evita perder registros acima de 1.000.
 const pageSize=1000;let offset=0,rows=[];
 while(true){
  const {data,error}=await sbClient.from(store).select('id,data,created_at,updated_at').order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+pageSize-1);
  if(error)throw error;
  const page=data||[];rows.push(...page);
  if(page.length<pageSize)break;
  offset+=pageSize;
 }
 return rows;
}
async function all(store){
 const hit=dataCache.get(store);
 if(hit&&Date.now()-hit.at<DATA_CACHE_TTL)return mapRows(hit.rows);
 let p=dataInflight.get(store);
 if(!p){
  p=fetchAllRows(store).then(rows=>{if(dataInflight.get(store)===p)dataCache.set(store,{rows,at:Date.now()});return rows;}).finally(()=>{if(dataInflight.get(store)===p)dataInflight.delete(store);});
  dataInflight.set(store,p);
 }
 return mapRows(await p);
}

async function save(store,item){
 const payload={data:{...item}};
 delete payload.data.id;
 delete payload.data.createdAt;
 delete payload.data.updatedAt;
 if(item.id)payload.id=item.id;
 const {data,error}=await sbClient.from(store).upsert(payload).select('id,data,created_at,updated_at').single();
 if(error)throw error;
 invalidateCache(store);
 return {...data.data,id:data.id,createdAt:data.created_at,updatedAt:data.updated_at};
}

async function remove(store,id){
 if(isEmployee())throw new Error('Seu perfil não tem permissão para excluir.');
 const {error}=await sbClient.from(store).delete().eq('id',id);
 if(error)throw error;
 invalidateCache(store);
}

function renderTabs(){
 const tabs=[
  ['dashboard','▥','Dashboards'],
  ...Object.entries(modules)
   .filter(([k])=>k!=='vehicles'&&k!=='appointments')
   .map(([k,m])=>[k,m.icon,m.label]),
  ['payables','◷','Contas a pagar']
 ];

 $('tabs').innerHTML=tabs.filter(t=>!isEmployee()||EMPLOYEE_TABS.includes(t[0])).map(([key,icon,label])=>
  `<button class="tab ${key===active?'active':''}" data-tab="${key}">
   ${icon} ${label}
  </button>`
 ).join('');

 $('tabs').querySelectorAll('[data-tab]').forEach(b=>{
  b.onclick=()=>{
   active=b.dataset.tab;
   editId=null;
   editingVehicleId=null;

   $('formWrap').classList.add('hidden');

   renderTabs();
   renderSection();
  };
 });
}

function renderSection(){
 const isDashboard=active==='dashboard';
 const isPayables=active==='payables';

 $('sectionEyebrow').textContent=
  isDashboard?'ANÁLISE DO NEGÓCIO':'CADASTROS E CONTROLE';

 $('sectionTitle').textContent=
  isDashboard?'Dashboards':
  isPayables?'Contas a pagar':
  active==='clients'?'Clientes e veículos':
  modules[active].label;

 $('addBtn').classList.toggle('hidden',isDashboard);
 $('formWrap').classList.add('hidden');
 $('searchInput').parentElement.classList.toggle('hidden',isDashboard);

 if(isDashboard){
  renderDashboards();
  return;
 }

 $('addBtn').textContent=
  active==='clients'?'+ Novo cadastro':
  isPayables?'+ Nova conta a pagar':
  '+ Nova '+modules[active].singular;

 $('searchInput').value='';
 renderTable();
}

function renderForm(item={}){
 if(active==='clients'){
  renderClientVehicleForm(item);
  return;
 }

 if(active==='services'){
  renderServiceForm(item);
  return;
 }

 if(active==='appointments'){
  renderAppointmentForm(item);
  return;
 }

 if(active==='expenses'||active==='payables'){
  renderExpenseForm(item,active==='payables');
  return;
 }

 const m=modules[active];
 editId=item.id??null;

 $('formWrap').innerHTML=`<form id="recordForm"><div class="form-grid">${m.fields.map(([key,label,type,required,opts])=>{
  let input='';
  if(type==='select')input=`<select name="${key}" ${required?'required':''}><option value="">Selecione...</option>${opts.map(o=>`<option ${item[key]===o?'selected':''}>${esc(o)}</option>`).join('')}</select>`;
  else if(type==='textarea')input=`<textarea name="${key}" rows="2">${esc(item[key]||'')}</textarea>`;
  else if(key==='value')input=`<input name="${key}" type="text" inputmode="decimal" ${required?'required':''} value="${esc(item[key]!==undefined?decimalText(item[key]):'')}" placeholder="0,00">`;
  else input=`<input name="${key}" type="${type}" ${required?'required':''} ${type==='number'?'min="0" step="0.01"':''} value="${esc(item[key]??(type==='date'?localISODate():''))}" placeholder="${type==='number'?'0,00':''}">`;
  return `<div class="field"><label>${esc(label)}${required?' *':''}</label>${input}</div>`;
 }).join('')}</div><div class="form-actions"><button type="button" class="secondary" id="cancelForm">Cancelar</button><button class="primary" type="submit">${item.id?'Salvar alterações':'Salvar cadastro'}</button></div></form>`;

 $('formWrap').classList.remove('hidden');
 bindDecimalInput($('recordForm').elements.value);

 $('cancelForm').onclick=()=>{
  $('formWrap').classList.add('hidden');
  editId=null;
 };

 $('recordForm').onsubmit=async e=>{
  e.preventDefault();
  const submit=e.target.querySelector('[type=submit]');
  submit.disabled=true;

  try{
   const data=Object.fromEntries(new FormData(e.target).entries());
   if('value'in data){data.value=decimalValue(data.value);if(!Number.isFinite(data.value)||data.value<0)throw new Error('Informe um valor válido.');}
   if(editId)data.id=editId;
   else data.createdAt=new Date().toISOString();

   await save(m.store,data);
   $('formWrap').classList.add('hidden');
   editId=null;
   showToast('Cadastro salvo na nuvem.');
   await renderTable();
   await renderStats();
  }catch(err){
   showToast('Não foi possível salvar: '+(err.message||'verifique a conexão.'));
  }finally{
   submit.disabled=false;
  }
 };
}

// Despesas pagas e contas a pagar compartilham o mesmo registro,
// evitando duplicidade quando uma conta é quitada.
const expenseCategories=['Produtos','Funcionários','Pró-labore','Despesa mensal','Diversos','Cartão / empréstimo'];
const expensePaymentMethods=['Pix','Dinheiro','Cartão','Transferência','Débito automático','Outro'];
function renderExpenseForm(item={},isPayable=false){
 editId=item.id??null;
 const today=localISODate();
 const dueDate=item.dueDate||item.date||today;
 const formTitle=isPayable?'Conta a pagar':'Despesa paga';
 $('formWrap').innerHTML=`<form id="expenseForm">
  <div class="form-grid">
   <div class="field"><label>Categoria *</label><select name="category" required><option value="">Selecione...</option>${expenseCategories.map(c=>`<option ${item.category===c?'selected':''}>${esc(c)}</option>`).join('')}</select></div>
   <div class="field"><label>Subcategoria (editável)</label><input name="subcategory" type="text" value="${esc(item.subcategory||'')}" placeholder="Ex.: shampoo, salário, aluguel"></div>
   <div class="field"><label>Descrição *</label><input name="description" required value="${esc(item.description||'')}" placeholder="Descrição da conta ou despesa"></div>
   <div class="field"><label>Fornecedor / beneficiário</label><input name="supplier" value="${esc(item.supplier||'')}"></div>
   <div class="field"><label>Valor (R$) *</label><input name="value" type="text" inputmode="decimal" required value="${esc(item.value!==undefined?decimalText(item.value):'')}" placeholder="0,00"></div>
   ${isPayable?`<div class="field"><label>Data de vencimento *</label><input name="dueDate" type="date" required value="${esc(dueDate)}"></div>`:`<div class="field"><label>Data do pagamento *</label><input name="date" type="date" required value="${esc(item.date||today)}"></div>`}
   ${!isPayable?`<div class="field"><label>Forma de pagamento</label><select name="payment"><option value="">Selecione...</option>${expensePaymentMethods.map(m=>`<option ${item.payment===m?'selected':''}>${esc(m)}</option>`).join('')}</select></div>`:''}
   <div class="field"><label>Observações</label><textarea name="notes" rows="2">${esc(item.notes||'')}</textarea></div>
  </div>
  <div class="form-actions"><button type="button" class="secondary" id="cancelExpenseForm">Cancelar</button><button class="primary" type="submit">${item.id?'Salvar alterações':isPayable?'Salvar conta':'Salvar despesa'}</button></div>
 </form>`;
 $('formWrap').classList.remove('hidden');
 bindDecimalInput($('expenseForm').elements.value);
 $('cancelExpenseForm').onclick=()=>{$('formWrap').classList.add('hidden');editId=null;};
 $('expenseForm').onsubmit=async e=>{
  e.preventDefault();
  const submit=e.target.querySelector('[type=submit]');submit.disabled=true;
  try{
   const data=Object.fromEntries(new FormData(e.target).entries());
   data.value=decimalValue(data.value);
   if(!Number.isFinite(data.value)||data.value<=0)throw new Error('Informe um valor maior que zero.');
   if(editId)data.id=editId;else data.createdAt=new Date().toISOString();
   if(isPayable){
    data.paymentStatus='Em aberto';
    data.date='';
    data.dueDate=data.dueDate;
    delete data.payment;
   }else{
    data.paymentStatus='Pago';
    data.dueDate=item.dueDate||data.date;
    data.paidAt=data.date;
   }
   await save('expenses',data);
   $('formWrap').classList.add('hidden');editId=null;
   showToast(isPayable?'Conta a pagar salva.':'Despesa registrada.');
   await renderTable();await renderStats();await renderFinancialMovement();
  }catch(err){showToast('Não foi possível salvar: '+(err.message||'verifique os dados.'));}
  finally{submit.disabled=false;}
 };
}

let payablesFilter='all';
async function renderPayablesTable(){
 try{
  const rows=await all('expenses');
  const q=$('searchInput').value.trim().toLocaleLowerCase('pt-BR');
  const today=localISODate(), monthKey=today.slice(0,7);
  const isOpen=r=>r.paymentStatus==='Em aberto'||r.paymentStatus==='Pendente';
  const dueOf=r=>/^\d{4}-\d{2}-\d{2}$/.test(String(r.dueDate||''))?r.dueDate:'';
  // Atrasada: vencimento anterior a hoje (qualquer mês, para nada ficar esquecido).
  const isLate=r=>!!dueOf(r)&&dueOf(r)<today;
  // Pendente: ainda não venceu e vence neste mês (ou está sem data de vencimento).
  const isMonthPending=r=>!isLate(r)&&(!dueOf(r)||dueOf(r).slice(0,7)===monthKey);
  const matches=r=>!q||Object.values(r).some(v=>String(v??'').toLocaleLowerCase('pt-BR').includes(q));
  const openRows=rows.filter(isOpen);
  const late=openRows.filter(isLate), pend=openRows.filter(isMonthPending);
  const futureCount=openRows.length-late.length-pend.length;
  const sum=a=>a.reduce((n,r)=>n+Number(r.value||0),0);
  const base=payablesFilter==='late'?late:payablesFilter==='pending'?pend:[...late,...pend];
  const open=base.filter(matches).sort((a,b)=>(dueOf(a)||'9999').localeCompare(dueOf(b)||'9999'));
  const total=sum(open);
  const chip=(key,label,n)=>`<button type="button" class="filter-chip ${payablesFilter===key?'active':''}" data-pfilter="${key}">${label} (${n})</button>`;
  const emptyMsg=payablesFilter==='late'?'Nenhuma conta atrasada.':payablesFilter==='pending'?'Nenhuma conta pendente neste mês.':'Nenhuma conta atrasada ou pendente neste mês.';
  $('tableWrap').innerHTML=`<div class="filter-chips">${chip('all','Todas',late.length+pend.length)}${chip('pending','Pendentes do mês',pend.length)}${chip('late','Atrasadas',late.length)}</div>
   <div class="dashboard-metrics" style="margin-bottom:14px"><div class="dashboard-metric"><span>Atrasadas</span><strong>${money(sum(late))}</strong></div><div class="dashboard-metric"><span>Pendentes do mês</span><strong>${money(sum(pend))}</strong></div><div class="dashboard-metric"><span>Total da lista</span><strong>${money(total)}</strong></div></div>
   ${open.length?`<div class="table-scroll"><table><thead><tr><th>Vencimento</th><th>Categoria</th><th>Subcategoria</th><th>Descrição</th><th>Valor</th><th>Ações</th></tr></thead><tbody>${open.map(r=>`<tr><td>${dueOf(r)?dateBR(dueOf(r)):'Sem vencimento'}${isLate(r)?' <span class="late-badge">Atrasada</span>':''}</td><td>${esc(r.category||'—')}</td><td>${esc(r.subcategory||'—')}</td><td>${esc(r.description||'')}</td><td>${money(r.value)}</td><td><button class="action" data-pay="${r.id}">Confirmar pagamento</button> <button class="action" data-edit="${r.id}">Editar</button> <button class="action" data-delete="${r.id}">Excluir</button></td></tr>`).join('')}</tbody></table></div>`:`<div class="empty">${emptyMsg}</div>`}
   ${futureCount?`<p class="muted small">${futureCount} conta(s) com vencimento em meses futuros não aparecem nesta lista.</p>`:''}`;
  $('tableWrap').querySelectorAll('[data-pfilter]').forEach(b=>b.onclick=()=>{payablesFilter=b.dataset.pfilter;renderPayablesTable();});
  $('tableWrap').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>renderForm(open.find(r=>r.id===b.dataset.edit)));
  $('tableWrap').querySelectorAll('[data-pay]').forEach(b=>b.onclick=async()=>{
   const r=open.find(x=>x.id===b.dataset.pay);if(!r)return;
   if(!confirm(`Confirmar o pagamento de ${money(r.value)} referente a “${r.description}”?`))return;
   const method=prompt('Informe a forma de pagamento: Pix, Dinheiro, Cartão, Transferência, Débito automático ou Outro.','Pix');
   if(method===null)return;
   const allowed=expensePaymentMethods.find(x=>x.toLocaleLowerCase('pt-BR')===method.trim().toLocaleLowerCase('pt-BR'));
   if(!allowed){showToast('Forma de pagamento inválida.');return;}
   try{
    const paidDate=localISODate();
    await save('expenses',{...r,paymentStatus:'Pago',payment:allowed,date:paidDate,paidAt:paidDate});
    await closeDueNotificationsIfClear();
    showToast('Pagamento confirmado e lançado em Despesas.');
    await renderTable();await renderStats();
   }catch(err){showToast('Erro ao confirmar pagamento: '+err.message);}
  });
  $('tableWrap').querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{
   if(!confirm('Excluir esta conta a pagar?'))return;
   try{await remove('expenses',b.dataset.delete);await closeDueNotificationsIfClear();showToast('Conta excluída.');await renderTable();await renderStats();}
   catch(err){showToast('Erro ao excluir: '+err.message);}
  });
 }catch(err){$('tableWrap').innerHTML='<div class="empty">Não foi possível carregar as contas a pagar. Verifique a conexão.</div>';console.error(err);}
}

// Lançamento de serviço iniciado pela placa do veículo.
function renderServiceForm(item={}){
 // Reexibe o contêiner: renderSection o oculta ao trocar de aba.
 $('formWrap').style.display='';
 $('formWrap').classList.remove('hidden');
 editId=item.id??null;
 const initialPlate=normalizePlate(item.vehicle||'');
 const initialDate=item.date||localISODate();
 const paymentMethods=['Dinheiro','Pix','Cartão','Brinde'];
 $('formWrap').innerHTML=`
  <form id="recordForm">
   <div class="field">
    <label for="servicePlate">Placa do veículo *</label>
    <input id="servicePlate" name="plate" type="text" required maxlength="8"
     autocomplete="off" autocapitalize="characters" style="text-transform:uppercase"
     value="${esc(initialPlate)}" placeholder="Digite a placa">
   </div>
   <div class="form-actions">
    <button type="button" class="primary" id="findServiceVehicle">Buscar veículo</button>
   </div>
   <div id="serviceVehicleMessage" class="muted small">Informe a placa e toque em “Buscar veículo”.</div>
   <div id="serviceDetails" class="${item.id?'':'hidden'}">
    <div class="form-grid">
     <div class="field"><label>Proprietário</label><input name="client" id="serviceClient" readonly required></div>
     <div class="field"><label>Veículo / placa</label><input name="vehicle" id="serviceVehicle" readonly required></div>
     <div class="field"><label>Data *</label><input name="date" type="date" required value="${esc(initialDate)}"></div>
     <div class="field"><label>Serviço executado *</label><input name="service" type="text" list="serviceOptions" required value="${esc(item.service||'')}"><datalist id="serviceOptions"><option value="Lavagem simples"><option value="Ducha"><option value="Lavagem completa"><option value="Limpeza interna"></datalist></div>
     <div class="field"><label>Valor base (R$) *</label><input name="value" type="text" inputmode="decimal" required value="${esc(item.baseValue!==undefined?decimalText(item.baseValue):(item.value!==undefined?decimalText(item.value):''))}" placeholder="0,00"></div>
     <div class="field" style="grid-column:1/-1"><label>Serviços extras (opcional)</label><div id="serviceExtras"></div><button type="button" class="secondary" id="addServiceExtra">+ Adicionar extra</button><datalist id="extraOptions"><option value="Cera"><option value="Revitalização de plásticos"><option value="Higienização interna"><option value="Polimento"><option value="Limpeza de motor"><option value="Hidratação de couro"><option value="Sujeira pesada"></datalist><div class="muted small" id="serviceTotalInfo" style="margin-top:6px"></div></div>
     <div class="field"><label>Situação *</label><select name="status" id="serviceStatus" required>
      <option value="">Selecione...</option>${['Aguardando','Em andamento','Pronto para retirada','Concluído','Cancelado'].map(o=>`<option ${item.status===o?'selected':''}>${o}</option>`).join('')}
     </select></div>
     <div id="servicePaymentFields" class="form-grid ${item.status==='Concluído'?'':'hidden'}" style="grid-column:1/-1">
      <div class="field"><label>Situação financeira *</label><select name="paymentStatus" id="servicePaymentStatus">
       <option value="">Selecione...</option><option value="Recebido" ${item.paymentStatus==='Recebido'?'selected':''}>Recebido</option><option value="Pendente" ${item.paymentStatus==='Pendente'?'selected':''}>Pendente</option>
      </select></div>
      <div class="field"><label>Tipo de pagamento *</label><select name="paymentMethod" id="servicePaymentMethod">
       <option value="">Selecione...</option>${serviceMethodList(item).map(o=>`<option ${item.paymentMethod===o?'selected':''}>${o}</option>`).join('')}
      </select></div>
      <div id="serviceCreditInfo" class="muted small" style="grid-column:1/-1"></div>
      <div class="field hidden" id="splitFirstWrap"><label>Valor nesta forma (R$)</label><input id="splitValue1" inputmode="decimal" placeholder="0,00"></div>
      <div id="splitRows" style="grid-column:1/-1"></div>
      <div id="splitControls" class="hidden" style="grid-column:1/-1"><button type="button" class="secondary" id="addSplit">+ Dividir pagamento</button> <span class="muted small" id="splitRemaining"></span></div>
      <div class="field ${item.paymentStatus==='Recebido'?'':'hidden'}" id="serviceReceivedDateWrap">
       <label>Data do recebimento *</label>
       <input name="receivedDate" id="serviceReceivedDate" type="date" value="${esc(item.receivedDate||(!item.id?localISODate():''))}">
       <small class="muted">Ao marcar como recebido, a data de hoje será sugerida. Você pode alterá-la se necessário.</small>
      </div>
     </div>
     <div class="field" style="grid-column:1/-1"><label>Observações</label><textarea name="notes" rows="2">${esc(item.notes||'')}</textarea></div>
    </div>
    <div id="serviceVehicleInfo" class="muted small"></div>
    <div class="form-actions"><button type="button" class="secondary" id="cancelForm">Cancelar</button><button class="primary" type="submit">${item.id?'Salvar alterações':'Salvar serviço'}</button></div>
   </div>
  </form>`;
 $('formWrap').classList.remove('hidden');
 const form=$('recordForm'), plateInput=$('servicePlate'), details=$('serviceDetails'), message=$('serviceVehicleMessage');
 let matchedVehicle=null;
 bindDecimalInput(form.elements.value);
 const extrasBox=$('serviceExtras');
 const readExtras=()=>[...extrasBox.querySelectorAll('.extra-row')].map(r=>({description:r.querySelector('.extra-desc').value.trim(),value:decimalValue(r.querySelector('.extra-value').value)})).filter(x=>x.description||(Number.isFinite(x.value)&&x.value>0));
 const updateTotal=()=>{const base=decimalValue(form.elements.value.value);const baseOk=Number.isFinite(base)?base:0;const ex=readExtras().reduce((n,x)=>n+(Number.isFinite(x.value)?x.value:0),0);$('serviceTotalInfo').textContent=ex>0?`Base ${money(baseOk)} + extras ${money(ex)} = total do serviço ${money(baseOk+ex)}`:'';};
 const addExtraRow=(desc='',val='')=>{const row=document.createElement('div');row.className='extra-row';row.innerHTML=`<input class="extra-desc" list="extraOptions" placeholder="Ex.: cera" value="${esc(desc)}"><input class="extra-value" inputmode="decimal" placeholder="0,00" value="${esc(val)}"><button type="button" class="action extra-remove" aria-label="Remover extra">✕</button>`;extrasBox.appendChild(row);bindDecimalInput(row.querySelector('.extra-value'));row.querySelector('.extra-value').addEventListener('input',updateTotal);row.querySelector('.extra-remove').onclick=()=>{row.remove();updateTotal();};};
 (Array.isArray(item.extras)?item.extras:[]).forEach(x=>addExtraRow(x.description,decimalText(x.value)));
 $('addServiceExtra').onclick=()=>addExtraRow();
 form.elements.value.addEventListener('input',updateTotal);updateTotal();
 // Rascunho: se o sistema fechar o app em segundo plano (ex.: conferir um Pix), o lançamento é retomado.
 const saveDraft=()=>{try{const v=Object.fromEntries(new FormData(form).entries());localStorage.setItem(DRAFT_KEY,JSON.stringify({t:Date.now(),id:item.id||null,values:v,extras:[...extrasBox.querySelectorAll('.extra-row')].map(r=>({d:r.querySelector('.extra-desc').value,v:r.querySelector('.extra-value').value})),splits:rowsEls().length?{first:$('splitValue1').value,rows:rowsEls().map(r=>({m:r.querySelector('select').value,v:r.querySelector('input').value}))}:null}));}catch(e){}};
 form.addEventListener('input',saveDraft);form.addEventListener('change',saveDraft);
 $('cancelForm').addEventListener('click',clearServiceDraft);
 const statusInput=$('serviceStatus');
 const paymentFields=$('servicePaymentFields');
 function togglePaymentFields(){
  const done=statusInput.value==='Concluído';
  paymentFields.classList.toggle('hidden',!done);
  $('servicePaymentStatus').required=done;
  $('servicePaymentMethod').required=done;
  toggleReceivedDate();
 }
 function toggleReceivedDate(defaultToToday=false){
  const received=$('servicePaymentStatus').value==='Recebido';
  const wrap=$('serviceReceivedDateWrap'),dateInput=$('serviceReceivedDate');
  wrap.classList.toggle('hidden',!received);
  dateInput.required=received;
  if(received&&!dateInput.value&&defaultToToday)dateInput.value=localISODate();
  if(!received)dateInput.value='';
 }
 if(statusInput)statusInput.addEventListener('change',togglePaymentFields);
 $('servicePaymentStatus').addEventListener('change',()=>toggleReceivedDate(true));
 const updateCreditInfo=async()=>{
  const box=$('serviceCreditInfo');if(!box)return;
  const usedMethods=[$('servicePaymentMethod').value,...[...document.querySelectorAll('#splitRows .split-row select')].map(x=>x.value)];
  if(isEmployee()||!usedMethods.some(isCreditMethod)){box.textContent='';return;}
  const who=($('serviceClient').value||item.client||'').trim();
  if(!who){box.textContent='Busque o veículo para ver o crédito do cliente.';return;}
  try{const sm=creditSummary(await all('payments'),who,item.id);box.textContent=`Crédito de ${who}: saldo ${money(sm.saldo)} · ${sm.lavagens} lavagem(ns).`;}catch(e){box.textContent='';}
 };
 $('servicePaymentMethod').addEventListener('change',updateCreditInfo);updateCreditInfo();
 // ---- pagamento fracionado (ex.: parte em dinheiro e parte em Pix, ou Pix + crédito)
 const splitRowsEl=$('splitRows');
 const rowsEls=()=>[...splitRowsEl.querySelectorAll('.split-row')];
 const totalNow=()=>{const b=decimalValue(form.elements.value.value);return round2c((Number.isFinite(b)?b:0)+readExtras().reduce((n,x)=>n+(Number.isFinite(x.value)?x.value:0),0));};
 const splitLines=()=>rowsEls().length?[{method:$('servicePaymentMethod').value,value:decimalValue($('splitValue1').value)},...rowsEls().map(r=>({method:r.querySelector('select').value,value:decimalValue(r.querySelector('input').value)}))]:null;
 const fmt2=n=>Math.max(0,round2c(n)).toFixed(2);
 const refreshSplit=()=>{
  const ls=splitLines();
  $('splitFirstWrap').classList.toggle('hidden',!ls);
  $('addSplit').textContent=ls?'+ Mais uma forma':'+ Dividir pagamento';
  const rem=ls?round2c(totalNow()-ls.reduce((n,l)=>n+(Number.isFinite(l.value)?l.value:0),0)):0;
  const el=$('splitRemaining');
  el.textContent=ls?(Math.abs(rem)<0.005?`Soma confere com o total de ${money(totalNow())}.`:rem>0?`Falta distribuir ${money(rem)} (total ${money(totalNow())}).`:`Passou ${money(-rem)} do total de ${money(totalNow())}.`):'';
  el.classList.toggle('amount-out',!!ls&&Math.abs(rem)>=0.005);
 };
 const balance=src=>{
  const rows=rowsEls();if(rows.length!==1)return;
  const v1=$('splitValue1'),v2=rows[0].querySelector('input');
  if(src===v1)v2.value=fmt2(totalNow()-decimalValue(v1.value));else if(src===v2)v1.value=fmt2(totalNow()-decimalValue(v2.value));
 };
 const addSplitRow=(method='',value='')=>{
  const row=document.createElement('div');row.className='split-row';
  row.innerHTML=`<select aria-label="Forma de pagamento"><option value="">Forma...</option>${serviceMethodList(item).filter(m=>m!=='Brinde').map(m=>`<option ${m===method?'selected':''}>${esc(m)}</option>`).join('')}</select><input inputmode="decimal" placeholder="0,00" value="${esc(value)}"><button type="button" class="action split-remove" aria-label="Remover forma">✕</button>`;
  splitRowsEl.appendChild(row);
  const inp=row.querySelector('input');bindDecimalInput(inp);
  inp.addEventListener('input',()=>{balance(inp);refreshSplit();});
  row.querySelector('select').addEventListener('change',()=>{refreshSplit();updateCreditInfo();});
  row.querySelector('.split-remove').onclick=()=>{row.remove();if(!rowsEls().length)$('splitValue1').value='';refreshSplit();};
  refreshSplit();
 };
 bindDecimalInput($('splitValue1'));
 $('splitValue1').addEventListener('input',()=>{balance($('splitValue1'));refreshSplit();});
 $('addSplit').onclick=()=>{
  if(!rowsEls().length){$('splitValue1').value=fmt2(totalNow());addSplitRow('','0.00');}
  else addSplitRow('',fmt2(totalNow()-splitLines().reduce((n,l)=>n+(Number.isFinite(l.value)?l.value:0),0)));
  refreshSplit();
 };
 const syncSplitVisibility=()=>{
  const ok=statusInput.value==='Concluído'&&$('servicePaymentStatus').value==='Recebido'&&$('servicePaymentMethod').value!=='Brinde';
  $('splitControls').classList.toggle('hidden',!ok);
  if(!ok&&rowsEls().length){splitRowsEl.innerHTML='';$('splitValue1').value='';refreshSplit();}
 };
 statusInput.addEventListener('change',syncSplitVisibility);$('servicePaymentStatus').addEventListener('change',syncSplitVisibility);$('servicePaymentMethod').addEventListener('change',syncSplitVisibility);
 const onTotalChange=()=>{const rows=rowsEls();if(rows.length===1){const v1=decimalValue($('splitValue1').value);rows[0].querySelector('input').value=fmt2(totalNow()-(Number.isFinite(v1)?v1:0));}refreshSplit();};
 form.elements.value.addEventListener('input',onTotalChange);extrasBox.addEventListener('input',onTotalChange);
 if(Array.isArray(item.paymentSplits)&&item.paymentSplits.length>1){
  $('servicePaymentMethod').value=item.paymentSplits[0].method;$('splitValue1').value=decimalText(item.paymentSplits[0].value);
  item.paymentSplits.slice(1).forEach(l=>addSplitRow(l.method,decimalText(l.value)));
 }
 syncSplitVisibility();refreshSplit();
 togglePaymentFields();
 plateInput.addEventListener('input',()=>{
  const start=plateInput.selectionStart; plateInput.value=normalizePlate(plateInput.value);
  try{plateInput.setSelectionRange(start,start)}catch(e){}
  matchedVehicle=null; details.classList.add('hidden');
  message.textContent='Toque em “Buscar veículo” para localizar o cadastro.';
 });
 async function findVehicle(){
  const plate=normalizePlate(plateInput.value); plateInput.value=plate;
  if(!plate){showToast('Informe a placa do veículo.');plateInput.focus();return;}
  const button=$('findServiceVehicle');button.disabled=true;message.textContent='Buscando veículo na nuvem...';
  try{
   const [vehicles,clients]=await Promise.all([all('vehicles'),all('clients')]);
   matchedVehicle=vehicles.find(v=>normalizePlate(v.plate)===plate)||null;
   if(!matchedVehicle){
    details.classList.add('hidden');message.textContent='Veículo não cadastrado.';
    if(confirm(`A placa ${plate} não está cadastrada. Deseja cadastrar o cliente e o veículo agora?`)){
     returnToServicesAfterVehicleRegistration=true;editId=null;$('formWrap').classList.add('hidden');active='clients';renderTabs();renderSection();renderClientVehicleForm({plate});
    }
    return;
   }
   const client=clients.find(c=>c.id===matchedVehicle.clientId)||clients.find(c=>c.name===matchedVehicle.client)||{name:matchedVehicle.client||''};
   if(!client.name){showToast('Veículo localizado, mas sem proprietário vinculado. Verifique o cadastro.');details.classList.add('hidden');return;}
   $('serviceClient').value=client.name;$('serviceVehicle').value=plate;
   $('serviceVehicleInfo').textContent=[matchedVehicle.brand,matchedVehicle.model,matchedVehicle.type,matchedVehicle.color].filter(Boolean).join(' • ');
   details.classList.remove('hidden');message.textContent=`Veículo localizado: ${plate}. Dados preenchidos.`;
  }catch(err){matchedVehicle=null;details.classList.add('hidden');message.textContent='Não foi possível consultar a placa. Verifique a conexão.';console.error('Erro ao buscar veículo pela placa:',err);}
  finally{button.disabled=false;}
 }
 $('findServiceVehicle').onclick=findVehicle;
 $('cancelForm').onclick=()=>{$('formWrap').classList.add('hidden');editId=null;};
 if(item.id&&/^AAA[0-9]{4}$/.test(initialPlate)){matchedVehicle={plate:initialPlate,client:item.client||''};$('serviceClient').value=item.client||'';$('serviceVehicle').value=initialPlate;$('serviceVehicleInfo').textContent='Registro histórico: placa não anotada no atendimento. Não há veículo cadastrado para esta identificação.';details.classList.remove('hidden');message.textContent='Serviço histórico sem placa real; o registro será preservado.';}else if(item.id||initialPlate)findVehicle();
 form.onsubmit=async e=>{
  e.preventDefault();
  if(!matchedVehicle){showToast('Localize um veículo cadastrado antes de salvar o serviço.');return;}
  const submit=form.querySelector('[type=submit]');submit.disabled=true;
  try{
   const data=Object.fromEntries(new FormData(form).entries());
   const baseValue=decimalValue(data.value);
   if(!Number.isFinite(baseValue)||baseValue<0)throw new Error('Informe um valor base válido.');
   const extras=readExtras().map(x=>({description:x.description,value:Number.isFinite(x.value)?x.value:0}));
   if(extras.some(x=>!x.description||x.value<=0))throw new Error('Preencha a descrição e o valor de cada extra (ou remova a linha).');
   const extrasTotal=Math.round(extras.reduce((n,x)=>n+x.value,0)*100)/100;
   data.baseValue=baseValue;data.extras=extras;data.extrasTotal=extrasTotal;
   data.value=Math.round((baseValue+extrasTotal)*100)/100; // valor total: é o que alimenta o financeiro
   data.vehicle=normalizePlate(data.vehicle);
   if(isEmployee())data.financeSyncPending=true;
   const sl=splitLines();
   if(sl){
    if(sl.some(l=>!l.method))throw new Error('Escolha a forma de pagamento de cada parte.');
    if(sl.some(l=>!Number.isFinite(l.value)||l.value<=0))throw new Error('Informe um valor maior que zero em cada forma de pagamento.');
    const diff=round2c(data.value-sl.reduce((n,l)=>n+l.value,0));
    if(Math.abs(diff)>=0.005)throw new Error(`A soma das formas de pagamento precisa ser igual ao valor do serviço (${money(data.value)}). ${diff>0?'Faltam '+money(diff):'Passou '+money(-diff)}.`);
    data.paymentSplits=sl.map(l=>({method:l.method,value:round2c(l.value)}));
    data.paymentMethod=data.paymentSplits.map(l=>l.method).join(' + ');
   }
   const payLines=sl||[{method:data.paymentMethod,value:data.value}];
   if(!isEmployee()&&data.status==='Concluído'&&data.paymentStatus==='Recebido'){
    const needSaldo=round2c(payLines.filter(l=>l.method===CREDIT_METHODS.saldo).reduce((n,l)=>n+l.value,0)),needWash=payLines.filter(l=>l.method===CREDIT_METHODS.lavagem).length;
    if(needSaldo>0||needWash>0){
     const sm=creditSummary(await all('payments'),data.client,item.id);
     if(needSaldo>0&&sm.saldo<needSaldo&&!confirm(`Saldo insuficiente: ${money(sm.saldo)} disponível para ${money(needSaldo)} em crédito. O saldo do cliente ficará negativo. Continuar mesmo assim?`))throw new Error('Escolha outra forma de pagamento ou registre uma recarga antes.');
     if(needWash>0&&sm.lavagens<needWash&&!confirm('Este cliente não tem lavagens pré-pagas suficientes. Continuar mesmo assim?'))throw new Error('Escolha outra forma de pagamento ou registre um pacote antes.');
    }
   }
   if(data.status==='Concluído'){
    if(!data.paymentStatus||!data.paymentMethod)throw new Error('Informe se foi recebido ou pendente e o tipo de pagamento.');
    if(data.paymentStatus==='Recebido'){
     if(!data.receivedDate)throw new Error('Informe a data em que o pagamento foi recebido.');
    }else delete data.receivedDate;
   }else{delete data.paymentStatus;delete data.paymentMethod;delete data.receivedDate;}
   if(editId)data.id=editId;else data.createdAt=new Date().toISOString();
   const saved=await save('services',data);
   if(isEmployee()){/* sem acesso ao financeiro: o dono concilia depois */}
   else if(saved.status==='Concluído')await syncServicePayment(saved);
   else await cancelLinkedServicePayment(saved.id);
   clearServiceDraft();editId=null;showToast('Serviço salvo na nuvem.');
   if(saved.status===READY_STATUS)await showReadyNotice(saved);else $('formWrap').classList.add('hidden');
   await renderTable();if(!isEmployee()){await renderStats();await renderFinancialMovement();}
  }catch(err){showToast('Não foi possível salvar: '+(err.message||'verifique a conexão.'));}
  finally{submit.disabled=false;}
 };
}

function serviceLines(service){
 if(Array.isArray(service.paymentSplits)&&service.paymentSplits.length>1&&service.paymentStatus==='Recebido')return service.paymentSplits.map(l=>({method:l.method||'',value:Number(l.value||0)}));
 return [{method:service.paymentMethod||'',value:Number(service.value||0)}];
}
async function syncServicePayment(service){
 const payments=await all('payments');
 const existing=payments.filter(p=>p.serviceId===service.id).sort((x,y)=>(x.splitIndex||0)-(y.splitIndex||0)||String(x.createdAt||'').localeCompare(String(y.createdAt||'')));
 const lines=serviceLines(service);
 // Uma linha de pagamento por forma usada (pagamento fracionado). Sem divisão, continua sendo um único pagamento.
 for(let i=0;i<lines.length;i++){
  const {method,value}=lines[i];
  const status=method==='Brinde'?'Brinde':service.paymentStatus==='Recebido'?(isCreditMethod(method)?'Crédito':'Pago'):'Pendente';
  // A data do serviço e a data do recebimento são eventos diferentes.
  const paymentDate=(status==='Pago'||status==='Crédito')?(service.receivedDate||localISODate()):service.date;
  const payment={
   ...(existing[i]?{id:existing[i].id}:{}),
   serviceId:service.id,splitIndex:i,date:paymentDate,client:service.client,
   description:`Serviço ${service.service||''} - ${service.vehicle||''}${lines.length>1?` (parte ${i+1}/${lines.length})`:''}`,
   method,value,status,
   ...feeFields(method,value,status),
   notes:service.notes||''
  };
  await save('payments',payment);
 }
 for(const extra of existing.slice(lines.length))await remove('payments',extra.id);
}

async function cancelLinkedServicePayment(serviceId){
 const payments=await all('payments');
 for(const linked of payments.filter(p=>p.serviceId===serviceId&&p.status!=='Estornado')){linked.status='Estornado';await save('payments',linked);}
}

async function renderAppointmentForm(item={}){
 editId=item.id??null;
 let linkedService=null;
 if(item.id){
  try{linkedService=(await all('services')).find(s=>s.appointmentId===item.id)||null;}
  catch(err){console.error('Não foi possível localizar serviço vinculado:',err);}
 }
 const initialStatus=item.status||'Agendado';
 $('formWrap').innerHTML=`
  <form id="recordForm">
   <div class="form-grid">
    <div class="field"><label>Data *</label><input name="date" type="date" required value="${esc(item.date||localISODate())}"></div>
    <div class="field"><label>Horário *</label><input name="time" type="time" required value="${esc(item.time||'')}"></div>
    <div class="field"><label>Cliente *</label><input name="client" type="text" required value="${esc(item.client||'')}"></div>
    <div class="field"><label>Veículo / placa *</label><input name="vehicle" type="text" required value="${esc(item.vehicle||'')}" style="text-transform:uppercase" autocapitalize="characters"></div>
    <div class="field"><label>Serviço solicitado *</label><input name="service" type="text" list="serviceOptions" required value="${esc(item.service||'')}"><datalist id="serviceOptions"><option value="Lavagem simples"><option value="Ducha"><option value="Lavagem completa"><option value="Limpeza interna"></datalist></div>
    <div class="field"><label>Situação *</label><select name="status" id="appointmentStatus" required>
     ${['Agendado','Confirmado','Concluído','Cancelado'].map(o=>`<option ${initialStatus===o?'selected':''}>${o}</option>`).join('')}
    </select></div>
    <div id="appointmentValueField" class="field ${initialStatus==='Confirmado'?'':'hidden'}" style="grid-column:1/-1">
     <label>Valor combinado (R$) *</label><input name="value" id="appointmentValue" type="text" inputmode="decimal" value="${esc(linkedService?decimalText(linkedService.value):item.value!==undefined?decimalText(item.value):'')}" placeholder="0,00" ${initialStatus==='Confirmado'?'required':''}>
     <small>Ao salvar como Confirmado, o serviço será criado automaticamente em Serviços, com situação Em andamento.</small>
    </div>
    <div class="field" style="grid-column:1/-1"><label>Observações</label><textarea name="notes" rows="2">${esc(item.notes||'')}</textarea></div>
   </div>
   <div class="form-actions"><button type="button" class="secondary" id="cancelForm">Cancelar</button><button class="primary" type="submit">${item.id?'Salvar alterações':'Salvar agendamento'}</button></div>
  </form>`;
 $('formWrap').classList.remove('hidden');
 const form=$('recordForm'), statusField=$('appointmentStatus'), valueField=$('appointmentValueField'), valueInput=$('appointmentValue');
 bindDecimalInput(valueInput);
 statusField.onchange=()=>{
  const confirmed=statusField.value==='Confirmado';
  valueField.classList.toggle('hidden',!confirmed);valueInput.required=confirmed;
 };
 $('cancelForm').onclick=()=>{$('formWrap').classList.add('hidden');editId=null;};
 form.onsubmit=async e=>{
  e.preventDefault();const submit=form.querySelector('[type=submit]');submit.disabled=true;
  try{
   const data=Object.fromEntries(new FormData(form).entries());
   data.vehicle=normalizePlate(data.vehicle);
   if(data.status==='Confirmado'){
    data.value=decimalValue(data.value);
    if(!Number.isFinite(data.value)||data.value<0)throw new Error('Informe um valor válido para confirmar o serviço.');
   }else delete data.value;
   if(editId)data.id=editId;else data.createdAt=new Date().toISOString();
   const savedAppointment=await save('appointments',data);
   if(savedAppointment.status==='Confirmado'){
    const services=await all('services');
    const existing=services.find(s=>s.appointmentId===savedAppointment.id)||null;
    const serviceData={
     ...(existing?{id:existing.id}:{}),appointmentId:savedAppointment.id,
     date:savedAppointment.date,client:savedAppointment.client,
     vehicle:normalizePlate(savedAppointment.vehicle),service:savedAppointment.service,
     value:Number(savedAppointment.value||0),status:existing?.status==='Concluído'?'Concluído':'Em andamento',
     notes:savedAppointment.notes||existing?.notes||'',
     ...(existing?.paymentStatus?{paymentStatus:existing.paymentStatus}:{}),
     ...(existing?.paymentMethod?{paymentMethod:existing.paymentMethod}:{})
    };
    const savedService=await save('services',serviceData);
    if(savedService.status==='Concluído')await syncServicePayment(savedService);
    showToast(existing?'Serviço vinculado atualizado.':'Agendamento confirmado e serviço criado em Serviços.');
   }else showToast('Agendamento salvo na nuvem.');
   $('formWrap').classList.add('hidden');editId=null;await renderTable();await renderStats();
  }catch(err){showToast('Não foi possível salvar: '+(err.message||'verifique a conexão.'));}
  finally{submit.disabled=false;}
 };
}

// Padroniza a placa para comparação e armazenamento.
function normalizePlate(value){
 return String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
}

function renderClientVehicleForm(vehicle={}){
 editId=vehicle.clientId||null;
 editingVehicleId=vehicle.id||null;

 const clientFields=[
  ['name','Nome completo','text',true],
  ['phone','Telefone / WhatsApp','tel',false],
  ['registrationDate','Data de cadastramento','date',false],
  ['email','E-mail','email',false],
  ['document','CPF / CNPJ','text',false],
  ['address','Endereço','text',false],
  ['clientNotes','Observações do cliente','textarea',false]
 ];

 const vehicleFields=[
  ['plate','Placa','text',true],
  ['type','Tipo de veículo','select',true,['Carro','SUV','Utilitário','Moto','Camionete','Caminhão 3/4','Caminhão','Carreta','Ônibus','Outro']],
  ['brand','Marca','text',false],
  ['model','Modelo','text',false],
  ['color','Cor','text',false],
  ['vehicleNotes','Observações do veículo','textarea',false]
 ];

 const currentClient=vehicle.clientRecord||{};

 const fieldHtml=fields=>fields.map(([key,label,type,required,opts])=>{
  const value=
   key==='clientNotes'?(currentClient.notes||''):
   key==='vehicleNotes'?(vehicle.notes||''):
   key==='name'?(currentClient.name||vehicle.client||''):
   key==='registrationDate'?(currentClient.registrationDate||(vehicle.clientId?'':localISODate())):
   key==='plate'?(vehicle.plate||''):
   currentClient[key]??vehicle[key]??'';

  let input='';

  if(type==='select'){
   input=`<select name="${key}" ${required?'required':''}><option value="">Selecione...</option>${opts.map(o=>`<option ${value===o?'selected':''}>${esc(o)}</option>`).join('')}</select>`;
  }else if(type==='textarea'){
   input=`<textarea name="${key}" rows="2">${esc(value)}</textarea>`;
  }else{
   input=`<input name="${key}" type="${type}" ${required?'required':''} value="${esc(key==='plate'?String(value).toUpperCase():value)}" ${key==='plate'?'maxlength="8" autocapitalize="characters" style="text-transform:uppercase"':''}>`;
  }

  return `<div class="field"><label>${esc(label)}${required?' *':''}</label>${input}</div>`;
 }).join('');

 $('formWrap').innerHTML=`
 <form id="recordForm">
  <h3>Dados do cliente</h3>
  <div class="form-grid">${fieldHtml(clientFields)}</div>
  <h3>Dados do veículo</h3>
  <div class="form-grid">${fieldHtml(vehicleFields)}</div>
  <p class="muted small">A placa será registrada em letras maiúsculas e não poderá ser duplicada.</p>
  <div class="form-actions">
   <button type="button" class="secondary" id="cancelForm">Cancelar</button>
   <button class="primary" type="submit">${vehicle.id?'Salvar alterações':'Salvar cadastro'}</button>
  </div>
 </form>`;

 $('formWrap').classList.remove('hidden');

 const plateInput=$('recordForm').elements.plate;

 // Converte as letras automaticamente enquanto o usuário digita.
 plateInput.addEventListener('input',()=>{
  const start=plateInput.selectionStart;
  plateInput.value=plateInput.value.toUpperCase().replace(/[^A-Z0-9]/g,'');
  try{plateInput.setSelectionRange(start,start)}catch(e){}
 });

 $('cancelForm').onclick=()=>{
  $('formWrap').classList.add('hidden');
  editId=null;
  editingVehicleId=null;
  returnToServicesAfterVehicleRegistration=false;
 };

 $('recordForm').onsubmit=async e=>{
  e.preventDefault();

  const submit=e.target.querySelector('[type=submit]');
  submit.disabled=true;

  try{
   const d=Object.fromEntries(new FormData(e.target).entries());
   const plate=normalizePlate(d.plate);

   if(!plate)throw new Error('Informe a placa do veículo.');

   // Procura uma placa igual, mesmo que tenha sido salva com outra formatação.
   const vehicles=await all('vehicles');

   const duplicate=vehicles.find(v=>
    normalizePlate(v.plate)===plate &&
    v.id!==editingVehicleId
   );

   // Se a placa já existe, pergunta como proceder.
   if(duplicate){
    const oldOwner=duplicate.client||'não identificado';

    const keep=confirm(
     `ATENÇÃO: a placa ${plate} já está cadastrada para ${oldOwner}.\n\n`+
     `OK: manter o proprietário atual.\n`+
     `Cancelar: informar mudança de proprietário.`
    );

    if(keep){
     $('formWrap').classList.add('hidden');
     editId=null;
     editingVehicleId=null;
     showToast('Cadastro existente mantido. O histórico da placa foi preservado.');

     if(returnToServicesAfterVehicleRegistration){
      returnToServicesAfterVehicleRegistration=false;
      active='services';
      renderTabs();
      renderSection();
      renderServiceForm({vehicle:plate});
     }else{
      await renderTable();
     }
     await renderStats();
     return;
    }

    const change=confirm(
     `Confirma alterar o proprietário da placa ${plate} para ${d.name}?\n\n`+
     `Os serviços anteriores serão mantidos no histórico.`
    );

    if(!change)return;
   }

   const clients=await all('clients');
   let client=editId?clients.find(c=>c.id===editId):null;

   // Tenta localizar um cliente já cadastrado para evitar duplicação.
   if(!client){
    const doc=String(d.document||'').replace(/\D/g,'');
    const phone=String(d.phone||'').replace(/\D/g,'');

    client=clients.find(c=>
     (doc&&String(c.document||'').replace(/\D/g,'')===doc) ||
     (phone&&String(c.phone||'').replace(/\D/g,'')===phone)
    );
    if(!client){
     const sameName=clients.find(c=>sameClient(c.name,d.name));
     if(sameName&&confirm(`Já existe um cliente chamado “${sameName.name}”.\n\nOK: usar o cadastro existente (evita duplicar).\nCancelar: criar um novo cadastro mesmo assim.`))client=sameName;
    }
   }

   const clientData={
    name:d.name.trim(),
    phone:d.phone,
    registrationDate:d.registrationDate||currentClient.registrationDate||'',
    email:d.email,
    document:d.document,
    address:d.address,
    notes:d.clientNotes||''
   };

   if(client){
    const oldName=client.name;
    await save('clients',{...client,...clientData});
    if(!sameClient(oldName,clientData.name))await cascadeClientRename(client.id,oldName,clientData.name);
   }else{
    client=await save('clients',clientData);
   }

   const vehicleData={
    client:clientData.name,
    clientId:client.id,
    plate:plate,
    type:d.type,
    brand:d.brand,
    model:d.model,
    color:d.color,
    notes:d.vehicleNotes||''
   };

   if(duplicate){
    // Atualiza o vínculo do proprietário sem apagar o histórico do veículo.
    await save('vehicles',{
     ...duplicate,
     ...vehicleData,
     id:duplicate.id
    });
   }else if(editingVehicleId){
    const existingVehicle=vehicles.find(v=>v.id===editingVehicleId);

    await save('vehicles',{
     ...existingVehicle,
     ...vehicleData,
     id:editingVehicleId
    });
    if(existingVehicle&&normalizePlate(existingVehicle.plate)!==plate)await cascadePlateChange(existingVehicle.plate,plate);
   }else{
    await save('vehicles',vehicleData);
   }

   $('formWrap').classList.add('hidden');
   editId=null;
   editingVehicleId=null;

   showToast('Cliente e veículo salvos na nuvem.');

   if(returnToServicesAfterVehicleRegistration){
    returnToServicesAfterVehicleRegistration=false;
    active='services';
    renderTabs();
    renderSection();
    renderServiceForm({vehicle:plate});
   }else{
    await renderTable();
   }

   await renderStats();

  }catch(err){
   showToast('Não foi possível salvar: '+(err.message||'verifique a conexão.'));
  }finally{
   submit.disabled=false;
  }
 };
}

async function renderClientVehicleTable(){
 try{
  const [clients,vehicles]=await Promise.all([
   all('clients'),
   all('vehicles')
  ]);

  const q=$('searchInput').value.trim().toLocaleLowerCase('pt-BR');

  const rows=vehicles.map(v=>({
   ...v,
   clientRecord:
    clients.find(c=>c.id===v.clientId)||
    clients.find(c=>c.name===v.client)||
    {name:v.client||''}
  })).filter(v=>
   !q||[
    v.plate,
    v.client,
    v.type,
    v.brand,
    v.model,
    v.color,
    v.clientRecord.name,
    v.clientRecord.phone
   ].some(x=>String(x||'').toLocaleLowerCase('pt-BR').includes(q))
  );

  if(!rows.length){
   $('tableWrap').innerHTML=`<div class="empty">${vehicles.length?'Nenhum resultado para esta busca.':'Ainda não há cadastros. Toque em “+ Novo cadastro” para começar.'}</div>`;
   return;
  }

  $('tableWrap').innerHTML=`
  <table>
   <thead>
    <tr>
     <th>Placa</th>
     <th>Cliente</th>
     <th>Telefone</th>
     <th>Veículo</th>
     <th>Ações</th>
    </tr>
   </thead>
   <tbody>
    ${rows.map(v=>`
     <tr>
      <td><strong>${esc(normalizePlate(v.plate))}</strong></td>
      <td>${esc(v.clientRecord.name||v.client||'—')}</td>
      <td>${esc(v.clientRecord.phone||'—')}</td>
      <td>${esc([v.brand,v.model,v.type].filter(Boolean).join(' ')||'—')}</td>
      <td><button class="action" data-edit="${v.id}">Editar</button></td>
     </tr>
    `).join('')}
   </tbody>
  </table>`;

  $('tableWrap').querySelectorAll('[data-edit]').forEach(b=>
   b.onclick=()=>renderClientVehicleForm(rows.find(v=>v.id===b.dataset.edit))
  );

 }catch(err){
  $('tableWrap').innerHTML='<div class="empty">Não foi possível carregar clientes e veículos. Verifique a conexão.</div>';
  console.error(err);
 }
}

async function renderTable(){
 if(active==='dashboard'){
  await renderDashboards();
  return;
 }
 if(active==='clients'){
  await renderClientVehicleTable();
  return;
 }
 if(active==='payables'){await renderPayablesTable();return;}
 if(active==='payments'){await renderFinancePanel();return;}
 if(active==='retorno'){await renderReturnPanel();return;}
 if(active==='services'){await renderServicesPanel();return;}
 if(active==='credits'){await renderCreditsPanel();return;}
 if(active==='expenses'){await renderExpensesPanel();return;}

 const m=modules[active];

 try{
  const rows=await all(m.store);
  rows.sort((a,b)=>String(b.date||b.dueDate||'').localeCompare(String(a.date||a.dueDate||'')));
  const q=$('searchInput').value.trim().toLocaleLowerCase('pt-BR');

  const visibleRows=active==='expenses'?rows.filter(r=>r.paymentStatus!=='Em aberto'&&r.paymentStatus!=='Pendente'):rows;
  const filtered=visibleRows.filter(r=>
   !q||Object.values(r).some(v=>
    String(v??'').toLocaleLowerCase('pt-BR').includes(q)
   )
  );

  if(!filtered.length){
   $('tableWrap').innerHTML=`<div class="empty">${rows.length?(active==='expenses'?'Não há despesas pagas nesta lista. Contas em aberto ficam na aba “Contas a pagar”.':'Nenhum resultado para esta busca.'):'Ainda não há registros aqui.\nToque em “+ Novo cadastro” para começar.'}</div>`;
   return;
  }

  const readyLinks=active==='services'?await buildReadyLinks(filtered.slice(0,200)):new Map();
  $('tableWrap').innerHTML=`
  <table>
   <thead>
    <tr>${m.columns.map(c=>`<th>${c[1]}</th>`).join('')}
    <th>Ações</th></tr>
   </thead>
   <tbody>
    ${filtered.slice(0,200).map(r=>`
     <tr>
      ${m.columns.map(([k])=>`<td>${esc(k==='date'?dateBR(r[k]):k==='value'?money(r[k]):k==='service'&&Array.isArray(r.extras)&&r.extras.length?`${r.service} (+ ${r.extras.map(x=>x.description).join(', ')})`:r[k]??'—')}</td>`).join('')}
      <td>
       <button class="action" data-edit="${r.id}">Editar</button>
       ${readyLinks.get(r.id)?`<a class="action wa-small" target="_blank" rel="noopener" href="${readyLinks.get(r.id)}">Avisar cliente</a>`:''}
       <button class="action" data-delete="${r.id}">Excluir</button>
      </td>
     </tr>
    `).join('')}
   </tbody>
  </table>${filtered.length>200?`<p class="muted small">Mostrando os 200 registros mais recentes de ${filtered.length}. Use a busca para localizar os demais.</p>`:''}`;

  $('tableWrap').querySelectorAll('[data-edit]').forEach(b=>
   b.onclick=()=>renderForm(filtered.find(r=>r.id===b.dataset.edit))
  );

  $('tableWrap').querySelectorAll('[data-delete]').forEach(b=>
   b.onclick=async()=>{
    if(confirm('Deseja realmente excluir este registro da nuvem?')){
     try{
      if(active==='services')await cancelLinkedServicePayment(b.dataset.delete);
      await remove(m.store,b.dataset.delete);
      showToast('Registro excluído.');
      await renderTable();
      await renderStats();
     }catch(err){
      showToast('Erro ao excluir: '+err.message);
     }
    }
   }
  );

 }catch(err){
  $('tableWrap').innerHTML='<div class="empty">Não foi possível carregar os dados.\nVerifique sua conexão e configuração do banco.</div>';
  console.error(err);
 }
}


function dashboardLineChart(months,series){
 const width=640;
 const height=245;
 const left=42;
 const right=15;
 const top=18;
 const bottom=38;

 const max=Math.max(
  1,
  ...series.flatMap(s=>s.values)
 );

 const chartHeight=height-top-bottom;
 const chartWidth=width-left-right;

 const x=i=>left+
  (months.length<=1?0:i*chartWidth/(months.length-1));

 const y=value=>top+
  chartHeight-(value/max)*chartHeight;

 let grid='';

 for(let i=0;i<=4;i++){
  const gy=top+i*chartHeight/4;
  grid+=`
   <line x1="${left}" y1="${gy}" x2="${width-right}" y2="${gy}"
    stroke="#e1e3e6" stroke-width="1"/>
  `;
 }

 const labels=months.map((m,i)=>`
  <text x="${x(i)}" y="${height-10}"
   text-anchor="middle" font-size="11" fill="#69717c">
   ${esc(m.short)}
  </text>
 `).join('');

 const lines=series.map(s=>{
  const points=s.values.map((v,i)=>`${x(i)},${y(v)}`).join(' ');

  const dots=s.values.map((v,i)=>`
   <circle cx="${x(i)}" cy="${y(v)}" r="3.5"
    fill="${s.color}"/>
  `).join('');

  return `
   <polyline points="${points}" fill="none"
    stroke="${s.color}" stroke-width="3"
    stroke-linecap="round" stroke-linejoin="round"/>
   ${dots}
  `;
 }).join('');

 return `
  <svg viewBox="0 0 ${width} ${height}"
   role="img" aria-label="Gráfico de evolução mensal">
   ${grid}
   ${lines}
   ${labels}
  </svg>
 `;
}

function dashboardBars(months,values){
 const max=Math.max(1,...values);
 return `
  <div class="dashboard-bars">
   ${months.map((m,i)=>{
    const height=Math.max(2,values[i]/max*100);
    return `
     <div class="dashboard-bar-item">
      <div class="dashboard-bar-value">${values[i]}</div>
      <div class="dashboard-bar-track">
       <div class="dashboard-bar-fill" style="height:${height}%"></div>
      </div>
      <div class="dashboard-bar-label">${esc(m.short)}</div>
     </div>
    `;
   }).join('')}
  </div>
 `;
}

function dashboardVariation(current,previous){
 if(previous===0){
  return current===0?'Sem variação':'Novo';
 }

 const variation=((current-previous)/previous)*100;
 const signal=variation>0?'+':'';

 return signal+variation.toLocaleString('pt-BR',{
  maximumFractionDigits:1
 })+'%';
}

async function renderDashboards(){
 const target=$('tableWrap');

 target.innerHTML=`
  <div class="dashboard-loading">
   Carregando indicadores da nuvem...
  </div>
 `;

 try{
  const [services,payments,allExpenses]=await Promise.all([
   all('services'),
   all('payments'),
   all('expenses')
  ]);
  const expenses=allExpenses.filter(e=>e.paymentStatus!=='Em aberto'&&e.paymentStatus!=='Pendente');

  const now=new Date();

  const currentMonth=
   now.getFullYear()+'-'+
   String(now.getMonth()+1).padStart(2,'0');

  const months=[];

  for(let i=11;i>=0;i--){
   const d=new Date(
    now.getFullYear(),
    now.getMonth()-i,
    1
   );

   const key=
    d.getFullYear()+'-'+
    String(d.getMonth()+1).padStart(2,'0');

   months.push({
    key,
    short:d.toLocaleDateString('pt-BR',{
     month:'short'
    }).replace('.',''),
    label:d.toLocaleDateString('pt-BR',{
     month:'long',
     year:'numeric'
    })
   });
  }

  const monthly=months.map(m=>{
   const revenue=services
    .filter(s=>s.status==='Concluído' && s.date && s.date.slice(0,7)===m.key)
    .reduce((sum,s)=>sum+Number(s.value||0),0)
    +payments.filter(p=>!p.serviceId && p.kind!=='credito' && p.status==='Pago' && p.date && p.date.slice(0,7)===m.key)
     .reduce((sum,p)=>sum+Number(p.value||0),0);
   const received=payments.filter(p=>p.status==='Pago' && p.date && p.date.slice(0,7)===m.key)
    .reduce((sum,p)=>sum+Number(p.value||0),0);
   const pending=payments.filter(p=>p.status==='Pendente' && p.date && p.date.slice(0,7)===m.key)
    .reduce((sum,p)=>sum+Number(p.value||0),0);

   const spent=expenses
    .filter(e=>
     e.date &&
     e.date.slice(0,7)===m.key
    )
    .reduce((sum,e)=>sum+Number(e.value||0),0);

   const completed=services.filter(s=>
    s.status==='Concluído' &&
    s.date &&
    s.date.slice(0,7)===m.key
   ).length;

   return {
    ...m,
    revenue,
    received,
    pending,
    spent,
    balance:received-spent,
    completed
   };
  });

  const current=monthly[11];
  const previous=monthly[10];

  const expensePercent=current.revenue>0
   ?current.spent/current.revenue*100
   :null;

  const rangeMonths=monthly.slice(-dashboardChartRange);

  const cards=[
   {
    label:'Faturamento do mês',
    value:money(current.revenue),
    variation:dashboardVariation(
     current.revenue,previous.revenue
    ),
    description:'Comparado ao mês anterior'
   },
   {
    label:'Recebido no mês',
    value:money(current.received),
    variation:'',
    description:'Pagamentos efetivamente recebidos'
   },
   {
    label:'Valores pendentes',
    value:money(current.pending),
    variation:'',
    description:'Serviços ainda não recebidos'
   },
   {
    label:'Despesas do mês',
    value:money(current.spent),
    variation:dashboardVariation(
     current.spent,previous.spent
    ),
    description:'Comparado ao mês anterior'
   },
   {
    label:'Saldo do mês',
    value:money(current.balance),
    variation:dashboardVariation(
     current.balance,previous.balance
    ),
    description:'Recebimentos efetivos menos despesas pagas'
   },
   {
    label:'Despesas / faturamento',
    value:expensePercent===null
     ?'Sem faturamento'
     :expensePercent.toLocaleString('pt-BR',{
       maximumFractionDigits:1
      })+'%',
    variation:'',
    description:'Percentual das despesas sobre a receita'
   }
  ];

  const revenueExpenseChart=dashboardLineChart(
   rangeMonths,
   [
    {
     name:'Faturamento',
     color:'#d71920',
     values:rangeMonths.map(m=>m.revenue)
    },
    {
     name:'Recebido',
     color:'#16794a',
     values:rangeMonths.map(m=>m.received)
    },
    {
     name:'Despesas',
     color:'#292929',
     values:rangeMonths.map(m=>m.spent)
    }
   ]
  );

  const servicesChart=dashboardBars(
   rangeMonths,
   rangeMonths.map(m=>m.completed)
  );

  target.innerHTML=`
   <div class="dashboard-content">

    <div class="dashboard-period-note">
     <strong>Visão geral: ${esc(current.label)}</strong>
     <span>O mês atual ainda está em andamento.</span>
    </div>

    <div class="dashboard-metrics">
     ${cards.map(c=>`
      <div class="dashboard-metric">
       <span>${esc(c.label)}</span>
       <strong>${esc(c.value)}</strong>
       ${c.variation?`<b>${esc(c.variation)}</b>`:''}
       <small>${esc(c.description)}</small>
      </div>
     `).join('')}
    </div>

    <div class="dashboard-chart-panel">
     <div class="dashboard-chart-head">
      <div>
       <h3>Evolução financeira</h3>
       <p>Faturamento por data do serviço, recebimentos por data do pagamento e despesas pagas</p>
      </div>

      <select id="dashboardChartRange"
       aria-label="Período dos gráficos">
       <option value="6">Últimos 6 meses</option>
       <option value="12">Últimos 12 meses</option>
      </select>
     </div>

     <div class="dashboard-legend">
      <span><i class="legend-revenue"></i>Faturamento</span>
      <span><i class="legend-expense"></i>Despesas</span>
     </div>

     <div class="dashboard-svg-wrap">
      ${revenueExpenseChart}
     </div>
    </div>

    <div class="dashboard-chart-panel">
     <h3>Serviços concluídos</h3>
     <p>Quantidade de serviços por mês</p>
     ${servicesChart}
    </div>

    <div class="dashboard-chart-panel">
     <h3>Comparativo mensal</h3>
     <p>Valores do mês atual em relação ao anterior</p>

     <div class="dashboard-comparison">
      <div>
       <span>Indicador</span>
       <strong>Mês anterior</strong>
       <strong>Mês atual</strong>
      </div>

      <div>
       <span>Faturamento</span>
       <strong>${money(previous.revenue)}</strong>
       <strong>${money(current.revenue)}</strong>
      </div>

      <div>
       <span>Despesas</span>
       <strong>${money(previous.spent)}</strong>
       <strong>${money(current.spent)}</strong>
      </div>

      <div>
       <span>Serviços concluídos</span>
       <strong>${previous.completed}</strong>
       <strong>${current.completed}</strong>
      </div>
     </div>
    </div>

    <p class="dashboard-footnote">
     Fonte: registros reais do Supabase. Faturamento considera
     somente pagamentos com situação Pago. Despesas consideram
     os lançamentos registrados. Valores não representam
     necessariamente lucro contábil.
    </p>

   </div>
  `;

  const selector=$('dashboardChartRange');

  selector.value=String(dashboardChartRange);

  selector.onchange=()=>{
   dashboardChartRange=Number(selector.value);
   renderDashboards();
  };

  }catch(err){
  console.error('Erro ao carregar dashboards:',err);

  target.innerHTML=`
   <div class="empty">
    Não foi possível carregar os dashboards.
    Verifique sua conexão e tente atualizar.
   </div>
  `;
 }
}

// Atualização dos indicadores do painel

async function renderStats(){
 try{
  const [clients,vehicles,services,appointments,payments,expenses]=
   await Promise.all([
    all('clients'),
    all('vehicles'),
    all('services'),
    all('appointments'),
    all('payments'),
    all('expenses')
   ]);

  // Data local, sem depender do fuso UTC.
  const now=new Date();
  const currentMonth=
   now.getFullYear()+'-'+
   String(now.getMonth()+1).padStart(2,'0');

  // Descobre o primeiro mês com registros.
  const datedRecords=[
   ...services,
   ...appointments,
   ...payments,
   ...expenses
  ].map(r=>r.date)
   .filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d))
   .sort();

  const firstMonth=datedRecords.length
   ?datedRecords[0].slice(0,7)
   :currentMonth;

  // Monta a lista de meses disponíveis até o atual.
  const months=[];
  const start=new Date(
   Number(firstMonth.slice(0,4)),
   Number(firstMonth.slice(5,7))-1,
   1
  );

  const end=new Date(
   now.getFullYear(),
   now.getMonth(),
   1
  );

  for(let d=new Date(start);d<=end;d.setMonth(d.getMonth()+1)){
   const key=
    d.getFullYear()+'-'+
    String(d.getMonth()+1).padStart(2,'0');

   months.push({
    key,
    label:d.toLocaleDateString('pt-BR',{
     month:'long',
     year:'numeric'
    })
   });
  }

  // Aplica o período selecionado.
  const inPeriod=r=>{
   if(dashboardPeriod==='all')return true;
   if(!r.date)return false;
   if(dashboardPeriod==='current'){
    return r.date.slice(0,7)===currentMonth;
   }
   return r.date.slice(0,7)===dashboardPeriod;
  };

  const periodServices=services.filter(inPeriod);
  const periodAppointments=appointments.filter(inPeriod);
  const periodPayments=payments.filter(inPeriod);
  const periodExpenses=expenses.filter(e=>(e.paymentStatus!=='Em aberto'&&e.paymentStatus!=='Pendente')&&inPeriod(e));

  // Somente serviços concluídos.
  const completed=periodServices.filter(
   s=>s.status==='Concluído'
  ).length;

  // Somente pagamentos efetivamente recebidos.
  const serviceRevenue=periodServices
   .filter(s=>s.status==='Concluído')
   .reduce((s,p)=>s+Number(p.value||0),0);
  const legacyPaid=periodPayments
   .filter(p=>p.status==='Pago'&&!p.serviceId&&p.kind!=='credito')
   .reduce((s,p)=>s+Number(p.value||0),0);
  const paid=serviceRevenue+legacyPaid;
  const received=periodPayments
   .filter(p=>p.status==='Pago')
   .reduce((s,p)=>s+Number(p.value||0),0);
  const pending=periodPayments
   .filter(p=>p.status==='Pendente')
   .reduce((s,p)=>s+Number(p.value||0),0);

  const spent=periodExpenses
   .reduce((s,p)=>s+Number(p.value||0),0);

  const scheduled=periodAppointments.filter(a=>
   ['Agendado','Confirmado'].includes(a.status)
  ).length;

  const periodLabel=dashboardPeriod==='all'
   ?'Todos os períodos'
   :dashboardPeriod==='current'
    ?'Mês atual'
    :(months.find(m=>m.key===dashboardPeriod)?.label||'Mês selecionado');

  const stats=[
   ['Serviços concluídos',completed],
   ['Receita de serviços',money(paid)],
   ['Recebido',money(received)],
   ['Valores pendentes',money(pending)],
   ['Despesas',money(spent)],
   ['Saldo disponível',money(received-spent)],
   ['Agendamentos',scheduled],
   ['Clientes cadastrados',clients.length],
   ['Veículos cadastrados',vehicles.length]
  ];

  $('stats').innerHTML=`
   <div style="grid-column:1/-1;margin-bottom:12px">
    <button type="button" class="primary" id="dailyCloseBtn" style="width:100%;margin-bottom:12px">Fechamento do dia</button>
    <label for="dashboardPeriodSelect"
     style="display:block;margin-bottom:6px;font-weight:600">
     Período do painel
    </label>

    <select id="dashboardPeriodSelect"
     style="width:100%;padding:12px;border-radius:8px">
     <option value="current">Mês atual</option>
     <option value="all">Todos os períodos</option>
     ${months.slice().reverse().map(m=>
      `<option value="${m.key}">${m.label}</option>`
     ).join('')}
    </select>

    <small style="display:block;margin-top:6px;opacity:.7">
     Exibindo: ${esc(periodLabel)}
    </small>
   </div>

   ${stats.map(([label,value])=>`
    <div class="stat">
     <div class="label">${esc(label)}</div>
     <div class="value">${esc(value)}</div>
    </div>
   `).join('')}
  `;

  $('dailyCloseBtn').onclick=()=>renderDailyClose();
  const selector=$('dashboardPeriodSelect');

  selector.value=dashboardPeriod;

  selector.onchange=()=>{
   dashboardPeriod=selector.value;
   renderStats();
  };

 }catch(e){
  console.error('Erro ao atualizar painel:',e);
 }
}

async function renderDailyClose(){
 const date=prompt('Informe a data do fechamento (AAAA-MM-DD):',localISODate());
 if(date===null)return;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){showToast('Data inválida. Use AAAA-MM-DD.');return;}
 try{
  const [services,payments,allExpenses]=await Promise.all([all('services'),all('payments'),all('expenses')]);
  const expenses=allExpenses.filter(e=>e.paymentStatus!=='Em aberto'&&e.paymentStatus!=='Pendente'&&e.date===date);
  const payables=allExpenses.filter(e=>e.paymentStatus==='Em aberto'||e.paymentStatus==='Pendente');
  const completed=services.filter(s=>s.date===date&&s.status==='Concluído');
  const received=payments.filter(p=>p.date===date&&p.status==='Pago');
  const pending=payments.filter(p=>p.date===date&&p.status==='Pendente');
  const gifts=payments.filter(p=>p.date===date&&p.status==='Brinde');
  const totalServices=completed.reduce((n,s)=>n+Number(s.value||0),0);
  const totalReceived=received.reduce((n,p)=>n+Number(p.value||0),0);
  const totalPending=pending.reduce((n,p)=>n+Number(p.value||0),0);
  const totalGifts=gifts.reduce((n,p)=>n+Number(p.value||0),0);
  const creditUsed=payments.filter(p=>p.date===date&&p.status==='Crédito').reduce((n,p)=>n+Number(p.value||0),0);
  const totalExpenses=expenses.reduce((n,e)=>n+Number(e.value||0),0);
  const totalPayables=payables.reduce((n,e)=>n+Number(e.value||0),0);
  $('tableWrap').innerHTML=`
   <div class="dashboard-chart-panel">
    <div class="dashboard-chart-head"><div><h3>Fechamento do dia</h3><p>${dateBR(date)}</p></div><button class="secondary" id="backDashboard">Voltar ao painel</button></div>
    <div class="dashboard-metrics">
     <div class="dashboard-metric"><span>Serviços concluídos</span><strong>${completed.length}</strong></div>
     <div class="dashboard-metric"><span>Valor dos serviços</span><strong>${money(totalServices)}</strong></div>
     <div class="dashboard-metric"><span>Recebido</span><strong>${money(totalReceived)}</strong></div>
     <div class="dashboard-metric"><span>Pendente</span><strong>${money(totalPending)}</strong></div>
     <div class="dashboard-metric"><span>Brindes</span><strong>${money(totalGifts)}</strong></div>
     <div class="dashboard-metric"><span>Pago com crédito</span><strong>${money(creditUsed)}</strong></div>
     <div class="dashboard-metric"><span>Despesas pagas</span><strong>${money(totalExpenses)}</strong></div>
     <div class="dashboard-metric"><span>Saldo após despesas</span><strong>${money(totalReceived-totalExpenses)}</strong></div>
     <div class="dashboard-metric"><span>Contas a pagar em aberto</span><strong>${money(totalPayables)}</strong></div>
    </div>
    <h3>Serviços concluídos</h3>
    ${completed.length?`<div class="table-scroll"><table><thead><tr><th>Cliente</th><th>Placa</th><th>Serviço</th><th>Valor</th><th>Pagamento</th></tr></thead><tbody>${completed.map(s=>`<tr><td>${esc(s.client||'')}</td><td>${esc(s.vehicle||'')}</td><td>${esc(s.service||'')}</td><td>${money(s.value)}</td><td>${esc(s.paymentMethod||'—')} / ${esc(s.paymentStatus||'—')}</td></tr>`).join('')}</tbody></table></div>`:'<p>Nenhum serviço concluído nesta data.</p>'}
    <h3>Despesas pagas no dia</h3>
    ${expenses.length?`<div class="table-scroll"><table><thead><tr><th>Categoria</th><th>Descrição</th><th>Valor</th></tr></thead><tbody>${expenses.map(e=>`<tr><td>${esc(e.category||'')}</td><td>${esc(e.description||'')}</td><td>${money(e.value)}</td></tr>`).join('')}</tbody></table></div>`:'<p>Nenhuma despesa paga nesta data.</p>'}
    <p class="dashboard-footnote">Somente despesas efetivamente pagas entram no fechamento. Contas em aberto aparecem separadamente e não reduzem o saldo do dia.</p>
   </div>`;
  $('backDashboard').onclick=()=>active==='home'?renderHomePanel():renderDashboards();
 }catch(err){showToast('Não foi possível gerar o fechamento: '+err.message);}
}

async function exportExcel(){
 const status=$('exportStatus');
 status.textContent='Preparando os relatórios da nuvem...';

 if(!window.XLSX){
  status.textContent='Gerador Excel indisponível.\nVerifique a internet.';
  return;
 }

 try{
  const wb=XLSX.utils.book_new();

  for(const [key,m] of Object.entries(modules)){
   const records=await all(m.store);

   const data=records.map(r=>{
    const o={};
    m.fields.forEach(([k,label])=>
     o[label]=(k==='date'||k==='dueDate')?dateBR(r[k]):k==='value'?Number(r[k]||0):r[k]??''
    );
    return o;
   });

   const ws=XLSX.utils.json_to_sheet(
    data.length?data:[Object.fromEntries(m.fields.map(f=>[f[1],'']))]
   );

   if(data.length===0){
    XLSX.utils.sheet_add_aoa(ws,[['Sem registros cadastrados']],{origin:'A2'});
   }

   XLSX.utils.book_append_sheet(wb,ws,m.label.slice(0,31));
  }

  const stamp=localISODate();
  XLSX.writeFile(wb,`Auto_Brilho_Relatorios_${stamp}.xlsx`);
  status.textContent='Arquivo Excel gerado com seis abas.';
  showToast('Relatórios Excel exportados.');

 }catch(e){
  status.textContent='Falha ao gerar relatório: '+e.message;
 }
}

async function backupJSON(){
 try{
  const backup={
   app:'Auto Brilho Web',
   version:2,
   exportedAt:new Date().toISOString(),
   data:{}
  };

  for(const [key,m] of Object.entries(modules)){
   backup.data[key]=await all(m.store);
  }
  backup.data.settings=typeof getLocalSettings==='function'?getLocalSettings():{};

  const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');

  a.href=url;
  a.download=`Auto_Brilho_Backup_${localISODate()}.json`;
  a.click();

  URL.revokeObjectURL(url);

showToast('Backup gerado com sucesso.');
  return true;
 }catch(e){
  showToast('Erro ao gerar backup: '+e.message);
  return false;
 }
}
let realtimeRefreshTimer=null,realtimeRefreshBusy=false;
function subscribeRealtime(){
 if(realtimeChannel)sbClient.removeChannel(realtimeChannel);
 realtimeChannel=sbClient.channel('auto-brilho-sync').on('postgres_changes',{event:'*',schema:'public'},()=>{
  if(realtimeRefreshTimer)clearTimeout(realtimeRefreshTimer);
  realtimeRefreshTimer=setTimeout(async()=>{
   if(realtimeRefreshBusy)return;realtimeRefreshBusy=true;invalidateCache();await reconcileEmployeeServices();invalidateCache();
   try{if(active==='home')await renderHomePanel();else if(active==='dashboard')await renderDashboards();else if(active==='reports')await renderFinancialMovement();else if(active==='pending')await renderPendingPaymentsTable();else await renderTable();await renderStats();}
   finally{realtimeRefreshBusy=false;}
  },450);
 }).subscribe();
}

let appEntering=false;
async function enterApp(){
 if(appEntering)return;
 appEntering=true;
 try{
  showApp(true);
  try{const {data:{session}}=await sbClient.auth.getSession();applySession(session&&session.user);}catch(e){console.error('Não foi possível ler o perfil do usuário:',e);}
  if(isEmployee()){if(!EMPLOYEE_TABS.includes(active))active='services';}
  else{await reconcileEmployeeServices();}
  const restored=restoreUiStateOnce();
  if(isEmployee()&&!EMPLOYEE_TABS.includes(active))active='services';
  renderTabs();
  restoringState=true;renderSection();restoringState=false;
  appActive=true;
  if(restored)finishRestore(restored);
  if(!isEmployee()){await renderStats();await checkPayablesNotifications();}
  subscribeRealtime();
 }finally{
  appEntering=false;
 }
}

function recoveryLinkPresent(){
 const hash=new URLSearchParams(location.hash.replace(/^#/, ''));
 const query=new URLSearchParams(location.search);

 return hash.get('type')==='recovery' ||
        query.get('type')==='recovery';
}

function showRecovery(message=''){
 recoveryMode=true;
 $('loginScreen').classList.add('hidden');
 $('appShell').classList.add('hidden');
 $('recoveryScreen').classList.remove('hidden');
 $('logoutBtn').classList.add('hidden');

 if(message)$('recoveryMessage').textContent=message;
}

function clearRecoveryUrl(){
 history.replaceState(null,document.title,location.pathname+location.search);
}

async function init(){
 setLoginMessage('Inicializando Auto Brilho...');
 recoveryMode=recoveryLinkPresent();

 if(!window.supabase||!configured()){
  showApp(false);
  setLoginMessage('Verifique a configuração do Supabase no arquivo config.js.');
  return;
 }

 sbClient=window.supabase.createClient(
  window.AUTO_BRILHO_CONFIG.supabaseUrl,
  window.AUTO_BRILHO_CONFIG.supabaseAnonKey
 );

 const {data:{session},error:sessionError}=await sbClient.auth.getSession();

 if(sessionError)console.error('Erro ao recuperar sessão:',sessionError);

 if(recoveryMode){
  showRecovery('Defina sua nova senha abaixo.');
 }else if(session){
  await enterApp();
 }else{
  showApp(false);
 }

 sbClient.auth.onAuthStateChange((event,session)=>{
  if(event==='PASSWORD_RECOVERY'){
   showRecovery('Defina sua nova senha abaixo.');
   return;
  }

  if(recoveryMode)return;

  setTimeout(async()=>{
   try{
    if(session){
     if($('appShell').classList.contains('hidden')){
      await enterApp();
     }
    }else{
     if(realtimeChannel){
      await sbClient.removeChannel(realtimeChannel);
      realtimeChannel=null;
     }
     showApp(false);
     $('loginPassword').value='';
     if(event==='SIGNED_OUT')setLoginMessage('Sessão encerrada. Entre novamente para continuar.');
    }
   }catch(err){
    console.error('Erro ao abrir painel:',err);
    showApp(false);
    setLoginMessage('Erro ao carregar painel: '+err.message);
   }
  },0);
 });

 $('logoutBtn').onclick=async()=>{
  const btn=$('logoutBtn');
  btn.disabled=true;
  btn.textContent='Saindo...';
  setLoginMessage('Encerrando sua sessão...');
  try{
   const {error}=appActive=false;try{localStorage.removeItem(UI_STATE_KEY);localStorage.removeItem(DRAFT_KEY);}catch(e){}
   await sbClient.auth.signOut({scope:'local'});
   if(error)throw error;
   if(realtimeChannel){
    await sbClient.removeChannel(realtimeChannel);
    realtimeChannel=null;
   }
   invalidateCache();
   $('loginPassword').value='';
   showApp(false);
   setLoginMessage('Sessão encerrada. Informe seu e-mail e senha para entrar novamente.');
  }catch(err){
   console.error('Erro ao encerrar sessão:',err);
   setLoginMessage('Não foi possível encerrar a sessão: '+(err.message||'tente novamente.'));
  }finally{
   btn.disabled=false;
   btn.textContent='Sair';
  }
 };

 $('loginForm').onsubmit=async e=>{
  e.preventDefault();

  const btn=e.target.querySelector('button[type=submit]');
  btn.disabled=true;
  setLoginMessage('Verificando acesso...');

  try{
   const {error}=await sbClient.auth.signInWithPassword({
    email:$('loginEmail').value.trim(),
    password:$('loginPassword').value
   });

   if(error){
    console.error('Erro de login:',error);
    setLoginMessage('Falha no login: '+error.message);
   }else{
    setLoginMessage('Acesso autorizado.');
   }
  }catch(err){
   console.error(err);
   setLoginMessage('Falha de conexão: '+err.message);
  }finally{
   btn.disabled=false;
  }
 };

 $('recoveryForm').onsubmit=async e=>{
  e.preventDefault();

  const btn=e.target.querySelector('button[type=submit]');
  const password=$('newPassword').value;
  const confirm=$('confirmPassword').value;

  if(password.length<8){
   $('recoveryMessage').textContent='Use uma senha com pelo menos 8 caracteres.';
   return;
  }

  if(password!==confirm){
   $('recoveryMessage').textContent='As senhas não coincidem.';
   return;
  }

  btn.disabled=true;
  $('recoveryMessage').textContent='Salvando nova senha...';

  try{
   const {error}=await sbClient.auth.updateUser({password});

   if(error){
    $('recoveryMessage').textContent='Não foi possível atualizar a senha. Solicite um novo link.';
    return;
   }

   await sbClient.auth.signOut();
   recoveryMode=false;
   clearRecoveryUrl();

   $('recoveryScreen').classList.add('hidden');
   showApp(false);
   $('loginPassword').value='';
   setLoginMessage('Senha alterada. Entre usando a nova senha.');
   $('loginEmail').focus();

  }catch(err){
   console.error(err);
   $('recoveryMessage').textContent='Falha de conexão. Tente novamente.';
  }finally{
   btn.disabled=false;
  }
 };

 $('backToLoginBtn').onclick=async()=>{
  recoveryMode=false;

  try{
   await sbClient.auth.signOut();
  }catch(e){}

  clearRecoveryUrl();
  $('recoveryScreen').classList.add('hidden');
  showApp(false);
  $('recoveryMessage').textContent='';
  setLoginMessage('Você voltou à tela de acesso.');
 };
}


/* ===== CAMADA DE MELHORIAS AUTO BRILHO v8 ===== */
let stagedExcelImport=null;
const originalRenderClientVehicleForm=renderClientVehicleForm;
const originalRenderClientVehicleTable=renderClientVehicleTable;
const originalRenderTabs=renderTabs;
const originalRenderSection=renderSection;
const originalRenderDashboards=renderDashboards;
const originalRenderStats=renderStats;

function normalizeText(v){return String(v??'').trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ')}
function sameClient(a,b){return normalizeText(a)===normalizeText(b)}
function selectedVehicleForClient(client,vehicles){
 const list=vehicles.filter(v=>v.clientId===client.id||sameClient(v.client,client.name));
 if(!list.length)return null;
 if(list.length===1)return list[0];
 const answer=prompt('Escolha o veículo digitando o número:\n'+list.map((v,i)=>`${i+1} - ${normalizePlate(v.plate)} (${[v.brand,v.model,v.type].filter(Boolean).join(' ')})`).join('\n'));
 if(answer===null)return null;
 const n=Number(answer);
 return Number.isInteger(n)&&n>=1&&n<=list.length?list[n-1]:null;
}

renderTabs=function(){
 const tabs=[
  ['home','⌂','Início'],['dashboard','▥','Dashboards'],['clients','♙','Cadastro'],['retorno','↺','Retorno'],['services','✦','Serviços'],
  ['payments','R$','Financeiro'],['credits','◎','Créditos'],['pending','◷','Pendentes'],
  ['expenses','−','Despesas'],['payables','◷','Contas a pagar'],['reports','▤','Relatórios']
 ];
 $('tabs').innerHTML=tabs.filter(t=>!isEmployee()||EMPLOYEE_TABS.includes(t[0])).map(([key,icon,label])=>`<button class="tab ${key===active?'active':''}" data-tab="${key}">${icon} ${label}</button>`).join('');
 $('tabs').querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{
  active=b.dataset.tab;editId=null;editingVehicleId=null;$('formWrap').innerHTML='';$('formWrap').classList.add('hidden');$('formWrap').style.display='none';renderTabs();renderSection();
 });
};

renderSection=function(){
 if(isEmployee()&&!EMPLOYEE_TABS.includes(active))active='services';
 if(active!=='clients')cadastroView='list';
 if(!restoringState)clearServiceDraft();
 // Ao entrar/trocar de seção, descarta qualquer formulário anterior.
 // Os campos de Cadastro só são recriados pelo botão + Novo cliente.
 $('formWrap').innerHTML='';
 $('formWrap').classList.add('hidden');
 $('formWrap').style.display='none';
 $('resetPanel').classList.add('hidden');$('resetPanel').innerHTML='';
 const reports=active==='reports',home=active==='home',dashboard=active==='dashboard';
 $('mainPanel').classList.toggle('hidden',reports);$('reportsPanel').classList.toggle('hidden',!reports);
 $('stats').classList.toggle('hidden',reports||(!home&&!dashboard));
 if(reports){$('sectionTitle').textContent='Relatórios e importação';$('exportStatus').textContent='';renderFinancialMovement();return;}
 const special=home||dashboard||active==='pending'||active==='retorno';
 $('sectionEyebrow').textContent=home?'RESUMO DO NEGÓCIO':dashboard?'ANÁLISE E METAS':'CADASTROS E CONTROLE';
 $('sectionTitle').textContent=home?'Início':dashboard?'Dashboards':active==='pending'?'Pagamentos pendentes':active==='retorno'?'Retorno de clientes':active==='clients'?'Cadastro de clientes e veículos':active==='payables'?'Contas a pagar':active==='payments'?'Financeiro: entradas e saídas':active==='credits'?'Créditos dos clientes':modules[active]?.label||'Gestão';
 $('addBtn').classList.toggle('hidden',special);
 $('searchInput').parentElement.classList.toggle('hidden',home||dashboard);
 $('addBtn').textContent=active==='clients'?'+ Novo cliente':active==='payables'?'+ Nova conta a pagar':active==='payments'?'+ Outra entrada':active==='credits'?'+ Nova recarga':'+ Novo '+(modules[active]?.singular||'registro');
 $('searchInput').value='';$('searchInput').placeholder=active==='clients'?'Buscar por nome ou placa…':active==='payments'?'Buscar por descrição, cliente ou forma…':active==='retorno'?'Buscar por nome, telefone ou placa…':active==='services'?'Buscar por placa, cliente ou serviço…':active==='credits'?'Buscar cliente…':'Buscar neste cadastro…';
 if(home)renderHomePanel();else if(dashboard)renderDashboards();else if(active==='pending')renderPendingPaymentsTable();else renderTable();
};

async function renderHomePanel(){
 try{const [services,payments,expenses]=await Promise.all([all('services'),all('payments'),all('expenses')]);const today=localISODate();const due=expenses.filter(isDueAlert);const todayServices=services.filter(s=>s.date===today&&s.status==='Concluído');const todayReceived=payments.filter(p=>p.date===today&&p.status==='Pago').reduce((n,p)=>n+Number(p.value||0),0);
 $('tableWrap').innerHTML=`<div class="home-quick-actions"><button class="primary" data-home-action="services">+ Novo serviço</button><button class="secondary" data-home-action="pending">Pagamentos pendentes</button><button class="secondary" data-home-action="payables">Contas a pagar</button><button class="secondary" data-home-action="reports">Relatórios</button></div>${goalCardHtml(services,payments,expenses)}<div class="dashboard-metrics"><div class="dashboard-metric"><span>Serviços concluídos hoje</span><strong>${todayServices.length}</strong></div><div class="dashboard-metric"><span>Recebido hoje</span><strong>${money(todayReceived)}</strong></div><div class="dashboard-metric"><span>Contas a vencer / atrasadas</span><strong>${due.length}</strong></div></div><p class="dashboard-footnote">O painel inicial mostra apenas os principais indicadores e atalhos. Análises, metas e controles detalhados ficam na aba Dashboards.</p>`;
 $('tableWrap').querySelectorAll('[data-home-action]').forEach(b=>b.onclick=()=>{active=b.dataset.homeAction;renderTabs();renderSection();if(active==='services')renderServiceForm();});
 }catch(err){$('tableWrap').innerHTML='<div class="empty">Não foi possível carregar o resumo inicial.</div>';console.error(err);}
}

// Ao adicionar veículo pela ficha, os dados do cliente existente não são recriados.
renderClientVehicleForm=function(v={}){
 $('formWrap').style.display='';
 if(!v.addAnother){return originalRenderClientVehicleForm(v);}
 const client=v.clientRecord||{};editId=client.id||v.clientId;editingVehicleId=null;
 const types=['Carro','SUV','Utilitário','Moto','Camionete','Caminhão 3/4','Caminhão','Carreta','Ônibus','Outro'];
 $('formWrap').innerHTML=`<form id="addVehicleForm"><h3>Adicionar veículo para ${esc(client.name||v.client||'cliente')}</h3><div class="form-grid">
  <div class="field"><label>Placa *</label><input name="plate" required maxlength="8" autocapitalize="characters" style="text-transform:uppercase"></div>
  <div class="field"><label>Tipo de veículo *</label><select name="type" required><option value="">Selecione...</option>${types.map(t=>`<option>${t}</option>`).join('')}</select></div>
  <div class="field"><label>Marca</label><input name="brand"></div><div class="field"><label>Modelo</label><input name="model"></div>
  <div class="field"><label>Cor</label><input name="color"></div><div class="field"><label>Observações</label><input name="notes"></div>
 </div><p class="muted small">O veículo será vinculado ao cadastro existente. Nenhum novo cliente será criado.</p><div class="form-actions"><button type="button" class="secondary" id="cancelAddVehicle">Cancelar</button><button class="primary" type="submit">Salvar veículo</button></div></form>`;
 $('formWrap').classList.remove('hidden');
 const form=$('addVehicleForm'),plate=form.elements.plate;
 plate.oninput=()=>{const p=plate.selectionStart;plate.value=normalizePlate(plate.value);try{plate.setSelectionRange(p,p)}catch(e){}};
 $('cancelAddVehicle').onclick=()=>{$('formWrap').classList.add('hidden');editId=null;};
 form.onsubmit=async e=>{e.preventDefault();const btn=form.querySelector('[type=submit]');btn.disabled=true;try{
  const d=Object.fromEntries(new FormData(form).entries()),p=normalizePlate(d.plate);if(!p)throw new Error('Informe a placa.');
  const vs=await all('vehicles');if(vs.some(x=>normalizePlate(x.plate)===p))throw new Error('Esta placa já está cadastrada.');
  await save('vehicles',{client:client.name||v.client,clientId:client.id||v.clientId,plate:p,type:d.type,brand:d.brand,model:d.model,color:d.color,notes:d.notes||''});
  $('formWrap').classList.add('hidden');showToast('Novo veículo vinculado ao cliente.');await renderClientVehicleTable();await renderStats();
 }catch(err){showToast('Não foi possível salvar: '+err.message);}finally{btn.disabled=false;}};
};

renderClientVehicleTable=async function(){
 try{
  const [clients,vehicles,services]=await Promise.all([all('clients'),all('vehicles'),all('services')]);
  const rawQ=$('searchInput').value, q=normalizeText(rawQ), plateQ=normalizePlate(rawQ);
  if(cadastroView==='dups'){await renderDuplicatesPanel();return;}
  // Índices montados uma única vez (antes: cada cliente filtrava todos os veículos e serviços).
  const vehiclesById=new Map(), vehiclesByName=new Map(), servicesByName=new Map();
  const push=(map,key,item)=>{if(!key)return;const list=map.get(key);if(list)list.push(item);else map.set(key,[item]);};
  vehicles.forEach(v=>{push(vehiclesById,v.clientId,v);push(vehiclesByName,normalizeText(v.client),v);});
  services.forEach(s=>push(servicesByName,normalizeText(s.client),s));
  const vehiclesOf=c=>{const seen=new Set();return [...(vehiclesById.get(c.id)||[]),...(vehiclesByName.get(normalizeText(c.name))||[])].filter(v=>!seen.has(v.id)&&seen.add(v.id));};
  const build=c=>({c,vs:vehiclesOf(c),ss:servicesByName.get(normalizeText(c.name))||[]});
  const ranking=clients.map(c=>({c,n:(servicesByName.get(normalizeText(c.name))||[]).length})).filter(x=>x.n>0).sort((a,b)=>b.n-a.n).slice(0,5);
  const rankingHtml=`<div class="client-ranking"><strong>Clientes mais frequentes</strong>${ranking.length?ranking.map((x,i)=>`<span>${i+1}. ${esc(x.c.name)} — ${x.n} serviço(s)</span>`).join(''):'<span>Ainda sem serviços registrados.</span>'}</div>`;
  // Sem busca: só o ranking. Com busca (nome e/ou placa): só os cadastros encontrados.
  let found=[],extra='';
  if(q){
   found=clients.filter(c=>normalizeText(c.name).includes(q)||(plateQ.length>=3&&vehiclesOf(c).some(v=>normalizePlate(v.plate).includes(plateQ)))).map(build);
   if(!found.length){$('tableWrap').innerHTML='<div class="empty">Nenhum cliente ou placa encontrado para esta busca.</div>';return;}
   if(found.length>30)extra=`<p class="muted small">Mostrando 30 de ${found.length} resultados. Digite mais letras para refinar.</p>`;
  }else{
   extra='<p class="muted">Digite o nome do cliente ou a placa do veículo para localizar um cadastro.</p>';
  }
  const cards=found.slice(0,30);
  const dupCount=isEmployee()?0:findDuplicateGroups(clients,vehicles).filter(g=>!dupIgnored().has(g.id)).length;
  const dupBar=dupCount?`<div class="dup-bar"><button type="button" class="action" id="openDups">⚠ Cadastros duplicados (${dupCount})</button></div>`:'';
  $('tableWrap').innerHTML=dupBar+(found.length?'':rankingHtml)+extra+cards.map(({c,vs,ss})=>`<article class="client-card"><div class="client-card-head"><div><h3>${esc(c.name)}</h3><p>${esc(c.phone||'Telefone não informado')} · Cadastro: ${dateBR(c.registrationDate)||(!c.importKey&&c.createdAt?dateBR(String(c.createdAt).slice(0,10)):'data não informada')}</p><small>${ss.length} serviço(s) no histórico</small></div><strong>${ss.length}x</strong></div>
   <div class="client-vehicles">${vs.length?vs.map(v=>`<div class="client-vehicle-row"><span><b>${esc(normalizePlate(v.plate))}</b> · ${esc([v.brand,v.model,v.type].filter(Boolean).join(' ')||'Veículo')}</span><button class="action" data-editvehicle="${esc(v.id)}">Editar</button></div>`).join(''):'<p class="muted">Nenhum veículo cadastrado.</p>'}</div>
   <div class="client-actions"><button class="action" data-editclient="${esc(c.id)}">Editar cliente</button><button class="action" data-addvehicle="${esc(c.id)}">+ Veículo</button><button class="action" data-newservice="${esc(c.id)}">Novo serviço</button><button class="action" data-history="${esc(c.id)}">Histórico</button><button class="action danger-action" data-deleteclient="${esc(c.id)}">Excluir cliente</button></div></article>`).join('');
  $('tableWrap').querySelectorAll('[data-addvehicle]').forEach(b=>{const c=cards.find(x=>x.c.id===b.dataset.addvehicle).c;b.onclick=()=>renderClientVehicleForm({addAnother:true,clientId:c.id,clientRecord:c});});
  $('tableWrap').querySelectorAll('[data-editvehicle]').forEach(b=>b.onclick=()=>{const v=vehicles.find(x=>x.id===b.dataset.editvehicle);if(!v)return;const c=clients.find(x=>x.id===v.clientId)||clients.find(x=>sameClient(x.name,v.client));$('formWrap').style.display='';$('formWrap').classList.remove('hidden');renderClientVehicleForm({...v,clientId:c?.id,clientRecord:c||{name:v.client}});});
  $('tableWrap').querySelectorAll('[data-editclient]').forEach(b=>b.onclick=()=>{const c=clients.find(x=>x.id===b.dataset.editclient);if(c)renderClientEditForm(c);});
  const openDups=$('openDups');if(openDups)openDups.onclick=()=>{cadastroView='dups';renderClientVehicleTable();};
  $('tableWrap').querySelectorAll('[data-newservice]').forEach(b=>b.onclick=async()=>{const c=clients.find(x=>x.id===b.dataset.newservice),v=selectedVehicleForClient(c,vehicles);if(!v){showToast('Cadastre um veículo para este cliente antes de lançar o serviço.');return;}active='services';renderTabs();renderSection();renderServiceForm({vehicle:normalizePlate(v.plate)});});
  $('tableWrap').querySelectorAll('[data-history]').forEach(b=>b.onclick=()=>{const c=clients.find(x=>x.id===b.dataset.history),ss=services.filter(s=>sameClient(s.client,c.name)).sort((a,b)=>String(b.date).localeCompare(String(a.date)));$('tableWrap').innerHTML=`<div class="history-panel"><button class="secondary" id="backClients">← Voltar</button><h3>Histórico de ${esc(c.name)}</h3><p>Cadastro: ${dateBR(c.registrationDate)||(!c.importKey&&c.createdAt?dateBR(String(c.createdAt).slice(0,10)):'data não informada')} · ${ss.length} serviço(s)</p>${ss.length?`<div class="table-scroll"><table><thead><tr><th>Data</th><th>Veículo</th><th>Serviço</th><th>Valor</th><th>Situação</th></tr></thead><tbody>${ss.map(s=>`<tr><td>${dateBR(s.date)}</td><td>${esc(s.vehicle||'Sem placa')}</td><td>${esc(s.service)}</td><td>${money(s.value)}</td><td>${esc(s.status||'')}</td></tr>`).join('')}</tbody></table></div>`:'<p>Nenhum serviço registrado.</p>'}</div>`;$('backClients').onclick=()=>renderClientVehicleTable();});
  $('tableWrap').querySelectorAll('[data-deleteclient]').forEach(b=>b.onclick=async()=>{const c=clients.find(x=>x.id===b.dataset.deleteclient);if(!confirm(`Excluir o cadastro de ${c.name}? Os serviços e pagamentos históricos serão preservados, mas os veículos vinculados serão removidos.`))return;try{for(const v of vehicles.filter(x=>x.clientId===c.id||sameClient(x.client,c.name)))await remove('vehicles',v.id);await remove('clients',c.id);showToast('Cadastro excluído. Histórico financeiro e de serviços preservado.');await renderClientVehicleTable();await renderStats();}catch(err){showToast('Erro ao excluir: '+err.message);}});
 }catch(err){$('tableWrap').innerHTML='<div class="empty">Não foi possível carregar os cadastros. Verifique a conexão.</div>';console.error(err);}
};

async function renderPendingPaymentsTable(){
 try{const rows=(await all('payments')).filter(p=>p.status==='Pendente');const q=normalizeText($('searchInput').value);const list=rows.filter(p=>!q||normalizeText([p.client,p.description,p.method].join(' ')).includes(q));const total=list.reduce((n,p)=>n+Number(p.value||0),0);
 $('tableWrap').innerHTML=`<div class="dashboard-metrics"><div class="dashboard-metric"><span>Pagamentos pendentes</span><strong>${list.length}</strong></div><div class="dashboard-metric"><span>Total pendente</span><strong>${money(total)}</strong></div></div>${list.length?`<div class="table-scroll"><table><thead><tr><th>Data</th><th>Cliente</th><th>Descrição</th><th>Valor</th><th>Ação</th></tr></thead><tbody>${list.map(p=>`<tr><td>${dateBR(p.date)}</td><td>${esc(p.client)}</td><td>${esc(p.description)}</td><td>${money(p.value)}</td><td><button class="action" data-settle="${p.id}">Atualizar pagamento</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Nenhum pagamento pendente.</div>'}`;
 $('tableWrap').querySelectorAll('[data-settle]').forEach(b=>b.onclick=async()=>{const p=list.find(x=>x.id===b.dataset.settle);const method=prompt('Forma de pagamento: Pix, Dinheiro, Cartão, Cartão de débito, Cartão de crédito, Transferência ou Outro.','Pix');if(method===null)return;const allowed=['Pix','Dinheiro','Cartão','Cartão de débito','Cartão de crédito','Transferência','Outro'].find(x=>normalizeText(x)===normalizeText(method));if(!allowed){showToast('Forma de pagamento inválida.');return;}try{const date=localISODate();if(p.serviceId){const ss=await all('services'),s=ss.find(x=>x.id===p.serviceId);if(s){const updated=await save('services',{...s,paymentStatus:'Recebido',paymentMethod:allowed,receivedDate:date});await syncServicePayment(updated);}else{await save('payments',{...p,status:'Pago',method:allowed,date});}}else{await save('payments',{...p,status:'Pago',method:allowed,date});}showToast('Pagamento atualizado e receita conciliada.');await renderPendingPaymentsTable();await renderStats();await renderFinancialMovement();}catch(err){showToast('Erro ao atualizar: '+err.message);}});
 }catch(err){$('tableWrap').innerHTML='<div class="empty">Não foi possível carregar os pagamentos pendentes.</div>';}}

function getLocalSettings(){try{return JSON.parse(localStorage.getItem('autoBrilhoSettings')||'{}')}catch(e){return {}}}
function setLocalSettings(v){localStorage.setItem('autoBrilhoSettings',JSON.stringify(v));}
function monthWorkingDays(year,month,holidays=[]){let n=0;const fixed=['01-01','04-21','05-01','09-07','10-12','11-02','11-15','11-20','12-25'].map(x=>year+'-'+x);const excluded=[...new Set([...fixed,...holidays])];const d=new Date(year,month-1,1);while(d.getMonth()===month-1){const iso=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');if(d.getDay()!==0&&!excluded.includes(iso))n++;d.setDate(d.getDate()+1);}return n;}
function isDueAlert(e){if(!e.dueDate||!['Em aberto','Pendente'].includes(e.paymentStatus))return false;const today=new Date(localISODate()+'T00:00:00'),due=new Date(e.dueDate+'T00:00:00');return Math.round((due-today)/86400000)<=2;}
async function closeDueNotificationsIfClear(){try{const expenses=await all('expenses');if(!expenses.some(isDueAlert)&&navigator.serviceWorker?.ready){const reg=await navigator.serviceWorker.ready;const notes=await reg.getNotifications({tag:'auto-brilho-payables'});notes.forEach(n=>n.close());}}catch(e){}}

async function checkPayablesNotifications(){
 try{
  const settings=getLocalSettings();
  if(!settings.dueNotificationsEnabled||!('Notification'in window)||Notification.permission!=='granted')return;
  const expenses=await all('expenses');
  const alerts=expenses.filter(isDueAlert);
  const reg=await navigator.serviceWorker?.ready;
  if(!reg)return;
  const existing=await reg.getNotifications({tag:'auto-brilho-payables'});
  if(!alerts.length){
   existing.forEach(n=>n.close());
   localStorage.removeItem('ab-due-signature');
   return;
  }
  const signature=alerts.map(e=>`${e.id}:${e.dueDate||''}`).sort().join('|');
  if(localStorage.getItem('ab-due-signature')===signature)return;
  existing.forEach(n=>n.close());
  const overdue=alerts.filter(e=>String(e.dueDate||'')<localISODate()).length;
  const dueSoon=alerts.length-overdue;
  const summary=[
   overdue?`${overdue} vencida(s)`: '',
   dueSoon?`${dueSoon} com vencimento em até 2 dias`: ''
  ].filter(Boolean).join(' · ');
  await reg.showNotification('Auto Brilho: atenção às contas a pagar',{
   body:`${summary}. Consulte a aba Contas a pagar.`,
   tag:'auto-brilho-payables',
   renotify:false
  });
  localStorage.setItem('ab-due-signature',signature);
 }catch(err){console.warn('Não foi possível verificar notificações de vencimento:',err);}
}

async function renderPayablesWithNotificationSettings(){
 await originalRenderPayablesTable();
 const target=$('tableWrap');
 if(!target)return;
 const settings=getLocalSettings();
 const enabled=!!settings.dueNotificationsEnabled;
 const panel=document.createElement('section');
 panel.className='dashboard-chart-panel due-notification-settings';
 panel.innerHTML=`<h3>Notificações de vencimento</h3>
  <p>Ative para receber um aviso quando qualquer conta estiver vencendo nos próximos 2 dias ou já estiver atrasada. O aviso considera todas as contas em aberto e é atualizado quando uma conta é paga.</p>
  <div class="form-actions"><button type="button" class="${enabled?'secondary':'primary'}" id="toggleDueNotifications">${enabled?'Desativar notificações':'Ativar notificações'}</button><span class="muted small" id="dueNotificationStatus">${enabled?'Ativadas neste aparelho':'Desativadas neste aparelho'}</span></div>`;
 target.prepend(panel);
 const button=$('toggleDueNotifications');
 button.onclick=async()=>{
  if(!('Notification'in window)){showToast('Este navegador não oferece notificações.');return;}
  const current=getLocalSettings();
  if(current.dueNotificationsEnabled){
   setLocalSettings({...current,dueNotificationsEnabled:false});
   const reg=await navigator.serviceWorker?.ready;
   if(reg){const notes=await reg.getNotifications({tag:'auto-brilho-payables'});notes.forEach(n=>n.close());}
   localStorage.removeItem('ab-due-signature');
   button.textContent='Ativar notificações';button.className='primary';
   $('dueNotificationStatus').textContent='Desativadas neste aparelho';
   showToast('Notificações de vencimento desativadas.');
   return;
  }
  const permission=await Notification.requestPermission();
  if(permission!=='granted'){showToast('Permissão de notificação não concedida.');return;}
  setLocalSettings({...current,dueNotificationsEnabled:true});
  button.textContent='Desativar notificações';button.className='secondary';
  $('dueNotificationStatus').textContent='Ativadas neste aparelho';
  localStorage.removeItem('ab-due-signature');
  await checkPayablesNotifications();
  showToast('Notificações ativadas para todas as contas a pagar.');
 };
 await checkPayablesNotifications();
}

async function addDashboardExtras(){
 const target=$('tableWrap');if(!target||active!=='dashboard')return;
 try{const [services,expenses]=await Promise.all([all('services'),all('expenses')]);const now=new Date(),year=now.getFullYear(),month=now.getMonth()+1,key=year+'-'+String(month).padStart(2,'0');const done=services.filter(s=>s.status==='Concluído'&&s.date?.slice(0,7)===key);const days=[...new Set(done.map(s=>s.date))];const revenue=done.reduce((n,s)=>n+Number(s.value||0),0);const avgTicket=done.length?revenue/done.length:0;const settings=getLocalSettings();const holidays=(settings.holidays||'').split(',').map(x=>x.trim()).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x));const workdays=monthWorkingDays(year,month,holidays);const dailyTarget=Number(settings.dailyTarget||0);const targetRevenue=dailyTarget*workdays;const targetServices=avgTicket>0?Math.ceil(targetRevenue/avgTicket):0;const alerts=expenses.filter(isDueAlert);if(!alerts.length)await closeDueNotificationsIfClear();const cats=['Produtos','Funcionários','Pró-labore','Despesa mensal','Diversos','Cartão / empréstimo'];const caps=settings.caps||{};const paidExpenses=expenses.filter(e=>e.paymentStatus==='Pago'&&e.date?.slice(0,7)===key);const byCat=cats.map(c=>({c,total:paidExpenses.filter(e=>canonicalExpenseCategory(e.category)===c).reduce((n,e)=>n+Number(e.value||0),0)}));const staff=paidExpenses.filter(e=>canonicalExpenseCategory(e.category)==='Funcionários');const staffGroups={};staff.forEach(e=>{const k=staffExpenseName(e)||'Não identificado';staffGroups[k]=(staffGroups[k]||0)+Number(e.value||0);});
 const holidayText=settings.holidays||'';
 const html=`<div class="dashboard-chart-panel"><h3>Metas do mês</h3><p>Domingos e feriados cadastrados são descontados dos dias úteis. Feriados móveis/locais devem ser informados manualmente.</p><form id="goalForm" class="form-grid"><div class="field"><label>Meta média diária (R$)</label><input name="dailyTarget" type="number" min="0" step="0.01" value="${esc(settings.dailyTarget||'')}" placeholder="Ex.: 350"></div><div class="field"><label>Feriados do mês (AAAA-MM-DD, separados por vírgula)</label><input name="holidays" value="${esc(holidayText)}" placeholder="2026-11-20"></div><div class="form-actions" style="grid-column:1/-1"><button class="primary" type="submit">Salvar meta e feriados</button></div></form><div class="dashboard-metrics"><div class="dashboard-metric"><span>Dias úteis previstos</span><strong>${workdays}</strong></div><div class="dashboard-metric"><span>Dias trabalhados (dias com serviço concluído)</span><strong>${days.length}</strong></div><div class="dashboard-metric"><span>Média diária realizada</span><strong>${money(days.length?revenue/days.length:0)}</strong></div><div class="dashboard-metric"><span>Meta de faturamento</span><strong>${money(targetRevenue)}</strong><small>${targetRevenue?Math.min(100,revenue/targetRevenue*100).toFixed(1).replace('.',',')+'% atingido':'Informe uma meta diária'}</small></div><div class="dashboard-metric"><span>Meta estimada de serviços</span><strong>${targetServices||'—'}</strong><small>Ticket médio atual: ${money(avgTicket)}</small></div><div class="dashboard-metric"><span>Serviços concluídos</span><strong>${done.length}</strong><small>${targetServices?Math.min(100,done.length/targetServices*100).toFixed(1).replace('.',',')+'% da meta':'Meta indisponível'}</small></div></div></div>
 <div class="dashboard-chart-panel"><h3>Teto de gastos por categoria</h3><p>Defina o limite percentual sobre o faturamento do mês. Os limites ficam salvos neste navegador.</p><form id="capsForm" class="form-grid">${cats.map(c=>`<div class="field"><label>${esc(c)} (%)</label><input type="number" min="0" max="100" step="0.1" name="${esc(c)}" value="${esc(caps[c]??'')}" placeholder="Sem limite"></div>`).join('')}<div class="form-actions" style="grid-column:1/-1"><button class="primary" type="submit">Salvar limites</button></div></form><div class="table-scroll"><table><thead><tr><th>Categoria</th><th>Gasto no mês</th><th>% do faturamento</th><th>Teto</th></tr></thead><tbody>${byCat.map(x=>{const pct=revenue?x.total/revenue*100:null,cap=Number(caps[x.c]||0);return `<tr><td>${esc(x.c)}</td><td>${money(x.total)}</td><td>${pct===null?'—':pct.toFixed(1).replace('.',',')+'%'}</td><td>${cap?cap+'%':'Não definido'} ${cap&&pct>cap?'⚠ Acima do teto':''}</td></tr>`}).join('')}</tbody></table></div></div>
 <div class="dashboard-chart-panel"><h3>Resumo de pagamentos de funcionários</h3><p>Despesas pagas na categoria Funcionários neste mês.</p>${Object.keys(staffGroups).length?`<div class="table-scroll"><table><thead><tr><th>Funcionário / descrição</th><th>Total pago</th></tr></thead><tbody>${Object.entries(staffGroups).map(([n,v])=>`<tr><td>${esc(n)}</td><td>${money(v)}</td></tr>`).join('')}</tbody></table></div>`:'<p>Nenhum pagamento de funcionário registrado neste mês.</p>'}</div>
 ${alerts.length?`<div class="alert-panel"><strong>Contas próximas do vencimento ou vencidas</strong>${alerts.map(e=>`<p>${dateBR(e.dueDate)} · ${esc(e.description)} · ${money(e.value)}</p>`).join('')}<button class="action" id="goPayables">Abrir contas a pagar</button></div>`:''}`;
 target.insertAdjacentHTML('beforeend',html);
 $('goalForm').onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target).entries());const old=getLocalSettings();setLocalSettings({...old,dailyTarget:Number(d.dailyTarget||0),holidays:d.holidays||''});showToast('Meta salva neste aparelho.');renderDashboards();};
 $('capsForm').onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target).entries());const old=getLocalSettings();old.caps={};cats.forEach(c=>{if(d[c]!=='')old.caps[c]=Number(d[c]);});setLocalSettings(old);showToast('Limites salvos neste aparelho.');renderDashboards();};
 if($('goPayables'))$('goPayables').onclick=()=>{active='payables';renderTabs();renderSection();};
 await checkPayablesNotifications();
 }catch(err){console.error('Extras do painel:',err);}
}
renderDashboards=async function(){await originalRenderDashboards();await addDashboardExtras();};
const originalRenderPayablesTable=renderPayablesTable;
renderPayablesTable=renderPayablesWithNotificationSettings;
renderStats=async function(){
 try{const [clients,services,payments,expenses]=await Promise.all([all('clients'),all('services'),all('payments'),all('expenses')]);const key=localISODate().slice(0,7);const done=services.filter(s=>s.status==='Concluído'&&s.date?.slice(0,7)===key);const received=payments.filter(p=>p.status==='Pago'&&p.date?.slice(0,7)===key).reduce((n,p)=>n+Number(p.value||0),0);const pending=payments.filter(p=>p.status==='Pendente').reduce((n,p)=>n+Number(p.value||0),0);const spent=expenses.filter(e=>e.paymentStatus==='Pago'&&e.date?.slice(0,7)===key).reduce((n,e)=>n+Number(e.value||0),0);
 $('stats').innerHTML=`<div class="stat"><div class="label">Recebido no mês</div><div class="value">${money(received)}</div></div><div class="stat"><div class="label">Serviços concluídos</div><div class="value">${done.length}</div></div><div class="stat"><div class="label">Pagamentos pendentes</div><div class="value">${money(pending)}</div></div><div class="stat"><div class="label">Clientes cadastrados</div><div class="value">${clients.length}</div></div><div style="grid-column:1/-1"><button type="button" class="secondary wide" id="dailyCloseBtn">Fechamento do dia</button></div>`;$('dailyCloseBtn').onclick=()=>renderDailyClose();
 }catch(err){console.error('Indicadores principais:',err);}
};

async function renderFinancialMovement(){
 try{const [payments,expenses]=await Promise.all([all('payments'),all('expenses')]);
  const entries=payments.filter(p=>p.status!=='Estornado').map(p=>({date:p.date,type:'Entrada',status:p.status||'Pendente',description:p.description||'Recebimento',person:p.client,value:Number(p.value||0)}));
  const exits=expenses.map(e=>({date:e.paymentStatus==='Pago'?(e.date||e.paidAt):(e.dueDate||e.date),type:'Saída',status:e.paymentStatus||'Em aberto',description:e.description,person:e.supplier||e.category,value:Number(e.value||0)}));
  const rows=[...entries,...exits].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const income=entries.filter(x=>x.status==='Pago').reduce((n,x)=>n+x.value,0),out=exits.filter(x=>x.status==='Pago').reduce((n,x)=>n+x.value,0);
  const pendingIn=entries.filter(x=>x.status==='Pendente').reduce((n,x)=>n+x.value,0),pendingOut=exits.filter(x=>['Em aberto','Pendente'].includes(x.status)).reduce((n,x)=>n+x.value,0);
  $('financialMovement').innerHTML=`<div class="dashboard-metrics"><div class="dashboard-metric"><span>Entradas recebidas</span><strong>${money(income)}</strong></div><div class="dashboard-metric"><span>Saídas pagas</span><strong>${money(out)}</strong></div><div class="dashboard-metric"><span>Resultado realizado</span><strong>${money(income-out)}</strong></div><div class="dashboard-metric"><span>Recebimentos pendentes</span><strong>${money(pendingIn)}</strong></div><div class="dashboard-metric"><span>Contas a pagar em aberto</span><strong>${money(pendingOut)}</strong></div></div><h3>Movimento financeiro completo</h3>${rows.length?`<div class="table-scroll"><table><thead><tr><th>Data / vencimento</th><th>Tipo</th><th>Situação</th><th>Descrição</th><th>Cliente / fornecedor</th><th>Valor</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${dateBR(r.date)}</td><td>${r.type}</td><td>${esc(r.status)}</td><td>${esc(r.description)}</td><td>${esc(r.person||'')}</td><td>${money(r.value)}</td></tr>`).join('')}</tbody></table></div>`:'<p>Nenhuma movimentação registrada.</p>'}`;
 }catch(err){$('financialMovement').textContent='Não foi possível carregar o movimento financeiro.';}
}
function excelDate(v){
 const iso=(y,m,d)=>{y=Number(y);m=Number(m);d=Number(d);if(!y||y<1990||y>2100||m<1||m>12||d<1||d>31)return '';const out=`${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;const test=new Date(`${out}T12:00:00`);return test.getFullYear()===y&&test.getMonth()+1===m&&test.getDate()===d?out:'';};
 if(v instanceof Date&&!Number.isNaN(v.getTime()))return iso(v.getFullYear(),v.getMonth()+1,v.getDate());
 if(typeof v==='number'&&Number.isFinite(v)&&v>=20000&&v<80000){const d=XLSX.SSF.parse_date_code(v);return d?iso(d.y,d.m,d.d):'';}
 let s=String(v??'').trim();if(!s)return '';s=s.split(/[ T]/)[0];
 let m=s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);if(m)return iso(m[1],m[2],m[3]);
 m=s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/);if(m){let y=Number(m[3]);if(y<100)y+=y<50?2000:1900;let dd=Number(m[1]),mm=Number(m[2]);if(mm>12&&dd<=12){const t=dd;dd=mm;mm=t;}return iso(y,mm,dd);}
 if(/^\d+(?:\.\d+)?$/.test(s)){const n=Number(s);if(n>20000){const d=XLSX.SSF.parse_date_code(n);return d?iso(d.y,d.m,d.d):'';}}
 return '';
}
const IMPORT_MAX_ROWS_PER_SHEET=10000, IMPORT_MAX_ROWS_TOTAL=25000;
const IMPORT_DATE_COLUMNS=['Data','Data de cadastro','Data do pagamento','Data de vencimento'];
function rowObjects(ws){
 const shown=XLSX.utils.sheet_to_json(ws,{defval:'',raw:false});
 let raw=[];try{raw=XLSX.utils.sheet_to_json(ws,{defval:'',raw:true});}catch(e){}
 // Colunas de data são lidas pelo valor real da célula (número de série do Excel) e não pelo texto exibido,
 // que depende do formato da célula (mm/dd/aa x dd/mm/aaaa) e trocava o dia com o mês.
 const byRow=new Map();raw.forEach(r=>{if(r&&r.__rowNum__!=null)byRow.set(r.__rowNum__,r);});
 shown.forEach((row,i)=>{const r=(row.__rowNum__!=null&&byRow.get(row.__rowNum__))||raw[i];if(!r)return;IMPORT_DATE_COLUMNS.forEach(c=>{if(c in row&&typeof r[c]==='number')row[c]=r[c];});});
 return shown;
}
const importRowNumber=r=>r&&r.__rowNum__!=null?r.__rowNum__+1:'?';
async function stageExcelFile(file){
 if(!window.XLSX)throw new Error('Leitor Excel indisponível.');
 const buf=await file.arrayBuffer(),wb=XLSX.read(buf,{type:'array',cellDates:false});
 let totalRows=0;const warnings=[];
 const get=n=>{
  if(!wb.Sheets[n])return [];
  const rows=rowObjects(wb.Sheets[n]);
  if(rows.length>IMPORT_MAX_ROWS_PER_SHEET)throw new Error(`A aba “${n}” tem ${rows.length.toLocaleString('pt-BR')} linhas e o limite é ${IMPORT_MAX_ROWS_PER_SHEET.toLocaleString('pt-BR')} por aba. Divida a planilha em partes menores.`);
  totalRows+=rows.length;
  if(totalRows>IMPORT_MAX_ROWS_TOTAL)throw new Error(`A planilha passa do limite de ${IMPORT_MAX_ROWS_TOTAL.toLocaleString('pt-BR')} linhas no total. Divida a planilha em partes menores.`);
  return rows;
 };
 const warnDates=(label,rows)=>{if(rows.length)warnings.push(`${rows.length} linha(s) de “${label}” com data ausente ou inválida não serão importadas (linhas da planilha: ${rows.slice(0,12).join(', ')}${rows.length>12?'…':''}).`);};
 const clients=get('Clientes').map((r,i)=>({r,i})).filter(x=>String(x.r['Nome completo']||'').trim()).map(({r,i})=>({name:String(r['Nome completo']).trim(),phone:String(r['Telefone / WhatsApp']||'').trim(),email:r['E-mail']||'',document:String(r['CPF / CNPJ']||'').trim(),address:r['Endereço']||'',notes:r['Observações']||'',registrationDate:excelDate(r['Data de cadastro']),importKey:'excel-client-'+i+'-'+normalizeText(r['Nome completo'])}));
 const vehicles=get('Veículos').filter(r=>String(r['Placa']||'').trim()).map(r=>({client:String(r['Cliente']||'').trim(),plate:normalizePlate(r['Placa']),type:String(r['Tipo de veículo']||'Outro').trim(),brand:String(r['Marca']||'').trim(),model:String(r['Modelo']||'').trim(),color:String(r['Cor']||'').trim(),notes:r['Observações']||''}));
 const vehicleOwner=new Map();vehicles.forEach(v=>{if(v.plate&&v.client)vehicleOwner.set(v.plate,v.client);});
 const services=get('Serviços realizados').map((r,i)=>({r,i})).filter(x=>String(x.r['Data']||'').trim()).map(({r,i})=>{
  const plate=normalizePlate(r['Veículo / placa']);
  const clientInput=String(r['Cliente']||'').trim();
  const client=clientInput||vehicleOwner.get(plate)||'Não identificado';
  const rawMethod=String(r['Tipo de pagamento']||'').trim();const methodMap={'dinheiro':'Dinheiro','pix':'Pix','brinde':'Brinde','cartao':'Cartão','cartao de credito':'Cartão de crédito','cartao de debito':'Cartão de débito','transferencia':'Transferência'};const method=methodMap[normalizeText(rawMethod)]||rawMethod;
  const financial=normalizeText(r['Situação financeira']);
  const rawStatus=normalizeText(r['Situação']||'concluido');
  const serviceStatus=['concluido','concluida','finalizado','finalizada'].includes(rawStatus)?'Concluído':['em andamento','andamento'].includes(rawStatus)?'Em andamento':'Cancelado';
  return {_row:importRowNumber(r),importKey:'excel-service-'+i,date:excelDate(r['Data']),client,vehicle:plate||'SEM PLACA',service:String(r['Serviço executado']||'Serviço').trim(),value:decimalValue(r['Valor (R$)']),_valueProvided:String(r['Valor (R$)']??'').trim()!=='',status:serviceStatus,paymentStatus:['recebido','pago','quitado','quitada'].includes(financial)?'Recebido':'Pendente',paymentMethod:method==='Brinde'?'Brinde':method,receivedDate:excelDate(r['Data']),notes:String(r['Observações']||'').trim()};
 });
warnDates('Serviços realizados',services.filter(s=>!s.date).map(s=>s._row));
 const paymentRows=get('Receitas e pagamentos').filter(r=>String(r['Data']||'').trim()&&String(r['Descrição']||'').trim());
 warnDates('Receitas e pagamentos',paymentRows.filter(r=>!excelDate(r['Data'])).map(importRowNumber));
 const payments=paymentRows.filter(r=>excelDate(r['Data'])).map(r=>({date:excelDate(r['Data']),client:String(r['Cliente']||'').trim()||'Não identificado',description:String(r['Descrição']).trim(),method:String(r['Forma de pagamento']||'Outro').trim(),value:decimalValue(r['Valor (R$)']),status:String(r['Situação']||'Pago').trim(),notes:String(r['Observações']||'').trim()}));
 const expenseRows=get('Despesas');
 const payableRows=get('Contas a pagar').filter(p=>!expenseRows.some(d=>normalizeText(d['Descrição'])===normalizeText(p['Descrição'])&&normalizeText(d['Categoria'])===normalizeText(p['Categoria'])&&Math.abs(decimalValue(d['Valor (R$)'])-decimalValue(p['Valor (R$)']))<0.01&&String(d['Data de vencimento']||d['Data do pagamento']||'')===String(p['Data de vencimento']||p['Data do pagamento']||'')));
 const badExpenseDates=[];
 const expenses=[...expenseRows,...payableRows].map((r,i)=>({r,i})).filter(x=>String(x.r['Descrição']||'').trim()).map(({r,i})=>{
  const rawCat=String(r['Categoria']||'Diversos').trim();
  const category=canonicalExpenseCategory(rawCat);
  const status=normalizeText(r['Situação']);
  const due=excelDate(r['Data de vencimento']);
  const rowNo=importRowNumber(r);
  const expenseObj={importKey:'excel-expense-'+i,date:excelDate(r['Data do pagamento']),dueDate:due==='3000-01-01'?'':due,category,subcategory:String(r['Subcategoria']||'').trim(),description:String(r['Descrição']).trim(),supplier:String(r['Fornecedor']||'').trim(),value:decimalValue(r['Valor (R$)']),payment:String(r['Forma de pagamento']||'').trim(),paymentStatus:['pago','paga','quitado','quitada','liquidado','liquidada'].includes(status)?'Pago':'Em aberto',notes:String(r['Observações']||'').trim()};
  if(expenseObj.paymentStatus==='Pago'&&!expenseObj.date){badExpenseDates.push(rowNo);return null;}
  return expenseObj;
 }).filter(Boolean);
 warnDates('Despesas / Contas a pagar (pagas)',badExpenseDates);
 const appointmentRows=get('Agendamentos').filter(r=>String(r['Data']||'').trim()&&String(r['Cliente']||'').trim());
 warnDates('Agendamentos',appointmentRows.filter(r=>!excelDate(r['Data'])).map(importRowNumber));
 const appointments=appointmentRows.filter(r=>excelDate(r['Data'])).filter(r=>String(r['Data']||'').trim()&&String(r['Cliente']||'').trim()).map(r=>({date:excelDate(r['Data']),time:String(r['Horário']||'').trim(),client:String(r['Cliente']).trim(),vehicle:String(r['Veículo / placa']||'SEM PLACA').trim(),service:String(r['Serviço solicitado']||'').trim(),value:decimalValue(r['Valor (R$)']),status:String(r['Situação']||'Agendado').trim(),notes:String(r['Observações']||'').trim()}));
 return {clients,vehicles,services,payments,expenses,appointments,warnings,totalRows};
}
function serviceKey(s){return [s.date,normalizeText(s.client),normalizePlate(s.vehicle),normalizeText(s.service),Number(s.value||0).toFixed(2)].join('|');}
function sameImportedService(a,b){return a.date===b.date&&normalizePlate(a.vehicle)===normalizePlate(b.vehicle)&&normalizeText(a.service)===normalizeText(b.service)&&Math.abs(Number(a.value||0)-Number(b.value||0))<0.01&&(!a.client||!b.client||normalizeText(a.client)==='nao identificado'||normalizeText(b.client)==='nao identificado'||sameClient(a.client,b.client));}
function canonicalExpenseCategory(value){const n=normalizeText(value);const map={'funcionario':'Funcionários','funcionarios':'Funcionários','pro-labore':'Pró-labore','pro labore':'Pró-labore','despesa mensal':'Despesa mensal','diversos':'Diversos','produtos':'Produtos','material':'Produtos','cartao/emprestimo':'Cartão / empréstimo'};return map[n]||String(value||'Diversos').trim();}
function staffExpenseName(e){const supplied=String(e.supplier||e.subcategory||'').trim();if(supplied)return supplied;const m=String(e.description||'').match(/^PGTO\s+(.+)$/i);return m?m[1].trim():String(e.description||'Não identificado').trim();}
async function downloadPreImportBackup(){const backup={app:'Auto Brilho Web',version:3,reason:'Backup automático antes da importação Excel',exportedAt:new Date().toISOString(),data:{}};for(const [key,m] of Object.entries(modules))backup.data[key]=await all(m.store);backup.data.settings=getLocalSettings();const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`Auto_Brilho_Backup_Pre_Importacao_${localISODate()}.json`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);}
async function importStagedExcel(){
 if(!stagedExcelImport)return;const btn=$('confirmExcelImport');btn.disabled=true;btn.textContent='Importando...';
 try{
  await downloadPreImportBackup();
  const data=stagedExcelImport;let counts={clients:0,vehicles:0,services:0,payments:0,expenses:0,appointments:0,duplicates:0,invalidServices:0};
  let currentClients=await all('clients'),currentVehicles=await all('vehicles'),currentServices=await all('services'),currentPayments=await all('payments'),currentExpenses=await all('expenses'),currentAppointments=await all('appointments');
  const clientMap=new Map();
  let prog=0;const progress=(label,done,total)=>{if(done%20===0||done===total){btn.textContent=`Importando ${label} ${done}/${total}...`;}};
  for(const c of data.clients){progress('clientes',++prog,data.clients.length);let found=currentClients.find(x=>x.importKey===c.importKey)||(c.document&&currentClients.find(x=>String(x.document||'').replace(/\D/g,'')===c.document.replace(/\D/g,'')))||(c.phone&&currentClients.find(x=>String(x.phone||'').replace(/\D/g,'')===c.phone.replace(/\D/g,'')))||(!c.phone&&!c.document&&currentClients.find(x=>sameClient(x.name,c.name)&&!x.importKey));if(found){if(!found.registrationDate&&c.registrationDate){found=await save('clients',{...found,registrationDate:c.registrationDate});currentClients=currentClients.map(x=>x.id===found.id?found:x);}clientMap.set(normalizeText(c.name),found);counts.duplicates++;}else{const saved=await save('clients',c);currentClients.push(saved);clientMap.set(normalizeText(c.name),saved);counts.clients++;}}
  prog=0;for(const v of data.vehicles){progress('veículos',++prog,data.vehicles.length);const cl=clientMap.get(normalizeText(v.client))||currentClients.find(c=>sameClient(c.name,v.client));const existing=currentVehicles.find(x=>normalizePlate(x.plate)===v.plate);if(existing){if(cl&&!existing.clientId){const updated=await save('vehicles',{...existing,clientId:cl.id,client:existing.client||cl.name});currentVehicles=currentVehicles.map(x=>x.id===updated.id?updated:x);}counts.duplicates++;continue;}if(!cl){counts.duplicates++;continue;}const saved=await save('vehicles',{...v,clientId:cl.id,client:cl.name});currentVehicles.push(saved);counts.vehicles++;}
  const serviceMap=new Map();
  prog=0;for(const s of data.services){progress('serviços',++prog,data.services.length);if(!s.date||!s._valueProvided||!Number.isFinite(s.value)||s.value<0){counts.invalidServices++;continue;}const key=s.importKey||serviceKey(s);let found=currentServices.find(x=>x.importKey===key)||currentServices.find(x=>sameImportedService(x,s));if(found){const servicePatch={...found};let needsServiceUpdate=false;if((!found.client||normalizeText(found.client)==='nao identificado')&&s.client&&normalizeText(s.client)!=='nao identificado'){servicePatch.client=s.client;needsServiceUpdate=true;}if(normalizeText(found.status)==='concluido'&&found.status!=='Concluído'){servicePatch.status='Concluído';needsServiceUpdate=true;}if(normalizeText(found.paymentStatus)==='recebido'&&found.paymentStatus!=='Recebido'){servicePatch.paymentStatus='Recebido';needsServiceUpdate=true;}if(needsServiceUpdate){servicePatch.importKey=key;found=await save('services',servicePatch);currentServices=currentServices.map(x=>x.id===found.id?found:x);}counts.duplicates++;serviceMap.set(key,found);continue;}const {_valueProvided,_row,...serviceData}=s;const saved=await save('services',{...serviceData,importKey:key,vehicle:s.vehicle||'SEM PLACA'});currentServices.push(saved);serviceMap.set(key,saved);counts.services++;}
  prog=0;for(const p of data.payments){progress('pagamentos',++prog,data.payments.length);let matched=null;const plate=(p.description.match(/[A-Z]{3}[0-9][A-Z0-9][0-9]{2,3}/i)||[])[0]||'';matched=currentServices.find(s=>s.date===p.date&&sameClient(s.client,p.client)&&Math.abs(Number(s.value||0)-p.value)<0.01&&(!plate||normalizePlate(s.vehicle)===normalizePlate(plate)));if(matched){const old=currentPayments.find(x=>x.serviceId===matched.id);if(old){counts.duplicates++;continue;}const status=normalizeText(p.status)==='pago'?'Pago':normalizeText(p.status)==='brinde'?'Brinde':'Pendente';const saved=await save('payments',{...p,status,serviceId:matched.id});currentPayments.push(saved);counts.payments++;}else{const exists=currentPayments.some(x=>x.date===p.date&&sameClient(x.client,p.client)&&normalizeText(x.description)===normalizeText(p.description)&&Math.abs(Number(x.value||0)-p.value)<0.01);if(exists){counts.duplicates++;continue;}const saved=await save('payments',{...p,status:normalizeText(p.status)==='pago'?'Pago':p.status});currentPayments.push(saved);counts.payments++;}}
  // Concilia automaticamente os serviços históricos recebidos, sem duplicar pagamentos já vinculados.
  for(const s of data.services){
   if(!s.date||!Number.isFinite(s.value)||s.value<0)continue;
   const service=currentServices.find(x=>x.importKey===s.importKey)||currentServices.find(x=>sameImportedService(x,s));
   if(!service||service.status!=='Concluído')continue;
   const method=String(service.paymentMethod||'').trim();
   const received=method==='Brinde'||service.paymentStatus==='Recebido';
   if(!received)continue;
   const linked=currentPayments.find(p=>p.serviceId===service.id);
   if(linked){continue;}
   const duplicate=currentPayments.find(p=>p.date===service.date&&sameClient(p.client,service.client)&&Math.abs(Number(p.value||0)-Number(service.value||0))<0.01&&normalizeText(p.description).includes(normalizeText(service.service)));
   if(duplicate){continue;}
   const payment={serviceId:service.id,date:service.date,client:service.client||'Não identificado',description:`Serviço ${service.service||''} - ${service.vehicle||''}`,method:method||'Outro',value:Number(service.value||0),status:method==='Brinde'?'Brinde':'Pago',notes:service.notes||''};
   const saved=await save('payments',payment);currentPayments.push(saved);counts.payments++;
  }
  prog=0;for(const e of data.expenses){progress('despesas',++prog,data.expenses.length);if(!Number.isFinite(e.value)){counts.duplicates++;continue;}const exists=currentExpenses.find(x=>x.importKey===e.importKey||(!x.importKey&&x.date===e.date&&x.dueDate===e.dueDate&&sameClient(x.description,e.description)&&Math.abs(Number(x.value||0)-e.value)<0.01&&(canonicalExpenseCategory(x.category)===canonicalExpenseCategory(e.category))));if(exists){const normalizedCategory=canonicalExpenseCategory(exists.category);const cleanDue=exists.dueDate==='3000-01-01'?'':exists.dueDate; if(normalizedCategory!==exists.category||cleanDue!==exists.dueDate){const updated=await save('expenses',{...exists,category:normalizedCategory,dueDate:cleanDue});currentExpenses=currentExpenses.map(x=>x.id===updated.id?updated:x);}counts.duplicates++;continue;}const saved=await save('expenses',{...e,category:canonicalExpenseCategory(e.category)});currentExpenses.push(saved);counts.expenses++;}
  for(const a of data.appointments){const exists=currentAppointments.some(x=>x.date===a.date&&x.time===a.time&&sameClient(x.client,a.client)&&normalizePlate(x.vehicle)===normalizePlate(a.vehicle));if(exists){counts.duplicates++;continue;}const saved=await save('appointments',a);currentAppointments.push(saved);counts.appointments++;}
  stagedExcelImport=null;$('importPreview').classList.add('hidden');$('importExcelFile').value='';const unidentified=data.services.filter(s=>normalizeText(s.client)==='nao identificado').length;const resultText=`Importação concluída: ${counts.clients} clientes, ${counts.vehicles} veículos, ${counts.services} serviços, ${counts.payments} pagamentos e ${counts.expenses} despesas. ${unidentified} serviço(s) ficaram com cliente “Não identificado”; ${counts.duplicates} duplicado(s) ignorado(s) e ${counts.invalidServices} serviço(s) inválido(s) não importado(s).`;$('exportStatus').textContent=resultText;showToast(counts.services?`${counts.services} serviço(s) gravado(s) com sucesso.`:'Nenhum serviço novo foi gravado. Confira o resumo da importação.');await renderStats();await renderFinancialMovement();if(counts.services>0){active='services';renderTabs();renderSection();} 
 }catch(err){showToast('Falha na importação: '+err.message);console.error(err);}finally{if($('confirmExcelImport')){$('confirmExcelImport').disabled=false;$('confirmExcelImport').textContent='Confirmar importação';}}
}


function downloadImportTemplate(){
 if(!window.XLSX){showToast('Biblioteca Excel indisponível.');return;}
 const wb=XLSX.utils.book_new();
 const sheets=[
  ['Clientes',['Nome completo','Telefone / WhatsApp','Data de cadastro','E-mail','CPF / CNPJ','Endereço','Observações']],
  ['Veículos',['Cliente','Placa','Tipo de veículo','Marca','Modelo','Cor','Observações']],
  ['Serviços realizados',['Data','Cliente','Veículo / placa','Serviço executado','Valor (R$)','Situação','Situação financeira','Tipo de pagamento','Observações']],
  ['Receitas e pagamentos',['Data','Cliente','Descrição','Forma de pagamento','Valor (R$)','Situação','Observações']],
  ['Despesas',['Data do pagamento','Data de vencimento','Categoria','Subcategoria','Descrição','Fornecedor','Valor (R$)','Forma de pagamento','Situação','Observações']],
  ['Contas a pagar',['Data do pagamento','Data de vencimento','Categoria','Subcategoria','Descrição','Fornecedor','Valor (R$)','Forma de pagamento','Situação','Observações']],
  ['Agendamentos',['Data','Horário','Cliente','Veículo / placa','Serviço solicitado','Valor (R$)','Situação','Observações']]
 ];
 for(const [name,headers] of sheets){
  const ws=XLSX.utils.aoa_to_sheet([headers]);
  ws['!cols']=headers.map(h=>({wch:Math.max(16,Math.min(30,h.length+4))}));
  XLSX.utils.book_append_sheet(wb,ws,name);
 }
 XLSX.writeFile(wb,`Modelo_Importacao_Auto_Brilho_${localISODate()}.xlsx`);
 showToast('Planilha-modelo de importação baixada.');
}

async function setupExcelImport(){const input=$('importExcelFile');if(!input)return;const limitNote=$('importLimitNote');if(limitNote)limitNote.textContent=`Limite de importação: até ${IMPORT_MAX_ROWS_PER_SHEET.toLocaleString('pt-BR')} linhas por aba e ${IMPORT_MAX_ROWS_TOTAL.toLocaleString('pt-BR')} no total (a linha do cabeçalho não conta). O Excel em si aceita até 1.048.576 linhas (.xlsx) ou 65.536 (.xls), mas o aplicativo grava linha a linha na nuvem; acima de 2.000 linhas a importação pode levar vários minutos, então mantenha a tela aberta. Use datas em dd/mm/aaaa ou células de data do Excel.`;input.onchange=async()=>{const file=input.files?.[0];if(!file)return;try{stagedExcelImport=await stageExcelFile(file);const d=stagedExcelImport;const preview=$('importPreview');preview.innerHTML=`<h3>Conferência antes de importar</h3><p>Arquivo: ${esc(file.name)}</p><ul><li>${d.clients.length} cadastros de clientes (incluindo nomes repetidos para conferência)</li><li>${d.vehicles.length} veículos</li><li>${d.services.length} serviços (incluindo ${d.services.filter(s=>normalizeText(s.client)==='nao identificado').length} sem vínculo automático, que serão preservados como “Não identificado”)</li><li>${d.payments.length} movimentos de recebimento para conciliação com os serviços</li><li>${d.expenses.length} despesas / contas a pagar</li><li>${d.appointments.length} agendamentos</li></ul>${(d.warnings&&d.warnings.length)?`<div class="alert-panel"><strong>Atenção: confira antes de confirmar</strong>${d.warnings.map(w=>`<p>${esc(w)}</p>`).join('')}</div>`:''}<p class="muted small">Linhas lidas na planilha: ${Number(d.totalRows||0).toLocaleString('pt-BR')}.</p><p class="muted">O sistema compara os registros existentes antes de gravar. Pagamentos vinculados a serviços serão conciliados para evitar duplicidade. Faça backup antes de confirmar.</p><button class="primary wide" id="confirmExcelImport" type="button">Confirmar importação</button><button class="secondary wide" id="cancelExcelImport" type="button">Cancelar</button>`;preview.classList.remove('hidden');$('confirmExcelImport').onclick=importStagedExcel;$('cancelExcelImport').onclick=()=>{stagedExcelImport=null;preview.classList.add('hidden');input.value='';};}catch(err){showToast('Não foi possível ler a planilha: '+err.message);console.error(err);}};}

async function exportExcel(){
 const status=$('exportStatus');status.textContent='Preparando relatórios...';
 try{const wb=XLSX.utils.book_new();const [clients,vehicles,services,appointments,payments,expenses]=await Promise.all(['clients','vehicles','services','appointments','payments','expenses'].map(all));
  const sheets=[['Clientes',clients,[['name','Nome'],['phone','Telefone'],['registrationDate','Data de cadastro'],['document','CPF/CNPJ'],['address','Endereço']]],['Veículos',vehicles,[['client','Cliente'],['plate','Placa'],['type','Tipo'],['brand','Marca'],['model','Modelo'],['color','Cor']]],['Serviços',services,[['date','Data'],['client','Cliente'],['vehicle','Veículo/placa'],['service','Serviço'],['value','Valor'],['status','Situação'],['paymentStatus','Pagamento'],['paymentMethod','Forma']]],['Agendamentos',appointments,[['date','Data'],['time','Horário'],['client','Cliente'],['vehicle','Veículo'],['service','Serviço'],['value','Valor'],['status','Situação']]],['Pagamentos',payments,[['date','Data'],['client','Cliente'],['description','Descrição'],['method','Forma'],['value','Valor'],['status','Situação']]],['Despesas',expenses,[['date','Data pagamento'],['dueDate','Vencimento'],['category','Categoria'],['subcategory','Subcategoria'],['description','Descrição'],['supplier','Fornecedor'],['value','Valor'],['payment','Forma'],['paymentStatus','Situação']]]];
  for(const [name,rows,cols] of sheets){const data=rows.map(r=>Object.fromEntries(cols.map(([k,l])=>[l,(k==='date'||k==='dueDate')?dateBR(r[k]):r[k]??''])));const ws=XLSX.utils.json_to_sheet(data);XLSX.utils.book_append_sheet(wb,ws,name);}
  const movementRaw=[...payments.filter(p=>p.status!=='Estornado').map(p=>({iso:p.date,Data:dateBR(p.date),Tipo:'Entrada',Situação:p.status,Descrição:p.description,Cliente:p.client,Valor:Number(p.value||0)})),...expenses.map(e=>{const iso=e.paymentStatus==='Pago'?(e.date||e.paidAt):(e.dueDate||e.date);return {iso,Data:dateBR(iso),Tipo:'Saída',Situação:e.paymentStatus,Descrição:e.description,Fornecedor:e.supplier||e.category,Valor:Number(e.value||0)};})].sort((a,b)=>String(b.iso).localeCompare(String(a.iso)));const movement=movementRaw.map(({iso,...r})=>r);XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(movement),'Movimento financeiro');
  const openPayables=expenses.filter(e=>['Em aberto','Pendente'].includes(e.paymentStatus)).map(e=>({Vencimento:dateBR(e.dueDate||e.date),Categoria:e.category,Subcategoria:e.subcategory,Descrição:e.description,Fornecedor:e.supplier,Valor:Number(e.value||0),Situação:e.paymentStatus}));XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(openPayables),'Contas a pagar');
  XLSX.writeFile(wb,`Auto_Brilho_Relatorios_${localISODate()}.xlsx`);status.textContent='Relatórios gerados com movimento financeiro unificado.';showToast('Excel exportado.');
 }catch(e){status.textContent='Falha ao gerar relatório: '+e.message;}
}

// Inicialização da aba Relatórios e lembretes de vencimento.

/* ===== v21: perfis de acesso, configurações, taxas, meta, extras e aviso de pronto ===== */
const EMPLOYEE_TABS=['clients','retorno','services'];
const READY_STATUS='Pronto para retirada';
const APP_DEFAULT_SETTINGS={fees:{'Pix':0,'Cartão':0,'Cartão de débito':0,'Cartão de crédito':0},goal:{monthly:0},feesSince:''};
let appSettings=JSON.parse(JSON.stringify(APP_DEFAULT_SETTINGS));
let currentRole='dono';
const isEmployee=()=>currentRole==='funcionario';
function applySession(user){
 // Perfil vem de app_metadata.role (só pode ser alterado pelo painel do Supabase). Sem perfil = dono.
 const role=String((user&&user.app_metadata&&user.app_metadata.role)||'').toLowerCase();
 currentRole=role==='funcionario'?'funcionario':'dono';
 document.body.classList.toggle('role-funcionario',currentRole==='funcionario');
 let src=(user&&user.user_metadata&&user.user_metadata.ab_settings)||null;
 if(!src){try{src=JSON.parse(localStorage.getItem('ab_settings')||'null');}catch(e){src=null;}}
 src=src||{};
 appSettings={fees:{...APP_DEFAULT_SETTINGS.fees,...(src.fees||{})},goal:{...APP_DEFAULT_SETTINGS.goal,...(src.goal||{})},feesSince:src.feesSince||''};
}
async function persistSettings(){
 try{localStorage.setItem('ab_settings',JSON.stringify(appSettings));}catch(e){}
 const {error}=await sbClient.auth.updateUser({data:{ab_settings:appSettings}});
 if(error)throw error;
}
function feeRate(method){const v=Number(appSettings.fees&&appSettings.fees[method]);return Number.isFinite(v)&&v>0?v:0;}
function feeFields(method,value,status){const pct=status==='Pago'?feeRate(method):0;return pct>0?{feePercent:pct,fee:Math.round(Number(value||0)*pct)/100}:{};}
function feeOf(p){
 if(p.status!=='Pago')return 0;
 if(p.fee!==undefined&&p.fee!==null&&p.fee!=='')return Number(p.fee)||0;
 // Sem taxa gravada: usa a taxa atual, só a partir da data em que as taxas passaram a valer.
 if(appSettings.feesSince&&String(p.date||'')>=appSettings.feesSince)return Math.round(Number(p.value||0)*feeRate(p.method))/100;
 return 0;
}

// Serviços lançados pelo funcionário não geram pagamento na hora (ele não acessa o financeiro):
// o dono concilia ao abrir o app ou quando o aviso em tempo real chega.
let reconcileBusy=false;
async function reconcileEmployeeServices(){
 if(isEmployee()||reconcileBusy)return 0;
 reconcileBusy=true;
 try{
  const pending=(await all('services')).filter(s=>s.financeSyncPending);
  for(const s of pending){
   if(s.status==='Concluído')await syncServicePayment(s);else await cancelLinkedServicePayment(s.id);
   const {financeSyncPending,...clean}=s;
   await save('services',clean);
  }
  return pending.length;
 }catch(err){console.error('Conciliação dos serviços lançados pelo funcionário:',err);return 0;}
 finally{reconcileBusy=false;}
}

function goalCardHtml(services,payments,expenses){
 const goal=Number(appSettings.goal&&appSettings.goal.monthly||0)||localDailyGoal();
 const today=localISODate(),key=today.slice(0,7);
 const [Y,M,D]=today.split('-').map(Number);const daysInMonth=new Date(Y,M,0).getDate();
 const inMonth=d=>String(d||'').slice(0,7)===key;
 const revenue=services.filter(s=>s.status==='Concluído'&&inMonth(s.date)).reduce((n,s)=>n+Number(s.value||0),0)+payments.filter(p=>!p.serviceId&&p.kind!=='credito'&&p.status==='Pago'&&inMonth(p.date)).reduce((n,p)=>n+Number(p.value||0),0);
 const monthExpenses=expenses.filter(e=>e.paymentStatus==='Pago'?inMonth(e.date||e.paidAt):((e.paymentStatus==='Em aberto'||e.paymentStatus==='Pendente')&&inMonth(e.dueDate))).reduce((n,e)=>n+Number(e.value||0),0);
 const cover=monthExpenses>0?(revenue>=monthExpenses?`O faturamento já cobre as despesas do mês (${money(monthExpenses)}).`:`Faltam ${money(monthExpenses-revenue)} para cobrir as despesas do mês (${money(monthExpenses)}).`):'';
 if(!goal)return `<div class="goal-card"><strong>Meta do mês</strong><p class="muted small">Faturado no mês: ${money(revenue)}. Defina a meta em Financeiro → “Taxas de cartão e meta do mês”.</p>${cover?`<p class="muted small">${cover}</p>`:''}</div>`;
 const pct=Math.min(100,revenue/goal*100),left=Math.max(0,goal-revenue),daysLeft=daysInMonth-D+1;
 const perDay=daysLeft>0?left/daysLeft:0,projection=D>0?revenue/D*daysInMonth:0;
 return `<div class="goal-card"><strong>Meta do mês: ${money(goal)}</strong><div class="goal-bar"><div style="width:${pct.toFixed(1)}%"></div></div><p>${money(revenue)} faturados (${pct.toFixed(0)}%) · ${left>0?'faltam '+money(left):'meta batida! 🎉'}</p><p class="muted small">${left>0?`Para chegar lá: ${money(perDay)} por dia nos ${daysLeft} dia(s) restantes. `:''}Projeção no ritmo atual: ${money(projection)}.${cover?' '+cover:''}</p></div>`;
}

function readyMessage(service,car){
 const first=String(service.client||'').trim().split(/\s+/)[0]||'cliente';
 return `Olá, ${first}! Seu ${car||'veículo'}${service.vehicle?' ('+service.vehicle+')':''} está pronto para retirada na Auto Brilho. 🚗✨ Pode vir buscar quando quiser!`;
}
function readyLink(phone,service,car){return phone?waUrl(phone,readyMessage(service,car)):'';}
async function readyContext(){const [clients,vehicles]=await Promise.all([all('clients'),all('vehicles')]);return {clients,vehicles};}
function readyLinkFor(ctx,service){
 const c=ctx.clients.find(x=>sameClient(x.name,service.client)&&waPhone(x.phone))||ctx.clients.find(x=>sameClient(x.name,service.client));
 const v=ctx.vehicles.find(x=>normalizePlate(x.plate)===normalizePlate(service.vehicle));
 const car=v?([v.brand,v.model].filter(Boolean).join(' ')||'veículo'):'veículo';
 return readyLink(waPhone(c&&c.phone),service,car);
}
async function buildReadyLinks(rows){
 const map=new Map();const ready=rows.filter(r=>r.status===READY_STATUS);
 if(!ready.length)return map;
 try{const ctx=await readyContext();ready.forEach(r=>map.set(r.id,readyLinkFor(ctx,r)));}catch(e){console.error(e);}
 return map;
}
async function showReadyNotice(service){
 let href='';
 try{href=readyLinkFor(await readyContext(),service);}catch(e){console.error(e);}
 $('formWrap').style.display='';$('formWrap').classList.remove('hidden');
 $('formWrap').innerHTML=`<div class="ready-notice"><h3>Serviço salvo: pronto para retirada</h3><p>${esc(service.client||'')} · ${esc(service.vehicle||'')}</p><div class="return-actions">${href?`<a class="wa-link" ${waAnchor(href)}>Avisar cliente no WhatsApp</a>`:'<span class="wa-link disabled">Cliente sem telefone válido</span>'}<button type="button" class="secondary" id="closeReadyNotice">Fechar</button></div></div>`;
 $('closeReadyNotice').onclick=()=>{$('formWrap').classList.add('hidden');$('formWrap').innerHTML='';};
}

/* ===== v22: Serviços do dia, WhatsApp Business e edição de cliente ===== */
function waAppPref(){try{return localStorage.getItem('ab_wa_app')||'business';}catch(e){return 'business';}}
function waUrl(phone,text){
 // No Android, o link abre direto o WhatsApp Business (com retorno ao WhatsApp comum se ele não estiver instalado).
 // No iPhone e no computador o sistema escolhe o app; não há como forçar o Business por link.
 const web='https://wa.me/'+phone+'?text='+encodeURIComponent(text);
 const ua=(typeof navigator!=='undefined'&&navigator.userAgent)||'';
 if(waAppPref()==='business'&&/Android/i.test(ua))return 'intent://send?phone='+phone+'&text='+encodeURIComponent(text)+'#Intent;scheme=whatsapp;package=com.whatsapp.w4b;S.browser_fallback_url='+encodeURIComponent(web)+';end';
 return web;
}
const waAnchor=url=>`href="${esc(url)}"${/^https?:/.test(url)?' target="_blank" rel="noopener"':''}`;

let svcRange='today', svcDay='', svcStatus='all';
const SVC_ORDER=['Aguardando','Em andamento',READY_STATUS,'Concluído','Cancelado'];
const SVC_NEXT={'Aguardando':'Em andamento','Em andamento':READY_STATUS};
const SVC_NEXT_LABEL={'Aguardando':'Iniciar','Em andamento':'Marcar pronto',[READY_STATUS]:'Concluir e receber'};
function addDaysISO(iso,n){const d=new Date(iso+'T12:00:00');d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function svcBounds(){
 const today=localISODate();
 if(svcRange==='day'&&svcDay)return [svcDay,svcDay];
 if(svcRange==='yesterday'){const y=addDaysISO(today,-1);return [y,y];}
 if(svcRange==='week')return [addDaysISO(today,-6),today];
 if(svcRange==='month')return [today.slice(0,7)+'-01',today.slice(0,7)+'-31'];
 if(svcRange==='all')return ['',''];
 return [today,today];
}
async function renderServicesPanel(){
 try{
  const services=await all('services');
  const rawQ=$('searchInput').value, q=normalizeText(rawQ), plateQ=normalizePlate(rawQ);
  const searching=!!q;
  const [from,to]=svcBounds();
  const stOf=s=>s.status||'Concluído';
  const inRange=s=>!from||(String(s.date||'')>=from&&String(s.date||'')<=to);
  const base=services.filter(s=>searching?(normalizeText([s.client,s.vehicle,s.service].join(' ')).includes(q)||(plateQ.length>=3&&normalizePlate(s.vehicle).includes(plateQ))):inRange(s));
  const cnt=st=>base.filter(s=>stOf(s)===st).length;
  const open=base.filter(s=>['Aguardando','Em andamento',READY_STATUS].includes(stOf(s)));
  const done=base.filter(s=>stOf(s)==='Concluído');
  const sum=a=>a.reduce((n,s)=>n+Number(s.value||0),0);
  const cmp=(a,b)=>{const oa=SVC_ORDER.indexOf(stOf(a)),ob=SVC_ORDER.indexOf(stOf(b));if(oa!==ob)return oa-ob;const ka=String(a.createdAt||a.date||''),kb=String(b.createdAt||b.date||'');return oa<3?ka.localeCompare(kb):kb.localeCompare(ka);};
  const list=base.filter(s=>svcStatus==='all'||stOf(s)===svcStatus).sort(cmp);
  const shown=list.slice(0,100);
  const links=await buildReadyLinks(shown);
  const rangeChip=(k,label)=>`<button type="button" class="filter-chip ${!searching&&svcRange===k?'active':''}" data-srange="${k}">${label}</button>`;
  const stChip=(k,label,n)=>`<button type="button" class="filter-chip ${svcStatus===k?'active':''}" data-sstatus="${k}">${label} (${n})</button>`;
  const multiDay=searching||from!==to;
  const rangeLabel=searching?'todas as datas (busca)':svcRange==='today'?'hoje':svcRange==='yesterday'?'ontem':svcRange==='week'?'últimos 7 dias':svcRange==='month'?'este mês':svcRange==='all'?'todo o período':dateBR(svcDay);
  const money$=!isEmployee();
  $('tableWrap').innerHTML=`<div class="filter-chips">${rangeChip('today','Hoje')}${rangeChip('yesterday','Ontem')}${rangeChip('week','7 dias')}${rangeChip('month','Mês')}${rangeChip('all','Todos')}<input type="date" id="svcDayInput" class="svc-day" value="${esc(svcRange==='day'?svcDay:'')}" aria-label="Escolher data"></div>
   <div class="dashboard-metrics compact" style="margin-bottom:10px"><div class="dashboard-metric"><span>Serviços (${esc(rangeLabel)})</span><strong>${base.length-cnt('Cancelado')}</strong></div><div class="dashboard-metric"><span>No pátio agora</span><strong>${open.length}</strong></div>${money$?`<div class="dashboard-metric"><span>Concluídos</span><strong>${money(sum(done))}</strong></div><div class="dashboard-metric"><span>A receber</span><strong>${money(sum(done.filter(s=>s.paymentStatus==='Pendente')))}</strong></div>`:''}</div>
   <div class="filter-chips chips-scroll">${stChip('all','Todos',base.length)}${stChip('Aguardando','Aguardando',cnt('Aguardando'))}${stChip('Em andamento','Em andamento',cnt('Em andamento'))}${stChip(READY_STATUS,'Prontos',cnt(READY_STATUS))}${stChip('Concluído','Concluídos',cnt('Concluído'))}${stChip('Cancelado','Cancelados',cnt('Cancelado'))}</div>
   ${shown.length?`<div class="svc-list">${shown.map(s=>{
    const st=stOf(s),ex=Array.isArray(s.extras)&&s.extras.length?` <span class="muted">(+ ${esc(s.extras.map(x=>x.description).join(', '))})</span>`:'';
    const next=st===READY_STATUS?'Concluir e receber':SVC_NEXT[st]?SVC_NEXT_LABEL[st]:'';
    const pay=st==='Concluído'?[s.paymentStatus,(Array.isArray(s.paymentSplits)&&s.paymentSplits.length>1?s.paymentSplits.map(x=>x.method+' '+money(x.value)).join(' + '):s.paymentMethod)].filter(Boolean).join(' · '):'';
    return `<article class="svc-card"><div class="svc-head"><strong>${esc(normalizePlate(s.vehicle)||s.vehicle||'Sem placa')}</strong><span class="status-badge st-${normalizeText(st).replace(/[^a-z]+/g,'-')}">${esc(st)}</span></div><div>${esc(s.client||'Cliente não informado')} · ${esc(s.service||'Serviço')}${ex}</div><div class="muted small">${multiDay?dateBR(s.date)+' · ':''}${money(s.value)}${pay?' · '+esc(pay):''}</div><div class="svc-actions">${next?`<button type="button" class="primary small-btn" data-svc-next="${esc(s.id)}">${next}</button>`:''}${links.get(s.id)?`<a class="action wa-small" ${waAnchor(links.get(s.id))}>Avisar cliente</a>`:''}<button type="button" class="action" data-svc-edit="${esc(s.id)}">Editar</button><button type="button" class="action" data-delete="${esc(s.id)}">Excluir</button></div></article>`;}).join('')}</div>${list.length>shown.length?`<p class="muted small">Mostrando 100 de ${list.length}. Use a busca ou o filtro de data para refinar.</p>`:''}`:`<div class="empty">${searching?'Nenhum serviço encontrado para esta busca.':'Nenhum serviço neste período. Toque em “+ Novo serviço” para lançar.'}</div>`}`;
  const again=()=>renderServicesPanel();
  $('tableWrap').querySelectorAll('[data-srange]').forEach(b=>b.onclick=()=>{svcRange=b.dataset.srange;svcDay='';$('searchInput').value='';again();});
  $('svcDayInput').onchange=e=>{if(e.target.value){svcDay=e.target.value;svcRange='day';$('searchInput').value='';again();}};
  $('tableWrap').querySelectorAll('[data-sstatus]').forEach(b=>b.onclick=()=>{svcStatus=b.dataset.sstatus;again();});
  $('tableWrap').querySelectorAll('[data-svc-edit]').forEach(b=>b.onclick=()=>{const s=services.find(x=>x.id===b.dataset.svcEdit);if(s)renderForm(s);});
  $('tableWrap').querySelectorAll('[data-svc-next]').forEach(b=>b.onclick=async()=>{
   const s=services.find(x=>x.id===b.dataset.svcNext);if(!s)return;
   const next=SVC_NEXT[stOf(s)];
   if(!next){renderForm({...s,status:'Concluído'});return;} // Pronto -> Concluído pede os dados do pagamento
   b.disabled=true;
   try{
    const saved=await save('services',{...s,status:next,...(isEmployee()?{financeSyncPending:true}:{})});
    showToast(next===READY_STATUS?'Serviço pronto para retirada.':'Serviço em andamento.');
    if(next===READY_STATUS)await showReadyNotice(saved);
    await again();
   }catch(err){showToast('Não foi possível atualizar: '+(err.message||'verifique a conexão.'));b.disabled=false;}
  });
  $('tableWrap').querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{
   if(!confirm('Deseja realmente excluir este serviço da nuvem?'))return;
   try{await cancelLinkedServicePayment(b.dataset.delete);await remove('services',b.dataset.delete);showToast('Serviço excluído.');await again();if(!isEmployee())await renderStats();}
   catch(err){showToast('Erro ao excluir: '+err.message);}
  });
 }catch(err){$('tableWrap').innerHTML='<div class="empty">Não foi possível carregar os serviços. Verifique a conexão.</div>';console.error(err);}
}

function renderClientEditForm(c){
 editId=c.id;
 $('formWrap').style.display='';$('formWrap').classList.remove('hidden');
 $('formWrap').innerHTML=`<form id="clientEditForm"><h3>Editar cliente</h3><div class="form-grid">
  <div class="field"><label>Nome completo *</label><input name="name" required value="${esc(c.name||'')}"></div>
  <div class="field"><label>Telefone / WhatsApp</label><input name="phone" type="tel" value="${esc(c.phone||'')}"></div>
  <div class="field"><label>Data de cadastramento</label><input name="registrationDate" type="date" value="${esc(c.registrationDate||'')}"></div>
  <div class="field"><label>E-mail</label><input name="email" type="email" value="${esc(c.email||'')}"></div>
  <div class="field"><label>CPF / CNPJ</label><input name="document" value="${esc(c.document||'')}"></div>
  <div class="field"><label>Endereço</label><input name="address" value="${esc(c.address||'')}"></div>
  <div class="field" style="grid-column:1/-1"><label>Observações</label><textarea name="notes" rows="2">${esc(c.notes||'')}</textarea></div>
 </div><p class="muted small">Se o nome for alterado, os veículos e o histórico de serviços deste cliente passam a usar o novo nome.</p>
 <div class="form-actions"><button type="button" class="secondary" id="cancelClientEdit">Cancelar</button><button class="primary" type="submit">Salvar alterações</button></div></form>`;
 const form=$('clientEditForm');
 $('cancelClientEdit').onclick=()=>{$('formWrap').classList.add('hidden');editId=null;};
 form.onsubmit=async e=>{
  e.preventDefault();const btn=form.querySelector('[type=submit]');btn.disabled=true;
  try{
   const d=Object.fromEntries(new FormData(form).entries());
   const newName=String(d.name||'').trim();if(!newName)throw new Error('Informe o nome do cliente.');
   const clients=await all('clients');
   if(clients.some(x=>x.id!==c.id&&sameClient(x.name,newName))&&!confirm(`Já existe outro cliente chamado “${newName}”. Salvar mesmo assim?`)){btn.disabled=false;return;}
   const renamed=!sameClient(c.name,newName);
   await save('clients',{...c,name:newName,phone:d.phone||'',registrationDate:d.registrationDate||'',email:d.email||'',document:d.document||'',address:d.address||'',notes:d.notes||''});
   if(renamed){showToast('Atualizando o histórico do cliente...');await cascadeClientRename(c.id,c.name,newName);}
   $('formWrap').classList.add('hidden');editId=null;showToast('Cliente atualizado.');
   await renderClientVehicleTable();
  }catch(err){showToast('Não foi possível salvar: '+(err.message||'verifique os dados.'));btn.disabled=false;}
 };
}

/* ===== v23: zerar dados (somente dono) ===== */
const RESET_LABELS={services:'serviços',payments:'pagamentos',expenses:'despesas e contas a pagar',appointments:'agendamentos',vehicles:'veículos',clients:'clientes'};
const RESET_ORDER_KEEP=['services','payments','expenses','appointments'];
const RESET_ORDER_ALL=[...RESET_ORDER_KEEP,'vehicles','clients'];
async function wipeData(mode,onStatus){
 if(isEmployee())throw new Error('Somente o dono pode zerar os dados.');
 const stores=mode==='all'?RESET_ORDER_ALL:RESET_ORDER_KEEP;
 const deleted={};
 for(const store of stores){
  if(onStatus)onStatus(`Apagando ${RESET_LABELS[store]}...`);
  invalidateCache(store);
  deleted[store]=(await all(store)).length;
  const {error}=await sbClient.from(store).delete().not('id','is',null);
  if(error)throw new Error(`${RESET_LABELS[store]}: ${error.message}`);
  invalidateCache(store);
 }
 // Conferência: um apagamento barrado por permissão não gera erro, então confirmamos o que sobrou.
 if(onStatus)onStatus('Conferindo...');
 const remaining={};
 for(const store of stores){invalidateCache(store);const n=(await all(store)).length;if(n>0)remaining[store]=n;}
 return {deleted,remaining};
}
function renderResetPanel(){
 const box=$('resetPanel');
 box.classList.remove('hidden');
 box.innerHTML=`<div class="reset-panel"><h3>Zerar dados do aplicativo</h3>
  <div class="field reset-modes"><label><input type="radio" name="resetMode" value="keep" checked> Manter cadastros (clientes e veículos) e apagar o restante</label><label><input type="radio" name="resetMode" value="all"> Apagar tudo, inclusive clientes e veículos</label></div>
  <p id="resetCounts" class="muted small">Contando registros...</p>
  <ol class="small"><li>Baixe o backup completo: <button type="button" class="secondary" id="resetBackupBtn">Baixar backup agora</button><br><span id="resetBackupState" class="muted small">Backup ainda não baixado.</span></li>
   <li><label><input type="checkbox" id="resetBackupOk" disabled> Guardei o arquivo de backup em local seguro</label></li>
   <li>Digite <b>ZERAR</b> para confirmar: <input id="resetWord" autocomplete="off" disabled style="max-width:140px"></li></ol>
  <div class="form-actions"><button type="button" class="secondary" id="resetCancel">Cancelar</button><button type="button" class="danger-action" id="resetGo" disabled>Apagar definitivamente</button></div>
  <p id="resetStatus" class="small"></p></div>`;
 const mode=()=>box.querySelector('input[name=resetMode]:checked').value;
 let counts={};
 const refreshCounts=()=>{
  const stores=mode()==='all'?RESET_ORDER_ALL:RESET_ORDER_KEEP;
  const del=stores.map(s=>`${counts[s]??0} ${RESET_LABELS[s]}`).join(', ');
  const keep=mode()==='all'?'Nada será mantido.':`Serão mantidos: ${counts.clients??0} clientes e ${counts.vehicles??0} veículos.`;
  $('resetCounts').textContent=`Serão apagados: ${del}. ${keep}`;
 };
 (async()=>{try{for(const s of RESET_ORDER_ALL){invalidateCache(s);counts[s]=(await all(s)).length;}refreshCounts();}catch(e){$('resetCounts').textContent='Não foi possível contar os registros: '+e.message;}})();
 box.querySelectorAll('input[name=resetMode]').forEach(r=>r.onchange=refreshCounts);
 const update=()=>{$('resetWord').disabled=!$('resetBackupOk').checked;$('resetGo').disabled=!($('resetBackupOk').checked&&$('resetWord').value.trim().toUpperCase()==='ZERAR');};
 $('resetBackupBtn').onclick=async()=>{
  $('resetBackupBtn').disabled=true;$('resetBackupState').textContent='Gerando backup...';
  const done=await backupJSON();
  $('resetBackupBtn').disabled=false;
  if(done){$('resetBackupState').textContent=`Backup baixado (Auto_Brilho_Backup_${localISODate()}.json). Confira o arquivo na pasta de downloads.`;$('resetBackupOk').disabled=false;}
  else{$('resetBackupState').textContent='Não foi possível gerar o backup. Tente de novo; sem backup a limpeza fica bloqueada.';}
  update();
 };
 $('resetBackupOk').onchange=update;$('resetWord').oninput=update;
 $('resetCancel').onclick=()=>{box.classList.add('hidden');box.innerHTML='';};
 $('resetGo').onclick=async()=>{
  const m=mode();
  if(!confirm(m==='all'?'ÚLTIMO AVISO: todos os dados (clientes, veículos, serviços, financeiro e agendamentos) serão apagados para sempre. Continuar?':'ÚLTIMO AVISO: serviços, pagamentos, despesas, contas a pagar e agendamentos serão apagados para sempre. Os clientes e veículos serão mantidos. Continuar?'))return;
  $('resetGo').disabled=true;$('resetCancel').disabled=true;$('resetWord').disabled=true;$('resetBackupBtn').disabled=true;
  try{
   const r=await wipeData(m,t=>{$('resetStatus').textContent=t;});
   const left=Object.entries(r.remaining);
   if(left.length){
    $('resetStatus').innerHTML=`<strong>Atenção:</strong> alguns registros não foram apagados (${esc(left.map(([s,n])=>n+' '+RESET_LABELS[s]).join(', '))}). Provavelmente uma regra de permissão do banco impediu. Os demais foram apagados.`;
   }else{
    $('resetStatus').innerHTML=`<strong>Base zerada.</strong> Apagados: ${esc(Object.entries(r.deleted).map(([s,n])=>n+' '+RESET_LABELS[s]).join(', '))}.${m==='keep'?' Clientes e veículos foram mantidos.':''}`;
   }
   showToast(left.length?'Limpeza concluída com avisos.':'Base zerada.');
   invalidateCache();await renderStats();await renderFinancialMovement();
  }catch(err){
   $('resetStatus').textContent='Não foi possível concluir: '+(err.message||'verifique a conexão.')+' Parte dos dados pode ter sido apagada; confira os números e repita se necessário.';
   showToast('Erro ao zerar os dados.');
  }finally{$('resetCancel').disabled=false;$('resetCancel').textContent='Fechar';}
 };
}

/* ===== v24: duplicados, mesclagem e propagação de alterações de cadastro ===== */
let cadastroView='list';
async function cascadeClientRename(clientId,oldName,newName){
 const [vs,ss,ps,as]=await Promise.all([all('vehicles'),all('services'),all('payments'),all('appointments')]);
 for(const v of vs.filter(x=>x.clientId===clientId||(!x.clientId&&sameClient(x.client,oldName))))if(v.client!==newName)await save('vehicles',{...v,client:newName,clientId:clientId});
 for(const s of ss.filter(x=>sameClient(x.client,oldName)&&x.client!==newName))await save('services',{...s,client:newName});
 for(const p of ps.filter(x=>sameClient(x.client,oldName)&&x.client!==newName))await save('payments',{...p,client:newName});
 for(const a of as.filter(x=>sameClient(x.client,oldName)&&x.client!==newName))await save('appointments',{...a,client:newName});
}
async function cascadePlateChange(oldPlate,newPlate){
 const o=normalizePlate(oldPlate),n=normalizePlate(newPlate);
 if(!o||!n||o===n)return;
 const [ss,as]=await Promise.all([all('services'),all('appointments')]);
 for(const s of ss.filter(x=>normalizePlate(x.vehicle)===o))await save('services',{...s,vehicle:n});
 for(const a of as.filter(x=>normalizePlate(x.vehicle)===o))await save('appointments',{...a,vehicle:n});
}
const filled=o=>Object.entries(o).filter(([k,v])=>!['id','createdAt','updatedAt','clientId'].includes(k)&&String(v??'').trim()!=='').length;
const phoneKey=v=>{const d=String(v||'').replace(/\D/g,'');return d.length>=10?(d.length>11?d.slice(-11):d):'';};
function findDuplicateGroups(clients,vehicles){
 const groups=[];const by=(list,keyFn)=>{const m=new Map();list.forEach(x=>{const k=keyFn(x);if(!k)return;const a=m.get(k);if(a)a.push(x);else m.set(k,[x]);});return [...m].filter(([,a])=>a.length>1);};
 by(clients,c=>normalizeText(c.name)).forEach(([k,a])=>groups.push({type:'client',kind:'name',key:k,label:`Mesmo nome: ${a[0].name}`,members:a}));
 by(clients,c=>phoneKey(c.phone)).forEach(([k,a])=>{if(new Set(a.map(c=>normalizeText(c.name))).size>1)groups.push({type:'client',kind:'phone',key:k,label:`Mesmo telefone: ${a.map(c=>c.name).join(' / ')}`,members:a});});
 by(vehicles,v=>{const p=normalizePlate(v.plate);return p.length>=5?p:'';}).forEach(([k,a])=>groups.push({type:'vehicle',kind:'plate',key:k,label:`Mesma placa: ${k}`,members:a}));
 groups.forEach(g=>{g.id=g.type+'-'+g.kind+':'+g.key;});
 return groups;
}
function dupIgnored(){try{return new Set(JSON.parse(localStorage.getItem('ab_dup_ignored')||'[]'));}catch(e){return new Set();}}
function dupIgnore(id){const s=dupIgnored();s.add(id);try{localStorage.setItem('ab_dup_ignored',JSON.stringify([...s]));}catch(e){}}
async function mergeClients(primary,others,onStatus){
 const [vehicles,services,payments,appointments]=await Promise.all([all('vehicles'),all('services'),all('payments'),all('appointments')]);
 const merged={...primary};
 for(const o of others){
  ['phone','email','document','address','notes'].forEach(f=>{if(!String(merged[f]||'').trim()&&String(o[f]||'').trim())merged[f]=o[f];});
  if(o.registrationDate&&(!merged.registrationDate||o.registrationDate<merged.registrationDate))merged.registrationDate=o.registrationDate;
  if(o.lastContactAt&&(!merged.lastContactAt||o.lastContactAt>merged.lastContactAt))merged.lastContactAt=o.lastContactAt;
 }
 await save('clients',merged);
 const sameNameAsPrimary=o=>sameClient(o.name,primary.name);
 let own=vehicles.filter(v=>v.clientId===primary.id||(!v.clientId&&sameClient(v.client,primary.name)));
 for(const o of others){
  if(onStatus)onStatus(`Mesclando “${o.name}”...`);
  const moving=vehicles.filter(v=>v.clientId===o.id||(!v.clientId&&sameClient(v.client,o.name)&&!sameNameAsPrimary(o)));
  for(const v of moving){
   const twin=own.find(x=>x.id!==v.id&&normalizePlate(x.plate)&&normalizePlate(x.plate)===normalizePlate(v.plate));
   if(twin){
    const fill={...twin};['type','brand','model','color','notes'].forEach(f=>{if(!String(fill[f]||'').trim()&&String(v[f]||'').trim())fill[f]=v[f];});
    await save('vehicles',fill);await remove('vehicles',v.id);
   }else{const moved={...v,clientId:primary.id,client:primary.name};await save('vehicles',moved);own.push(moved);}
  }
  if(!sameNameAsPrimary(o)){
   for(const s of services.filter(x=>sameClient(x.client,o.name)))await save('services',{...s,client:primary.name});
   for(const p of payments.filter(x=>sameClient(x.client,o.name)))await save('payments',{...p,client:primary.name});
   for(const a of appointments.filter(x=>sameClient(x.client,o.name)))await save('appointments',{...a,client:primary.name});
  }
  await remove('clients',o.id);
 }
}
async function mergeVehicles(primary,others){
 const merged={...primary};
 for(const o of others)['type','brand','model','color','notes'].forEach(f=>{if(!String(merged[f]||'').trim()&&String(o[f]||'').trim())merged[f]=o[f];});
 await save('vehicles',merged);
 for(const o of others)await remove('vehicles',o.id);
}
async function renderDuplicatesPanel(){
 try{
  invalidateCache();
  const [clients,vehicles,services]=await Promise.all([all('clients'),all('vehicles'),all('services')]);
  const ignored=dupIgnored();
  const all$=findDuplicateGroups(clients,vehicles),groups=all$.filter(g=>!ignored.has(g.id));
  const svcCount=n=>services.filter(s=>sameClient(s.client,n)).length;
  const vehCount=c=>vehicles.filter(v=>v.clientId===c.id||(!v.clientId&&sameClient(v.client,c.name))).length;
  const plateSvc=p=>services.filter(s=>normalizePlate(s.vehicle)===normalizePlate(p)).length;
  const score=(g,m)=>g.type==='client'?svcCount(m.name)*100+filled(m)*10:plateSvc(m.plate)*100+filled(m)*10;
  groups.forEach(g=>g.members.sort((a,b)=>score(g,b)-score(g,a)||String(a.createdAt||'').localeCompare(String(b.createdAt||''))));
  const memberHtml=(g,m,i)=>g.type==='client'
   ?`<label class="dup-member"><input type="radio" name="keep-${esc(g.id)}" value="${esc(m.id)}" ${i===0?'checked':''}><span><strong>${esc(m.name)}</strong><br><span class="muted small">${esc(m.phone||'sem telefone')}${m.document?' · '+esc(m.document):''}${m.email?' · '+esc(m.email):''}<br>${vehCount(m)} veículo(s) · ${svcCount(m.name)} serviço(s)${m.registrationDate?' · cadastro '+dateBR(m.registrationDate):''}</span></span></label>`
   :`<label class="dup-member"><input type="radio" name="keep-${esc(g.id)}" value="${esc(m.id)}" ${i===0?'checked':''}><span><strong>${esc(normalizePlate(m.plate))}</strong> · ${esc([m.brand,m.model,m.color].filter(Boolean).join(' ')||'sem detalhes')}<br><span class="muted small">Proprietário: ${esc(m.client||'não identificado')} · ${plateSvc(m.plate)} serviço(s)</span></span></label>`;
  const sections=[['Clientes com o mesmo nome','client','name'],['Clientes com o mesmo telefone (nomes diferentes)','client','phone'],['Veículos com a mesma placa','vehicle','plate']];
  $('tableWrap').innerHTML=`<div class="return-actions" style="margin-bottom:10px"><button type="button" class="secondary" id="dupBack">← Voltar ao cadastro</button></div>
   <p class="muted small">Escolha qual cadastro manter em cada grupo. Veículos, serviços e financeiro dos outros passam para ele, e os demais são excluídos. Dica: gere um backup em Relatórios antes de mesclar. Telefone igual pode ser de uma mesma família; use “Não é duplicado” nesses casos (fica salvo neste aparelho).</p>
   ${groups.length?sections.map(([title,type,kind])=>{const gs=groups.filter(g=>g.type===type&&g.kind===kind);return gs.length?`<h4>${title} (${gs.length})</h4><div class="svc-list">${gs.map(g=>`<article class="svc-card dup-group" data-gid="${esc(g.id)}"><strong>${esc(g.label)}</strong>${g.members.map((m,i)=>memberHtml(g,m,i)).join('')}<div class="svc-actions"><button type="button" class="primary small-btn" data-dup-merge="${esc(g.id)}">Mesclar no cadastro marcado</button><button type="button" class="action" data-dup-ignore="${esc(g.id)}">Não é duplicado</button></div></article>`).join('')}</div>`:'';}).join(''):'<div class="empty">Nenhum cadastro duplicado encontrado. 🎉</div>'}
   ${all$.length-groups.length?`<p class="muted small">${all$.length-groups.length} grupo(s) marcados como “não é duplicado”. <button type="button" class="action" id="dupRestore">Mostrar novamente</button></p>`:''}
   <p id="dupStatus" class="small"></p>`;
  $('dupBack').onclick=()=>{cadastroView='list';renderClientVehicleTable();};
  const rs=$('dupRestore');if(rs)rs.onclick=()=>{try{localStorage.removeItem('ab_dup_ignored');}catch(e){}renderDuplicatesPanel();};
  $('tableWrap').querySelectorAll('[data-dup-ignore]').forEach(b=>b.onclick=()=>{dupIgnore(b.dataset.dupIgnore);renderDuplicatesPanel();});
  $('tableWrap').querySelectorAll('[data-dup-merge]').forEach(b=>b.onclick=async()=>{
   const g=groups.find(x=>x.id===b.dataset.dupMerge);if(!g)return;
   const keepId=$('tableWrap').querySelector(`input[name="keep-${CSS.escape(g.id)}"]:checked`)?.value;
   const primary=g.members.find(m=>m.id===keepId);const others=g.members.filter(m=>m.id!==keepId);
   if(!primary||!others.length)return;
   const name=g.type==='client'?primary.name:normalizePlate(primary.plate);
   if(!confirm(`Mesclar ${g.members.length} cadastros em “${name}”?\n\nOs outros ${others.length} serão excluídos e seus dados passam para o cadastro mantido. Não dá para desfazer.`))return;
   $('tableWrap').querySelectorAll('button').forEach(x=>x.disabled=true);
   try{
    if(g.type==='client')await mergeClients(primary,others,t=>{$('dupStatus').textContent=t;});else await mergeVehicles(primary,others);
    showToast('Cadastros mesclados.');
   }catch(err){showToast('Não foi possível mesclar: '+(err.message||'verifique a conexão.'));}
   await renderDuplicatesPanel();
  });
 }catch(err){$('tableWrap').innerHTML='<div class="empty">Não foi possível carregar os cadastros. Verifique a conexão.</div>';console.error(err);}
}

/* ===== v24: retomar de onde parou, rascunho do serviço e créditos de clientes ===== */
const UI_STATE_KEY='ab_ui_state', DRAFT_KEY='ab_service_draft', UI_STATE_MAX_AGE=8*3600*1000;
let appActive=false, hiddenAt=0, restoringState=false, uiRestoreDone=false;
const KNOWN_TABS=['home','dashboard','clients','retorno','services','payments','credits','pending','expenses','payables','reports'];
function saveUiState(){
 if(!appActive)return;
 try{localStorage.setItem(UI_STATE_KEY,JSON.stringify({t:Date.now(),active,search:$('searchInput').value,scrollY:window.scrollY||document.documentElement.scrollTop||0,svcRange,svcDay,svcStatus,financeMonth,financeKind,returnDays,returnShowContacted,cadastroView,creditsFilter,dashRange,expMonth}));}catch(e){}
}
function clearServiceDraft(){try{localStorage.removeItem(DRAFT_KEY);}catch(e){}}
function readJson(key){try{return JSON.parse(localStorage.getItem(key)||'null');}catch(e){return null;}}
function restoreUiStateOnce(){
 if(uiRestoreDone)return null;uiRestoreDone=true;
 let st=readJson(UI_STATE_KEY),draft=readJson(DRAFT_KEY);
 if(st&&Date.now()-st.t>=UI_STATE_MAX_AGE)st=null;
 if(draft&&Date.now()-draft.t>=UI_STATE_MAX_AGE)draft=null;
 if(!st&&!draft)return null;
 if(st&&KNOWN_TABS.includes(st.active)&&(!isEmployee()||EMPLOYEE_TABS.includes(st.active))&&(st.active!=='credits'||!isEmployee())){
  active=st.active;svcRange=st.svcRange||svcRange;svcDay=st.svcDay||'';svcStatus=st.svcStatus||'all';
  financeMonth=st.financeMonth||'';financeKind=st.financeKind||'all';returnDays=st.returnDays||30;returnShowContacted=!!st.returnShowContacted;
  cadastroView=st.cadastroView||'list';creditsFilter=st.creditsFilter||'with';dashRange=st.dashRange||'month';expMonth=st.expMonth||'';
 }
 if(draft)active='services';
 return {st,draft};
}
const waitFor=async(fn,ms=3000)=>{const t0=Date.now();while(Date.now()-t0<ms){try{if(fn())return true;}catch(e){}await new Promise(r=>setTimeout(r,80));}return false;};
async function restoreServiceDraft(draft){
 if(!draft||!draft.values)return;
 try{
  let item={};
  if(draft.id)item=(await all('services')).find(s=>s.id===draft.id)||{};
  renderForm(item);
  $('formWrap').style.display='';$('formWrap').classList.remove('hidden');
  const v=draft.values;
  if(!draft.id&&v.plate){
   $('servicePlate').value=v.plate;
   $('findServiceVehicle').click();
   await waitFor(()=>!$('serviceDetails').classList.contains('hidden'),4000);
  }
  const form=$('recordForm');
  for(const [name,val] of Object.entries(v)){
   if(name==='plate'||name==='client'||name==='vehicle')continue;
   const el=form.elements[name];if(!el)continue;
   el.value=val;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
  }
  const box=$('serviceExtras');while(box.firstChild)box.firstChild.remove();
  (draft.extras||[]).forEach(x=>{$('addServiceExtra').click();const row=box.lastElementChild;row.querySelector('.extra-desc').value=x.d||'';row.querySelector('.extra-value').value=x.v||'';});
  form.elements.value.dispatchEvent(new Event('input',{bubbles:true}));
  if(draft.splits&&draft.splits.rows&&draft.splits.rows.length&&$('addSplit')){
   $('addSplit').click();
   for(let i=1;i<draft.splits.rows.length;i++)$('addSplit').click();
   draft.splits.rows.forEach((x,i)=>{const r=document.querySelectorAll('#splitRows .split-row')[i];if(!r)return;r.querySelector('select').value=x.m||'';const inp=r.querySelector('input');inp.value=x.v||'';inp.dispatchEvent(new Event('input',{bubbles:true}));});
   $('splitValue1').value=draft.splits.first||'';$('splitValue1').dispatchEvent(new Event('input',{bubbles:true}));
   draft.splits.rows.forEach((x,i)=>{const r=document.querySelectorAll('#splitRows .split-row')[i];if(r&&draft.splits.rows.length>1)r.querySelector('input').value=x.v||'';});
  }
  showToast('Retomamos o serviço que você estava lançando.');
 }catch(e){console.error('Não foi possível retomar o rascunho:',e);}
}
async function finishRestore(r){
 try{
  const skipSearch=['home','dashboard','reports','pending'].includes(active);
  if(r.st&&r.st.search&&!skipSearch){$('searchInput').value=r.st.search;await renderTable();}
  if(r.draft&&active==='services')await restoreServiceDraft(r.draft);
  const y=(r.st&&r.st.scrollY)||0;
  if(y>0){setTimeout(()=>window.scrollTo(0,y),400);setTimeout(()=>window.scrollTo(0,y),1400);}
 }catch(e){console.error(e);}
}
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){hiddenAt=Date.now();saveUiState();return;}
 // Ao voltar depois de um tempo (ex.: conferir um Pix), atualiza os dados da tela sem mexer em formulários abertos.
 if(appActive&&hiddenAt&&Date.now()-hiddenAt>45000){hiddenAt=0;try{$('refreshBtn').onclick();}catch(e){console.error(e);}}
});
window.addEventListener('pagehide',saveUiState);
setInterval(saveUiState,20000);

/* ----- Créditos de clientes (saldo em reais e pacotes de lavagens) ----- */
const CREDIT_METHODS={saldo:'Crédito (saldo)',lavagem:'Crédito (lavagem)'};
const isCreditMethod=m=>m===CREDIT_METHODS.saldo||m===CREDIT_METHODS.lavagem;
const round2c=n=>Math.round((Number(n)||0)*100)/100;
function creditSummary(payments,clientName,excludeServiceId){
 let saldo=0,lavagens=0;const moves=[];
 payments.forEach(p=>{
  if(!sameClient(p.client,clientName))return;
  if(p.kind==='credito'&&p.status==='Pago'){
   if(p.creditType==='lavagens')lavagens+=Number(p.washes||0);
   else saldo+=Number(p.creditValue!==undefined&&p.creditValue!==null&&p.creditValue!==''?p.creditValue:p.value||0);
   moves.push({type:'recarga',p});
  }else if(p.status==='Crédito'&&p.serviceId&&p.serviceId!==excludeServiceId&&isCreditMethod(p.method)){
   if(p.method===CREDIT_METHODS.lavagem)lavagens-=1;else saldo-=Number(p.value||0);
   moves.push({type:'uso',p});
  }
 });
 return {saldo:round2c(saldo),lavagens,moves};
}
const serviceMethodList=item=>{const base=['Dinheiro','Pix','Cartão','Brinde'];const l=isEmployee()?base:[...base,CREDIT_METHODS.saldo,CREDIT_METHODS.lavagem];const splitItem=item&&Array.isArray(item.paymentSplits)&&item.paymentSplits.length>1;if(item&&item.paymentMethod&&!splitItem&&!l.includes(item.paymentMethod))l.push(item.paymentMethod);if(splitItem)item.paymentSplits.forEach(x=>{if(x.method&&!l.includes(x.method))l.push(x.method);});return l;};
let creditsFilter='with', creditsOpen=new Set();
async function renderCreditsPanel(){
 try{
  const [payments,clients]=await Promise.all([all('payments'),all('clients')]);
  const q=normalizeText($('searchInput').value);
  const names=new Map();
  payments.forEach(p=>{if(p.kind==='credito'||(p.status==='Crédito'&&isCreditMethod(p.method))){const k=normalizeText(p.client);if(k&&!names.has(k))names.set(k,p.client);}});
  const rows=[...names.entries()].map(([k,name])=>{const sm=creditSummary(payments,name);const last=sm.moves.map(m=>m.p.date||'').sort().pop()||'';return {k,name,client:clients.find(c=>sameClient(c.name,name)),...sm,last};});
  const has=r=>r.saldo>0.004||r.lavagens>0, neg=r=>r.saldo<-0.004||r.lavagens<0;
  const cnt={with:rows.filter(has).length,without:rows.filter(r=>!has(r)&&!neg(r)).length,neg:rows.filter(neg).length,all:rows.length};
  let list=rows.filter(r=>!q||normalizeText(r.name).includes(q)||normalizeText(r.client&&r.client.phone).includes(q));
  list=list.filter(r=>creditsFilter==='all'||(creditsFilter==='with'&&has(r))||(creditsFilter==='without'&&!has(r)&&!neg(r))||(creditsFilter==='neg'&&neg(r)));
  list.sort((a,b)=>b.saldo-a.saldo||b.lavagens-a.lavagens||a.name.localeCompare(b.name));
  const totalSaldo=rows.reduce((n,r)=>n+Math.max(0,r.saldo),0),totalWash=rows.reduce((n,r)=>n+Math.max(0,r.lavagens),0);
  const monthKey=localISODate().slice(0,7);
  const rechargesMonth=payments.filter(p=>p.kind==='credito'&&p.status==='Pago'&&String(p.date||'').slice(0,7)===monthKey).reduce((n,p)=>n+Number(p.value||0),0);
  const chip=(k,label)=>`<button type="button" class="filter-chip ${creditsFilter===k?'active':''}" data-cfilter="${k}">${label} (${cnt[k]})</button>`;
  const moveHtml=m=>{const p=m.p;const d=dateBR(p.date);
   if(m.type==='recarga')return `<div class="credit-move"><span>${d} · ${p.creditType==='lavagens'?`Pacote de ${Number(p.washes||0)} lavagem(ns) (${money(p.value)})`:`Recarga ${money(p.creditValue!==undefined&&p.creditValue!==null&&p.creditValue!==''?p.creditValue:p.value)}${Number(p.creditValue)>Number(p.value)?' (pago '+money(p.value)+')':''}`} · ${esc(p.method||'')}</span><span><button type="button" class="action" data-credit-edit="${esc(p.id)}">Editar</button> <button type="button" class="action" data-credit-del="${esc(p.id)}">Excluir</button></span></div>`;
   return `<div class="credit-move"><span class="muted">${d} · Uso: ${esc(p.description||'Serviço')} · ${p.method===CREDIT_METHODS.lavagem?'1 lavagem':'− '+money(p.value)}</span></div>`;};
  $('tableWrap').innerHTML=`<div class="dashboard-metrics compact" style="margin-bottom:10px"><div class="dashboard-metric"><span>Clientes com crédito</span><strong>${cnt.with}</strong></div><div class="dashboard-metric"><span>Saldo em aberto</span><strong>${money(totalSaldo)}</strong></div><div class="dashboard-metric"><span>Lavagens pré-pagas</span><strong>${totalWash}</strong></div><div class="dashboard-metric"><span>Recargas no mês</span><strong>${money(rechargesMonth)}</strong></div></div>
   <div class="filter-chips chips-scroll">${chip('with','Com crédito')}${chip('neg','Negativos')}${chip('without','Zerados')}${chip('all','Todos')}</div>
   <p class="muted small">Recargas entram como dinheiro recebido; os serviços pagos com crédito entram como serviço realizado, sem novo recebimento. Cadastre a recarga aqui e, no serviço, escolha “Crédito (saldo)” ou “Crédito (lavagem)”.</p>
   ${list.length?`<div class="svc-list">${list.map(r=>{const open=creditsOpen.has(r.k);const moves=r.moves.slice().sort((a,b)=>String(b.p.date||'').localeCompare(String(a.p.date||'')));
    return `<article class="svc-card credit-card"><div class="svc-head"><strong>${esc(r.name)}</strong><span class="status-badge ${neg(r)?'st-cancelado':has(r)?'st-pronto-para-retirada':'st-concluido'}">${neg(r)?'Negativo':has(r)?'Com crédito':'Zerado'}</span></div>
     <div class="credit-balances"><div><span class="muted small">Saldo</span><strong class="${r.saldo<0?'amount-out':''}">${money(r.saldo)}</strong></div><div><span class="muted small">Lavagens</span><strong class="${r.lavagens<0?'amount-out':''}">${r.lavagens}</strong></div></div>
     <div class="muted small">${r.client&&r.client.phone?esc(r.client.phone)+' · ':''}${r.last?'última movimentação em '+dateBR(r.last):''}</div>
     <div class="svc-actions"><button type="button" class="primary small-btn" data-credit-add="${esc(r.name)}">Recarregar</button><button type="button" class="action" data-credit-ext="${esc(r.k)}">${open?'Ocultar extrato':'Extrato'}</button></div>
     ${open?`<div class="credit-moves">${moves.map(moveHtml).join('')||'<div class="muted small">Sem movimentações.</div>'}</div>`:''}</article>`;}).join('')}</div>`:`<div class="empty">${rows.length?'Nenhum cliente neste filtro.':'Ainda não há créditos. Toque em “+ Nova recarga” para registrar o primeiro.'}</div>`}`;
  $('tableWrap').querySelectorAll('[data-cfilter]').forEach(b=>b.onclick=()=>{creditsFilter=b.dataset.cfilter;renderCreditsPanel();});
  $('tableWrap').querySelectorAll('[data-credit-ext]').forEach(b=>b.onclick=()=>{const k=b.dataset.creditExt;if(creditsOpen.has(k))creditsOpen.delete(k);else creditsOpen.add(k);renderCreditsPanel();});
  $('tableWrap').querySelectorAll('[data-credit-add]').forEach(b=>b.onclick=()=>renderCreditForm(b.dataset.creditAdd));
  $('tableWrap').querySelectorAll('[data-credit-edit]').forEach(b=>b.onclick=()=>{const p=payments.find(x=>x.id===b.dataset.creditEdit);if(p)renderCreditForm('',p);});
  $('tableWrap').querySelectorAll('[data-credit-del]').forEach(b=>b.onclick=async()=>{
   if(!confirm('Excluir esta recarga? O saldo do cliente será recalculado.'))return;
   try{await remove('payments',b.dataset.creditDel);showToast('Recarga excluída.');await renderCreditsPanel();await renderStats();}
   catch(err){showToast('Erro ao excluir: '+err.message);}
  });
 }catch(err){$('tableWrap').innerHTML='<div class="empty">Não foi possível carregar os créditos. Verifique a conexão.</div>';console.error(err);}
}
async function renderCreditForm(prefill='',item={}){
 if(isEmployee())return;
 editId=item.id??null;
 const type=item.creditType||'valor';
 const methods=['Pix','Dinheiro','Cartão','Cartão de débito','Cartão de crédito','Transferência'];if(item.method&&!methods.includes(item.method))methods.push(item.method);
 $('formWrap').style.display='';$('formWrap').classList.remove('hidden');
 $('formWrap').innerHTML=`<form id="creditForm"><h3>${item.id?'Editar recarga':'Nova recarga de crédito'}</h3><div class="form-grid">
  <div class="field"><label>Cliente *</label><input name="client" list="creditClients" required autocomplete="off" value="${esc(item.client||prefill)}" placeholder="Digite o nome do cliente"><datalist id="creditClients"></datalist></div>
  <div class="field"><label>Tipo de crédito *</label><select name="creditType" id="creditType"><option value="valor" ${type==='valor'?'selected':''}>Saldo em reais</option><option value="lavagens" ${type==='lavagens'?'selected':''}>Pacote de lavagens</option></select></div>
  <div class="field"><label>Valor pago (R$) *</label><input name="value" inputmode="decimal" required value="${item.value!==undefined?esc(decimalText(item.value)):''}" placeholder="0,00"></div>
  <div class="field ${type==='valor'?'':'hidden'}" id="creditValueWrap"><label>Valor creditado (R$)</label><input name="creditValue" inputmode="decimal" value="${item.creditValue!==undefined&&item.creditValue!==null&&item.creditValue!==''?esc(decimalText(item.creditValue)):''}" placeholder="igual ao valor pago"><small class="muted">Preencha só se houver bônus (ex.: pagou 100 e ganhou 110).</small></div>
  <div class="field ${type==='lavagens'?'':'hidden'}" id="creditWashesWrap"><label>Quantidade de lavagens *</label><input name="washes" type="number" min="1" step="1" value="${item.washes?esc(item.washes):''}"></div>
  <div class="field"><label>Forma de pagamento *</label><select name="method" required><option value="">Selecione...</option>${methods.map(o=>`<option ${item.method===o?'selected':''}>${esc(o)}</option>`).join('')}</select></div>
  <div class="field"><label>Data *</label><input name="date" type="date" required value="${esc(item.date||localISODate())}"></div>
  <div class="field" style="grid-column:1/-1"><label>Observações</label><textarea name="notes" rows="2">${esc(item.notes||'')}</textarea></div>
 </div><div class="form-actions"><button type="button" class="secondary" id="cancelForm">Cancelar</button><button class="primary" type="submit">${item.id?'Salvar alterações':'Salvar recarga'}</button></div></form>`;
 const form=$('creditForm');
 bindDecimalInput(form.elements.value);bindDecimalInput(form.elements.creditValue);
 const toggle=()=>{const v=form.elements.creditType.value==='valor';$('creditValueWrap').classList.toggle('hidden',!v);$('creditWashesWrap').classList.toggle('hidden',v);form.elements.washes.required=!v;};
 form.elements.creditType.addEventListener('change',toggle);toggle();
 $('cancelForm').onclick=()=>{$('formWrap').classList.add('hidden');editId=null;};
 let clients=[];
 try{clients=await all('clients');const dl=$('creditClients');if(dl)dl.innerHTML=clients.slice(0,800).map(c=>`<option value="${esc(c.name)}">`).join('');}catch(e){console.error(e);}
 form.onsubmit=async e=>{
  e.preventDefault();const btn=form.querySelector('[type=submit]');btn.disabled=true;
  try{
   const d=Object.fromEntries(new FormData(form).entries());
   const cl=clients.find(c=>sameClient(c.name,d.client));
   if(!cl)throw new Error('Escolha um cliente já cadastrado (digite e selecione na lista).');
   const value=decimalValue(d.value);if(!Number.isFinite(value)||value<=0)throw new Error('Informe o valor pago.');
   const isWash=d.creditType==='lavagens';
   const washes=isWash?parseInt(d.washes,10):0;if(isWash&&(!Number.isFinite(washes)||washes<1))throw new Error('Informe a quantidade de lavagens.');
   let creditValue=value;if(!isWash&&String(d.creditValue||'').trim()!==''){creditValue=decimalValue(d.creditValue);if(!Number.isFinite(creditValue)||creditValue<=0)throw new Error('Valor creditado inválido.');}
   if(!/^\d{4}-\d{2}-\d{2}$/.test(d.date||''))throw new Error('Informe uma data válida.');
   const record={...(item.id?item:{}),kind:'credito',creditType:isWash?'lavagens':'valor',client:cl.name,date:d.date,value,method:d.method,status:'Pago',notes:d.notes||'',
    description:isWash?`Recarga de crédito: pacote de ${washes} lavagem(ns)`:`Recarga de crédito: saldo`};
   delete record.creditValue;delete record.washes;delete record.fee;delete record.feePercent;
   if(isWash)record.washes=washes;else record.creditValue=creditValue;
   Object.assign(record,feeFields(d.method,value,'Pago'));
   await save('payments',record);
   $('formWrap').classList.add('hidden');editId=null;showToast('Recarga salva.');
   creditsOpen.add(normalizeText(cl.name));
   await renderCreditsPanel();await renderStats();
  }catch(err){showToast('Não foi possível salvar: '+(err.message||'verifique os dados.'));}
  finally{btn.disabled=false;}
 };
}

/* ===== v25: dashboards novos, despesas por categoria e exportação do movimento ===== */
const shortMoney=n=>{const v=Math.abs(n);const s=v>=1e6?(v/1e6).toFixed(1).replace('.',',')+' mi':v>=1000?(v/1000).toFixed(v>=10000?0:1).replace('.',',')+' mil':String(Math.round(v));return (n<0?'−':'')+'R$ '+s;};
const pctText=n=>(Math.round(n*10)/10).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
const CHART_COLORS=['#e5202b','#3b9eff','#2fbf71','#f5b942','#a06bff','#ff7ab6','#6b7280'];
const isoDay=(y,m,d)=>y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
function shiftISOMonths(iso,n){const [y,m,d]=iso.split('-').map(Number);const t=new Date(y,m-1+n,1);const last=new Date(t.getFullYear(),t.getMonth()+1,0).getDate();return isoDay(t.getFullYear(),t.getMonth()+1,Math.min(d,last));}
function localDailyGoal(){
 try{const st=getLocalSettings();const daily=Number(st.dailyTarget||0);if(!daily)return 0;const [Y,M]=localISODate().split('-').map(Number);const hol=(st.holidays||'').split(',').map(x=>x.trim()).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x));return daily*monthWorkingDays(Y,M,hol);}catch(e){return 0;}
}
let dashRange='month';
function dashPeriod(range){
 const today=localISODate();const [Y,M]=today.split('-').map(Number);
 const first=(y,m)=>isoDay(y,m,1),last=(y,m)=>isoDay(y,m,new Date(y,m,0).getDate());
 let from,to,n,label;
 if(range==='prev'){const d=new Date(Y,M-2,1);from=first(d.getFullYear(),d.getMonth()+1);to=last(d.getFullYear(),d.getMonth()+1);n=1;label=d.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});}
 else if(range==='3m'){const d=new Date(Y,M-3,1);from=first(d.getFullYear(),d.getMonth()+1);to=today;n=3;label='Últimos 3 meses';}
 else if(range==='12m'){const d=new Date(Y,M-12,1);from=first(d.getFullYear(),d.getMonth()+1);to=today;n=12;label='Últimos 12 meses';}
 else{from=first(Y,M);to=today;n=1;label='Este mês (até hoje)';}
 return {from,to,prevFrom:shiftISOMonths(from,-n),prevTo:shiftISOMonths(to,-n),label,daily:range==='month'||range==='prev'};
}
function dashDelta(cur,prev,inverse){
 if(!prev&&!cur)return '';
 if(!prev)return '<span class="delta flat">novo no período</span>';
 const p=(cur-prev)/Math.abs(prev)*100;if(Math.abs(p)<0.05)return '<span class="delta flat">= igual ao anterior</span>';
 const up=p>0,good=inverse?!up:up;
 return `<span class="delta ${good?'good':'bad'}">${up?'▲':'▼'} ${pctText(Math.abs(p))} vs. anterior</span>`;
}
const kpi=(label,value,deltaHtml,sub,cls='')=>`<div class="kpi ${cls}"><span class="kpi-label">${esc(label)}</span><strong>${value}</strong>${deltaHtml||''}${sub?`<small class="muted">${sub}</small>`:''}</div>`;
function hbars(items,opts={}){
 const max=Math.max(...items.map(i=>i.value),1);
 return `<div class="hbars">${items.map((i,idx)=>`<div class="hbar"><div class="hbar-top"><span>${esc(i.label)}</span><b>${i.text||money(i.value)}</b></div><div class="hbar-track"><i style="width:${Math.max(2,i.value/max*100).toFixed(1)}%;background:${i.color||CHART_COLORS[idx%CHART_COLORS.length]}"></i></div>${i.sub?`<small class="muted">${i.sub}</small>`:''}</div>`).join('')}</div>`;
}
function vbars(items,opts={}){
 const max=Math.max(...items.map(i=>Math.max(i.value,i.value2||0)),1);
 return `<div class="vbars-wrap"><div class="vbars-max">${shortMoney(max)}</div><div class="vbars ${opts.dense?'dense':''}" style="--cols:${items.length}">${items.map(i=>`<div class="vbar ${i.hl?'hl':''}" title="${esc(i.title||i.label)}"><div class="vbar-col">${i.value2!==undefined?`<i class="b2" style="height:${(i.value2/max*100).toFixed(1)}%"></i>`:''}<i class="b1" style="height:${(i.value/max*100).toFixed(1)}%"></i></div><span>${esc(i.label)}</span></div>`).join('')}</div></div>`;
}
function donut(parts,centerText){
 const total=parts.reduce((n,p)=>n+p.value,0)||1;let acc=0;
 const segs=parts.map(p=>{const pct=p.value/total*100;const seg=`<circle r="15.9155" cx="21" cy="21" fill="none" stroke="${p.color}" stroke-width="6" stroke-dasharray="${pct.toFixed(2)} ${(100-pct).toFixed(2)}" stroke-dashoffset="${(25-acc).toFixed(2)}"></circle>`;acc+=pct;return seg;}).join('');
 return `<div class="donut-box"><svg viewBox="0 0 42 42" class="donut" role="img" aria-label="Formas de pagamento"><circle r="15.9155" cx="21" cy="21" fill="none" stroke="#2a2a2d" stroke-width="6"></circle>${segs}<text x="21" y="20" text-anchor="middle" class="donut-n">${esc(centerText[0])}</text><text x="21" y="26" text-anchor="middle" class="donut-s">${esc(centerText[1])}</text></svg><div class="legend">${parts.map(p=>`<div><i style="background:${p.color}"></i><span>${esc(p.label)}</span><b>${money(p.value)}</b><small>${pctText(p.value/total*100)}</small></div>`).join('')}</div></div>`;
}
function areaChart(points,goal){
 const W=300,H=90;const max=Math.max(...points.map(p=>p.v),goal||0,1);
 const x=i=>points.length>1?i/(points.length-1)*W:0,y=v=>H-v/max*H;
 const line=points.map((p,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
 return `<svg viewBox="0 0 ${W} ${H+4}" class="area" preserveAspectRatio="none" role="img" aria-label="Faturamento acumulado"><defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#e5202b" stop-opacity=".45"/><stop offset="100%" stop-color="#e5202b" stop-opacity="0"/></linearGradient></defs>${goal?`<line x1="0" x2="${W}" y1="${y(goal).toFixed(1)}" y2="${y(goal).toFixed(1)}" stroke="#f5b942" stroke-width="1" stroke-dasharray="4 3"/>`:''}<path d="${line} L${W},${H} L0,${H} Z" fill="url(#ag)"/><path d="${line}" fill="none" stroke="#e5202b" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}
async function renderDashboardsV25(){
 const target=$('tableWrap');
 target.innerHTML='<div class="dashboard-loading">Carregando indicadores da nuvem...</div>';
 try{
  const [services,payments,allExpenses]=await Promise.all([all('services'),all('payments'),all('expenses')]);
  const P=dashPeriod(dashRange);
  const inR=(d,a,b)=>{d=String(d||'').slice(0,10);return !!d&&d>=a&&d<=b;};
  const isPaidExp=e=>e.paymentStatus!=='Em aberto'&&e.paymentStatus!=='Pendente';
  const expDate=e=>e.date||e.paidAt||'';
  const sum=(a,f)=>a.reduce((n,x)=>n+Number(f(x)||0),0);
  const calc=(a,b)=>{
   const svc=services.filter(s=>s.status==='Concluído'&&inR(s.date,a,b));
   const otherIn=payments.filter(p=>!p.serviceId&&p.kind!=='credito'&&p.status==='Pago'&&inR(p.date,a,b));
   const paid=payments.filter(p=>p.status==='Pago'&&inR(p.date,a,b));
   const exps=allExpenses.filter(e=>isPaidExp(e)&&inR(expDate(e),a,b));
   const svcRev=sum(svc,s=>s.value);
   const received=sum(paid,p=>p.value),fees=sum(paid,p=>feeOf(p)),spent=sum(exps,e=>e.value);
   return {svc,exps,otherIn,count:svc.length,svcRev,revenue:svcRev+sum(otherIn,p=>p.value),received,fees,spent,pending:sum(payments.filter(p=>p.status==='Pendente'&&inR(p.date,a,b)),p=>p.value),result:received-fees-spent,ticket:svc.length?svcRev/svc.length:0,extras:sum(svc,s=>s.extrasTotal),extrasCount:svc.filter(s=>Number(s.extrasTotal)>0).length};
  };
  const cur=calc(P.from,P.to),prev=calc(P.prevFrom,P.prevTo);
  const chip=(k,l)=>`<button type="button" class="filter-chip ${dashRange===k?'active':''}" data-drange="${k}">${l}</button>`;
  // ---- evolução
  let evolution='',evoTitle='',evoNote='';
  const dayRevenue=new Map();
  cur.svc.forEach(s=>dayRevenue.set(s.date,(dayRevenue.get(s.date)||0)+Number(s.value||0)));
  cur.otherIn.forEach(p=>dayRevenue.set(p.date,(dayRevenue.get(p.date)||0)+Number(p.value||0)));
  if(P.daily){
   const days=[];for(let d=P.from;d<=P.to;d=addDaysISO(d,1))days.push(d);
   const vals=days.map(d=>dayRevenue.get(d)||0);const best=Math.max(...vals,0);const bestDay=days[vals.indexOf(best)];
   evoTitle='Faturamento por dia';
   evolution=vbars(days.map((d,i)=>({label:(i%5===0||i===days.length-1)?String(Number(d.slice(8))):'',value:vals[i],hl:vals[i]===best&&best>0,title:`${dateBR(d)}: ${money(vals[i])}`})),{dense:true});
   evoNote=best>0?`Melhor dia: <b>${dateBR(bestDay)}</b> com ${money(best)} · média por dia com movimento: ${money(sum(vals.filter(v=>v>0),v=>v)/Math.max(1,vals.filter(v=>v>0).length))}`:'Sem faturamento no período.';
  }else{
   const keys=[];{let [y,m]=P.from.split('-').map(Number);const [ey,em]=P.to.split('-').map(Number);while(y<ey||(y===ey&&m<=em)){keys.push(y+'-'+String(m).padStart(2,'0'));m++;if(m>12){m=1;y++;}}}
   const monthData=keys.map(k=>{const a=k+'-01',b=k+'-31';const c=calc(a,b);return {k,revenue:c.revenue,spent:c.spent,result:c.received-c.fees-c.spent};});
   evoTitle='Faturamento × despesas por mês';
   evolution=vbars(monthData.map(m=>({label:new Date(Number(m.k.slice(0,4)),Number(m.k.slice(5))-1,1).toLocaleDateString('pt-BR',{month:'short'}).replace('.',''),value:m.revenue,value2:m.spent,title:`${m.k}: faturamento ${money(m.revenue)} · despesas ${money(m.spent)}`})));
   const bm=monthData.slice().sort((a,b)=>b.revenue-a.revenue)[0];
   evoNote=`<span class="lg r"></span>Faturamento <span class="lg s"></span>Despesas${bm&&bm.revenue>0?` · melhor mês: <b>${new Date(Number(bm.k.slice(0,4)),Number(bm.k.slice(5))-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</b> (${money(bm.revenue)})`:''}`;
  }
  // ---- acumulado e meta (meses)
  let accumulated='';
  if(P.daily){
   const days=[];{const [y,m]=P.from.split('-').map(Number);const lastDay=P.to===localISODate()?Number(P.to.slice(8)):new Date(y,m,0).getDate();for(let d=1;d<=lastDay;d++)days.push(isoDay(y,m,d));}
   let run=0;const pts=days.map(d=>{run+=dayRevenue.get(d)||0;return {d,v:run};});
   const goal=dashRange==='month'?(Number(appSettings.goal&&appSettings.goal.monthly||0)||localDailyGoal()):0;
   accumulated=`<div class="dash-card"><h3>Faturamento acumulado</h3><div class="area-wrap">${areaChart(pts,goal)}</div><div class="area-axis"><span>dia 1</span><span>dia ${days.length}</span></div><p class="muted small">Total até agora: <b>${money(run)}</b>${goal?` · linha tracejada: meta de ${money(goal)}`:''}</p></div>`;
  }
  // ---- dias da semana
  const wd=[0,1,2,3,4,5,6].map(i=>({i,v:0,n:0}));
  cur.svc.forEach(s=>{const d=new Date(s.date+'T12:00:00').getDay();wd[d].v+=Number(s.value||0);wd[d].n++;});
  const wdNames=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'],wdFull=['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
  const bestWd=wd.slice().sort((a,b)=>b.v-a.v)[0];
  const weekdayChart=cur.count?vbars(wd.map(w=>({label:wdNames[w.i],value:w.v,hl:w===bestWd&&w.v>0,title:`${wdFull[w.i]}: ${money(w.v)} em ${w.n} serviço(s)`}))):'<p class="muted small">Sem serviços concluídos no período.</p>';
  // ---- formas de pagamento dos serviços
  const methodOf=p=>isCreditMethod(p.method)?'Crédito do cliente':(/cart/i.test(p.method||'')?'Cartão':(p.method||'Outro'));
  const mix=new Map();
  payments.filter(p=>p.serviceId&&(p.status==='Pago'||p.status==='Crédito')&&inR(p.date,P.from,P.to)).forEach(p=>{const m=methodOf(p);mix.set(m,(mix.get(m)||0)+Number(p.value||0));});
  const mixParts=[...mix.entries()].sort((a,b)=>b[1]-a[1]).map(([label,value],i)=>({label,value,color:CHART_COLORS[i%CHART_COLORS.length]}));
  const mixTotal=mixParts.reduce((n,p)=>n+p.value,0);
  // ---- despesas por categoria
  const catMap=new Map();cur.exps.forEach(e=>{const c=canonicalExpenseCategory(e.category);catMap.set(c,(catMap.get(c)||0)+Number(e.value||0));});
  const caps=(getLocalSettings().caps)||{};
  const catItems=[...catMap.entries()].sort((a,b)=>b[1]-a[1]).map(([label,value],i)=>{const pct=cur.revenue?value/cur.revenue*100:null;const cap=Number(caps[label]||0);return {label,value,color:CHART_COLORS[i%CHART_COLORS.length],text:`${money(value)} · ${cur.spent?pctText(value/cur.spent*100):'—'}`,sub:cap&&pct!==null&&pct>cap?`⚠ ${pctText(pct)} do faturamento, acima do teto de ${cap}%`:''};});
  const staff={};cur.exps.filter(e=>canonicalExpenseCategory(e.category)==='Funcionários').forEach(e=>{const k=staffExpenseName(e)||'Não identificado';staff[k]=(staff[k]||0)+Number(e.value||0);});
  // ---- top serviços e clientes
  const svcMap=new Map();cur.svc.forEach(s=>{const k=normalizeText(s.service||'serviço');const o=svcMap.get(k)||{label:s.service||'Serviço',v:0,n:0};o.v+=Number(s.value||0);o.n++;svcMap.set(k,o);});
  const topSvc=[...svcMap.values()].sort((a,b)=>b.v-a.v).slice(0,6).map(o=>({label:o.label,value:o.v,text:money(o.v),sub:`${o.n} serviço(s) · ticket ${money(o.v/o.n)}`}));
  const cliMap=new Map();cur.svc.forEach(s=>{const k=normalizeText(s.client||'');if(!k)return;const o=cliMap.get(k)||{label:s.client,v:0,n:0};o.v+=Number(s.value||0);o.n++;cliMap.set(k,o);});
  const topCli=[...cliMap.values()].sort((a,b)=>b.v-a.v).slice(0,5).map(o=>({label:o.label,value:o.v,text:money(o.v),sub:`${o.n} visita(s)`}));
  // ---- destaques em linguagem simples
  const hl=[];
  if(prev.revenue||cur.revenue){const p=prev.revenue?(cur.revenue-prev.revenue)/prev.revenue*100:null;hl.push(p===null?`Faturamento de <b>${money(cur.revenue)}</b> no período.`:`Faturamento <b>${pctText(Math.abs(p))} ${p>=0?'acima':'abaixo'}</b> do mesmo período anterior (${money(cur.revenue)} contra ${money(prev.revenue)}).`);}
  hl.push(cur.result>=0?`Resultado líquido positivo: sobraram <b>${money(cur.result)}</b> depois de taxas e despesas.`:`Resultado líquido negativo: as despesas e taxas superaram os recebimentos em <b>${money(-cur.result)}</b>.`);
  if(cur.count&&bestWd.v>0)hl.push(`Melhor dia da semana: <b>${wdFull[bestWd.i]}</b> (${money(bestWd.v)} em ${bestWd.n} serviço(s)).`);
  if(mixParts.length)hl.push(`Forma de pagamento mais usada: <b>${esc(mixParts[0].label)}</b> (${pctText(mixParts[0].value/mixTotal*100)} do valor dos serviços).`);
  if(catItems.length&&cur.spent)hl.push(`Despesa que mais pesa: <b>${esc(catItems[0].label)}</b> (${pctText(catItems[0].value/cur.spent*100)} das despesas pagas).`);
  if(cur.extras>0)hl.push(`Serviços extras renderam <b>${money(cur.extras)}</b> em ${cur.extrasCount} serviço(s) (${cur.svcRev?pctText(cur.extras/cur.svcRev*100):'—'} do valor dos serviços).`);
  // ---- metas e limites (formulários)
  const st=getLocalSettings(),cats=['Produtos','Funcionários','Pró-labore','Despesa mensal','Diversos','Cartão / empréstimo'];
  const settingsHtml=`<details class="dash-card"><summary>Metas, feriados e limites de gastos</summary>
   <form id="goalForm" class="form-grid" style="margin-top:10px"><div class="field"><label>Meta média diária (R$)</label><input name="dailyTarget" type="number" min="0" step="0.01" value="${esc(st.dailyTarget||'')}" placeholder="Ex.: 350"></div><div class="field"><label>Feriados (AAAA-MM-DD, separados por vírgula)</label><input name="holidays" value="${esc(st.holidays||'')}" placeholder="2026-11-20"></div><div class="form-actions" style="grid-column:1/-1"><button class="primary" type="submit">Salvar meta e feriados</button></div></form>
   <p class="muted small">A meta diária × dias úteis do mês vira a meta do mês, a menos que você defina uma meta mensal em Financeiro. Domingos e feriados informados são descontados. Salvo neste aparelho.</p>
   <form id="capsForm" class="form-grid">${cats.map(c=>`<div class="field"><label>Teto de ${esc(c)} (% do faturamento)</label><input type="number" min="0" max="100" step="0.1" name="${esc(c)}" value="${esc((st.caps||{})[c]??'')}" placeholder="Sem limite"></div>`).join('')}<div class="form-actions" style="grid-column:1/-1"><button class="primary" type="submit">Salvar limites</button></div></form></details>`;
  const goalCard=dashRange==='month'?goalCardHtml(services,payments,allExpenses):'';
  target.innerHTML=`<div class="dash">
   <div class="dash-head"><div><h3>Visão geral</h3><p class="muted small">${esc(P.label)} · comparado ao mesmo período anterior</p></div></div>
   <div class="filter-chips chips-scroll">${chip('month','Este mês')}${chip('prev','Mês anterior')}${chip('3m','3 meses')}${chip('12m','12 meses')}</div>
   <div class="kpis">
    ${kpi('Faturamento',money(cur.revenue),dashDelta(cur.revenue,prev.revenue),'Serviços concluídos + outras entradas','k-red')}
    ${kpi('Recebido no caixa',money(cur.received),dashDelta(cur.received,prev.received),cur.fees>0?`Taxas de cartão: ${money(cur.fees)}`:'Dinheiro que entrou','k-green')}
    ${kpi('Despesas pagas',money(cur.spent),dashDelta(cur.spent,prev.spent,true),cur.revenue?`${pctText(cur.spent/cur.revenue*100)} do faturamento`:'','k-gray')}
    ${kpi('Resultado líquido',`<span class="${cur.result<0?'amount-out':'amount-in'}">${money(cur.result)}</span>`,dashDelta(cur.result,prev.result),'Recebido − taxas − despesas','k-blue')}
    ${kpi('Serviços concluídos',String(cur.count),dashDelta(cur.count,prev.count),`Ticket médio ${money(cur.ticket)}`)}
    ${kpi('A receber',money(cur.pending),'',cur.extras>0?`Extras vendidos: ${money(cur.extras)}`:'Pagamentos pendentes do período')}
   </div>
   <div class="dash-card insights"><h3>Destaques</h3><ul>${hl.map(h=>`<li>${h}</li>`).join('')}</ul></div>
   ${goalCard}
   <div class="dash-card"><h3>${evoTitle}</h3>${evolution}<p class="chart-note">${evoNote}</p></div>
   ${accumulated}
   <div class="dash-grid">
    <div class="dash-card"><h3>Dias da semana</h3><p class="muted small">Faturamento dos serviços por dia da semana</p>${weekdayChart}</div>
    <div class="dash-card"><h3>Como os clientes pagam</h3><p class="muted small">Valor dos serviços por forma de pagamento</p>${mixParts.length?donut(mixParts,[shortMoney(mixTotal),'em serviços']):'<p class="muted small">Sem pagamentos de serviços no período.</p>'}</div>
    <div class="dash-card"><h3>Despesas por categoria</h3><p class="muted small">Despesas pagas no período</p>${catItems.length?hbars(catItems):'<p class="muted small">Nenhuma despesa paga no período.</p>'}${Object.keys(staff).length?`<details class="mini"><summary>Pagamentos a funcionários</summary>${Object.entries(staff).map(([n,v])=>`<div class="mini-row"><span>${esc(n)}</span><b>${money(v)}</b></div>`).join('')}</details>`:''}</div>
    <div class="dash-card"><h3>Serviços que mais rendem</h3>${topSvc.length?hbars(topSvc):'<p class="muted small">Sem serviços concluídos no período.</p>'}</div>
    <div class="dash-card"><h3>Melhores clientes</h3>${topCli.length?hbars(topCli):'<p class="muted small">Sem clientes no período.</p>'}</div>
   </div>
   ${settingsHtml}
   <p class="dashboard-footnote">Faturamento: serviços concluídos pela data do serviço mais outras entradas (recargas de crédito não contam). Recebido: dinheiro efetivamente recebido, incluindo recargas. Resultado líquido não é lucro contábil.</p>
  </div>`;
  target.querySelectorAll('[data-drange]').forEach(b=>b.onclick=()=>{dashRange=b.dataset.drange;renderDashboardsV25();});
  $('goalForm').onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target).entries());setLocalSettings({...getLocalSettings(),dailyTarget:Number(d.dailyTarget||0),holidays:d.holidays||''});showToast('Meta salva neste aparelho.');renderDashboardsV25();};
  $('capsForm').onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target).entries());const old=getLocalSettings();old.caps={};cats.forEach(c=>{if(d[c]!=='')old.caps[c]=Number(d[c]);});setLocalSettings(old);showToast('Limites salvos neste aparelho.');renderDashboardsV25();};
  try{await checkPayablesNotifications();}catch(e){}
 }catch(err){console.error('Erro ao carregar dashboards:',err);target.innerHTML='<div class="empty">Não foi possível carregar os dashboards. Verifique sua conexão e tente atualizar.</div>';}
}
renderDashboards=async function(){await renderDashboardsV25();};

/* ----- Despesas por categoria ----- */
let expMonth='', expOpen=new Set();
const expMonthKey=()=>expMonth||localISODate().slice(0,7);
function expenseRows(list){return list.map(e=>({'Data do pagamento':e.date||e.paidAt?dateBR(e.date||e.paidAt):'','Vencimento':e.dueDate?dateBR(e.dueDate):'','Categoria':canonicalExpenseCategory(e.category),'Subcategoria':e.subcategory||'','Descrição':e.description||'','Fornecedor':e.supplier||'','Forma de pagamento':e.payment||'','Situação':e.paymentStatus||'','Valor (R$)':Number(e.value||0)}));}
function downloadWorkbook(sheets,filename){
 if(!window.XLSX)throw new Error('Gerador Excel indisponível. Verifique a internet.');
 const wb=XLSX.utils.book_new();
 sheets.forEach(([name,rows,cols])=>{const ws=XLSX.utils.json_to_sheet(rows.length?rows:[{'Sem registros':''}]);if(cols)ws['!cols']=cols.map(w=>({wch:w}));XLSX.utils.book_append_sheet(wb,ws,name.slice(0,31));});
 XLSX.writeFile(wb,filename);
}
async function renderExpensesPanel(){
 try{
  const all$=await all('expenses');
  const key=expMonthKey(),q=normalizeText($('searchInput').value);
  const isPaid=e=>e.paymentStatus!=='Em aberto'&&e.paymentStatus!=='Pendente';
  const dateOf=e=>isPaid(e)?(e.date||e.paidAt||''):(e.dueDate||e.date||'');
  const inMonth=(e,k)=>isPaid(e)&&String(e.date||e.paidAt||'').slice(0,7)===k;
  const prevKey=(()=>{const [y,m]=key.split('-').map(Number);const d=new Date(y,m-2,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');})();
  const monthPaid=all$.filter(e=>inMonth(e,key)),prevPaid=all$.filter(e=>inMonth(e,prevKey));
  const openMonth=all$.filter(e=>!isPaid(e)&&String(e.dueDate||'').slice(0,7)===key);
  const sum=a=>a.reduce((n,e)=>n+Number(e.value||0),0);
  const total=sum(monthPaid),prevTotal=sum(prevPaid);
  const monthLabel=new Date(Number(key.slice(0,4)),Number(key.slice(5,7))-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  const itemRow=e=>`<div class="exp-item"><div><b>${esc(e.description||'Despesa')}</b><br><span class="muted small">${dateBR(dateOf(e))}${e.supplier?' · '+esc(e.supplier):''}${e.subcategory?' · '+esc(e.subcategory):''}${e.payment?' · '+esc(e.payment):''}</span></div><div class="exp-item-right"><b>${money(e.value)}</b><span><button type="button" class="action" data-exp-edit="${esc(e.id)}">Editar</button> <button type="button" class="action" data-exp-del="${esc(e.id)}">Excluir</button></span></div></div>`;
  let body;
  if(q){
   const found=all$.filter(e=>normalizeText([e.description,e.supplier,e.category,e.subcategory].join(' ')).includes(q)).sort((a,b)=>String(dateOf(b)).localeCompare(String(dateOf(a))));
   body=`<p class="muted small">Resultados da busca em todas as datas (${found.length}).</p>${found.length?`<div class="exp-list">${found.slice(0,100).map(itemRow).join('')}</div>`:'<div class="empty">Nenhuma despesa encontrada.</div>'}`;
  }else{
   const cat=new Map();monthPaid.forEach(e=>{const c=canonicalExpenseCategory(e.category);const o=cat.get(c)||{c,v:0,list:[]};o.v+=Number(e.value||0);o.list.push(e);cat.set(c,o);});
   const cats=[...cat.values()].sort((a,b)=>b.v-a.v);
   body=cats.length?`<div class="exp-cats">${cats.map((o,i)=>{const open=expOpen.has(o.c);const pct=total?o.v/total*100:0;return `<div class="exp-cat"><button type="button" class="exp-cat-head" data-exp-cat="${esc(o.c)}"><span class="exp-dot" style="background:${CHART_COLORS[i%CHART_COLORS.length]}"></span><span class="exp-cat-name">${esc(o.c)}<small class="muted"> ${o.list.length} lançamento(s)</small></span><b>${money(o.v)}</b><small class="muted">${pctText(pct)}</small><span class="exp-caret">${open?'▾':'▸'}</span></button><div class="hbar-track"><i style="width:${Math.max(2,pct).toFixed(1)}%;background:${CHART_COLORS[i%CHART_COLORS.length]}"></i></div>${open?`<div class="exp-list">${o.list.sort((a,b)=>String(b.date||b.paidAt||'').localeCompare(String(a.date||a.paidAt||''))).map(itemRow).join('')}</div>`:''}</div>`;}).join('')}</div>`:'<div class="empty">Nenhuma despesa paga neste mês. Toque em “+ Nova despesa” para lançar.</div>';
  }
  $('tableWrap').innerHTML=`<div class="finance-toolbar"><button type="button" class="secondary" id="expPrev" aria-label="Mês anterior">‹</button><input type="month" id="expMonthInput" value="${key}"><button type="button" class="secondary" id="expNext" aria-label="Próximo mês">›</button><button type="button" class="secondary" id="expThis">Mês atual</button></div>
   <div class="kpis kpis-2"><div class="kpi k-gray"><span class="kpi-label">Despesas pagas em ${esc(monthLabel)}</span><strong>${money(total)}</strong>${dashDelta(total,prevTotal,true)}<small class="muted">${monthPaid.length} lançamento(s)</small></div><div class="kpi"><span class="kpi-label">Em aberto com vencimento no mês</span><strong>${money(sum(openMonth))}</strong><small class="muted">${openMonth.length} conta(s) · veja em Contas a pagar</small></div></div>
   ${body}
   <div class="dash-card export-card"><h3>Exportar lista</h3><p class="muted small">Gera uma planilha Excel com todas as despesas do período escolhido.</p><div class="return-actions"><button type="button" class="primary" id="expExportMonth">Exportar este mês</button><button type="button" class="secondary" id="expExportAll">Exportar tudo</button></div><p id="expExportStatus" class="muted small"></p></div>`;
  const setMonth=k=>{expMonth=k;renderExpensesPanel();};
  $('expMonthInput').onchange=e=>setMonth(e.target.value||'');
  $('expThis').onclick=()=>setMonth('');
  $('expPrev').onclick=()=>setMonth(prevKey);
  $('expNext').onclick=()=>{const [y,m]=key.split('-').map(Number);const d=new Date(y,m,1);setMonth(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'));};
  $('tableWrap').querySelectorAll('[data-exp-cat]').forEach(b=>b.onclick=()=>{const c=b.dataset.expCat;if(expOpen.has(c))expOpen.delete(c);else expOpen.add(c);renderExpensesPanel();});
  $('tableWrap').querySelectorAll('[data-exp-edit]').forEach(b=>b.onclick=()=>{const e=all$.find(x=>x.id===b.dataset.expEdit);if(e){$('formWrap').style.display='';$('formWrap').classList.remove('hidden');renderForm(e);}});
  $('tableWrap').querySelectorAll('[data-exp-del]').forEach(b=>b.onclick=async()=>{if(!confirm('Excluir esta despesa?'))return;try{await remove('expenses',b.dataset.expDel);showToast('Despesa excluída.');await renderExpensesPanel();await renderStats();}catch(err){showToast('Erro ao excluir: '+err.message);}});
  const doExport=(list,name)=>{try{downloadWorkbook([['Despesas',expenseRows(list.slice().sort((a,b)=>String(dateOf(a)).localeCompare(String(dateOf(b)))),[14,14,18,18,32,20,16,12,12])]],name);$('expExportStatus').textContent=`Arquivo gerado com ${list.length} despesa(s).`;showToast('Excel gerado.');}catch(err){$('expExportStatus').textContent='Falha ao gerar: '+err.message;}};
  $('expExportMonth').onclick=()=>doExport(all$.filter(e=>(isPaid(e)?String(e.date||e.paidAt||''):String(e.dueDate||e.date||'')).slice(0,7)===key),`Auto_Brilho_Despesas_${key}.xlsx`);
  $('expExportAll').onclick=()=>doExport(all$,`Auto_Brilho_Despesas_${localISODate()}.xlsx`);
 }catch(err){$('tableWrap').innerHTML='<div class="empty">Não foi possível carregar as despesas. Verifique a conexão.</div>';console.error(err);}
}

/* ----- Relatórios: movimento financeiro só para exportação ----- */
let movPreset='month';
function movRange(preset){
 const today=localISODate();const [Y,M]=today.split('-').map(Number);
 if(preset==='prev'){const d=new Date(Y,M-2,1);return [isoDay(d.getFullYear(),d.getMonth()+1,1),isoDay(d.getFullYear(),d.getMonth()+1,new Date(Y,M-1,0).getDate())];}
 if(preset==='year')return [isoDay(Y,1,1),today];
 if(preset==='all')return ['',''];
 return [isoDay(Y,M,1),today];
}
async function exportMovementExcel(from,to){
 const [payments,expenses]=await Promise.all([all('payments'),all('expenses')]);
 const inR=d=>{d=String(d||'').slice(0,10);return (!from||d>=from)&&(!to||d<=to);};
 const rows=[];
 payments.filter(p=>p.status!=='Estornado'&&inR(p.date)).forEach(p=>{const fee=feeOf(p);rows.push({_d:p.date,'Data':dateBR(p.date),'Tipo':'Entrada','Origem':p.kind==='credito'?'Recarga de crédito':(p.serviceId?'Serviço':'Outra entrada'),'Descrição':p.description||'Recebimento','Cliente / fornecedor':p.client||'','Forma':p.method||'','Situação':p.status||'Pendente','Valor (R$)':Number(p.value||0),'Taxa de cartão (R$)':fee,'Líquido (R$)':p.status==='Pago'?Number(p.value||0)-fee:0});});
 expenses.filter(e=>inR(e.paymentStatus==='Pago'?(e.date||e.paidAt):(e.dueDate||e.date))).forEach(e=>{const d=e.paymentStatus==='Pago'?(e.date||e.paidAt):(e.dueDate||e.date);rows.push({_d:d,'Data':dateBR(d),'Tipo':'Saída','Origem':canonicalExpenseCategory(e.category),'Descrição':e.description||'','Cliente / fornecedor':e.supplier||'','Forma':e.payment||'','Situação':e.paymentStatus||'Em aberto','Valor (R$)':Number(e.value||0),'Taxa de cartão (R$)':0,'Líquido (R$)':e.paymentStatus==='Pago'?-Number(e.value||0):0});});
 rows.sort((a,b)=>String(a._d).localeCompare(String(b._d)));
 const movement=rows.map(({_d,...r})=>r);
 const pay=r=>r['Situação']==='Pago';
 const inc=movement.filter(r=>r['Tipo']==='Entrada'&&pay(r)),out=movement.filter(r=>r['Tipo']==='Saída'&&pay(r));
 const s=(a,k)=>a.reduce((n,r)=>n+Number(r[k]||0),0);
 const summary=[{'Indicador':'Período','Valor':`${from?dateBR(from):'início'} a ${to?dateBR(to):'hoje'}`},{'Indicador':'Entradas recebidas (R$)','Valor':s(inc,'Valor (R$)')},{'Indicador':'Taxas de cartão (R$)','Valor':s(inc,'Taxa de cartão (R$)')},{'Indicador':'Saídas pagas (R$)','Valor':s(out,'Valor (R$)')},{'Indicador':'Resultado realizado (R$)','Valor':s(inc,'Valor (R$)')-s(inc,'Taxa de cartão (R$)')-s(out,'Valor (R$)')},{'Indicador':'A receber (R$)','Valor':s(movement.filter(r=>r['Tipo']==='Entrada'&&r['Situação']==='Pendente'),'Valor (R$)')},{'Indicador':'A pagar (R$)','Valor':s(movement.filter(r=>r['Tipo']==='Saída'&&r['Situação']!=='Pago'),'Valor (R$)')}];
 downloadWorkbook([['Movimento',movement,[12,9,20,36,24,16,12,12,14,12]],['Resumo',summary,[28,28]]],`Auto_Brilho_Movimento_${from||'inicio'}_${to||localISODate()}.xlsx`);
 return movement.length;
}
renderFinancialMovement=async function(){
 const box=$('financialMovement');if(!box)return;
 const [f0,t0]=movRange(movPreset);
 const chip=(k,l)=>`<button type="button" class="filter-chip ${movPreset===k?'active':''}" data-mpreset="${k}">${l}</button>`;
 box.innerHTML=`<div class="dash-card export-card"><h3>Movimento financeiro completo</h3><p class="muted small">Todas as entradas e saídas em uma planilha Excel (abas Movimento e Resumo). Escolha o período e exporte.</p>
  <div class="filter-chips chips-scroll">${chip('month','Este mês')}${chip('prev','Mês anterior')}${chip('year','Este ano')}${chip('all','Todo o período')}</div>
  <div class="form-grid"><div class="field"><label>De</label><input type="date" id="movFrom" value="${esc(f0)}"></div><div class="field"><label>Até</label><input type="date" id="movTo" value="${esc(t0)}"></div></div>
  <button type="button" class="primary wide" id="movExport">Exportar movimento (Excel)</button><p id="movStatus" class="muted small"></p></div>`;
 box.querySelectorAll('[data-mpreset]').forEach(b=>b.onclick=()=>{movPreset=b.dataset.mpreset;renderFinancialMovement();});
 $('movExport').onclick=async()=>{
  const st=$('movStatus');st.textContent='Gerando planilha...';
  try{const n=await exportMovementExcel($('movFrom').value,$('movTo').value);st.textContent=`Planilha gerada com ${n} lançamento(s).`;showToast('Excel gerado.');}
  catch(err){st.textContent='Falha ao gerar: '+err.message;}
 };
};

/* ===== FINANCEIRO: resumo de entradas e saídas + outras entradas (v19) ===== */
let financeMonth='', financeKind='all', financeCfgOpen=false;
const otherIncomeMethods=['Pix','Dinheiro','Cartão','Cartão de débito','Cartão de crédito','Transferência','Outro'];
async function renderFinancePanel(){
 try{
  const [payments,expenses,servicesAll]=await Promise.all([all('payments'),all('expenses'),all('services')]);
  const key=financeMonth||localISODate().slice(0,7);
  const q=normalizeText($('searchInput').value);
  const inMonth=d=>String(d||'').slice(0,7)===key;
  const isPaid=e=>e.paymentStatus==='Pago';
  const isOpen=e=>e.paymentStatus==='Em aberto'||e.paymentStatus==='Pendente';
  // Entradas: recebimentos de serviços (vinculados) e outras entradas (lançadas aqui).
  const ins=payments.filter(p=>p.status!=='Estornado'&&inMonth(p.date)).map(p=>({id:p.id,date:p.date,dir:'in',other:!p.serviceId&&p.kind!=='credito',type:p.serviceId?'Serviço':(p.kind==='credito'?'Recarga de crédito':'Outra entrada'),status:p.status||'Pendente',description:p.description||'Recebimento',person:p.client||'',method:p.method||'',value:Number(p.value||0),fee:feeOf(p),raw:p}));
  // Saídas: despesas pagas no mês (pela data do pagamento) e contas em aberto que vencem no mês.
  const outs=expenses.filter(e=>isPaid(e)?inMonth(e.date||e.paidAt):(isOpen(e)&&inMonth(e.dueDate))).map(e=>({id:e.id,date:isPaid(e)?(e.date||e.paidAt):e.dueDate,dir:'out',other:false,type:'Saída',status:isPaid(e)?'Pago':'Em aberto',description:e.description||'',person:e.supplier||e.category||'',method:e.payment||'',value:Number(e.value||0)}));
  const sum=a=>a.reduce((n,x)=>n+x.value,0);
  const inPaid=ins.filter(x=>x.status==='Pago'), outPaid=outs.filter(x=>x.status==='Pago');
  const received=sum(inPaid), receivedOther=sum(inPaid.filter(x=>x.other)), receivedCredit=sum(inPaid.filter(x=>x.raw&&x.raw.kind==='credito')), receivedServices=received-receivedOther-receivedCredit;
  const feeTotal=inPaid.reduce((n,x)=>n+x.fee,0);
  const extrasMonth=servicesAll.filter(x=>x.status==='Concluído'&&inMonth(x.date)&&Number(x.extrasTotal||0)>0);
  const extrasTotalMonth=extrasMonth.reduce((n,x)=>n+Number(x.extrasTotal||0),0);
  const spent=sum(outPaid), toReceive=sum(ins.filter(x=>x.status==='Pendente')), toPay=sum(outs.filter(x=>x.status==='Em aberto'));
  let rows=[...ins,...outs];
  if(financeKind==='in')rows=rows.filter(x=>x.dir==='in');
  else if(financeKind==='out')rows=rows.filter(x=>x.dir==='out');
  else if(financeKind==='other')rows=rows.filter(x=>x.other);
  if(q)rows=rows.filter(x=>normalizeText([x.description,x.person,x.method,x.type,x.status].join(' ')).includes(q));
  rows.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const shown=rows.slice(0,300);
  const chip=(k,label)=>`<button type="button" class="filter-chip ${financeKind===k?'active':''}" data-fkind="${k}">${label}</button>`;
  const monthLabel=new Date(Number(key.slice(0,4)),Number(key.slice(5,7))-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
const pctText=v=>String(Number(v||0)).replace('.',',');
  const settingsHtml=`<details class="return-editor" ${financeCfgOpen?'open':''}><summary>Taxas de cartão e meta do mês</summary><div class="form-grid" style="margin-top:10px"><div class="field"><label>Taxa Pix (%)</label><input id="feePix" inputmode="decimal" value="${pctText(appSettings.fees['Pix'])}"></div><div class="field"><label>Taxa cartão geral (%)</label><input id="feeCard" inputmode="decimal" value="${pctText(appSettings.fees['Cartão'])}"></div><div class="field"><label>Taxa débito (%)</label><input id="feeDebit" inputmode="decimal" value="${pctText(appSettings.fees['Cartão de débito'])}"></div><div class="field"><label>Taxa crédito (%)</label><input id="feeCredit" inputmode="decimal" value="${pctText(appSettings.fees['Cartão de crédito'])}"></div><div class="field"><label>Contabilizar taxas a partir de</label><input id="feesSince" type="date" value="${esc(appSettings.feesSince||localISODate())}"></div><div class="field"><label>Meta de faturamento do mês (R$)</label><input id="goalMonthly" inputmode="decimal" value="${appSettings.goal.monthly?decimalText(appSettings.goal.monthly):''}" placeholder="0,00"></div></div><div class="return-actions"><button type="button" class="secondary" id="saveSettingsBtn">Salvar</button></div><p class="muted small">As taxas valem para novos recebimentos (os já registrados mantêm a taxa da época). As configurações ficam salvas na sua conta e valem em todos os aparelhos.</p></details>`;
  $('tableWrap').innerHTML=`<div class="finance-toolbar"><label for="financeMonthInput">Mês</label><input type="month" id="financeMonthInput" value="${key}"><button type="button" class="secondary" id="financeThisMonth">Mês atual</button></div>
   ${settingsHtml}
   <div class="dashboard-metrics compact" style="margin-bottom:14px"><div class="dashboard-metric"><span>Entradas recebidas</span><strong>${money(received)}</strong><small class="muted">Serviços ${money(receivedServices)} · Outras ${money(receivedOther)} · Recargas ${money(receivedCredit)}</small></div><div class="dashboard-metric"><span>Saídas pagas</span><strong>${money(spent)}</strong></div><div class="dashboard-metric"><span>Taxas de cartão</span><strong>${money(feeTotal)}</strong><small class="muted">Entradas líquidas ${money(received-feeTotal)}</small></div><div class="dashboard-metric"><span>Resultado do mês (após taxas)</span><strong class="${received-feeTotal-spent<0?'amount-out':'amount-in'}">${money(received-feeTotal-spent)}</strong></div><div class="dashboard-metric"><span>Extras vendidos</span><strong>${money(extrasTotalMonth)}</strong><small class="muted">${extrasMonth.length} serviço(s) com extra</small></div><div class="dashboard-metric"><span>A receber</span><strong>${money(toReceive)}</strong></div><div class="dashboard-metric"><span>A pagar (vence no mês)</span><strong>${money(toPay)}</strong></div></div>
   <div class="filter-chips">${chip('all','Todas')}${chip('in','Entradas')}${chip('out','Saídas')}${chip('other','Outras entradas')}</div>
   <p class="muted small">Movimento de ${esc(monthLabel)}. Entradas de serviços são lançadas em Serviços e saídas em Despesas / Contas a pagar; aqui você acompanha tudo e lança outras entradas.</p>
   ${shown.length?`<div class="table-scroll"><table><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Situação</th><th>Valor</th><th>Ações</th></tr></thead><tbody>${shown.map(r=>`<tr><td>${dateBR(r.date)}</td><td>${esc(r.type)}</td><td>${esc(r.description)}${r.person?`<br><small class="muted">${esc(r.person)}${r.method?' · '+esc(r.method):''}${r.fee>0?' · taxa '+money(r.fee):''}</small>`:''}</td><td>${esc(r.status)}</td><td class="${r.dir==='in'?'amount-in':'amount-out'}">${r.dir==='in'?'+':'−'} ${money(r.value)}</td><td>${r.dir==='in'&&r.other?`<button class="action" data-fedit="${esc(r.id)}">Editar</button> <button class="action" data-fdel="${esc(r.id)}">Excluir</button>`:'<span class="muted small">—</span>'}</td></tr>`).join('')}</tbody></table></div>${rows.length>shown.length?`<p class="muted small">Mostrando ${shown.length} de ${rows.length} lançamentos. Use a busca para refinar.</p>`:''}`:'<div class="empty">Nenhum lançamento neste mês para o filtro escolhido.</div>'}`;
  $('financeMonthInput').onchange=e=>{financeMonth=e.target.value||'';renderFinancePanel();};
  $('financeThisMonth').onclick=()=>{financeMonth='';renderFinancePanel();};
  $('saveSettingsBtn').onclick=async()=>{
   try{
    const pct=id=>{const n=decimalValue($(id).value);if(!Number.isFinite(n)||n<0||n>30)throw new Error('Taxas devem estar entre 0% e 30%.');return n;};
    const goal=decimalValue($('goalMonthly').value);if(!Number.isFinite(goal)||goal<0)throw new Error('Informe uma meta válida.');
    const since=$('feesSince').value||localISODate();
    appSettings={fees:{'Pix':pct('feePix'),'Cartão':pct('feeCard'),'Cartão de débito':pct('feeDebit'),'Cartão de crédito':pct('feeCredit')},goal:{monthly:goal},feesSince:since};
    await persistSettings();financeCfgOpen=true;showToast('Configurações salvas.');await renderFinancePanel();
   }catch(err){showToast('Não foi possível salvar: '+(err.message||'verifique os dados.'));}
  };
  $('tableWrap').querySelectorAll('[data-fkind]').forEach(b=>b.onclick=()=>{financeKind=b.dataset.fkind;renderFinancePanel();});
  $('tableWrap').querySelectorAll('[data-fedit]').forEach(b=>b.onclick=()=>{const r=rows.find(x=>x.id===b.dataset.fedit);if(r)renderOtherIncomeForm(r.raw);});
  $('tableWrap').querySelectorAll('[data-fdel]').forEach(b=>b.onclick=async()=>{
   if(!confirm('Excluir esta entrada?'))return;
   try{await remove('payments',b.dataset.fdel);showToast('Entrada excluída.');await renderFinancePanel();await renderStats();await renderFinancialMovement();}
   catch(err){showToast('Erro ao excluir: '+err.message);}
  });
 }catch(err){$('tableWrap').innerHTML='<div class="empty">Não foi possível carregar o financeiro. Verifique a conexão.</div>';console.error(err);}
}

function renderOtherIncomeForm(item={}){
 editId=item.id??null;
 const methods=[...otherIncomeMethods];if(item.method&&!methods.includes(item.method))methods.push(item.method);
 const statuses=['Pago','Pendente'];if(item.status&&!statuses.includes(item.status))statuses.push(item.status);
 $('formWrap').style.display='';
 $('formWrap').innerHTML=`<form id="otherIncomeForm"><h3>${item.id?'Editar entrada':'Nova entrada (outras entradas)'}</h3><div class="form-grid">
  <div class="field"><label>Data *</label><input name="date" type="date" required value="${esc(item.date||localISODate())}"></div>
  <div class="field"><label>Descrição *</label><input name="description" required value="${esc(item.description||'')}" placeholder="Ex.: venda de produto, aporte, reembolso"></div>
  <div class="field"><label>Origem / quem pagou</label><input name="client" value="${esc(item.client&&item.client!=='Outras entradas'?item.client:'')}"></div>
  <div class="field"><label>Forma de pagamento *</label><select name="method" required><option value="">Selecione...</option>${methods.map(o=>`<option ${item.method===o?'selected':''}>${esc(o)}</option>`).join('')}</select></div>
  <div class="field"><label>Valor (R$) *</label><input name="value" type="text" inputmode="decimal" required value="${item.value!==undefined?esc(decimalText(item.value)):''}" placeholder="0,00"></div>
  <div class="field"><label>Situação *</label><select name="status" required>${statuses.map(o=>`<option ${(item.status||'Pago')===o?'selected':''}>${esc(o)}</option>`).join('')}</select></div>
  <div class="field" style="grid-column:1/-1"><label>Observações</label><textarea name="notes" rows="2">${esc(item.notes||'')}</textarea></div>
 </div><div class="form-actions"><button type="button" class="secondary" id="cancelForm">Cancelar</button><button class="primary" type="submit">${item.id?'Salvar alterações':'Salvar entrada'}</button></div></form>`;
 $('formWrap').classList.remove('hidden');
 const form=$('otherIncomeForm');
 bindDecimalInput(form.elements.value);
 $('cancelForm').onclick=()=>{$('formWrap').classList.add('hidden');editId=null;};
 form.onsubmit=async e=>{
  e.preventDefault();
  const submit=form.querySelector('[type=submit]');submit.disabled=true;
  try{
   const d=Object.fromEntries(new FormData(form).entries());
   const value=decimalValue(d.value);
   if(!Number.isFinite(value)||value<=0)throw new Error('Informe um valor maior que zero.');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(d.date||''))throw new Error('Informe uma data válida.');
   const record={...(item.id?item:{}),date:d.date,description:String(d.description||'').trim(),client:String(d.client||'').trim()||'Outras entradas',method:d.method,value,status:d.status,notes:d.notes||'',kind:'outra'};
   delete record.fee;delete record.feePercent;Object.assign(record,feeFields(d.method,value,d.status));
   await save('payments',record);
   $('formWrap').classList.add('hidden');editId=null;
   showToast('Entrada salva.');
   await renderFinancePanel();await renderStats();await renderFinancialMovement();
  }catch(err){showToast('Não foi possível salvar: '+(err.message||'verifique os dados.'));}
  finally{submit.disabled=false;}
 };
}

/* ===== RETORNO DE CLIENTES: reativação por WhatsApp (v20) ===== */
let returnDays=30, returnShowContacted=false, returnEditorOpen=false;
const RETURN_DEFAULT_MSG='Olá, {nome}! Aqui é da Auto Brilho. Faz {dias} dias que cuidamos do seu {veiculo}. Que tal agendar uma lavagem para deixá-lo brilhando de novo? 🚗✨';
function returnMessageTemplate(){try{return localStorage.getItem('ab_retorno_msg')||RETURN_DEFAULT_MSG;}catch(e){return RETURN_DEFAULT_MSG;}}
function waPhone(raw){let d=String(raw||'').replace(/\D/g,'');if(d.startsWith('00'))d=d.slice(2);if(d.length===10||d.length===11)d='55'+d;return d.length>=12&&d.length<=13?d:'';}
function returnMessage(template,entry){
 const first=String(entry.c.name||'').trim().split(/\s+/)[0]||'cliente';
 const v=entry.vehicle;const car=v?[v.brand,v.model].filter(Boolean).join(' ')||'veículo':'veículo';
 return template.replace(/\{nome\}/g,first).replace(/\{veiculo\}/g,car).replace(/\{dias\}/g,String(entry.gap));
}
async function renderReturnPanel(){
 try{
  const [clients,vehicles,services]=await Promise.all([all('clients'),all('vehicles'),all('services')]);
  const today=localISODate();
  const daysBetween=d=>Math.round((new Date(today+'T12:00:00')-new Date(d+'T12:00:00'))/86400000);
  const isDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d||''));
  const byName=new Map();
  services.forEach(s=>{if(s.status!=='Concluído'||!isDate(s.date))return;const k=normalizeText(s.client);if(!k||k==='nao identificado')return;const l=byName.get(k);if(l)l.push(s);else byName.set(k,[s]);});
  const byPlate=new Map();vehicles.forEach(v=>{const p=normalizePlate(v.plate);if(p)byPlate.set(p,v);});
  // Um cadastro por nome (prefere o que tem telefone), com a última visita concluída.
  const unique=new Map();
  clients.forEach(c=>{const k=normalizeText(c.name);const cur=unique.get(k);if(!cur||(!waPhone(cur.phone)&&waPhone(c.phone)))unique.set(k,c);});
  const entries=[];
  unique.forEach((c,k)=>{
   const list=byName.get(k);if(!list||!list.length)return;
   const last=list.reduce((a,b)=>a.date>=b.date?a:b);const gap=daysBetween(last.date);if(gap<0)return;
   entries.push({c,last,gap,count:list.length,total:list.reduce((n,s)=>n+Number(s.value||0),0),vehicle:byPlate.get(normalizePlate(last.vehicle)),phone:waPhone(c.phone),contacted:isDate(c.lastContactAt)&&daysBetween(c.lastContactAt)<15});
  });
  const q=normalizeText($('searchInput').value), plateQ=normalizePlate($('searchInput').value);
  const away=entries.filter(e=>e.gap>=returnDays&&(!q||normalizeText(e.c.name).includes(q)||normalizeText(e.c.phone).includes(q)||(plateQ.length>=3&&normalizePlate(e.last.vehicle).includes(plateQ))));
  const pending=away.filter(e=>!e.contacted), contacted=away.filter(e=>e.contacted);
  const list=(returnShowContacted?contacted:pending).sort((a,b)=>b.count-a.count||b.gap-a.gap);
  const shown=list.slice(0,60);
  const template=returnMessageTemplate();
  const chip=(d,label)=>`<button type="button" class="filter-chip ${returnDays===d?'active':''}" data-rdays="${d}">${label}</button>`;
  const noPhone=pending.filter(e=>!e.phone).length;
  $('tableWrap').innerHTML=`<div class="filter-chips">${chip(30,'30+ dias')}${chip(45,'45+ dias')}${chip(60,'60+ dias')}${chip(90,'90+ dias')}<button type="button" class="filter-chip ${returnShowContacted?'active':''}" data-rcontacted="1">Contatados (${contacted.length})</button></div>
   <div class="dashboard-metrics" style="margin-bottom:14px"><div class="dashboard-metric"><span>Para reativar (${returnDays}+ dias)</span><strong>${pending.length}</strong></div>${isEmployee()?'':`<div class="dashboard-metric"><span>Já gastaram no total</span><strong>${money(pending.reduce((n,e)=>n+e.total,0))}</strong></div>`}<div class="dashboard-metric"><span>Sem telefone válido</span><strong>${noPhone}</strong></div></div>
   <details class="return-editor" ${returnEditorOpen?'open':''}><summary>Mensagem do WhatsApp</summary><textarea id="returnMsg" rows="4">${esc(template)}</textarea><p class="muted small">Use {nome}, {veiculo} e {dias}. A mensagem fica salva neste aparelho.</p><div class="field"><label for="waAppSelect">Abrir mensagens em</label><select id="waAppSelect"><option value="business" ${waAppPref()==="business"?"selected":""}>WhatsApp Business</option><option value="comum" ${waAppPref()==="comum"?"selected":""}>WhatsApp comum</option></select></div><div class="return-actions"><button type="button" class="secondary" id="returnMsgSave">Salvar mensagem</button><button type="button" class="secondary" id="returnMsgReset">Restaurar padrão</button></div></details>
   <p class="muted small">${returnShowContacted?'Clientes contatados nos últimos 15 dias.':'Clientes que não voltam há '+returnDays+' dias ou mais, dos que mais vieram para os que menos vieram. Ao tocar em WhatsApp o cliente é marcado como contatado por 15 dias.'}</p>
   ${shown.length?`<div class="return-list">${shown.map(e=>`<article class="return-card"><h4>${esc(e.c.name)}</h4><div class="muted small">${e.gap} dias sem voltar · último serviço em ${dateBR(e.last.date)} (${esc(e.last.service||'serviço')})</div><div class="muted small">${e.count} visita(s)${isEmployee()?'':' · '+money(e.total)}${e.vehicle?' · '+esc([e.vehicle.brand,e.vehicle.model,e.vehicle.plate].filter(Boolean).join(' ')):(e.last.vehicle?' · '+esc(e.last.vehicle):'')}</div><div class="return-actions">${e.phone?`<a class="wa-link" data-wa="${esc(e.c.id)}" ${waAnchor(waUrl(e.phone,returnMessage(template,e)))}>WhatsApp</a>`:'<span class="wa-link disabled">Sem telefone válido</span>'}${e.contacted?`<button type="button" class="action" data-runcontact="${esc(e.c.id)}">Desfazer contato</button>`:''}</div></article>`).join('')}</div>${list.length>shown.length?`<p class="muted small">Mostrando ${shown.length} de ${list.length}. Use a busca para refinar.</p>`:''}`:`<div class="empty">${returnShowContacted?'Nenhum cliente contatado recentemente.':'Nenhum cliente nesse período. Bom sinal!'}</div>`}`;
  const rerender=()=>renderReturnPanel();
  $('tableWrap').querySelectorAll('[data-rdays]').forEach(b=>b.onclick=()=>{returnDays=Number(b.dataset.rdays);rerender();});
  const cb=$('tableWrap').querySelector('[data-rcontacted]');if(cb)cb.onclick=()=>{returnShowContacted=!returnShowContacted;rerender();};
  $('returnMsgSave').onclick=()=>{const v=$('returnMsg').value.trim();try{localStorage.setItem('ab_retorno_msg',v||RETURN_DEFAULT_MSG);showToast('Mensagem salva neste aparelho.');}catch(e){showToast('Não foi possível salvar a mensagem neste aparelho.');}returnEditorOpen=true;rerender();};
  $('waAppSelect').onchange=e=>{try{localStorage.setItem('ab_wa_app',e.target.value);}catch(err){}returnEditorOpen=true;rerender();};
  $('returnMsgReset').onclick=()=>{try{localStorage.removeItem('ab_retorno_msg');}catch(e){}returnEditorOpen=true;rerender();};
  const mark=async(id,value)=>{const e=entries.find(x=>x.c.id===id);if(!e)return;try{await save('clients',{...e.c,lastContactAt:value});}catch(err){showToast('Não foi possível registrar o contato: '+err.message);}};
  $('tableWrap').querySelectorAll('[data-wa]').forEach(a=>a.addEventListener('click',async()=>{await mark(a.dataset.wa,today);setTimeout(rerender,800);}));
  $('tableWrap').querySelectorAll('[data-runcontact]').forEach(b=>b.onclick=async()=>{await mark(b.dataset.runcontact,'');rerender();});
 }catch(err){$('tableWrap').innerHTML='<div class="empty">Não foi possível carregar os clientes. Verifique a conexão.</div>';console.error(err);}
}

$('addBtn').onclick=()=>{if(active==='credits'){renderCreditForm();return;}if(active==='payments'){renderOtherIncomeForm();return;}if(active==='clients'){ $('formWrap').style.display=''; $('formWrap').classList.remove('hidden'); renderClientVehicleForm({}); return;}renderForm();};

$('refreshBtn').onclick=()=>{
 invalidateCache();
 if(active==='home')renderHomePanel();else if(active==='dashboard')renderDashboards();else if(active==='pending')renderPendingPaymentsTable();else if(active==='reports')renderFinancialMovement();else renderTable();
 renderStats();
 showToast('Dados atualizados da nuvem.');
};

let searchRenderTimer=null;$('searchInput').addEventListener('input',()=>{if(searchRenderTimer)clearTimeout(searchRenderTimer);searchRenderTimer=setTimeout(()=>{if(active==='pending')renderPendingPaymentsTable();else if(active!=='reports')renderTable();},220);});

$('templateBtn').onclick=downloadImportTemplate;
$('exportBtn').onclick=exportExcel;
setupExcelImport();
$('backupBtn').onclick=backupJSON;
$('resetDataBtn').onclick=()=>{if(!isEmployee())renderResetPanel();};

window.addEventListener('beforeinstallprompt',e=>{
 e.preventDefault();
 installPrompt=e;
 $('installBtn').classList.remove('hidden');
});

$('installBtn').onclick=async()=>{
 if(installPrompt){
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt=null;
  $('installBtn').classList.add('hidden');
 }else{
  showToast('No Chrome, abra o menu ⋮ e escolha Instalar app ou Adicionar à tela inicial.');
 }
};

init().catch(e=>{
 console.error(e);
 showApp(false);
 setLoginMessage('Falha ao iniciar: '+(e.message||'verifique as configurações e recarregue a página.'));
});
