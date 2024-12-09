const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const ytdl = require('@distube/ytdl-core');
const cors = require('cors');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { promisify } = require('util');
const stream = require('stream');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: ["http://localhost:3000", "https://ytdtool.vercel.app"], // Permetti solo richieste da localhost:3000
        methods: ["GET", "POST"],
    }
});

// Espone gli headers al frontend correttamente
app.use((req, res, next) => {
    res.header('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type');
    next();
});

// Configurazione CORS per Express
app.use(cors({
    origin: ["http://localhost:3000", "https://ytdtool.vercel.app"], // Permetti solo richieste da localhost:3000
    methods: ["GET", "POST"]
}));

// Funzione per la pipeline dei flussi
const pipeline = promisify(stream.pipeline);

// Endpoint per ottenere i formati disponibili
app.get('/available-formats', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        console.log('URL non fornito per il recupero dei formati');
        return res.status(400).send('URL non fornito');
    }

    try {
        console.log('Recuperando informazioni per URL:', url);
        const info = await ytdl.getInfo(url);
        console.log('Info video recuperata con successo:', info.videoDetails.title);

        const formats = {
            onlyAudio: info.formats.filter(f => f.hasAudio && !f.hasVideo),
            onlyVideo: info.formats.filter(f => f.hasVideo && !f.hasAudio),
            audioVideo: info.formats.filter(f => f.hasAudio && f.hasVideo),
        };

        res.json(formats);
    } catch (error) {
        console.error('Errore durante il recupero dei formati:', error);
        res.status(500).send('Errore durante il recupero dei formati');
    }
});

// Endpoint per ottenere informazioni sul video
app.get('/video-info', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        console.log('URL non fornito per il recupero delle informazioni video');
        return res.status(400).send('URL non fornito');
    }

    try {
        console.log('Recuperando informazioni per URL:', url);
        const info = await ytdl.getInfo(url);
        console.log('Info video recuperata con successo:', info.videoDetails.title);

        res.json({
            title: info.videoDetails.title,
        });
    } catch (error) {
        console.error('Errore durante il recupero delle informazioni:', error);
        res.status(500).send('Errore durante il recupero delle informazioni');
    }
});

// Endpoint per il download del video
app.get('/download', async (req, res) => {
    const { url, audioItag, videoItag } = req.query;

    if (!url || (!audioItag && !videoItag)) {
        console.log('URL, audioItag o videoItag non forniti per il download');
        return res.status(400).send('URL, audioItag o videoItag non forniti');
    }

    try {
        console.log('Recuperando informazioni per URL:', url);
        const info = await ytdl.getInfo(url);

        // Verifica se audio e video sono separati
        if (audioItag && videoItag) {
            const audioFormat = info.formats.find(f => f.itag == audioItag && f.hasAudio && !f.hasVideo);
            const videoFormat = info.formats.find(f => f.itag == videoItag && f.hasVideo && !f.hasAudio);

            if (!audioFormat || !videoFormat) {
                console.log('Audio o video non trovati con i itag selezionati');
                return res.status(400).send('Formati audio o video non validi');
            }

            console.log('Formati audio e video selezionati:', audioFormat, videoFormat);

            // Creazione dei percorsi temporanei per i file audio e video
            const tempAudioPath = path.join(os.tmpdir(), `audio-${Date.now()}.mp4`);
            const tempVideoPath = path.join(os.tmpdir(), `video-${Date.now()}.mp4`);
            const outputPath = path.join(os.tmpdir(), `output-${Date.now()}.mp4`);

            // Stream per l'audio e il video
            const audioStream = ytdl(url, { format: audioFormat });
            const videoStream = ytdl(url, { format: videoFormat });

            // Scriviamo i flussi audio e video nei file temporanei
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

            // Uniamo i flussi audio e video in un file finale
            ffmpeg()
                .input(tempVideoPath)
                .input(tempAudioPath)
                .output(outputPath)
                .audioCodec('aac')
                .videoCodec('libx264')
                .outputOptions('-strict', 'experimental')
                .on('end', async () => {
                    console.log('Muxing completato, inviando il file al client');

                    // Impostazione delle intestazioni per il download
                    const filename = `${info.videoDetails.title}.mp4`;
                    console.log('Impostazione dell\'intestazione Content-Disposition:', filename);
                    res.header('Content-Disposition', `attachment; filename="${filename}"`);
                    res.header('Content-Type', 'video/mp4');

                    // Log delle intestazioni
                    console.log('Intestazioni inviate:', res.getHeaders());

                    await pipeline(fs.createReadStream(outputPath), res);

                    // Rimuovi i file temporanei
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
                    console.error('Errore durante il muxing:', err);
                    res.status(500).send('Errore durante il muxing audio-video');
                })
                .run();

        } else {
            // Se è solo audio o solo video, scarica direttamente
            const selectedFormat = info.formats.find(f => f.itag == audioItag || f.itag == videoItag);
            if (!selectedFormat) {
                console.log('Formato non disponibile per l\'itag:', audioItag || videoItag);
                return res.status(400).send('Formato non disponibile');
            }

            // Se è solo audio o solo video
            const stream = ytdl(url, { format: selectedFormat });
            const filename = info.videoDetails.title.replace(/[/\\?%*:|"<>]/g, '_') + '.' + selectedFormat.container;
            console.log('Impostazione dell\'intestazione Content-Disposition:', filename);
            res.header('Content-Disposition', `attachment; filename="${filename}"`);
            res.header('Content-Type', selectedFormat.mimeType);

            // Log delle intestazioni
            console.log('Intestazioni inviate:', res.getHeaders());

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
        console.error('Errore durante il download:', error);
        res.status(500).send('Errore durante il download');
    }
});

// Avvia il server
server.listen(5001, () => {
    console.log('Server in ascolto sulla porta 5001');
});