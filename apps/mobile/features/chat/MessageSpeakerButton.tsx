import { env } from "@repo/env/native";
import { Button, Spinner, useToast } from "@repo/ui-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { useEffect, useRef, useState } from "react";

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  // RN doesn't have btoa for binary; chunked conversion avoids stack overflow
  // on long audio (10s+ TTS responses).
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    binary += String.fromCharCode.apply(null, Array.from(slice));
  }
  return (globalThis as { btoa: (s: string) => string }).btoa(binary);
}

type Props = {
  text: string;
};

export function MessageSpeakerButton({ text }: Props) {
  const toast = useToast();
  const [uri, setUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const lastTextRef = useRef(text);

  // If the message text changes (e.g. assistant edited?), drop the cached
  // audio so the next play synthesizes fresh.
  useEffect(() => {
    if (lastTextRef.current !== text) {
      lastTextRef.current = text;
      setUri(null);
    }
  }, [text]);

  const fetchAndPlay = async () => {
    if (loading) return;
    if (uri && !status.playing) {
      player.seekTo(0);
      player.play();
      return;
    }
    if (status.playing) {
      player.pause();
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${env.EXPO_PUBLIC_SERVER_URL}/media/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        toast.error("Playback failed", `HTTP ${res.status}`);
        return;
      }
      const buf = await res.arrayBuffer();
      const base64 = arrayBufferToBase64(buf);
      const tempUri = `${FileSystem.cacheDirectory}tts-${Date.now()}.mp3`;
      await FileSystem.writeAsStringAsync(tempUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      setUri(tempUri);
    } catch (e) {
      toast.error(
        "Playback failed",
        e instanceof Error ? e.message : undefined,
      );
    } finally {
      setLoading(false);
    }
  };

  // Auto-play once the URI is set.
  useEffect(() => {
    if (uri && !status.playing) {
      player.play();
    }
  }, [uri, player, status.playing]);

  if (loading) {
    return (
      <Button variant="ghost" size="sm" isIconOnly isDisabled>
        <Spinner size="sm" />
      </Button>
    );
  }
  return (
    <Button variant="ghost" size="sm" isIconOnly onPress={fetchAndPlay}>
      {status.playing ? "⏹" : "🔊"}
    </Button>
  );
}
