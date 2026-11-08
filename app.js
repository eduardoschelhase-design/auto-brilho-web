
'use strict';

const DB_NAME='AutoBrilhoDB', DB_VERSION=1;

const modules={
 clients:{label:'Clientes',singular:'cliente',icon:'♙',store:'clients',fields:[['name','Nome completo','text',true],['phone','Telefone / WhatsApp','tel',false],['email','E-mail','email',false],['document','CPF / CNPJ','text',false],['address','Endereço','text',false],['notes','Observações','textarea',false]],columns:[['name','Nome'],['phone','Telefone'],['document','CPF / CNPJ']]},
 vehicles:{label:'Veículos',singular:'veículo',icon:'🚗',store:'vehicles',fields:[['client','Cliente','text',true],['plate','Placa','text',true],['type','Tipo de veículo','select',true,['Carro','SUV','Utilitário','Moto','Camionete','Caminhão 3/4','Caminhão','Carreta','Ônibus','Outro']],['brand','Marca','text',false],['model','Modelo','text',false],['color','Cor','text',false],['notes','Observações','textarea',false]],columns:[['plate','Placa'],['client','Cliente'],['type','Tipo'],['model','Modelo']]},
 services:{label:'Serviços realizados',singular:'serviço',icon:'✦',store:'services',fields:[['date','Data','date',true],['client','Cliente','text',true],['vehicle','Veículo / placa','text',true],['service','Serviço executado','text',true],['value','Valor (R$)','number',true],['status','Situação','select',true,['Concluído','Em andamento','Cancelado']],['paymentStatus','Situação financeira','select',false,['Recebido','Pendente']],['paymentMethod','Tipo de pagamento','select',false,['Dinheiro','Pix','Cartão','Brinde']],['notes','Observações','textarea',false]],columns:[['date','Data'],['client','Cliente'],['vehicle','Veículo'],['service','Serviço'],['value','Valor'],['status','Situação'],['paymentStatus','Pagamento'],['paymentMethod','Forma']]},
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

async function all(store){
 const {data,error}=await sbClient.from(store).select('id,data,created_at,updated_at').order('created_at',{ascending:false});
 if(error)throw error;
 return (data||[]).map(r=>({...r.data,id:r.id,createdAt:r.created_at,updatedAt:r.updated_at}));
}

async function save(store,item){
 const payload={data:{...item}};
 delete payload.data.id;
 delete payload.data.createdAt;
 delete payload.data.updatedAt;
 if(item.id)payload.id=item.id;
 const {data,error}=await sbClient.from(store).upsert(payload).select('id,data,created_at,updated_at').single();
 if(error)throw error;
 return {...data.data,id:data.id,createdAt:data.created_at,updatedAt:data.updated_at};
}

async function remove(store,id){
 const {error}=await sbClient.from(store).delete().eq('id',id);
 if(error)throw error;
}

function renderTabs(){
 const tabs=[
  ['dashboard','▥','Dashboards'],
  ...Object.entries(modules)
   .filter(([k])=>k!=='vehicles')
   .map(([k,m])=>[k,m.icon,m.label]),
  ['payables','◷','Contas a pagar']
 ];

 $('tabs').innerHTML=tabs.map(([key,icon,label])=>
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
  else input=`<input name="${key}" type="${type}" ${required?'required':''} ${type==='number'?'min="0" step="0.01"':''} value="${esc(item[key]??(type==='date'?new Date().toISOString().slice(0,10):''))}" placeholder="${type==='number'?'0,00':''}">`;
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

async function renderPayablesTable(){
 try{
  const rows=await all('expenses');
  const q=$('searchInput').value.trim().toLocaleLowerCase('pt-BR');
  const open=rows.filter(r=>r.paymentStatus==='Em aberto'||r.paymentStatus==='Pendente')
   .filter(r=>!q||Object.values(r).some(v=>String(v??'').toLocaleLowerCase('pt-BR').includes(q)));
  const total=open.reduce((n,r)=>n+Number(r.value||0),0);
  $('tableWrap').innerHTML=`<div class="dashboard-metrics" style="margin-bottom:14px"><div class="dashboard-metric"><span>Contas em aberto</span><strong>${open.length}</strong></div><div class="dashboard-metric"><span>Total a pagar</span><strong>${money(total)}</strong></div></div>
   ${open.length?`<div class="table-scroll"><table><thead><tr><th>Vencimento</th><th>Categoria</th><th>Subcategoria</th><th>Descrição</th><th>Valor</th><th>Ações</th></tr></thead><tbody>${open.map(r=>`<tr><td>${dateBR(r.dueDate||r.date)}</td><td>${esc(r.category||'—')}</td><td>${esc(r.subcategory||'—')}</td><td>${esc(r.description||'')}</td><td>${money(r.value)}</td><td><button class="action" data-pay="${r.id}">Confirmar pagamento</button> <button class="action" data-edit="${r.id}">Editar</button> <button class="action" data-delete="${r.id}">Excluir</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Nenhuma conta em aberto.</div>'}`;
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
 const initialDate=item.date||new Date().toISOString().slice(0,10);
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
     <div class="field"><label>Valor (R$) *</label><input name="value" type="text" inputmode="decimal" required value="${esc(item.value!==undefined?decimalText(item.value):'')}" placeholder="0,00"></div>
     <div class="field"><label>Situação *</label><select name="status" id="serviceStatus" required>
      <option value="">Selecione...</option>${['Em andamento','Concluído','Cancelado'].map(o=>`<option ${item.status===o?'selected':''}>${o}</option>`).join('')}
     </select></div>
     <div id="servicePaymentFields" class="form-grid ${item.status==='Concluído'?'':'hidden'}" style="grid-column:1/-1">
      <div class="field"><label>Situação financeira *</label><select name="paymentStatus" id="servicePaymentStatus">
       <option value="">Selecione...</option><option value="Recebido" ${item.paymentStatus==='Recebido'?'selected':''}>Recebido</option><option value="Pendente" ${item.paymentStatus==='Pendente'?'selected':''}>Pendente</option>
      </select></div>
      <div class="field"><label>Tipo de pagamento *</label><select name="paymentMethod" id="servicePaymentMethod">
       <option value="">Selecione...</option>${paymentMethods.map(o=>`<option ${item.paymentMethod===o?'selected':''}>${o}</option>`).join('')}
      </select></div>
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
   data.value=decimalValue(data.value);
   if(!Number.isFinite(data.value)||data.value<0)throw new Error('Informe um valor válido.');
   data.vehicle=normalizePlate(data.vehicle);
   if(data.status==='Concluído'){
    if(!data.paymentStatus||!data.paymentMethod)throw new Error('Informe se foi recebido ou pendente e o tipo de pagamento.');
    if(data.paymentStatus==='Recebido'){
     if(!data.receivedDate)throw new Error('Informe a data em que o pagamento foi recebido.');
    }else delete data.receivedDate;
   }else{delete data.paymentStatus;delete data.paymentMethod;delete data.receivedDate;}
   if(editId)data.id=editId;else data.createdAt=new Date().toISOString();
   const saved=await save('services',data);
   if(saved.status==='Concluído')await syncServicePayment(saved);
   else await cancelLinkedServicePayment(saved.id);
   $('formWrap').classList.add('hidden');editId=null;showToast('Serviço salvo na nuvem.');
   await renderTable();await renderStats();await renderFinancialMovement();
  }catch(err){showToast('Não foi possível salvar: '+(err.message||'verifique a conexão.'));}
  finally{submit.disabled=false;}
 };
}

async function syncServicePayment(service){
 const payments=await all('payments');
 const existing=payments.find(p=>p.serviceId===service.id);
 const method=service.paymentMethod||'';
 const status=method==='Brinde'?'Brinde':service.paymentStatus==='Recebido'?'Pago':'Pendente';
 // A data do serviço e a data do recebimento são eventos diferentes.
 // Para recebimentos, usa a data informada no serviço; para pendências,
 // mantém a data do serviço apenas como referência na lista de pendentes.
 const paymentDate=status==='Pago'?(service.receivedDate||localISODate()):service.date;
 const payment={
  ...(existing?{id:existing.id}:{}),
  serviceId:service.id,date:paymentDate,client:service.client,
  description:`Serviço ${service.service||''} - ${service.vehicle||''}`,
  method,value:Number(service.value||0),status,
  notes:service.notes||''
 };
 await save('payments',payment);
}

async function cancelLinkedServicePayment(serviceId){
 const payments=await all('payments');
 const linked=payments.find(p=>p.serviceId===serviceId);
 if(linked){linked.status='Estornado';await save('payments',linked);}
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
    <div class="field"><label>Data *</label><input name="date" type="date" required value="${esc(item.date||new Date().toISOString().slice(0,10))}"></div>
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
    await save('clients',{...client,...clientData});
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

 const m=modules[active];

 try{
  const rows=await all(m.store);
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

  $('tableWrap').innerHTML=`
  <table>
   <thead>
    <tr>${m.columns.map(c=>`<th>${c[1]}</th>`).join('')}
    <th>Ações</th></tr>
   </thead>
   <tbody>
    ${filtered.map(r=>`
     <tr>
      ${m.columns.map(([k])=>`<td>${esc(k==='date'?dateBR(r[k]):k==='value'?money(r[k]):r[k]??'—')}</td>`).join('')}
      <td>
       <button class="action" data-edit="${r.id}">Editar</button>
       <button class="action" data-delete="${r.id}">Excluir</button>
      </td>
     </tr>
    `).join('')}
   </tbody>
  </table>`;

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
    +payments.filter(p=>!p.serviceId && p.status==='Pago' && p.date && p.date.slice(0,7)===m.key)
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
   .filter(p=>p.status==='Pago'&&!p.serviceId)
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

  const stamp=new Date().toISOString().slice(0,10);
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
  a.download=`Auto_Brilho_Backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click();

  URL.revokeObjectURL(url);

showToast('Backup gerado com sucesso.');
 }catch(e){
  showToast('Erro ao gerar backup: '+e.message);
 }
}
function subscribeRealtime(){
 if(realtimeChannel)sbClient.removeChannel(realtimeChannel);
 realtimeChannel=sbClient.channel('auto-brilho-sync').on('postgres_changes',{event:'*',schema:'public'},()=>{
  if(active==='home')renderHomePanel();else if(active==='dashboard')renderDashboards();else if(active==='reports')renderFinancialMovement();else if(active==='pending')renderPendingPaymentsTable();else renderTable();renderStats();
 }).subscribe();
}

let appEntering=false;
async function enterApp(){
 if(appEntering)return;
 appEntering=true;
 try{
  showApp(true);
  renderTabs();
  renderSection();
  await renderStats();
  await checkPayablesNotifications();
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
   const {error}=await sbClient.auth.signOut({scope:'local'});
   if(error)throw error;
   if(realtimeChannel){
    await sbClient.removeChannel(realtimeChannel);
    realtimeChannel=null;
   }
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
  ['home','⌂','Início'],['dashboard','▥','Dashboards'],['clients','♙','Cadastro'],['services','✦','Serviços'],
  ['appointments','▦','Agendamentos'],['payments','R$','Pagamentos'],['pending','◷','Pendentes'],
  ['expenses','−','Despesas'],['payables','◷','Contas a pagar'],['reports','▤','Relatórios']
 ];
 $('tabs').innerHTML=tabs.map(([key,icon,label])=>`<button class="tab ${key===active?'active':''}" data-tab="${key}">${icon} ${label}</button>`).join('');
 $('tabs').querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{
  active=b.dataset.tab;editId=null;editingVehicleId=null;$('formWrap').innerHTML='';$('formWrap').classList.add('hidden');$('formWrap').style.display='none';renderTabs();renderSection();
 });
};

renderSection=function(){
 // Ao entrar/trocar de seção, descarta qualquer formulário anterior.
 // Os campos de Cadastro só são recriados pelo botão + Novo cliente.
 $('formWrap').innerHTML='';
 $('formWrap').classList.add('hidden');
 $('formWrap').style.display='none';
 const reports=active==='reports',home=active==='home',dashboard=active==='dashboard';
 $('mainPanel').classList.toggle('hidden',reports);$('reportsPanel').classList.toggle('hidden',!reports);
 $('stats').classList.toggle('hidden',reports||(!home&&!dashboard));
 if(reports){$('sectionTitle').textContent='Relatórios e importação';$('exportStatus').textContent='';renderFinancialMovement();return;}
 const special=home||dashboard||active==='pending';
 $('sectionEyebrow').textContent=home?'RESUMO DO NEGÓCIO':dashboard?'ANÁLISE E METAS':'CADASTROS E CONTROLE';
 $('sectionTitle').textContent=home?'Início':dashboard?'Dashboards':active==='pending'?'Pagamentos pendentes':active==='clients'?'Cadastro de clientes e veículos':active==='payables'?'Contas a pagar':modules[active]?.label||'Gestão';
 $('addBtn').classList.toggle('hidden',special);
 $('searchInput').parentElement.classList.toggle('hidden',home||dashboard);
 $('addBtn').textContent=active==='clients'?'+ Novo cliente':active==='payables'?'+ Nova conta a pagar':'+ Novo '+(modules[active]?.singular||'registro');
 $('searchInput').value='';
 if(home)renderHomePanel();else if(dashboard)renderDashboards();else if(active==='pending')renderPendingPaymentsTable();else renderTable();
};

async function renderHomePanel(){
 try{const [appointments,services,payments,expenses]=await Promise.all([all('appointments'),all('services'),all('payments'),all('expenses')]);const today=localISODate();const next=appointments.filter(a=>a.date>=today&&['Agendado','Confirmado'].includes(a.status)).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)).slice(0,6);const due=expenses.filter(isDueAlert);const todayServices=services.filter(s=>s.date===today&&s.status==='Concluído');const todayReceived=payments.filter(p=>p.date===today&&p.status==='Pago').reduce((n,p)=>n+Number(p.value||0),0);
 $('tableWrap').innerHTML=`<div class="home-quick-actions"><button class="primary" data-home-action="services">+ Novo serviço</button><button class="secondary" data-home-action="appointments">+ Agendamento</button><button class="secondary" data-home-action="pending">Pagamentos pendentes</button><button class="secondary" data-home-action="payables">Contas a pagar</button><button class="secondary" data-home-action="reports">Relatórios</button></div><div class="dashboard-metrics"><div class="dashboard-metric"><span>Serviços concluídos hoje</span><strong>${todayServices.length}</strong></div><div class="dashboard-metric"><span>Recebido hoje</span><strong>${money(todayReceived)}</strong></div><div class="dashboard-metric"><span>Agendamentos futuros</span><strong>${appointments.filter(a=>a.date>=today&&['Agendado','Confirmado'].includes(a.status)).length}</strong></div><div class="dashboard-metric"><span>Contas a vencer / atrasadas</span><strong>${due.length}</strong></div></div>${due.length?`<div class="alert-panel"><strong>Contas próximas do vencimento ou vencidas</strong>${due.map(e=>`<p>${dateBR(e.dueDate)} · ${esc(e.description)} · ${money(e.value)}</p>`).join('')}</div>`:''}<div class="dashboard-chart-panel"><h3>Próximos agendamentos</h3>${next.length?`<div class="table-scroll"><table><thead><tr><th>Data</th><th>Hora</th><th>Cliente</th><th>Veículo</th><th>Serviço</th><th>Situação</th></tr></thead><tbody>${next.map(a=>`<tr><td>${dateBR(a.date)}</td><td>${esc(a.time||'')}</td><td>${esc(a.client)}</td><td>${esc(a.vehicle)}</td><td>${esc(a.service)}</td><td>${esc(a.status)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">Nenhum agendamento futuro.</p>'}</div><p class="dashboard-footnote">O painel inicial mostra apenas os principais indicadores e atalhos. Análises, metas e controles detalhados ficam na aba Dashboards.</p>`;
 $('tableWrap').querySelectorAll('[data-home-action]').forEach(b=>b.onclick=()=>{active=b.dataset.homeAction;renderTabs();renderSection();if(active==='services')renderServiceForm();if(active==='appointments')renderAppointmentForm();});
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
  const q=normalizeText($('searchInput').value);
  const cards=clients.map(c=>{
   const vs=vehicles.filter(v=>v.clientId===c.id||sameClient(v.client,c.name));
   const ss=services.filter(s=>sameClient(s.client,c.name));
   return {c,vs,ss};
  }).filter(x=>!q||[x.c.name,x.c.phone,x.c.document,...x.vs.flatMap(v=>[v.plate,v.model,v.brand,v.type])].some(v=>normalizeText(v).includes(q)));
  if(!cards.length){$('tableWrap').innerHTML='<div class="empty">Nenhum cliente encontrado. Toque em “Novo cliente” para cadastrar.</div>';return;}
  const ranking=cards.slice().sort((a,b)=>b.ss.length-a.ss.length).slice(0,5);
  $('tableWrap').innerHTML=`<div class="client-ranking"><strong>Clientes mais frequentes</strong>${ranking.map((x,i)=>`<span>${i+1}. ${esc(x.c.name)} — ${x.ss.length} serviço(s)</span>`).join('')}</div>`+cards.map(({c,vs,ss})=>`<article class="client-card"><div class="client-card-head"><div><h3>${esc(c.name)}</h3><p>${esc(c.phone||'Telefone não informado')} · Cadastro: ${dateBR(c.registrationDate)||(!c.importKey&&c.createdAt?dateBR(String(c.createdAt).slice(0,10)):'data não informada')}</p><small>${ss.length} serviço(s) no histórico</small></div><strong>${ss.length}x</strong></div>
   <div class="client-vehicles">${vs.length?vs.map(v=>`<div class="client-vehicle-row"><span><b>${esc(normalizePlate(v.plate))}</b> · ${esc([v.brand,v.model,v.type].filter(Boolean).join(' ')||'Veículo')}</span><button class="action" data-editvehicle="${esc(v.id)}">Editar</button></div>`).join(''):'<p class="muted">Nenhum veículo cadastrado.</p>'}</div>
   <div class="client-actions"><button class="action" data-addvehicle="${esc(c.id)}">+ Veículo</button><button class="action" data-newservice="${esc(c.id)}">Novo serviço</button><button class="action" data-newappointment="${esc(c.id)}">Agendar</button><button class="action" data-history="${esc(c.id)}">Histórico</button><button class="action danger-action" data-deleteclient="${esc(c.id)}">Excluir cliente</button></div></article>`).join('');
  $('tableWrap').querySelectorAll('[data-addvehicle]').forEach(b=>{const c=cards.find(x=>x.c.id===b.dataset.addvehicle).c;b.onclick=()=>renderClientVehicleForm({addAnother:true,clientId:c.id,clientRecord:c});});
  $('tableWrap').querySelectorAll('[data-editvehicle]').forEach(b=>{const v=vehicles.find(x=>x.id===b.dataset.editvehicle);const c=clients.find(x=>x.id===v.clientId)||clients.find(x=>sameClient(x.name,v.client));originalRenderClientVehicleForm({...v,clientId:c?.id,clientRecord:c||{name:v.client}});});
  $('tableWrap').querySelectorAll('[data-newservice]').forEach(b=>b.onclick=async()=>{const c=clients.find(x=>x.id===b.dataset.newservice),v=selectedVehicleForClient(c,vehicles);if(!v){showToast('Cadastre um veículo para este cliente antes de lançar o serviço.');return;}active='services';renderTabs();renderSection();renderServiceForm({vehicle:normalizePlate(v.plate)});});
  $('tableWrap').querySelectorAll('[data-newappointment]').forEach(b=>b.onclick=()=>{const c=clients.find(x=>x.id===b.dataset.newappointment),v=selectedVehicleForClient(c,vehicles);if(!v){showToast('Cadastre um veículo para este cliente antes de agendar.');return;}active='appointments';renderTabs();renderSection();renderAppointmentForm({client:c.name,vehicle:normalizePlate(v.plate)});});
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
 try{const [services,expenses]=await Promise.all([all('services'),all('expenses')]);const now=new Date(),year=now.getFullYear(),month=now.getMonth()+1,key=year+'-'+String(month).padStart(2,'0');const done=services.filter(s=>s.status==='Concluído'&&s.date?.slice(0,7)===key);const days=[...new Set(done.map(s=>s.date))];const revenue=done.reduce((n,s)=>n+Number(s.value||0),0);const avgTicket=done.length?revenue/done.length:0;const settings=getLocalSettings();const holidays=(settings.holidays||'').split(',').map(x=>x.trim()).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x));const workdays=monthWorkingDays(year,month,holidays);const dailyTarget=Number(settings.dailyTarget||0);const targetRevenue=dailyTarget*workdays;const targetServices=avgTicket>0?Math.ceil(targetRevenue/avgTicket):0;const alerts=expenses.filter(isDueAlert);if(!alerts.length)await closeDueNotificationsIfClear();const cats=['Produtos','Funcionários','Pró-labore','Despesa mensal','Diversos','Cartão / empréstimo'];const caps=settings.caps||{};const paidExpenses=expenses.filter(e=>e.paymentStatus==='Pago'&&e.date?.slice(0,7)===key);const byCat=cats.map(c=>({c,total:paidExpenses.filter(e=>e.category===c).reduce((n,e)=>n+Number(e.value||0),0)}));const staff=paidExpenses.filter(e=>e.category==='Funcionários');const staffGroups={};staff.forEach(e=>{const k=e.supplier||e.subcategory||e.description||'Não identificado';staffGroups[k]=(staffGroups[k]||0)+Number(e.value||0);});
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
 const iso=(y,m,d)=>{y=Number(y);m=Number(m);d=Number(d);if(!y||m<1||m>12||d<1||d>31)return '';const out=`${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;const test=new Date(`${out}T12:00:00`);return test.getFullYear()===y&&test.getMonth()+1===m&&test.getDate()===d?out:'';};
 if(v instanceof Date&&!Number.isNaN(v.getTime()))return iso(v.getFullYear(),v.getMonth()+1,v.getDate());
 if(typeof v==='number'&&Number.isFinite(v)&&v>0){const d=XLSX.SSF.parse_date_code(v);return d?iso(d.y,d.m,d.d):'';}
 let s=String(v??'').trim();if(!s)return '';s=s.split(/[ T]/)[0];
 let m=s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);if(m)return iso(m[1],m[2],m[3]);
 m=s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/);if(m){let y=Number(m[3]);if(y<100)y+=y<50?2000:1900;return iso(y,m[2],m[1]);}
 if(/^\d+(?:\.\d+)?$/.test(s)){const n=Number(s);if(n>20000){const d=XLSX.SSF.parse_date_code(n);return d?iso(d.y,d.m,d.d):'';}}
 return '';
}
function rowObjects(ws){const rows=XLSX.utils.sheet_to_json(ws,{defval:'',raw:false});return rows;}
async function stageExcelFile(file){
 if(!window.XLSX)throw new Error('Leitor Excel indisponível.');const buf=await file.arrayBuffer(),wb=XLSX.read(buf,{type:'array',cellDates:true});const get=n=>wb.Sheets[n]?rowObjects(wb.Sheets[n]):[];
 const clients=get('Clientes').map((r,i)=>({r,i})).filter(x=>String(x.r['Nome completo']||'').trim()).map(({r,i})=>({name:String(r['Nome completo']).trim(),phone:String(r['Telefone / WhatsApp']||'').trim(),email:r['E-mail']||'',document:String(r['CPF / CNPJ']||'').trim(),address:r['Endereço']||'',notes:r['Observações']||'',registrationDate:excelDate(r['Data de cadastro']),importKey:'excel-client-'+i+'-'+normalizeText(r['Nome completo'])}));
 const vehicles=get('Veículos').filter(r=>String(r['Placa']||'').trim()).map(r=>({client:String(r['Cliente']||'').trim(),plate:normalizePlate(r['Placa']),type:String(r['Tipo de veículo']||'Outro').trim(),brand:String(r['Marca']||'').trim(),model:String(r['Modelo']||'').trim(),color:String(r['Cor']||'').trim(),notes:r['Observações']||''}));
 const services=get('Serviços realizados').map((r,i)=>({r,i})).filter(x=>String(x.r['Data']||'').trim()&&String(x.r['Cliente']||'').trim()).map(({r,i})=>({importKey:'excel-service-'+i,date:excelDate(r['Data']),client:String(r['Cliente']).trim(),vehicle:String(r['Veículo / placa']||'SEM PLACA').trim(),service:String(r['Serviço executado']||'Serviço').trim(),value:decimalValue(r['Valor (R$)']),_valueProvided:String(r['Valor (R$)']??'').trim()!=='',status:String(r['Situação']||'Concluído').trim(),paymentStatus:normalizeText(r['Situação financeira'])==='recebido'?'Recebido':'Pendente',paymentMethod:String(r['Tipo de pagamento']||'').trim(),notes:String(r['Observações']||'').trim()}));
 const payments=get('Receitas e pagamentos').filter(r=>String(r['Data']||'').trim()&&String(r['Descrição']||'').trim()).map(r=>({date:excelDate(r['Data']),client:String(r['Cliente']||'').trim(),description:String(r['Descrição']).trim(),method:String(r['Forma de pagamento']||'Outro').trim(),value:decimalValue(r['Valor (R$)']),status:String(r['Situação']||'Pago').trim(),notes:String(r['Observações']||'').trim()}));
 const expenseRows=get('Despesas');const payableRows=get('Contas a pagar').filter(p=>!expenseRows.some(d=>normalizeText(d['Descrição'])===normalizeText(p['Descrição'])&&normalizeText(d['Categoria'])===normalizeText(p['Categoria'])&&String(d['Valor (R$)'])===String(p['Valor (R$)'])&&String(d['Data de vencimento']||d['Data do pagamento']||'')===String(p['Data de vencimento']||p['Data do pagamento']||'')));const expenses=[...expenseRows,...payableRows].map((r,i)=>({r,i})).filter(x=>String(x.r['Descrição']||'').trim()).map(({r,i})=>({importKey:'excel-expense-'+i,date:excelDate(r['Data do pagamento']),dueDate:excelDate(r['Data de vencimento']),category:String(r['Categoria']||'Diversos').trim(),subcategory:String(r['Subcategoria']||'').trim(),description:String(r['Descrição']).trim(),supplier:String(r['Fornecedor']||'').trim(),value:decimalValue(r['Valor (R$)']),payment:String(r['Forma de pagamento']||'').trim(),paymentStatus:normalizeText(r['Situação'])==='pago'?'Pago':'Em aberto',notes:String(r['Observações']||'').trim()}));
 const appointments=get('Agendamentos').filter(r=>String(r['Data']||'').trim()&&String(r['Cliente']||'').trim()).map(r=>({date:excelDate(r['Data']),time:String(r['Horário']||'').trim(),client:String(r['Cliente']).trim(),vehicle:String(r['Veículo / placa']||'SEM PLACA').trim(),service:String(r['Serviço solicitado']||'').trim(),value:decimalValue(r['Valor (R$)']),status:String(r['Situação']||'Agendado').trim(),notes:String(r['Observações']||'').trim()}));
 return {clients,vehicles,services,payments,expenses,appointments};
}
function serviceKey(s){return [s.date,normalizeText(s.client),normalizePlate(s.vehicle),normalizeText(s.service),Number(s.value||0).toFixed(2)].join('|');}
async function downloadPreImportBackup(){const backup={app:'Auto Brilho Web',version:3,reason:'Backup automático antes da importação Excel',exportedAt:new Date().toISOString(),data:{}};for(const [key,m] of Object.entries(modules))backup.data[key]=await all(m.store);backup.data.settings=getLocalSettings();const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`Auto_Brilho_Backup_Pre_Importacao_${localISODate()}.json`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);}
async function importStagedExcel(){
 if(!stagedExcelImport)return;const btn=$('confirmExcelImport');btn.disabled=true;btn.textContent='Importando...';
 try{
  await downloadPreImportBackup();
  const data=stagedExcelImport;let counts={clients:0,vehicles:0,services:0,payments:0,expenses:0,appointments:0,duplicates:0,invalidServices:0};
  let currentClients=await all('clients'),currentVehicles=await all('vehicles'),currentServices=await all('services'),currentPayments=await all('payments'),currentExpenses=await all('expenses'),currentAppointments=await all('appointments');
  const clientMap=new Map();
  for(const c of data.clients){let found=currentClients.find(x=>x.importKey===c.importKey)||(c.document&&currentClients.find(x=>String(x.document||'').replace(/\D/g,'')===c.document.replace(/\D/g,'')))||(c.phone&&currentClients.find(x=>String(x.phone||'').replace(/\D/g,'')===c.phone.replace(/\D/g,'')))||(!c.phone&&!c.document&&currentClients.find(x=>sameClient(x.name,c.name)&&!x.importKey));if(found){clientMap.set(normalizeText(c.name),found);counts.duplicates++;}else{const saved=await save('clients',c);currentClients.push(saved);clientMap.set(normalizeText(c.name),saved);counts.clients++;}}
  for(const v of data.vehicles){const cl=clientMap.get(normalizeText(v.client))||currentClients.find(c=>sameClient(c.name,v.client));const existing=currentVehicles.find(x=>normalizePlate(x.plate)===v.plate);if(existing){counts.duplicates++;continue;}if(!cl){counts.duplicates++;continue;}const saved=await save('vehicles',{...v,clientId:cl.id,client:cl.name});currentVehicles.push(saved);counts.vehicles++;}
  const serviceMap=new Map();
  for(const s of data.services){if(!s.date||!s._valueProvided||!Number.isFinite(s.value)||s.value<0){counts.invalidServices++;continue;}const key=serviceKey(s);let found=currentServices.find(x=>x.importKey===key||serviceKey(x)===key);if(found){counts.duplicates++;serviceMap.set(key,found);continue;}const {_valueProvided,...serviceData}=s;const saved=await save('services',{...serviceData,importKey:key,vehicle:s.vehicle||'SEM PLACA'});currentServices.push(saved);serviceMap.set(key,saved);counts.services++;}
  for(const p of data.payments){let matched=null;const plate=(p.description.match(/[A-Z]{3}[0-9][A-Z0-9][0-9]{2,3}/i)||[])[0]||'';matched=currentServices.find(s=>s.date===p.date&&sameClient(s.client,p.client)&&Math.abs(Number(s.value||0)-p.value)<0.01&&(!plate||normalizePlate(s.vehicle)===normalizePlate(plate)));if(matched){const old=currentPayments.find(x=>x.serviceId===matched.id);if(old){counts.duplicates++;continue;}const status=normalizeText(p.status)==='pago'?'Pago':normalizeText(p.status)==='brinde'?'Brinde':'Pendente';const saved=await save('payments',{...p,status,serviceId:matched.id});currentPayments.push(saved);counts.payments++;}else{const exists=currentPayments.some(x=>x.date===p.date&&sameClient(x.client,p.client)&&normalizeText(x.description)===normalizeText(p.description)&&Math.abs(Number(x.value||0)-p.value)<0.01);if(exists){counts.duplicates++;continue;}const saved=await save('payments',{...p,status:normalizeText(p.status)==='pago'?'Pago':p.status});currentPayments.push(saved);counts.payments++;}}
  for(const e of data.expenses){if(!Number.isFinite(e.value)){counts.duplicates++;continue;}const exists=currentExpenses.some(x=>x.importKey===e.importKey||(!x.importKey&&x.date===e.date&&x.dueDate===e.dueDate&&sameClient(x.description,e.description)&&Math.abs(Number(x.value||0)-e.value)<0.01&&sameClient(x.category,e.category)));if(exists){counts.duplicates++;continue;}const saved=await save('expenses',e);currentExpenses.push(saved);counts.expenses++;}
  for(const a of data.appointments){const exists=currentAppointments.some(x=>x.date===a.date&&x.time===a.time&&sameClient(x.client,a.client)&&normalizePlate(x.vehicle)===normalizePlate(a.vehicle));if(exists){counts.duplicates++;continue;}const saved=await save('appointments',a);currentAppointments.push(saved);counts.appointments++;}
  stagedExcelImport=null;$('importPreview').classList.add('hidden');$('importExcelFile').value='';const resultText=`Importação concluída: ${counts.clients} clientes, ${counts.vehicles} veículos, ${counts.services} serviços, ${counts.payments} pagamentos, ${counts.expenses} despesas e ${counts.appointments} agendamentos. ${counts.duplicates} duplicado(s) ignorado(s) e ${counts.invalidServices} serviço(s) inválido(s) não importado(s).`;$('exportStatus').textContent=resultText;showToast(counts.services?`${counts.services} serviço(s) gravado(s) com sucesso.`:'Nenhum serviço novo foi gravado. Confira o resumo da importação.');await renderStats();await renderFinancialMovement();if(counts.services>0){active='services';renderTabs();renderSection();} 
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

async function setupExcelImport(){const input=$('importExcelFile');if(!input)return;input.onchange=async()=>{const file=input.files?.[0];if(!file)return;try{stagedExcelImport=await stageExcelFile(file);const d=stagedExcelImport;const preview=$('importPreview');preview.innerHTML=`<h3>Conferência antes de importar</h3><p>Arquivo: ${esc(file.name)}</p><ul><li>${d.clients.length} cadastros de clientes (incluindo nomes repetidos para conferência)</li><li>${d.vehicles.length} veículos</li><li>${d.services.length} serviços, incluindo lançamentos sem placa</li><li>${d.payments.length} movimentos de recebimento para conciliação com os serviços</li><li>${d.expenses.length} despesas / contas a pagar</li><li>${d.appointments.length} agendamentos</li></ul><p class="muted">O sistema compara os registros existentes antes de gravar. Pagamentos vinculados a serviços serão conciliados para evitar duplicidade. Faça backup antes de confirmar.</p><button class="primary wide" id="confirmExcelImport" type="button">Confirmar importação</button><button class="secondary wide" id="cancelExcelImport" type="button">Cancelar</button>`;preview.classList.remove('hidden');$('confirmExcelImport').onclick=importStagedExcel;$('cancelExcelImport').onclick=()=>{stagedExcelImport=null;preview.classList.add('hidden');input.value='';};}catch(err){showToast('Não foi possível ler a planilha: '+err.message);console.error(err);}};}

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

$('addBtn').onclick=()=>{if(active==='clients'){ $('formWrap').style.display=''; $('formWrap').classList.remove('hidden'); renderClientVehicleForm({}); return;}renderForm();};

$('refreshBtn').onclick=()=>{
 if(active==='home')renderHomePanel();else if(active==='dashboard')renderDashboards();else if(active==='pending')renderPendingPaymentsTable();else if(active==='reports')renderFinancialMovement();else renderTable();
 renderStats();
 showToast('Dados atualizados da nuvem.');
};

$('searchInput').addEventListener('input',()=>{if(active==='pending')renderPendingPaymentsTable();else if(active!=='reports')renderTable();});

$('templateBtn').onclick=downloadImportTemplate;
$('exportBtn').onclick=exportExcel;
setupExcelImport();
$('backupBtn').onclick=backupJSON;

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
