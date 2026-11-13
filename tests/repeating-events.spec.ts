import type { Page } from "@playwright/test";
import {
  test,
  expect,
} from "./support/account-fixture";

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(
    date.getMonth() + 1,
  ).padStart(2, "0");
  const day = String(
    date.getDate(),
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDays(
  date: string,
  amount: number,
) {
  const value = new Date(
    `${date}T12:00:00`,
  );

  value.setDate(
    value.getDate() + amount,
  );

  return dateKey(value);
}

function nextWeekday(
  weekday: number,
) {
  const today = new Date();
  const result = new Date(today);

  let difference =
    (weekday - today.getDay() + 7) %
    7;

  if (difference === 0) {
    difference = 7;
  }

  result.setDate(
    result.getDate() + difference,
  );

  return dateKey(result);
}

async function openAddEvent(page: Page) {
  await page.goto("/");

  await page
    .getByRole("button", {
      name: "Create your workspace",
    })
    .click();

  await page
    .getByLabel("Your name")
    .fill("Controls Tester");

  await page
    .getByLabel("Email address")
    .fill("notely-task150-442@example.edu");

  await page
    .getByLabel("Password", {
      exact: true,
    })
    .fill("Sample river password 42!");

  await page
    .getByLabel("Confirm password", {
      exact: true,
    })
    .fill("Sample river password 42!");

  await page
    .getByRole("button", {
      name: "Create account",
      exact: true,
    })
    .click();

  await page
    .getByLabel("I saved my recovery code")
    .check();

  await page
    .getByRole("button", {
      name: "Continue",
      exact: true,
    })
    .click();

  await page
    .getByRole("button", {
      name: "Skip for now",
    })
    .click();

  await page
    .getByRole("button", {
      name: "I’ll do this later",
    })
    .click();

  await page
    .getByRole("button", {
      name: "Let’s begin",
    })
    .click();

  await page.goto("/schedule");

  await expect(
    page.getByRole("heading", {
      name: "Your schedule",
    }),
  ).toBeVisible();

  await page
    .getByRole("button", {
      name: "Add event",
      exact: true,
    })
    .click();

  await expect(
    page.getByRole("dialog"),
  ).toBeVisible();
}

test.describe("repeating event controls", () => {
  test("repeat controls", async ({
    page,
  }, testInfo) => {
    test.skip(
      !["chromium", "mobile"].includes(
        testInfo.project.name,
      ),
      "Repeat controls task test",
    );

    await openAddEvent(page);

    const dialog =
      page.getByRole("dialog");

    const repeats =
      dialog.getByLabel("Repeats");

    await expect(repeats).toHaveValue("");

    await expect(
      dialog.getByRole("group", {
        name: "Repeat days",
      }),
    ).toHaveCount(0);

    await expect(
      dialog.getByLabel("Ends on"),
    ).toHaveCount(0);

    const monday =
      nextWeekday(1);

    await dialog
      .getByLabel("Date")
      .fill(monday);

    await repeats.selectOption("1");

    const days =
      dialog.getByRole("group", {
        name: "Repeat days",
      });

    await expect(days).toBeVisible();

    for (const day of [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ]) {
      await expect(
        days.getByRole("button", {
          name: day,
        }),
      ).toBeVisible();
    }

    await expect(
      days.getByRole("button", {
        name: "Monday",
      }),
    ).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await expect(
      dialog.getByLabel("Ends on"),
    ).toBeVisible();

    if (
      testInfo.project.name ===
      "mobile"
    ) {
      const mondayButton =
        days.getByRole("button", {
          name: "Monday",
        });

      await mondayButton.focus();

      await expect(
        mondayButton,
      ).toBeFocused();

      await page.keyboard.press(
        "Space",
      );

      await expect(
        mondayButton,
      ).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    }
  });

  test("repeat validation", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !==
        "chromium",
      "Desktop task test",
    );

    await openAddEvent(page);

    const dialog =
      page.getByRole("dialog");

    const tomorrow =
      addDays(dateKey(new Date()), 1);

    await dialog
      .getByLabel("Title")
      .fill("Bad repeat");

    await dialog
      .getByLabel("Date")
      .fill(tomorrow);

    await dialog
      .getByLabel("Repeats")
      .selectOption("1");

    const endsOn =
      dialog.getByLabel("Ends on");

    await endsOn.fill(
      addDays(tomorrow, -1),
    );

    await dialog
      .getByRole("button", {
        name: "Create event",
      })
      .click();

    await expect(
      dialog.getByRole("alert"),
    ).toHaveText(
      "Choose an end date after the start date.",
    );

    await expect(dialog).toBeVisible();

    const twoYearsLater =
      new Date(
        `${tomorrow}T12:00:00`,
      );

    twoYearsLater.setFullYear(
      twoYearsLater.getFullYear() + 2,
    );

    await endsOn.fill(
      dateKey(twoYearsLater),
    );

    await dialog
      .getByRole("button", {
        name: "Create event",
      })
      .click();

    await expect(
      dialog.getByRole("alert"),
    ).toHaveText(
      "Repeating events can run for at most one year.",
    );

    await endsOn.fill(
      addDays(tomorrow, 7),
    );

    const selectedDay =
      dialog.locator(
        '[aria-label="Repeat days"] button[aria-pressed="true"]',
      );

    await selectedDay.click();

    await dialog
      .getByRole("button", {
        name: "Create event",
      })
      .click();

    await expect(
      dialog.getByRole("alert"),
    ).toHaveText(
      "Choose at least one day.",
    );

    await expect(dialog).toBeVisible();
  });

  test("saves the repeat rule", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !==
        "chromium",
      "Desktop task test",
    );

    await openAddEvent(page);

    const dialog =
      page.getByRole("dialog");

    const monday =
      nextWeekday(1);

    await dialog
      .getByLabel("Title")
      .fill("Work shift");

    await dialog
      .getByLabel("Course")
      .selectOption("");

    await dialog
      .getByLabel("Event type")
      .selectOption("other");

    await dialog
      .getByLabel("Date")
      .fill(monday);

    await dialog
      .getByLabel("Time")
      .fill("17:00");

    await dialog
      .getByLabel("Repeats")
      .selectOption("1");

    await dialog
      .getByRole("button", {
        name: "Wednesday",
      })
      .click();

    const endDate =
      addDays(monday, 20);

    await dialog
      .getByLabel("Ends on")
      .fill(endDate);

    await dialog
      .getByRole("button", {
        name: "Create event",
      })
      .click();

    await expect(dialog).toBeHidden();

    await page.goto(
      `/schedule?date=${monday}`,
    );

    await page
      .getByText("Work shift", {
        exact: true,
      })
      .last()
      .click();

    const details =
      page.getByRole("dialog");

    await expect(
      details.getByLabel("Repeats"),
    ).toHaveValue("1");

    await expect(
      details.getByRole("button", {
        name: "Monday",
      }),
    ).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await expect(
      details.getByRole("button", {
        name: "Wednesday",
      }),
    ).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await expect(
      details.getByLabel("Ends on"),
    ).toHaveValue(endDate);
    });

    test("repeated events appear on each scheduled day", async ({ page }) => {
    await openAddEvent(page);

    const dialog = page.getByRole("dialog");

    await dialog.getByLabel("Title").fill("Work shift");
    await dialog.getByLabel("Date").fill("2026-11-16");
    await dialog.getByLabel("Time").fill("10:00");

    await dialog
        .getByLabel("Repeats")
        .selectOption("1");

    await dialog
        .getByRole("button", {
        name: "Wednesday",
        })
        .click();

    await dialog
        .getByLabel("Ends on")
        .fill("2026-11-30");

    await dialog
        .getByRole("button", {
        name: "Create event",
        })
        .click();

    for (const date of [
        "2026-11-16",
        "2026-11-18",
        "2026-11-23",
        "2026-11-25",
        "2026-11-30",
    ]) {
        await page.goto(`/schedule?date=${date}`);

        await expect(
        page.getByText("Work shift", {
            exact: true,
        }),
        ).toBeVisible();
    }

    await page.goto("/schedule?date=2026-12-02");

    await expect(
        page.getByText("Work shift", {
        exact: true,
        }),
    ).toHaveCount(0);
    });

    test("editing one repeat updates the whole series", async ({ page }) => {
    await openAddEvent(page);

    const dialog = page.getByRole("dialog");

    await dialog.getByLabel("Title").fill("Work shift");
    await dialog.getByLabel("Date").fill("2026-11-16");

    await dialog
        .getByLabel("Repeats")
        .selectOption("1");

    await dialog
        .getByRole("button", {
        name: "Wednesday",
        })
        .click();

    await dialog
        .getByLabel("Ends on")
        .fill("2026-11-30");

    await dialog
        .getByRole("button", {
        name: "Create event",
        })
        .click();

    await page.goto("/schedule?date=2026-11-25");

    await page
        .getByText("Work shift", {
        exact: true,
        })
        .last()
        .click();

    const editDialog =
        page.getByRole("dialog");

    await editDialog
        .getByLabel("Title")
        .fill("Updated shift");

    await editDialog
        .getByRole("button", {
        name: "Save changes",
        })
        .click();

    await page.goto("/schedule?date=2026-11-16");

    await expect(
        page.getByText("Updated shift", {
        exact: true,
        }),
    ).toBeVisible();

    await page.goto("/schedule?date=2026-11-30");

    await expect(
        page.getByText("Updated shift", {
        exact: true,
        }),
    ).toBeVisible();

    await expect(
        page.getByText("Work shift", {
        exact: true,
        }),
    ).toHaveCount(0);
    });

    test("deleting one repeat deletes the whole series only", async ({ page }) => {
    await openAddEvent(page);

    let dialog = page.getByRole("dialog");

    await dialog.getByLabel("Title").fill("Work shift");
    await dialog.getByLabel("Date").fill("2026-11-16");

    await dialog
        .getByLabel("Repeats")
        .selectOption("1");

    await dialog
        .getByLabel("Ends on")
        .fill("2026-11-30");

    await dialog
        .getByRole("button", {
        name: "Create event",
        })
        .click();

    await page
        .getByRole("button", {
        name: "Add event",
        exact: true,
        })
        .click();

    dialog = page.getByRole("dialog");

    await dialog
        .getByLabel("Title")
        .fill("Club meeting");

    await dialog
        .getByLabel("Date")
        .fill("2026-11-16");

    await dialog
        .getByLabel("Repeats")
        .selectOption("1");

    await dialog
        .getByLabel("Ends on")
        .fill("2026-11-30");

    await dialog
        .getByRole("button", {
        name: "Create event",
        })
        .click();

    await page.goto("/schedule?date=2026-11-23");

    await page
        .getByText("Work shift", {
        exact: true,
        })
        .last()
        .click();

    dialog = page.getByRole("dialog");

    await dialog
        .getByRole("button", {
        name: "Delete event",
        })
        .click();

    const deleteDialog =
        page.getByRole("dialog", {
        name: "Delete this event?",
        });

    await expect(
        deleteDialog.getByRole("button", {
        name: "Delete this one",
        }),
    ).toHaveCount(0);

    await deleteDialog
        .getByRole("button", {
        name: "Delete all",
        })
        .click();

    await page.goto("/schedule?date=2026-11-30");

    await expect(
        page.getByText("Work shift", {
        exact: true,
        }),
    ).toHaveCount(0);

    await expect(
        page.getByText("Club meeting", {
        exact: true,
        }),
    ).toBeVisible();
    });

});