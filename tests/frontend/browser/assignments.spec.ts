import type { Page } from "@playwright/test";
import { test, expect } from "./support/account-fixture";
import { reviewSyllabus, signUpWithCourse } from "./support/syllabus";

function offsetDate(days: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function weekLabel(date: string) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() - value.getDay());

  return `Week of ${value.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  })}`;
}

async function addEvent(
  page: Page,
  title: string,
  kind: string,
  date: string,
  time: string,
  course = "CSE 442",
) {
  await page.goto(`/schedule?date=${date}`);
  await page.getByRole("button", { name: "Add event" }).click();

  const dialog = page.getByRole("dialog", {
    name: "Make room for what’s next",
  });

  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByLabel("Course").selectOption({ label: course });
  await dialog.getByLabel("Event type").selectOption(kind);
  await dialog.getByLabel("Date").fill(date);
  await dialog.getByLabel("Time").fill(time);
  await dialog.getByRole("button", { name: "Create event" }).click();

  await expect(dialog).toHaveCount(0);
}

async function addSemesterEvents(page: Page) {
  await addEvent(
    page,
    "Homework 5",
    "assignment",
    offsetDate(1),
    "23:59",
  );

  await addEvent(
    page,
    "Midterm",
    "exam",
    offsetDate(10),
    "14:00",
  );

  await addEvent(
    page,
    "Final project",
    "deadline",
    offsetDate(40),
    "",
  );

  await addEvent(
    page,
    "Lecture 12",
    "lecture",
    offsetDate(0),
    "10:00",
  );

  await addEvent(
    page,
    "Gym",
    "other",
    offsetDate(1),
    "18:00",
    "Personal",
  );
}

function assignmentRow(page: Page, title: string) {
  return page.getByRole("button", {
    name: new RegExp(title),
  });
}

test(
  "Task test 1 - Assignments opens from the menu and shows the empty state",
  async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "Desktop task test",
    );

    await signUpWithCourse(
      page,
      "notely-assignments-empty-442@example.edu",
    );

    await page
      .getByRole("link", {
        name: "Assignments",
        exact: true,
      })
      .click();

    await expect(
      page.getByRole("heading", {
        name: "Assignments",
        exact: true,
      }),
    ).toBeVisible();

    await expect(
      page.getByText(
        "Everything due this semester, in order.",
        { exact: true },
      ),
    ).toBeVisible();

    await expect(
      page.getByRole("heading", {
        name: "Nothing due yet",
        exact: true,
      }),
    ).toBeVisible();

    await expect(
      page.getByText(
        "Add events in your schedule or upload a syllabus.",
        { exact: true },
      ),
    ).toBeVisible();
  },
);

test(
  "Task test 2 - events are grouped by week and lectures are omitted",
  async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "Desktop task test",
    );

    await signUpWithCourse(
      page,
      "notely-assignments-order-442@example.edu",
    );

    await addSemesterEvents(page);

    await page.goto("/assignments");

    await expect(
      page.getByRole("heading", {
        name: weekLabel(offsetDate(1)),
        exact: true,
      }),
    ).toBeVisible();

    await expect(
      page.getByRole("heading", {
        name: weekLabel(offsetDate(10)),
        exact: true,
      }),
    ).toBeVisible();

    await expect(
      page.getByRole("heading", {
        name: weekLabel(offsetDate(40)),
        exact: true,
      }),
    ).toBeVisible();

    await expect(
      assignmentRow(page, "Lecture 12"),
    ).toHaveCount(0);

    await expect(
      assignmentRow(page, "Gym"),
    ).toBeVisible();

    await expect(
      assignmentRow(page, "Homework 5"),
    ).toBeVisible();

    await expect(
      assignmentRow(page, "Midterm"),
    ).toBeVisible();

    await expect(
      assignmentRow(page, "Final project"),
    ).toBeVisible();

    const rows = (
      await page
        .getByRole("main")
        .getByRole("button")
        .allTextContents()
    )
      .filter((text) =>
        [
          "Gym",
          "Homework 5",
          "Midterm",
          "Final project",
        ].some((title) => text.includes(title)),
      )
      .map(
        (text) =>
          [
            "Gym",
            "Homework 5",
            "Midterm",
            "Final project",
          ].find((title) => text.includes(title))!,
      );

    expect(rows).toEqual([
      "Gym",
      "Homework 5",
      "Midterm",
      "Final project",
    ]);
  },
);

test(
  "Task test 3 - course filters, past items, and Event details work",
  async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "Desktop task test",
    );

    await signUpWithCourse(
      page,
      "notely-assignments-filter-442@example.edu",
    );

    await addSemesterEvents(page);

    await addEvent(
      page,
      "Homework 4",
      "assignment",
      offsetDate(-1),
      "",
    );

    await page.goto("/assignments");

    const filter = page.getByRole("combobox");

    await filter.selectOption({ label: "Personal" });

    await expect(
      assignmentRow(page, "Gym"),
    ).toBeVisible();

    await expect(
      assignmentRow(page, "Homework 5"),
    ).toHaveCount(0);

    await filter.selectOption({ label: "CSE 442" });

    await expect(
      assignmentRow(page, "Gym"),
    ).toHaveCount(0);

    await expect(
      assignmentRow(page, "Homework 5"),
    ).toBeVisible();

    await expect(
      assignmentRow(page, "Midterm"),
    ).toBeVisible();

    await filter.selectOption({ label: "All" });

    await expect(
      assignmentRow(page, "Gym"),
    ).toBeVisible();

    await expect(
      assignmentRow(page, "Homework 5"),
    ).toBeVisible();

    await expect(
      assignmentRow(page, "Homework 4"),
    ).toHaveCount(0);

    await page
      .getByRole("button", {
        name: "Show past items",
      })
      .click();

    await expect(
      page.getByRole("heading", {
        name: "Earlier this semester",
        exact: true,
      }),
    ).toBeVisible();

    await expect(
      assignmentRow(page, "Homework 4"),
    ).toBeVisible();

    await page
      .getByRole("button", {
        name: "Hide past items",
      })
      .click();

    await expect(
      page.getByRole("heading", {
        name: "Earlier this semester",
        exact: true,
      }),
    ).toHaveCount(0);

    await assignmentRow(page, "Midterm").click();

    const details = page.getByRole("dialog", {
      name: "Event details",
    });

    await expect(details).toBeVisible();

    await expect(
      details.getByLabel("Title"),
    ).toHaveValue("Midterm");
  },
);

test(
  "Task test 4 - syllabus events appear in their due-date weeks",
  async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "Desktop task test",
    );

    await signUpWithCourse(
      page,
      "notely-assignments-syllabus-442@example.edu",
    );

    const dialog = await reviewSyllabus(
      page,
      [
        "Review quiz December 1, 2026",
        "Final exam December 10, 2026 at 8:00 AM",
      ].join("\n"),
      "cse442-final-weeks.txt",
    );

    await dialog
      .getByRole("button", {
        name: "Add to schedule",
      })
      .click();

    await dialog
      .getByRole("button", {
        name: "All done",
      })
      .click();

    await page.goto("/assignments");

    await expect(
      page.getByRole("heading", {
        name: "Week of November 29",
        exact: true,
      }),
    ).toBeVisible();

    await expect(
      assignmentRow(page, "Review quiz"),
    ).toBeVisible();

    await expect(
      page.getByRole("heading", {
        name: "Week of December 6",
        exact: true,
      }),
    ).toBeVisible();

    await expect(
      assignmentRow(page, "Final exam"),
    ).toBeVisible();
  },
);

test(
  "Task test 5 - signed-out visitors cannot open Assignments",
  async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "Desktop task test",
    );

    await page.goto("/assignments");

    await expect(
      page.getByRole("heading", {
        name: "Good to see you again.",
        exact: true,
      }),
    ).toBeVisible();

    await expect(
      page.getByRole("heading", {
        name: "Assignments",
        exact: true,
      }),
    ).toHaveCount(0);
  },
);

test(
  "Task test 6 - Assignments fits on a phone",
  async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile",
      "Phone-only task test",
    );

    await signUpWithCourse(
      page,
      "notely-assignments-mobile-442@example.edu",
    );

    const dialog = await reviewSyllabus(
      page,
      [
        "Review quiz December 1, 2026",
        "Final exam December 10, 2026 at 8:00 AM",
      ].join("\n"),
      "cse442-final-weeks-mobile.txt",
    );

    await dialog
      .getByRole("button", {
        name: "Add to schedule",
      })
      .click();

    await dialog
      .getByRole("button", {
        name: "All done",
      })
      .click();

    await page
      .getByRole("link", {
        name: "Assignments",
        exact: true,
      })
      .click();

    await expect(
      assignmentRow(page, "Review quiz"),
    ).toBeVisible();

    await expect(
      assignmentRow(page, "Final exam"),
    ).toBeVisible();

    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );

    const clientWidth = await page.evaluate(
      () => document.documentElement.clientWidth,
    );

    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  },
);