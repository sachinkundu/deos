export async function createPortalCheckContexts(browser) {
  const reviewer = await browser.newContext();
  // Service-token responses can replace CF_Authorization. Keep their cookie
  // jar separate from the reviewer's API requests and browser navigation.
  const service = await browser.newContext();
  return { reviewer, service };
}
