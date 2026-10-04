"use server";

import { refresh } from "next/cache";

import { getWorkspace } from "@/server/workspace";

import {
  type ActionResult,
  cardFromStudyGuide,
  createCard,
  createDeck,
  deleteCard,
  openLectureDeck,
  rateCard,
  updateCard,
} from "./logic";

/*
 * Server Functions behind flashcards. Each verifies the session itself and
 * acts only through the signed-in user's scope. Nothing here touches lecture
 * completion.
 */

async function refreshing<T>(result: Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  const settled = await result;
  if (settled.ok) refresh();
  return settled;
}

export async function addFlashcard(input: unknown) {
  const { scope } = await getWorkspace();
  return refreshing(createCard(scope, input));
}

export async function editFlashcard(input: unknown) {
  const { scope } = await getWorkspace();
  return refreshing(updateCard(scope, input));
}

export async function deleteFlashcard(input: unknown) {
  const { scope } = await getWorkspace();
  return refreshing(deleteCard(scope, input));
}

export async function addDeck(input: unknown) {
  const { scope } = await getWorkspace();
  return refreshing(createDeck(scope, input));
}

export async function openDeckForLecture(input: unknown) {
  const { scope } = await getWorkspace();
  return openLectureDeck(scope, input);
}

export async function addFlashcardFromStudyGuide(input: unknown) {
  const { scope } = await getWorkspace();
  return cardFromStudyGuide(scope, input);
}

export async function rateFlashcard(input: unknown) {
  const { scope } = await getWorkspace();
  return rateCard(scope, input);
}
