export default async function handler(req, res) {
  try {
    const path = req.query.path || '';
    const rest = req.url.replace('/api/kobo', '').replace('?path=', '');
    const url = 'https://kf.kobotoolbox.org' + (path || rest);
    const r = await fetch(url, {
      headers: {
        'Authorization': 'Token cfda7c6ec2ad5c686e180747c4c005995710445a',
        'Accept': 'application/json',
      }
    });
    const data = await r.json();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}