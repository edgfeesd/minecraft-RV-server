const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { spawn } = require('child_process');

const DATA = process.env.MC_DATA_DIR || '/data';
const LOG_FILE = path.join(DATA, 'panel-console.log');
let child = null;
let autoRestart = true;
let currentSpec = {
  type: (process.env.SERVER_TYPE || 'PAPER').toUpperCase(),
  version: process.env.MC_VERSION || '1.21.1',
  memory: process.env.MEMORY || '2G'
};
const buffer = [];
const MAX_BUFFER = 3000;

function safeVersion(v){ return /^1\.[0-9]+(?:\.[0-9]+)?$/.test(v); }
function safeFile(name){ return path.basename(name) === name && !name.includes('..') && /^[\w .()\[\]-]+$/.test(name); }
function ensureDir(p){ return fsp.mkdir(p,{recursive:true}); }

async function ensureBase(){
  await ensureDir(DATA);
  await ensureDir(path.join(DATA,'plugins'));
  await ensureDir(path.join(DATA,'mods'));
  await ensureDir(path.join(DATA,'backups'));
  const eula = path.join(DATA, 'eula.txt');
  if (!fs.existsSync(eula)) await fsp.writeFile(eula,'eula=true\n','utf8');
}
async function json(url){ const r=await fetch(url); if(!r.ok) throw new Error(`${url} -> HTTP ${r.status}`); return r.json(); }
async function download(url,dest){
  const r=await fetch(url,{redirect:'follow'}); if(!r.ok) throw new Error(`Download failed: HTTP ${r.status}`);
  const file=fs.createWriteStream(dest);
  await new Promise((resolve,reject)=>r.body.pipeTo(new WritableStream({
    write(chunk){file.write(Buffer.from(chunk));},close(){file.end();resolve();},abort(e){reject(e);}
  })).catch(reject));
}
async function preparePaper(){
  const meta=await json(`https://api.papermc.io/v2/projects/paper/versions/${encodeURIComponent(currentSpec.version)}`);
  const build=meta.builds[meta.builds.length-1]; const jar=path.join(DATA,'server.jar');
  const expected=`paper-${currentSpec.version}-${build}.jar`; const marker=path.join(DATA,'.paper-build');
  if(fs.existsSync(jar)&&fs.existsSync(marker)&&(await fsp.readFile(marker,'utf8'))===expected)return jar;
  await download(`https://api.papermc.io/v2/projects/paper/versions/${encodeURIComponent(currentSpec.version)}/builds/${build}/downloads/paper-${currentSpec.version}-${build}.jar`,jar);
  await fsp.writeFile(marker,expected,'utf8'); return jar;
}
async function prepareVanilla(){
  const manifest=await json('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');
  const v=manifest.versions.find(x=>x.id===currentSpec.version&&x.type==='release'); if(!v)throw new Error(`Minecraft ${currentSpec.version} not found in Mojang manifest`);
  const detail=await json(v.url); const url=detail.downloads?.server?.url; if(!url)throw new Error('Mojang server download URL not available');
  const jar=path.join(DATA,'server.jar'); await download(url,jar); return jar;
}
async function prepareFabric(){
  const installers=await json('https://meta.fabricmc.net/v2/versions/installer'); const installer=installers.find(x=>x.stable)||installers[0];
  if(!installer)throw new Error('Fabric installer metadata unavailable');
  const installerPath=path.join(DATA,'fabric-installer.jar');
  await download(`https://maven.fabricmc.net/net/fabricmc/fabric-installer/${installer.version}/fabric-installer-${installer.version}.jar`,installerPath);
  await new Promise((resolve,reject)=>{const p=spawn('java',['-jar',installerPath,'server','-mcversion',currentSpec.version,'-downloadMinecraft','-dir',DATA],{cwd:DATA,stdio:['ignore','pipe','pipe']});let err='';p.stderr.on('data',d=>err+=d);p.on('close',code=>code===0?resolve():reject(new Error(`Fabric installer failed (${code}): ${err.slice(-1000)}`)));});
  return path.join(DATA,'fabric-server-launch.jar');
}
async function prepare(){
  await ensureBase(); if(!safeVersion(currentSpec.version))throw new Error('Invalid Minecraft version');
  if(currentSpec.type==='PAPER')return preparePaper(); if(currentSpec.type==='FABRIC')return prepareFabric(); if(currentSpec.type==='VANILLA')return prepareVanilla();
  throw new Error('SERVER_TYPE must be PAPER, FABRIC or VANILLA');
}
function argsFor(jar){return[`-Xms${currentSpec.memory}`,`-Xmx${currentSpec.memory}`,'-XX:+UseG1GC','-XX:+ParallelRefProcEnabled','-XX:MaxGCPauseMillis=200','-jar',jar,'nogui'];}
function pushLog(line){
  const s=line.toString().replace(/\r/g,''); for(const l of s.split('\n')){if(!l)continue;buffer.push({ts:new Date().toISOString(),line:l});if(buffer.length>MAX_BUFFER)buffer.shift();fs.appendFile(LOG_FILE,`[${new Date().toISOString()}] ${l}\n`,()=>{});}
}
async function start(){
  autoRestart=true;if(child&&!child.killed)return;const jar=await prepare();
  child=spawn('java',argsFor(jar),{cwd:DATA,env:{...process.env},stdio:['pipe','pipe','pipe']});
  child.stdout.on('data',d=>pushLog(d));child.stderr.on('data',d=>pushLog(d));
  child.on('close',async code=>{child=null;pushLog(`Minecraft process exited with code ${code}`);if(autoRestart)setTimeout(()=>start().catch(e=>pushLog(`Auto-restart failed: ${e.message}`)),3000);});
  pushLog(`Minecraft started: ${currentSpec.type} ${currentSpec.version} ${currentSpec.memory}`);
}
async function stop(){autoRestart=false;if(!child)return;try{child.stdin.write('stop\n');}catch{}await new Promise(r=>setTimeout(r,10000));if(child){try{child.kill('SIGTERM');}catch{}}}
async function restart(){await stop();autoRestart=true;await start();}
async function command(cmd){if(!child)throw new Error('Minecraft is not running');if(typeof cmd!=='string'||!/^[\x20-\x7E]{1,500}$/.test(cmd))throw new Error('Invalid Minecraft command');child.stdin.write(cmd.trim().replace(/^\//,'')+'\n');return true;}
async function listPlayers(){await command('list');await new Promise(r=>setTimeout(r,700));const lines=buffer.slice(-40).map(x=>x.line);const hit=lines.reverse().find(l=>/There are \d+ of a max of \d+ players online/.test(l));if(!hit)return{online:0,max:parseInt((await getProperty('max-players'))||'20',10),players:[]};const m=hit.match(/There are (\d+) of a max of (\d+) players online:(.*)$/);return{online:Number(m?.[1]||0),max:Number(m?.[2]||20),players:(m?.[3]||'').split(',').map(s=>s.trim()).filter(Boolean)};}
async function getProperty(key){const file=path.join(DATA,'server.properties');if(!fs.existsSync(file))return null;const lines=(await fsp.readFile(file,'utf8')).split(/\r?\n/);for(const line of lines){if(!line||line.startsWith('#'))continue;const i=line.indexOf('=');if(i<0)continue;if(line.slice(0,i)===key)return line.slice(i+1);}return null;}
async function setProperties(values){const file=path.join(DATA,'server.properties');let lines=fs.existsSync(file)?(await fsp.readFile(file,'utf8')).split(/\r?\n/):[];const remaining={...values};lines=lines.map(line=>{if(!line||line.startsWith('#'))return line;const i=line.indexOf('=');if(i<0)return line;const k=line.slice(0,i);if(Object.prototype.hasOwnProperty.call(remaining,k)){const v=String(remaining[k]);delete remaining[k];return`${k}=${v}`;}return line;});for(const[k,v]of Object.entries(remaining))lines.push(`${k}=${v}`);await fsp.writeFile(file,lines.join('\n'),'utf8');}
async function config(){const keys=['server-port','max-players','difficulty','gamemode','motd','view-distance','simulation-distance','online-mode','white-list','pvp','spawn-protection'];const out={};for(const k of keys)out[k]=await getProperty(k);return out;}
async function setSpec({type,version,memory}){type=(type||currentSpec.type).toUpperCase();if(!['PAPER','FABRIC','VANILLA'].includes(type))throw new Error('Unsupported server type');if(version&&!safeVersion(version))throw new Error('Invalid Minecraft version');if(memory&&!/^\d+(?:\.\d+)?[GMgm]$/.test(memory))throw new Error('Memory must look like 1G or 2G');currentSpec={...currentSpec,type,version:version||currentSpec.version,memory:memory||currentSpec.memory};}
function info(){return{running:!!child,pid:child?.pid||null,...currentSpec,log:buffer.slice(-250)};}
function files(kind){const dir=kind==='plugins'?path.join(DATA,'plugins'):path.join(DATA,'mods');return fs.existsSync(dir)?fs.readdirSync(dir,{withFileTypes:true}).filter(x=>x.isFile()).map(x=>x.name):[];}
async function deleteFile(kind,name){if(!safeFile(name))throw new Error('Invalid filename');const base=kind==='plugins'?path.join(DATA,'plugins'):path.join(DATA,'mods');await fsp.rm(path.join(base,name),{force:true});}
module.exports={DATA,LOG_FILE,start,stop,restart,command,listPlayers,getProperty,setProperties,config,setSpec,info,files,deleteFile,safeFile,pushLog};