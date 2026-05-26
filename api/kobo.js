export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PATCH,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const koboPath = req.query.path;
    if (!koboPath) return res.status(400).json({ error: 'No path provided' });

    const cleanPath = koboPath.startsWith('/') ? koboPath : '/' + koboPath;
    const url = 'https://kf.kobotoolbox.org' + cleanPath;

    const fetchOpts = {
      method: req.method || 'GET',
      headers: {
        'Authorization': 'Token cfda7c6ec2ad5c686e180747c4c005995710445a',
        'Accept': 'application/json',
      }
    };

    // For PATCH/PUT, forward the request body
    if (req.method === 'PATCH' || req.method === 'PUT') {
      fetchOpts.headers['Content-Type'] = 'application/json';
      fetchOpts.body = JSON.stringify(req.body);
    }

    const r = await fetch(url, fetchOpts);

    if (!r.ok) {
      const errText = await r.text();
      return res.status(r.status).json({ error: `KoboToolbox returned ${r.status}`, detail: errText });
    }

    const text = await r.text();
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(text);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
