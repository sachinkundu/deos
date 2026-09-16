// Fixed browser-side instrumentation. Agents supply no JavaScript or rendered
// content; key labels come only from trusted DOM events in the running page.
export const keyTraceScript = `(enabled => {
  const name = '__deosEvidenceKeyTrace';
  const prior = window[name];
  if (!enabled) {
    if (prior) document.removeEventListener('keydown', prior.listener, true);
    document.querySelector('[data-deos-key-trace]')?.remove();
    delete window[name];
    return;
  }
  const state = prior || { keys: [] };
  let overlay = document.querySelector('[data-deos-key-trace]');
  if (!overlay) {
    overlay = document.createElement('aside');
    overlay.setAttribute('data-deos-key-trace', '');
    overlay.style.cssText = 'position:fixed;left:4px;right:4px;bottom:4px;z-index:2147483647;padding:6px;background:#fff;color:#111;border:1px solid #111;font:12px monospace;overflow-wrap:anywhere;pointer-events:none';
    document.body.append(overlay);
  }
  const render = () => {
    overlay.textContent = 'Evidence key trace | ' + location.origin + ' | ' + innerWidth + ' CSS px\\n' + state.keys.join(' · ');
  };
  if (!prior) {
    state.listener = event => {
      if (!event.isTrusted || event.target?.closest?.('[data-sensitive],input[type=password]')) return;
      const modifiers = [['ctrlKey','Control'],['metaKey','Meta'],['altKey','Alt'],['shiftKey','Shift']]
        .filter(([field, label]) => event[field] && event.key !== label).map(([, label]) => label);
      state.keys.push([...modifiers, event.key].join('+').slice(0, 80));
      state.keys = state.keys.slice(-60);
      render();
    };
    document.addEventListener('keydown', state.listener, true);
    window[name] = state;
  }
  render();
})`;

export const browserMeasurementScript = `JSON.stringify({
  origin: location.origin,
  viewport: { width: innerWidth, height: innerHeight, deviceScaleFactor: devicePixelRatio },
  document: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
  elements: Array.from(document.querySelectorAll('main,section,output,button,input,[role=button]')).slice(0,200).map(element => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const copy = element.cloneNode(true);
    copy.querySelectorAll('[data-sensitive],input[type=password]').forEach(node => node.replaceWith('[REDACTED]'));
    return { tag: element.tagName, id: element.id, text: element.closest('[data-sensitive],input[type=password]') ? '[REDACTED]' : copy.textContent.slice(0,500),
      left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height, fontSize: style.fontSize };
  })
})`;
