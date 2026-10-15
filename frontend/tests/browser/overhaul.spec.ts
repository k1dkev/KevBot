import { expect, test } from "@playwright/test";

test("search URLs, tab changes, scope and history reproduce visible state", async ({ page }) => {
  await page.goto("/search?q=beta&type=all&sort=name&order=asc&include_deleted=false");
  await expect(page).toHaveURL(/type=tracks/);
  await expect(page.getByRole("textbox", { name: "Global search" })).toHaveValue("beta");
  await expect(page.getByRole("button", { name: "Tracks", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Include deleted" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("beta001", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Sort by" }).selectOption("created_at");
  await expect(page).toHaveURL(/sort=created_at/);
  await page.getByRole("button", { name: "Playlists", exact: true }).click();
  await expect(page).toHaveURL(/type=playlists/);
  await expect(page.getByRole("row").filter({ hasText: "favorites" })).toBeVisible();
  await page.goBack();
  await expect(page.getByText("beta001", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Sort by" })).toHaveValue("created_at");
  await page.getByRole("button", { name: "My Playlists", exact: true }).click();
  await expect(page).toHaveURL(/\/user\/1\/search\?type=playlists/);
  await expect(page.getByRole("textbox", { name: "Global search" })).toHaveValue("");
  await expect(page.getByRole("row").filter({ hasText: "favorites" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Playlists", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("an old pagination response cannot append into a newer search", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let held = false;
  let finished!: () => void;
  const fulfilled = new Promise<void>((resolve) => { finished = resolve; });
  await page.route("**/v1/search?**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("q") === "alpha" && Number(url.searchParams.get("offset")) > 0) {
      held = true;
      const response = await route.fetch();
      await gate;
      await route.fulfill({ response });
      finished();
    } else await route.continue();
  });
  try {
    await page.goto("/search?q=alpha&type=tracks");
    await expect(page.getByText("alpha001", { exact: true })).toBeVisible();
    await page.locator(".kb-view-fill-scroll").evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await expect.poll(() => held).toBe(true);
    await page.getByRole("textbox", { name: "Global search" }).fill("beta");
    await expect(page.getByText("beta001", { exact: true })).toBeVisible();
    release();
    await fulfilled;
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.getByText(/alpha\d+/)).toHaveCount(0);
    await expect(page.getByText("Showing 3 of 3 results")).toBeVisible();
  } finally { release(); }
});

test("an earlier first page cannot replace a newer A-to-B-to-A search", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let held = false;
  let finished!: () => void;
  const fulfilled = new Promise<void>((resolve) => { finished = resolve; });
  await page.route("**/v1/search?**", async (route) => {
    const url = new URL(route.request().url());
    if (!held && url.searchParams.get("q") === "alpha" && Number(url.searchParams.get("offset")) === 0) {
      held = true;
      const response = await route.fetch();
      const body = await response.json();
      body.data = [{ ...body.data[0], name: "obsoleteinitial" }];
      body.pagination = { ...body.pagination, total: 1, has_next: false };
      await gate;
      await route.fulfill({ response, json: body });
      finished();
    } else await route.continue();
  });
  try {
    await page.goto("/search?q=alpha&type=tracks");
    await expect.poll(() => held).toBe(true);
    const search = page.getByRole("textbox", { name: "Global search" });
    await search.fill("beta");
    await expect(page.getByText("beta001", { exact: true })).toBeVisible();
    await search.fill("alpha");
    await expect(page.getByText("alpha001", { exact: true })).toBeVisible();
    release();
    await fulfilled;
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.getByText("obsoleteinitial", { exact: true })).toHaveCount(0);
    await expect(page.getByText("alpha001", { exact: true })).toBeVisible();
  } finally { release(); }
});

test("keyboard playback and seeking work without hover; placeholders are honest", async ({ page }) => {
  await page.goto("/search?type=tracks");
  const play = page.getByRole("button", { name: "Play clip001", exact: true });
  await expect(play).toBeAttached();
  await play.focus();
  await play.press("Enter");
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const seek = page.getByRole("slider", { name: "Seek", exact: true });
  await expect(seek).toBeEnabled();
  await seek.focus();
  const before = Number(await seek.inputValue());
  await seek.press("ArrowRight");
  await expect.poll(async () => Number(await seek.inputValue())).toBeGreaterThan(before);
  await expect(page.getByRole("button", { name: "Shuffle unavailable" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Repeat unavailable" })).toBeDisabled();
  await page.goto("/user/1");
  await expect(page.getByText("smokeuser", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("9,000", { exact: true })).toHaveCount(0);
  await page.goto("/playlist/10");
  await expect(page.getByRole("heading", { name: "favorites", exact: true })).toBeVisible();
  await expect(page.getByText("9,000", { exact: true })).toHaveCount(0);
});

test("missing session returns the visitor to login", async ({ page }) => {
  await page.route("**/v1/auth/refresh", (route) => route.fulfill({ status: 401, contentType: "application/json", body: '{}' }));
  await page.goto("/search");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("button", { name: /Discord/i })).toBeVisible();
});

test("clearing a playlist scope preserves the query and sort options", async ({ page }) => {
  await page.goto("/playlist/10?q=beta&sort=name&order=asc");
  await expect(page.getByRole("heading", { name: "favorites", exact: true })).toBeVisible();
  await expect(page.getByText("beta001", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear playlist filter" }).click();
  await expect(page).toHaveURL(/\/search\?/);
  await expect(page).toHaveURL(/q=beta/);
  await expect(page).toHaveURL(/sort=name/);
  await expect(page).toHaveURL(/order=asc/);
  await expect(page.getByRole("textbox", { name: "Global search" })).toHaveValue("beta");
  await expect(page.getByText("beta001", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear playlist filter" })).toHaveCount(0);
});
