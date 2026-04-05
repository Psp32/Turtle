import { useEffect, useRef, useState } from 'react';

const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY || '';
const ELEVENLABS_VOICE_ID =
  import.meta.env.VITE_ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';
const ELEVENLABS_MODEL_ID =
  import.meta.env.VITE_ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';

export function useNarration() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState('');
  const [engine, setEngine] = useState(ELEVENLABS_API_KEY ? 'elevenlabs' : 'browser');
  const [lastText, setLastText] = useState('');
  const [status, setStatus] = useState('idle');
  const audioRef = useRef(null);
  const audioUrlRef = useRef('');
  const utteranceRef = useRef(null);

  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel?.();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = '';
      }
    };
  }, []);

  function stop() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    window.speechSynthesis?.cancel?.();
    utteranceRef.current = null;
    setIsPlaying(false);
    setStatus('idle');
  }

  function speakWithBrowser(text) {
    if (!text || !window.speechSynthesis) {
      return;
    }

    setEngine('browser');
    setStatus('fallback');

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1.05;
    utterance.onstart = () => {
      setIsPlaying(true);
      setStatus('playing');
    };
    utterance.onend = () => {
      setIsPlaying(false);
      setStatus('complete');
    };
    utterance.onerror = () => {
      setIsPlaying(false);
      setStatus('fallback');
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }

  async function play(text) {
    if (!text || (!window.speechSynthesis && !ELEVENLABS_API_KEY)) {
      return;
    }

    setLastText(text);
    stop();

    if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
      speakWithBrowser(text);
      return;
    }

    try {
      setEngine('elevenlabs');
      setStatus('arming');

      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': ELEVENLABS_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
            model_id: ELEVENLABS_MODEL_ID,
            voice_settings: {
              stability: 0.45,
              similarity_boost: 0.75,
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`ElevenLabs returned ${response.status}`);
      }

      const blob = await response.blob();
      const nextAudioUrl = URL.createObjectURL(blob);

      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }

      audioUrlRef.current = nextAudioUrl;
      setAudioUrl(nextAudioUrl);

      const audio = new Audio(nextAudioUrl);
      audioRef.current = audio;
      audio.onplay = () => {
        setIsPlaying(true);
        setStatus('playing');
      };
      audio.onended = () => {
        audioRef.current = null;
        setIsPlaying(false);
        setStatus('complete');
      };
      audio.onerror = () => {
        audioRef.current = null;
        setIsPlaying(false);
        setStatus('fallback');
        setEngine('browser');
        speakWithBrowser(text);
      };

      await audio.play();
    } catch (error) {
      console.error('ElevenLabs narration failed:', error);
      speakWithBrowser(text);
    }
  }

  return {
    audioUrl,
    engine,
    isPlaying,
    isSupported: Boolean(window.speechSynthesis || ELEVENLABS_API_KEY),
    lastText,
    play,
    status,
    stop,
  };
}
