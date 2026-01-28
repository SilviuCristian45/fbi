"use client";
import { useEffect, useState } from "react";
import * as signalR from "@microsoft/signalr";

export default function SurveillanceFeed() {
  const [messages, setMessages] = useState<string[]>([]);

useEffect(() => {
    // Luăm token-ul din localStorage
    const token = localStorage.getItem("token");

    // const connection = new signalR.HubConnectionBuilder()
    //   .withUrl("http://localhost:7002/hubs/surveillance", {
    //       // 🔥 AICI E CHEIA: Trimitem tokenul prin WebSocket
    //       accessTokenFactory: () => token || "" 
    //   })
    //   .withAutomaticReconnect()
    //   .build();

    // connection.start()
    //   .then(() => console.log("Conectat la Surveillance Hub 🕵️‍♂️"))
    //   .catch(err => console.error("Eroare SignalR:", err));

    // 3. Ascultăm evenimentul "ReceiveActivity" (trimis din C#)
    // connection.on("ReceiveActivity", (message: string) => {
    //   // Adăugăm mesajul nou în listă
    //   const newMessage = message + " la data " + new Date().toLocaleDateString('ro-RO') + " la ora " + new Date().toLocaleTimeString("ro-RO")
    //   setMessages(prev => [newMessage, ...prev].slice(0, 5)); // Ținem doar ultimele 5
    // });

    // connection.on("ReceiveLocation", (message) => {
    //     const newMessage = "Locatia : " + message;
    //     setMessages(prev => [newMessage, ...prev].slice(0, 5)); // Ținem doar ultimele 5
    // })

    // Cleanup
    // return () => {
    //     connection.stop();
    // };

    }, []);

  if (messages.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-slate-900 text-green-400 p-4 rounded-lg shadow-xl border border-green-800 font-mono text-sm w-80 z-50">
      <h4 className="border-b border-green-800 pb-1 mb-2 font-bold uppercase flex items-center gap-2">
        <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
        Live Feed
      </h4>
      <ul className="space-y-1">
        {messages.map((msg, idx) => (
          <li key={idx} className="opacity-80 hover:opacity-100 transition-opacity">
            {">"} {msg}
          </li>
        ))}
      </ul>
    </div>
  );
}