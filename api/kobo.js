export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const koboPath = req.query.path;
    if (!koboPath) return res.status(400).json({ error: 'No path provided' });

    const cleanPath = koboPath.startsWith('/') ? koboPath : '/' + koboPath;
    const url = 'https://kf.kobotoolbox.org' + cleanPath;

    const r = await fetch(url, {
      headers: {
        'Authorization': 'Token cfda7c6ec2ad5c686e180747c4c005995710445a',
        'Accept': 'application/json',
      }
    });

    if (!r.ok) return res.status(r.status).json({ error: `KoboToolbox returned ${r.status}` });

    const text = await r.text();
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(text);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
