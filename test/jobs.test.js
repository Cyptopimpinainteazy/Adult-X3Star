'use strict';
/* Per-star listings and private inquiries through real HTTP and restartable SQLite. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'x3-jobs-'));
let child, base;
const jars = {};
async function boot() {
  child = spawn(process.execPath, ['-e', "require('./server/seed').seed({quiet:true});require('./server/index').start(0,'127.0.0.1').then(s=>console.log('JOBS_PORT='+s.address().port));"], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, DATA_DIR: dir, DB_FILE: path.join(dir, 'jobs.db'), SITE_URL: '', NODE_ENV: 'development', COOKIE_SECURE: '0', TRUST_PROXY: '0', SEED_DEMO: '1', DEMO_TRAFFIC: '0', DEMO_PASSWORD: 'jobs-test-demo-only', ADMIN_EMAIL: 'jobs-admin@test.local', ADMIN_PASSWORD: 'jobs-test-admin-only' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const port = await new Promise((resolve, reject) => {
    let output = '', errors = '';
    const timer = setTimeout(() => reject(new Error('Jobs test server startup timed out')), 10000);
    child.stdout.on('data', chunk => { output += chunk; const m = output.match(/JOBS_PORT=(\d+)/); if (m) { clearTimeout(timer); resolve(m[1]); } });
    child.stderr.on('data', chunk => { errors += chunk; });
    child.once('exit', code => { clearTimeout(timer); reject(new Error('Jobs server exited ' + code + ': ' + errors.slice(-1000))); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
  });
  base = 'http://127.0.0.1:' + port;
}
async function stop() { if (!child || child.exitCode !== null) return; const exited = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGTERM'); await exited; }
async function call(who, method, route, body) {
  const headers = {};
  if (jars[who]) headers.cookie = jars[who];
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(base + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const cookie = response.headers.get('set-cookie'); if (cookie) jars[who] = cookie.split(';')[0];
  let data = null; try { data = await response.json(); } catch {}
  return { status: response.status, data, headers: response.headers };
}
const listing = (extra = {}) => ({ title: 'Video editor for weekly clips', kind: 'hiring', category: 'editing', description: 'Edit two short promotional clips each week. Share relevant experience and availability.', workMode: 'remote', location: '', compensation: 'Discuss scope and rate before accepting work', status: 'open', ...extra });
let jobId, availableId, expiringId, inquiryId, lunaId;
test.before(async () => {
  await boot();
  for (const [who, email, password] of [['luna','luna@demo.x3star.local','jobs-test-demo-only'],['raven','raven@demo.x3star.local','jobs-test-demo-only'],['fan','fan@demo.x3star.local','jobs-test-demo-only'],['admin','jobs-admin@test.local','jobs-test-admin-only']]) {
    const response = await call(who, 'POST', '/api/auth/login', {email,password});
    assert.equal(response.status,200);
    if (who === 'luna') lunaId = response.data.user.id;
  }
});
test.after(async () => { await stop(); fs.rmSync(dir, {recursive:true,force:true}); });

test('star publishes both listing kinds and only public listings appear on the profile', async () => {
  const made = await call('luna','POST','/api/studio/jobs',listing());
  assert.equal(made.status,201);
  jobId = made.data.job.id;
  assert.equal(made.data.job.creatorId,'luna');
  assert.ok(made.data.job.expiresAt > Date.now() + 29 * 86400000);
  assert.equal((await call('luna','POST','/api/studio/jobs',listing({title:'Available for graphic design',kind:'available',category:'design',status:'draft'}))).status,201);
  const owned = await call('luna','GET','/api/studio/jobs');
  assert.equal(owned.data.jobs.length,2);
  availableId = owned.data.jobs.find(job => job.kind === 'available').id;
  const publicJobs = await call('anon','GET','/api/creators/luna/jobs');
  assert.equal(publicJobs.status,200);
  assert.equal(publicJobs.data.jobs.length,1);
  assert.equal(publicJobs.data.jobs[0].kind,'hiring');
  const profile = await call('anon','GET','/api/creators/luna');
  assert.equal(profile.data.creator.jobs.length,1);
  assert.equal(profile.data.creator.jobs[0].title,'Video editor for weekly clips');
  assert.doesNotMatch(JSON.stringify(profile.data.creator.jobs),/inquiries|email|userId/);
});

test('only owner or scoped admin can mutate listings or inspect their inbox', async () => {
  assert.equal((await call('anon','POST','/api/studio/jobs',listing())).status,401);
  assert.equal((await call('fan','POST','/api/studio/jobs',listing())).status,403);
  assert.equal((await call('raven','PUT','/api/studio/jobs/'+jobId,{title:'Wrong owner edit'})).status,404);
  assert.equal((await call('raven','DELETE','/api/studio/jobs/'+jobId)).status,404);
  assert.equal((await call('raven','GET','/api/studio/jobs/'+jobId+'/inquiries')).status,404);
  assert.equal((await call('raven','GET','/api/studio/jobs?as=luna')).data.jobs.length,0,'creator cannot impersonate another star with admin query');
  const opened = await call('admin','PUT','/api/studio/jobs/'+availableId+'?as=luna',{status:'open'});
  assert.equal(opened.status,200);
  assert.equal(opened.data.job.kind,'available');
  assert.equal((await call('anon','GET','/api/creators/luna/jobs')).data.jobs.length,2);
});

test('inquiries stay private, reject repeats and can be reviewed by the star', async () => {
  const body={message:'I can help edit the weekly promotional clips.',portfolioUrl:'https://portfolio.example/work'};
  assert.equal((await call('anon','POST','/api/jobs/'+jobId+'/inquiries',body)).status,401);
  const sent = await call('fan','POST','/api/jobs/'+jobId+'/inquiries',body);
  assert.equal(sent.status,201);
  assert.equal(sent.headers.get('cache-control'),'no-store');
  assert.equal(sent.data.ok,true);
  inquiryId=sent.data.inquiry.id;
  const duplicate=await call('fan','POST','/api/jobs/'+jobId+'/inquiries',body);
  assert.equal(duplicate.status,409);
  assert.equal(duplicate.data.error.code,'already_inquired');
  assert.equal((await call('luna','POST','/api/jobs/'+jobId+'/inquiries',body)).status,400);
  const inbox=await call('luna','GET','/api/studio/jobs/'+jobId+'/inquiries');
  assert.equal(inbox.status,200);
  assert.equal(inbox.headers.get('cache-control'),'no-store');
  assert.equal(inbox.data.inquiries.length,1);
  assert.equal(inbox.data.inquiries[0].applicant.email,'fan@demo.x3star.local');
  assert.equal(inbox.data.inquiries[0].message,body.message);
  assert.equal((await call('fan','GET','/api/studio/jobs/'+jobId+'/inquiries')).status,403);
  assert.equal((await call('raven','PATCH','/api/studio/jobs/'+jobId+'/inquiries/'+inquiryId,{status:'closed'})).status,404);
  assert.equal((await call('luna','PATCH','/api/studio/jobs/'+availableId+'/inquiries/'+inquiryId,{status:'closed'})).status,404,'inquiry must belong to the selected listing');
  assert.equal((await call('luna','PATCH','/api/studio/jobs/'+jobId+'/inquiries/'+inquiryId,{status:'accepted'})).status,400);
  assert.equal((await call('luna','PATCH','/api/studio/jobs/'+jobId+'/inquiries/'+inquiryId,{status:'reviewing'})).data.inquiry.status,'reviewing');
  const publicBoard=await call('anon','GET','/api/creators/luna/jobs');
  assert.doesNotMatch(JSON.stringify(publicBoard.data),/fan@demo|portfolio\.example|inquiries|userId|applicant/);
  const owned=await call('luna','GET','/api/studio/jobs');
  assert.equal(owned.data.jobs.find(job=>job.id===jobId).inquiryCount,1);
});

test('invalid listing fields and unsafe portfolio links fail cleanly', async () => {
  for (const extra of [{kind:'unknown'},{category:'unknown'},{workMode:'office'},{status:'archived'},{title:{value:'Invalid'}},{description:'short'},{compensation:''},{workMode:'onsite',location:''},{expiresAt:Date.now()-1000},{expiresAt:Date.now()+181*86400000}]) {
    assert.equal((await call('luna','POST','/api/studio/jobs',listing(extra))).status,400,JSON.stringify(extra));
  }
  for (const portfolioUrl of ['javascript:alert(1)','http://portfolio.example','https://user:secret@portfolio.example']) {
    assert.equal((await call('raven','POST','/api/jobs/'+jobId+'/inquiries',{message:'I would like to discuss the role.',portfolioUrl})).status,400);
  }
});

test('closed, expired and archived listings stop inquiries while retaining history', async () => {
  assert.equal((await call('luna','PUT','/api/studio/jobs/'+jobId,{status:'closed'})).status,200);
  assert.equal((await call('raven','POST','/api/jobs/'+jobId+'/inquiries',{message:'I would like to discuss this role.'})).status,409);
  assert.equal((await call('luna','DELETE','/api/studio/jobs/'+jobId)).status,200);
  assert.equal((await call('luna','PUT','/api/studio/jobs/'+jobId,{status:'open'})).status,409);
  assert.equal((await call('luna','GET','/api/studio/jobs/'+jobId+'/inquiries')).data.inquiries.length,1);
  const expiresAt=Date.now()+1500;
  const made=await call('luna','POST','/api/studio/jobs',listing({title:'Short availability window',expiresAt}));
  assert.equal(made.status,201);
  expiringId=made.data.job.id;
  assert.ok((await call('anon','GET','/api/creators/luna/jobs')).data.jobs.some(job=>job.id===expiringId));
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,expiresAt+50-Date.now())));
  assert.ok(!(await call('anon','GET','/api/creators/luna/jobs')).data.jobs.some(job=>job.id===expiringId));
  assert.equal((await call('raven','POST','/api/jobs/'+expiringId+'/inquiries',{message:'Can we discuss the expired listing?'})).status,409);
  assert.equal((await call('luna','PUT','/api/studio/jobs/'+expiringId,{status:'open'})).status,400,'expired listing needs a renewed expiry');
  assert.equal((await call('luna','PUT','/api/studio/jobs/'+expiringId,{status:'closed'})).status,200,'closing an expired listing remains possible');
});

test('suspended or banned owners cannot expose or publish listings', async () => {
  assert.equal((await call('admin','POST','/api/admin/creators/luna',{status:'suspended'})).status,200);
  assert.equal((await call('anon','GET','/api/creators/luna/jobs')).status,404);
  assert.equal((await call('luna','POST','/api/studio/jobs',listing())).status,403);
  assert.equal((await call('luna','GET','/api/studio')).status,200,'private Studio remains accessible');
  assert.equal((await call('raven','POST','/api/jobs/'+availableId+'/inquiries',{message:'Please share the project scope.'})).status,404);
  await call('admin','POST','/api/admin/creators/luna',{status:'approved'});
  assert.equal((await call('admin','POST','/api/admin/users/'+lunaId,{banned:true})).status,200);
  assert.equal((await call('anon','GET','/api/creators/luna/jobs')).status,404);
  assert.equal((await call('anon','GET','/api/creators/luna')).data.creator.jobs.length,0);
  assert.equal((await call('admin','POST','/api/studio/jobs?as=luna',listing())).status,403);
  await call('admin','POST','/api/admin/users/'+lunaId,{banned:false});
  assert.equal((await call('luna','POST','/api/auth/login',{email:'luna@demo.x3star.local',password:'jobs-test-demo-only'})).status,200,'banning revokes old sessions; sign in again after unbanning');
});

test('real server restart preserves both listings and private inquiry history', async () => {
  await stop(); await boot();
  const board=await call('anon','GET','/api/creators/luna/jobs');
  assert.equal(board.status,200);
  assert.equal(board.data.jobs.length,1);
  assert.equal(board.data.jobs[0].kind,'available');
  const inbox=await call('luna','GET','/api/studio/jobs/'+jobId+'/inquiries');
  assert.equal(inbox.status,200);
  assert.equal(inbox.data.inquiries[0].id,inquiryId);
  assert.equal(inbox.data.inquiries[0].status,'reviewing');
});

test('archiving frees capacity and listing storage stays bounded per star', async () => {
  for(let i=0;i<18;i++)assert.equal((await call('luna','POST','/api/studio/jobs',listing({status:'draft',title:'Draft opportunity '+i}))).status,201);
  assert.equal((await call('luna','POST','/api/studio/jobs',listing({status:'draft'}))).status,400);
  assert.equal((await call('luna','DELETE','/api/studio/jobs/'+expiringId)).status,200);
  assert.equal((await call('luna','POST','/api/studio/jobs',listing({status:'draft'}))).status,201);
  assert.equal((await call('anon','GET','/api/creators/luna/jobs')).data.jobs.length,1);
});

test('archive history never hides older active listings from their owner', async () => {
  const retained=[];
  for(let i=0;i<19;i++) {
    const made=await call('raven','POST','/api/studio/jobs',listing({status:'draft',title:'Keep manageable '+i}));
    assert.equal(made.status,201); retained.push(made.data.job.id);
  }
  for(let i=0;i<101;i++) {
    const made=await call('raven','POST','/api/studio/jobs',listing({status:'draft',title:'Archive history '+i}));
    assert.equal(made.status,201);
    assert.equal((await call('raven','DELETE','/api/studio/jobs/'+made.data.job.id)).status,200);
  }
  const owned=await call('raven','GET','/api/studio/jobs');
  assert.equal(owned.headers.get('cache-control'),'no-store');
  assert.equal(owned.data.jobs.length,100);
  assert.equal(owned.data.jobs.filter(job=>job.status!=='archived').length,19);
  assert.ok(retained.every(id=>owned.data.jobs.some(job=>job.id===id)));
  assert.equal((await call('raven','PUT','/api/studio/jobs/'+retained[0],{title:'Still editable after archive history'})).status,200);
});
