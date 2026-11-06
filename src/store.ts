import Database from 'better-sqlite3';
import {dataDir} from './config.js';
import type {Project} from './domain.js';
export class Store{
 db:Database.Database;
 constructor(filename=dataDir+'/creatorroom.sqlite'){
 this.db=new Database(filename);this.db.pragma('journal_mode = WAL');this.db.pragma('busy_timeout = 5000');
 this.db.exec(`CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS state(key TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, agent TEXT NOT NULL, room TEXT NOT NULL, event TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, error TEXT, next_at INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS effects(id TEXT PRIMARY KEY, status TEXT NOT NULL, result TEXT);`);
 // An interrupted external send has an ambiguous result: require reconciliation, never duplicate it blindly.
 this.db.prepare("UPDATE jobs SET status='pending' WHERE status='running'").run();
 }
 list(){return(this.db.prepare('SELECT body FROM projects').all() as {body:string}[]).map(r=>JSON.parse(r.body) as Project);}
 get(id:string){const r=this.db.prepare('SELECT body FROM projects WHERE id=?').get(id) as {body:string}|undefined;return r?JSON.parse(r.body) as Project:undefined;}
 save(p:Project){this.db.prepare('INSERT INTO projects VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(p.id,JSON.stringify(p));}
 state<T>(key:string):T|undefined{const r=this.db.prepare('SELECT body FROM state WHERE key=?').get(key) as {body:string}|undefined;return r?JSON.parse(r.body):undefined;}
 set(key:string,value:unknown){this.db.prepare('INSERT INTO state VALUES(?,?) ON CONFLICT(key) DO UPDATE SET body=excluded.body').run(key,JSON.stringify(value));}
 enqueue(agent:string,room:string,event:{payload:{message_id:string}}){return this.db.prepare('INSERT OR IGNORE INTO jobs(id,agent,room,event) VALUES(?,?,?,?)').run(agent+':'+event.payload.message_id,agent,room,JSON.stringify(event)).changes>0;}
 async effect<T>(id:string,run:()=>Promise<T>):Promise<T>{
 const prior=this.db.prepare('SELECT * FROM effects WHERE id=?').get(id) as {status:string,result:string}|undefined;
 if(prior?.status==='done')return JSON.parse(prior.result);if(prior)throw Error('External effect needs reconciliation; automatic retry stopped');
 this.db.prepare("INSERT INTO effects(id,status) VALUES(?,'sending')").run(id);
 const result=await run();this.db.prepare("UPDATE effects SET status='done',result=? WHERE id=?").run(JSON.stringify(result??null),id);return result;
 }
}
export type Job={id:string,agent:string,room:string,event:string,attempts:number};
