import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('.',import.meta.url)));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.svg':'image/svg+xml'};
createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const target=resolve(root,`.${pathname==='/'?'/index.html':pathname}`);
    if(target!==root&&!target.startsWith(root+sep)){res.writeHead(403).end('Forbidden');return}
    const body=await readFile(target);
    res.writeHead(200,{'Content-Type':types[target.slice(target.lastIndexOf('.'))]||'application/octet-stream','Cache-Control':'no-cache'});
    res.end(req.method==='HEAD'?undefined:body);
  }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}).end('Not found')}
}).listen(Number(process.env.PORT)||8000,()=>console.log(`DAYTRACE is available at http://localhost:${Number(process.env.PORT)||8000}`));
