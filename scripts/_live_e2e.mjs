import { io as ioc } from 'socket.io-client';
const BASE='http://127.0.0.1:4346'; const j=r=>r.json(); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const T=(n,ok,ex='')=>{ok?pass++:fail++;console.log(`${ok?'✓':'✗'} ${n}${ex?' | '+ex:''}`)};

// socket: require_approval dinle, policy'ye göre cevapla
const sock=ioc(BASE,{transports:['websocket']});
let approvals=[]; let policy='deny'; // 'grant'|'deny'|'ignore'
await new Promise((r,j2)=>{sock.on('connect',r);setTimeout(()=>j2(new Error('sock timeout')),15000)});
sock.on('require_approval',(p)=>{ approvals.push(p); if(policy==='grant') sock.emit('approval_response',{id:p.id,granted:true}); else if(policy==='deny') sock.emit('approval_response',{id:p.id,granted:false}); /* ignore→timeout */ });
const start=(mode)=>fetch(`${BASE}/api/trader/bot/start`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({symbol:'XAUUSD',step:10,lot:0.01,orders:5,mode})}).then(j);
const status=()=>fetch(`${BASE}/api/trader/bot/status`).then(j);
const stop=()=>fetch(`${BASE}/api/trader/bot/stop`,{method:'POST'}).then(j);
const setAcct=(a)=>fetch(`${BASE}/api/test/set-acct?a=${a}`).then(j).catch(()=>({})); // test helper yok; env ile boot edilecek

// (e) DRY onaysız çalışıyor + require_approval YOK
approvals=[]; const dry=await start('dry'); await sleep(1200); const ds=await status();
const dryNoApproval=approvals.length===0;
T('(e) DRY onaysız çalıştı, onay istenmedi', ds.running===true && ds.mode==='dry' && dryNoApproval, `running=${ds.running} mode=${ds.mode} approval=${approvals.length}`);
await stop(); await sleep(700);

// (a) LIVE + DENY → başlamadı, spawn yok
approvals=[]; policy='deny'; const denied=await start('live'); await sleep(800); const as=await status();
T('(a) LIVE onaysız (deny) → başlamadı', as.running===false && !!(denied.error||denied.liveDenied), `running=${as.running} err="${denied.error||denied.liveDenied}"`);

// (f) GERÇEK hesap → approver real:true ile tetiklendi (grant) → live başladı
approvals=[]; policy='grant'; const live=await start('live'); await sleep(1500); const ls=await status();
const realPayload=approvals.find(p=>p.action==='bot_live_start');
const argLive=(ls.logs||[]).find(l=>/ARGS/.test(l))||'';
T('(f) GERÇEK hesap → onay real:true + (b) onaylı --live spawn', !!realPayload && realPayload.real===true && realPayload.accountType==='real' && ls.running===true && ls.mode==='live' && /live=True/.test(argLive) && /dry=False/.test(argLive), `real=${realPayload?.real} acct=${realPayload?.accountType} mode=${ls.mode} arg="${argLive}"`);
await stop(); await sleep(700);

console.log(`SONUÇ(boot1 real): ${fail===0?'OK-şimdilik':'KALAN'} (${pass}/${pass+fail})`);
sock.close(); process.exit(0);
