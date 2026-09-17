import puppeteer from "@cloudflare/puppeteer";
export default { async fetch(request,env) { const history=await puppeteer.history(env.BROWSER); return Response.json({history:history.filter(s=>s.sessionId==="697c2466-cb97-45c6-8e2c-764e226d0d0f"), total:history.length}); }};
