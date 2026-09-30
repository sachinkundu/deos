/** These responses accompany a retained original error, never replace it. */
export function sharedTestBrowserFailure(error:unknown,faultId:string):Response|null {
  if(!(error instanceof Error))return null;
  if(/^Navigation timeout of \d+ ms exceeded$/.test(error.message))
    return Response.json({error:'test_browser_navigation_timeout',faultId,
      recovery:'Read browser state. A navigation timeout does not prove the session ended. To reload saved drafts, navigate with beforeUnload:"accept".'},{status:504});
  if(error.message==='test_browser_command_busy')
    return Response.json({error:error.message,faultId,
      recovery:'A browser command is still running. Wait for it to finish, then read state before another action.'},{status:409});
  if(error.message.includes('test_browser_connect_http_410:') ||
      error.message==='test_browser_session_disappeared')
    return Response.json({error:'test_browser_session_closed',faultId,
      recovery:'Reset may replace one session after two provider absence reads. Inspect the new page; do not replay an uncertain submission.'},{status:410});
  return null;
}
