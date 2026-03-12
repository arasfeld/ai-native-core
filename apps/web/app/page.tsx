import dynamic from "next/dynamic";

const Chat = dynamic(() => import("./chat").then((m) => m.Chat), { ssr: false });

export default function Home() {
  return <Chat />;
}
