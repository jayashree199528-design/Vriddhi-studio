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
let lessons=[],deck=[],slide=0,playbackState='stopped',playTimer=null,playTimerPending=false,playTimerDeadline=0,playTimerRemaining=0,playTimerKind=null,playbackToken=0,activeUtterance=null,currentId=null,currentScope='shared',currentRole=null,sharedQueueReady=false,workspaceError='',saveTimer=null,editorRevision=0,editorDirty=false,activeSave=null,currentUser=null,db=null,auth=null,functionsClient=null,sceneAnimationFrame=null,sceneAnimationToken=0,sceneAnimationStartedAt=0,sceneAnimationElapsed=0,sceneAnimationPaused=false,animationRequestActive=false,workflowActionActive=false,authoringStep=0;
const SOURCE_LIMIT=24000;
const AUTOSAVE_DELAY_MS=1100;
const SOURCE_FIELD_IDS=['topicBriefNotes','explanationNotes','formulaNotes','exampleNotes','trickNotes','solveNotes'];
const SOURCE_COUNT_IDS={topicBriefNotes:'topicBriefCount',explanationNotes:'explanationCount',formulaNotes:'formulaCount',exampleNotes:'exampleCount',trickNotes:'trickCount',solveNotes:'solveCount'};
const AUTHORING_STEPS=[
  {label:'Topic brief',kicker:'01 · TOPIC BRIEF',title:'Set the lesson brief',description:'Start with the course context and a concise description of what learners should understand.',fieldId:'topicBriefNotes'},
  {label:'Explanation',kicker:'02 · EXPLANATION',title:'Explain the central idea',description:'Build the concept in a clear sequence, defining unfamiliar terms as you go.',fieldId:'explanationNotes'},
  {label:'Formulas & key terms',kicker:'03 · FORMULAS & KEY TERMS',title:'Make the notation precise',description:'Capture formulas, symbols, units, definitions, and the conditions where they apply.',fieldId:'formulaNotes'},
  {label:'Worked examples',kicker:'04 · WORKED EXAMPLES',title:'Show the method in action',description:'Give learners one or more worked examples they can follow and reviewers can verify.',fieldId:'exampleNotes'},
  {label:'Tricks & shortcuts',kicker:'05 · TRICKS & SHORTCUTS',title:'Add a memorable cue',description:'Share useful patterns and mnemonics, including any limits or common pitfalls.',fieldId:'trickNotes'},
  {label:'How to solve',kicker:'06 · HOW TO SOLVE',title:'Turn the method into steps',description:'Finish with an ordered method learners can apply independently.',fieldId:'solveNotes'},
];
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
function roleCanAuthor(){return currentRole==='author'||currentRole==='owner'}
function roleCanReview(){return currentRole==='reviewer'||currentRole==='owner'}
function canUseSharedQueue(){return roleCanAuthor()&&sharedQueueReady}
function isRoleAssignmentError(){return workspaceError==='functions/permission-denied'||workspaceError==='permission-denied'}
function setDraftSaveStatus(message,state='info'){
  const status=document.getElementById('sourceSaveStatus');
  if(!status)return;
  status.dataset.state=state;
  status.innerHTML=`<i aria-hidden="true"></i>${esc(message)}`;
}
function updateSourceCounters(){
  for(const id of SOURCE_FIELD_IDS){
    const field=document.getElementById(id),count=document.getElementById(SOURCE_COUNT_IDS[id]);
    const length=field?.value?.length||0;
    if(count)count.textContent=`${length.toLocaleString()} chars`;
  }
  const payloadLength=lessonFormPayload().source.length,total=document.getElementById('sourceTotalCount'),meter=document.getElementById('sourceMeter'),fill=document.getElementById('sourceMeterFill');
  const overLimit=payloadLength>SOURCE_LIMIT;
  if(total){total.textContent=`${payloadLength.toLocaleString()} / ${SOURCE_LIMIT.toLocaleString()} characters`;total.classList.toggle('over-limit',overLimit)}
  if(meter){meter.classList.toggle('over-limit',overLimit);meter.setAttribute('aria-valuenow',String(Math.min(payloadLength,SOURCE_LIMIT)))}
  if(fill)fill.style.width=`${Math.min(100,payloadLength/SOURCE_LIMIT*100)}%`;
  return {payloadLength,overLimit};
}
function renderAuthoringStep(){
  const step=AUTHORING_STEPS[authoringStep]||AUTHORING_STEPS[0],lastIndex=AUTHORING_STEPS.length-1;
  for(let index=0;index<AUTHORING_STEPS.length;index++){
    const panel=document.getElementById(`authorStep${index+1}`),nav=document.getElementById(`authorStepNav${index+1}`);
    if(panel)panel.hidden=index!==authoringStep;
    if(nav){nav.disabled=index>authoringStep;nav.classList.toggle('active',index===authoringStep);nav.classList.toggle('complete',index<authoringStep);nav.setAttribute('aria-current',index===authoringStep?'step':'false')}
  }
  const kicker=document.getElementById('authorStepKicker'),title=document.getElementById('authorStepTitle'),description=document.getElementById('authorStepDescription'),counter=document.getElementById('wizardStepCounter'),progress=document.getElementById('authoringProgress');
  if(kicker)kicker.textContent=step.kicker;
  if(title)title.textContent=step.title;
  if(description)description.textContent=step.description;
  if(counter)counter.textContent=`Step ${authoringStep+1} of ${AUTHORING_STEPS.length}`;
  if(progress)progress.style.width=`${authoringStep/(lastIndex||1)*100}%`;
  const previous=document.getElementById('authorStepPrev'),next=document.getElementById('authorStepNext'),create=document.getElementById('createLessonButton');
  if(previous)previous.hidden=authoringStep===0;
  if(next){next.hidden=authoringStep===lastIndex;next.innerHTML=authoringStep<lastIndex?`Next: ${esc(AUTHORING_STEPS[authoringStep+1].label)} <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>`:'Next'}
  const mayCreateOrBuild=canUseSharedQueue()&&(!currentId||currentScope==='private'||canEditCurrentLesson());
  if(create)create.hidden=authoringStep!==lastIndex||!mayCreateOrBuild;
  const error=document.getElementById('authoringStepError');if(error)error.textContent='';
}
function validateAuthoringStep(step){
  if(step!==0)return true;
  if(!document.getElementById('topic').value.trim()){
    const message='Add a lesson topic before moving to the next step.';
    const error=document.getElementById('authoringStepError');if(error)error.textContent=message;
    toast(message);document.getElementById('topic').focus();return false;
  }
  const hasBrief=document.getElementById('topicBriefNotes').value.trim().length>0;
  const isExistingLegacyDraft=Boolean(currentId&&lessonFormPayload().source.length>=20);
  if(!hasBrief&&!isExistingLegacyDraft){
    const message='Add a short topic brief before continuing to the explanation.';
    const error=document.getElementById('authoringStepError');if(error)error.textContent=message;
    toast(message);document.getElementById('topicBriefNotes').focus();return false;
  }
  return true;
}
function goToAuthoringStep(target){
  const next=Number(target);
  if(!Number.isInteger(next)||next<0||next>=AUTHORING_STEPS.length||next>authoringStep+1)return false;
  if(next>authoringStep&&!validateAuthoringStep(authoringStep))return false;
  const previous=authoringStep;authoringStep=next;renderAuthoringStep();
  if(next>previous){const field=document.getElementById(AUTHORING_STEPS[next].fieldId);if(field)field.focus()}
  return true;
}
function canEditCurrentLesson(){
  if(currentScope==='private')return Boolean(currentUser&&currentId);
  const lesson=lessons.find(item=>item.id===currentId&&item._scope==='internal');
  return Boolean(lesson&&roleCanAuthor()&&(currentRole==='owner'||lesson.createdByUid===currentUser?.uid)&&['draft','changes_requested'].includes(lesson.status));
}
function statusLabel(lesson){
  if(!lesson)return 'Internal draft';
  if(lesson._scope==='private')return 'Private legacy draft';
  return ({draft:'Draft',in_review:'In review',changes_requested:'Changes requested',approved:'Approved · internal'})[lesson.status]||'Internal draft';
}
function renderLessons(){
  const sharedCount=lessons.filter(item=>item._scope==='internal').length;
  document.getElementById('lessonCount').textContent=sharedCount;
  document.getElementById('statLessons').innerHTML=sharedCount+'<small>shared drafts</small>';
  const el=document.getElementById('modules');
  if(!lessons.length){
    const createButton=canUseSharedQueue()?'<button class="primary" type="button" onclick="openBuilder()">Create an internal draft <span aria-hidden="true">→</span></button>':'';
    const roleError=isRoleAssignmentError();
    const emptyTitle=sharedQueueReady?'No shared lesson drafts yet.':roleError?'Internal role assignment required.':'Internal workspace service is unavailable.';
    const emptyCopy=sharedQueueReady?'Authors can create drafts for the team. Reviewers can inspect them before internal approval.':roleError?'Your account needs an author, reviewer, or owner role in allowedUsers before it can access the shared queue. Existing private drafts are still kept in your account.':'The shared queue needs its callable functions and Firestore read rules deployed. Existing private drafts are still kept in your account.';
    el.innerHTML=`<div class="empty"><div class="empty-art" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H20v16H7.5A2.5 2.5 0 0 0 5 21V5.5Z"/><path d="M5 17a2.5 2.5 0 0 1 2.5-2.5H20M9 7h7M9 10h6"/><path d="M12 13v5m-2.5-2.5h5"/></svg></div><div class="empty-copy"><span class="eyebrow">INTERNAL WORKSPACE</span><strong>${esc(emptyTitle)}</strong><p>${esc(emptyCopy)}</p></div>${createButton}</div>`;
    return;
  }
  el.innerHTML=lessons.map((l,i)=>{
    const topic=l.topic||'Untitled topic',status=statusLabel(l),scopeLabel=l._scope==='internal'?'TEAM QUEUE':'PRIVATE LEGACY',author=l.authorEmail||'';
    return `<article class="module" tabindex="0" role="button" aria-label="Open ${esc(status)} lesson: ${esc(topic)}" onclick="openLesson('${esc(l.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openLesson('${esc(l.id)}')}"><div class="thumb c${i%6+1}">${illustration(i)}<span class="type">ACADEMIC LESSON</span></div><div class="module-body"><div class="module-status-row"><span class="status-chip status-${esc(l.status||'private')}">${esc(status)}</span><span class="scope-chip">${scopeLabel}</span></div><h3>${esc(topic)}</h3><div class="meta"><span>${esc(l.program||'Program')} · ${esc(l.branch||l.subject||'Subject')}</span><span>${author?`By ${esc(author)}`:'Saved'}</span></div><div class="module-footer"><span>${esc(l.module||'Module not set')}</span><span>${(l.slides||[]).length} scenes · ${esc(l.date||'Saved')}</span></div></div></article>`;
  }).join('');
}
function userLessons(){if(!currentUser)throw new Error('Sign in first');return db.collection('users').doc(currentUser.uid).collection('lessons')}
function internalLessons(){if(!db)throw new Error('Firestore is not ready');return db.collection('internalLessons')}
async function refreshLessons(){
  if(!currentUser||!db)return;
  try{
    sharedQueueReady=false;
    const privateSnapshot=await userLessons().orderBy('updatedAt','desc').limit(100).get();
    let sharedSnapshot={docs:[]};
    if(currentRole){
      try{sharedSnapshot=await internalLessons().orderBy('updatedAt','desc').limit(100).get();sharedQueueReady=true;workspaceError=''}
      catch(error){workspaceError=error.code||'firestore/permission-denied';console.error('Shared lesson queue unavailable:',workspaceError)}
    }
    const mapSnapshot=(snapshot,scope)=>snapshot.docs.map(doc=>{
      const data=doc.data(),created=data.createdAt?.toDate?.(),updated=data.updatedAt?.toMillis?.()||created?.getTime?.()||0;
      return {...data,id:doc.id,_scope:scope,_updatedMillis:updated,date:created?created.toLocaleDateString('en-IN',{day:'numeric',month:'short'}):'Just now'};
    });
    lessons=[...mapSnapshot(sharedSnapshot,'internal'),...mapSnapshot(privateSnapshot,'private')].sort((a,b)=>(b._updatedMillis||0)-(a._updatedMillis||0));
    renderLessons();updateWorkflowControls();
  }catch(e){console.error(e);toast('Could not load private drafts. Check Firebase sign-in and Firestore rules.')}
}
function updateWorkflowControls(){
  const lesson=lessons.find(item=>item.id===currentId&&item._scope===currentScope);
  const status=lesson?.status||'draft',state=document.getElementById('workflowState'),hint=document.getElementById('workflowHint');
  const share=document.getElementById('shareDraftButton'),submit=document.getElementById('submitReviewButton');
  const review=document.getElementById('reviewControls'),summary=document.getElementById('reviewSummaryDisplay');
  const privateDraft=currentScope==='private'&&Boolean(currentId);
  const newDraft=!currentId;
  const canEdit=newDraft?roleCanAuthor():canEditCurrentLesson(),controlsEditable=canEdit&&!animationRequestActive&&!workflowActionActive;
  if(state){state.dataset.status=privateDraft?'private':status;state.textContent=newDraft?(roleCanAuthor()?'New draft':'Read-only'):privateDraft?'Private legacy':statusLabel(lesson)}
  if(share)share.hidden=!(privateDraft&&canUseSharedQueue()&&Boolean(functionsClient)&&!animationRequestActive&&!workflowActionActive);
  if(submit)submit.hidden=!(currentScope==='internal'&&lesson&&controlsEditable&&(status==='draft'||status==='changes_requested'));
  const mayReview=Boolean(currentScope==='internal'&&lesson&&status==='in_review'&&roleCanReview()&&lesson.createdByUid!==currentUser?.uid&&!workflowActionActive);
  if(review)review.hidden=!mayReview;
  if(summary){const showSummary=Boolean(lesson?.reviewSummary);summary.hidden=!showSummary;summary.textContent=showSummary?`Reviewer note: ${lesson.reviewSummary}`:''}
  if(hint){
    if(isRoleAssignmentError())hint.textContent='Your sign-in works, but this account has no internal role. Ask an owner to add allowedUsers/{uid} with role author, reviewer, or owner in the vriddhi-studio project, then sign in again.';
    else if(workspaceError&&!sharedQueueReady)hint.textContent='Shared internal services or Firestore read rules are unavailable. Existing private drafts remain accessible; deploy the callable functions and Firestore rules to enable the team queue.';
    else if(newDraft)hint.textContent=canUseSharedQueue()?'New lessons are shared team drafts. Submit them for independent review when ready.':'Your role is read-only or the shared workspace is not ready; ask an owner to check your role and deployment.';
    else if(privateDraft)hint.textContent='This older draft is private to your account. Copy it into the shared queue when you want a teammate to review it.';
    else if(status==='draft')hint.textContent=canEdit?'Edit the draft, then submit it for an independent review.':'This author’s draft is visible to the team but only the author or an owner can edit it.';
    else if(status==='in_review')hint.textContent=mayReview?'Review the source notes, formulas, examples and scenes. You cannot approve your own draft.':'This draft is in the review queue. A different reviewer must approve it or request changes.';
    else if(status==='changes_requested')hint.textContent=canEdit?'Address the reviewer note; saving edits returns the lesson to draft.':'The author must address the reviewer note before resubmitting.';
    else if(status==='approved')hint.textContent='Approved internally. This prototype has no customer-facing publishing route.';
    if(lesson?.reviewSummary&&(status==='changes_requested'||status==='draft'))hint.textContent+=` Reviewer note: ${lesson.reviewSummary}`;
  }
  const reviewerNote=document.getElementById('internalReviewSummary');
  if(reviewerNote){reviewerNote.disabled=!mayReview;if(mayReview&&document.activeElement!==reviewerNote)reviewerNote.value=lesson.reviewSummary||'';}
  for(const id of ['program','branch','subject','module','topic',...SOURCE_FIELD_IDS]){
    const field=document.getElementById(id);if(field)field.disabled=!controlsEditable;
  }
  const buildButton=document.getElementById('createLessonButton');
  const mayCreateOrBuild=canUseSharedQueue()&&(!currentId||currentScope==='private'||canEditCurrentLesson());
  if(buildButton)buildButton.hidden=authoringStep!==AUTHORING_STEPS.length-1||!mayCreateOrBuild;
  const draftScopeLabel=document.getElementById('draftScopeLabel');
  if(draftScopeLabel)draftScopeLabel.textContent=privateDraft?'Private legacy draft · copy to team queue':currentScope==='internal'&&currentId?'Shared team draft · internal review only':'Shared team draft · not published to customers';
  const scriptToggle=document.getElementById('scriptToggle');
  if(scriptToggle&&!document.getElementById('scriptList').classList.contains('open'))scriptToggle.textContent=controlsEditable?'Edit script':'Review script';
  const builderTitle=document.getElementById('builderTitle');
  if(builderTitle)builderTitle.textContent=currentId?`Lesson · ${lesson?.topic||'Untitled'}`:'New internal lesson';
  syncScriptEditability();
  updateAnimationControls();
}
function syncScriptEditability(){
  const panel=document.getElementById('scriptList');
  if(!panel||typeof panel.querySelectorAll!=='function')return;
  const editable=canEditCurrentLesson()&&!animationRequestActive&&!workflowActionActive;
  panel.querySelectorAll('input,textarea').forEach(field=>{field.readOnly=!editable});
}
function resetForm(){

  document.getElementById('program').value='B.Com';
  for(const id of ['branch','subject','module','topic',...SOURCE_FIELD_IDS])document.getElementById(id).value='';
  authoringStep=0;renderAuthoringStep();updateSourceCounters();
  setDraftSaveStatus('New draft · saved when created','info');
  document.getElementById('deckTitle').textContent='Lesson preview';
  document.getElementById('deckSub').textContent='Your seven-slide sequence appears here.';
  document.getElementById('slideIndex').textContent='No slides yet';
  document.getElementById('stage').classList.add('empty-stage');
  document.getElementById('stage').style.background='';
  document.getElementById('stage').style.color='';
  document.getElementById('stage').dataset.template=currentTemplate;
  document.getElementById('stageContent').innerHTML='<div class="slide-kicker">YOUR LESSON PREVIEW</div><h2>One clear idea at a time.</h2><p>Start with the topic brief, move through each source section, then build a review-ready lesson.</p><div class="number">01</div>';
  document.getElementById('slideStrip').innerHTML='<button class="slide-mini" type="button" disabled>Title</button><button class="slide-mini" type="button" disabled>Core idea</button><button class="slide-mini" type="button" disabled>Steps</button><button class="slide-mini" type="button" disabled>Formula</button><button class="slide-mini" type="button" disabled>Example</button><button class="slide-mini" type="button" disabled>Memory cue</button><button class="slide-mini" type="button" disabled>Recap</button>';
  document.getElementById('scriptList').classList.remove('open');
  document.getElementById('scriptList').innerHTML='<div class="empty-script">Arrange your notes first. Then edit the slide headings and narration text here.</div>';
  document.getElementById('scriptToggle').textContent='Edit script';
  document.getElementById('buildHint').textContent=roleCanAuthor()?'The new lesson will be shared with the internal team.':'Your role does not include authoring access.';
  const consent=document.getElementById('aiConsent');
  if(consent)consent.checked=false;
  const status=document.getElementById('animationStatus');
  if(status)status.textContent='Save the shared draft first. AI output must be reviewed before it can be approved internally.';
  updateWorkflowControls();
}
async function openBuilder(){
  if(!canUseSharedQueue()){toast('An internal author role and the deployed shared workspace are required to create a draft.');return}
  if(animationRequestActive||workflowActionActive){toast('Wait for the current action to finish before opening another draft.');return}
  try{await flushCurrentSave()}catch(error){console.error('Lesson save before creating a draft failed:',error.code||'unknown');toast('Could not save the current draft. Please try again.');return}
  stopPlay();stopSceneAnimation();editorRevision++;editorDirty=false;currentId=null;currentScope='internal';deck=[];slide=0;resetForm();
  document.getElementById('builder').classList.add('open');document.body.style.overflow='hidden';updateWorkflowControls();
}
async function closeBuilder(){
  if(animationRequestActive||workflowActionActive){toast('Wait for the current action to finish before closing this draft.');return}
  stopPlay();stopSceneAnimation();
  try{await flushCurrentSave()}catch(error){console.error('Lesson save on close failed:',error.code||'unknown');toast('Could not save the latest draft edits. The editor is still open.');return}
  document.getElementById('builder').classList.remove('open');document.body.style.overflow='';
}
async function openLesson(id){
  const lesson=lessons.find(x=>x.id===id);
  if(!lesson)return;
  if(animationRequestActive||workflowActionActive){toast('Wait for the current action to finish before opening another lesson.');return}
  stopPlay();stopSceneAnimation();
  try{await flushCurrentSave()}catch(error){console.error('Lesson save before navigation failed:',error.code||'unknown');toast('Could not save the previous draft. It is still open; please try again.');return}
  editorRevision++;editorDirty=false;
  currentId=id;currentScope=lesson._scope||'private';
  deck=lesson.slides||[];
  slide=0;
  document.getElementById('program').value=lesson.program||'B.Com';
  document.getElementById('branch').value=lesson.branch||'';
  document.getElementById('subject').value=lesson.subject||'';
  document.getElementById('module').value=lesson.module||'';
  document.getElementById('topic').value=lesson.topic||'';
  populateSourceFields(lesson.source||'');
  authoringStep=0;renderAuthoringStep();updateSourceCounters();
  setDraftSaveStatus('Loaded · no pending changes','saved');
  document.getElementById('deckTitle').textContent=lesson.topic||'Lesson preview';
  document.getElementById('deckSub').textContent=[lesson.program,lesson.branch,lesson.subject,lesson.module].filter(Boolean).join(' · ');
  document.getElementById('buildHint').textContent=currentScope==='internal'?'Shared internal draft · edits are role-controlled':'Private legacy draft · this copy stays in your account';
  document.getElementById('scriptList').classList.remove('open');
  document.getElementById('scriptToggle').textContent='Edit script';
  const consent=document.getElementById('aiConsent');
  if(consent)consent.checked=false;
  const status=document.getElementById('animationStatus');
  if(status)status.textContent=deck.some(s=>s.animation)?'Animated storyboard saved. Review every scene and formula before teaching.':'Add an animated explanation from your notes when you are ready.';
  document.getElementById('builder').classList.add('open');
  document.body.style.overflow='hidden';
  renderDeck();updateWorkflowControls();
}
function splitSource(text){
  const sections={brief:[],concept:[],formula:[],example:[],trick:[],steps:[],other:[]};
  const labels={
    brief:/^(topic brief|lesson brief|learning objectives?|objectives?)\s*:?\s*/i,
    concept:/^(concept(?:\s*\/\s*explanations?)?|explanations?|overview|definition|meaning)\s*:?\s*/i,
    formula:/^(formulas?(?:\s*\/\s*(?:key terms?|important terms?))?|equations?|key terms?|important terms?)\s*:?\s*/i,
    example:/^(worked examples?|examples?|application|problem)\s*:?\s*/i,
    trick:/^(tricks?(?:\s*\/\s*(?:shortcuts?|memory cues?))?|shortcuts?|memory cues?|memory tricks?|mnemonics?|tips?)\s*:?\s*/i,
    steps:/^(steps?|process|procedure|how it works|how to solve)\s*:?\s*/i,
  };
  let active='other';
  for(let line of String(text||'').split(/\r?\n/).map(value=>value.trim()).filter(Boolean)){
    for(const key in labels){if(labels[key].test(line)){active=key;line=line.replace(labels[key],'').trim();break}}
    if(line)sections[active].push(line);
  }
  return sections;
}
function populateSourceFields(source){
  const sections=splitSource(source);
  document.getElementById('topicBriefNotes').value=sections.brief.join('\n\n');
  document.getElementById('explanationNotes').value=[...sections.concept,...sections.other].join('\n\n');
  document.getElementById('formulaNotes').value=sections.formula.join('\n\n');
  document.getElementById('exampleNotes').value=sections.example.join('\n\n');
  document.getElementById('trickNotes').value=sections.trick.join('\n\n');
  document.getElementById('solveNotes').value=sections.steps.join('\n\n');
}
function getSentences(text){return (String(text||'').replace(/\s+/g,' ').match(/[^.!?]+[.!?]?/g)||[]).map(x=>x.trim()).filter(Boolean)}function summary(parts,n=3){return getSentences(parts.join(' ')).slice(0,n).join(' ').trim()}
function createSlides(data){
  const source=splitSource(data.source);
  const concept=summary(source.concept.length?source.concept:source.brief.length?source.brief:source.other.length?source.other:source.steps,3)||data.source.slice(0,420);
  const steps=(source.steps.length?source.steps:getSentences(source.concept.join(' '))).slice(0,4);
  const formula=summary(source.formula,5)||'No formula or key terms were supplied in the source notes.';
  const example=summary(source.example,5)||'No worked example was supplied in the source notes.';
  const trick=summary(source.trick,4)||'No shortcut or memory cue was supplied in the source notes.';
  const recap=summary([...source.brief,...source.concept,...source.formula,...source.example,...source.trick,...source.steps,...source.other],2)||concept;
  const course=data.program+(data.branch?' · '+data.branch:'');
  return [
    {kind:'intro',kicker:course,title:data.topic,body:summary(source.brief,2)||[data.subject,data.module].filter(Boolean).join('  ·  ')||'A focused concept lesson',steps:[]},
    {kind:'concept',kicker:'THE CORE IDEA',title:'Start with the main idea',body:concept,steps:[]},
    {kind:'steps',kicker:'BREAK IT DOWN',title:'How it works',body:'Follow the explanation one step at a time.',steps},
    {kind:'formula',kicker:'FORMULA & KEY TERMS',title:'Keep this close',body:formula,steps:[]},
    {kind:'example',kicker:'APPLY THE IDEA',title:'A worked example',body:example,steps:[]},
    {kind:'trick',kicker:'REMEMBER IT',title:'Shortcut or memory cue',body:trick,steps:[]},
    {kind:'recap',kicker:'QUICK RECAP',title:'What to remember',body:recap,steps:[]},
  ];
}
async function generateDeck(){
  if(animationRequestActive||workflowActionActive){toast('Wait for the current action to finish before building this lesson.');return}
  const payload=lessonFormPayload(),sourceLength=payload.source.length;
  if(!canUseSharedQueue()){toast('The shared internal queue is unavailable or your role cannot author drafts.');return}
  if(!functionsClient){toast('The internal lesson service is not deployed yet.');return}
  if(!payload.topic){toast('Add a lesson topic on the first step.');goToAuthoringStep(0);document.getElementById('topic').focus();return}
  if(sourceLength<20){toast('Add a topic brief or a few sentences of source material before creating the draft.');const firstFilled=SOURCE_FIELD_IDS.find(id=>document.getElementById(id).value.trim());const fieldId=firstFilled||'topicBriefNotes';const step=AUTHORING_STEPS.findIndex(item=>item.fieldId===fieldId);goToAuthoringStep(Math.max(0,step));document.getElementById(fieldId).focus();return}
  if(sourceLength>SOURCE_LIMIT){updateSourceCounters();toast(`Source material is ${sourceLength.toLocaleString()} characters. Keep it within ${SOURCE_LIMIT.toLocaleString()} characters to create the draft.`);return}
  stopPlay();stopSceneAnimation();cancelScheduledSave();workflowActionActive=true;updateWorkflowControls();
  const btn=document.getElementById('createLessonButton');
  if(btn){btn.disabled=true;btn.innerHTML='Building your lesson…'}
  setDraftSaveStatus('Preparing lesson…','saving');
  try{
    if(activeSave)await activeSave;
    const slides=createSlides(payload);
    let id,status='draft';
    const existingShared=currentScope==='internal'&&Boolean(currentId);
    if(existingShared){
      id=currentId;
      const response=await functionsClient.httpsCallable('saveInternalLesson')({...payload,id,slides});
      status=response.data.status||lessons.find(item=>item.id===id&&item._scope==='internal')?.status||'draft';
    }else{
      const response=await functionsClient.httpsCallable('createInternalLesson')({...payload,slides});
      id=response.data.id;
    }
    const now=new Date();editorRevision++;editorDirty=false;currentId=id;currentScope='internal';deck=slides;slide=0;
    let local=lessons.find(item=>item.id===id&&item._scope==='internal');
    if(local){Object.assign(local,payload,{slides,status,_updatedMillis:now.getTime()})}
    else{local={...payload,slides,id,status,createdByUid:currentUser.uid,authorEmail:currentUser.email||'',_scope:'internal',date:now.toLocaleDateString('en-IN',{day:'numeric',month:'short'}),_updatedMillis:now.getTime()};lessons.unshift(local)}
    renderLessons();
    document.getElementById('buildHint').textContent='Saved to the shared review queue. Your author draft is ready for an independent reviewer.';
    setDraftSaveStatus('Saved to shared queue','saved');
    document.getElementById('deckTitle').textContent=payload.topic;
    document.getElementById('deckSub').textContent=[payload.program,payload.branch,payload.subject,payload.module].filter(Boolean).join(' · ');
    document.getElementById('scriptList').classList.remove('open');document.getElementById('scriptToggle').textContent='Edit script';
    setAnimationStatus('Draft saved. Review the slides, then submit it for independent approval. Gemini animation is optional.');
    renderDeck();updateSourceCounters();updateWorkflowControls();
    toast(existingShared?'Lesson draft updated. Review it, then submit it for independent approval.':'Shared internal draft created. Review it, then submit it for independent approval.');
  }catch(error){
    console.error('Internal lesson creation or update failed:',error.code||'unknown');
    setDraftSaveStatus('Not saved · retry when ready','error');
    toast(error.message||'Could not save the internal lesson draft. Your entered content remains in the editor.');
  }finally{
    workflowActionActive=false;
    if(btn){btn.disabled=false;btn.innerHTML='Create draft &amp; build preview <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>'}
    updateWorkflowControls();
  }
}
async function sharePrivateDraft(){
  if(currentScope!=='private'||!currentId||!deck.length){toast('Open one of your existing private drafts first.');return}
  if(animationRequestActive||workflowActionActive){toast('Wait for the current action to finish before sharing this draft.');return}
  if(!canUseSharedQueue()||!functionsClient){toast('An internal author role, Firestore access and the workspace functions are required to share this draft.');return}
  workflowActionActive=true;updateWorkflowControls();
  try{
    await flushCurrentSave();
    const payload={...lessonFormPayload(),slides:JSON.parse(JSON.stringify(deck))};
    const old=lessons.find(item=>item.id===currentId&&item._scope==='private');
    if(old?.animationProvider==='gemini')payload.animationProvider='gemini';
    if(old?.animatedStoryboardVersion===1)payload.animatedStoryboardVersion=1;
    const response=await functionsClient.httpsCallable('createInternalLesson')(payload);
    const now=new Date(),id=response.data.id;
    const shared={...payload,id,status:'draft',createdByUid:currentUser.uid,authorEmail:currentUser.email||'',_scope:'internal',date:now.toLocaleDateString('en-IN',{day:'numeric',month:'short'}),_updatedMillis:now.getTime()};
    editorRevision++;editorDirty=false;lessons.unshift(shared);currentId=id;currentScope='internal';renderLessons();updateWorkflowControls();
    toast('Copied to the shared internal queue. Your original private draft remains in your account.');
  }catch(error){console.error('Sharing legacy lesson failed:',error.code||'unknown');toast(error.message||'Could not copy this draft to the team queue.')}
  finally{workflowActionActive=false;updateWorkflowControls()}
}
async function submitForInternalReview(){
  if(currentScope!=='internal'||!currentId||!canEditCurrentLesson()||animationRequestActive||workflowActionActive){toast('Only the author or an owner can submit this shared draft.');return}
  workflowActionActive=true;updateWorkflowControls();
  try{
    await flushCurrentSave();
    const response=await functionsClient.httpsCallable('transitionInternalLesson')({id:currentId,action:'submit_for_review'});
    const lesson=lessons.find(item=>item.id===currentId&&item._scope==='internal');
    if(lesson)lesson.status=response.data.status;
    renderLessons();updateWorkflowControls();
    toast('Draft submitted. A different reviewer must approve it.');
  }catch(error){console.error('Internal review submission failed:',error.code||'unknown');toast(error.message||'Could not submit this draft for review.')}
  finally{workflowActionActive=false;updateWorkflowControls()}
}
async function reviewInternalLesson(action){
  if(!['approve','request_changes'].includes(action)){toast('Choose approve or request changes.');return}
  const lesson=lessons.find(item=>item.id===currentId&&item._scope==='internal');
  if(currentScope!=='internal'||!currentId||!roleCanReview()||workflowActionActive||animationRequestActive||!lesson||lesson.status!=='in_review'||lesson.createdByUid===currentUser?.uid){toast('A different internal reviewer must review a draft that is in the queue.');return}
  const reviewSummary=document.getElementById('internalReviewSummary').value.trim();
  if(action==='request_changes'&&reviewSummary.length<5){toast('Add a short reviewer note before requesting changes.');document.getElementById('internalReviewSummary').focus();return}
  workflowActionActive=true;updateWorkflowControls();
  try{
    const response=await functionsClient.httpsCallable('transitionInternalLesson')({id:currentId,action,reviewSummary});
    const lesson=lessons.find(item=>item.id===currentId&&item._scope==='internal');
    if(lesson){lesson.status=response.data.status;lesson.reviewSummary=reviewSummary;lesson.reviewedByUid=currentUser.uid;lesson.reviewedByEmail=currentUser.email||''}
    renderLessons();updateWorkflowControls();
    toast(action==='approve'?'Lesson approved for internal use. It is not published to customers.':'Changes requested. The author can edit and resubmit the draft.');
  }catch(error){console.error('Internal lesson review failed:',error.code||'unknown');toast(error.message||'Could not save the review decision.')}
  finally{workflowActionActive=false;updateWorkflowControls()}
}
function updateAnimationControls(){
  const consent=document.getElementById('aiConsent');
  const animateButton=document.getElementById('animateButton');
  const exportButton=document.getElementById('exportVideoButton');
  const hasAnimation=deck.some(item=>item.animation&&item.animation.visualType);
  const canGenerate=Boolean(roleCanAuthor()&&canEditCurrentLesson()&&!animationRequestActive&&!workflowActionActive);
  if(animateButton){
    animateButton.disabled=!deck.length||!currentId||!currentUser||!functionsClient||!canGenerate||animationRequestActive||!consent||!consent.checked;
    animateButton.innerHTML=`${hasAnimation?'Refresh animated explanation':'Create animated explanation'} <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 10 7-10 7V5Z"/></svg>`;
  }
  if(exportButton)exportButton.disabled=animationRequestActive||!deck.length||typeof window.MediaRecorder!=='function';
  if(deck.length&&!functionsClient)setAnimationStatus('Firebase Functions is unavailable in this build. Check that the Functions SDK is loaded before trying Gemini.');
  else if(deck.length&&currentScope==='internal'&&!sharedQueueReady&&workspaceError)setAnimationStatus('The shared internal workspace is unavailable. Check that the callable functions and Firestore rules are deployed.');
  else if(deck.length&&(animationRequestActive||workflowActionActive))return;
  else if(deck.length&&!canGenerate)setAnimationStatus('Only the draft author or an owner can generate or refresh this explanation.');
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
  const sourceSections=[
    ['TOPIC BRIEF',document.getElementById('topicBriefNotes').value.trim()],
    ['EXPLANATION',document.getElementById('explanationNotes').value.trim()],
    ['FORMULA',document.getElementById('formulaNotes').value.trim()],
    ['WORKED EXAMPLE',document.getElementById('exampleNotes').value.trim()],
    ['TRICK',document.getElementById('trickNotes').value.trim()],
    ['STEPS',document.getElementById('solveNotes').value.trim()],
  ];
  const source=sourceSections.filter(([,value])=>value).map(([label,value])=>`${label}:\n${value}`).join('\n\n');
  return {program:document.getElementById('program').value,branch:document.getElementById('branch').value.trim(),subject:document.getElementById('subject').value.trim(),module:document.getElementById('module').value.trim(),topic:document.getElementById('topic').value.trim(),source};
}
function setAnimationStatus(message){const status=document.getElementById('animationStatus');if(status)status.textContent=message}
async function generateAnimatedLesson(){
  const consent=document.getElementById('aiConsent');
  if(!consent||!consent.checked){toast('Confirm that these notes can be sent to Gemini first.');return}
  if(!deck.length||!currentId){toast('Arrange and save this shared lesson before creating its animation.');return}
  if(!currentUser||!functionsClient){toast('The internal Firebase Functions service is not available yet.');return}
  if(!roleCanAuthor()||!canEditCurrentLesson()||workflowActionActive){toast('Only the draft author or an owner can generate this explanation.');return}
  if(animationRequestActive){toast('An animated explanation is already being generated.');return}
  const payload=lessonFormPayload(),button=document.getElementById('animateButton'),sourceLength=payload.source.length;
  if(sourceLength<20){toast('Add a topic brief or a few sentences of prepared notes first.');const firstFilled=SOURCE_FIELD_IDS.find(id=>document.getElementById(id).value.trim())||'topicBriefNotes';const step=AUTHORING_STEPS.findIndex(item=>item.fieldId===firstFilled);goToAuthoringStep(Math.max(0,step));document.getElementById(firstFilled).focus();return}
  if(sourceLength>SOURCE_LIMIT){updateSourceCounters();toast(`Source material is over the ${SOURCE_LIMIT.toLocaleString()} character limit. Shorten it before generating.`);return}
  const targetId=currentId,targetScope=currentScope,targetUid=currentUser.uid,baseDeck=JSON.parse(JSON.stringify(deck));
  animationRequestActive=true;updateWorkflowControls();button.disabled=true;button.textContent='Building your animated explanation…';
  setDraftSaveStatus('Saving source before AI generation…','saving');
  setAnimationStatus(sourceLength>=12000?`Gemini is preparing a large structured source (${sourceLength.toLocaleString()} characters). This can take longer; the draft stays open while it runs.`:'Gemini is shaping your source into a simple story and scene plan. This can take a little while.');
  let sourceSaved=false;
  try{
    await flushCurrentSave();sourceSaved=true;
    setAnimationStatus('Source saved. Sending the six-part brief to Gemini and building the storyboard…');
    const response=await functionsClient.httpsCallable('generateAnimatedLesson')(payload);
    const animatedDeck=mergeStoryboard(baseDeck,response.data);
    const savePayload={...payload,id:targetId,slides:animatedDeck,animationProvider:'gemini',animatedStoryboardVersion:1};
    let saveResult;
    if(targetScope==='internal')saveResult=await functionsClient.httpsCallable('saveInternalLesson')(savePayload);
    else{
      const {id:ignoredId,...privatePayload}=savePayload;
      await db.collection('users').doc(targetUid).collection('lessons').doc(targetId).update({...privatePayload,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
      saveResult={data:{status:'private'}};
    }
    const saved=lessons.find(item=>item.id===targetId&&item._scope===targetScope);
    if(saved)Object.assign(saved,payload,{slides:animatedDeck,animationProvider:'gemini',animatedStoryboardVersion:1,status:saveResult.data.status||saved.status});
    if(currentId===targetId&&currentScope===targetScope&&currentUser?.uid===targetUid){
      deck=animatedDeck;
      document.getElementById('deckTitle').textContent=response.data.title||payload.topic;
      document.getElementById('deckSub').textContent=[payload.program,payload.branch,payload.subject,payload.module].filter(Boolean).join(' · ');
      document.getElementById('buildHint').textContent=targetScope==='internal'?'Animated storyboard saved to the shared internal draft':'Animated storyboard saved to your private draft';
      setDraftSaveStatus('Animated storyboard saved','saved');
      consent.checked=false;
      renderDeck();updateWorkflowControls();
      setAnimationStatus('Your seven-scene explainer is ready. Review every explanation, formula and example, then send it to a different reviewer.');
    }
    toast('Animated draft updated. Review every scene before submitting it to the team.');
  }catch(error){
    console.error('Animated lesson request failed:',error.code||'unknown');
    const message=error&&error.message?error.message:'Could not create the animated explanation.';
    if(currentId===targetId&&currentScope===targetScope){setAnimationStatus(message);setDraftSaveStatus(sourceSaved?'Draft saved · retry generation when ready':'Source save failed · your editor content remains open',sourceSaved?'saved':'error')}
    toast(message.length>150?'Could not create the animated explanation. Check the backend setup and try again.':message);
  }finally{
    animationRequestActive=false;
    updateWorkflowControls();
  }
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
  const editable=canEditCurrentLesson()&&!animationRequestActive&&!workflowActionActive;
  panel.classList.toggle('open');
  document.getElementById('scriptToggle').textContent=panel.classList.contains('open')?'Hide editor':editable?'Edit script':'Review script';
  if(panel.classList.contains('open')){
    const overallNote=deck.find(scene=>scene.animation?.overallReviewNote)?.animation?.overallReviewNote||'AI may add general explanatory context. Check every scene, example and formula against the course source.';
    panel.innerHTML=deck.map((s,i)=>`<div class="script-slide"><span>SCENE ${String(i+1).padStart(2,'0')} · ${esc(s.kicker)}</span><input value="${esc(s.title)}" aria-label="Scene title" ${editable?`oninput="updateSlide(${i},'title',this.value)"`:'readonly'}><textarea aria-label="On-screen explanation" ${editable?`oninput="updateSlide(${i},'body',this.value)"`:'readonly'}>${esc(s.body)}</textarea><textarea aria-label="Narration script" ${editable?`oninput="updateSlide(${i},'narration',this.value)"`:'readonly'}>${esc(s.narration||getSlideNarrationText(i))}</textarea>${(s.steps||[]).map((st,j)=>`<textarea aria-label="Step ${j+1}" ${editable?`oninput="updateStep(${i},${j},this.value)"`:'readonly'}>${esc(st)}</textarea>`).join('')}${s.animation?.reviewNote?`<div class="scene-review-note"><b>AI review cue:</b> ${esc(s.animation.reviewNote)}</div>`:''}</div>`).join('')+`<div class="alert"><b>Review before use:</b> ${esc(overallNote)} No customer publishing happens from this workspace.</div>`;
  }
}
function updateSlide(i,key,value){if(!canEditCurrentLesson()||animationRequestActive||workflowActionActive)return;deck[i][key]=value;if(i===slide){if(playbackState!=='stopped'||activeUtterance)stopPlay();renderSlide(i)}queueSave()}
function updateStep(i,j,value){if(!canEditCurrentLesson()||animationRequestActive||workflowActionActive)return;deck[i].steps[j]=value;if(i===slide){if(playbackState!=='stopped'||activeUtterance)stopPlay();renderSlide(i)}queueSave()}
function cancelScheduledSave(){
  if(saveTimer!==null){clearTimeout(saveTimer);saveTimer=null}
}
async function persistCurrentLesson(){
  if(!currentId||!currentUser||!canEditCurrentLesson())return false;
  const targetId=currentId,targetScope=currentScope,targetUid=currentUser.uid;
  if(activeSave){
    await activeSave;
    if(currentId!==targetId||currentScope!==targetScope||currentUser?.uid!==targetUid)return false;
    if(!editorDirty)return true;
    return persistCurrentLesson();
  }
  if(!editorDirty)return false;
  const id=currentId,scope=currentScope,userId=currentUser.uid,revision=editorRevision;
  const lessonFields=lessonFormPayload();
  if(lessonFields.source.length>SOURCE_LIMIT){setDraftSaveStatus('Source is over the 24,000 character limit','error');throw new Error('Reduce the source material below 24,000 characters before saving this draft.')}
  const slidesSnapshot=JSON.parse(JSON.stringify(deck)),payload={...lessonFields,id,slides:slidesSnapshot};
  const item=lessons.find(x=>x.id===id&&x._scope===scope);
  if(item?.animationProvider==='gemini')payload.animationProvider='gemini';
  if(item?.animatedStoryboardVersion===1)payload.animatedStoryboardVersion=1;
  const operation=(async()=>{
    if(scope==='internal')return functionsClient.httpsCallable('saveInternalLesson')(payload);
    const {id:ignoredId,...privatePayload}=payload;
    await db.collection('users').doc(userId).collection('lessons').doc(id).update({...privatePayload,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
    return {data:{status:item?.status||'private'}};
  })();
  activeSave=operation;
  try{
    const result=await operation;
    if(item){item.slides=slidesSnapshot;item.status=result?.data?.status||item.status;Object.assign(item,lessonFields)}
    if(currentId===id&&currentScope===scope&&currentUser?.uid===userId&&editorRevision===revision){editorDirty=false;setDraftSaveStatus('All changes saved','saved')}
    renderLessons();updateWorkflowControls();
    return true;
  }catch(error){
    if(currentId===id&&currentScope===scope&&currentUser?.uid===userId&&editorRevision===revision){editorDirty=true;setDraftSaveStatus('Save failed · changes remain here','error')}
    throw error;
  }finally{
    if(activeSave===operation)activeSave=null;
  }
}
async function flushCurrentSave(){
  cancelScheduledSave();
  if(activeSave)await activeSave;
  if(!editorDirty)return false;
  return persistCurrentLesson();
}
function queueSave(){
  if(!currentId){if(roleCanAuthor())setDraftSaveStatus('New lesson · saved when created','info');return}
  if(!currentUser||!canEditCurrentLesson()||animationRequestActive||workflowActionActive)return;
  editorDirty=true;editorRevision++;
  cancelScheduledSave();
  const sourceLength=lessonFormPayload().source.length;
  if(sourceLength>SOURCE_LIMIT){setDraftSaveStatus('Source is over the 24,000 character limit','error');return}
  setDraftSaveStatus('Changes pending · autosave in a moment','saving');
  const scheduledId=setTimeout(async()=>{
    if(saveTimer!==scheduledId)return;
    saveTimer=null;setDraftSaveStatus('Saving changes…','saving');
    try{await persistCurrentLesson()}
    catch(error){console.error('Lesson autosave failed:',error.code||'unknown');toast(error.message||'Could not save edits. The draft may have changed status.')}
  },AUTOSAVE_DELAY_MS);
  saveTimer=scheduledId;
}
async function signIn(event){event.preventDefault();const email=document.getElementById('loginEmail').value.trim(),password=document.getElementById('loginPassword').value,button=document.getElementById('loginButton'),error=document.getElementById('authError');error.textContent='';button.disabled=true;button.textContent='Signing in…';try{await auth.signInWithEmailAndPassword(email,password)}catch(e){error.textContent=e.code==='auth/invalid-credential'?'Email or password is incorrect.':e.message}finally{button.disabled=false;button.textContent='Sign in'}}
async function signOut(){
  if(animationRequestActive||workflowActionActive){toast('Wait for the current action to finish before signing out.');return}
  stopPlay();stopSceneAnimation();
  try{await flushCurrentSave();await auth.signOut()}catch(e){toast('Could not save or sign out: '+e.message)}
}
async function showApp(user){
  currentUser=user;currentRole=null;sharedQueueReady=false;workspaceError='';
  document.getElementById('authGate').style.display='none';document.getElementById('home').style.display='flex';
  document.getElementById('signedInEmail').textContent=user.email||'Signed in';
  const av=document.getElementById('userAvatar');av.textContent=(user.email||'U').slice(0,2).toUpperCase();
  const roleLabel=document.getElementById('workspaceRole');if(roleLabel)roleLabel.textContent='Checking workspace role…';
  if(functionsClient){
    try{
      const response=await functionsClient.httpsCallable('getInternalWorkspace')({});
      currentRole=response.data.role;
      workspaceError='';
    }catch(error){workspaceError=error.code||'workspace/unavailable';console.error('Internal workspace lookup failed:',workspaceError)}
  }else workspaceError='functions/unavailable';
  if(roleLabel)roleLabel.textContent=currentRole==='owner'?'Owner · author + reviewer':currentRole==='reviewer'?'Internal reviewer':currentRole==='author'?'Internal author':isRoleAssignmentError()?'Role assignment required':'Workspace service unavailable';
  await refreshLessons();updateWorkflowControls();
}
function showLogin(){
  stopPlay();stopSceneAnimation();cancelScheduledSave();editorRevision++;editorDirty=false;animationRequestActive=false;workflowActionActive=false;currentUser=null;currentRole=null;sharedQueueReady=false;workspaceError='';currentId=null;currentScope='shared';lessons=[];deck=[];
  const roleLabel=document.getElementById('workspaceRole');if(roleLabel)roleLabel.textContent='Signed out';
  renderLessons();updateWorkflowControls();document.getElementById('builder').classList.remove('open');document.body.style.overflow='';document.getElementById('home').style.display='none';document.getElementById('authGate').style.display='flex';
}
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
initializePlaybackControls();document.querySelectorAll('.nav button[data-nav]').forEach(b=>b.onclick=()=>{document.querySelectorAll('.nav button[data-nav]').forEach(x=>x.classList.remove('active'));b.classList.add('active');if(b.dataset.nav==='My lessons'){refreshLessons();document.querySelector('.section-title').scrollIntoView({behavior:'smooth'})}else if(b.dataset.nav==='Template')toast('Choose Campus, Notebook, or Midnight; the seven-slide lesson flow stays consistent.');else window.scrollTo({top:0,behavior:'smooth'})});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.getElementById('builder').classList.contains('open'))closeBuilder();if(document.getElementById('builder').classList.contains('open')&&deck.length){if(e.key==='ArrowRight')nextSlide();if(e.key==='ArrowLeft')prevSlide()}});if(window.addEventListener)window.addEventListener('pagehide',()=>{stopPlay();stopSceneAnimation()});initFirebase();
