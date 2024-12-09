// backend/api/info.js

const ytdl = require('@distube/ytdl-core');

module.exports = async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).send('URL non fornito');
    }

    try {
        const info = await ytdl.getInfo(url);
        res.json({
            title: info.videoDetails.title,
        });
    } catch (error) {
        res.status(500).send('Errore durante il recupero delle informazioni');
    }
};