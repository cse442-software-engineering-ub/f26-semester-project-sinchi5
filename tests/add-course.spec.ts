import type { Page } from "@playwright/test";
import { test, expect } from "./support/account-fixture";
import { SYLLABUS, textFile } from "./support/syllabus";

const password = "Sample river password 42!";

async function register(page: Page) {
  await page.goto("/");

  await page
    .getByRole("button", { name: "Create your workspace" })
    .click();

  await page.getByLabel("Your name").fill("Course Tester");

  await page
    .getByLabel("Email address")
    .fill("notely-task-addcourse-442@example.edu");

  await page
    .getByLabel("Password", { exact: true })
    .fill(password);

  await page
    .getByLabel("Confirm password", { exact: true })
    .fill(password);

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
    .getByRole("button", { name: "Skip for now" })
    .click();

  await page
    .getByRole("button", { name: "I’ll do this later" })
    .click();

  await page
    .getByRole("button", { name: "Let’s begin" })
    .click();

  await expect(
    page.getByRole("heading", {
      name: "Your courses",
      exact: true,
    }),
  ).toBeVisible();
}

function homeCourses(page: Page) {
  return page.locator("section").filter({
    has: page.getByRole("heading", {
      name: "Your courses",
      exact: true,
    }),
  });
}

test("Home opens the Add a course window", async ({ page }) => {
  await register(page);

  const courses = homeCourses(page);

  await expect(
    courses.getByRole("link", {
      name: "Manage",
      exact: true,
    }),
  ).toHaveCount(0);

  await courses
    .getByRole("button", {
      name: "Add course",
      exact: true,
    })
    .click();

  await expect(
    page.getByRole("dialog", {
      name: "Add a course",
    }),
  ).toBeVisible();

  await expect(page).toHaveURL(/\/$/);
});

test("left menu + opens the Add a course window", async ({ page }) => {
  await register(page);

  await page.setViewportSize({
    width: 1024,
    height: 768,
  });

  await page.goto("/notes");

  await expect(
    page.getByRole("heading", {
      name: "Your notes",
      exact: true,
    }),
  ).toBeVisible();

  const sidebar = page.locator("aside");

  await sidebar
    .getByRole("button", {
      name: "Add a course",
      exact: true,
    })
    .click();

  await expect(
    page.getByRole("dialog", {
      name: "Add a course",
    }),
  ).toBeVisible();

  await expect(page).toHaveURL(/\/notes$/);
});

test("a course added from Home appears everywhere", async ({ page }) => {
  await register(page);

  await page.setViewportSize({
    width: 1024,
    height: 768,
  });

  const courses = homeCourses(page);

  await courses
    .getByRole("button", {
      name: "Add course",
      exact: true,
    })
    .click();

  const dialog = page.getByRole("dialog", {
    name: "Add a course",
  });

  await dialog
    .getByLabel("Course code")
    .fill("CSE 250");

  await expect(
    dialog.getByLabel("Term"),
  ).toHaveValue("Fall 2026");

  await dialog
    .getByLabel("Course name")
    .fill("Data Structures");

  await dialog
    .getByRole("button", {
      name: "Add course",
      exact: true,
    })
    .click();

  await expect(dialog).not.toBeVisible();

  await expect(
    homeCourses(page).getByText("CSE 250", {
      exact: true,
    }),
  ).toBeVisible();

  await expect(
    homeCourses(page).getByText("Data Structures", {
      exact: true,
    }),
  ).toBeVisible();

    await expect(
    page.locator("aside").getByRole("link", {
        name: /CSE 250\s*Data Structures/,
    }),
    ).toBeVisible();

  await page.reload();

  await expect(
    homeCourses(page).getByText("CSE 250", {
      exact: true,
    }),
  ).toBeVisible();

  await expect(
    homeCourses(page).getByText("Data Structures", {
      exact: true,
    }),
  ).toBeVisible();

    await expect(
    page.locator("aside").getByRole("link", {
        name: /CSE 250\s*Data Structures/,
    }),
    ).toBeVisible();
});

test("a blank course code is refused", async ({ page }) => {
  await register(page);

  const courses = homeCourses(page);

  await courses
    .getByRole("button", {
      name: "Add course",
      exact: true,
    })
    .click();

  const dialog = page.getByRole("dialog", {
    name: "Add a course",
  });

  const code = dialog.getByLabel("Course code");

  await dialog
    .getByLabel("Course name")
    .fill("Algorithms");

  await dialog
    .getByRole("button", {
      name: "Add course",
      exact: true,
    })
    .click();

  await expect(dialog).toBeVisible();

  expect(
    await code.evaluate((element) =>
      element.matches(":invalid"),
    ),
  ).toBe(true);

  await expect(
    homeCourses(page).getByText("Algorithms", {
      exact: true,
    }),
  ).toHaveCount(0);
});

test("Settings still adds courses", async ({ page }) => {
  await register(page);

  await page.goto("/settings");

  await expect(
    page.getByRole("heading", {
      name: "Settings",
      exact: true,
    }),
  ).toBeVisible();

  await page
    .getByRole("button", {
      name: "Add course",
      exact: true,
    })
    .click();

  const dialog = page.getByRole("dialog", {
    name: "Add a course",
  });

  await dialog
    .getByLabel("Course code")
    .fill("CSE 331");

  await dialog
    .getByLabel("Course name")
    .fill("Algorithms");

  await dialog
    .getByRole("button", {
      name: "Add course",
      exact: true,
    })
    .click();

  await expect(dialog).not.toBeVisible();

  const courses = page.locator("section").filter({
    has: page.getByRole("heading", {
      name: "Courses",
      exact: true,
    }),
  });

  await expect(
    courses.getByText("CSE 331", {
      exact: true,
    }),
  ).toBeVisible();

  await expect(
    courses.getByText("Algorithms", {
      exact: true,
    }),
  ).toBeVisible();
});

test("Add course window fits on a phone", async ({ page }) => {
  await register(page);

  await page.setViewportSize({
    width: 390,
    height: 844,
  });

  const addCourse = homeCourses(page).getByRole("button", {
    name: "Add course",
    exact: true,
  });

  await expect(addCourse).toBeVisible();

  const buttonBox = await addCourse.boundingBox();

  expect(buttonBox).not.toBeNull();
  expect(buttonBox!.height).toBeGreaterThanOrEqual(44);

  await addCourse.click();

  const dialog = page.getByRole("dialog", {
    name: "Add a course",
  });

  await expect(dialog).toBeVisible();

  expect(
    await dialog.evaluate(
      (element) =>
        element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);

  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        window.innerWidth,
    ),
  ).toBe(true);

  await expect(
    dialog.getByLabel("Course code"),
  ).toBeVisible();

  await expect(
    dialog.getByLabel("Term"),
  ).toBeVisible();

  await expect(
    dialog.getByLabel("Course name"),
  ).toBeVisible();

  await expect(
    dialog.getByLabel("Color"),
  ).toBeVisible();

  await expect(
    dialog.getByRole("button", {
      name: "Add course",
      exact: true,
    }),
  ).toBeVisible();
});

test("a course with a syllabus goes straight to review", async ({ page }) => {
  await register(page);

  const courses = homeCourses(page);

  await courses
    .getByRole("button", {
      name: "Add course",
      exact: true,
    })
    .click();

  const dialog = page.getByRole("dialog", {
    name: "Add a course",
  });

  await dialog
    .getByLabel("Course code")
    .fill("CSE 442");

  await expect(
    dialog.getByLabel("Term"),
  ).toHaveValue("Fall 2026");

  await dialog
    .getByLabel("Course name")
    .fill("Software Engineering");

  await dialog
    .getByLabel("Choose a syllabus file")
    .setInputFiles(
      textFile("cse442-syllabus.txt", SYLLABUS),
    );

  await expect(
    dialog.getByRole("button", {
      name: "Add course",
      exact: true,
    }),
  ).toBeEnabled();

  await dialog
    .getByRole("button", {
      name: "Add course",
      exact: true,
    })
    .click();

  await expect(
    page.getByRole("button", {
      name: "Add to schedule",
    }),
  ).toBeVisible();

  const review = page.getByRole("dialog");

    await expect.poll(async () => {
    return review.locator("input").evaluateAll((inputs) =>
        inputs.map((input) => (input as HTMLInputElement).value),
    );
    }).toEqual(
    expect.arrayContaining([
        "Homework 1",
        "Midterm exam",
        "Final project",
    ]),
    );
});

test("a course with a syllabus adds events to the new course", async ({ page }) => {
  await register(page);

  const courses = homeCourses(page);

  await courses
    .getByRole("button", {
      name: "Add course",
      exact: true,
    })
    .click();

  const dialog = page.getByRole("dialog", {
    name: "Add a course",
  });

  await dialog.getByLabel("Course code").fill("CSE 442");
  await dialog
    .getByLabel("Course name")
    .fill("Software Engineering");

  await dialog
    .getByLabel("Choose a syllabus file")
    .setInputFiles(
      textFile("cse442-syllabus.txt", SYLLABUS),
    );

  await dialog
    .getByRole("button", {
      name: "Add course",
      exact: true,
    })
    .click();

  await expect(
    page.getByRole("button", {
      name: "Add to schedule",
    }),
  ).toBeVisible();

  // Get the ID of the CSE 442 course that was just created.
  const courseHref = await page
    .locator('aside a[href^="/courses/"]')
    .filter({ hasText: "CSE 442" })
    .getAttribute("href");

  expect(courseHref).toBeTruthy();

  const newCourseId = courseHref!.split("/").pop()!;

  const confirmResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("route=import-confirm") &&
      response.request().method() === "POST",
  );

  await page
    .getByRole("button", {
      name: "Add to schedule",
    })
    .click();

  const confirmResponse = await confirmResponsePromise;

  expect(confirmResponse.ok()).toBe(true);

  const confirmBody =
    confirmResponse.request().postDataJSON();

  expect(confirmBody.courseId).toBe(newCourseId);

  expect(confirmBody.events).toHaveLength(3);

  expect(
    confirmBody.events.map(
      (event: { title: string }) => event.title,
    ),
  ).toEqual(
    expect.arrayContaining([
      "Homework 1",
      "Midterm exam",
      "Final project",
    ]),
  );

  // Confirm the mocked server actually stored the events
  // with that same new course ID.
  const saved = await page.evaluate(async () => {
    const response = await fetch(
      "/api/index.php?route=events",
    );

    return response.json();
  });

  expect(saved.events).toHaveLength(3);

  for (const event of saved.events) {
    expect(event.courseId).toBe(newCourseId);
  }

  expect(
    saved.events.map(
      (event: { title: string }) => event.title,
    ),
  ).toEqual(
    expect.arrayContaining([
      "Homework 1",
      "Midterm exam",
      "Final project",
    ]),
  );
});

test("a bad syllabus file blocks Add course", async ({ page }) => {
  await register(page);

  const courses = homeCourses(page);

  await courses
    .getByRole("button", {
      name: "Add course",
      exact: true,
    })
    .click();

  const dialog = page.getByRole("dialog", {
    name: "Add a course",
  });

  await dialog
    .getByLabel("Course code")
    .fill("CSE 442");

  await dialog
    .getByLabel("Course name")
    .fill("Software Engineering");

  await dialog
    .getByLabel("Choose a syllabus file")
    .setInputFiles(
      textFile("syllabus.exe", "not a syllabus"),
    );

  await expect(
    dialog.getByRole("alert"),
  ).toHaveText(
    "Choose a PDF, DOCX, TXT, Markdown, or supported image file.",
  );

  await expect(
    dialog.getByRole("button", {
      name: "Add course",
      exact: true,
    }),
  ).toBeDisabled();

  await expect(
    page.locator("aside").getByText("CSE 442", {
      exact: true,
    }),
  ).toHaveCount(0);
});

test("Remove file clears the syllabus", async ({ page }) => {
  await register(page);

  const courses = homeCourses(page);

  await courses
    .getByRole("button", {
      name: "Add course",
      exact: true,
    })
    .click();

  const dialog = page.getByRole("dialog", {
    name: "Add a course",
  });

  await dialog
    .getByLabel("Course code")
    .fill("CSE 442");

  await dialog
    .getByLabel("Course name")
    .fill("Software Engineering");

  await dialog
    .getByLabel("Choose a syllabus file")
    .setInputFiles(
      textFile("syllabus.exe", "not a syllabus"),
    );

  await expect(
    dialog.getByRole("alert"),
  ).toHaveText(
    "Choose a PDF, DOCX, TXT, Markdown, or supported image file.",
  );

  await expect(
    dialog.getByRole("button", {
      name: "Add course",
      exact: true,
    }),
  ).toBeDisabled();

  await dialog
    .getByRole("button", {
      name: "Remove file",
      exact: true,
    })
    .click();

  await expect(
    dialog.getByRole("alert"),
  ).toHaveCount(0);

  await expect(
    dialog.getByRole("button", {
      name: "Add course",
      exact: true,
    }),
  ).toBeEnabled();

  await dialog
    .getByRole("button", {
      name: "Add course",
      exact: true,
    })
    .click();

  await expect(dialog).not.toBeVisible();

  await expect(
    homeCourses(page).getByText("CSE 442", {
      exact: true,
    }),
  ).toBeVisible();

  await expect(
    page.getByRole("button", {
      name: "Add to schedule",
    }),
  ).toHaveCount(0);
});

test("a failed read keeps the course", async ({ page }) => {
  await register(page);

  const courses = homeCourses(page);

  await courses
    .getByRole("button", {
      name: "Add course",
      exact: true,
    })
    .click();

  const dialog = page.getByRole("dialog", {
    name: "Add a course",
  });

  await dialog
    .getByLabel("Course code")
    .fill("CSE 442");

  await dialog
    .getByLabel("Course name")
    .fill("Software Engineering");

  await dialog
    .getByLabel("Choose a syllabus file")
    .setInputFiles(
      textFile("failed-read.txt", SYLLABUS),
    );

  await dialog
    .getByRole("button", {
      name: "Add course",
      exact: true,
    })
    .click();

  await expect(
    page.getByRole("heading", {
        name: "That file needs another try",
        exact: true,
    }),
  ).toBeVisible();

  // The syllabus import failed, but the course was already created
  // and must not be deleted.
    const createdCourse = page
    .locator('aside a[href^="/courses/"]')
    .filter({ hasText: "CSE 442" });

    await expect(createdCourse).toHaveCount(1);

    const courseHref = await createdCourse.getAttribute("href");

    expect(courseHref).toBeTruthy();

  // No syllabus events should have been saved.
  const saved = await page.evaluate(async () => {
    const response = await fetch(
      "/api/index.php?route=events",
    );

    return response.json();
  });

  expect(saved.events).toHaveLength(0);
});