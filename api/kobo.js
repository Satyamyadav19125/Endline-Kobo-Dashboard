export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { path } = req.query;
  if (!path) return res.status(400).json({ error: "Missing path param" });

  const TOKEN =
    process.env.KOBO_API_TOKEN || "cfda7c6ec2ad5c686e180747c4c005995710445a";
  const koboUrl = `https://kf.kobotoolbox.org${path}`;

  try {
    const opts = {
      method: req.method,
      headers: {
        Authorization: `Token ${TOKEN}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      cache: "no-store",
    };
    if ((req.method === "PATCH" || req.method === "POST") && req.body) {
      opts.body = JSON.stringify(req.body);
    }
    const upstream = await fetch(koboUrl, opts);
    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
