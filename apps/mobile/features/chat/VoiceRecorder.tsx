import { env } from "@repo/env/native";
import { Button, Spinner, useToast } from "@repo/ui-native";
import { AudioModule, RecordingPresets, useAudioRecorder } from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { useEffect, useState } from "react";

type Props = {
  onTranscript: (text: string) => void;
  disabled?: boolean;
};

export function VoiceRecorder({ onTranscript, disabled }: Props) {
  const toast = useToast();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    AudioModule.requestRecordingPermissionsAsync().catch(() => {});
  }, []);

  const start = async () => {
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        toast.error("Microphone access denied");
        return;
      }
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (e) {
      toast.error(
        "Recording failed",
        e instanceof Error ? e.message : undefined,
      );
    }
  };

  const stop = async () => {
    try {
      await recorder.stop();
    } catch {}
    const uri = recorder.uri;
    if (!uri) return;
    setUploading(true);
    try {
      const result = await FileSystem.uploadAsync(
        `${env.EXPO_PUBLIC_SERVER_URL}/media/transcribe`,
        uri,
        {
          httpMethod: "POST",
          uploadType: FileSystem.FileSystemUploadType.MULTIPART,
          fieldName: "file",
        },
      );
      if (result.status >= 200 && result.status < 300) {
        const body = JSON.parse(result.body) as { text?: string };
        if (body.text) onTranscript(body.text);
      } else {
        toast.error("Transcription failed", `HTTP ${result.status}`);
      }
    } catch (e) {
      toast.error(
        "Transcription failed",
        e instanceof Error ? e.message : undefined,
      );
    } finally {
      setUploading(false);
    }
  };

  if (uploading) {
    return (
      <Button variant="ghost" size="md" isIconOnly isDisabled>
        <Spinner size="sm" />
      </Button>
    );
  }

  if (recorder.isRecording) {
    return (
      <Button variant="destructive" size="md" isIconOnly onPress={stop}>
        ⏹
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="md"
      isIconOnly
      onPress={start}
      isDisabled={disabled}
    >
      🎤
    </Button>
  );
}
