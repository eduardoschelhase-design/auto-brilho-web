
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
 $('tabs').innerHTML=Object.entries(modules).filter(([k])=>k!=='vehicles').map(([k,m])=>`<button class="tab ${k===active?'active':''}" data-tab="${k}">${m.icon} ${m.label}</button>`).join('');
 $('tabs').querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{
  active=b.dataset.tab;
  editId=null;
  $('formWrap').classList.add('hidden');
  renderTabs();
  renderSection();
 });
}

function renderSection(){
 const m=modules[active];
 $('sectionTitle').textContent=active==='clients'?'Clientes e veículos':m.label;
 $('sectionEyebrow').textContent='CADASTROS E CONTROLE';
 $('addBtn').textContent=active==='clients'?'+ Novo cadastro':'+ Novo '+m.singular;
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

async function renderStats(){
 try{
  const [clients,vehicles,services,appointments,payments,expenses]=
   await Promise.all(
    Object.values(modules).map(m=>all(m.store))
   );

  const paid=payments
   .filter(p=>p.status==='Pago')
   .reduce((s,p)=>s+Number(p.value||0),0);

  const spent=expenses
   .reduce((s,p)=>s+Number(p.value||0),0);

  const stats=[
   ['Clientes',clients.length],
   ['Veículos',vehicles.length],
   ['Agendamentos',appointments.filter(a=>
    ['Agendado','Confirmado'].includes(a.status)
   ).length],
   ['Saldo registrado',money(paid-spent)]
  ];

  $('stats').innerHTML=stats.map(([l,v])=>
   `<div class="stat">
    <div class="label">${l}</div>
    <div class="value">${v}</div>
   </div>`
  ).join('');

 }catch(e){
  console.error(e);
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
