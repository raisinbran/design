// Only user-triggered project expansion scrolls; initial page load does not.
let r62UserAction=false;
document.addEventListener("pointerdown",e=>{
 if(e.target.closest("details.project > summary"))r62UserAction=true;
},true);
document.addEventListener("keydown",e=>{
 if((e.key==="Enter"||e.key===" ")&&e.target.closest("details.project > summary"))r62UserAction=true;
},true);
/* R51 standalone gallery. No fetch of engineeringdesign.html and no Bootstrap dependency. */
(() => {
"use strict";
const mount=document.getElementById("pilot-projects");
if(!mount) return;
const allGalleries=[...mount.querySelectorAll(".project-gallery")];
const PHOTO_PROMINENCE = document.body.classList.contains("archive-2026")
  ? (window.ARCHIVE_PHOTO_PROMINENCE || {})
  : (window.ENGINEERING_PHOTO_PROMINENCE_R54 || {});
function mediaFilename(fig){
  const media=fig.querySelector("img,video");
  if(!media)return "";
  const path=(media.getAttribute("src")||media.currentSrc||"").split(/[?#]/)[0];
  try{return decodeURIComponent(path.split("/").pop()).toLowerCase()}catch(_){return path.split("/").pop().toLowerCase()}
}
function photoPriority(fig){
  const name=mediaFilename(fig);
  const value=PHOTO_PROMINENCE[name] || "normal";
  return ["low","normal","portraitBoost","featured"].includes(value)?value:"normal";
}

  const ratios=new WeakMap(), originals=new WeakMap();
  let frame=0;
  function draw(gallery){
    const figures=originals.get(gallery)||[];
    const width=gallery.clientWidth;
    if(!width||!figures.length)return;
    const gap=width<=720?8:12;
    const target=width<=720?235:width<1024?255:295;
    // Plan all rows together. Full rows are justified with exactly gap pixels
    // between neighboring media, avoiding Bootstrap-like leftover gutters.
    const n=figures.length;
    const rr=figures.map(f=>Math.max(.25,Math.min(7,ratios.get(f)||1.5)));
    const dp=Array(n+1).fill(Infinity), next=Array(n).fill(n);
    dp[n]=0;
    for(let i=n-1;i>=0;i--){
      let sum=0;
      for(let j=i+1;j<=Math.min(n,i+6);j++){
        sum+=rr[j-1];
        const count=j-i;
        const height=(width-gap*(count-1))/sum;
        if(height<=0)break;
        const last=j===n;
        // Penalize extreme row heights, but permit a modest natural final row.
        const quality=Math.pow(Math.log(Math.max(30,height)/target),2)*150;
        const tall=height>target*1.6?Math.pow(height/target-1.6,2)*650:0;
        const short=height<target*.58?Math.pow(.58-height/target,2)*650:0;
        // Prominence is a row-planning preference, never a destructive crop.
        // High-priority media favors fewer companions; low-priority photos
        // may share denser rows. Keep all source aspect ratios unchanged.
        const priorities=figures.slice(i,j).map(photoPriority);
        const featured=priorities.filter(v=>v==="featured").length;
        const boosted=priorities.filter(v=>v==="portraitBoost").length;
        const low=priorities.filter(v=>v==="low").length;
        const prominencePenalty=featured*Math.max(0,count-1)*24
          + boosted*Math.max(0,count-2)*9
          + low*(count===1?12:0);
        const cost=quality+tall+short+prominencePenalty+(last?0:2)+dp[j];
        if(cost<dp[i]){dp[i]=cost;next[i]=j}
      }
    }
    gallery.replaceChildren();
    for(let i=0;i<n;){
      const j=next[i]>i?next[i]:i+1;
      const subset=figures.slice(i,j);
      const sum=subset.reduce((v,f)=>v+rr[figures.indexOf(f)],0);
      const exactHeight=(width-gap*(subset.length-1))/sum;
      // An isolated final photograph may use natural scale, leaving blank
      // page space to its right, never an inflated gap between photographs.
      const last=j===n;
      const height=last&&subset.length===1?Math.min(target*1.25,exactHeight):exactHeight;
      const row=document.createElement("div");row.className="project-row";
      let used=0;
      subset.forEach((fig,k)=>{
        const w=k===subset.length-1&&height===exactHeight
          ? Math.max(1,width-gap*(subset.length-1)-used)
          : height*rr[i+k];
        fig.style.setProperty("width",w+"px","important");
        fig.style.setProperty("height",height+"px","important");
        row.append(fig); used+=w;
      });
      gallery.append(row);i=j;
    }
  }
  function renderAll(){for(const gallery of allGalleries)draw(gallery)}
  function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(renderAll)}
  for(const gallery of allGalleries){
    const figs=[...gallery.querySelectorAll(":scope > figure")];
    for(const fig of figs){
      const fname=mediaFilename(fig);
      fig.classList.remove("media-zoom-check-valve","media-zoom-ubertato");
      if(fname==="160714 aam check valve 1 crop.jpg")fig.classList.add("media-r54-valve-one");
      if(fname==="160714 aam check valve 2_edit.jpg")fig.classList.add("media-r54-valve-two");
      if(fname==="ubertato c render b.jpg")fig.classList.add("media-r54-ubertato");
    }
    originals.set(gallery,figs);
    for(const fig of figs){
      const media=fig.querySelector("img,video");
      if(!media)continue;
      const ready=()=>{const w=media.naturalWidth||media.videoWidth;const h=media.naturalHeight||media.videoHeight;if(w&&h){
        // Ubertato: narrower portrait presentation crops only the side areas.
        // Height is retained; the image file is not edited.
        const customRatio=Number(fig.dataset.displayRatio || 0);
        ratios.set(fig,customRatio>=0.25&&customRatio<=7
          ?customRatio
          :(fig.classList.contains("media-r54-ubertato") ? Math.min(w/h,0.82) : w/h));
      }schedule()};
      if(media.tagName==="IMG"&&media.complete)ready();
      else if(media.tagName==="VIDEO"&&media.readyState>=1)ready();
      else media.addEventListener(media.tagName==="VIDEO"?"loadedmetadata":"load",ready,{once:true});
    }
  }
  window.addEventListener("resize",schedule,{passive:true});
  mount.addEventListener("toggle",schedule,true);
  // Reflow after a project is expanded. Hidden gallery widths can otherwise be zero.
  for(const project of mount.querySelectorAll("details.project")){
    project.addEventListener("toggle",()=>{
      schedule();
      if(project.open){
        // Only one project open at once, matching the original Engineering page.
        // Close others before scrolling so geometry is stable.
        for(const other of mount.querySelectorAll("details.project[open]")){
          if(other!==project)other.open=false;
        }
        requestAnimationFrame(()=>{
          requestAnimationFrame(()=>{
            const nav=document.querySelector(".site-nav-2026");
            const sticky=nav && getComputedStyle(nav).position==="sticky";
            const offset=sticky ? nav.getBoundingClientRect().height + 8 : 8;
            const top=window.scrollY + project.getBoundingClientRect().top - offset;
            if(r62UserAction)window.scrollTo({top:Math.max(0,top),behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});
          });
        });
      }
      for(const video of project.querySelectorAll("video")){
        video.controls=false;video.loop=true;video.muted=true;
        if(!project.open){video.pause();continue}
        // Muted autoplay/loop is best-effort; browsers may still block playback.
        video.muted=true;
        const attempt=video.play();
        if(attempt && typeof attempt.catch==="function"){
          attempt.catch(()=>{ /* User can press Play if autoplay is blocked. */ });
        }
      }
    });
    // Initial hero is expanded before event handlers are registered.
    if(project.open)for(const video of project.querySelectorAll("video")){
      video.muted=true;video.loop=true;video.controls=false;
      const attempt=video.play();
      if(attempt && typeof attempt.catch==="function")attempt.catch(()=>{});
    }
  }
  schedule();
})();
