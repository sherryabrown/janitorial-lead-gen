import {JSDOM,VirtualConsole} from 'jsdom';
import {safePublicUrl} from './known-source-execution.mjs';
const clean=value=>String(value??'').replace(/\s+/g,' ').trim();

// Read the literal published navigation template; never execute portal scripts.
export function publicB2gDetailUrl(doc,row,spec) {
  const rid=row.getAttribute('href')?.match(/^javascript:\s*ViewDetail\('([A-F0-9]{16,128})'\);?$/)?.[1];
  const prefixes=[...doc.querySelectorAll('script')].flatMap(script=>[...script.textContent.matchAll(/src="(\/FrontEnd\/ProposalSearchPublicDetail\.asp\?XID=\d+&TN=[a-z0-9_-]+&PID=)' \+ RID/g)].map(m=>m[1]));
  if(!rid||new Set(prefixes).size!==1)throw Error('Published B2Gnow detail navigation changed');
  const url=new URL(prefixes[0]+rid,spec.urls[0]).href;
  if(!safePublicUrl(url,spec.allowed_hosts)||new URL(url).origin!==new URL(spec.urls[0]).origin)throw Error('Published detail leaves verified origin');
  return url;
}
export function inspectB2gDetail(body,record,spec) {
  const dom=new JSDOM(body.toString('utf8'),{virtualConsole:new VirtualConsole()});
  try {
    const doc=dom.window.document,fields=new Map();
    for(const row of doc.querySelectorAll('tr')) {
      const label=clean(row.querySelector('.field_label')?.textContent),data=row.querySelector('.field_data');
      if(label&&data){if(fields.has(label))throw Error('Duplicate public detail fields');fields.set(label,clean(data.textContent));}
    }
    if(fields.get('Reference Number')!==record.id||fields.get('Title/Brief Description')!==record.title||fields.get('Organization')!==spec.expected_organization)
      throw Error('Public detail identity does not match the saved listing');
    const description=fields.get('Description');if(!description)throw Error('Public detail description missing');
    const attached=fields.get('Attached File(s)')??'';
    const privateDocuments=/files present, sign on to view/i.test(attached);
    return {description,deadline_text:fields.get('Bids Due')??null,documents_access:privateDocuments?'sign_in_required':'not_verified',
      amendment_summary:fields.get('Amendments')??null,
      reason:privateDocuments
        ?'The official detail requires sign-in for files. Use the existing B2Gnow account or establish authorized document access, then verify amendments, routine service scope and the actual work site.'
        :'Public summary saved. Verify the linked documents, amendments, routine service scope and actual work site before importing.'};
  }finally{dom.window.close();}
}
