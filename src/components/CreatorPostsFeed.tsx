import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { QRCodeSVG } from "qrcode.react";
import { BadgeCheck, ChevronLeft, ChevronRight, Gift, X } from "lucide-react";
import { checkCreatorGift, createCreatorGift, reactToCreatorPost } from "@/lib/creator-posts.functions";
import { ProfileAudioPlayer } from "@/components/ProfileAudioPlayer";

type CreatorReaction = "like"|"fire"|"heart_eyes"|"laugh"|"clap";
type PostMedia={media_key:string;media_type:"image"|"video";media_url:string;display_order:number};
export type CreatorPost = { id:string; caption:string; media_type:"image"|"video"; media_url:string; media?:PostMedia[]; audio_title?:string|null; audio_url?:string|null; published_at:string; likes_count:number; fire_count:number; heart_eyes_count:number; laugh_count:number; clap_count:number; user_reactions?:CreatorReaction[] };
const money=(v:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v);
const MAX_GIFT_CENTS=45_000;
const formatGiftAmountInput=(value:string)=>{
  const digits=value.replace(/\D/g,"");
  if(!digits)return "";
  const cents=Math.min(Number(digits),MAX_GIFT_CENTS);
  return new Intl.NumberFormat("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(cents/100);
};
const parseGiftAmountInput=(value:string)=>Number(value.replace(/\./g,"").replace(",","."));
const relative=(date:string)=>{const seconds=Math.max(1,Math.floor((Date.now()-new Date(date).getTime())/1000)); if(seconds<3600)return `há ${Math.floor(seconds/60)||1}min`; if(seconds<86400)return `há ${Math.floor(seconds/3600)}h`; return `há ${Math.floor(seconds/86400)}d`;};
const visibleReactions=(post:CreatorPost)=>
  [
    ["like","❤️",post.likes_count],
    ["fire","🔥",post.fire_count],
    ["heart_eyes","😍",post.heart_eyes_count],
    ["laugh","😂",post.laugh_count],
    ["clap","👏",post.clap_count],
  ] as const;

export function CreatorPostsFeed({posts,creator,token}:{posts:CreatorPost[];creator:{id:string;name:string;username:string;avatar:string};token:string}){
  const [selected,setSelected]=useState<CreatorPost|null>(null);
  const [feed,setFeed]=useState(posts);
  const [reacting,setReacting]=useState("");
  const [reactionError,setReactionError]=useState("");
  const react=useServerFn(reactToCreatorPost);
  useEffect(()=>setFeed(posts),[posts]);
  async function handleReaction(post:CreatorPost,reaction:CreatorReaction){
    if(post.user_reactions?.includes(reaction)||reacting)return;
    setReacting(`${post.id}:${reaction}`);
    setReactionError("");
    try{
      const result=await react({data:{token,creatorId:creator.id,postId:post.id,reaction}}) as any;
      setFeed(current=>current.map(item=>item.id===post.id?{...item,...result,user_reactions:[...(item.user_reactions??[]),reaction]}:item));
    }catch(e){
      setReactionError(e instanceof Error?e.message:"Não foi possível registrar sua reação.");
    }finally{
      setReacting("");
    }
  }
  if(!feed.length)return <div className="bg-white px-5 py-12 text-center text-sm text-muted-foreground">Nenhuma postagem disponível ainda.</div>;
  return <div className="creator-posts-feed mx-auto flex w-full flex-col bg-white">
    {feed.map(post=>{
      const reactions=visibleReactions(post).filter(([, ,count])=>count>0);
      return <article key={post.id} className="overflow-hidden border-b border-border/70 bg-white pb-2 last:border-b-0">
        <header className="flex items-center gap-3 px-4 pb-3 pt-4 sm:px-6 sm:pt-5">
          <img src={creator.avatar} alt="" className="h-11 w-11 rounded-full object-cover ring-2 ring-primary ring-offset-2"/>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 font-bold"><span className="truncate">{creator.name}</span><BadgeCheck className="h-4 w-4 fill-sky-500 text-sky-500" stroke="white"/></div>
            <p className="truncate text-sm text-muted-foreground">@{creator.username} · {relative(post.published_at)}</p>
          </div>
        </header>
        {post.caption?<p className="whitespace-pre-wrap px-4 pb-4 text-base leading-relaxed sm:px-6">{post.caption}</p>:null}
        {post.audio_url?<div className="mb-3 overflow-hidden border-y border-border"><ProfileAudioPlayer title={post.audio_title?.trim()||"Ouça esta mensagem"} src={post.audio_url}/></div>:null}
        <PostCarousel media={post.media?.length?post.media:[{media_key:"",media_type:post.media_type,media_url:post.media_url,display_order:0}]}/>
        <div className="flex items-center gap-2 px-4 py-3 sm:px-6 sm:py-4">
          {reactions.length?<div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-full border border-border bg-white p-1 shadow-sm">
            {reactions.map(([reaction,emoji,count])=>{
              const active=post.user_reactions?.includes(reaction);
              return <button key={reaction} type="button" aria-label={`Reagir com ${emoji}`} aria-pressed={active} disabled={active||!!reacting} onClick={()=>handleReaction(post,reaction)} className={`inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full px-2.5 text-sm font-semibold transition ${active?"bg-primary/10 text-primary":"text-muted-foreground hover:bg-muted"} disabled:cursor-default`}><span aria-hidden>{emoji}</span><span>{count}</span></button>
            })}
          </div>:<div className="flex-1"/>}
          <button onClick={()=>setSelected(post)} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-3.5 text-sm font-bold text-white shadow-[0_7px_18px_rgba(234,54,12,.22)] sm:px-5"><Gift className="h-4 w-4"/>Presentear</button>
        </div>
      </article>
    })}
    {reactionError?<p role="alert" className="text-center text-sm text-destructive">{reactionError}</p>:null}
    {selected?<GiftModal creator={creator} post={selected} token={token} onClose={()=>setSelected(null)}/>:null}
  </div>;
}

function PostCarousel({media}:{media:PostMedia[]}){
  const [index,setIndex]=useState(0);
  useEffect(()=>setIndex(0),[media]);
  const item=media[index]??media[0];
  if(!item)return null;
  const move=(direction:-1|1)=>setIndex(current=>(current+direction+media.length)%media.length);
  return <div className="creator-post-media relative aspect-[3/4] w-full overflow-hidden bg-black">
    {item.media_type==="video"?<video key={item.media_url} src={item.media_url} autoPlay muted loop playsInline preload="metadata" controlsList="nodownload noplaybackrate noremoteplayback" disablePictureInPicture onContextMenu={event=>event.preventDefault()} className="h-full w-full object-cover"/>:<img src={item.media_url} alt="" className="h-full w-full object-cover"/>}
    {media.length>1?<>
      <button type="button" onClick={()=>move(-1)} aria-label="Mídia anterior" className="absolute left-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm transition hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><ChevronLeft className="h-6 w-6"/></button>
      <button type="button" onClick={()=>move(1)} aria-label="Próxima mídia" className="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm transition hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><ChevronRight className="h-6 w-6"/></button>
      <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-bold tabular-nums text-white backdrop-blur-sm">{index+1}/{media.length}</span>
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">{media.map((_,dot)=><button key={dot} type="button" onClick={()=>setIndex(dot)} aria-label={`Abrir mídia ${dot+1}`} className={`h-1.5 rounded-full transition-all ${dot===index?"w-5 bg-white":"w-1.5 bg-white/55"}`}/>)}</div>
    </>:null}
  </div>;
}

function GiftModal({creator,post,token,onClose}:{creator:{id:string;name:string;avatar:string};post:CreatorPost;token:string;onClose:()=>void}){
 const createGift=useServerFn(createCreatorGift), checkGift=useServerFn(checkCreatorGift); const [custom,setCustom]=useState(""),[message,setMessage]=useState(""),[pix,setPix]=useState<{giftId:string;pixCode:string;amount:number}|null>(null),[paid,setPaid]=useState(false),[error,setError]=useState(""),[loading,setLoading]=useState(false),[copied,setCopied]=useState(false);
 useEffect(()=>{if(!pix||paid)return;const timer=setInterval(async()=>{try{const r=await checkGift({data:{token,giftId:pix.giftId}});if(r.status==="paid"){setPaid(true);clearInterval(timer)}}catch{}},5000);return()=>clearInterval(timer)},[pix,paid,checkGift,token]);
 async function submit(){const value=parseGiftAmountInput(custom);if(!Number.isFinite(value)||value<1||value>450){setError("Informe um valor entre R$ 1,00 e R$ 450,00.");return}setLoading(true);setError("");try{setPix(await createGift({data:{token,creatorId:creator.id,postId:post.id,amount:Number(value.toFixed(2)),message}}))}catch(e){setError(e instanceof Error?e.message:"Não foi possível gerar o PIX.")}finally{setLoading(false)}}
 const Header=()=> <div className="relative overflow-hidden bg-gradient-to-br from-primary via-[#ff5d2e] to-[#ff8a3d] px-5 pb-7 pt-6 text-center text-white"><span className="pointer-events-none absolute -left-10 top-12 h-28 w-[130%] rounded-[50%] border-t border-white/20"/><button onClick={onClose} aria-label="Fechar" className="absolute right-4 top-4 z-10 grid h-11 w-11 place-items-center rounded-xl bg-white/15 text-white transition hover:bg-white/25"><X className="h-6 w-6"/></button><div className="relative mx-auto w-fit"><img src={creator.avatar} alt="" className="h-20 w-20 rounded-2xl border-2 border-white/70 object-cover shadow-lg"/><span className="absolute -bottom-2 -right-2 grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-white text-lg shadow-md">😍</span></div><h2 className="relative mt-6 text-2xl font-bold leading-tight tracking-tight">Presentear {creator.name}</h2><p className="relative mt-2 text-sm font-normal leading-relaxed text-white/90 sm:text-base">Mande uma lembrancinha e apareça pra ela 💖</p></div>;
 return <div className="fixed inset-0 z-[120] grid place-items-center bg-black/60 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`Presentear ${creator.name}`}><div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-[430px] overflow-y-auto rounded-[1.75rem] border border-white/70 bg-white [font-family:inherit] font-normal tracking-normal shadow-[0_28px_80px_rgba(0,0,0,.38)]"><Header/>{paid?<div className="px-6 py-10 text-center"><Gift className="mx-auto h-12 w-12 text-primary"/><h3 className="mt-4 text-2xl font-bold tracking-tight">Presente enviado!</h3><p className="mt-2 leading-relaxed text-muted-foreground">Seu presente de {money(pix!.amount)} foi enviado para {creator.name}.</p><button onClick={onClose} className="mt-7 min-h-12 w-full rounded-xl bg-primary font-semibold text-white">Concluir</button></div>:pix?<div className="px-5 pb-7 pt-6 text-center sm:px-7"><p className="text-base font-semibold leading-relaxed">Pague <span className="font-bold text-primary">{money(pix.amount)}</span> para enviar o presente 🎁</p><div className="mx-auto my-5 w-fit rounded-2xl border border-border bg-white p-3"><QRCodeSVG value={pix.pixCode} size={220} className="h-auto w-[min(220px,65vw)]"/></div><button onClick={async()=>{await navigator.clipboard.writeText(pix.pixCode);setCopied(true)}} className="min-h-12 w-full rounded-xl border-2 border-primary/55 font-semibold text-primary transition hover:bg-primary/5">{copied?"Código copiado!":"Copiar código PIX"}</button><p className="mt-5 flex items-center justify-center gap-2 text-sm leading-relaxed text-muted-foreground"><span className="h-2.5 w-2.5 rounded-full bg-amber-400"/>Aguardando pagamento — confirma sozinho aqui</p><button onClick={onClose} className="mt-6 min-h-11 px-5 font-semibold text-muted-foreground">Cancelar</button></div>:<div className="px-5 pb-6 pt-5 sm:px-7"><div className="grid grid-cols-3 gap-2.5">{[5,10,20].map(v=>{const formatted=formatGiftAmountInput(String(v*100));return <button key={v} type="button" onClick={()=>setCustom(formatted)} aria-pressed={custom===formatted} className={`min-h-16 rounded-xl border-2 text-lg font-bold tracking-tight transition ${custom===formatted?"border-primary bg-primary/5 text-primary shadow-[0_5px_14px_rgba(234,54,12,.12)]":"border-primary/45 text-primary hover:border-primary"}`}>R$ {v}</button>})}</div><label className="relative mt-3 block"><span className="mb-1.5 block text-sm font-semibold text-foreground">Valor do presente</span><span className="pointer-events-none absolute bottom-0 left-4 flex h-14 items-center font-semibold text-muted-foreground">R$</span><input value={custom} onChange={e=>setCustom(formatGiftAmountInput(e.target.value))} type="text" inputMode="numeric" pattern="[0-9]*" enterKeyHint="next" placeholder="0,00" aria-label="Valor do presente em reais" className="min-h-14 w-full rounded-xl border-2 border-border bg-muted/30 pl-12 pr-3 text-base font-normal tabular-nums outline-none transition placeholder:font-normal placeholder:text-muted-foreground focus:border-primary focus:bg-white"/></label><label className="mt-4 block"><span className="mb-1.5 block text-sm font-semibold text-foreground">Envie uma mensagem junto</span><textarea value={message} onChange={e=>setMessage(e.target.value.slice(0,500))} rows={3} maxLength={500} placeholder={`Escreva uma mensagem para ${creator.name}`} className="w-full resize-none rounded-xl border-2 border-border bg-muted/30 px-4 py-3 text-base leading-relaxed outline-none transition placeholder:text-muted-foreground focus:border-primary focus:bg-white"/><span className="mt-1 block text-right text-xs tabular-nums text-muted-foreground">{message.length}/500</span></label><button disabled={loading||!custom} onClick={submit} className="mt-3 min-h-14 w-full rounded-xl bg-primary px-6 font-semibold text-white shadow-[0_8px_20px_rgba(234,54,12,.24)] transition disabled:opacity-45">{loading?"Gerando PIX…":"Enviar"}</button>{error?<p role="alert" className="mt-3 text-center text-sm leading-relaxed text-destructive">{error}</p>:null}<button onClick={onClose} className="mx-auto mt-3 block min-h-11 px-5 font-semibold text-muted-foreground">Agora não</button></div>}</div></div>;
}
