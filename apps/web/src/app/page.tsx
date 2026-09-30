import { redirect } from "next/navigation";

import { HOME_HREF } from "@/config/navigation";

export default function RootPage() {
  redirect(HOME_HREF);
}
