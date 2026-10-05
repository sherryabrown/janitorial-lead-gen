import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifiedUahtOpportunityMethod, uahtProcurementUrl } from '../scripts/lib/uaht-method-verification.mjs';
import { adapterContract } from '../scripts/lib/known-source-execution.mjs';

const source={id:'00000000-0000-4000-8000-000000000001',code:'ua-hope-texarkana',
  url:'https://www.uaht.edu/',source_coverage_areas:[{area_type:'city',city_name:'Texarkana',state_code:'AR'}]};
const geography={id:'ARM-test',kind:'municipality',name:'Texarkana',state_code:'AR',source_active:true};
const body=Buffer.from('<html><title>Procurement | UAHT</title><body><h1>Procurement</h1><h2>Current Solicitations</h2><h2>Intent to Award</h2></body></html>');
const capture={state:'captured',requested_url:uahtProcurementUrl,final_url:uahtProcurementUrl,
  content_type:'text/html',bytes:body.length,body,content_sha256:createHash('sha256').update(body).digest('hex')};

test('UAHT official listing registers only the bounded Texarkana opportunity check',()=>{
  const method=verifiedUahtOpportunityMethod(source,geography,capture);
  assert.equal(method.kind,'opportunity');
  assert.equal(method.method_spec.urls[0],uahtProcurementUrl);
  assert.equal(adapterContract(method,source).check_when,'each_request');
  assert.match(method.verification_evidence.coverage_limit,/work site/);
  assert.throws(()=>verifiedUahtOpportunityMethod(source,{...geography,name:'Hope'},capture),/Texarkana/);
  assert.throws(()=>verifiedUahtOpportunityMethod(source,geography,{...capture,body:Buffer.from('<title>Home</title>')}),/capture required/);
});
