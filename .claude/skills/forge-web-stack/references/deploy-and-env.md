# Deploy + env — the runbook (no CLI; it's blocked in the sandbox)

## 1. Build the zip (exclude secrets + internal files)
```
cd <site-root>
zip -r deploy.zip . -x 'config.env' -x '*.env' -x 'email-templates/*' -x 'node_modules/*' -x '*.git*'
```
Then **`node --check`** every function first, and **secret-scan the zip**:
```
grep -rlE 'sk-ant|xkeysib|pat[A-Za-z0-9]{14}|_KEY=|_TOKEN=' <site-root> --include='*.js' --include='*.html' --include='*.toml'
```
Expect empty. Secrets belong ONLY in Netlify env vars.

## 2. Deploy via Netlify Drop (browser upload)
- **New site:** go to `app.netlify.com/drop`. **Existing site:** its **Deploys** page.
- The drop input is a hidden `<input type=file id="dropzone-file-upload">` (accepts `.zip`) with class
  `tw-sr-only`. In a browser-automation tool, un-hide it (`el.classList.remove('tw-sr-only');
  el.removeAttribute('hidden'); el.style.cssText='position:fixed;...z-index:2147483647'`), then
  `file_upload` the zip to it. A `folder` input sits next to it — pick the `.zip` one.
- Wait, then confirm the deploy reads **Published** (the deploy page text can lag; also just fetch the
  live URL).
- **Always rebuild the zip from the SITE ROOT.** Zipping from a subfolder ships a broken, partial site
  that WIPES the live one on publish. Check the zip's file count/size before uploading.

## 3. Env vars
- Add secrets on the site's **Configuration → Environment variables** page: `ANTHROPIC_API_KEY`,
  `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID` (+ feature keys, `DESK_KEY`, `BREVO_*`, etc). Scope: all.
- **Netlify Drop binds env at upload time** — after adding/changing a var you MUST re-upload the zip
  for functions to see it. Forgetting this is the #1 "why doesn't it work" cause.
- You never type the user's secrets. Open the env page, tell them the exact var names + values to
  paste, and re-deploy once they confirm.

## 4. Verify live (prove it, don't assume)
- Fetch each function with a test payload; confirm 200 + the expected JSON shape.
- For writers: confirm the row landed in Airtable with the right computed values, then **delete the
  test row**.
- For gated dashboards: confirm wrong passcode → 401, right passcode → data.

## Airtable token scope
The function's `AIRTABLE_TOKEN` (a Personal Access Token) needs **`data.records:write`** +
`data.records:read` on the target base. A common miss: the token gets `data.recordComments:write`
instead of `data.records:write` → every create 403s with `INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND`.
Editing a PAT's scopes keeps the same token value (no re-paste needed).
