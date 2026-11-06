import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {Angles,Asset,AssetName,PackContent,Review,approve,revise,validatePack,type Project,type Pack} from './domain.js';
import {Store,type Job} from './store.js';
import {model} from './model.js';
import {SwitchClient,type SwitchEvent} from './switch.js';
import {baseUrl} from './config.js';
export class Workflow{
 clients:Record<string,SwitchClient>={};running=false;timer?:NodeJS.Timeout;
 constructor(public store:Store){}
 enqueue(name:string,event:SwitchEvent){this.store.enqueue(name,event.room_id,event);}
 async tick(){if(this.running)return;this.running=true;try{
 const job=this.store.db.prepare("SELECT * FROM jobs WHERE status='pending' AND next_at<=? ORDER BY rowid LIMIT 1").get(Date.now()) as Job|undefined;if(!job)return;
 const client=this.clients[job.agent];if(!client?.connected)return;
 this.store.db.prepare("UPDATE jobs SET status='running',attempts=attempts+1 WHERE id=?").run(job.id);
 try{await this.process(job,client);this.store.db.prepare("UPDATE jobs SET status='done',error=NULL WHERE id=?").run(job.id);}catch(error){
 const message=error instanceof Error?error.message:'Workflow failed';const terminal=job.attempts>=2||message.includes('reconciliation');
 this.store.db.prepare('UPDATE jobs SET status=?,error=?,next_at=? WHERE id=?').run(terminal?'failed':'pending',message.replace(/(?:sk-ant-|xoxb-|xapp-)[\w-]+/g,'[redacted]'),Date.now()+2000*2**job.attempts,job.id);
 }
 }finally{this.running=false;}}
 start(){this.timer=setInterval(()=>void this.tick(),500);}
 stop(){clearInterval(this.timer);for(const c of Object.values(this.clients))c.stop();}
 async process(job:Job,client:SwitchClient){
 const e=JSON.parse(job.event) as SwitchEvent;const text=e.payload.body.replace(/@(?:producer|reviewer)\b/gi,'').trim();
 const send=(body:string,suffix='reply')=>this.store.effect(job.id+':'+suffix,()=>client.op('post_message',{body}));
 const projectId=text.match(/\bproject\s+([\w-]+)/i)?.[1];const candidates=this.store.list().filter(p=>p.roomId===job.room&&!p.fixture);const p=projectId?this.store.get(projectId):candidates.length===1?candidates[0]:undefined;
 if(/^ping\b/i.test(text)){await send(`${client.name==='producer'?'Producer':'Reviewer'} is connected through Switch.`);if(job.agent==='producer')await this.store.effect(job.id+':handoff',()=>client.op('send_targeted_message',{body:'CreatorRoom connectivity check: ping',target_names:['reviewer']}));return;}
 if(!p||p.roomId!==job.room){await send('Create a project in CreatorRoom, then include project <id> in your brief. No unique live project is associated with this room.');return;}
 const link=`${baseUrl}/?project=${p.id}`;
 const source={title:p.title,duration:p.duration,profile:p.profile,segments:p.segments};
 if(job.agent==='reviewer'){
 // Only the Producer identity can trigger pack review; the backend never invokes this branch directly.
 const producer=this.clients.producer;const match=text.match(/\breview\s+project\s+[\w-]+\s+v(\d+)\b/i);
 const producerSender=this.store.state<string>('participant:producer');
 if(!match||!producer||!producerSender||e.payload.sender!==producerSender){await send('Reviewer accepts a version-specific review handoff from Producer.');return;}
 const version=Number(match[1]),pack=p.packs.find(v=>v.version===version);if(!pack)throw Error('Requested pack version missing');
 const review=await this.cachedModel(job.id+':review',Review,'Review the ORIGINAL transcript against this pack. Return zero findings when no issues exist. Check unsupported claims, exaggerated wording, contradictions, direct quotes, source references, and plausible chapter boundaries. Each finding needs assetId, severity, source segments, explanation, suggestion. For selective revisions review changed assets only; chapter checks remain deterministic.',{...source,pack:pack.content,changed:pack.changed});
 const validIds=new Set(p.segments.map(s=>s.id));if(review.findings.some(f=>f.segments.some(id=>!validIds.has(id))))throw Error('Reviewer returned unknown source IDs');
 const fresh=this.store.get(p.id)!;const target=fresh.packs.find(v=>v.version===version)!;target.review=review;target.checks=validatePack(fresh,target.content);this.store.save(fresh);
 await this.document(client,p,JSON.stringify({version,review,checks:target.checks}),'review');
 await send(`Reviewed ${p.title} v${version}: ${review.findings.length} model finding(s), ${target.checks.length} deterministic finding(s). Supported by transcript; not independently fact-checked. ${link}`);return;
 }
 if(e.payload.sender!==p.creatorId){await send('Only the linked creator can brief, choose angles, revise, or approve this project.');return;}
 if(/\bapprove\b/i.test(text)){
 const exact=text.match(/^(?:project\s+[\w-]+\s+)?approve v([1-9]\d*)$/i);if(!exact){await send('Use the exact command: @producer approve v<number>. Approval must name the current version.');return;}
 try{approve(p,Number(exact[1]),e.payload.sender,job.room,e.payload.message_id);this.store.save(p);await send(`Creator approved v${exact[1]}. Approval applies only to that immutable version. ${link}`);}catch(err){await send((err as Error).message);}return;
 }
 const revision=text.match(/^(?:project\s+[\w-]+\s+)?revise\s+(description|x|linkedin|newsletter)\s+(.+)$/is);
 let pack:Pack|undefined;
 if(revision){
 const previous=p.packs.at(-1);if(!previous){await send('Choose an angle and generate a pack first.');return;}
 const name=AssetName.parse(revision[1]);const replacement=await this.cachedModel(job.id+':revision',Asset,'Revise only the requested asset using source evidence. Preserve the creative brief; obey creator revision, avoid prohibited phrases. Supply a temporary id, content, evidence. X: 5–7 posts separated by blank lines, each <=270 characters. LinkedIn:150–250 words. Newsletter:250–400 words.',{...source,brief:p.brief,asset:name,previous:previous.content.assets[name],request:revision[2]});
 pack=revise(previous,name,replacement);
 }else if(/^(?:project\s+[\w-]+\s+)?angle\s+[12]$/i.test(text)){
 if(!p.angles){await send('Ask Producer to brief the project first.');return;}
 if(p.packs.length){await send('A pack already exists. Use revise <asset> <request> for selective revisions.');return;}
 const n=Number(text.match(/angle\s+([12])/i)![1])-1;p.brief=JSON.stringify(p.angles[n]);this.store.save(p);
 const content=await this.cachedModel(job.id+':pack',PackContent,'Generate a content pack for the chosen brief. Chapters start at 0, ascending, >=10 seconds each including final chapter, >=3 if video allows. Each chapter cites source segments. Description contains summary and chapter text. X:5–7 posts separated by blank lines, each <=270 characters. LinkedIn:150–250 words. Newsletter:250–400 words. Every asset includes evidence mapping substantive claims and any quotes to original segment IDs. Do not fabricate native chapter eligibility. Give each asset a distinct id.',{...source,brief:p.brief});
 for(const a of Object.values(content.assets))a.id=randomUUID();pack={version:1,createdAt:new Date().toISOString(),content,changed:['all']};
 }else{
 if(p.packs.length){await send(`Current pack v${p.packs.at(-1)!.version}. Use revise <asset> <request> or approve v<number>. ${link}`);return;}
 const angles=await this.cachedModel(job.id+':angles',Angles,'Propose exactly two distinct evidence-grounded creative angles for this creator. Cite original segment IDs. Do not generate the pack yet.',source);const ids=new Set(p.segments.map(s=>s.id));if(angles.angles.some(a=>a.segments.some(id=>!ids.has(id))))throw Error('Angle cites unknown source');p.angles=angles.angles;this.store.save(p);
 await this.document(client,p,JSON.stringify({angles:p.angles}),'brief');await send(angles.angles.map((a,i)=>`${i+1}. ${a.title}\n${a.rationale}\nSources: ${a.segments.join(', ')}`).join('\n\n')+'\nChoose: @producer angle 1 or @producer angle 2.');return;
 }
 // Persist version before the real Switch handoff. Retries retain the same saved model result and version.
 const fresh=this.store.get(p.id)!;const existing=fresh.packs.find(v=>v.version===pack!.version);if(!existing){pack.checks=validatePack(fresh,pack.content);fresh.packs.push(pack);this.store.save(fresh);}
 await this.document(client,fresh,JSON.stringify({brief:fresh.brief,version:pack.version,pack:pack.content}),'brief');
 await send(`Saved ${fresh.title} v${pack.version}. Review requested through Switch. ${link}`);
 await this.store.effect(job.id+':handoff',()=>client.op('send_targeted_message',{body:`review project ${p.id} v${pack!.version}`,target_names:['reviewer']}));
 }
 async cachedModel<T extends z.ZodType>(key:string,schema:T,task:string,data:unknown):Promise<z.infer<T>>{const prior=this.store.state<unknown>(key);if(prior)return schema.parse(prior);const value=await model(schema,task,data);this.store.set(key,value);return value;}
 async document(client:SwitchClient,p:Project,content:string,kind:string){const key=`document:${client.name}:${p.id}:${kind}`;let id=this.store.state<string>(key);if(!id){const result=await client.op<{document_id:string}>('create_room_document',{name:`creatorroom-${p.id}-${kind}`,description:'CreatorRoom '+kind,instructions:'Source artifacts are available to both local workers through the application store. These are transcript-supported drafts. See the separate human-readable app link in Slack.',content});id=result.document_id;this.store.set(key,id);}else await client.op('update_room_document',{document_id:id,content});}
}
