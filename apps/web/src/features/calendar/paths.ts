import type { IsoDate } from "@medos/shared";

import type { CalendarView } from "./model";

export function calendarHref(view: CalendarView, date: IsoDate): string {
  return `/calendar?view=${view}&date=${date}`;
}
