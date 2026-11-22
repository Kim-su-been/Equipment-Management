export async function openDemoSettings(page) {
  if (
    !(await page
      .getByRole("dialog", { name: "시연 설정", exact: true })
      .count())
  )
    await page.getByRole("button", { name: "시연 설정", exact: true }).click();
}
export async function closeDemoSettings(page) {
  if (
    await page.getByRole("dialog", { name: "시연 설정", exact: true }).count()
  )
    await page
      .getByRole("button", { name: "시연 설정 닫기", exact: true })
      .click();
}
export async function chooseDemoRole(page, value, pid) {
  await openDemoSettings(page);
  await page.getByLabel("검토 화면 역할").selectOption(value);
  if (value === "member" && pid)
    await page.getByLabel("시연 수행사 인원").selectOption(pid);
  await closeDemoSettings(page);
}
