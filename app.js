
'use strict';

const DB_NAME='AutoBrilhoDB', DB_VERSION=1;

const modules={
 clients:{label:'Clientes',singular:'cliente',icon:'♙',store:'clients',fields:[['name','Nome completo','text',true],['phone','Telefone / WhatsApp','tel',false],['email','E-mail','email',false],['document','CPF / CNPJ','text',false],['address','Endereço','text',false],['notes','Observações','textarea',false]],columns:[['name','Nome'],['phone','Telefone'],['document','CPF / CNPJ']]},
 vehicles:{label:'Veículos',singular:'veículo',icon:'🚗',store:'vehicles',fields:[['client','Cliente','text',true],['plate','Placa','text',true],['type','Tipo de veículo','select',true,['Carro','Moto','Camionete','Caminhão 3/4','Caminhão','Carreta','Ônibus','Outro']],['brand','Marca','text',false],['model','Modelo','text',false],['color','Cor','text',false],['notes','Observações','textarea',false]],columns:[['plate','Placa'],['client','Cliente'],['type','Tipo'],['model','Modelo']]},
 services:{label:'Serviços realizados',singular:'serviço',icon:'✦',store:'services',fields:[['date','Data','date',true],['client','Cliente','text',true],['vehicle','Veículo / placa','text',true],['service','Serviço executado','text',true],['value','Valor (R$)','number',true],['status','Situação','select',true,['Concluído','Em andamento','Cancelado']],['notes','Observações','textarea',false]],columns:[['date','Data'],['client','Cliente'],['vehicle','Veículo'],['service','Serviço'],['value','Valor'],['status','Situação']]},
 appointments:{label:'Agendamentos',singular:'agendamento',icon:'▦',store:'appointments',fields:[['date','Data','date',true],['time','Horário','time',true],['client','Cliente','text',true],['vehicle','Veículo / placa','text',true],['service','Serviço solicitado','text',true],['status','Situação','select',true,['Agendado','Confirmado','Concluído','Cancelado']],['notes','Observações','textarea',false]],columns:[['date','Data'],['time','Horário'],['client','Cliente'],['vehicle','Veículo'],['service','Serviço'],['status','Situação']]},
 payments:{label:'Receitas e pagamentos',singular:'pagamento',icon:'R$',store:'payments',fields:[['date','Data','date',true],['client','Cliente','text',true],['description','Descrição','text',true],['method','Forma de pagamento','select',true,['Pix','Dinheiro','Cartão de débito','Cartão de crédito','Transferência','Outro']],['value','Valor (R$)','number',true],['status','Situação','select',true,['Pago','Pendente','Estornado']],['notes','Observações','textarea',false]],columns:[['date','Data'],['client','Cliente'],['description','Descrição'],['method','Forma'],['value','Valor'],['status','Situação']]},
 expenses:{label:'Despesas',singular:'despesa',icon:'−',store:'expenses',fields:[['date','Data','date',true],['category','Categoria','select',true,['Produtos de limpeza','Água','Energia','Aluguel','Equipamentos','Manutenção','Combustível','Salários / mão de obra','Impostos e taxas','Marketing','Outros']],['description','Descrição','text',true],['supplier','Fornecedor','text',false],['value','Valor (R$)','number',true],['payment','Forma de pagamento','select',false,['Pix','Dinheiro','Cartão','Transferência','Outro']],['notes','Observações','textarea',false]],columns:[['date','Data'],['category','Categoria'],['description','Descrição'],['supplier','Fornecedor'],['value','Valor']]}
};

let sbClient, active='clients', editId=null, installPrompt=null, realtimeChannel=null, recoveryMode=false, editingVehicleId=null;
let dashboardPeriod='current';
let dashboardChartRange=12;
const $=id=>document.getElementById(id);

const configured=()=>window.AUTO_BRILHO_CONFIG && /^https:\/\//.test(window.AUTO_BRILHO_CONFIG.supabaseUrl) && !window.AUTO_BRILHO_CONFIG.supabaseUrl.includes('COLE_AQUI') && window.AUTO_BRILHO_CONFIG.supabaseAnonKey && !window.AUTO_BRILHO_CONFIG.supabaseAnonKey.includes('COLE_AQUI');

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function money(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
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
   .map(([k,m])=>[k,m.icon,m.label])
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

 $('sectionEyebrow').textContent=
  isDashboard?'ANÁLISE DO NEGÓCIO':'CADASTROS E CONTROLE';

 $('sectionTitle').textContent=
  isDashboard?'Dashboards':
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
  '+ Novo '+modules[active].singular;

 $('searchInput').value='';
 renderTable();
}

function renderForm(item={}){
 if(active==='clients'){
  renderClientVehicleForm(item);
  return;
 }

 const m=modules[active];
 editId=item.id??null;

 $('formWrap').innerHTML=`<form id="recordForm"><div class="form-grid">${m.fields.map(([key,label,type,required,opts])=>{
  let input='';
  if(type==='select')input=`<select name="${key}" ${required?'required':''}><option value="">Selecione...</option>${opts.map(o=>`<option ${item[key]===o?'selected':''}>${esc(o)}</option>`).join('')}</select>`;
  else if(type==='textarea')input=`<textarea name="${key}" rows="2">${esc(item[key]||'')}</textarea>`;
  else input=`<input name="${key}" type="${type}" ${required?'required':''} ${type==='number'?'min="0" step="0.01"':''} value="${esc(item[key]??(type==='date'?new Date().toISOString().slice(0,10):''))}" placeholder="${type==='number'?'0,00':''}">`;
  return `<div class="field"><label>${esc(label)}${required?' *':''}</label>${input}</div>`;
 }).join('')}</div><div class="form-actions"><button type="button" class="secondary" id="cancelForm">Cancelar</button><button class="primary" type="submit">${item.id?'Salvar alterações':'Salvar cadastro'}</button></div></form>`;

 $('formWrap').classList.remove('hidden');

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
   if('value'in data)data.value=Number(data.value||0);
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
  ['email','E-mail','email',false],
  ['document','CPF / CNPJ','text',false],
  ['address','Endereço','text',false],
  ['clientNotes','Observações do cliente','textarea',false]
 ];

 const vehicleFields=[
  ['plate','Placa','text',true],
  ['type','Tipo de veículo','select',true,['Carro','Moto','Camionete','Caminhão 3/4','Caminhão','Carreta','Ônibus','Outro']],
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
     await renderTable();
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
   await renderTable();
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

 const m=modules[active];

 try{
  const rows=await all(m.store);
  const q=$('searchInput').value.trim().toLocaleLowerCase('pt-BR');

  const filtered=rows.filter(r=>
   !q||Object.values(r).some(v=>
    String(v??'').toLocaleLowerCase('pt-BR').includes(q)
   )
  );

  if(!filtered.length){
   $('tableWrap').innerHTML=`<div class="empty">${rows.length?'Nenhum resultado para esta busca.':'Ainda não há registros aqui.\nToque em “+ Novo cadastro” para começar.'}</div>`;
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
  const [services,payments,expenses]=await Promise.all([
   all('services'),
   all('payments'),
   all('expenses')
  ]);

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
   const revenue=payments
    .filter(p=>
     p.status==='Pago' &&
     p.date &&
     p.date.slice(0,7)===m.key
    )
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
    spent,
    balance:revenue-spent,
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
    description:'Faturamento menos despesas'
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
       <p>Faturamento recebido e despesas registradas</p>
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
  const periodExpenses=expenses.filter(inPeriod);

  // Somente serviços concluídos.
  const completed=periodServices.filter(
   s=>s.status==='Concluído'
  ).length;

  // Somente pagamentos efetivamente recebidos.
  const paid=periodPayments
   .filter(p=>p.status==='Pago')
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
   ['Faturamento',money(paid)],
   ['Despesas',money(spent)],
   ['Saldo',money(paid-spent)],
   ['Agendamentos',scheduled],
   ['Clientes cadastrados',clients.length],
   ['Veículos cadastrados',vehicles.length]
  ];

  $('stats').innerHTML=`
   <div style="grid-column:1/-1;margin-bottom:12px">
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
     o[label]=k==='date'?dateBR(r[k]):k==='value'?Number(r[k]||0):r[k]??''
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

 realtimeChannel=sbClient.channel('auto-brilho-sync')
  .on('postgres_changes',{
   event:'*',
   schema:'public'
  },()=>{
   renderTable();
   renderStats();
  })
  .subscribe();
}

async function enterApp(){
 showApp(true);
 renderTabs();
 renderSection();
 await renderStats();
 subscribeRealtime();
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
    }
   }catch(err){
    console.error('Erro ao abrir painel:',err);
    showApp(false);
    setLoginMessage('Erro ao carregar painel: '+err.message);
   }
  },0);
 });

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

$('addBtn').onclick=()=>renderForm();

$('refreshBtn').onclick=()=>{
 renderTable();
 renderStats();
 showToast('Dados atualizados da nuvem.');
};

$('searchInput').addEventListener('input',renderTable);

$('exportBtn').onclick=exportExcel;
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
