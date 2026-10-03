export default function health(request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.status(200).json({ ok: true });
}
