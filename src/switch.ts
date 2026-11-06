import WebSocket from 'ws';
import {switchUrl} from './config.js';
import {Store} from './store.js';
export type Identity={id:string,api_key:string,connectionId:string};
export type SwitchEvent={type:string,room_id:string,sequence:number,payload:{addressed:boolean,sender:string,sender_name:string,message_id:string,body:string}};
export class SwitchClient{
 socket?:WebSocket;stopped=false;connected=false;cursor=0;generation?:number;rooms:string[]=[];operations:Record<string,{input_schema:unknown}>={};failures=0;timer?:NodeJS.Timeout;
 constructor(public name:string,public identity:Identity,public store:Store,public room:string,public receive:(e:SwitchEvent)=>void){const state=store.state<{cursor:number,generation:number}>('connection:'+name);this.cursor=state?.cursor??0;this.generation=state?.generation;}
 async op<T=any>(name:string,args:unknown):Promise<T>{if(!this.operations[name])throw Error('Operation not published by installed server: '+name);const r=await fetch(`${switchUrl}/agents/${this.identity.id}/ops/${name}`,{method:'POST',headers:{Authorization:'Bearer '+this.identity.api_key,'Content-Type':'application/json','X-Switch-Connection-Id':this.identity.connectionId},body:JSON.stringify(args),signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Switch operation '+name+' HTTP '+r.status);return(await r.json() as {result:T}).result;}
 async start(){
 const r=await fetch(`${switchUrl}/agents/${this.identity.id}/ops`,{headers:{Authorization:'Bearer '+this.identity.api_key},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Operation discovery HTTP '+r.status);this.operations=(await r.json() as any).operations;this.open();
 }
 private persist(){this.store.set('connection:'+this.name,{cursor:this.cursor,generation:this.generation});}
 private open(){
 if(this.stopped)return;const url=new URL(`${switchUrl.replace(/^http/,'ws')}/agents/${this.identity.id}/connection/ws`);url.searchParams.set('connection_id',this.identity.connectionId);url.searchParams.set('rooms',this.room);url.searchParams.set('start_from',String(this.cursor));if(this.generation!==undefined)url.searchParams.set('expected_generation',String(this.generation));
 const ws=this.socket=new WebSocket(url,{headers:{Authorization:'Bearer '+this.identity.api_key}});
 ws.on('message',raw=>{try{
 const f=JSON.parse(raw.toString());const d=f.data??f;const type=f.event??f.type;
 if(type==='ping'){ws.send(JSON.stringify({type:'pong',cursor:this.cursor}));return;}
 if(type==='connection_state'){this.connected=true;this.failures=0;this.generation=d.generation;this.cursor=d.cursor;this.rooms=d.rooms;this.persist();return;}
 if(type==='evicted'||type==='refused'){this.connected=false;if(['taken_over','closed'].includes(d.code)||type==='refused')this.stopped=true;return;}
 if(type==='gap'){this.connected=false;this.stopped=true;this.store.set('gap:'+this.name,{...d,action:'Reconcile read_context before resuming. Automatic processing stopped.'});ws.close();return;}
 if(type==='message'){
 // Persist the event before advancing transport cursor; model work never blocks heartbeats.
 if(d.room_id===this.room&&d.payload?.addressed&&d.payload.sender!==this.identity.id)this.receive(d);
 this.cursor=Math.max(this.cursor,Number(f.id??d.sequence));this.persist();
 }
 }catch{this.stopped=true;ws.close();}});
 ws.on('error',()=>{this.connected=false;});ws.on('close',()=>{this.connected=false;if(this.stopped)return;if(++this.failures>12){this.stopped=true;return;}this.timer=setTimeout(()=>this.open(),Math.min(30000,500*2**this.failures));});
 }
 stop(){this.stopped=true;clearTimeout(this.timer);this.socket?.close();}
}
