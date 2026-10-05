import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  EmptyState,
  Field,
  Input,
  Progress,
  Section,
  SegmentedControl,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  fieldHintId,
  progressPercent,
} from "../index";

describe("progressPercent", () => {
  it("rounds to a whole percentage", () => {
    expect(progressPercent(80, 150)).toBe(53);
  });

  it("clamps out-of-range values", () => {
    expect(progressPercent(200, 150)).toBe(100);
    expect(progressPercent(-10, 150)).toBe(0);
  });

  it("returns 0 for an empty or invalid total", () => {
    expect(progressPercent(10, 0)).toBe(0);
    expect(progressPercent(Number.NaN, 100)).toBe(0);
  });
});

describe("Progress", () => {
  it("exposes an accessible progressbar", () => {
    render(<Progress label="Study time today" value={80} max={150} valueText="1h 20m of 2h 30m" />);
    const bar = screen.getByRole("progressbar", { name: "Study time today" });
    expect(bar).toHaveAttribute("aria-valuenow", "53");
    expect(bar).toHaveAttribute("aria-valuetext", "1h 20m of 2h 30m");
  });
});

describe("Section", () => {
  it("labels the region with its heading", () => {
    render(
      <Section title="Due for review">
        <p>Nothing due</p>
      </Section>,
    );
    const region = screen.getByRole("region", { name: "Due for review" });
    expect(within(region).getByText("Nothing due")).toBeInTheDocument();
  });
});

describe("EmptyState", () => {
  it("renders a heading at the requested level", () => {
    render(<EmptyState title="No lectures yet" description="Sync to begin." headingLevel={2} />);
    expect(screen.getByRole("heading", { level: 2, name: "No lectures yet" })).toBeInTheDocument();
    expect(screen.getByText("Sync to begin.")).toBeInTheDocument();
  });

  it("can be the main heading of a page", () => {
    render(<EmptyState title="Page not found" headingLevel={1} />);
    expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
  });
});

describe("Field", () => {
  it("associates the label and hint with the control", () => {
    render(
      <Field label="Weekdays" htmlFor="weekday" hint="Minutes per day">
        <Input id="weekday" aria-describedby={fieldHintId("weekday")} defaultValue="150" />
      </Field>,
    );
    const input = screen.getByLabelText("Weekdays");
    expect(input).toHaveValue("150");
    expect(input).toHaveAccessibleDescription("Minutes per day");
  });
});

describe("SegmentedControl", () => {
  function Example() {
    const [value, setValue] = useState<"light" | "dark">("light");
    return (
      <SegmentedControl
        legend="Theme"
        value={value}
        onValueChange={setValue}
        options={[
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ]}
      />
    );
  }

  it("selects an option by click and by arrow key", async () => {
    render(<Example />);
    const group = screen.getByRole("group", { name: "Theme" });
    const light = within(group).getByRole("radio", { name: "Light" });
    const dark = within(group).getByRole("radio", { name: "Dark" });
    expect(light).toBeChecked();

    await userEvent.click(dark);
    expect(dark).toBeChecked();

    await userEvent.keyboard("{ArrowLeft}");
    expect(light).toBeChecked();
  });
});

describe("Tabs", () => {
  it("switches panels with the keyboard", async () => {
    render(
      <Tabs defaultValue="week">
        <TabsList aria-label="Calendar view">
          <TabsTrigger value="week">Week</TabsTrigger>
          <TabsTrigger value="month">Month</TabsTrigger>
        </TabsList>
        <TabsContent value="week">Week panel</TabsContent>
        <TabsContent value="month">Month panel</TabsContent>
      </Tabs>,
    );
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Week panel");

    await userEvent.tab();
    expect(screen.getByRole("tab", { name: "Week" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");

    expect(screen.getByRole("tab", { name: "Month" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Month panel");
  });
});

describe("Dialog", () => {
  it("opens as a labelled modal and closes with Escape", async () => {
    render(
      <Dialog>
        <DialogTrigger>Shortcuts</DialogTrigger>
        <DialogContent>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Available everywhere.</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Shortcuts" }));
    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    expect(dialog).toHaveAccessibleDescription("Available everywhere.");
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
