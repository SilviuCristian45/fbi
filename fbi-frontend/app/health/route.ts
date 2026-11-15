// Healthcheck pentru Docker: răspunde dacă serverul Next.js rulează
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" });
}
