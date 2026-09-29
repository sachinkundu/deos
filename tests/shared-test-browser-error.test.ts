import assert from 'node:assert/strict';
import test from 'node:test';
import {sharedTestBrowserFailure} from '../src/shared-test-browser-error.ts';

test('saved navigation, busy and closed errors give different recovery paths',async()=>{
  for(const [message,status,code] of [
    ['Navigation timeout of 30000 ms exceeded',504,'test_browser_navigation_timeout'],
    ['test_browser_command_busy',409,'test_browser_command_busy'],
    ['Connect failed: test_browser_connect_http_410: Browser session is already closed',410,'test_browser_session_closed'],
  ] as const) {
    const response=sharedTestBrowserFailure(new Error(message),'saved-fault');
    assert.equal(response?.status,status);
    const body=await response!.json() as {faultId:string;error:string};
    assert.equal(body.faultId,'saved-fault');assert.equal(body.error,code);
  }
  assert.equal(sharedTestBrowserFailure(new Error('unexpected database failure'),'fault'),null);
});
