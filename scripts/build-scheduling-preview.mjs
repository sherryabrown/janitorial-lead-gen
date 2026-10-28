import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Deliberately has no .env loader or Production configuration path. The local
// Auth facade accepts sample signed sessions, not real Supabase credentials.
export async function buildSchedulingPreview(){
 const site=resolve('outputs/deployment/scheduling-preview/site');await mkdir(site,{recursive:true});
 await build({entryPoints:['src/dev/SchedulingPreview.tsx'],bundle:true,splitting:true,jsx:'automatic',format:'esm',outdir:site,entryNames:'preview',define:{'import.meta.env':JSON.stringify({VITE_SUPABASE_URL:'http://127.0.0.1:5174',VITE_SUPABASE_PUBLISHABLE_KEY:'local-preview-public',VITE_PROCUREMENT_API_URL:'http://127.0.0.1:8091'})}});
 await writeFile(resolve(site,'index.html'),'<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Scheduling dev preview</title><link rel="stylesheet" href="/preview.css"></head><body><div id="root"></div><script type="module" src="/preview.js"></script></body></html>');
 return site;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 await buildSchedulingPreview();console.log('Built the local scheduling preview; Production configuration is unchanged.');
}
