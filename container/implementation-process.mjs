export function killProcessGroup(child, signal) {
  if (!child?.pid) return;
  try { process.kill(-child.pid, signal); }
  catch (error) { if (error.code !== "ESRCH") throw error; }
}

export async function stopProcessGroup(child) {
  if (!child?.pid) return;
  const closed = child.exitCode !== null || child.signalCode !== null;
  const exit = closed ? Promise.resolve() : new Promise(resolve => child.once("close", resolve));
  killProcessGroup(child, "SIGTERM");
  let timer;
  try {
    await Promise.race([exit, new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        try { killProcessGroup(child, "SIGKILL"); resolve(); }
        catch (error) { reject(error); }
      }, 3000);
    })]);
  } finally { clearTimeout(timer); }
}
