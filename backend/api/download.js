// backend/api/download.js

const ytdl = require('@distube/ytdl-core');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const os = require('os');
const { promisify } = require('util');
const stream = require('stream');
const pipeline = promisify(stream.pipeline);

module.exports = (io) => async (req, res) => {
    const { url, audioItag, videoItag } = req.query;

    if (!url || (!audioItag && !videoItag)) {
        return res.status(400).send('URL, audioItag o videoItag non forniti');
    }

    try {
        const info = await ytdl.getInfo(url);

        if (audioItag && videoItag) {
            const audioFormat = info.formats.find(f => f.itag == audioItag && f.hasAudio && !f.hasVideo);
            const videoFormat = info.formats.find(f => f.itag == videoItag && f.hasVideo && !f.hasAudio);

            if (!audioFormat || !videoFormat) {
                return res.status(400).send('Formati audio o video non validi');
            }

            const tempAudioPath = path.join(os.tmpdir(), `audio-${Date.now()}.mp4`);
            const tempVideoPath = path.join(os.tmpdir(), `video-${Date.now()}.mp4`);
            const outputPath = path.join(os.tmpdir(), `output-${Date.now()}.mp4`);

            const audioStream = ytdl(url, { format: audioFormat });
            const videoStream = ytdl(url, { format: videoFormat });

            await Promise.all([
                new Promise((resolve, reject) => {
                    audioStream.pipe(fs.createWriteStream(tempAudioPath));
                    audioStream.on('end', resolve);
                    audioStream.on('error', reject);
                }),
                new Promise((resolve, reject) => {
                    videoStream.pipe(fs.createWriteStream(tempVideoPath));
                    videoStream.on('end', resolve);
                    videoStream.on('error', reject);
                })
            ]);

            ffmpeg()
                .input(tempVideoPath)
                .input(tempAudioPath)
                .output(outputPath)
                .audioCodec('aac')
                .videoCodec('libx264')
                .outputOptions('-strict', 'experimental')
                .on('end', async () => {
                    const filename = `${info.videoDetails.title}.mp4`;
                    res.header('Content-Disposition', `attachment; filename="${filename}"`);
                    res.header('Content-Type', 'video/mp4');

                    await pipeline(fs.createReadStream(outputPath), res);

                    fs.unlinkSync(tempAudioPath);
                    fs.unlinkSync(tempVideoPath);
                    fs.unlinkSync(outputPath);
                })
                .on('progress', (progress) => {
                    console.log(`Progress: ${progress.percent}%`);
                    // Invia il progresso al client tramite socket.io
                    io.emit('progress', { progress: progress.percent });
                })
                .on('error', (err) => {
                    res.status(500).send('Errore durante il muxing audio-video');
                })
                .run();

        } else {
            const selectedFormat = info.formats.find(f => f.itag == audioItag || f.itag == videoItag);
            if (!selectedFormat) {
                return res.status(400).send('Formato non disponibile');
            }

            const stream = ytdl(url, { format: selectedFormat });
            const filename = info.videoDetails.title.replace(/[/\\?%*:|"<>]/g, '_') + '.' + selectedFormat.container;

            res.header('Content-Disposition', `attachment; filename="${filename}"`);
            res.header('Content-Type', selectedFormat.mimeType);

            stream.pipe(res);
            stream.on('end', () => {
                console.log('Download completato');
            });

            stream.on('error', (err) => {
                console.error('Errore durante il download:', err);
                res.status(500).send('Errore durante il download');
            });
        }
    } catch (error) {
        res.status(500).send('Errore durante il download');
    }
};