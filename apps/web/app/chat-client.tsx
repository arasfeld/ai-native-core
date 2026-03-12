"use client";

import dynamic from "next/dynamic";

export const ChatClient = dynamic(() => import("./chat").then((m) => m.Chat), { ssr: false });
