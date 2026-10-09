import { notFound } from "next/navigation";

/** Any URL that matches no page: show the site's own "not found" page, inside the header and footer. */
export default function MissingPage() {
  notFound();
}
