# sample behavior check

*2026-09-14T07:36:08Z by Showboat 0.6.1*
<!-- showboat-id: 570d4786-e661-481c-9520-325392fdcf21 -->

```bash
'runuser' '-u' 'deos-author' '--' 'env' '-i' 'PATH=/usr/local/bin:/usr/bin:/bin' 'HOME=/home/deos-author' 'node' '-e' 'fetch("http://127.0.0.1:8787/").then(r=>r.json()).then(v=>{if(v.count<2)process.exit(1);console.log(JSON.stringify(v))})'

```

```output
{"count":3}
```
