import '../src/config.js';
import {readFileSync,writeFileSync,existsSync,chmodSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {switchUrl} from '../src/config.js';
const setup=JSON.parse(readFileSync('.local/switch-setup.json','utf8'));
const filename='.local/agents.json';const agents=existsSync(filename)?JSON.parse(readFileSync(filename,'utf8')):{};
for(const name of ['producer','reviewer']){
 if(agents[name]){console.log(name+': existing identity retained');continue;}
 const r=await fetch(switchUrl+'/agents',{method:'POST',headers:{Authorization:'Bearer '+setup.registration_key,'Content-Type':'application/json'},body:JSON.stringify({name,display_name:name==='producer'?'Producer':'Reviewer',description:'CreatorRoom '+name,connector_type:'creatorroom-typescript',integration_profile:{connection_model:'always_on',message_exchange:true,pre_invocation_mediation:[],post_invocation_mediation:[],event_reporting:[]}})});
 if(!r.ok)throw Error('Registration failed HTTP '+r.status+'; do not overwrite existing identities');
 agents[name]={...await r.json(),connectionId:randomUUID()};writeFileSync(filename,JSON.stringify(agents,null,2),{mode:0o600});chmodSync(filename,0o600);console.log(name+': registered and securely persisted');
}
