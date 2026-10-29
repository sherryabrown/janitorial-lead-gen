/* global Deno */
// Run with portable Deno 2. Parses deployed bytes; never imports or invokes the handler.
import {Parser} from 'https://deno.land/x/eszip@v0.109.0/mod.ts';
const root='outputs/deployment/scheduling-backup-readiness/';
const parser=await Parser.createInstance();
const specifiers=await parser.parseBytes(await Deno.readFile(root+'firecrawl-deployed-body.bin'));
await parser.load();
const modules=[];
for(const specifier of specifiers){
 // Supabase metadata entries may be binary. Its source entry can be a relative path.
 if(/\.(?:tsx?|jsx?|mjs|cjs|json)$/.test(specifier))modules.push({specifier,source:await parser.getModuleSource(specifier)});
}
const entry=modules.find(m=>m.specifier==='firecrawl-scrape/index.ts');
if(!entry?.source)throw Error('Expected deployed entrypoint was not recovered');
await Deno.writeTextFile(root+'firecrawl-modules-private.json',JSON.stringify({specifiers,modules}));
await Deno.mkdir(root+'edge-export/supabase/functions/firecrawl-scrape',{recursive:true});
await Deno.writeTextFile(root+'edge-export/supabase/functions/firecrawl-scrape/index.ts',entry.source);
console.log(JSON.stringify({archive_entries:specifiers.length,source_modules:modules.length,recovered_entrypoint:true}));
