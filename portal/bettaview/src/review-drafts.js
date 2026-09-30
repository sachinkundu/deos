const VERSION = 1;

export function uuidv7(now = Date.now(), random = crypto.getRandomValues(new Uint8Array(10))) {
  const bytes = new Uint8Array(16);
  let timestamp = BigInt(now);
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number(timestamp & 0xffn);
    timestamp >>= 8n;
  }
  bytes.set(random.slice(0, 10), 6);
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export function draftStorageKey(prUrl, headSha) {
  return `bettaview:review-draft:v1:${prUrl}:${headSha}`;
}

export function newReviewDraft(prUrl, headSha, now = Date.now()) {
  return { version: VERSION, reviewId: uuidv7(now), prUrl, headSha, event: "COMMENT", items: [], updatedAt: now };
}

export function restoreReviewDraft(storage, prUrl, headSha) {
  try {
  let raw = storage?.getItem(draftStorageKey(prUrl, headSha));
  if (!raw) {
    const priorHead=storage?.getItem(`bettaview:review-draft:latest:${prUrl}`);
    const prior=priorHead && storage?.getItem(draftStorageKey(prUrl,priorHead));
    if (prior) {
      const value=JSON.parse(prior);
      if(value.version===VERSION && value.prUrl===prUrl && Array.isArray(value.items)) {
        const next={...newReviewDraft(prUrl,headSha),items:value.items,event:value.event,reviewBody:value.reviewBody||'',
          priorReviewId:value.reviewId,supersedesReviewId:value.supersedesReviewId||null};
        persistReviewDraft(storage,next);
        raw=JSON.stringify(next);
      }
    }
  }
  if (!raw) return newReviewDraft(prUrl, headSha);
    const value = JSON.parse(raw);
    if (value.version !== VERSION || value.prUrl !== prUrl || value.headSha !== headSha
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.reviewId)
      || !Array.isArray(value.items)) return newReviewDraft(prUrl, headSha);
    return value;
  } catch (error) {
    console.warn('Saved review draft could not be restored',error);
    return newReviewDraft(prUrl, headSha);
  }
}

export function persistReviewDraft(storage, draft, now = Date.now()) {
  const value = { ...draft, version: VERSION, updatedAt: now };
  storage?.setItem(draftStorageKey(value.prUrl, value.headSha), JSON.stringify(value));
  storage?.setItem(`bettaview:review-draft:latest:${value.prUrl}`,value.headSha);
  return value;
}

export function discardReviewDraft(storage, draft) {
  storage?.removeItem(draftStorageKey(draft.prUrl, draft.headSha));
}

export function applyReviewReceiptsToDraft(draft, status) {
  if (!status?.reviewId || status.reviewId !== draft.reviewId) return draft;
  const published = new Map((status.parts || [])
    .filter(part => part.contentItemId && part.url && ["done", "published_prior_intent"].includes(part.status))
    .map(part => [part.contentItemId, part.url]));
  let changed = false;
  const items = draft.items.map(item => {
    const url = published.get(item.clientSubmissionId);
    if (!url || item.alreadyPublishedUrl === url) return item;
    changed = true;
    return {...item, alreadyPublishedUrl: url};
  });
  return changed ? {...draft, items} : draft;
}
