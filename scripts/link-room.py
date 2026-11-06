#!/usr/bin/env python3
"""Bind only the explicitly configured demo channel. No messages are posted."""
import json,pathlib,urllib.request,http.cookiejar,sys
root=pathlib.Path(__file__).resolve().parent.parent
def env(p):return dict(l.split('=',1) for l in p.read_text().splitlines() if l and not l.startswith('#') and '=' in l)
e=env(root/'infra/switch/.env');local=env(root/'.env');setup=json.loads((root/'.local/switch-setup.json').read_text());agents=json.loads((root/'.local/agents.json').read_text());client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def call(path,body=None):
 req=urllib.request.Request('http://127.0.0.1:8000/gateway'+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json'})
 with client.open(req,timeout=30) as r:return json.load(r)
call('/auth/login',{'email':e['GATEWAY_ADMIN_EMAIL'],'password':e['GATEWAY_ADMIN_PASSWORD']})
for summary in call('/rooms'):
 room=call('/rooms/'+summary['id'])
 if room.get('external_channel_id')!=local.get('SLACK_CHANNEL_ID') or room.get('bridge_id')!=setup['bridge_id']:continue
 missing=[a['id'] for a in agents.values() if a['id'] not in room['agent_ids']]
 if missing:call('/rooms/'+room['id']+'/agents',{'agent_ids':missing})
 if not setup.get('linked_identity'):raise SystemExit('Run setup-switch.py to link creator first')
 result={'roomId':room['id'],'creatorId':setup['linked_identity']['id'],'producerParticipantId':agents['producer']['id'],'reviewerParticipantId':agents['reviewer']['id']}
 p=root/'.local/room.json';p.write_text(json.dumps(result,indent=2));p.chmod(0o600)
 print('Demo room linked:',room['name'],'; both agents added. Restart CreatorRoom workers.');break
else:print('Demo room not found. Invite the existing Slack app into the designated channel and send a message there. No other channels were touched.')
