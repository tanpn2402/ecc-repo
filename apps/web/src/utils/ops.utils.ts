import { OpsImportActivity } from "@/types";
import dayjs from "dayjs";

export const getOpsScript = (
  tasks: OpsImportActivity[],
  { isAutoSubmit = false },
) => {
  const scripts: string[] = [];

  const groupedTasks = tasks.reduce<Record<string, typeof tasks>>(
    (acc, task) => {
      if (!acc[task.date]) {
        acc[task.date] = [];
      }
      acc[task.date].push(task);
      return acc;
    },
    {},
  );

  for (const [date, tasks] of Object.entries(groupedTasks)) {
    const dateStr = dayjs(date).format("DD-MMM-YYYY");
    scripts.push(`
(() => {
  let el = document.evaluate(
    "//span[contains(., '${dateStr}')]",
    document,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null
  ).singleNodeValue;`);
    scripts.push(`  const tr = el.closest('tr');`);
    scripts.push(
      `  const btnAddProjectRole = tr.querySelector('a.btnAddProjectRole');`,
    );

    for (let index = 0; index < tasks.length; index++) {
      const task = tasks[index];
      const projectOptionId = task.opsProjectOptId;
      const projectId = task.opsProjectValueId;

      if (!projectOptionId || !projectId) continue;

      scripts.push(`  setTimeout(() => {`);
      scripts.push(`    btnAddProjectRole.click();`);
      scripts.push(`    const nextTr = tr.nextElementSibling;`);
      scripts.push(
        `    const projectRoleContainer = nextTr.querySelectorAll('div[class="AttendanceProjectRoleContainer"]')[${index}];`,
      );
      scripts.push(
        `    const select = projectRoleContainer.querySelector('select');`,
      );
      scripts.push(`    select.value = "${projectOptionId}";`);
      scripts.push(`    const hiddenInput = select.nextElementSibling;`);
      scripts.push(`    hiddenInput.value = "${projectId}";`);
      scripts.push(
        `    projectRoleContainer.querySelector('input[placeholder="Effort Rate"]').value = ${task.effort};`,
      );
      scripts.push(
        `    projectRoleContainer.querySelector('input[placeholder="Remark"]').value = '${task.title}';`,
      );
      scripts.push(`  }, ${index * 100});`);
    }
    scripts.push(`}).call();`);
  }

  if (isAutoSubmit) {
    const timeout =
      Math.max(...Object.values(groupedTasks).map((tasks) => tasks.length)) *
        100 +
      500;
    scripts.push(
      `setTimeout(() => document.querySelector('button[class="btn btn-lg btn-primary Save"]').click(), ${timeout})`,
    );
  }

  return scripts.join("\n");
};
