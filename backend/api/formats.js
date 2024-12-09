// backend/api/formats.js

const ytdl = require('@distube/ytdl-core');

module.exports = async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).send('URL non fornito');
    }

    try {
        const info = await ytdl.getInfo(url);
        const formats = {
            onlyAudio: info.formats.filter(f => f.hasAudio && !f.hasVideo),
            onlyVideo: info.formats.filter(f => f.hasVideo && !f.hasAudio),
            audioVideo: info.formats.filter(f => f.hasAudio && f.hasVideo),
        };
        res.json(formats);
    } catch (error) {
        res.status(500).send('Errore durante il recupero dei formati');
    }
};