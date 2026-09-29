import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {withSharedTestBrowserLock} from '../src/shared-test-browser-lock.ts';

test('page calls and maintenance cannot attach to the same browser concurrently',async()=>{
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE test_browser_command_locks(lease_id TEXT,service_name TEXT,operation_id TEXT,expires_at TEXT,PRIMARY KEY(lease_id,service_name))');
  const db={prepare:(sql:string)=>({bind:(...v:never[])=>({run:async()=>({meta:{changes:sqlite.prepare(sql).run(...v).changes}})})})} as unknown as D1Database;
  let release!:()=>void,started!:()=>void;
  const entered=new Promise<void>(resolve=>{started=resolve;});
  const held=new Promise<void>(resolve=>{release=resolve;});
  try {
    const first=withSharedTestBrowserLock(db,'lease','bettaview',async()=>{started();await held;return 'done';});
    await entered;
    assert.equal(await withSharedTestBrowserLock(db,'lease','bettaview',async()=>{throw new Error('must not connect');},()=>false),false);
    await assert.rejects(withSharedTestBrowserLock(db,'lease','bettaview',async()=>{}),/command_busy/);
    release();assert.equal(await first,'done');
    const original=new Error('browser disconnected');
    await assert.rejects(withSharedTestBrowserLock(db,'lease','bettaview',async()=>{throw original;}),error=>error===original);
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM test_browser_command_locks').get()!.n,0);
  } finally {release?.();sqlite.close();}
});
