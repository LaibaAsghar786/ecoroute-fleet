/* EcoRoute | CO2 allowance, offline queue (IndexedDB), Leaflet maps, validation, CSV/PDF export, mobile nav, theme */
(()=>{
const LS=(k,v)=>{try{if(v===undefined)return JSON.parse(localStorage.getItem(k));localStorage.setItem(k,JSON.stringify(v))}catch(e){return null}};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
/* ---- persistence ---- */
const ST0=LS('ecr_st')||{},CA=ST0.ca||{},MT=ST0.mt||{},FU=LS('ecr_fuel')||[];
(ST0.tr||[]).forEach(r=>T.push(r));
const sv=()=>LS('ecr_st',{tr:T.slice(8),ca:CA,mt:MT});
window.setTheme=d=>{S.nm=!!d;document.documentElement.dataset.theme=d?'dark':'light';LS('ecr_theme',d?'dark':'light');const b=$('thm');if(b)b.innerHTML=d?'Light mode':'Dark mode'};
const th=LS('ecr_theme');S.nm=th?th=='dark':matchMedia('(prefers-color-scheme: dark)').matches;if(th)setTheme(th=='dark');
{const b=document.createElement('button');b.id='thm';b.title='Dark / light';b.innerHTML=S.nm?'Light mode':'Dark mode';b.onclick=()=>setTheme(!S.nm);document.querySelector('.top').appendChild(b)}
/* ---- CO2 allowance ---- */
const DEF={TRUCK_PK_094:6000,TRUCK_PK_031:8000,TRUCK_PK_108:7000,TRUCK_PK_052:3000,TRUCK_PK_076:6500,TRUCK_PK_021:7500,TRUCK_PK_064:7000,TRUCK_PK_011:4000};
const lim=i=>CA[T[i][0]]??DEF[T[i][0]]??0;
const mtd=i=>{let s=0;for(let d=1;d<=12;d++)s+=day(i,d).co;return s};
const pct=i=>lim(i)?mtd(i)/lim(i)*100:0;
const band=p=>p>=100?['Exceeded','r','#D64545']:p>=95?['Critical','r','#D64545']:p>=80?['Warning','a','#F5A524']:['On track','','#1E9E5A'];
const bar=p=>`<div class="pr"><b style="width:${Math.min(100,p)}%;background:${band(p)[2]}"></b></div>`;
const widget=()=>{let A=0,U=0;const rows=T.map((t,i)=>{const l=lim(i),u=mtd(i),p=pct(i),b=band(p);A+=l;U+=u;return`<div style="margin:12px 0"><div class="row sp"><b>${t[0]}</b><span><span class="pl ${b[1]}">${b[0]}</span> <a onclick="editL(${i})">${l?'Edit limit':'Set limit'}</a></span></div>${bar(p)}<div class="mu">${f(u)} / ${f(l)} kg CO&#8322; Used (${f(p)}% Consumed - ${31-12} Days Remaining) &middot; ${f(Math.max(0,l-u))} kg left</div></div>`}).join('');
return`<div class="cd" style="margin-bottom:14px"><div class="row sp"><h2>Fleet CO&#8322; Credit Allowance</h2><span class="mu">1 credit = 1 kg CO&#8322; &middot; October</span></div><div class="row" style="gap:28px;margin:8px 0"><div><div class="mu">Assigned</div><b>${f(A)} kg</b></div><div><div class="mu">Used</div><b>${f(U)} kg</b></div><div><div class="mu">Remaining</div><b>${f(Math.max(0,A-U))} kg</b></div></div>${bar(A?U/A*100:0)}${rows}</div>`};
window.editL=i=>showM(`<h2>CO&#8322; allowance &middot; ${T[i][0]}</h2><label>Monthly allowance (kg CO&#8322;)</label><input id="el_a" type="number" min="1" step="any" value="${lim(i)||''}"><div class="fe" id="el_e"></div><div class="row" style="margin-top:12px"><button class="btn" onclick="saveL(${i})">Save</button><button class="btn o" onclick="hideM()">Cancel</button></div>`);
window.saveL=i=>{const a=+$('el_a').value;if(!(a>0&&a<=1e5)){$('el_e').textContent='Enter a positive number (max 100,000).';return}CA[T[i][0]]=a;sv();hideM();toast('Allowance updated');view()};
const dc=()=>{const l=lim(0),u=mtd(0),p=l?u/l*100:0,b=band(p);return`<div class="cd" style="border:2px solid ${b[2]}"><b>Your Assigned Monthly CO&#8322; Allowance: ${f(l)} Credits</b><div class="row sp" style="margin:6px 0"><span>Consumed: <b>${f(u)} Credits</b></span><span>Remaining: <b>${f(Math.max(0,l-u))} Credits</b></span></div>${bar(p)}<div class="mu" style="margin-top:6px">${f(p)}% used &middot; ${b[0]}${p>=80?' &mdash; you are close to your limit. Use eco-routes and avoid idling.':''}</div></div>`};
/* ---- EV removal + nav ---- */
delete V.ev;delete P.ev;
NAV.splice(0,NAV.length,...NAV.filter(n=>n[0]!='ev'));NAV.splice(NAV.findIndex(n=>n[0]=='cred')+1,0,['logs','','Fuel & Fleet Logs']);
NI.logs=['','#E09F1F,#FFD166'];
const oD=V.dash;V.dash=()=>{const h=oD().replace(/<button onclick="go\('ev'\)">.*?<\/button>/,`<button onclick="go('logs')"><span class="qi" style="background:linear-gradient(135deg,#E0A100,#FFD166)"></span>Fuel &amp; Fleet Logs</button>`),k=h.indexOf('<div class="gd t2"><div class="cd"><div class="row sp"><h2>Last 24 hours');return k<0?h+widget():h.slice(0,k)+widget()+h.slice(k)};
const oH=P.home;P.home=()=>{const m='<div class="row" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">';return oH().replace(/<button onclick="A\('ev'\)">.*?<\/button>/,`<button onclick="A('fuel')"><span class="qi" style="background:linear-gradient(135deg,#E0A100,#FFD166)"></span>Fuel Log</button>`).replace(m,dc()+m)};
/* ---- network + offline queue (IndexedDB) ---- */
const NET={sim:0};S.on=navigator.onLine?1:0;let QC=[],db;
try{const r=indexedDB.open('ecoroute',1);r.onupgradeneeded=()=>r.result.createObjectStore('q',{keyPath:'id'});r.onsuccess=()=>{db=r.result;const g=db.transaction('q').objectStore('q').getAll();g.onsuccess=()=>{QC=g.result;S.pend=QC.length;badges();if(S.on&&QC.length)sync()}}}catch(e){QC=LS('ecr_q')||[]}
const qAdd=x=>{x.id=Date.now()+Math.random();QC.push(x);try{db.transaction('q','readwrite').objectStore('q').put(x)}catch(e){LS('ecr_q',QC)}S.pend=QC.length;badges()};
const badge=()=>S.on?`<i class="dot"></i>ONLINE MODE${NET.busy?' &middot; syncing...':''}`:`<i class="dot"></i>OFFLINE MODE${QC.length?' &middot; '+QC.length+' queued':''}`;
const nb=()=>`<span class="net ${S.on?'on':'off'}" onclick="toggleSim()" title="Click to simulate network loss (demo)">${badge()}</span>`;
function badges(){document.querySelectorAll('.net').forEach(e=>{e.className='net '+(S.on?'on':'off');e.innerHTML=badge()})}
const pt=m=>{const d=document.createElement('div');d.className='pt';d.innerHTML=`<b>Sync complete</b><div class="mu" style="margin-top:4px">${esc(m)}</div>`;d.onclick=()=>d.remove();document.body.appendChild(d);setTimeout(()=>d.remove(),8000)};
async function sync(){if(!S.on||NET.busy)return;if(!QC.length){toast('Everything is already synchronized');return}NET.busy=1;badges();await new Promise(r=>setTimeout(r,900));QC.forEach(q=>{if(q.t=='fuel'){const e=FU.find(x=>x.id==q.p);if(e)e.s='synced'}});LS('ecr_fuel',FU);try{db.transaction('q','readwrite').objectStore('q').clear()}catch(e){LS('ecr_q',[])}QC=[];S.pend=0;NET.busy=0;badges();pt('Network connection restored. Offlined trip logs and CO2 telemetry data have been successfully synchronized with the Fleet Manager server.');if(S.m=='web'&&S.wl&&S.v=='logs')view()}
window.sync=sync;
function setNet(){const on=navigator.onLine&&!NET.sim?1:0;if(on==S.on)return;S.on=on;badges();if(on)setTimeout(sync,500);else toast('You are offline. Data is saved on this device.')}
addEventListener('online',setNet);addEventListener('offline',setNet);window.toggleSim=()=>{NET.sim=!NET.sim;setNet()};
P.sync=()=>`<div class="hero"><div class="big" style="font-size:28px">${badge()}</div><div class="mu">${S.on?'Connected. Queued data uploads automatically.':'Fuel logs, route updates and GPS points are stored on this device (IndexedDB).'}</div></div><div class="row" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${tile('Queued records',QC.length)+tile('Fuel logs',QC.filter(q=>q.t=='fuel').length)+tile('GPS points',QC.filter(q=>q.t=='gps').length)+tile('Route updates',QC.filter(q=>q.t=='route').length)}</div><button class="btn w" onclick="S.on?sync():toast('You are offline')">Sync now</button><div class="cd row sp"><span>Simulate network loss (demo)</span>${tg(!S.on,'toggleSim()')}</div>`;
const oT=take;window.take=()=>{oT();if(!S.on)qAdd({t:'route',p:'eco'})};
/* ---- fuel log + validation ---- */
const nowL=()=>new Date(Date.now()-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,16);
const fs=e=>`<span class="pl ${e.s=='synced'?'':'a'}">${e.s=='synced'?'Synced':'Pending sync'}</span>`;
const fForm=p=>`<div class="${p=='fa'?'cd':''}">${p=='fm'?`<label>Truck</label><select id="fm_t">${T.map((t,i)=>`<option value="${i}">${t[0]}</option>`).join('')}</select>`:''}<label>Date &amp; time</label><input id="${p}_d" type="datetime-local" value="${nowL()}" max="${nowL()}"><label>Fuel (litres)</label><input id="${p}_l" type="number" min="0.1" step="0.1" inputmode="decimal"><label>Odometer (km)</label><input id="${p}_o" type="number" min="0" inputmode="numeric"><label>Cost (optional)</label><input id="${p}_c" type="number" min="0" step="any"><div class="fe" id="${p}_e"></div><div class="row" style="margin-top:12px"><button class="btn" onclick="fSave('${p}')">Save fuel log</button>${p=='fm'?'<button class="btn o" onclick="hideM()">Cancel</button>':''}</div></div>`;
window.fAdd=()=>showM(`<h2>Add fuel log</h2>${fForm('fm')}`);
window.fSave=p=>{const g=k=>$(p+'_'+k).value.trim(),tk=T[p=='fm'?+$('fm_t').value:0][0],L=+g('l'),o=g('o'),c=g('c'),d=new Date(g('d')),er=[],last=Math.max(MT[tk]?.odo||0,0,...FU.filter(e=>e.tr==tk).map(e=>e.o));
if(!(L>0&&L<=2000))er.push('Fuel must be between 0.1 and 2,000 L (no negative values).');
if(o===''||!(+o>=0)||+o>2e6)er.push('Odometer must be a non-negative number.');else if(+o<last)er.push('Odometer cannot be lower than the last reading ('+f(last)+' km).');
if(isNaN(d)||d>Date.now()+6e4||d<new Date('2020-01-01'))er.push('Date/time must be valid and not in the future.');
if(c!==''&&!(+c>=0))er.push('Cost cannot be negative.');
$(p+'_e').innerHTML=er.map(x=>'&bull; '+esc(x)).join('<br>');if(er.length)return;
const e={id:'F'+Date.now(),tr:tk,dt:d.toISOString(),l:L,o:+o,c:c===''?'':+c,s:S.on?'synced':'pending'};FU.push(e);LS('ecr_fuel',FU);if(!S.on)qAdd({t:'fuel',p:e.id});toast(S.on?'Fuel log saved':'Saved offline. It will sync automatically.');p=='fm'?(hideM(),view()):A('fuel')};
P.fuel=()=>`<button class="btn o" onclick="A('home')" style="justify-self:start">Back</button><h2>Fuel Log</h2>${fForm('fa')}<div class="cd"><b>Recent refills</b>${FU.filter(e=>e.tr==T[0][0]).slice(-5).reverse().map(e=>`<div class="row sp" style="margin:8px 0"><span class="mu">${new Date(e.dt).toLocaleString()} &middot; ${f(e.l,1)} L &middot; ${f(e.o)} km</span>${fs(e)}</div>`).join('')||'<p class="mu">No refills logged yet.</p>'}</div>`;
V.logs=()=>{const R=FU.slice().reverse();return hd('LOGS','Fuel & Fleet Logs','Driver fuel refills. Offline entries stay pending until synced.',`<button class="btn" onclick="fAdd()">+ Fuel log</button><button class="btn o" onclick="exp('csv','fuel')">Download CSV</button><button class="btn o" onclick="exp('pdf','fuel')">Download PDF</button>`)+`<div class="cd">${tbl(['TRUCK','DATE / TIME','LITRES','ODOMETER','COST','STATUS'],R.map(e=>`<tr><td>${e.tr}</td><td>${new Date(e.dt).toLocaleString()}</td><td>${f(e.l,1)}</td><td>${f(e.o)} km</td><td>${e.c===''?'-':f(e.c)}</td><td>${fs(e)}</td></tr>`))}${R.length?'':'<p class="mu">No fuel logs yet.</p>'}</div>`};
/* ---- add truck + validation ---- */
window.openAdd=()=>showM(`<h2>Add truck</h2><label>License plate</label><input id="at_p" placeholder="e.g. TK-9001"><label>Model</label><input id="at_m" placeholder="e.g. Hino 500"><label>Fuel type</label><select id="at_f"><option>Diesel</option><option>CNG</option><option>Hybrid</option><option>EV</option></select><label>Driver (optional)</label><input id="at_d"><label>Monthly CO&#8322; Credit Allowance (kg CO&#8322;)</label><input id="at_a" type="number" min="1" step="any" placeholder="e.g. heavy diesel 500, light van 200"><label>Starting odometer, km (optional)</label><input id="at_o" type="number" min="0"><div class="fe" id="at_e"></div><div class="row" style="margin-top:14px"><button class="btn" onclick="saveT()">Save truck</button><button class="btn o" onclick="hideM()">Cancel</button></div>`);
window.saveT=()=>{const g=k=>$('at_'+k).value.trim(),p=g('p').toUpperCase(),m=g('m'),d=g('d'),a=g('a'),o=g('o'),er=[];
if(!/^[A-Z0-9][A-Z0-9 -]{3,11}$/.test(p))er.push('Enter a valid plate (4-12 letters/digits).');else if(T.some(t=>t[2].toUpperCase()==p))er.push('This plate is already registered.');
if(m.length<2||m.length>40)er.push('Model is required (2-40 characters).');
if(d&&!/^[A-Za-z][A-Za-z .'-]{1,39}$/.test(d))er.push('Driver name is not valid.');
if(!(+a>0&&+a<=1e5))er.push('CO2 allowance must be a positive number (max 100,000 kg).');
if(o!==''&&!(+o>=0))er.push('Odometer cannot be negative.');
$('at_e').innerHTML=er.map(x=>'&bull; '+esc(x)).join('<br>');if(er.length)return;
const id='TRUCK_PK_'+String(70+T.length).padStart(3,'0');T.push([id,m,p,d||'Unassigned','Idle',0,0,0,'Pending',g('f')]);CA[id]=+a;if(o!=='')MT[id]={odo:+o};sv();hideM();toast('Truck added: '+p);if(S.m=='web')view()};
/* ---- exports ---- */
const DS={audit:()=>({n:'carbon_audit',t:'Carbon Audit',h:['Truck','Driver','CO2 today kg','MTD CO2 kg','Allowance kg','Used %','Remaining kg','Integrity'],r:T.map((t,i)=>[t[0],t[3],Math.round(live(i)),Math.round(mtd(i)),lim(i),Math.round(pct(i)),Math.max(0,Math.round(lim(i)-mtd(i))),t[8]])}),
fuel:()=>({n:'fleet_fuel_logs',t:'Fleet Fuel Logs',h:['Truck','Date/Time','Litres','Odometer km','Cost','Status'],r:FU.map(e=>[e.tr,new Date(e.dt).toLocaleString(),e.l,e.o,e.c,e.s])}),
fleet:()=>({n:'fleet_trucks',t:'Fleet & Trucks',h:['Truck','Model','Plate','Driver','Status','Distance km','CO2 kg','Diesel L','Integrity'],r:T.map((t,i)=>[t[0],t[1],t[2],t[3],t[4],t[5],Math.round(live(i)),Math.round(live(i)/2.68),t[8]])}),
trips:()=>({n:'trip_logbook',t:'Trip Logbook',h:['Trip','From','To','Time','Distance km','CO2 kg'],r:[['TRIP_KHI_LHR_102','Karachi','Hyderabad','06:10-09:40',158,142],['TRIP_HYD_NWB_103','Hyderabad','Nawabshah','10:30-13:05',150,131]]})};
const dl=(b,n)=>{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=n;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1e3);toast('Download started: '+n)};
window.exp=(k,kind)=>{kind=kind||(k=='log'?'trips':S.v=='logs'?'fuel':S.v=='fleet'?'fleet':'audit');const d=DS[kind]();
if(k=='pdf'){if(!window.jspdf){toast('PDF library not loaded (internet needed)');return}const D=new jspdf.jsPDF({orientation:'landscape'});D.setFontSize(16);D.text('EcoRoute - '+d.t,14,16);D.setFontSize(9);D.text('Generated '+new Date().toLocaleString()+' | Estimated values',14,22);D.autoTable({head:[d.h],body:d.r,startY:28,styles:{fontSize:8},headStyles:{fillColor:[11,110,79]}});D.save(d.n+'.pdf');return}
const s=[d.h,...d.r].map(r=>r.map(c=>{c=String(c??'');return/[",\n]/.test(c)?'"'+c.replace(/"/g,'""')+'"':c}).join(',')).join('\n');dl(new Blob(['\ufeff'+s],{type:'text/csv'}),d.n+'.csv')};
const oC=V.cred;V.cred=()=>{const a=DS.audit();return oC()+`<div class="cd" style="margin-top:14px"><div class="row sp"><h2>Carbon Audit</h2><div class="row"><button class="btn o" onclick="exp('csv','audit')">Download CSV</button><button class="btn o" onclick="exp('pdf','audit')">Download PDF</button></div></div>${tbl(a.h,a.r.map(r=>'<tr>'+r.map(c=>`<td>${c}</td>`).join('')+'</tr>'))}</div>`};
/* ---- maps (Leaflet) ---- */
const RP=[[24.86,67.0],[25.396,68.358],[25.814,68.426],[26.244,68.41],[27.705,68.857]];
const at=f=>{f=Math.max(0,Math.min(.999,f))*(RP.length-1);const i=f|0,u=f-i,a=RP[i],b=RP[i+1];return[a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u]};
const ic=(h,c)=>L.divIcon({html:`<div class="mk2" style="background:${c}">${h}</div>`,className:'',iconSize:[30,30]});
const tiles=m=>L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; OpenStreetMap'}).addTo(m);
V.live=()=>hd('LIVE MAP','Live Map','OpenStreetMap tiles. Truck positions are simulated.','')+`<div class="lv"><div class="cd" style="padding:8px"><div id="lmap" style="height:440px;border-radius:10px"></div><div class="mu" style="padding:8px 4px 0">Amber pin = early warning point &middot; dashed green = eco-route</div></div><div class="cd"><h2>Trucks</h2>${T.map(t=>`<p class="row sp" style="margin:6px 0"><span><b>${t[0].slice(-3)}</b> ${t[3]}</span>${pl(t[4])}</p>`).join('')}<button class="btn w" onclick="go('truck',0)">Open truck report</button></div></div>`;
let LM;function initMap(){const el=$('lmap');if(!el)return;if(typeof L=='undefined'){el.innerHTML='<p class="mu" style="padding:20px">Map library could not load (internet needed).</p>';return}
if(LM)LM.remove();LM=L.map(el).setView([26.2,68.2],7);tiles(LM);L.polyline(RP,{color:'#2B7BD6',weight:5}).addTo(LM);L.polyline([RP[1],[25.7,68.2],[25.95,68.3],RP[3]],{color:'#1E9E5A',weight:4,dashArray:'8 8'}).addTo(LM);L.marker(RP[2],{icon:ic('!','#F5A524')}).addTo(LM).bindPopup('Early warning point');
T.forEach((t,i)=>L.marker(t[4]=='Offline'?RP[0]:at((i*.13+.05)%1),{icon:ic(t[0].slice(-3),{Active:'#1E9E5A',Idle:'#F5A524',Offline:'#9AA7A2'}[t[4]]||'#2B7BD6')}).addTo(LM).bindPopup(`<b>${t[0]}</b><br>${t[3]} &middot; ${t[4]}`))}
const oL=P.live;P.live=()=>oL().replace('<div class="cd map" style="height:110px"></div>','<div class="cd" style="padding:6px"><div id="amph" style="height:170px"></div></div>');
let AM;function am(){const ph=$('amph');if(!ph||typeof L=='undefined')return;if(!AM){const el=document.createElement('div');el.style.cssText='height:170px;border-radius:10px';ph.appendChild(el);const m=L.map(el,{zoomControl:false}).setView(at(0),9);tiles(m);L.polyline(RP,{color:'#2B7BD6',weight:4}).addTo(m);AM={el,m,mk:L.marker(at(0),{icon:ic('','#1E9E5A')}).addTo(m)}}
if(AM.el.parentNode!=ph){ph.appendChild(AM.el);AM.m.invalidateSize()}const p=at((S.tk%300)/300);AM.mk.setLatLng(p);AM.m.panTo(p,{animate:false})}
new MutationObserver(am).observe($('root'),{childList:true,subtree:true});
/* ---- shell wrappers, mobile nav ---- */
const MB=['dash','fleet','live','cred'];let mi=0,ai=0;
const mbn=()=>`<nav class="mbn" style="--i:${mi}"><i class="ind"></i>${MB.map(v=>`<button onclick="go('${v}')"><em>${({dash:'Home',fleet:'Fleet',live:'Map',cred:'Carbon'})[v]}</em></button>`).join('')}<button onclick="msh()"><em>More</em></button></nav>`;
window.msh=()=>{let m=$('msh');if(m){m.remove();return}m=document.createElement('div');m.id='msh';m.className='msh';m.onclick=e=>{if(e.target==m)m.remove()};m.innerHTML=`<div class="msi">${NAV.filter(n=>n.length>1&&!MB.includes(n[0])).map(n=>`<button class="nv" onclick="$('msh').remove();go('${n[0]}')">${n[2]}</button>`).join('')}</div>`;document.body.appendChild(m)};
function mb(){setTimeout(()=>{const n=document.querySelector('.mbn');if(!n)return;let i=MB.indexOf(({day:'fleet',truck:'fleet'})[S.v]||S.v);if(i<0)i=4;mi=i;n.style.setProperty('--i',i);n.querySelectorAll('button').forEach((b,k)=>b.classList.toggle('on',k==i))},40)}
const oW=webShell;window.webShell=()=>oW().replace('<span class="pl">Demo mode</span>',nb()+'<span class="pl">Demo mode</span>').replace(/<\/main><\/div>$/,mbn()+'</main></div>');
const oV=view;window.view=function(){oV();if(S.v=='logs')$('cr').textContent='Fuel & Fleet Logs';if(S.v=='live')initMap();mb()};
const oA=appView;window.appView=()=>{const i=NB.findIndex(n=>n[0]==S.scr);let h=oA().replace(/<span class="pl[^"]*" onclick="A\('sync'\)">.*?<\/span>/,nb()).replace('<div class="bn">',`<div class="bn" style="--i:${ai}"><i class="ind${i<0?' none':''}"></i>`);setTimeout(()=>{const e=document.querySelector('.bn');if(e&&i>=0){e.style.setProperty('--i',i);ai=i}},40);return h};
const oP=P.prof;P.prof=()=>oP().replace(/onclick="S\.nm=!S\.nm;[^"]*"/,`onclick="setTheme(!S.nm);A('prof')"`);
/* ---- ticker ---- */
let bd=-1;setInterval(()=>{if(S.run&&!S.on&&S.tick%5==0)qAdd({t:'gps',p:at((S.tk%300)/300).map(x=>+x.toFixed(5))});S.pend=QC.length;const p=pct(0),b=p>=100?3:p>=95?2:p>=80?1:0;if(bd>=0&&b>bd)toast('CO2 allowance '+band(p)[0]+': '+f(p)+'% used');bd=b},1000);
R();
})();
