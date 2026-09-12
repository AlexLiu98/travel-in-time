(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const canvas = $("gameCanvas"), ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const ui = Object.fromEntries(["backLink","brandLink","gameHubLink","volumeSlider","soundToggle","bestScore","winCount","routeProgress","trainName","destination","platform","countdown","startButton","eventBanner","eventGerman","eventChinese","screenOverlay","overlayIcon","overlayEyebrow","overlayTitle","overlayText","overlayButton","upgradeOverlay","upgradeGrid","stationName","floorName","objectiveText","lives","score","staminaBar","eventLog","stationTip","gameToast"].map(id => [id, $(id)]));
  const account = new URLSearchParams(location.search).get("mode") === "account";
  ui.backLink.href = ui.brandLink.href = account ? "./index.html?mode=account" : "./index.html";
  ui.gameHubLink.href = account ? "./games.html?v=1&mode=account" : "./games.html?v=1";

  const STATIONS = [["Köln Hbf","科隆中央火车站"],["Frankfurt (Main) Hbf","法兰克福中央火车站"],["Hamburg Hbf","汉堡中央火车站"],["München Hbf","慕尼黑中央火车站"],["Berlin Hbf","柏林中央火车站"],["Bonn Hbf","波恩中央火车站"],["Hannover Hbf","汉诺威中央火车站"],["Mainz Hbf","美因茨中央火车站"],["Düsseldorf Hbf","杜塞尔多夫中央火车站"],["Leipzig Hbf","莱比锡中央火车站"]];
  const DESTS = ["Berlin","Bonn","Bremen","Dresden","Düsseldorf","Frankfurt","Hamburg","Köln","Leipzig","Mainz","München","Nürnberg","Stuttgart","Wiesbaden"];
  const TRAINS = ["ICE 612","ICE 724","IC 2045","EC 9","RE 5","RE 8","RB 26","S 8"];
  const SETS = [[3,5,7],[4,8,11],[2,6,9],[1,7,12],[5,9,13]];
  const FLOORS = {hall:"大厅 · Bahnhofshalle",tunnel:"地下通道 · Unterführung",platform:"站台 · Bahnsteig"};
  const TIPS = ["站台号只会出现在大厅大屏和临时广播中；顶部只保留车厢区，请自己记住站台。","德国车站通常没有进站闸机；但站台上仍可能遇到随机查票。","红帽捣乱者可出现在所有楼层；进入 240px 后会冲刺，被撞后会退开并暂停追击。","临时换台会在你抵达原站台后发生，必须下楼返回通道重新找路。","Zugteilung 表示列车会分段运行，请根据顶部车厢区寻找正确位置。","SEV 是铁路替代巴士；列车取消后要沿通道返回大厅出口。"];
  const keys = {up:false,down:false,left:false,right:false,dash:false};
  const p = {x:78,y:448,r:12,dir:1,walk:0,stamina:100,boost:0,stun:0,safe:0};
  const g = {mode:"menu",floor:"hall",stage:0,total:4,lives:3,score:0,speed:150,dashCost:32,timeBonus:0,slipFactor:1,stunFactor:1,lucky:0,startBoost:0,remaining:70,stageTime:70,station:STATIONS[0],train:"ICE 612",dest:"Berlin",platforms:[3,5,7],target:1,current:null,coach:1,kind:"train",board:false,events:[],world:null,banner:0,interaction:null,platformChangeTimer:0,platformChangeDone:false,ambushEvent:null,last:performance.now(),record:loadRecord()};

  const pick = a => a[Math.floor(Math.random()*a.length)];
  const shuffle = a => { a=[...a]; for(let i=a.length-1;i;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  const near = (x,y,r=45) => Math.hypot(p.x-x,p.y-y)<=r;
  const clock = s => {const n=Math.max(0,Math.ceil(s));return `${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`;};
  const circleRect = (x,y,r,o) => {const nx=clamp(x,o.x,o.x+o.w),ny=clamp(y,o.y,o.y+o.h);return (x-nx)**2+(y-ny)**2<r**2;};
  const boundary = () => [{x:0,y:0,w:W,h:48},{x:0,y:H-28,w:W,h:28},{x:0,y:0,w:22,h:H},{x:W-22,y:0,w:22,h:H}];

  function loadRecord(){try{const x=JSON.parse(localStorage.getItem("travel-in-time-db-roguelite-v2"));return {best:+x?.best||0,wins:+x?.wins||0};}catch{return {best:0,wins:0};}}
  function saveRecord(){g.record.best=Math.max(g.record.best,Math.round(g.score));localStorage.setItem("travel-in-time-db-roguelite-v2",JSON.stringify(g.record));records();}
  function records(){ui.bestScore.textContent=g.record.best.toLocaleString("zh-CN");ui.winCount.textContent=g.record.wins;}

  const EVENTS = [
    ["platform",true,"Kurzfristiger Gleiswechsel! Abfahrt von einem anderen Gleis.","临时换台！请立刻下楼返回通道，重新寻找站台。",()=>changePlatform(6),false,true],
    ["track",true,"Personen im Gleis. Der Bahnsteig wird gesperrt.","轨道区域有人，原站台封闭，列车已经换台。",()=>changePlatform(7),false,true],
    ["wrongway",true,"Falsche Fahrtrichtung. Der Zug wird auf ein anderes Gleis umgeleitet.","列车开错方向后临时折返，改从另一站台发车。",()=>{g.dest=pick(DESTS.filter(x=>x!==g.dest));changePlatform(5);},true,true],
    ["medical",true,"Medizinischer Notfall am Bahnsteig. Bitte Gleis wechseln.","站台发生医疗急救，列车临时换台。",()=>changePlatform(6),false,true],
    ["police",true,"Polizeieinsatz. Der Bahnsteig ist vorübergehend gesperrt.","警方处置导致站台封闭，请下楼改走另一站台。",()=>{addCrowd();changePlatform(6);},true,true],
    ["points",true,"Weichenstörung. Die Abfahrt wird verlegt.","道岔故障，列车改由另一站台发车。",()=>changePlatform(5),false,true],
    ["works",true,"Wegen Bauarbeiten ist der direkte Tunnel gesperrt.","地下通道施工，最近路线被封，请寻找绕行路线。",addClosure],
    ["underpass",true,"Ein Teil der Unterführung ist gesperrt.","地下通道部分封闭，必须绕开施工围栏。",addClosure],
    ["escalator",true,"Rolltreppe außer Betrieb. Rechnen Sie mit Wartezeit.","扶梯故障；第一次使用楼梯会被拥堵拖住。",()=>g.world.stairJam=1],
    ["crowd",true,"Hohes Reisendenaufkommen im Tunnel.","地下通道人流激增，小心碰撞和堵塞。",addCrowd],
    ["event",true,"Großveranstaltung. Der Bahnhof ist stark überfüllt.","大型活动散场，所有楼层旅客骤增。",()=>Object.values(g.world.maps).forEach(m=>m.npcs.push(...makeNPCs(5,m.walls,"hall")))],
    ["trouble",true,"Achtung: Ein aggressiver Störer belästigt Reisende.","注意：红帽捣乱者会在 240px 内加速冲撞。",()=>g.world.trouble=true],
    ["signal",true,"Signalstörung. Anzeigen fallen vorübergehend aus.","信号故障，电子显示与指示牌暂时熄灭 7 秒。",()=>g.world.blackout=7],
    ["display",true,"Anzeigefehler! Beachten Sie ausschließlich die Ansage.","显示屏信息错误，一块指示牌仍显示旧站台。",()=>{g.world.wrongSign=true;g.world.wrongSignTimer=10;}],
    ["power",true,"Stromausfall im Bahnhof.","车站短暂停电，站台数字和通道标牌暂时不可见。",()=>g.world.blackout=6],
    ["overhead",true,"Oberleitungsstörung. Der Zugang ist nur langsam möglich.","接触网故障触发安全管制，移动速度暂时降低。",()=>g.world.slow=9],
    ["weather",true,"Unwetter: Rutschgefahr im Bahnhof.","暴雨灌入车站，地面湿滑，移动时会发生侧滑。",()=>g.world.slippery=10],
    ["snow",true,"Schnee und Eis im Eingangsbereich.","大雪造成结冰，移动与转向暂时变难。",()=>{g.world.slippery=8;g.world.slow=6;}],
    ["baggage",true,"Herrenloses Gepäck behindert den Durchgang.","无人看管的行李堵住部分通道，请绕行。",addBaggage],
    ["object",true,"Gegenstände im Gleis verzögern die Einfahrt.","轨道有异物，列车进站推迟，但通道新增障碍。",()=>{g.remaining+=6;addBaggage();}],
    ["animals",true,"Tiere im Gleis. Bitte rechnen Sie mit Verzögerungen.","动物闯入轨道，获得少量时间，但站台更加拥挤。",()=>{g.remaining+=5;addCrowd();}],
    ["coach",true,"Zugteilung! Nur der angezeigte Zugteil fährt bis zum Ziel.","列车将分段运行，请重新寻找正确车厢区域。",changeCoach,true],
    ["short",true,"Geänderte Wagenreihung. Der Zug hält heute verkürzt.","车厢编组临时缩短，正确上车位置已经改变。",changeCoach,true],
    ["door",true,"Türstörung. Bitte nutzen Sie einen anderen Wagenbereich.","车门故障，当前车厢无法上车，请改找另一车厢区。",changeCoach,true],
    ["technical",true,"Technische Störung am Zug.","车辆技术故障，关门时间提前且车厢位置改变。",()=>{changeCoach();g.remaining=Math.max(9,g.remaining-5);},true],
    ["early",true,"Die Türen schließen früher. Bitte beeilen Sie sich!","列车将提前关门，倒计时减少 8 秒！",()=>g.remaining=Math.max(9,g.remaining-8)],
    ["delay",false,"Verspätung wegen eines vorausfahrenden Zuges.","因前车影响晚点，获得 9 秒，但旅客继续增加。",()=>{g.remaining+=9;addCrowd();}],
    ["fire",true,"Feuerwehreinsatz am Bahnhof. Ein Durchgang wird gesperrt.","消防处置封闭一段通道，请立即绕行。",addClosure,true],
    ["staff",true,"Personalausfall. Der Zug endet vorzeitig.","人员短缺，列车提前终到，请返回大厅乘坐 SEV。",cancelToBus,true],
    ["strike",true,"Streikbedingter Zugausfall. Bitte nutzen Sie den Ersatzverkehr.","罢工导致列车取消，请返回大厅寻找替代巴士。",cancelToBus,true],
    ["cancel",true,"Zug fällt aus. Bitte nutzen Sie den SEV.","列车取消！请下楼返回大厅，从出口寻找替代巴士。",cancelToBus,true]
  ].map(([id,danger,de,zh,apply,late=false,redirect=false])=>({id,danger,de,zh,apply,late,redirect}));

  const UPGRADES = [
    ["👟","轻便跑鞋","永久移动速度 +13%",()=>g.speed*=1.13],
    ["⏱","时间余量","每站多 9 秒",()=>g.timeBonus+=9],
    ["⚡","耐力训练","冲刺消耗降低 30%",()=>g.dashCost*=.7],
    ["🥾","防滑鞋","湿滑地面的侧滑幅度降低 70%",()=>g.slipFactor*=.3],
    ["🛡","厚外套","眩晕和碰撞罚时减半",()=>g.stunFactor*=.5],
    ["🍀","幸运车票","下一站少一次突发事件",()=>g.lucky++],
    ["🎫","备用车票","恢复一张车票",()=>g.lives=Math.min(3,g.lives+1),()=>g.lives<3],
    ["☕","大杯咖啡","下一站开局加速 12 秒",()=>g.startBoost=12]
  ];

  function makeNPCs(n,walls,floor){
    const a=[],colors=["#df646e","#55aeb9","#d5a33d","#8877bb","#68ab72"];
    for(let i=0;i<n;i++){let x=100,y=250;for(let k=0;k<80;k++){x=52+Math.random()*850;y=72+Math.random()*395;if(!walls.some(o=>circleRect(x,y,13,o)))break;}a.push({x,y,r:10,vx:(Math.random()-.5)*(44+g.stage*5),vy:(Math.random()-.5)*(44+g.stage*5),color:pick(colors),phase:Math.random()*8,inspector:i===0&&floor==="platform"&&g.stage>=3});}return a;
  }
  function world(){
    const variants=[
      [{x:230,y:48,w:22,h:150},{x:230,y:270,w:22,h:242},{x:460,y:48,w:22,h:278},{x:460,y:398,w:22,h:114},{x:650,y:48,w:22,h:118},{x:650,y:238,w:22,h:274}],
      [{x:205,y:48,w:22,h:250},{x:205,y:370,w:22,h:142},{x:408,y:48,w:22,h:113},{x:408,y:233,w:22,h:279},{x:626,y:48,w:22,h:260},{x:626,y:380,w:22,h:132}],
      [{x:260,y:48,w:22,h:112},{x:260,y:232,w:22,h:280},{x:490,y:48,w:22,h:205},{x:490,y:325,w:22,h:187},{x:690,y:48,w:22,h:128},{x:690,y:248,w:22,h:264}]
    ];
    const walls={
      hall:[...boundary(),{x:348,y:88,w:264,h:112,invisible:true},{x:250,y:318,w:115,h:52},{x:455,y:405,w:122,h:48},{x:700,y:96,w:94,h:55}],
      tunnel:[...boundary(),...pick(variants)],
      platform:[...boundary(),{x:22,y:48,w:916,h:108,invisible:true},{x:205,y:345,w:112,h:46},{x:426,y:325,w:106,h:48},{x:650,y:365,w:96,h:42},{x:350,y:205,w:65,h:42}]
    };
    return {maps:Object.fromEntries(Object.entries(walls).map(([f,w])=>[f,{walls:w,bags:[],npcs:makeNPCs(7+g.stage*(f==="tunnel"?2:1),w,f),troublemaker:null}])),wrongSign:false,wrongSignTimer:0,blackout:0,slow:0,slippery:0,stairJam:0,closure:null,trouble:g.stage>=2||Math.random()<.45,board:{x:480,y:165},hallStair:{x:850,y:440},hallReturn:{x:78,y:270},tunnelStairs:[{x:820,y:115},{x:820,y:270},{x:820,y:425}],platformStair:{x:92,y:438},bus:{x:140,y:270},doors:[{x:300,label:"A–C"},{x:540,label:"D–F"},{x:780,label:"G–H"}]};
  }

  function start(){Object.assign(g,{mode:"running",floor:"hall",stage:1,lives:3,score:0,speed:150,dashCost:32,timeBonus:0,slipFactor:1,stunFactor:1,lucky:0,startBoost:0});ui.eventLog.innerHTML="";audio.start();setup();hideOverlay();ui.startButton.textContent="暂停游戏";toast("记住大屏站台号，再去通道自己找标牌");}
  function setup(){
    g.station=pick(STATIONS);g.train=pick(TRAINS);g.dest=pick(DESTS.filter(x=>!g.station[0].startsWith(x)));g.platforms=pick(SETS);g.target=Math.floor(Math.random()*3);g.current=null;g.coach=g.stage>=3?Math.floor(Math.random()*3):1;g.kind="train";g.board=false;g.floor="hall";g.stageTime=Math.max(40,58-(g.stage-1)*6)+g.timeBonus;g.remaining=g.stageTime;g.world=world();g.events=chooseEvents();g.banner=0;g.interaction=null;g.platformChangeTimer=0;g.platformChangeDone=false;g.ambushEvent=(g.stage===1||g.stage===4||Math.random()<.7)?pick(EVENTS.filter(e=>e.redirect)):null;Object.assign(p,{x:78,y:448,stamina:100,boost:g.startBoost,stun:0,safe:0});g.startBoost=0;ui.eventBanner.classList.remove("show","alert");ui.stationTip.textContent=TIPS[(g.stage-1)%TIPS.length];mission();log(`Willkommen in ${g.station[0]}. Prüfen Sie die Abfahrtstafel.`,`欢迎来到${g.station[1]}，先查看大厅出发大屏。`);
  }
  function chooseEvents(){let n=[2,3,4,5][g.stage-1];if(g.lucky){n=Math.max(2,n-1);g.lucky--;}let pool=EVENTS.filter(e=>(!e.late||g.stage>=3)&&!e.redirect);let a=shuffle(pool).slice(0,n);if(g.stage<4)a=a.filter((e,i)=>!(["cancel","staff","strike"].includes(e.id)&&i<n-1));a.sort((x,y)=>["cancel","staff","strike"].includes(x.id)?1:["cancel","staff","strike"].includes(y.id)?-1:0);return a.map((e,i)=>({...e,fired:false,trigger:g.stageTime-(3+i*4.5)}));}
  function objective(){if(g.kind==="bus")return g.floor==="platform"?"下楼返回地下通道":g.floor==="tunnel"?"沿通道返回大厅":"前往大厅左侧蓝色 SEV 出口";if(!g.board)return "查看大厅出发大屏";if(g.floor==="hall")return "找到下楼通道";if(g.floor==="tunnel")return "对照站台号寻找楼梯";return `自行核对站台，再找 ${g.world.doors[g.coach].label} 车厢`;}
  function mission(){ui.stationName.textContent=g.station?.[0]||"—";ui.floorName.textContent=FLOORS[g.floor];ui.trainName.textContent=g.train;ui.destination.textContent=g.kind==="bus"?"SEV · Ersatzbus":g.dest;ui.platform.textContent=g.kind==="bus"?"SEV":g.board?g.world.doors[g.coach].label:"??";ui.routeProgress.textContent=`${Math.max(0,g.stage-1)} / ${g.total}`;ui.objectiveText.textContent=objective();status();}
  function status(){ui.countdown.textContent=clock(g.remaining);ui.countdown.classList.toggle("danger",g.remaining<=14&&g.mode==="running");ui.lives.textContent=("♥ ".repeat(g.lives)+"♡ ".repeat(3-g.lives)).trim();ui.score.textContent=Math.round(g.score).toLocaleString("zh-CN");ui.staminaBar.style.width=`${p.stamina}%`;}
  function floor(f,x,y){g.floor=f;p.x=x;p.y=y;p.safe=.7;mission();audio.transition();}

  function interact(){
    if(g.mode!=="running"||p.stun>0)return;
    const w=g.world;
    const atStair=(g.floor==="hall"&&near(w.hallStair.x,w.hallStair.y,54))||(g.floor==="platform"&&near(w.platformStair.x,w.platformStair.y,52))||(g.floor==="tunnel"&&(near(w.hallReturn.x,w.hallReturn.y,52)||w.tunnelStairs.some(q=>near(q.x,q.y,50))));
    if(atStair&&w.stairJam>0){w.stairJam=0;stun(1.8);g.remaining=Math.max(5,g.remaining-1.5);banner("ROLLTREPPE AUSSER BETRIEB","扶梯停运，人群堵住楼梯 1.8 秒——再按 E 通行。",true);return;}
    if(g.floor==="hall"){
      if(near(w.board.x,w.board.y,60)&&!g.board){g.board=true;log(`${g.train} Richtung ${g.dest}, Gleis ${g.platforms[g.target]}, Abschnitt ${w.doors[g.coach].label}.`,`${g.train} 开往 ${g.dest}：${g.platforms[g.target]} 站台，${w.doors[g.coach].label} 车厢区。`);banner("VERBINDUNG GEFUNDEN",`确认：${g.platforms[g.target]} 站台 · ${w.doors[g.coach].label} 车厢区`,false);audio.pickup();mission();return;}
      if(near(w.hallStair.x,w.hallStair.y,54)){if(!g.board&&g.kind!=="bus"){toast("先查看出发大屏，确认站台");audio.bump();return;}floor("tunnel",92,270);log("Zur Unterführung.","已下楼进入地下通道。");return;}
      if(g.kind==="bus"&&near(w.bus.x,w.bus.y,86)){complete();return;}
    }else if(g.floor==="tunnel"){
      if(near(w.hallReturn.x,w.hallReturn.y,52)){floor("hall",830,420);log("Zurück zur Bahnhofshalle.","返回车站大厅。");return;}
      for(let i=0;i<3;i++)if(near(w.tunnelStairs[i].x,w.tunnelStairs[i].y,50)){g.current=i;floor("platform",92,438);log(`Aufgang zu Gleis ${g.platforms[i]}.`,`已上楼抵达 ${g.platforms[i]} 站台。`);if(i===g.target&&g.ambushEvent&&!g.platformChangeDone&&g.kind==="train")g.platformChangeTimer=.75;return;}
    }else{
      if(near(w.platformStair.x,w.platformStair.y,52)){const s=w.tunnelStairs[g.current??1];floor("tunnel",s.x-42,s.y);log("Zurück in die Unterführung.","已下楼返回地下通道。");return;}
      for(let i=0;i<3;i++)if(near(w.doors[i].x,174,58)){if(g.kind!=="train"){toast("列车已取消，请返回大厅乘坐 SEV");audio.bump();}else if(g.current!==g.target){g.remaining=Math.max(7,g.remaining-4);banner("FALSCHER ZUG","这不是你的列车；请自行核对站台或返回大厅查看大屏。",true);audio.bump();}else if(i!==g.coach){g.remaining=Math.max(7,g.remaining-3);banner("FALSCHER ZUGTEIL",`该车厢不到 ${g.dest}，请核对顶部车厢区。`,true);audio.bump();}else complete();return;}
    }
  }
  function changePlatform(extra){const old=g.target;g.target=pick([0,1,2].filter(i=>i!==old));g.coach=Math.floor(Math.random()*3);g.board=true;g.remaining+=extra;mission();}
  function changeCoach(){const old=g.coach;g.coach=pick([0,1,2].filter(i=>i!==old));mission();}
  function cancelToBus(){g.kind="bus";g.board=true;g.remaining+=12;const m=g.world.maps.hall,bay={x:35,y:112,w:212,h:132,invisible:true,busBay:true};if(!m.walls.some(o=>o.busBay))m.walls.push(bay);m.npcs.forEach(n=>{if(circleRect(n.x,n.y,n.r+8,bay))relocateTrouble(n,m);});if(m.troublemaker&&circleRect(m.troublemaker.x,m.troublemaker.y,m.troublemaker.r+12,bay))relocateTrouble(m.troublemaker,m);mission();ui.stationTip.textContent="列车已取消：返回大厅，寻找左侧蓝色 SEV / Ersatzbus，靠近后按 E 上车。";toast("返回大厅，寻找左侧蓝色 SEV 替代巴士");}
  function addClosure(){if(g.world.closure)return;const a=[{x:270,y:210,w:105,h:22},{x:505,y:175,w:105,h:22},{x:505,y:405,w:105,h:22}];g.world.closure=pick(a);g.world.maps.tunnel.walls.push(g.world.closure);}
  function addCrowd(){g.world.maps.tunnel.npcs.push(...makeNPCs(8,g.world.maps.tunnel.walls,"tunnel"));}
  function addBaggage(){const m=g.world.maps[g.floor],a=g.floor==="platform"?[{x:505,y:245,w:38,h:26},{x:716,y:275,w:42,h:28}]:[{x:350,y:270,w:40,h:27},{x:575,y:345,w:45,h:30}];const o=pick(a);m.bags.push(o);m.walls.push(o);}
  function fire(e){e.fired=true;e.apply();banner(e.de,e.zh,e.danger);log(e.de,e.zh);audio.event(e.danger);}
  function forcePlatformChange(){if(g.platformChangeDone||!g.ambushEvent)return;g.platformChangeDone=true;g.platformChangeTimer=0;const e=g.ambushEvent;e.apply();const gleis=g.platforms[g.target];banner(`${e.de} Neu: Gleis ${gleis}.`,`${e.zh} 新站台：Gleis ${gleis}，请记住。`,e.danger);log(`${e.de} Neu: Gleis ${gleis}.`,`${e.zh} 新站台：Gleis ${gleis}。`);audio.event(e.danger);}
  function banner(de,zh,danger){ui.eventGerman.textContent=de;ui.eventChinese.textContent=zh;ui.eventBanner.classList.toggle("alert",danger);ui.eventBanner.classList.add("show");g.banner=5;}
  function log(de,zh){const li=document.createElement("li"),d=new Date();li.innerHTML=`<time>${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}</time><p><b></b><span></span></p>`;li.querySelector("b").textContent=de;li.querySelector("span").textContent=zh;ui.eventLog.prepend(li);while(ui.eventLog.children.length>9)ui.eventLog.lastElementChild.remove();}

  const map=()=>g.world.maps[g.floor];
  const hit=(x,y,r)=>map().walls.some(o=>circleRect(x,y,r,o));
  function move(dx,dy){let q=p.x;p.x+=dx;if(hit(p.x,p.y,p.r))p.x=q;q=p.y;p.y+=dy;if(hit(p.x,p.y,p.r))p.y=q;}
  function stun(seconds){p.stun=seconds*g.stunFactor;p.safe=p.stun+1;audio.stun();}
  function update(dt){
    if(g.mode!=="running")return;g.remaining-=dt;g.banner=Math.max(0,g.banner-dt);if(!g.banner)ui.eventBanner.classList.remove("show");p.safe=Math.max(0,p.safe-dt);p.stun=Math.max(0,p.stun-dt);p.boost=Math.max(0,p.boost-dt);g.world.blackout=Math.max(0,g.world.blackout-dt);g.world.slow=Math.max(0,g.world.slow-dt);g.world.slippery=Math.max(0,g.world.slippery-dt);g.world.wrongSignTimer=Math.max(0,g.world.wrongSignTimer-dt);if(!g.world.wrongSignTimer)g.world.wrongSign=false;
    const e=g.events.find(x=>!x.fired&&g.remaining<=x.trigger);if(e)fire(e);if(g.remaining<=0){miss();return;}
    if(g.platformChangeTimer>0){g.platformChangeTimer-=dt;if(g.platformChangeTimer<=0&&g.floor==="platform"&&g.current===g.target)forcePlatformChange();}
    if(p.stun<=0){let dx=+keys.right-+keys.left,dy=+keys.down-+keys.up;if(dx||dy){const l=Math.hypot(dx,dy);dx/=l;dy/=l;const dash=keys.dash&&p.stamina>1,s=g.speed*(p.boost>0?1.24:1)*(dash?1.68:1)*(g.world.slow>0?.76:1);p.stamina=clamp(p.stamina+(dash?-g.dashCost:16)*dt,0,100);move(dx*s*dt,dy*s*dt);if(g.world.slippery>0)move(Math.sin(performance.now()/155)*34*g.slipFactor*dt,Math.cos(performance.now()/210)*25*g.slipFactor*dt);p.dir=dx<0?-1:dx>0?1:p.dir;p.walk+=dt*(dash?13:8);}else p.stamina=clamp(p.stamina+21*dt,0,100);}
    npcs(dt);trouble(dt);detect();g.score+=dt*2.5;status();
  }
  function npcs(dt){const m=map();for(const n of m.npcs){const ox=n.x,oy=n.y;n.x+=n.vx*dt;n.y+=n.vy*dt;n.phase+=dt*7;if(m.walls.some(o=>circleRect(n.x,n.y,n.r,o))||n.x<35||n.x>W-35||n.y<62||n.y>H-42){n.x=ox;n.y=oy;n.vx*=-1;n.vy*=-1;}if(p.safe<=0&&Math.hypot(p.x-n.x,p.y-n.y)<p.r+n.r+2){p.safe=.9;const loss=(n.inspector?3.2:1.1)*g.stunFactor;g.remaining=Math.max(2,g.remaining-loss);if(n.inspector){stun(.65);log("Fahrkartenkontrolle!",`随机查票耽误 ${loss.toFixed(1)} 秒。`);}audio.bump();}}}
  function relocateTrouble(t,m){for(let i=0;i<100;i++){const x=70+Math.random()*820,y=78+Math.random()*390;if(Math.hypot(x-p.x,y-p.y)>330&&!m.walls.some(o=>circleRect(x,y,t.r,o))){t.x=x;t.y=y;return;}}t.x=clamp(W-p.x,70,W-70);t.y=clamp(H-p.y,78,H-70);}
  function moveTrouble(t,m,vx,vy,dt){let q=t.x;t.x+=vx*dt;if(m.walls.some(o=>circleRect(t.x,t.y,t.r,o)))t.x=q;q=t.y;t.y+=vy*dt;if(m.walls.some(o=>circleRect(t.x,t.y,t.r,o)))t.y=q;}
  function trouble(dt){if(!g.world.trouble)return;const m=map();let t=m.troublemaker;if(!t){let x=700,y=260;for(let i=0;i<80;i++){x=70+Math.random()*820;y=78+Math.random()*390;if(!m.walls.some(o=>circleRect(x,y,14,o))&&Math.hypot(x-p.x,y-p.y)>310)break;}t=m.troublemaker={x,y,r:13,phase:0,charging:false,cooldown:0};}t.cooldown=Math.max(0,(t.cooldown||0)-dt);const dx=p.x-t.x,dy=p.y-t.y,d=Math.max(1,Math.hypot(dx,dy)),charge=t.cooldown<=0&&d<=240,s=charge?112+g.stage*6:50+g.stage*4;t.charging=charge;const direction=t.cooldown<=0?1:-.45;moveTrouble(t,m,dx/d*s*direction,dy/d*s*direction,dt);t.phase+=dt*(charge?13:7);if(t.cooldown<=0&&p.safe<=0&&Math.hypot(p.x-t.x,p.y-t.y)<p.r+t.r+3){const sec=(2.2+Math.random()*.6)*g.stunFactor;stun(sec/g.stunFactor);p.safe=p.stun+2.6;t.cooldown=3.4;relocateTrouble(t,m);g.remaining=Math.max(3,g.remaining-.7*g.stunFactor);banner("ACHTUNG, STÖRER!",`被捣乱者撞到，眩晕 ${sec.toFixed(1)} 秒；随后无敌 2.6 秒。`,true);log("Ein Störer blockiert den Weg.",`被红帽捣乱者撞到；眩晕结束后获得 2.6 秒无敌。`);}}
  function detect(){const w=g.world;let s=null;if(g.floor==="hall"){if(near(w.board.x,w.board.y,60)&&!g.board)s="E · 查看出发大屏";else if(near(w.hallStair.x,w.hallStair.y,54))s="E · 下楼进入通道";else if(g.kind==="bus"&&near(w.bus.x,w.bus.y,86))s="E · 登上 SEV 替代巴士";}else if(g.floor==="tunnel"){if(near(w.hallReturn.x,w.hallReturn.y,52))s="E · 上楼返回大厅";w.tunnelStairs.forEach((q,i)=>{if(near(q.x,q.y,50))s=`E · 上楼到 Gleis ${g.platforms[i]}`;});}else{if(near(w.platformStair.x,w.platformStair.y,52))s="E · 下楼返回通道";w.doors.forEach(q=>{if(near(q.x,174,58))s="E · 尝试上车";});}g.interaction=s;}

  function complete(){if(g.mode!=="running")return;g.mode="upgrade";const bonus=Math.round(g.remaining*21+g.stage*330+g.lives*90);g.score+=bonus;audio.success();log("Anschluss erreicht!",`成功赶上第 ${g.stage} 程，奖励 ${bonus} 分。`);if(g.stage>=g.total){win();return;}ui.routeProgress.textContent=`${g.stage} / ${g.total}`;upgrades();}
  function upgrades(){const a=shuffle(UPGRADES.filter(x=>!x[4]||x[4]())).slice(0,3);ui.upgradeGrid.innerHTML="";a.forEach(x=>{const b=document.createElement("button");b.type="button";b.className="upgrade-card";b.innerHTML=`<i>${x[0]}</i><strong>${x[1]}</strong><span>${x[2]}</span>`;b.onclick=()=>{x[3]();audio.pickup();ui.upgradeOverlay.hidden=true;g.stage++;g.mode="running";setup();toast(`获得：${x[1]}`);};ui.upgradeGrid.append(b);});ui.upgradeOverlay.hidden=false;}
  function miss(){if(g.mode!=="running")return;g.lives--;audio.fail();status();if(g.lives<=0){g.mode="over";saveRecord();ui.startButton.textContent="重新开始";overlay("✕","REISE BEENDET","旅程中断",`连续错过三次接驳。本轮得分 ${Math.round(g.score).toLocaleString("zh-CN")}。`,"重新出发",start);}else{g.mode="missed";overlay("⌛","ANSCHLUSS VERPASST","没赶上这班车",`还剩 ${g.lives} 张车票。下一班车的三层路线会重新生成。`,"寻找下一班",()=>{g.mode="running";setup();hideOverlay();});}}
  function win(){g.mode="win";g.record.wins++;g.score+=1400;saveRecord();ui.routeProgress.textContent=`${g.total} / ${g.total}`;ui.startButton.textContent="再来一轮";overlay("🏁","ZIEL ERREICHT","成功抵达终点！",`你完成了大厅、地下通道和站台三层换乘，最终得分 ${Math.round(g.score).toLocaleString("zh-CN")}。`,"挑战新路线",start);}
  function pause(){if(g.mode==="running"){g.mode="paused";audio.paused(true);ui.startButton.textContent="继续游戏";overlay("Ⅱ","KURZE PAUSE","旅程暂停","倒计时已经停止。准备好后继续赶车。","继续游戏",pause);}else if(g.mode==="paused"){g.mode="running";audio.paused(false);hideOverlay();ui.startButton.textContent="暂停游戏";}}
  function overlay(icon,eye,title,text,button,action){ui.overlayIcon.textContent=icon;ui.overlayEyebrow.textContent=eye;ui.overlayTitle.textContent=title;ui.overlayText.textContent=text;ui.overlayButton.textContent=button;ui.overlayButton.onclick=action;ui.screenOverlay.classList.add("show");}
  function hideOverlay(){ui.screenOverlay.classList.remove("show");}
  function toast(s){clearTimeout(g.toastTimer);ui.gameToast.textContent=s;ui.gameToast.classList.add("show");g.toastTimer=setTimeout(()=>ui.gameToast.classList.remove("show"),1900);}

  function tiles(a,b,n=24){ctx.fillStyle=a;ctx.fillRect(0,0,W,H);for(let y=48;y<H-28;y+=n)for(let x=22;x<W-22;x+=n){ctx.fillStyle=((x/n+y/n)%2)?a:b;ctx.fillRect(x,y,n-1,n-1);}}
  function sign(x,y,text,w=110,color="#173b50"){ctx.fillStyle=color;ctx.fillRect(x,y,w,25);ctx.fillStyle="#628796";ctx.fillRect(x,y,w,3);ctx.fillStyle="#f4f5e9";ctx.font="bold 10px ui-monospace,monospace";ctx.fillText(text,x+7,y+17);}
  function stairs(x,y,text,color){ctx.fillStyle=color;ctx.fillRect(x-46,y-32,92,65);ctx.fillStyle="#e6ece8";for(let i=0;i<5;i++)ctx.fillRect(x-34+i*7,y+17-i*8,55-i*7,5);ctx.fillStyle="#ffffff";ctx.font="900 11px ui-monospace,monospace";ctx.fillText(text,x-41,y-19);}
  function drawHall(){tiles("#bbc7c6","#c8d1ce",28);ctx.fillStyle="#89a8b0";ctx.fillRect(22,48,916,40);for(let x=36;x<930;x+=70){ctx.fillStyle="#b7d8dc";ctx.fillRect(x,53,44,25);}board();stairs(g.world.hallStair.x,g.world.hallStair.y,"↓ UNTERFÜHRUNG","#287d86");sign(53,170,g.kind==="bus"?"SEV / ERSATZBUS":"AUSGANG / EXIT",g.kind==="bus"?176:126,g.kind==="bus"?"#087f86":"#173b50");sign(704,165,"DB INFORMATION",142);}
  function board(){const x=g.world.board.x-126,y=g.world.board.y-72;ctx.fillStyle="#111a1d";ctx.fillRect(x,y,252,102);ctx.fillStyle="#53666b";ctx.fillRect(x,y,252,5);const a=g.board?[[g.train,g.dest,g.platforms[g.target]],["RE 5","Koblenz","4"],["S 19","Au (Sieg)","2"]]:[["ICE 612","Berlin","7"],["RE 5","Koblenz","4"],["S 19","Au (Sieg)","2"]];ctx.font="bold 12px ui-monospace,monospace";a.forEach((r,i)=>{ctx.fillStyle=i?"#b8c9cb":"#f3dd72";ctx.fillText(r[0],x+12,y+27+i*23);ctx.fillText(r[1],x+82,y+27+i*23);ctx.font=`900 ${i?14:17}px ui-monospace,monospace`;ctx.fillText(r[2],x+222,y+27+i*23);ctx.font="bold 12px ui-monospace,monospace";});}
  function bus(){if(g.kind!=="bus")return;const pulse=.55+Math.sin(performance.now()/180)*.2;ctx.save();ctx.fillStyle=`rgba(23,213,205,${pulse*.3})`;ctx.fillRect(35,112,212,154);ctx.strokeStyle=`rgba(220,255,252,${pulse})`;ctx.lineWidth=3;ctx.strokeRect(39,116,204,146);ctx.fillStyle="#087f86";ctx.fillRect(43,121,196,37);ctx.fillStyle="#ffffff";ctx.font="900 17px ui-monospace,monospace";ctx.fillText("SEV · ERSATZBUS",55,146);ctx.fillStyle="#ef9b3e";ctx.fillRect(50,169,182,68);ctx.fillStyle="#fff0b0";ctx.fillRect(50,169,182,10);ctx.fillStyle="#203945";ctx.fillRect(61,185,41,25);ctx.fillRect(109,185,41,25);ctx.fillRect(158,185,34,25);ctx.fillStyle="#e9f4f1";ctx.fillRect(198,181,25,49);ctx.fillStyle="#087f86";ctx.fillRect(202,187,17,20);ctx.fillStyle="#172129";ctx.fillRect(67,230,25,13);ctx.fillRect(191,230,25,13);ctx.fillStyle="#ffffff";ctx.font="900 20px ui-monospace,monospace";ctx.fillText("SEV",111,231);ctx.fillStyle="#073641";ctx.fillRect(49,248,184,27);ctx.fillStyle="#dffffd";ctx.font="900 12px ui-monospace,monospace";ctx.fillText("E · EINSTEIGEN / 上车",63,266);ctx.restore();}
  function drawTunnel(){tiles("#71848a","#788d91",22);ctx.fillStyle="#37515b";ctx.fillRect(22,48,916,30);ctx.fillStyle="#d8c14f";ctx.fillRect(25,H-48,910,8);const off=g.world.blackout>0;stairs(g.world.hallReturn.x,g.world.hallReturn.y,"↑ HALLE","#24536a");g.world.tunnelStairs.forEach((q,i)=>stairs(q.x,q.y,off?"↑  — —":`↑ GLEIS ${g.platforms[i]}`,"#24536a"));if(off)sign(470,91,"ANZEIGE AUS",150,"#171d20");else if(g.world.wrongSign){const i=(g.target+1)%3;sign(470,91,`ALTE INFO: GLEIS ${g.platforms[i]}`,190,"#a8333e");}else sign(470,91,"ZU DEN GLEISEN →",165);if(g.world.closure){const o=g.world.closure;ctx.fillStyle="#ea8730";ctx.fillRect(o.x,o.y,o.w,o.h);for(let x=o.x;x<o.x+o.w;x+=24){ctx.fillStyle="#fff0a8";ctx.fillRect(x,o.y+7,13,7);}}}
  function platformNumber(){const off=g.world.blackout>0,x=61,y=66;ctx.fillStyle=off?"#171d20":"#164d7a";ctx.fillRect(x,y,142,62);ctx.strokeStyle=off?"#3b4448":"#f4f7fa";ctx.lineWidth=3;ctx.strokeRect(x,y,142,62);ctx.fillStyle=off?"#737b7e":"#ffffff";ctx.font="900 13px ui-monospace,monospace";ctx.fillText(off?"ANZEIGE AUS":"GLEIS · PLATFORM",x+10,y+18);ctx.font="900 34px ui-monospace,monospace";ctx.fillText(off?"—":String(g.platforms[g.current??0]),x+10,y+52);}
  function drawPlatform(){tiles("#a8b5b4","#b5c0bd",26);ctx.fillStyle="#293943";ctx.fillRect(22,48,916,132);ctx.fillStyle="#d8dee0";ctx.fillRect(26,56,908,104);ctx.fillStyle="#cf2d3c";ctx.fillRect(26,132,908,18);for(let x=238;x<920;x+=52){ctx.fillStyle="#34434b";ctx.fillRect(x,58,34,26);}ctx.fillStyle="#f2d04c";ctx.fillRect(22,188,916,12);g.world.doors.forEach((d,i)=>door(d,i));stairs(g.world.platformStair.x,g.world.platformStair.y,"↓ UNTERFÜHRUNG","#24536a");platformNumber();}
  function door(d,i){ctx.fillStyle="#65747a";ctx.fillRect(d.x-39,87,78,72);ctx.fillStyle="#2b414c";ctx.fillRect(d.x-30,94,60,53);ctx.fillStyle="#9bc0c8";ctx.fillRect(d.x-23,99,18,24);ctx.fillRect(d.x+5,99,18,24);ctx.fillStyle="#ffffff";ctx.font="900 11px ui-monospace";ctx.fillText(d.label,d.x-14,166);}
  function drawWalls(){map().walls.forEach(o=>{if(o.invisible||o===g.world.closure||map().bags.includes(o))return;ctx.fillStyle="#193743";ctx.fillRect(o.x,o.y,o.w,o.h);ctx.fillStyle="#2e5963";ctx.fillRect(o.x,o.y,o.w,Math.min(5,o.h));});}
  function drawBags(){map().bags.forEach(o=>{ctx.fillStyle="#7c5234";ctx.fillRect(o.x,o.y,o.w,o.h);ctx.fillStyle="#c38a50";ctx.fillRect(o.x+5,o.y+5,o.w-10,4);ctx.fillStyle="#24333a";ctx.fillRect(o.x+o.w/2-7,o.y-5,14,6);});}
  function person(x,y,color,phase,inspector=false){const b=Math.sin(phase)>0?1:0;ctx.fillStyle="rgba(7,20,28,.22)";ctx.fillRect(Math.round(x-9),Math.round(y+11),18,5);ctx.fillStyle=inspector?"#253846":color;ctx.fillRect(Math.round(x-7),Math.round(y-4+b),14,17);ctx.fillStyle="#e8c5a1";ctx.fillRect(Math.round(x-5),Math.round(y-12+b),10,9);if(inspector){ctx.fillStyle="#172832";ctx.fillRect(Math.round(x-6),Math.round(y-14+b),12,4);}ctx.fillStyle="#14242b";ctx.fillRect(Math.round(x-7),Math.round(y+12),5,7);ctx.fillRect(Math.round(x+2),Math.round(y+12),5,7);}
  function drawPeople(){map().npcs.forEach(n=>person(n.x,n.y,n.color,n.phase,n.inspector));const t=map().troublemaker;if(t){person(t.x,t.y,"#70513d",t.phase);ctx.fillStyle="#c52e3c";ctx.fillRect(Math.round(t.x-7),Math.round(t.y-14),14,4);ctx.fillStyle=t.charging?"#ff3449":"#f1d24d";ctx.font="bold 15px sans-serif";ctx.fillText(t.charging?"!!":"!",t.x-6,t.y-20);}}
  function player(){const b=Math.sin(p.walk)>0?1:0;ctx.save();if(p.stun>0)ctx.globalAlpha=.58+Math.sin(performance.now()/70)*.2;ctx.fillStyle="rgba(2,12,18,.3)";ctx.fillRect(p.x-11,p.y+12,22,6);if(keys.dash&&p.stamina>1&&p.stun<=0){ctx.fillStyle="rgba(255,212,74,.45)";ctx.fillRect(p.x-p.dir*22,p.y-2,13,4);}ctx.fillStyle="#e8b795";ctx.fillRect(p.x-6,p.y-13+b,12,10);ctx.fillStyle="#192d3a";ctx.fillRect(p.x-7,p.y-15+b,14,5);ctx.fillStyle="#326f9b";ctx.fillRect(p.x-8,p.y-3+b,16,16);ctx.fillStyle="#ffd44a";ctx.fillRect(p.x-p.dir*10,p.y-1+b,7,12);ctx.fillStyle="#15242b";ctx.fillRect(p.x-8,p.y+12,6,8);ctx.fillRect(p.x+2,p.y+12,6,8);if(p.stun>0){ctx.fillStyle="#f8dc4b";ctx.font="bold 16px sans-serif";ctx.fillText("✦",p.x-18,p.y-22);ctx.fillText("✦",p.x+10,p.y-28);}ctx.restore();}
  function hud(){ctx.fillStyle="rgba(5,18,27,.9)";ctx.fillRect(24,57,230,48);ctx.fillStyle="#77a1ac";ctx.font="bold 9px ui-monospace,monospace";ctx.fillText(FLOORS[g.floor].toUpperCase(),36,73);ctx.fillStyle="#f3dc72";ctx.font="bold 11px ui-monospace,monospace";ctx.fillText(objective(),36,93);if(g.interaction&&g.mode==="running"){ctx.font="bold 13px ui-monospace,monospace";const w=Math.max(180,ctx.measureText(g.interaction).width+32);ctx.fillStyle="rgba(7,25,34,.94)";ctx.fillRect(W/2-w/2,H-68,w,38);ctx.strokeStyle="#55d8d1";ctx.lineWidth=2;ctx.strokeRect(W/2-w/2,H-68,w,38);ctx.fillStyle="#dffffd";ctx.textAlign="center";ctx.fillText(g.interaction,W/2,H-44);ctx.textAlign="left";}if(p.stun>0){ctx.fillStyle="rgba(169,31,46,.92)";ctx.fillRect(W/2-105,116,210,38);ctx.fillStyle="white";ctx.font="bold 13px ui-monospace";ctx.textAlign="center";ctx.fillText(`眩晕 STUNNED · ${p.stun.toFixed(1)}s`,W/2,141);ctx.textAlign="left";}if(g.world.slow>0||g.world.slippery>0||g.world.blackout>0){ctx.fillStyle="rgba(135,24,39,.9)";ctx.fillRect(W-260,57,232,27);ctx.fillStyle="white";ctx.font="bold 10px ui-monospace";ctx.fillText(g.world.blackout>0?"SIGNALSTÖRUNG · 显示中断":g.world.slippery>0?"RUTSCHGEFAHR · 地面湿滑":"SICHERHEIT · 限速通行",W-250,75);}}
  function draw(){if(!g.world)return;if(g.floor==="hall")drawHall();else if(g.floor==="tunnel")drawTunnel();else drawPlatform();drawWalls();drawBags();drawPeople();if(g.floor==="hall")bus();player();hud();}

  function audioEngine(){let ac,master,music,fx,timer=0,step=0,muted=false,isPaused=false;const mel=[0,4,7,11,7,4,2,7,9,7,4,2,0,2,4,7],roots=[48,45,41,43];function ensure(){if(ac)return;const Audio=window.AudioContext||window.webkitAudioContext;ac=new Audio();master=ac.createGain();music=ac.createGain();fx=ac.createGain();master.gain.value=+ui.volumeSlider.value/100;music.gain.value=.18;fx.gain.value=.3;music.connect(master);fx.connect(master);master.connect(ac.destination);}function tone(midi,when,dur,type="square",vol=.035,out=music){if(!ac||muted||isPaused)return;const o=ac.createOscillator(),v=ac.createGain();o.type=type;o.frequency.value=440*2**((midi-69)/12);v.gain.setValueAtTime(.0001,when);v.gain.exponentialRampToValueAtTime(vol,when+.012);v.gain.exponentialRampToValueAtTime(.0001,when+dur);o.connect(v);v.connect(out);o.start(when);o.stop(when+dur+.02);}function loop(){if(!ac||muted||isPaused||ac.state!=="running")return;const now=ac.currentTime+.025,r=roots[Math.floor(step/8)%4];if(step%4===0)tone(r,now,.34,"triangle",.055);if(step%2===0)tone(r+12,now,.09,"square",.018);tone(60+mel[step%16]+(step%32>=16?2:0),now,step%4===3?.28:.14,"square",g.remaining<14?.042:.027);step++;}function effect(notes,d=.12,type="square"){ensure();ac.resume();const now=ac.currentTime;notes.forEach((n,i)=>tone(n,now+i*.07,d,type,.12,fx));}return {start(){ensure();ac.resume();isPaused=false;if(!timer)timer=setInterval(loop,155);},volume(v){ensure();master.gain.value=muted?0:+v/100;},toggle(){ensure();muted=!muted;master.gain.value=muted?0:+ui.volumeSlider.value/100;ui.soundToggle.classList.toggle("muted",muted);ui.soundToggle.textContent=muted?"♩":"♫";},paused(v){isPaused=v;},pickup(){effect([72,76,79]);},bump(){effect([43,39],.08,"sawtooth");},transition(){effect([55,62],.12,"triangle");},stun(){effect([50,45,40,48],.13,"sawtooth");},event(d){effect(d?[60,55,48]:[67,71,74],.16,d?"sawtooth":"triangle");},success(){effect([60,64,67,72,76],.22);},fail(){effect([55,52,48,43],.24,"sawtooth");}};}
  const audio=audioEngine();
  function frame(now){const dt=Math.min(.04,(now-g.last)/1000||0);g.last=now;update(dt);draw();requestAnimationFrame(frame);}
  function key(e,down){const k=e.key.toLowerCase(),m={w:"up",arrowup:"up",s:"down",arrowdown:"down",a:"left",arrowleft:"left",d:"right",arrowright:"right",shift:"dash"};if(m[k]){keys[m[k]]=down;e.preventDefault();}if(down&&!e.repeat&&(k==="e"||k===" ")&&!ui.screenOverlay.classList.contains("show")){e.preventDefault();interact();}if(down&&!e.repeat&&k==="p")pause();if(down&&!e.repeat&&(k==="enter"||k===" ")&&ui.screenOverlay.classList.contains("show")){e.preventDefault();ui.overlayButton.click();}}
  document.addEventListener("keydown",e=>key(e,true));document.addEventListener("keyup",e=>key(e,false));window.addEventListener("blur",()=>{Object.keys(keys).forEach(k=>keys[k]=false);if(g.mode==="running")pause();});
  document.querySelectorAll("[data-key]").forEach(b=>{const k=b.dataset.key;if(k==="interact"){b.onpointerdown=e=>{e.preventDefault();audio.start();interact();};return;}const on=e=>{e.preventDefault();keys[k]=true;audio.start();},off=e=>{e.preventDefault();keys[k]=false;};b.onpointerdown=on;b.onpointerup=off;b.onpointercancel=off;b.onpointerleave=off;});
  ui.startButton.onclick=()=>{audio.start();if(["menu","over","win"].includes(g.mode))start();else if(["running","paused"].includes(g.mode))pause();};ui.overlayButton.onclick=start;ui.soundToggle.onclick=()=>audio.toggle();ui.volumeSlider.oninput=()=>audio.volume(ui.volumeSlider.value);document.addEventListener("visibilitychange",()=>{if(document.hidden&&g.mode==="running")pause();});
  records();g.world=world();mission();requestAnimationFrame(frame);
})();
