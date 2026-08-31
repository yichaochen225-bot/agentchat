function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function firstVisible(page, selectors, timeoutPerSelector = 1600) {
  for (const selector of selectors || []) {
    const locator = page.locator(selector).last();
    try {
      if (await locator.isVisible({ timeout: timeoutPerSelector })) return locator;
    } catch (_) {
      // Selector drift is expected. Try the next semantic tier.
    }
  }
  return null;
}

async function isAnyVisible(page, selectors) {
  for (const selector of selectors || []) {
    try {
      if (await page.locator(selector).last().isVisible({ timeout: 250 })) return true;
    } catch (_) {}
  }
  return false;
}

function hostMatches(hostname, patterns = []) {
  return patterns.some((pattern) => hostname === pattern || hostname.endsWith(`.${pattern}`));
}

export async function probeProvider(page, provider) {
  await page.goto(provider.url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1800);

  const current = new URL(page.url());
  const onProvider = hostMatches(current.hostname, provider.hosts || []);
  const onAuth = hostMatches(current.hostname, provider.authHosts || [])
    || (provider.authPathPatterns || []).some((pattern) => pattern.test(current.pathname));
  const signedOut = await isAnyVisible(page, provider.signedOutSelectors || []);
  const editor = onProvider ? await firstVisible(page, provider.editorSelectors || [], 900) : null;

  let state = "unknown";
  if (editor && signedOut) state = "guest";
  else if (editor) state = "ready";
  else if (onAuth || signedOut || !onProvider) state = "auth_required";
  else state = "page_changed";

  return {
    provider: provider.key,
    state,
    title: await page.title().catch(() => ""),
    url: page.url()
  };
}

async function captureBaseline(page, selectors) {
  const baseline = [];
  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);
    let text = "";
    if (count > 0) text = await locator.last().innerText().catch(() => "");
    baseline.push({ selector, count, text: text.trim() });
  }
  return baseline;
}

async function readNewestResponse(page, baseline) {
  for (const item of baseline) {
    const locator = page.locator(item.selector);
    const count = await locator.count().catch(() => 0);
    if (count <= 0) continue;
    const text = (await locator.last().innerText().catch(() => "")).trim();
    if (!text) continue;
    if (count > item.count || text !== item.text) return text;
  }
  return "";
}

async function waitForStableResponse(page, provider, baseline) {
  const startedAt = Date.now();
  let lastText = "";
  let lastChangedAt = Date.now();

  while (Date.now() - startedAt < provider.timeoutMs) {
    const text = await readNewestResponse(page, baseline);
    if (text && text !== lastText) {
      lastText = text;
      lastChangedAt = Date.now();
    }

    const stopVisible = await isAnyVisible(page, provider.stopSelectors || []);
    const stableFor = Date.now() - lastChangedAt;
    if (
      lastText.length >= provider.minResponseLength &&
      stableFor >= provider.stabilityMs &&
      !stopVisible
    ) {
      return lastText;
    }

    await sleep(1200);
  }

  if (lastText.length >= provider.minResponseLength) return lastText;
  const error = new Error(`${provider.name} response timed out`);
  error.code = "RESPONSE_TIMEOUT";
  throw error;
}

async function typePrompt(page, editor, prompt) {
  await editor.click({ timeout: 5000 });
  try {
    await editor.fill("");
    await editor.fill(prompt);
    return;
  } catch (_) {}

  await page.keyboard.press("ControlOrMeta+a").catch(() => {});
  await page.keyboard.press("Backspace").catch(() => {});
  await page.keyboard.insertText(prompt);
}

async function sendPrompt(page, provider, editor) {
  const button = await firstVisible(page, provider.sendSelectors || [], 900);
  if (button) {
    await button.click({ timeout: 5000 });
    return;
  }
  await editor.press(provider.sendFallback || "Enter");
}

export async function runProvider(page, provider, prompt) {
  if (!prompt || !String(prompt).trim()) {
    const error = new Error("Prompt is required");
    error.code = "INVALID_PROMPT";
    throw error;
  }

  const status = await probeProvider(page, provider);
  if (status.state === "auth_required") {
    const error = new Error(`${provider.name} requires login`);
    error.code = "AUTH_REQUIRED";
    error.details = status;
    throw error;
  }
  if (status.state !== "ready") {
    const error = new Error(`${provider.name} editor was not found; the page may have changed`);
    error.code = "EDITOR_NOT_FOUND";
    error.details = status;
    throw error;
  }

  const editor = await firstVisible(page, provider.editorSelectors, 1800);
  if (!editor) {
    const error = new Error(`${provider.name} editor was not found`);
    error.code = "EDITOR_NOT_FOUND";
    throw error;
  }

  const baseline = await captureBaseline(page, provider.responseSelectors);
  await typePrompt(page, editor, String(prompt).trim());
  await sendPrompt(page, provider, editor);
  const response = await waitForStableResponse(page, provider, baseline);

  return {
    provider: provider.key,
    response,
    url: page.url(),
    access: status.state
  };
}
