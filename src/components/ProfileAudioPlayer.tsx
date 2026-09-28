import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Pause, Play } from "lucide-react";

const bars = [12,20,16,25,14,30,18,24,12,27,17,22,14,31,19,24,13,28,16,21,12,26,18,30,14,23,17,27,12,20];

function formatDuration(seconds:number){
  if(!Number.isFinite(seconds))return "0:00";
  const minutes=Math.floor(seconds/60);
  return `${minutes}:${Math.floor(seconds%60).toString().padStart(2,"0")}`;
}

export function ProfileAudioPlayer({title,src}:{title:string;src:string}){
  const audioRef=useRef<HTMLAudioElement>(null);
  const [playing,setPlaying]=useState(false);
  const [duration,setDuration]=useState(0);
  const [current,setCurrent]=useState(0);
  useEffect(()=>()=>audioRef.current?.pause(),[src]);
  async function toggle(){
    const audio=audioRef.current;if(!audio)return;
    if(audio.paused){await audio.play();setPlaying(true)}else{audio.pause();setPlaying(false)}
  }
  function seek(event:MouseEvent<HTMLButtonElement>){
    const audio=audioRef.current;if(!audio||!duration)return;
    const rect=event.currentTarget.getBoundingClientRect();
    audio.currentTime=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width))*duration;
  }
  const progress=duration?current/duration:0;
  return <section className="border-t border-border px-5 pb-5 pt-4" aria-label={title}>
    <h2 className="text-sm font-bold tracking-[-0.01em] text-[#332e2b]">{title}</h2>
    <div className="mt-3 flex min-h-[76px] items-center gap-3 rounded-2xl bg-[#211d1b] px-3.5 py-3 text-white shadow-[0_10px_24px_rgba(31,24,21,.16)]">
      <audio ref={audioRef} src={src} preload="metadata" onLoadedMetadata={e=>setDuration(e.currentTarget.duration)} onTimeUpdate={e=>setCurrent(e.currentTarget.currentTime)} onEnded={()=>{setPlaying(false);setCurrent(0)}} />
      <button type="button" onClick={toggle} aria-label={playing?"Pausar áudio":"Reproduzir áudio"} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-[#211d1b] shadow-sm">
        {playing?<Pause className="h-5 w-5" fill="currentColor"/>:<Play className="ml-0.5 h-5 w-5" fill="currentColor"/>}
      </button>
      <button type="button" onClick={seek} aria-label="Avançar no áudio" className="flex h-9 min-w-0 flex-1 items-center justify-between gap-[3px] overflow-hidden">
        {bars.map((height,index)=><span key={index} className="w-[3px] shrink-0 rounded-full transition-colors" style={{height,background:index/bars.length<=progress?"#f0521d":"rgba(255,255,255,.92)"}} />)}
      </button>
      <span className="shrink-0 text-sm font-semibold tabular-nums">{formatDuration(duration)}</span>
    </div>
  </section>;
}
