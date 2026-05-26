export default async function handler(req, res) {
  // CORS + preflight
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const apiToken = process.env.KOBO_API_TOKEN || "cfda7c6ec2ad5c686e180747c4c005995710445a";
  const path = req.query.path || "";

  if (!path) {
    return res.status(400).json({ error: "Missing path query parameter" });
  }

  const url = `https://kf.kobotoolbox.org${path}`;
  const headers = {
    Authorization: `Token ${apiToken}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  try {
    let options = {
      method: req.method,
      headers,
    };

    // Forward body for POST, PATCH, PUT
    if (req.method === "POST" || req.method === "PATCH" || req.method === "PUT") {
      if (req.body) {
        options.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      }
    }

    const response = await fetch(url, options);
    const data = await response.json();

    res.status(response.status).json(data);
  } catch (error) {
    console.error("Proxy error:", error);
    res.status(500).json({ error: error.message });
  }
}
