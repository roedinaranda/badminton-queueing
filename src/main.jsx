import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import { QRCodeSVG } from "qrcode.react";
import { Trophy, Users, History, ListOrdered, Play, CheckCircle2, XCircle, RefreshCw, Settings, QrCode, Plus, Minus } from "lucide-react";
import "./styles.css";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const DEMO_PLAYERS = [
  {id:"p1",name:"Roedin",skill_level:"Intermediate",matches_played:18,wins:11,losses:7},
  {id:"p2",name:"Germaine",skill_level:"Intermediate",matches_played:15,wins:9,losses:6},
  {id:"p3",name:"Mark",skill_level:"Advanced",matches_played:24,wins:17,losses:7},
  {id:"p4",name:"John",skill_level:"Advanced",matches_played:21,wins:13,losses:8},
  {id:"p5",name:"Carlo",skill_level:"Intermediate",matches_played:10,wins:5,losses:5},
  {id:"p6",name:"Ben",skill_level:"Beginner",matches_played:14,wins:7,losses:7},
  {id:"p7",name:"Mike",skill_level:"Beginner",matches_played:8,wins:4,losses:4}
];
const DEMO_QUEUE = DEMO_PLAYERS.slice(0,5).map((p,i)=>({id:"q"+i,player_id:p.id,joined_at:Date.now()-(12-i*2)*60000,status:"waiting"}));

function App(){
  const [tab,setTab]=useState("live");
  const [players,setPlayers]=useState(DEMO_PLAYERS),[queue,setQueue]=useState(DEMO_QUEUE),[matches,setMatches]=useState([]);
  const [session,setSession]=useState({id:"demo",available_courts:2,status:"open"});
  const [admin,setAdmin]=useState(false),[showJoin,setShowJoin]=useState(false),[notice,setNotice]=useState(""),[loading,setLoading]=useState(false);
  const playerMap=useMemo(()=>Object.fromEntries(players.map(p=>[p.id,p])),[players]);
  const waiting=queue.filter(q=>q.status==="waiting").sort((a,b)=>a.joined_at-b.joined_at);
  const live=matches.filter(m=>m.status==="live");
  const history=matches.filter(m=>m.status==="finished");

  async function loadData(){
    if(!supabase)return;
    setLoading(true);
    const [p,q,m,s]=await Promise.all([
      supabase.from("players").select("*").order("name"),
      supabase.from("queue").select("*").eq("status","waiting").order("joined_at"),
      supabase.from("matches").select("*, match_players(*, players(*))").order("started_at",{ascending:false}).limit(100),
      supabase.from("queue_sessions").select("*").eq("status","open").order("created_at",{ascending:false}).limit(1).maybeSingle()
    ]);
    if(!p.error)setPlayers(p.data||[]); if(!q.error)setQueue(q.data||[]); if(!m.error)setMatches(m.data||[]); if(!s.error&&s.data)setSession(s.data);
    setLoading(false);
  }
  useEffect(()=>{loadData();if(!supabase)return;const c=supabase.channel("badminton-live").on("postgres_changes",{event:"*",schema:"public",table:"queue"},loadData).on("postgres_changes",{event:"*",schema:"public",table:"matches"},loadData).on("postgres_changes",{event:"*",schema:"public",table:"players"},loadData).on("postgres_changes",{event:"*",schema:"public",table:"queue_sessions"},loadData).subscribe();return()=>supabase.removeChannel(c)},[]);
  useEffect(()=>{if(new URLSearchParams(window.location.search).get("join")==="1")setShowJoin(true)},[]);
  const notify=m=>{setNotice(m);setTimeout(()=>setNotice(""),3500)};

  async function joinQueue(name,skill){
    if(!name.trim()||!skill)return notify("Enter your name and skill level.");
    if(session.status!=="open")return notify("The queue is currently closed.");
    if(!supabase){const existing=players.find(p=>p.name.toLowerCase()===name.trim().toLowerCase());const p=existing||{id:"local-"+Date.now(),name:name.trim(),skill_level:skill,matches_played:0,wins:0,losses:0};if(!existing)setPlayers(x=>[...x,p]);if(queue.some(q=>q.player_id===p.id))return notify("You're already in the queue.");setQueue(x=>[...x,{id:"q-"+Date.now(),player_id:p.id,joined_at:Date.now(),status:"waiting"}]);notify(`${p.name} joined the queue`);return}
    let {data:p}=await supabase.from("players").select("*").ilike("name",name.trim()).maybeSingle();
    if(!p){const r=await supabase.from("players").insert({name:name.trim(),skill_level:skill}).select().single();if(r.error)return notify(r.error.message);p=r.data}else await supabase.from("players").update({skill_level:skill}).eq("id",p.id);
    if(queue.some(q=>q.player_id===p.id))return notify("You're already in the queue.");
    const r=await supabase.from("queue").insert({player_id:p.id,status:"waiting",session_id:session.id});if(r.error)notify(r.error.message);else{notify("Joined the queue!");loadData()}
  }
  async function leaveQueue(id){if(!supabase){setQueue(q=>q.filter(x=>x.player_id!==id));return}await supabase.from("queue").update({status:"left"}).eq("player_id",id).eq("status","waiting");loadData()}
  const skillValue=l=>({Beginner:1,Intermediate:2,Advanced:3}[l]||2);
  const rankedQueue=()=>[...waiting].sort((a,b)=>a.joined_at-b.joined_at);
  function teams(four){const s=[...four].sort((a,b)=>skillValue(playerMap[b.player_id]?.skill_level)-skillValue(playerMap[a.player_id]?.skill_level));return [[s[0].player_id,s[3].player_id],[s[1].player_id,s[2].player_id]]}

  async function setCourts(count){
    count=Math.max(1,Math.min(12,Number(count)||1));
    if(!supabase){setSession(s=>({...s,available_courts:count}));notify(`${count} court${count>1?"s":""} available`);return}
    if(!session.id||session.id==="demo")return notify("Start a queue session first.");
    const r=await supabase.from("queue_sessions").update({available_courts:count}).eq("id",session.id);if(r.error)notify(r.error.message);else loadData();
  }
  async function startSession(){
    if(!supabase){setSession({id:"demo",available_courts:session.available_courts,status:"open"});notify("Queue session opened");return}
    await supabase.from("queue_sessions").update({status:"closed"}).eq("status","open");
    const r=await supabase.from("queue_sessions").insert({available_courts:session.available_courts||2,status:"open"}).select().single();if(r.error)notify(r.error.message);else{setSession(r.data);notify("New queue session opened");loadData()}
  }
  async function closeSession(){if(!supabase){setSession(s=>({...s,status:"closed"}));notify("Queue session closed");return}await supabase.from("queue_sessions").update({status:"closed"}).eq("id",session.id);notify("Queue session closed");loadData()}

  async function startNextMatch(court){
    const activeCourts=new Set(live.map(m=>m.court)); if(activeCourts.has(court))return notify(`Court ${court} is already in use.`);
    const q=rankedQueue();if(q.length<4)return notify("Need at least 4 players in the queue.");const four=q.slice(0,4),t=teams(four);
    if(!supabase){const m={id:"m-"+Date.now(),court,status:"live",started_at:Date.now(),team1:t[0],team2:t[1],score1:0,score2:0};setMatches(x=>[m,...x]);setQueue(x=>x.filter(a=>!four.some(b=>a.id===b.id)));notify(`Court ${court} started`);return}
    const mr=await supabase.from("matches").insert({court,status:"live",session_id:session.id}).select().single();if(mr.error)return notify(mr.error.message);
    await supabase.from("match_players").insert([...t[0].map(player_id=>({match_id:mr.data.id,player_id,team:1})),...t[1].map(player_id=>({match_id:mr.data.id,player_id,team:2}))]);
    await supabase.from("queue").update({status:"playing",match_id:mr.data.id}).in("id",four.map(x=>x.id));loadData();
  }
  async function fillCourts(){for(let c=1;c<=session.available_courts;c++){if(!live.some(m=>m.court===c)&&waiting.length>=4)await startNextMatch(c)}loadData()}
  async function finishMatch(m,s1,s2){if(s1===""||s2===""||Number(s1)<0||Number(s2)<0)return notify("Enter both scores first.");s1=Number(s1);s2=Number(s2);if(s1===s2)return notify("A badminton match cannot finish tied.");const winner=s1>s2?1:2;const ids=m.match_players?m.match_players.map(x=>x.player_id):[...(m.team1||[]),...(m.team2||[])];
    if(!supabase){setMatches(ms=>ms.map(x=>x.id===m.id?{...x,status:"finished",winner,score1:s1,score2:s2,completed_at:Date.now()}:x));setQueue(q=>[...q,...ids.map((player_id,i)=>({id:"q-"+Date.now()+i,player_id,joined_at:Date.now()+i,status:"waiting"}))]);notify("Result saved — all four players returned to the queue.");return}
    await supabase.from("matches").update({status:"finished",winner,score_team1:s1,score_team2:s2,completed_at:new Date().toISOString()}).eq("id",m.id);await supabase.from("queue").update({status:"completed"}).eq("match_id",m.id);const rq=await supabase.from("queue").insert(ids.map(player_id=>({player_id,status:"waiting",session_id:session.id})));if(rq.error)notify("Match saved, but re-queue failed: "+rq.error.message);else notify("Result saved — all four players returned to the queue.");loadData();
  }

  const joinUrl=window.location.origin+window.location.pathname+"?join=1";
  return <div className="app"><header className="topbar"><div><div className="brand">SUNDAY'S BETS</div><div className="subtitle">BADMINTON QUEUE</div></div><button className="icon-btn" onClick={()=>setAdmin(true)}><Settings size={19}/></button></header>
    {notice&&<div className="toast">{notice}</div>}
    {admin&&<AdminPanel session={session} live={live} waiting={waiting} setCourts={setCourts} startSession={startSession} closeSession={closeSession} fillCourts={fillCourts} onStart={startNextMatch} onLeave={leaveQueue} onRefresh={loadData} loading={loading} onExit={()=>setAdmin(false)}/>} 
    <main><section className="hero"><div><div className="eyebrow">BADMINTON CLUB</div><h1>Play. Queue.<br/><span>Repeat.</span></h1><p>{waiting.length} waiting • {session.available_courts} court{session.available_courts!==1?"s":""} • {session.status==='open'?"OPEN":"CLOSED"}</p></div><button className="join-big" onClick={()=>setShowJoin(true)}><QrCode size={20}/> JOIN QUEUE</button></section>
    <nav className="tabs">{[["live","LIVE",Play],["queue","QUEUE",ListOrdered],["history","HISTORY",History],["ranking","RANKING",Trophy]].map(([k,l,I])=><button key={k} className={tab===k?"active":""} onClick={()=>setTab(k)}><I size={17}/><span>{l}</span>{k==='queue'&&waiting.length>0&&<b>{waiting.length}</b>}</button>)}</nav>
    {tab==='live'&&<LiveTab live={live} playerMap={playerMap} onFinish={finishMatch}/>} {tab==='queue'&&<QueueTab waiting={rankedQueue()} playerMap={playerMap} onLeave={leaveQueue}/>} {tab==='history'&&<HistoryTab history={history}/>} {tab==='ranking'&&<RankingTab players={players}/>}</main>
    {showJoin&&<JoinModal url={joinUrl} onClose={()=>setShowJoin(false)} onJoin={joinQueue}/>}<footer>Scan the QR code to join • Live updates enabled</footer></div>
}

function LiveTab({live,playerMap,onFinish}){const [scores,setScores]=useState({});if(!live.length)return <Empty icon={Play} title="No live matches" text="The admin will start matches when enough players are queued."/>;const set=(id,k,v)=>setScores(s=>({...s,[id]:{...(s[id]||{}),[k]:v}}));return <section className="cards">{live.sort((a,b)=>a.court-b.court).map(m=>{const names=m.match_players?m.match_players.map(x=>x.players?.name):[...(m.team1||[]),...(m.team2||[])].map(id=>playerMap[id]?.name);const s=scores[m.id]||{};return <article className="match-card" key={m.id}><div className="match-head"><span className="court">COURT {m.court}</span><span className="live-pill">● LIVE</span></div><div className="teams"><div><strong>{names?.[0]} + {names?.[1]}</strong><span>TEAM A</span></div><div className="vs">VS</div><div><strong>{names?.[2]} + {names?.[3]}</strong><span>TEAM B</span></div></div><div className="score-inputs"><input type="number" min="0" value={s.a??""} onChange={e=>set(m.id,"a",e.target.value)} placeholder="0"/><span>—</span><input type="number" min="0" value={s.b??""} onChange={e=>set(m.id,"b",e.target.value)} placeholder="0"/></div><button className="primary wide" onClick={()=>onFinish(m,s.a,s.b)}><CheckCircle2 size={16}/> SAVE SCORE & FINISH MATCH</button><p className="score-hint">Winner is calculated from the higher score. All four players automatically return to the queue.</p></article>})}</section>}
function QueueTab({waiting,playerMap,onLeave}){return <section><div className="section-title"><div><h2>Next in queue</h2><p>Players who finish a match return to the back of the queue.</p></div></div>{!waiting.length?<Empty icon={Users} title="Queue is empty" text="Scan the QR code to join."/>:<div className="queue-list">{waiting.map((q,i)=>{const p=playerMap[q.player_id]||{};return <div className="queue-row" key={q.id}><div className="position">{i+1}</div><div className="avatar">{p.name?.[0]||"?"}</div><div className="player"><strong>{p.name}</strong><span>{p.skill_level||"Intermediate"} • waiting {Math.max(1,Math.round((Date.now()-q.joined_at)/60000))}m</span></div>{i===0&&<span className="next-pill">NEXT</span>}<button className="small-x" onClick={()=>onLeave(q.player_id)}><XCircle size={18}/></button></div>})}</div>}</section>}
function HistoryTab({history}){return <section><div className="section-title"><div><h2>Match history</h2><p>Completed matches and scores.</p></div></div>{!history.length?<Empty icon={History} title="No matches yet" text="Completed matches will appear here."/>:<div className="history-list">{history.map(m=><div className="history-row" key={m.id}><div className="history-icon"><CheckCircle2 size={19}/></div><div className="player"><strong>Court {m.court} • {m.score_team1??m.score1??0} - {m.score_team2??m.score2??0}</strong><span>{m.completed_at?new Date(m.completed_at).toLocaleString():"Recently"}</span></div><strong className="result">Team {m.winner===1?"A":"B"} won</strong></div>)}</div>}</section>}
function RankingTab({players}){const ranked=[...players].sort((a,b)=>(b.wins||0)-(a.wins||0)||(a.losses||0)-(b.losses||0));return <section><div className="section-title"><div><h2>Rankings</h2><p>Ranked by wins, then losses. Skill level is self-selected.</p></div></div><div className="ranking-list">{ranked.map((p,i)=><div className="rank-row" key={p.id}><div className={"rank "+(i<3?"top":"")}>{i+1}</div><div className="avatar">{p.name?.[0]}</div><div className="player"><strong>{p.name}</strong><span>{p.matches_played||0} matches • {p.wins||0}W / {p.losses||0}L</span></div><div className="rating"><strong>{p.skill_level||"Intermediate"}</strong><span>LEVEL</span></div></div>)}</div></section>}
function AdminPanel({session,live,waiting,setCourts,startSession,closeSession,fillCourts,onStart,onLeave,onRefresh,loading,onExit}){const [count,setCount]=useState(session.available_courts||2);return <div className="admin-overlay"><div className="admin-card"><div className="admin-head"><div><div className="eyebrow">CONTROL PANEL</div><h2>Queue Session</h2></div><button onClick={onExit} className="icon-btn"><XCircle/></button></div><div className="admin-stat"><span>Status</span><strong>{session.status==='open'?"OPEN":"CLOSED"}</strong></div><div className="court-control"><span>Available courts</span><div><button onClick={()=>setCount(Math.max(1,count-1))}><Minus/></button><strong>{count}</strong><button onClick={()=>setCount(Math.min(12,count+1))}><Plus/></button></div></div><button className="primary wide" onClick={()=>setCourts(count)}>SAVE COURT COUNT</button><div className="admin-grid"><button className="secondary" onClick={startSession}>NEW SESSION</button><button className="secondary" onClick={closeSession}>CLOSE SESSION</button></div><button className="primary wide" onClick={fillCourts}><Play size={16}/> FILL AVAILABLE COURTS</button><div className="court-status"><h3>Courts</h3>{Array.from({length:session.available_courts},(_,i)=>i+1).map(c=><div className="court-row" key={c}><span>Court {c}</span><strong>{live.some(m=>m.court===c)?"LIVE":"AVAILABLE"}</strong>{!live.some(m=>m.court===c)&&<button onClick={()=>onStart(c)} disabled={waiting.length<4}>START</button>}</div>)}</div><div className="admin-list"><h3>Queue: {waiting.length}</h3>{waiting.slice(0,12).map((q,i)=><div key={q.id} className="admin-row"><span>#{i+1}</span><strong>{q.player_id}</strong><button onClick={()=>onLeave(q.player_id)}><XCircle size={16}/></button></div>)}</div><button className="secondary wide" onClick={onRefresh}><RefreshCw size={16}/> {loading?"Refreshing…":"REFRESH"}</button><p className="hint">Admin mutations should be protected with Supabase Auth before public production use.</p></div></div>}
function JoinModal({url,onClose,onJoin}){const [name,setName]=useState(""),[skill,setSkill]=useState("Intermediate");return <div className="modal-backdrop"><div className="modal"><div className="qr-title"><QrCode size={20}/><span>SCAN TO JOIN</span></div><div className="qr-wrap"><QRCodeSVG value={url} size={190} includeMargin/></div><p className="qr-url">Scan this code with your phone to open the queue.</p><div className="divider"><span>OR JOIN ON THIS DEVICE</span></div><input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="Your name / nickname"/><div className="skill-picker">{["Beginner","Intermediate","Advanced"].map(x=><button key={x} className={skill===x?"selected":""} onClick={()=>setSkill(x)}><strong>{x}</strong><span>{x==="Beginner"?"Learning the basics":x==="Intermediate"?"Comfortable in rallies":"Competitive / experienced"}</span></button>)}</div><button className="primary wide" onClick={()=>onJoin(name,skill)}>JOIN QUEUE</button><button className="text-btn" onClick={onClose}>Close</button></div></div>}
function Empty({icon:Icon,title,text}){return <div className="empty"><Icon size={30}/><h3>{title}</h3><p>{text}</p></div>}
createRoot(document.getElementById("root")).render(<App/>);
