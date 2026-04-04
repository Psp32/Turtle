import { useEffect, useRef, useState } from 'react';

export function useNarration() {
  const [isPlaying, setIsPlaying] = useState(false);
  const utteranceRef = useRef(null);

  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel?.();
    };
  }, []);

  function stop() {
    window.speechSynthesis?.cancel?.();
    utteranceRef.current = null;
    setIsPlaying(false);
  }

  function play(text) {
    if (!text || !window.speechSynthesis) {
      return;
    }

    stop();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1.05;
    utterance.onstart = () => setIsPlaying(true);
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = () => setIsPlaying(false);

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }

  return {
    isPlaying,
    isSupported: Boolean(window.speechSynthesis),
    play,
    stop,
  };
}
