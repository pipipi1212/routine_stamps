import {all,replaceAll} from './db.js';
import {dateKey,weekStart,id} from './domain.js';

const SCOPE='https://www.googleapis.com/auth/drive.appdata';
const FILE_PREFIX='daytrace-device-';
const FORMAT='DAYTRACE_DRIVE_SYNC';
let gisPromise;

export function loadGoogleIdentity(){
  if(window.google?.accounts?.oauth2)return Promise.resolve();
  if(gisPromise)return gisPromise;
  gisPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.defer=true;
    script.onload=()=>window.google?.accounts?.oauth2?resolve():reject(new Error('Google Identity Servicesを読み込めませんでした'));
    script.onerror=()=>reject(new Error('Googleの認証ライブラリに接続できません。ネットワークをご確認ください。'));
    document.head.append(script);
  }).catch(error=>{gisPromise=null;throw error});
  return gisPromise;
}

// Call from a direct button click. Google requires a user gesture to open its consent window.
export function requestGoogleAccessToken(clientId,onToken,onError){
  if(!window.google?.accounts?.oauth2){onError(new Error('Google連携の準備ができていません。設定を開き直してください。'));return}
  try{
    const tokenClient=window.google.accounts.oauth2.initTokenClient({client_id:clientId,scope:SCOPE,callback:response=>{
      if(response?.access_token)onToken(response.access_token);
      else onError(new Error(response?.error_description||response?.error||'Googleの認証が完了しませんでした'));
    },error_callback:error=>onError(new Error(error?.message||'Googleの認証ウィンドウを開けませんでした'))});
    tokenClient.requestAccessToken();
  }catch(error){onError(error)}
}

const identity=(store,row)=>store==='dailyPlans'?row.date:store==='weeklyGoals'?row.weekStartDate:store==='stamps'?row.code:store==='settings'?row.id:store==='stampAwards'?`${row.stampCode}|${row.periodType}|${row.periodKey}`:row.id;
const rowTime=row=>Date.parse(row.updatedAt||row.submittedAt||row.createdAt||row.checkedInAt||row.awardedAt||0)||0;
function choose(store,a,b){
  if(store==='dailyPlans'){
    // Once a plan date arrives, keep its original pre-plan deadline and campus decision.
    if(a.date<=dateKey())return (Date.parse(a.createdAt)||0)<=(Date.parse(b.createdAt)||0)?a:b;
  }
  if(store==='weeklyGoals'&&a.weekStartDate<=weekStart())return (Date.parse(a.createdAt)||0)<=(Date.parse(b.createdAt)||0)?a:b;
  return rowTime(a)>=rowTime(b)?a:b;
}
function mergeRows(store,left,right){
  const map=new Map();
  for(const row of [...(left||[]),...(right||[])]){
    if(!row||typeof row!=='object')continue;
    const key=identity(store,row);if(key===undefined||key===null)continue;
    const previous=map.get(key);map.set(key,previous?choose(store,previous,row):row);
  }
  return [...map.values()];
}
function validateRemote(snapshot){
  if(snapshot?.format!==FORMAT||snapshot.version!==1||!snapshot.stores||typeof snapshot.stores!=='object')throw new Error('Driveに対応していないデータ形式があります');
  for(const name of ['dailyPlans','campusCheckIns','assignments','studySessions','weeklyGoals','stamps','stampAwards','settings'])if(!Array.isArray(snapshot.stores[name]))throw new Error(`Driveデータの${name}が壊れています`);
  return snapshot.stores;
}
async function localForSync(){
  const names=['dailyPlans','campusCheckIns','assignments','studySessions','weeklyGoals','stamps','stampAwards','settings'];
  const entries=await Promise.all(names.map(async name=>[name,await all(name)]));
  const data=Object.fromEntries(entries);
  // Raw GPS coordinates stay on the originating device. Distance and decision history still sync.
  data.campusCheckIns=data.campusCheckIns.map(({latitude,longitude,...row})=>({...row,latitude:null,longitude:null}));
  // An in-flight timer is local until it is completed, avoiding duplicate cross-device timers.
  data.studySessions=data.studySessions.filter(row=>!['active','paused'].includes(row.status));
  data.settings=data.settings.map(({googleClientId,syncLocationHistory,...row})=>row);
  return data;
}
function deviceId(){let value=localStorage.getItem('daytrace-device-id');if(!value){value=crypto.randomUUID();localStorage.setItem('daytrace-device-id',value)}return value}
async function driveRequest(url,token,options={}){
  const response=await fetch(url,{...options,headers:{Authorization:`Bearer ${token}`,...options.headers}});
  if(!response.ok){let detail='';try{detail=(await response.json()).error?.message||''}catch{}throw new Error(detail||`Google Driveとの通信に失敗しました（${response.status}）`)}
  if(response.status===204)return null;
  return response.json();
}
async function listDeviceFiles(token){
  const files=[];let pageToken='';
  do{
    const url=new URL('https://www.googleapis.com/drive/v3/files');url.searchParams.set('spaces','appDataFolder');url.searchParams.set('q',`name contains '${FILE_PREFIX}' and trashed = false`);url.searchParams.set('fields','nextPageToken,files(id,name)');url.searchParams.set('pageSize','1000');if(pageToken)url.searchParams.set('pageToken',pageToken);
    const result=await driveRequest(url,token);files.push(...(result.files||[]));pageToken=result.nextPageToken||'';
  }while(pageToken);
  return files;
}
async function readSnapshot(token,file){
  const response=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`,{headers:{Authorization:`Bearer ${token}`}});
  if(!response.ok)throw new Error(`Driveの同期ファイルを読み込めませんでした（${response.status}）`);
  return validateRemote(await response.json());
}
async function writeSnapshot(token,file,snapshot){
  const json=JSON.stringify(snapshot);let result;
  if(file){
    result=await driveRequest(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(file.id)}?uploadType=media&fields=id,name`,token,{method:'PATCH',headers:{'Content-Type':'application/json; charset=UTF-8'},body:json});
  }else{
    const boundary=`daytrace_${crypto.randomUUID().replaceAll('-','')}`;
    const metadata=JSON.stringify({name:file.name,mimeType:'application/json',parents:['appDataFolder']});
    const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${json}\r\n--${boundary}--`;
    result=await driveRequest('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',token,{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body});
  }
  return result;
}
export async function syncWithDrive(token,onStatus=()=>{}){
  onStatus('Google Driveから各端末の記録を読み込んでいます…');
  const localGPS=new Map((await all('campusCheckIns')).map(row=>[row.id,{latitude:row.latitude,longitude:row.longitude,accuracyMeters:row.accuracyMeters}]));
  const local=await localForSync(),files=await listDeviceFiles(token),remoteSnapshots=[];
  for(const file of files){onStatus(`端末の記録を統合しています… (${remoteSnapshots.length+1}/${files.length})`);remoteSnapshots.push(await readSnapshot(token,file))}
  const names=Object.keys(local),merged={};
  for(const name of names)merged[name]=mergeRows(name,local[name],remoteSnapshots.flatMap(s=>s[name]||[]));
  const localSetting=(await all('settings')).find(s=>s.id==='default')||{};
  const activeLocal=(await all('studySessions')).filter(s=>['active','paused'].includes(s.status));
  merged.studySessions=[...mergeRows('studySessions',merged.studySessions,activeLocal)];
  merged.settings=merged.settings.map(s=>s.id==='default'?{...s,googleClientId:localSetting.googleClientId||''}:s);
  merged.campusCheckIns=merged.campusCheckIns.map(row=>localGPS.has(row.id)?{...row,...localGPS.get(row.id)}:row);
  // Local IndexedDB replacement is atomic; active sessions from this device are retained.
  onStatus('統合した記録をこの端末へ反映しています…');
  await replaceAll(merged);
  const cloudStores=Object.fromEntries(names.map(name=>[name,merged[name]]));
  cloudStores.campusCheckIns=cloudStores.campusCheckIns.map(({latitude,longitude,...row})=>({...row,latitude:null,longitude:null}));
  cloudStores.settings=cloudStores.settings.map(({googleClientId,...row})=>row);
  const snapshot={format:FORMAT,version:1,deviceId:deviceId(),syncedAt:new Date().toISOString(),stores:cloudStores};
  const name=`${FILE_PREFIX}${snapshot.deviceId}.json`,ownFile=files.find(f=>f.name===name);
  onStatus('この端末の同期ファイルをDriveへ保存しています…');
  const result=await writeSnapshot(token,ownFile?{...ownFile,name}: {name},snapshot);
  return {deviceCount:new Set([...files.map(f=>f.name),name]).size,recordCount:names.reduce((sum,n)=>sum+merged[n].length,0),fileId:result?.id};
}

