/* Lesson Studio Firebase client. The Firebase web config is public client config;
   Firestore rules, not this config, enforce data access. */
function readStoredPreference(key, allowedValues, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return allowedValues.includes(value) ? value : fallback;
  } catch (_) {
    return fallback;
  }
}
function savePreference(key, value) {
  try { window.localStorage.setItem(key, String(value)); } catch (_) {}
}
let lessons=[],deck=[],slide=0,playbackState='stopped',playTimer=null,playTimerPending=false,playTimerDeadline=0,playTimerRemaining=0,playTimerKind=null,playbackToken=0,activeUtterance=null,currentId=null,saveTimer=null,currentUser=null,db=null,auth=null,functionsClient=null,sceneAnimationFrame=null,sceneAnimationToken=0,sceneAnimationStartedAt=0,sceneAnimationElapsed=0,sceneAnimationPaused=false;
let transitionPauseMs=Number(readStoredPreference('vriddhi-playback-pause',['0','2000','4000','6000'],'2000'));
let currentTemplate=readStoredPreference('vriddhi-template',['campus','notebook','midnight'],'campus');
let voicePreference=readStoredPreference('vriddhi-voice',['auto','female','male'],'auto');
let transitionStyle=readStoredPreference('vriddhi-transition',['rise','fade','slide','none'],'rise');
const API='/api/lessons';
const templatePalettes={
 campus:[{bg:'#145e61',fg:'#f6fcf8'},{bg:'#295a7c',fg:'#f7fbff'},{bg:'#6c4f73',fg:'#fffaff'},{bg:'#506944',fg:'#fbfff7'},{bg:'#965c38',fg:'#fffaf5'},{bg:'#405569',fg:'#f8fbff'}],
 notebook:[{bg:'#f5f1e6',fg:'#294037'},{bg:'#e7efe6',fg:'#2d4036'},{bg:'#f5eae1',fg:'#493a34'},{bg:'#e9eef4',fg:'#2b3e4c'},{bg:'#f2ebd8',fg:'#453b27'},{bg:'#e8eee8',fg:'#354537'}],
 midnight:[{bg:'#173046',fg:'#f2f7fa'},{bg:'#1e3d54',fg:'#eef7fc'},{bg:'#342b4c',fg:'#faf4ff'},{bg:'#27473e',fg:'#f1fbf1'},{bg:'#59402f',fg:'#fff6ed'},{bg:'#263747',fg:'#f2f7fa'}]
};
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function toast(s){const x=document.getElementById('toast');x.textContent=s;x.classList.add('show');clearTimeout(window.toastT);window.toastT=setTimeout(()=>x.classList.remove('show'),2600)}function showToast(s){toast(s)}
function illustration(i){const paths=[`<rect x="27" y="22" width="132" height="78" rx="7" fill="#f9fcf8" stroke="#8db6a4"/><path d="M40 39h62M40 49h91M40 59h47" stroke="#8db6a4" stroke-width="3" stroke-linecap="round"/><circle cx="123" cy="72" r="16" fill="#d9eee2" stroke="#598b76" stroke-width="2"/><path d="M117 72h12m-6-6v12" stroke="#598b76" stroke-width="2"/><path d="M159 45h34M159 57h24M159 69h29" stroke="#6a9a86" stroke-width="2" stroke-linecap="round"/>`,`<path d="M36 88h154M47 88V51h38v37M107 88V33h45v55" stroke="#718cac" stroke-width="2.5"/><path d="M55 64h21M116 46h27M116 57h27" stroke="#9bb5d0" stroke-width="2"/><circle cx="171" cy="35" r="12" fill="#fff6cf" stroke="#d0ad54" stroke-width="2"/>`,`<path d="M40 86c16-19 31-12 43-34 11-20 24-11 34 6 9 15 21 20 34 5 15-17 26-17 42-3" stroke="#ae8961" stroke-width="3" stroke-linecap="round"/><circle cx="81" cy="59" r="14" fill="#faf5eb" stroke="#ae8961" stroke-width="2"/><path d="m76 59 4 4 7-8" stroke="#6d9274" stroke-width="2"/>`,`<rect x="36" y="30" width="54" height="54" rx="5" fill="#f7fbf2" stroke="#84a273"/><path d="M49 44h28M49 54h18M49 64h24" stroke="#84a273" stroke-width="2" stroke-linecap="round"/><path d="m111 75 19-36 19 36h-38Z" fill="#eff6eb" stroke="#84a273" stroke-width="2"/><path d="M130 49v15" stroke="#b48a53" stroke-width="2"/>`,`<circle cx="81" cy="61" r="27" fill="#fbf7fb" stroke="#a48aa6" stroke-width="2"/><path d="M81 41v20l15 9" stroke="#9a749d" stroke-width="2" stroke-linecap="round"/><path d="M124 43h47M124 57h38M124 71h43" stroke="#b4938c" stroke-width="2" stroke-linecap="round"/>`,`<path d="M42 84h145M53 84V49h34v35M106 84V37h40v47" stroke="#73918c" stroke-width="2.5"/><path d="M115 47h22M115 57h22M61 60h18" stroke="#9ab9ad" stroke-width="2"/><path d="m157 48 9 9-9 9" stroke="#d2ac59" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`];return `<svg viewBox="0 0 220 120" fill="none">${paths[i%paths.length]}</svg>`}
function renderLessons(){
  document.getElementById('lessonCount').textContent=lessons.length;
  document.getElementById('statLessons').innerHTML=lessons.length+'<small>created</small>';
  const el=document.getElementById('modules');
  if(!lessons.length){
    el.innerHTML='<div class="empty"><div class="empty-art" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H20v16H7.5A2.5 2.5 0 0 0 5 21V5.5Z"/><path d="M5 17a2.5 2.5 0 0 1 2.5-2.5H20M9 7h7M9 10h6"/><path d="M12 13v5m-2.5-2.5h5"/></svg></div><div class="empty-copy"><span class="eyebrow">YOUR FIRST LESSON</span><strong>Your library is ready for a good idea.</strong><p>Start with a subject and paste the explanation you have already prepared. You can review every slide before using it.</p></div><button class="primary" type="button" onclick="openBuilder()">Build your first lesson <span aria-hidden="true">→</span></button></div>';
    return;
  }
  el.innerHTML=lessons.map((l,i)=>{
    const topic=l.topic||'Untitled topic';
    return `<article class="module" tabindex="0" role="button" aria-label="Open lesson: ${esc(topic)}" onclick="openLesson('${esc(l.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openLesson('${esc(l.id)}')}"><div class="thumb c${i%6+1}">${illustration(i)}<span class="type">ACADEMIC LESSON</span></div><div class="module-body"><h3>${esc(topic)}</h3><div class="meta"><span>${esc(l.program||'Program')} · ${esc(l.branch||l.subject||'Subject')}</span><span><i class="status-dot"></i>Saved</span></div><div class="module-footer"><span>${esc(l.module||'Module not set')}</span><span>${(l.slides||[]).length} slides · ${esc(l.date||'Saved')}</span></div></div></article>`;
  }).join('');
}
function userLessons(){if(!currentUser)throw new Error('Sign in first');return db.collection('users').doc(currentUser.uid).collection('lessons')}
async function refreshLessons(){try{const snap=await userLessons().orderBy('updatedAt','desc').get();lessons=snap.docs.map(doc=>{const d=doc.data(),created=d.createdAt?.toDate?.();return {...d,id:doc.id,date:created?created.toLocaleDateString('en-IN',{day:'numeric',month:'short'}):'Just now'}});renderLessons()}catch(e){console.error(e);toast('Could not load lessons. Check Firestore rules and sign-in.')}}
function resetForm(){
  document.getElementById('program').value='B.Com';
  for(const id of ['branch','subject','module','topic','notes'])document.getElementById(id).value='';
  document.getElementById('deckTitle').textContent='Lesson preview';
  document.getElementById('deckSub').textContent='Your seven-slide sequence appears here.';
  document.getElementById('slideIndex').textContent='No slides yet';
  document.getElementById('stage').classList.add('empty-stage');
  document.getElementById('stage').style.background='';
  document.getElementById('stage').style.color='';
  document.getElementById('stage').dataset.template=currentTemplate;
  document.getElementById('stageContent').innerHTML='<div class="slide-kicker">YOUR LESSON PREVIEW</div><h2>One clear idea at a time.</h2><p>Fill in your topic and prepared notes, then arrange them into a standard lesson sequence.</p><div class="number">01</div>';
  document.getElementById('slideStrip').innerHTML='<button class="slide-mini" type="button" disabled>Title</button><button class="slide-mini" type="button" disabled>Core idea</button><button class="slide-mini" type="button" disabled>Steps</button><button class="slide-mini" type="button" disabled>Formula</button><button class="slide-mini" type="button" disabled>Example</button><button class="slide-mini" type="button" disabled>Memory cue</button><button class="slide-mini" type="button" disabled>Recap</button>';
  document.getElementById('scriptList').classList.remove('open');
  document.getElementById('scriptList').innerHTML='<div class="empty-script">Arrange your notes first. Then edit the slide headings and narration text here.</div>';
  document.getElementById('scriptToggle').textContent='Edit script';
  document.getElementById('buildHint').textContent='Your prepared content stays yours.';
  const consent=document.getElementById('aiConsent');
  if(consent)consent.checked=false;
  const status=document.getElementById('animationStatus');
  if(status)status.textContent='First arrange and save your lesson notes. AI output should be reviewed before teaching.';
  updateAnimationControls();
}
function openBuilder(){stopPlay();stopSceneAnimation();currentId=null;deck=[];slide=0;resetForm();document.getElementById('builder').classList.add('open');document.body.style.overflow='hidden'}
function closeBuilder(){stopPlay();stopSceneAnimation();document.getElementById('builder').classList.remove('open');document.body.style.overflow='';if(currentId)queueSave()}
function openLesson(id){
  const lesson=lessons.find(x=>x.id===id);
  if(!lesson)return;
  stopPlay();
  stopSceneAnimation();
  currentId=id;
  deck=lesson.slides||[];
  slide=0;
  document.getElementById('program').value=lesson.program||'B.Com';
  document.getElementById('branch').value=lesson.branch||'';
  document.getElementById('subject').value=lesson.subject||'';
  document.getElementById('module').value=lesson.module||'';
  document.getElementById('topic').value=lesson.topic||'';
  document.getElementById('notes').value=lesson.source||'';
  document.getElementById('deckTitle').textContent=lesson.topic||'Lesson preview';
  document.getElementById('deckSub').textContent=[lesson.program,lesson.branch,lesson.subject,lesson.module].filter(Boolean).join(' · ');
  document.getElementById('buildHint').textContent='Saved in your Firebase account';
  document.getElementById('scriptList').classList.remove('open');
  document.getElementById('scriptToggle').textContent='Edit script';
  const consent=document.getElementById('aiConsent');
  if(consent)consent.checked=false;
  const status=document.getElementById('animationStatus');
  if(status)status.textContent=deck.some(s=>s.animation)?'Animated storyboard saved. Review every scene and formula before teaching.':'Add an animated explanation from your notes when you are ready.';
  document.getElementById('builder').classList.add('open');
  document.body.style.overflow='hidden';
  renderDeck();
}
function splitSource(text){const sections={concept:[],formula:[],example:[],trick:[],steps:[],other:[]};const labels={concept:/^(concept|explanation|overview|definition|meaning)\s*:?\s*/i,formula:/^(formula|equation|key terms?|important terms?)\s*:?\s*/i,example:/^(worked example|example|application|problem)\s*:?\s*/i,trick:/^(trick|shortcut|memory trick|mnemonic|tips?)\s*:?\s*/i,steps:/^(steps?|process|procedure|how it works)\s*:?\s*/i};let active='other';for(let line of text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)){for(const k in labels){if(labels[k].test(line)){active=k;line=line.replace(labels[k],'').trim();break}}if(line)sections[active].push(line)}return sections}
function getSentences(text){return (String(text||'').replace(/\s+/g,' ').match(/[^.!?]+[.!?]?/g)||[]).map(x=>x.trim()).filter(Boolean)}function summary(parts,n=3){return getSentences(parts.join(' ')).slice(0,n).join(' ').trim()}
function createSlides(data){const s=splitSource(data.source),concept=summary(s.concept.length?s.concept:s.other.length?s.other:s.steps,3)||data.source.slice(0,420),sentences=getSentences(data.source),steps=(s.steps.length?s.steps:sentences.slice(1,5)).slice(0,4),formula=summary(s.formula,5)||'No formula or key terms were supplied in the source notes.',example=summary(s.example,5)||'No worked example was supplied in the source notes.',trick=summary(s.trick,4)||'No shortcut or memory cue was supplied in the source notes.',recap=summary([...s.concept,...s.formula,...s.trick,...s.other],2)||concept,course=data.program+(data.branch?' · '+data.branch:'');return [{kind:'intro',kicker:course,title:data.topic,body:[data.subject,data.module].filter(Boolean).join('  ·  ')||'A focused concept lesson',steps:[]},{kind:'concept',kicker:'THE CORE IDEA',title:'Start with the main idea',body:concept,steps:[]},{kind:'steps',kicker:'BREAK IT DOWN',title:'How it works',body:'Follow the explanation one step at a time.',steps},{kind:'formula',kicker:'FORMULA & KEY TERMS',title:'Keep this close',body:formula,steps:[]},{kind:'example',kicker:'APPLY THE IDEA',title:'A worked example',body:example,steps:[]},{kind:'trick',kicker:'REMEMBER IT',title:'Shortcut or memory cue',body:trick,steps:[]},{kind:'recap',kicker:'QUICK RECAP',title:'What to remember',body:recap,steps:[]}]}
async function generateDeck(){
  const payload=lessonFormPayload();
  if(!payload.topic){toast('Add a topic title first.');document.getElementById('topic').focus();return}
  if(payload.source.length<20){toast('Paste your prepared notes (at least a few sentences).');document.getElementById('notes').focus();return}
  stopPlay();stopSceneAnimation();
  const btn=document.querySelector('.build-actions .primary');btn.disabled=true;btn.innerHTML='Arranging slides…';
  try{
    const slides=createSlides(payload),ref=userLessons().doc(),stamp=firebase.firestore.FieldValue.serverTimestamp(),doc={...payload,slides,createdAt:stamp,updatedAt:stamp};
    await ref.set(doc);currentId=ref.id;
    const local={...payload,slides,id:ref.id,date:new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short'})};
    lessons.unshift(local);renderLessons();deck=slides;slide=0;
    document.getElementById('buildHint').textContent='Draft saved securely to your Firebase account';
    document.getElementById('deckTitle').textContent=payload.topic;
    document.getElementById('deckSub').textContent=[payload.program,payload.branch,payload.subject,payload.module].filter(Boolean).join(' · ');
    document.getElementById('scriptList').classList.remove('open');document.getElementById('scriptToggle').textContent='Edit script';
    setAnimationStatus('Draft saved. Confirm Gemini consent below when you want the animated explanation.');
    renderDeck();toast('Lesson saved to Firebase. Review the draft, then choose whether to animate it.');
  }catch(e){console.error(e);toast('Could not save lesson: '+e.message)}
  finally{btn.disabled=false;btn.innerHTML='Arrange into lesson slides <span>→</span>'}
}
function updateAnimationControls(){
  const consent=document.getElementById('aiConsent');
  const animateButton=document.getElementById('animateButton');
  const exportButton=document.getElementById('exportVideoButton');
  const hasAnimation=deck.some(item=>item.animation&&item.animation.visualType);
  if(animateButton){
    animateButton.disabled=!deck.length||!currentId||!currentUser||!functionsClient||!consent||!consent.checked;
    animateButton.innerHTML=`${hasAnimation?'Refresh animated explanation':'Create animated explanation'} <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 10 7-10 7V5Z"/></svg>`;
  }
  if(exportButton)exportButton.disabled=!deck.length||typeof window.MediaRecorder!=='function';
  if(deck.length&&!functionsClient)setAnimationStatus('Firebase Functions is unavailable in this build. Check that the Functions SDK is loaded before trying Gemini.');
}
function mergeStoryboard(baseDeck,storyboard){
  const order=['intro','concept','steps','formula','example','trick','recap'];
  if(!Array.isArray(baseDeck)||baseDeck.length!==7||!storyboard||!Array.isArray(storyboard.scenes)||storyboard.scenes.length!==7)throw new Error('The animated lesson needs the complete seven-scene lesson flow.');
  const byKind=new Map();
  for(const scene of storyboard.scenes){if(!scene||!order.includes(scene.kind)||byKind.has(scene.kind))throw new Error('The animated storyboard has an invalid scene sequence.');byKind.set(scene.kind,scene)}
  if(order.some(kind=>!byKind.has(kind)))throw new Error('The animated storyboard is missing a lesson scene.');
  const visualTypes={intro:'title',concept:'concept-map',steps:'flow',formula:'equation',example:'example',trick:'memory',recap:'recap'};
  return order.map(kind=>{
    const original=baseDeck.find(item=>item.kind===kind)||{};
    const scene=byKind.get(kind);
    return {...original,kicker:typeof scene.kicker==='string'&&scene.kicker.trim()?scene.kicker.trim():original.kicker,title:typeof scene.title==='string'&&scene.title.trim()?scene.title.trim():original.title,body:typeof scene.explanation==='string'&&scene.explanation.trim()?scene.explanation.trim():original.body,narration:typeof scene.narration==='string'?scene.narration.trim():'',steps:Array.isArray(scene.steps)?scene.steps.filter(value=>typeof value==='string').slice(0,5):original.steps,animation:{visualType:visualTypes[kind],visualLabels:Array.isArray(scene.visualLabels)?scene.visualLabels.filter(value=>typeof value==='string').slice(0,4):[],durationSeconds:Number(scene.durationSeconds)||6,reviewNote:typeof scene.reviewNote==='string'?scene.reviewNote:'',overallReviewNote:storyboard.reviewNote||''}};
  });
}
function sceneLabelsFor(scene){
  const generated=scene.animation&&Array.isArray(scene.animation.visualLabels)?scene.animation.visualLabels.filter(Boolean):[];
  if(generated.length)return generated.slice(0,4);
  if(Array.isArray(scene.steps)&&scene.steps.length)return scene.steps.slice(0,4).map(value=>String(value));
  if(scene.kind==='formula')return ['Known values','Use the relationship','Check the result'];
  if(scene.kind==='example')return ['Given','Work through it','Result'];
  if(scene.kind==='trick')return ['Notice the pattern','Make a cue','Remember'];
  return [scene.title||'Main idea','How it works','Key takeaway'];
}
function clamp01(value){return Math.max(0,Math.min(1,value))}
function canvasRoundRect(ctx,x,y,w,h,r,fill,stroke,alpha=1){
  ctx.save();ctx.globalAlpha=alpha;ctx.beginPath();
  if(typeof ctx.roundRect==='function')ctx.roundRect(x,y,w,h,r);
  else{ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);}
  if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.2;ctx.stroke()}ctx.restore();
}
function canvasLabel(ctx,label,maxWidth){
  const words=String(label||'').replace(/\s+/g,' ').trim().split(' ');let line='';
  for(const word of words){const test=line?`${line} ${word}`:word;if(ctx.measureText(test).width>maxWidth&&line)return line.length>2?`${line.slice(0,-1)}…`:line;line=test}
  return line.length>22?`${line.slice(0,21)}…`:line;
}
function drawSceneNode(ctx,cx,cy,w,h,label,index,time,fg,accent){
  const progress=clamp01((time-index*260+100)/520),lift=(1-progress)*13+Math.sin(time/850+index)*3;
  const x=cx-w/2,y=cy-h/2+lift;
  canvasRoundRect(ctx,x,y,w,h,Math.min(16,h*.22),fg,null,.12+.1*progress);
  canvasRoundRect(ctx,x,y,w,h,Math.min(16,h*.22),null,fg,.48*progress);
  ctx.save();ctx.globalAlpha=.42+.5*progress;ctx.fillStyle=accent;ctx.beginPath();ctx.arc(x+13,y+15,4.5,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=fg;ctx.font=`600 ${Math.max(9,Math.min(12,w/8))}px system-ui, sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(canvasLabel(ctx,label,w-24),cx+4,y+h*.57,w-24);ctx.restore();
}
function drawSceneLink(ctx,x1,y1,x2,y2,time,fg,index=0){
  const progress=clamp01((time-index*200+180)/460);ctx.save();ctx.globalAlpha=.35*progress;ctx.strokeStyle=fg;ctx.lineWidth=1.6;ctx.setLineDash([4,7]);ctx.lineDashOffset=-time/45;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.restore();
}
function drawSceneVisual(ctx,x,y,w,h,scene,time,palette){
  if(!ctx||w<10||h<10)return;
  const fg=palette.fg,accent='#d6b972',labels=sceneLabelsFor(scene),visualType=scene.animation&&scene.animation.visualType||({intro:'title',concept:'concept-map',steps:'flow',formula:'equation',example:'example',trick:'memory',recap:'recap'}[scene.kind]||'concept-map');
  const t=Math.max(0,time||0),cx=x+w/2,cy=y+h/2;
  ctx.save();ctx.globalAlpha=.2;ctx.strokeStyle=fg;ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(cx,cy,w*.44,h*.37,-.12,0,Math.PI*2);ctx.stroke();ctx.restore();
  if(visualType==='concept-map'){
    const points=[{x:x+w*.18,y:y+h*.26},{x:x+w*.82,y:y+h*.25},{x:x+w*.18,y:y+h*.76},{x:x+w*.82,y:y+h*.75}];
    points.forEach((point,i)=>drawSceneLink(ctx,cx,cy,point.x,point.y,t,fg,i));
    points.forEach((point,i)=>drawSceneNode(ctx,point.x,point.y,w*.34,h*.2,labels[i%labels.length],i,t,fg,accent));
    const p=clamp01((t+100)/500);ctx.save();ctx.globalAlpha=.2+.14*p;ctx.fillStyle=accent;ctx.beginPath();ctx.arc(cx,cy,Math.min(w,h)*.19,0,Math.PI*2);ctx.fill();ctx.globalAlpha=p;ctx.strokeStyle=fg;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(cx,cy,Math.min(w,h)*.19,0,Math.PI*2);ctx.stroke();ctx.fillStyle=fg;ctx.font=`700 ${Math.max(10,Math.min(13,w/18))}px system-ui, sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(canvasLabel(ctx,scene.title||labels[0],w*.28),cx,cy);ctx.restore();
  }else if(visualType==='flow'||visualType==='example'){
    const count=3,nodeW=Math.min(w*.29,(w-24)/count),nodeH=Math.min(70,h*.27),gap=(w-nodeW*count)/(count-1);
    for(let i=0;i<count;i++){const nx=x+nodeW/2+i*(nodeW+gap);if(i<count-1)drawSceneLink(ctx,nx+nodeW*.56,cy,nx+nodeW+gap*.46,cy,t,fg,i);drawSceneNode(ctx,nx,cy,nodeW,nodeH,labels[i%labels.length],i,t,fg,accent)}
    const orbX=x+w*.5+Math.cos(t/850)*w*.35,orbY=y+h*.2+Math.sin(t/690)*h*.09;ctx.save();ctx.globalAlpha=.82;ctx.fillStyle=accent;ctx.beginPath();ctx.arc(orbX,orbY,4+Math.sin(t/240)*1.2,0,Math.PI*2);ctx.fill();ctx.restore();
  }else if(visualType==='equation'){
    const nodeW=Math.min(w*.27,(w-42)/3),nodeH=Math.min(78,h*.32),gap=(w-nodeW*3)/2;
    for(let i=0;i<3;i++){const nx=x+nodeW/2+i*(nodeW+gap);drawSceneNode(ctx,nx,cy,nodeW,nodeH,labels[i%labels.length],i,t,fg,accent);if(i<2){ctx.save();ctx.globalAlpha=.7;ctx.fillStyle=accent;ctx.font='700 22px Georgia, serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(i===0?'+':'=',nx+nodeW/2+gap/2,cy);ctx.restore()}}
  }else if(visualType==='memory'){
    const radius=Math.min(w,h)*(.28+Math.sin(t/1050)*.015),progress=clamp01((t+100)/550);ctx.save();ctx.globalAlpha=.12+.12*progress;ctx.fillStyle=accent;ctx.beginPath();ctx.arc(cx,cy,radius+14,0,Math.PI*2);ctx.fill();ctx.globalAlpha=.65*progress;ctx.strokeStyle=fg;ctx.lineWidth=1.5;ctx.setLineDash([5,7]);ctx.lineDashOffset=-t/55;ctx.beginPath();ctx.arc(cx,cy,radius+24,0,Math.PI*2);ctx.stroke();ctx.restore();drawSceneNode(ctx,cx,cy,w*.62,h*.3,labels[0],0,t,fg,accent);for(let i=0;i<3;i++){const angle=t/1200+i*Math.PI*2/3;ctx.save();ctx.globalAlpha=.8;ctx.fillStyle=i===0?accent:fg;ctx.beginPath();ctx.arc(cx+Math.cos(angle)*(radius+24),cy+Math.sin(angle)*(radius+24),4.5,0,Math.PI*2);ctx.fill();ctx.restore()}
  }else if(visualType==='recap'){
    const nodeW=w*.72,nodeH=Math.min(48,h*.19),gap=Math.max(8,(h-nodeH*3)/4);
    for(let i=0;i<3;i++){const ny=y+gap+nodeH/2+i*(nodeH+gap);drawSceneNode(ctx,cx,ny,nodeW,nodeH,labels[i%labels.length],i,t,fg,accent)}
  }else{
    const cardW=w*.68,cardH=h*.62,cardX=cx-cardW/2,cardY=cy-cardH/2+Math.sin(t/850)*3;const p=clamp01((t+100)/500);canvasRoundRect(ctx,cardX,cardY,cardW,cardH,16,fg,null,.13);canvasRoundRect(ctx,cardX,cardY,cardW,cardH,16,null,fg,.55*p);ctx.save();ctx.globalAlpha=.65*p;ctx.strokeStyle=fg;ctx.lineWidth=1.6;ctx.lineCap='round';for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(cardX+16,cardY+24+i*21);ctx.lineTo(cardX+cardW*(i===1?.78:.65),cardY+24+i*21);ctx.stroke()}ctx.restore();ctx.save();ctx.globalAlpha=.8;ctx.fillStyle=accent;ctx.beginPath();ctx.arc(cardX+cardW*.78,cardY+cardH*.72,cardH*.13,0,Math.PI*2);ctx.fill();ctx.globalAlpha=.75*p;ctx.fillStyle=fg;ctx.font=`600 ${Math.max(9,Math.min(12,cardW/12))}px system-ui, sans-serif`;ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(canvasLabel(ctx,labels[0],cardW*.58),cardX+14,cardY+cardH*.76,cardW*.58);ctx.restore();
  }
}
function stopSceneAnimation(){
  sceneAnimationToken++;
  if(sceneAnimationFrame!==null&&typeof window.cancelAnimationFrame==='function')window.cancelAnimationFrame(sceneAnimationFrame);
  sceneAnimationFrame=null;sceneAnimationPaused=false;sceneAnimationElapsed=0;
  const canvas=document.getElementById('animationCanvas');
  if(canvas&&typeof canvas.getContext==='function'){const ctx=canvas.getContext('2d');if(ctx)ctx.clearRect(0,0,canvas.width,canvas.height)}
}
function pauseSceneAnimation(){
  if(sceneAnimationFrame===null)return;
  sceneAnimationPaused=true;
  sceneAnimationElapsed=Math.max(0,(typeof performance!=='undefined'?performance.now():sceneAnimationStartedAt)-sceneAnimationStartedAt);
}
function resumeSceneAnimation(){
  if(!sceneAnimationPaused)return;
  sceneAnimationPaused=false;
  sceneAnimationStartedAt=(typeof performance!=='undefined'?performance.now():sceneAnimationStartedAt)-sceneAnimationElapsed;
}
function startSceneAnimation(scene,index,palette){
  const canvas=document.getElementById('animationCanvas');
  if(!canvas||typeof canvas.getContext!=='function'||typeof window.requestAnimationFrame!=='function')return;
  stopSceneAnimation();
  const token=sceneAnimationToken,ctx=canvas.getContext('2d');
  if(!ctx)return;
  const reduced=(typeof window.matchMedia==='function'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)||transitionStyle==='none';
  sceneAnimationStartedAt=typeof performance!=='undefined'?performance.now():0;
  sceneAnimationPaused=!reduced&&playbackState==='paused';
  const draw=time=>{
    if(token!==sceneAnimationToken)return;
    const elapsed=sceneAnimationPaused?sceneAnimationElapsed:time;
    sceneAnimationElapsed=elapsed;
    const rect=canvas.getBoundingClientRect();
    if(rect.width>0&&rect.height>0){const ratio=Math.min(2,window.devicePixelRatio||1),width=Math.round(rect.width*ratio),height=Math.round(rect.height*ratio);if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height}ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,rect.width,rect.height);drawSceneVisual(ctx,rect.width*.58,rect.height*.1,rect.width*.39,rect.height*.8,scene,elapsed,palette)}
    if(!reduced)sceneAnimationFrame=window.requestAnimationFrame(frame);
  };
  const frame=timestamp=>draw(reduced?5000:sceneAnimationPaused?sceneAnimationElapsed:Math.max(0,timestamp-sceneAnimationStartedAt));
  if(reduced)draw(5000);else sceneAnimationFrame=window.requestAnimationFrame(frame);
}
function renderDeck(){
  const strip=document.getElementById('slideStrip');
  strip.innerHTML=deck.map((s,i)=>`<button class="slide-mini ${i===slide?'current':''}" type="button" onclick="goSlide(${i})" aria-label="Go to slide ${i+1}: ${esc(s.kicker)}">${esc(s.kicker)}</button>`).join('');
  if(deck.length)renderSlide(Math.min(slide,deck.length-1));
  updateAnimationControls();
}
function renderSlide(i){
  if(!deck.length)return;
  slide=(i+deck.length)%deck.length;
  const s=deck[slide],stage=document.getElementById('stage'),content=document.getElementById('stageContent');
  const paletteSet=templatePalettes[currentTemplate]||templatePalettes.campus,palette=paletteSet[slide%paletteSet.length],steps=Array.isArray(s.steps)?s.steps:[];
  stage.classList.remove('empty-stage');stage.dataset.template=currentTemplate;stage.style.background=palette.bg;stage.style.color=palette.fg;
  const body=s.kind==='formula'?`<div class="formula">${esc(s.body||'')}</div>`:`<p>${esc(s.body||'')}</p>`;
  content.innerHTML=`<div class="slide-kicker">${esc(s.kicker||'LESSON IDEA')}</div><h2>${esc(s.title||'A clear idea')}</h2>${body}${steps.length?`<ol class="steps-list">${steps.map(step=>`<li>${esc(step)}</li>`).join('')}</ol>`:''}<div class="number">${String(slide+1).padStart(2,'0')}</div>`;
  animateSlideContent(content);startSceneAnimation(s,slide,palette);
  document.getElementById('slideIndex').textContent=`${slide+1} / ${deck.length}`;
  document.querySelectorAll('.slide-mini').forEach((element,j)=>element.classList.toggle('current',j===slide));
}
function wrapCanvasText(ctx,value,maxWidth,maxLines){
  const words=String(value||'').replace(/\s+/g,' ').trim().split(' ').filter(Boolean),lines=[];let line='',truncated=false;
  for(let i=0;i<words.length;i++){
    const candidate=line?`${line} ${words[i]}`:words[i];
    if(ctx.measureText(candidate).width>maxWidth&&line){lines.push(line);line=words[i];if(lines.length>=maxLines){truncated=true;break}}
    else line=candidate;
  }
  if(line&&lines.length<maxLines)lines.push(line);
  if(truncated&&lines.length){let last=lines[lines.length-1];while(last.length>3&&ctx.measureText(`${last}…`).width>maxWidth)last=last.slice(0,-1);lines[lines.length-1]=`${last}…`}
  return lines;
}
function drawVideoFrame(ctx,width,height,scene,index,time,palette){
  ctx.clearRect(0,0,width,height);
  const gradient=ctx.createLinearGradient(0,0,width,height);gradient.addColorStop(0,palette.bg);gradient.addColorStop(1,palette.bg);
  ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);
  ctx.save();ctx.globalAlpha=.075;ctx.fillStyle=palette.fg;ctx.beginPath();ctx.arc(width*.87,height*.17,220,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(width*.78,height*.88,270,0,Math.PI*2);ctx.fill();ctx.restore();
  canvasRoundRect(ctx,38,34,width-76,height-68,28,palette.fg,null,.035);
  ctx.save();ctx.fillStyle=palette.fg;ctx.globalAlpha=.8;ctx.textAlign='left';ctx.textBaseline='top';ctx.font='700 15px system-ui, sans-serif';ctx.fillText('VRIDDHI  ·  ANIMATED EXPLAINER',78,68);ctx.restore();
  ctx.save();ctx.fillStyle=palette.fg;ctx.globalAlpha=.35;ctx.fillRect(78,106,width-156,1);ctx.globalAlpha=.9;ctx.fillStyle='#dfc27b';ctx.fillRect(78,105,(width-156)*(index+1)/deck.length,3);ctx.restore();
  ctx.save();ctx.textAlign='left';ctx.textBaseline='top';ctx.fillStyle=palette.fg;ctx.globalAlpha=.76;ctx.font='800 15px system-ui, sans-serif';ctx.fillText(String(scene.kicker||'LESSON IDEA').toUpperCase(),82,143);
  ctx.globalAlpha=1;ctx.font='500 51px Georgia, "Times New Roman", serif';const titleLines=wrapCanvasText(ctx,scene.title||'A clear idea',530,3);let titleY=184;titleLines.forEach(line=>{ctx.fillText(line,80,titleY);titleY+=61});
  ctx.font='400 24px system-ui, sans-serif';ctx.globalAlpha=.86;const explanationLines=wrapCanvasText(ctx,scene.body||'',520,4);let bodyY=titleY+11;explanationLines.forEach(line=>{ctx.fillText(line,82,bodyY);bodyY+=34});
  const caption=scene.narration||scene.body||'';if(caption){ctx.globalAlpha=.66;ctx.font='italic 18px Georgia, "Times New Roman", serif';const captionLines=wrapCanvasText(ctx,caption,520,2);let captionY=Math.max(bodyY+13,550);captionLines.forEach(line=>{ctx.fillText(line,82,captionY);captionY+=25})}
  ctx.globalAlpha=.56;ctx.font='600 12px system-ui, sans-serif';ctx.fillText(`${String(index+1).padStart(2,'0')}  /  ${String(deck.length).padStart(2,'0')}`,82,height-77);ctx.restore();
  drawSceneVisual(ctx,700,145,470,465,scene,time,palette);
  ctx.save();ctx.globalAlpha=.4;ctx.strokeStyle=palette.fg;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(82,height-56);ctx.lineTo(width-82,height-56);ctx.stroke();ctx.restore();
}
function lessonFormPayload(){
  return {program:document.getElementById('program').value,branch:document.getElementById('branch').value.trim(),subject:document.getElementById('subject').value.trim(),module:document.getElementById('module').value.trim(),topic:document.getElementById('topic').value.trim(),source:document.getElementById('notes').value.trim()};
}
function setAnimationStatus(message){const status=document.getElementById('animationStatus');if(status)status.textContent=message}
async function generateAnimatedLesson(){
  const consent=document.getElementById('aiConsent');
  if(!consent||!consent.checked){toast('Confirm that these notes can be sent to Gemini first.');return}
  if(!deck.length||!currentId){toast('Arrange and save this lesson before creating its animation.');return}
  if(!currentUser||!functionsClient){toast('The signed-in Firebase Functions service is not available yet.');return}
  const payload=lessonFormPayload(),button=document.getElementById('animateButton');
  if(payload.source.length<20){toast('Add a few sentences of prepared notes first.');document.getElementById('notes').focus();return}
  button.disabled=true;button.textContent='Building your animated explanation…';
  setAnimationStatus('Gemini is shaping your notes into a simple story and scene plan. This can take a little while.');
  try{
    const response=await functionsClient.httpsCallable('generateAnimatedLesson')(payload);
    const animatedDeck=mergeStoryboard(deck,response.data);
    await userLessons().doc(currentId).update({...payload,slides:animatedDeck,animationProvider:'gemini',animatedStoryboardVersion:1,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
    deck=animatedDeck;
    const saved=lessons.find(item=>item.id===currentId);
    if(saved)Object.assign(saved,payload,{slides:animatedDeck});
    document.getElementById('deckTitle').textContent=response.data.title||payload.topic;
    document.getElementById('deckSub').textContent=[payload.program,payload.branch,payload.subject,payload.module].filter(Boolean).join(' · ');
    document.getElementById('buildHint').textContent='Animated storyboard saved to your Firebase account';
    consent.checked=false;
    renderDeck();
    setAnimationStatus('Your seven-scene explainer is ready. Play it, review every explanation, then export the animated visuals.');
    toast('Animated explanation created and saved. Review it before teaching or sharing.');
  }catch(error){
    console.error('Animated lesson request failed:',error.code||'unknown');
    const message=error&&error.message?error.message:'Could not create the animated explanation.';
    setAnimationStatus(message);
    toast(message.length>150?'Could not create the animated explanation. Check the backend setup and try again.':message);
  }finally{updateAnimationControls()}
}
async function downloadAnimatedVideo(){
  if(!deck.length){toast('Create a lesson draft before exporting a video.');return}
  if(typeof window.MediaRecorder!=='function'){toast('Video export is not supported in this browser.');return}
  const button=document.getElementById('exportVideoButton'),canvas=document.createElement('canvas');
  canvas.width=1280;canvas.height=720;
  const ctx=canvas.getContext('2d');
  if(!ctx||typeof canvas.captureStream!=='function'){toast('This browser cannot record the animated scene.');return}
  const stream=canvas.captureStream(30),chunks=[];
  let recorder=null,blobPromise=null;
  const supported=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(type=>window.MediaRecorder.isTypeSupported&&window.MediaRecorder.isTypeSupported(type));
  const oldLabel=button.textContent;
  try{
    recorder=supported?new window.MediaRecorder(stream,{mimeType:supported}):new window.MediaRecorder(stream);
    blobPromise=new Promise((resolve,reject)=>{
      recorder.ondataavailable=event=>{if(event.data&&event.data.size)chunks.push(event.data)};
      recorder.onerror=event=>reject(event.error||new Error('Video recording failed.'));
      recorder.onstop=()=>resolve(new Blob(chunks,{type:recorder.mimeType||supported||'video/webm'}));
    });
    button.disabled=true;recorder.start(1000);
    for(let i=0;i<deck.length;i++){
      const palette=(templatePalettes[currentTemplate]||templatePalettes.campus)[i%(templatePalettes[currentTemplate]||templatePalettes.campus).length];
      const duration=Math.max(4,Math.min(8,Number(deck[i].animation&&deck[i].animation.durationSeconds)||5))*1000;
      const started=performance.now();button.textContent=`Rendering scene ${i+1} of ${deck.length}…`;
      while(performance.now()-started<duration){drawVideoFrame(ctx,canvas.width,canvas.height,deck[i],i,performance.now()-started,palette);await new Promise(resolve=>window.requestAnimationFrame(resolve))}
      drawVideoFrame(ctx,canvas.width,canvas.height,deck[i],i,duration,palette);
    }
    recorder.stop();
    const blob=await blobPromise;
    if(!blob.size)throw new Error('The browser returned an empty video. Please try another browser.');
    const url=URL.createObjectURL(blob),anchor=document.createElement('a');
    const filename=(document.getElementById('topic').value||'vriddhi-animated-explainer').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'vriddhi-animated-explainer';
    anchor.href=url;anchor.download=`${filename}.webm`;anchor.style.display='none';document.body.appendChild(anchor);anchor.click();anchor.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1500);
    toast('Animated WebM downloaded. This export includes captions and vector motion; browser voice is preview-only for now.');
  }catch(error){
    console.error('Animated video export failed:',error.name||'Error');
    toast(error.message||'Could not export the animated video.');
  }finally{
    if(recorder&&recorder.state!=='inactive'){try{recorder.stop()}catch(_){}}
    stream.getTracks().forEach(track=>track.stop());button.textContent=oldLabel;updateAnimationControls();
  }
}
function goSlide(i){if(!deck.length)return;const previousState=playbackState;invalidatePlaybackRun();renderSlide(i);playbackState=previousState==='playing'?'playing':previousState==='paused'?'paused':'stopped';updatePlayButton();if(playbackState==='playing')startPlaybackSlide(playbackToken)}
function nextSlide(){if(deck.length)goSlide(slide+1)}
function prevSlide(){if(deck.length)goSlide(slide-1)}
function getSlideNarrationText(index){const s=deck[index]||{};if(typeof s.narration==='string'&&s.narration.trim())return s.narration.trim();return [s.title,s.body,...(Array.isArray(s.steps)?s.steps:[])].map(value=>String(value??'').trim()).filter(Boolean).join('. ')}
function estimateSpeechDuration(text){const words=(String(text||'').match(/\S+/g)||[]).length;return Math.max(1800,Math.ceil(words/145*60000))}
function speechUtteranceConstructor(){if(typeof window.SpeechSynthesisUtterance==='function')return window.SpeechSynthesisUtterance;if(typeof SpeechSynthesisUtterance==='function')return SpeechSynthesisUtterance;return null}
function canSpeak(){return !!window.speechSynthesis&&!!speechUtteranceConstructor()}
function getSpeechVoices(){try{const synth=window.speechSynthesis;return synth&&typeof synth.getVoices==='function'?synth.getVoices():[]}catch(_){return []}}
function classifyVoiceGender(voice){const declared=String(voice.gender||voice.voiceGender||'').toLowerCase();if(/\b(?:female|feminine|woman)\b/.test(declared))return 'female';if(/\b(?:male|masculine|man)\b/.test(declared))return 'male';const label=`${voice.name||''} ${voice.voiceURI||''}`.toLowerCase();if(/\b(?:female|woman|girl)\b/.test(label))return 'female';if(/\b(?:male|man|boy)\b/.test(label))return 'male';if(/\b(?:neerja|heera|aditi|kajal|swara|zira|jenny|aria|joanna|salli|kendra|tessa|karen|victoria|susan|ava|emma|samantha|fiona|allison|veena|raveena|lekha|ananya|pallavi|priya|nisha|sunita|luciana|amelie|mariska|helena|sara|serena|xiaoxiao|yuna|paulina|katja)\b/.test(label))return 'female';if(/\b(?:ravi|prabhat|madhur|rishi|david|mark|guy|brian|matthew|joey|justin|eric|fred|tom|daniel|oliver|george|ryan|arthur|sanjay|hemant|manohar|amit|rahul|robert|john|carlos|diego|liam|nathan|adam|evan|thomas|andrew|james)\b/.test(label))return 'male';return 'unknown'}
function chooseSpeechVoice(preference=voicePreference){const voices=getSpeechVoices(),english=voices.filter(voice=>/^en(?:[-_]|$)/i.test(voice.lang||'')),matching=preference==='auto'?english:english.filter(voice=>classifyVoiceGender(voice)===preference),score=voice=>((/^en[-_]IN$/i.test(voice.lang||'')?4:0)+(voice.default?2:0)+(voice.localService?1:0)),ranked=matching.slice().sort((a,b)=>score(b)-score(a));return {voice:ranked[0]||null,englishCount:english.length,totalVoiceCount:voices.length,matchingCount:matching.length}}
function refreshVoiceStatus(){const status=document.getElementById('voiceStatus');if(!status)return;if(!canSpeak()){status.textContent='Browser speech is unavailable; timed playback is still available.';return}const choice=chooseSpeechVoice();if(choice.voice){status.textContent=voicePreference==='auto'?`Auto voice: ${choice.voice.name||choice.voice.lang}.`:`Using ${voicePreference} voice: ${choice.voice.name||choice.voice.lang}.`;return}if(choice.totalVoiceCount===0){status.textContent='System voices are loading; the browser default will be used.';return}if(choice.englishCount===0){status.textContent='No English voice was detected; the browser default will be used.';return}status.textContent=`No ${voicePreference} English voice was identified; the browser default will be used.`}
function makeUtterance(text){const Constructor=speechUtteranceConstructor();if(!Constructor)return null;const utterance=new Constructor(text),choice=chooseSpeechVoice();utterance.rate=.92;utterance.lang='en-IN';if(choice.voice){utterance.voice=choice.voice;utterance.lang=choice.voice.lang||'en-IN'}return utterance}
function animateSlideContent(content){const classes=['transition-rise','transition-fade','transition-slide','transition-none'];content.classList.remove(...classes);if(transitionStyle==='none'){content.classList.add('transition-none');return}void content.offsetWidth;content.classList.add(`transition-${transitionStyle}`)}
function setTemplate(value){if(!Object.prototype.hasOwnProperty.call(templatePalettes,value))return;currentTemplate=value;savePreference('vriddhi-template',value);const stage=document.getElementById('stage'),paletteSet=templatePalettes[value];if(stage){stage.dataset.template=value;if(!deck.length){stage.style.background=paletteSet[0].bg;stage.style.color=paletteSet[0].fg}}if(deck.length)renderSlide(slide)}
function setVoicePreference(value){if(!['auto','female','male'].includes(value))return;voicePreference=value;savePreference('vriddhi-voice',value);refreshVoiceStatus();if(activeUtterance)toast('The new voice preference applies to the next narration.')}
function setTransitionStyle(value){if(!['rise','fade','slide','none'].includes(value))return;transitionStyle=value;savePreference('vriddhi-transition',value);if(deck.length)renderSlide(slide);else animateSlideContent(document.getElementById('stageContent'))}
function initializePlaybackControls(){const pause=document.getElementById('transitionPause'),template=document.getElementById('templateSelect'),voice=document.getElementById('voicePreference'),transition=document.getElementById('transitionStyle');if(pause)pause.value=String(transitionPauseMs);if(template)template.value=currentTemplate;if(voice)voice.value=voicePreference;if(transition)transition.value=transitionStyle;const stage=document.getElementById('stage');if(stage)stage.dataset.template=currentTemplate;setTransitionPause(transitionPauseMs);refreshVoiceStatus();const consent=document.getElementById('aiConsent');if(consent&&typeof consent.addEventListener==='function')consent.addEventListener('change',updateAnimationControls);updateAnimationControls();if(window.speechSynthesis)window.speechSynthesis.onvoiceschanged=refreshVoiceStatus}
function invalidatePlaybackRun(){playbackToken++;if(playTimer!==null)clearTimeout(playTimer);playTimer=null;playTimerPending=false;playTimerDeadline=0;playTimerRemaining=0;playTimerKind=null;activeUtterance=null;try{if(window.speechSynthesis)window.speechSynthesis.cancel()}catch(_){}}
function updatePlayButton(){const button=document.getElementById('playBtn');if(!button)return;button.textContent=playbackState==='playing'?'Ⅱ Pause':playbackState==='paused'?'▶ Resume':'▶ Play slides';if(button.setAttribute)button.setAttribute('aria-label',playbackState==='playing'?'Pause slideshow':playbackState==='paused'?'Resume slideshow':'Play slideshow')}
function schedulePlaybackTimer(delay,token,kind){if(playTimer!==null)clearTimeout(playTimer);playTimer=null;playTimerPending=true;playTimerKind=kind;playTimerRemaining=Math.max(0,delay);playTimerDeadline=Date.now()+playTimerRemaining;if(playbackState==='paused')return;playTimer=setTimeout(()=>{if(token!==playbackToken)return;playTimer=null;playTimerPending=false;playTimerDeadline=0;playTimerRemaining=0;playTimerKind=null;if(playbackState!=='playing')return;advancePlayback(token)},playTimerRemaining)}
function completePlayback(token){if(token!==playbackToken)return;invalidatePlaybackRun();playbackState='stopped';updatePlayButton();toast('Slideshow complete.')}
function advancePlayback(token){if(token!==playbackToken||playbackState!=='playing')return;if(slide>=deck.length-1){completePlayback(token);return}renderSlide(slide+1);startPlaybackSlide(token)}
function finishNarratedSlide(token){if(token!==playbackToken||!['playing','paused'].includes(playbackState))return;if(slide>=deck.length-1){if(playbackState==='paused'){playTimerPending=true;playTimerKind='transition';playTimerRemaining=0;playTimerDeadline=0}else completePlayback(token);return}if(playbackState==='paused'){playTimerPending=true;playTimerKind='transition';playTimerRemaining=transitionPauseMs;playTimerDeadline=0;return}schedulePlaybackTimer(transitionPauseMs,token,'transition')}
function fallbackDelay(text){return estimateSpeechDuration(text)+(slide<deck.length-1?transitionPauseMs:0)}
function startPlaybackSlide(token){if(token!==playbackToken||playbackState!=='playing'||!deck.length)return;const text=getSlideNarrationText(slide);if(!canSpeak()){schedulePlaybackTimer(fallbackDelay(text),token,'estimate');return}let utterance;try{utterance=makeUtterance(text)}catch(_){utterance=null}if(!utterance){schedulePlaybackTimer(fallbackDelay(text),token,'estimate');return}activeUtterance=utterance;utterance.onend=()=>{if(token!==playbackToken||activeUtterance!==utterance)return;activeUtterance=null;finishNarratedSlide(token)};utterance.onerror=()=>{if(token!==playbackToken||activeUtterance!==utterance)return;activeUtterance=null;schedulePlaybackTimer(fallbackDelay(text),token,'estimate')};try{window.speechSynthesis.speak(utterance)}catch(_){if(token===playbackToken&&activeUtterance===utterance){activeUtterance=null;schedulePlaybackTimer(fallbackDelay(text),token,'estimate')}}}
function pausePlayback(){if(playbackState!=='playing')return;if(playTimerPending&&playTimer!==null){playTimerRemaining=Math.max(0,playTimerDeadline-Date.now());clearTimeout(playTimer);playTimer=null;playTimerDeadline=0}playbackState='paused';pauseSceneAnimation();try{if(activeUtterance&&window.speechSynthesis)window.speechSynthesis.pause()}catch(_){}updatePlayButton()}
function resumePlayback(){if(playbackState!=='paused')return;playbackState='playing';resumeSceneAnimation();updatePlayButton();if(playTimerPending){schedulePlaybackTimer(playTimerRemaining,playbackToken,playTimerKind||'transition');return}if(activeUtterance){try{if(window.speechSynthesis)window.speechSynthesis.resume()}catch(_){}return}startPlaybackSlide(playbackToken)}
function togglePlay(){if(!deck.length){toast('Arrange your notes into slides first.');return}if(playbackState==='playing'){pausePlayback();return}if(playbackState==='paused'){resumePlayback();return}if(slide===deck.length-1)renderSlide(0);invalidatePlaybackRun();playbackState='playing';updatePlayButton();startPlaybackSlide(playbackToken)}
function stopPlay(){invalidatePlaybackRun();playbackState='stopped';resumeSceneAnimation();updatePlayButton()}
function speakSlide(){if(!deck.length){toast('Create slides first.');return}if(!canSpeak()){toast('Browser speech is unavailable on this device.');return}stopPlay();let utterance;try{utterance=makeUtterance(getSlideNarrationText(slide))}catch(_){utterance=null}if(!utterance){toast('Browser speech is unavailable on this device.');return}const token=playbackToken;activeUtterance=utterance;utterance.onend=()=>{if(token===playbackToken&&activeUtterance===utterance)activeUtterance=null};utterance.onerror=()=>{if(token===playbackToken&&activeUtterance===utterance)activeUtterance=null};try{window.speechSynthesis.speak(utterance);toast('Reading the current slide. Use Play slides to continue through the deck.')}catch(_){activeUtterance=null;toast('Could not start browser speech on this device.')}}
function setTransitionPause(value){const pause=Number(value);if(![0,2000,4000,6000].includes(pause))return;transitionPauseMs=pause;savePreference('vriddhi-playback-pause',pause);const select=document.getElementById('transitionPause');if(select)select.value=String(pause);const hint=document.getElementById('playbackHint');if(hint)hint.textContent=pause===0?'Slides advance as soon as narration ends.':`Each slide stays up for its narration plus ${pause/1000} sec.`;if(playTimerPending&&playTimerKind==='transition'){if(playbackState==='paused')playTimerRemaining=pause;else schedulePlaybackTimer(pause,playbackToken,'transition')}}
function toggleScript(){
  const panel=document.getElementById('scriptList');
  if(!deck.length){toast('Create the slide draft first.');return}
  panel.classList.toggle('open');
  document.getElementById('scriptToggle').textContent=panel.classList.contains('open')?'Hide editor':'Edit script';
  if(panel.classList.contains('open')){
    panel.innerHTML=deck.map((s,i)=>`<div class="script-slide"><span>SCENE ${String(i+1).padStart(2,'0')} · ${esc(s.kicker)}</span><input value="${esc(s.title)}" aria-label="Scene title" oninput="updateSlide(${i},'title',this.value)"><textarea aria-label="On-screen explanation" oninput="updateSlide(${i},'body',this.value)">${esc(s.body)}</textarea><textarea aria-label="Narration script" oninput="updateSlide(${i},'narration',this.value)">${esc(s.narration||getSlideNarrationText(i))}</textarea>${(s.steps||[]).map((st,j)=>`<textarea aria-label="Step ${j+1}" oninput="updateStep(${i},${j},this.value)">${esc(st)}</textarea>`).join('')}</div>`).join('')+'<div class="alert"><b>Review before use:</b> Gemini may add general explanatory context. Check each scene, example and formula against your course material.</div>';
  }
}
function updateSlide(i,key,value){deck[i][key]=value;if(i===slide){if(playbackState!=='stopped'||activeUtterance)stopPlay();renderSlide(i)}queueSave()}
function updateStep(i,j,value){deck[i].steps[j]=value;if(i===slide){if(playbackState!=='stopped'||activeUtterance)stopPlay();renderSlide(i)}queueSave()}
function queueSave(){if(!currentId||!currentUser)return;clearTimeout(saveTimer);saveTimer=setTimeout(async()=>{try{await userLessons().doc(currentId).update({slides:deck,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});const item=lessons.find(x=>x.id===currentId);if(item)item.slides=deck}catch(e){console.error(e);toast('Could not save edits: '+e.message)}},500)}
async function signIn(event){event.preventDefault();const email=document.getElementById('loginEmail').value.trim(),password=document.getElementById('loginPassword').value,button=document.getElementById('loginButton'),error=document.getElementById('authError');error.textContent='';button.disabled=true;button.textContent='Signing in…';try{await auth.signInWithEmailAndPassword(email,password)}catch(e){error.textContent=e.code==='auth/invalid-credential'?'Email or password is incorrect.':e.message}finally{button.disabled=false;button.textContent='Sign in'}}
async function signOut(){stopPlay();stopSceneAnimation();try{await auth.signOut()}catch(e){toast('Could not sign out: '+e.message)}}
function showApp(user){currentUser=user;document.getElementById('authGate').style.display='none';document.getElementById('home').style.display='flex';document.getElementById('signedInEmail').textContent=user.email||'Signed in';const av=document.getElementById('userAvatar');av.textContent=(user.email||'U').slice(0,2).toUpperCase();refreshLessons()}
function showLogin(){stopPlay();stopSceneAnimation();currentUser=null;lessons=[];deck=[];renderLessons();updateAnimationControls();document.getElementById('builder').classList.remove('open');document.body.style.overflow='';document.getElementById('home').style.display='none';document.getElementById('authGate').style.display='flex'}
function initFirebase(){
  if(!window.firebase||!window.FIREBASE_CONFIG){document.getElementById('authError').textContent='Firebase setup is missing. Check firebase-config.js and the Firebase SDK scripts.';document.getElementById('authGate').style.display='flex';return}
  try{
    const app=firebase.apps.length?firebase.app():firebase.initializeApp(window.FIREBASE_CONFIG);
    auth=firebase.auth(app);
    db=firebase.firestore(app);
    try{functionsClient=typeof app.functions==='function'?app.functions('asia-south1'):null}catch(_){functionsClient=null}
    auth.onAuthStateChanged(user=>user?showApp(user):showLogin());
  }catch(e){console.error(e);document.getElementById('authError').textContent='Firebase initialization failed: '+e.message;document.getElementById('authGate').style.display='flex'}
}
initializePlaybackControls();document.querySelectorAll('.nav button[data-nav]').forEach(b=>b.onclick=()=>{document.querySelectorAll('.nav button[data-nav]').forEach(x=>x.classList.remove('active'));b.classList.add('active');if(b.dataset.nav==='My lessons')document.querySelector('.section-title').scrollIntoView({behavior:'smooth'});else if(b.dataset.nav==='Template')toast('Choose Campus, Notebook, or Midnight; the seven-slide lesson flow stays consistent.');else window.scrollTo({top:0,behavior:'smooth'})});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.getElementById('builder').classList.contains('open'))closeBuilder();if(document.getElementById('builder').classList.contains('open')&&deck.length){if(e.key==='ArrowRight')nextSlide();if(e.key==='ArrowLeft')prevSlide()}});if(window.addEventListener)window.addEventListener('pagehide',()=>{stopPlay();stopSceneAnimation()});initFirebase();
