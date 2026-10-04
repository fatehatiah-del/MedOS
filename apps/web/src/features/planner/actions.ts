"use server";

import type { UserScope } from "@medos/database";
import { refresh } from "next/cache";

import { getWorkspace } from "@/server/workspace";

import * as logic from "./logic";

/*
 * Server Functions behind the Study Plan. Each verifies the session itself
 * and acts only through the signed-in user's scope; a successful change
 * refreshes the page so the plan shown is the plan stored.
 */

async function run(
  action: (scope: UserScope, input: unknown) => Promise<logic.ActionResult>,
  input: unknown,
): Promise<logic.ActionResult> {
  const { scope } = await getWorkspace();
  const result = await action(scope, input);
  if (result.ok) refresh();
  return result;
}

export async function setStudyAvailability(input: unknown): Promise<logic.ActionResult> {
  return run(logic.setAvailability, input);
}

export async function addPlanItem(input: unknown): Promise<logic.ActionResult> {
  return run(logic.addItem, input);
}

export async function updatePlanItem(input: unknown): Promise<logic.ActionResult> {
  return run(logic.updateItem, input);
}

export async function reorderPlanItems(input: unknown): Promise<logic.ActionResult> {
  return run(logic.reorderItems, input);
}

export async function setPlanItemDone(input: unknown): Promise<logic.ActionResult> {
  return run(logic.setItemDone, input);
}

export async function removePlanItem(input: unknown): Promise<logic.ActionResult> {
  return run(logic.removeItem, input);
}

export async function postponePlanItem(input: unknown): Promise<logic.ActionResult> {
  return run(logic.postponeItem, input);
}

export async function refreshStudyPlan(input: unknown): Promise<logic.ActionResult> {
  return run(logic.refreshPlan, input);
}

export async function clearPlanSuggestions(input: unknown): Promise<logic.ActionResult> {
  return run(logic.clearSuggestions, input);
}
