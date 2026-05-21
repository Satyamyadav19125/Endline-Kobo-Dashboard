export default async function handler(req, res) {
  try {
    const koboPath = req.query.path;
    if (!koboPath) {
      return res.status(400).json({ error: 'No path' });
    }
    const url = 'https://kf.kobotoolbox.org' + decodeURIComponent(koboPath);
    const r = await fetch(url, {
      headers: {
        'Authorization': 'Token cfda7c6ec2ad5c686e180747c4c005995710445a',
        'Accept': 'application/json',
      }
    });
    const text = await r.text();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(text);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
