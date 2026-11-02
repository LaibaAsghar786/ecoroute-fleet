/* EcoRoute | OBD-II connection badge and live telemetry widget */
(()=>{
const OB={on:1,cool:70,g:0};
const bt=()=>OB.on?'<i class="dot"></i>OBD-II Connected':'<i class="dot"></i>OBD-II Disconnected';
const ob=()=>`<span class="obdb ${OB.on?'on':'off'}" onclick="toggleObd()" title="Click to simulate OBD-II signal loss (demo)">${bt()}</span>`;
const upd=()=>document.querySelectorAll('.obdb').forEach(e=>{e.className='obdb '+(OB.on?'on':'off');e.innerHTML=bt()});
window.toggleObd=()=>{OB.on=OB.on?0:1;upd();toast(OB.on?'OBD-II interface connected. Live ECU telemetry is now streaming.':'OBD-II signal lost. Check the dongle or OBD port. Telemetry is paused.');if(S.m=='app'&&['home','live','prof'].includes(S.scr))A(S.scr)};
const m=()=>{const r=S.run,sp=r?S.sp:0,idle=!r||sp<5,j=()=>Math.random()-.5;
return{sp:Math.round(sp),rpm:r?Math.round(780+sp*19+j()*60):0,fc:r&&sp>=5?12+600/(sp+10)+j()*.6:0,ct:OB.cool,ld:r?Math.round(Math.min(95,idle?8:15+sp*.9)+j()*2):0,idle:r&&idle,st:!r}};
const wd=()=>{const d=m(),v=OB.on,x=(a,b)=>v?a:b;
const t=(i,l,a)=>`<div class="ot"><div class="mu">${i} ${l}</div><b>${a}</b></div>`;
return`<div class="cd"><div class="row sp"><b>OBD-II Live Telemetry</b>${ob()}</div>${v?'':'<div class="mu" style="color:var(--rd);margin:6px 0">No ECU data. Check that the OBD-II dongle is plugged in.</div>'}<div class="og">${t('','Vehicle Speed',x(f(d.sp)+' km/h','--'))+t('','Engine RPM',x(d.st?'Standby':f(d.rpm)+' RPM','--'))+t('','Instant Fuel',x(f(d.fc,1)+' L/100 km','--'))+t('','Coolant Temp',x(Math.round(d.ct)+'&deg;C','--'))}</div>${t('','Engine Load',x(d.st?'Engine standby':d.ld+'% Load ('+(d.idle?'Idling':'No Idling')+')','--'))}</div>`};
const oH=P.home;P.home=()=>{const k='<div class="row" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">',h=oH(),i=h.indexOf(k);return i<0?h+wd():h.slice(0,i)+wd()+h.slice(i)};
const oL=P.live;P.live=()=>{const k='<div class="cd row sp"><span>Traffic risk ahead',h=oL(),i=h.indexOf(k);return i<0?h+wd():h.slice(0,i)+wd()+h.slice(i)};
const oP=P.prof;P.prof=()=>{const k='<button class="btn o w" onclick="A(\'veh\')">',h=oP(),i=h.indexOf(k);const r=`<div class="cd row sp"><span>Simulate OBD-II disconnect (demo)</span>${tg(!OB.on,'toggleObd()')}</div>`;return i<0?h+r:h.slice(0,i)+r+h.slice(i)};
const oA=appView;window.appView=()=>{const h=oA();return h.includes('class="hdr"')?h.replace('<div class="sc" id="sc">',`<div class="obs"><span class="mu">Truck ECU link</span>${ob()}</div><div class="sc" id="sc">`):h};
setInterval(()=>{const sp=S.run?S.sp:0,tg=sp<5?(S.run?82:70):78+Math.min(14,sp*.22);OB.cool+=(tg-OB.cool)*.05;
if(S.m=='app'&&S.scr!='login'){if(!OB.g){OB.g=1;toast(OB.on?'OBD-II interface connected. Live ECU telemetry is streaming.':'OBD-II disconnected.')}}else if(S.scr=='login')OB.g=0},1000);
})();
