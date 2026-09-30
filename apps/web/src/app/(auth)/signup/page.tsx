import type { Metadata } from "next";

import { AuthPage, type AuthSearchParams } from "@/features/auth/auth-page";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage({ searchParams }: { searchParams: AuthSearchParams }) {
  return <AuthPage mode="sign-up" searchParams={searchParams} />;
}
