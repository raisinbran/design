"""Offline photographic publication processing for the Portfolio Studio.
No network calls, original files are opened read-only, all published images are derived copies.
"""
import hashlib
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

try:
    import cv2
    import numpy as np
except ImportError:
    cv2=None
    np=None

def font(size):
    for candidate in (
        "C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/arial.ttf",
        "DejaVuSans.ttf", "arial.ttf"
    ):
        try:
            return ImageFont.truetype(candidate,max(8,int(size)))
        except OSError:
            pass
    return ImageFont.load_default()

def conservative_level(image, max_degrees=3.0):
    """Suggest rotation only if a coherent set of long, near-horizontal lines exists."""
    if cv2 is None:
        return None
    copy=image.copy()
    copy.thumbnail((900,900),Image.Resampling.LANCZOS)
    rgb=np.array(copy.convert("RGB"))
    gray=cv2.cvtColor(rgb,cv2.COLOR_RGB2GRAY)
    edge=cv2.Canny(cv2.GaussianBlur(gray,(5,5),0),60,130)
    lines=cv2.HoughLinesP(edge,1,np.pi/180,threshold=65,
                            minLineLength=int(max(copy.size)*.22),maxLineGap=15)
    if lines is None:
        return None
    candidate=[]
    for line in lines[:,0]:
        x1,y1,x2,y2=[float(i) for i in line]
        angle=math.degrees(math.atan2(y2-y1,x2-x1))
        if abs(angle) <= 8:
            candidate.append((angle,math.hypot(x2-x1,y2-y1)))
    if len(candidate)<2: return None
    candidate.sort(key=lambda item:item[0])
    total=sum(w for _,w in candidate)
    accum=0
    median=0
    for angle,weight in candidate:
        accum+=weight
        if accum>=total/2:
            median=angle
            break
    support=sum(w for a,w in candidate if abs(a-median)<1.5)/total
    if support<.68 or abs(median)>max_degrees:
        return None
    return round(median,2)

def straighten_and_crop(image, degrees):
    """Rotate CCW by degrees, then center-crop inside original pixels.
    Crop preserves original aspect ratio, guaranteeing no gray/transparent corner triangles.
    """
    degrees=float(degrees)
    if abs(degrees)<0.00001: return image.copy()
    w,h=image.size
    a=math.radians(abs(degrees))
    co=abs(math.cos(a))
    si=abs(math.sin(a))
    k=min(w/(w*co+h*si),h/(w*si+h*co))*.997
    cw=max(1,int(math.floor(w*k)))
    ch=max(1,int(math.floor(h*k)))
    rotated=image.convert("RGBA").rotate(degrees,Image.Resampling.BICUBIC,
                                           expand=True,fillcolor=(0,0,0,0))
    rw,rh=rotated.size
    x=(rw-cw)//2
    y=(rh-ch)//2
    result=rotated.crop((x,y,x+cw,y+ch))
    # The .997 scale safeguards a subpixel aliasing edge.
    if result.getchannel("A").getextrema()[0] < 255:
        raise ValueError("Rotation crop contained transparent pixels. Choose a smaller angle.")
    return result.convert("RGB")

def watermark(image,logo=None,text="Brandon J. Chen", tile_alpha=20,corner_alpha=105):
    """Burn a low-opacity repeated watermark and corner signature into actual pixels."""
    img=image.convert("RGBA")
    w,h=img.size
    fs=max(12,round(min(w,h)*.027))
    txt_font=font(fs)
    # Construct a tiled diagonal layer, with both light and dark components
    # so marks remain present over bright and shadowed regions.
    sz=(w*2,h*2)
    layer=Image.new("RGBA",sz,(0,0,0,0))
    draw=ImageDraw.Draw(layer)
    spacing=max(150,int(min(w,h)*.38))
    for yi in range(-h,2*h,spacing):
        for xi in range(-w,2*w,spacing):
            offset=(yi//spacing)%2*(spacing//2)
            x=xi+offset
            y=yi
            draw.text((x+1,y+1),text,font=txt_font,fill=(0,0,0,int(tile_alpha*.5)))
            draw.text((x,y),text,font=txt_font,fill=(255,255,255,tile_alpha))
    tiled=layer.rotate(19,resample=Image.Resampling.BICUBIC,expand=False)
    tiled=tiled.crop(((sz[0]-w)//2,(sz[1]-h)//2,(sz[0]+w)//2,(sz[1]+h)//2))
    img=Image.alpha_composite(img,tiled)
    corner=Image.new("RGBA",(w,h),(0,0,0,0))
    cdraw=ImageDraw.Draw(corner)
    corner_font=font(max(11,round(min(w,h)*.024)))
    bbox=cdraw.textbbox((0,0),text,font=corner_font)
    text_width=bbox[2]-bbox[0]
    text_height=bbox[3]-bbox[1]
    margin=max(12,round(min(w,h)*.024))
    logo_image=None
    if logo is not None and Path(logo).is_file():
        with Image.open(logo) as im:
            logo_image=im.convert("RGBA").copy()
        logo_image.thumbnail((max(20,int(w*.07)),max(20,int(h*.065))),Image.Resampling.LANCZOS)
        # Existing grape asset may include transparency.
        alpha=logo_image.getchannel("A").point(lambda p:int(p*min(corner_alpha/255,.65)))
        logo_image.putalpha(alpha)
    logo_w=logo_image.width+10 if logo_image is not None else 0
    x=max(margin,w-margin-text_width-logo_w)
    y=max(margin,h-margin-max(text_height,logo_image.height if logo_image else 0))
    if logo_image is not None:
        corner.alpha_composite(logo_image,(x,y))
        x+=logo_w
    cdraw.text((x,y),text,font=corner_font,fill=(255,255,255,corner_alpha),
               stroke_width=1,stroke_fill=(0,0,0,int(corner_alpha*.45)))
    return Image.alpha_composite(img,corner).convert("RGB")

def publish_image(source,destination,max_side=1000,degrees=0,logo=None,quality=86):
    source=Path(source)
    destination=Path(destination)
    if source.resolve()==destination.resolve():
        raise ValueError("Output may not overwrite the original.")
    if destination.exists():
        raise FileExistsError("Would overwrite an existing publication image: "+str(destination))
    max_side=int(max_side)
    if max_side<300 or max_side>6000:
        raise ValueError("Max side must be between 300 and 6000 px")
    if not -35<=float(degrees)<=35:
        raise ValueError("Rotation must be within +/-35 degrees")
    with Image.open(source) as im:
        img=ImageOps.exif_transpose(im).convert("RGB")
    img=straighten_and_crop(img,degrees)
    if max(img.size)>max_side:
        img.thumbnail((max_side,max_side),Image.Resampling.LANCZOS)
    img=watermark(img,logo=logo)
    destination.parent.mkdir(parents=True,exist_ok=True)
    try:
        img.save(destination,"JPEG",quality=int(quality),optimize=True,progressive=True)
    except BaseException:
        destination.unlink(missing_ok=True)
        raise
    return {"width":img.width,"height":img.height,"aspectRatio":round(img.width/img.height,8)}

def unique_destination(media_dir,source):
    stem=Path(source).stem
    stem="".join(c if c.isalnum() or c in "-_" else "_" for c in stem).strip("_") or "photo"
    media_dir=Path(media_dir)
    dst=media_dir/(stem+"_web.jpg")
    i=2
    while dst.exists():
        dst=media_dir/(f"{stem}_web_{i}.jpg")
        i+=1
    return dst
