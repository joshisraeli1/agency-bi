import { redirect } from "next/navigation";

/** Moved to /sales/michael when the board was generalised to the whole team. */
export default function MichaelPage() {
  redirect("/sales/michael");
}
