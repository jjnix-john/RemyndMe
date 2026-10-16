import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { Audio } from 'expo-av';
import { transcribeAudio } from './api';

/** Microphone capture (expo-av) + Groq Whisper transcription via the backend. */
export function useRecorder() {
  const recordingRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!isRecording) return;
    setSeconds(0);
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [isRecording]);

  useEffect(() => () => { recordingRef.current?.stopAndUnloadAsync().catch(() => {}); }, []);

  const start = useCallback(async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Microphone needed', 'Enable microphone access in settings to record voice.');
        return false;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setIsRecording(true);
      return true;
    } catch (e) {
      Alert.alert('Recording failed', e.message);
      return false;
    }
  }, []);

  /** Stops recording and returns the transcript text ('' if nothing was captured). */
  const stop = useCallback(async () => {
    const rec = recordingRef.current;
    if (!rec) return '';
    recordingRef.current = null;
    setIsRecording(false);
    try {
      await rec.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = rec.getURI();
      if (!uri) return '';
      setIsTranscribing(true);
      return await transcribeAudio(uri);
    } catch (e) {
      Alert.alert('Transcription failed', e.message);
      return '';
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  return { isRecording, isTranscribing, seconds, start, stop };
}
