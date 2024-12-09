import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FaDownload, FaLink } from 'react-icons/fa';
import io from 'socket.io-client';

function App() {
  const [url, setUrl] = useState('');
  const [audioFormat, setAudioFormat] = useState('');
  const [videoFormat, setVideoFormat] = useState('');
  const [type, setType] = useState('audioVideo');
  const [availableFormats, setAvailableFormats] = useState({
    audioVideo: [],
    onlyAudio: [],
    onlyVideo: [],
  });
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

  // Connessione al WebSocket
  useEffect(() => {
    const socket = io(API_URL);
    socket.on('progress', (data) => {
      console.log('Progress received:', data); // Log per monitorare

      // Verifica che il dato ricevuto abbia la proprietà 'progress'
      if (typeof data === 'object' && data.hasOwnProperty('progress')) {
        setProgress(data.progress);
      } else {
        console.error('Unexpected data format:', data);
      }
    });
    return () => socket.disconnect();
  }, []);

  // Funzione per ottenere i formati disponibili
  const handleGetFormats = async () => {
    console.log('Getting formats for URL:', url);
    if (!url) {
      setError('Please enter a valid URL.');
      return;
    }
    setError('');
    setSuccessMessage('');

    try {
      const response = await axios.get(`${API_URL}/api/formats`, {
        params: { url },
      });
      setAvailableFormats({
        audioVideo: response.data.audioVideo || [],
        onlyAudio: response.data.onlyAudio || [],
        onlyVideo: response.data.onlyVideo || [],
      });
    } catch (error) {
      setError('Error retrieving formats.');
    }
  };

  // Funzione per gestire il download
  const handleDownload = async () => {
    console.log('Preparing to download:', url, audioFormat, videoFormat);

    if (!url || (!audioFormat && type === 'onlyAudio') || (!videoFormat && type === 'onlyVideo') || (!audioFormat && !videoFormat && type === 'audioVideo')) {
      setError('Please enter a valid URL and select the required formats.');
      return;
    }

    setError('');
    setSuccessMessage('');
    setIsLoading(true);
    setProgress(0);

    try {
      let params;

      if (type === 'audioVideo') {
        params = { url, audioItag: audioFormat, videoItag: videoFormat };
      } else if (type === 'onlyAudio') {
        params = { url, audioItag: audioFormat, videoItag: null };
      } else if (type === 'onlyVideo') {
        params = { url, audioItag: null, videoItag: videoFormat };
      }
      console.log('Download params:', params);
      const response = await axios.get(`${API_URL}/api/download`, {
        params,
        responseType: 'blob',
      });

      const disposition = response.headers['content-disposition'];
      const filenameMatch = disposition ? disposition.match(/filename="(.+)"/) : null;
      const filename = filenameMatch ? filenameMatch[1] : `download.${type === 'audioVideo' ? 'mp4' : 'mp3'}`;

      const blob = new Blob([response.data]);
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setSuccessMessage('Download completed successfully!');
    } catch (error) {
      setError('Error during download.');
    } finally {
      setIsLoading(false);
    }
  };

  // Funzione per gestire il cambio del tipo (Audio, Video, Audio+Video)
  const handleTypeChange = (newType) => {
    setType(newType);
    setAudioFormat('');
    setVideoFormat('');
  };

  return (
      <div className="min-h-screen bg-gradient-to-r from-purple-600 to-pink-500 flex items-center justify-center text-white">
        <div className="bg-gray-800 rounded-lg p-8 shadow-xl w-full max-w-lg">
          <h1 className="text-3xl font-semibold text-center mb-4">YouTube Video Downloader</h1>
          <div className="mb-4">
            <label htmlFor="url" className="block text-lg mb-2">YouTube URL:</label>
            <input
                type="url"
                id="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full p-2 bg-gray-700 rounded text-white"
                placeholder="Enter YouTube URL"
            />
          </div>

          <div className="mb-4">
            <button
                onClick={handleGetFormats}
                className="w-full p-2 bg-green-600 rounded text-white"
            >
              Get Available Formats
            </button>
          </div>

          {error && <p className="text-red-500 text-center">{error}</p>}
          {successMessage && <p className="text-green-500 text-center">{successMessage}</p>}

          <div className="flex justify-center space-x-4 mb-4">
            <button
                onClick={() => handleTypeChange('onlyAudio')}
                className={`p-2 ${type === 'onlyAudio' ? 'bg-blue-600' : 'bg-gray-700'} rounded text-white`}
            >
              Audio Only
            </button>
            <button
                onClick={() => handleTypeChange('onlyVideo')}
                className={`p-2 ${type === 'onlyVideo' ? 'bg-blue-600' : 'bg-gray-700'} rounded text-white`}
            >
              Video Only
            </button>
            <button
                onClick={() => handleTypeChange('audioVideo')}
                className={`p-2 ${type === 'audioVideo' ? 'bg-blue-600' : 'bg-gray-700'} rounded text-white`}
            >
              Audio + Video
            </button>
          </div>

          <div className="mb-4">
            {type === 'audioVideo' && (
                <>
                  <div className="mb-2">
                    <label htmlFor="audioFormat" className="block text-lg mb-2">Audio Format:</label>
                    <select
                        id="audioFormat"
                        value={audioFormat}
                        onChange={(e) => setAudioFormat(e.target.value)}
                        className="w-full p-2 bg-gray-700 rounded text-white"
                    >
                      <option value="">Select Audio Format</option>
                      {availableFormats.onlyAudio.map((format) => (
                          <option key={format.itag} value={format.itag}>
                            {format.qualityLabel} - {format.mimeType}
                          </option>
                      ))}
                    </select>
                  </div>

                  <div className="mb-2">
                    <label htmlFor="videoFormat" className="block text-lg mb-2">Video Format:</label>
                    <select
                        id="videoFormat"
                        value={videoFormat}
                        onChange={(e) => setVideoFormat(e.target.value)}
                        className="w-full p-2 bg-gray-700 rounded text-white"
                    >
                      <option value="">Select Video Format</option>
                      {availableFormats.onlyVideo.map((format) => (
                          <option key={format.itag} value={format.itag}>
                            {format.qualityLabel} - {format.mimeType}
                          </option>
                      ))}
                    </select>
                  </div>
                </>
            )}

            {type !== 'audioVideo' && (
                <div className="mb-2">
                  <label className="block text-lg mb-2">{type === 'onlyAudio' ? 'Audio' : 'Video'} Format:</label>
                  <select
                      value={type === 'onlyAudio' ? audioFormat : videoFormat}
                      onChange={(e) => type === 'onlyAudio' ? setAudioFormat(e.target.value) : setVideoFormat(e.target.value)}
                      className="w-full p-2 bg-gray-700 rounded text-white"
                  >
                    <option value="">Select {type === 'onlyAudio' ? 'Audio' : 'Video'} Format</option>
                    {(type === 'onlyAudio' ? availableFormats.onlyAudio : availableFormats.onlyVideo).map((format) => (
                        <option key={format.itag} value={format.itag}>
                          {format.qualityLabel} - {format.mimeType}
                        </option>
                    ))}
                  </select>
                </div>
            )}

            {isLoading ? (
                <div className="w-full bg-gray-700 rounded">
                  <div className="bg-green-500 h-2" style={{ width: `${progress}%` }}></div>
                  <p className="text-center text-white">{`Downloading: ${progress}%`}</p>
                </div>
            ) : (
                <button
                    onClick={handleDownload}
                    className="w-full p-2 bg-blue-600 rounded text-white"
                >
                  <FaDownload className="inline mr-2" /> Download
                </button>
            )}
          </div>
        </div>
      </div>
  );
}

export default App;