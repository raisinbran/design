"""Offline photographic publication processing for the Portfolio Studio.
No network calls, original files are opened read-only, all published images are derived copies.
"""
import hashlib
import io
import math
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont, ImageOps, ImageStat
from export_rights import export_exif, rights_xmp, jpeg_with_rights
try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except ImportError:
    pass

try:
    import cv2
    import numpy as np
except ImportError:
    cv2=None
    np=None

def font(size):
    for candidate in (
        "C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/arial.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Helvetica.ttc",
        "DejaVuSans.ttf", "arial.ttf"
    ):
        try:
            return ImageFont.truetype(candidate,max(8,int(size)))
        except OSError:
            pass
    return ImageFont.load_default()

def conservative_level(image, max_degrees=8.0):
    """Estimate roll from agreeing horizontal/vertical edges; abstain if ambiguous."""
    if cv2 is None:return None
    copy=image.copy();copy.thumbnail((1000,1000),Image.Resampling.LANCZOS)
    gray=cv2.cvtColor(np.array(copy.convert("RGB")),cv2.COLOR_RGB2GRAY)
    edges=cv2.Canny(cv2.GaussianBlur(gray,(5,5),0),50,130)
    lines=cv2.HoughLinesP(edges,1,np.pi/1800,threshold=50,
        minLineLength=int(max(copy.size)*.18),maxLineGap=18)
    if lines is None:return None
    groups=[[],[]]
    for x1,y1,x2,y2 in lines.reshape(-1,4):
        angle=(math.degrees(math.atan2(float(y2-y1),float(x2-x1)))+90)%180-90
        length=math.hypot(float(x2-x1),float(y2-y1))
        if abs(angle)<=max_degrees:groups[0].append((angle,length))
        elif 90-abs(angle)<=max_degrees:
            groups[1].append((angle-(90 if angle>0 else -90),length))
    estimates=[]
    for group in groups:
        if len(group)<2:continue
        total=sum(w for _,w in group)
        # A weighted consensus handles the repeated edges of a long horizon.
        center=max(group,key=lambda item:sum(w for a,w in group if abs(a-item[0])<1.0))[0]
        members=sorted((a,w) for a,w in group if abs(a-center)<1.0)
        support=sum(w for _,w in members)
        if support/total<.68:continue
        running=0
        for angle,weight in members:
            running+=weight
            if running>=support/2:
                estimates.append((angle,support));break
    if not estimates:return None
    if len(estimates)==2 and abs(estimates[0][0]-estimates[1][0])>1.2:return None
    return round(max(estimates,key=lambda item:item[1])[0],2)


def rotation_crop_size(w, h, degrees):
    degrees=float(degrees)
    if abs(degrees)<0.00001: return w,h
    a=math.radians(abs(degrees))
    co,si=abs(math.cos(a)),abs(math.sin(a))
    k=min(w/(w*co+h*si),h/(w*si+h*co))*.997
    return max(1,int(math.floor(w*k))),max(1,int(math.floor(h*k)))


def straighten_and_crop(image, degrees):
    """Rotate CCW by degrees, then center-crop inside original pixels.
    Crop preserves original aspect ratio, guaranteeing no gray/transparent corner triangles.
    """
    degrees=float(degrees)
    if abs(degrees)<0.00001: return image.copy()
    w,h=image.size
    cw,ch=rotation_crop_size(w,h,degrees)
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


def _overlay_text_supersampled(text, font_size, rgba, supersample=3):
    """Crisp antialiased text mask rendered only once at its final target scale."""
    fs=max(9,int(font_size))
    f=font(fs*supersample)
    bbox=ImageDraw.Draw(Image.new("L",(1,1))).textbbox((0,0),text,font=f)
    width=max(1,bbox[2]-bbox[0])
    height=max(1,bbox[3]-bbox[1])
    mask=Image.new("L",(width+6*supersample,height+6*supersample),0)
    ImageDraw.Draw(mask).text((3*supersample-bbox[0],3*supersample-bbox[1]),text,
                             fill=255,font=f)
    mask=mask.resize((max(1,round(mask.width/supersample)),
                      max(1,round(mask.height/supersample))),Image.Resampling.LANCZOS)
    ink=Image.new("RGBA",mask.size,rgba[:3]+(255,))
    ink.putalpha(mask.point(lambda v:round(v*rgba[3]/255)))
    return ink

def watermark(image,logo=None,text="Brandon J. Chen",tile_alpha=7,corner_alpha=92):
    """Adaptive grayscale watermark composited after final photo resizing.

    Avoids downscaling already faint text and rasterizes at 3x for legible edges.
    """
    img=image.convert("RGBA")
    w,h=img.size
    fs=max(12,round(min(w,h)*.027))
    # Sample the original beneath every lettering pixel, not one point per tile.
    luminance=ImageOps.grayscale(img.convert("RGB"))
    tile_mask=Image.new("L",(w,h),0)
    spacing=max(215,int(min(w,h)*.54))
    row_spacing=max(140,round(min(w,h)*.30))
    stencil=_overlay_text_supersampled(text,fs,(255,255,255,255))
    angled=stencil.rotate(19,resample=Image.Resampling.BICUBIC,expand=True).getchannel("A")
    for row,y in enumerate(range(-row_spacing,h+row_spacing,row_spacing)):
        for x in range(-spacing,w+spacing,spacing):
            xpos=x+(spacing//2 if row%2 else 0)
            tile_mask.paste(angled,(xpos,y))
    # Subtle ink for dim-room viewing, with a restrained lift in deep shadows.
    # Default opacity is 7/255 on brighter areas and about 10/255 at black.
    strength=max(0,min(255,float(tile_alpha)))
    opacity=luminance.point(lambda value:round(min(255,strength*(1+.45*max(0,(36-value)/36)**2))))
    # Fine detail can hide lettering even when its tone is appropriate. Add a
    # restrained boost only where texture exists; flat sky and black stay subtle.
    rgb=image.convert("RGB")
    color_difference=ImageChops.difference(rgb,rgb.filter(ImageFilter.GaussianBlur(max(1,fs/6))))
    red,green,blue=color_difference.split()
    texture=ImageChops.lighter(ImageChops.lighter(red,green),blue).filter(ImageFilter.BoxBlur(max(1,fs/5)))
    detail_map=texture.point(lambda value:round(255*math.sqrt(min(1,value/12))))
    texture_alpha=detail_map.point(lambda value:round(min(255,strength*2.8*value/255)))
    darkness=luminance.point(lambda value:round(255*max(0,(140-value)/140)))
    dark_detail=ImageChops.multiply(detail_map,darkness)
    shadow_alpha=dark_detail.point(lambda value:round(min(255,strength*2.2*value/255)))
    opacity=ImageChops.add(ImageChops.add(opacity,texture_alpha),shadow_alpha).point(
        lambda value:min(round(min(255,strength*6)),value))
    # Pale sky needs less ink even when clouds, haze or JPEG grain register as
    # texture. Taper only highlights; retain the stronger midtone/shadow treatment.
    highlight_softening=luminance.point(lambda value:round(255*(1-.5*max(0,min(1,(value-170)/75)))))
    opacity=ImageChops.multiply(opacity,highlight_softening)
    tone=luminance.point(lambda value:20 if value>=130 else 244)
    # A one-pixel opposing edge helps lettering remain legible over roofs,
    # foliage and crowds. It is absent on smooth areas, including flat black.
    edge_mask=ImageChops.subtract(tile_mask.filter(ImageFilter.MaxFilter(3)),tile_mask)
    edge_opacity=detail_map.point(lambda value:round(min(255,strength*2*value/255)))
    edge_opacity=ImageChops.multiply(edge_opacity,highlight_softening)
    edge_tone=luminance.point(lambda value:244 if value>=130 else 20)
    edge=Image.merge("RGBA",(edge_tone,edge_tone,edge_tone,ImageChops.multiply(edge_mask,edge_opacity)))
    img=Image.alpha_composite(img,edge)
    layer=Image.merge("RGBA",(tone,tone,tone,ImageChops.multiply(tile_mask,opacity)))
    img=Image.alpha_composite(img,layer)
    corner_font=font(max(13,round(min(w,h)*.026)))
    draw=ImageDraw.Draw(Image.new("RGBA",(1,1)))
    box=draw.textbbox((0,0),text,font=corner_font)
    visible_h=max(1,box[3]-box[1])
    margin=max(12,round(min(w,h)*.024))
    signature=_overlay_text_supersampled(text,corner_font.size,(255,255,255,255))
    grape=None
    if logo is not None and Path(logo).is_file():
        with Image.open(logo) as source:
            original=source.convert("RGBA")
            bounds=original.getchannel("A").getbbox()
            if bounds:
                original=original.crop(bounds)
                # Logo visible outline height equals the visible glyph height.
                target_h=visible_h
                target_w=max(1,round(original.width*target_h/original.height))
                grape=original.resize((target_w,target_h),Image.Resampling.LANCZOS)
    gutter=max(5,fs//3)
    logo_w=grape.width+gutter if grape is not None else 0
    total_w=logo_w+signature.width
    box_h=max(signature.height,grape.height if grape is not None else 0)
    x=max(0,w-margin-total_w)
    y=max(0,h-margin-box_h)
    mask=Image.new("L",(total_w,box_h),0)
    if grape is not None:
        mask.paste(grape.getchannel("A"),(0,(box_h-grape.height)//2))
    mask.paste(signature.getchannel("A"),(logo_w,(box_h-signature.height)//2))
    # Measure only beneath the actual inscription, excluding empty margins.
    # Sampling the original avoids having the tiled layer influence the corner.
    region=luminance.crop((x,y,x+total_w,y+box_h))
    stats=ImageStat.Stat(region,mask=mask)
    brightness=stats.mean[0]
    detail=min(1.0,stats.stddev[0]/64)
    # A smooth dark corner gets ~12 levels of contrast rather than bright white.
    # Busy areas receive modestly more definition, without a glow or outline.
    opacity=max(0,min(255,corner_alpha))*(.55+.45*min(1,brightness/128))/255
    offset=60+20*detail
    # Dark color/texture variation needs more definition than smooth black.
    corner_texture=math.sqrt(min(1,ImageStat.Stat(texture.crop((x,y,x+total_w,y+box_h)),mask=mask).mean[0]/12))
    dark_corner_detail=corner_texture*max(0,(140-brightness)/140)
    opacity=min(.55,opacity*(1+1.2*dark_corner_detail+.4*corner_texture))
    offset+=20*dark_corner_detail+10*corner_texture
    direction=1 if brightness<128 else -1
    tone=region.filter(ImageFilter.GaussianBlur(max(1,visible_h/12)))
    tone=tone.point(lambda value:round(max(0,min(255,value+direction*offset))))
    corner=Image.merge("RGBA",(tone,tone,tone,mask.point(lambda value:round(value*opacity))))
    img.alpha_composite(corner,(x,y))
    return img.convert("RGB")

def prepare_publication(source,max_side=1080,degrees=0,export_crop=None):
    """Read originals without modification and prepare a clean publication image."""
    source=Path(source)
    max_side=int(max_side)
    if max_side<300 or max_side>6000:
        raise ValueError("Max side must be between 300 and 6000 px")
    if not -35<=float(degrees)<=35:
        raise ValueError("Rotation must be within +/-35 degrees")
    with Image.open(source) as im:
        img=ImageOps.exif_transpose(im).convert("RGB")
    img=straighten_and_crop(img,degrees)
    if export_crop:
        from math import floor, ceil
        c=export_crop
        left=max(0,min(img.width-1, floor(float(c["x"])*img.width)))
        top=max(0,min(img.height-1, floor(float(c["y"])*img.height)))
        right=max(left+1,min(img.width, ceil((float(c["x"])+float(c["width"]))*img.width)))
        bottom=max(top+1,min(img.height, ceil((float(c["y"])+float(c["height"]))*img.height)))
        img=img.crop((left,top,right,bottom))
    if max(img.size)>max_side:
        img.thumbnail((max_side,max_side),Image.Resampling.LANCZOS)
    return img


def encode_jpeg(image,quality=90,logo=None):
    image=watermark(image,logo=logo)
    stream=io.BytesIO()
    image.save(stream,"JPEG",quality=int(quality),subsampling=0,optimize=True,progressive=True,exif=export_exif())
    return jpeg_with_rights(stream.getvalue())


def encode_gallery_thumbnail(clean_image,logo=None,gallery_crop=None):
    """One small, corner-only WebP; always start from clean source pixels."""
    image=clean_image.copy()
    if gallery_crop:
        from photo_viewport import normalize_crop
        c=normalize_crop(gallery_crop)
        image=image.crop((round(c["x"]*image.width),round(c["y"]*image.height),
            round((c["x"]+c["width"])*image.width),round((c["y"]+c["height"])*image.height)))
    image.thumbnail((800,800),Image.Resampling.LANCZOS)
    image=watermark(image,logo=logo,tile_alpha=0)
    stream=io.BytesIO()
    image.save(stream,"WEBP",quality=78,method=6,exif=export_exif().tobytes(),xmp=rights_xmp())
    return stream.getvalue(),{"width":image.width,"height":image.height}


def encode_publication(source,max_side=1080,degrees=0,logo=None,quality=90,export_crop=None):
    image=prepare_publication(source,max_side,degrees,export_crop)
    return encode_jpeg(image,quality,logo),{"width":image.width,"height":image.height,"aspectRatio":round(image.width/image.height,8)}


def encode_publication_pair(source,max_side=1080,degrees=0,logo=None,quality=90,export_crop=None,gallery_crop=None):
    image=prepare_publication(source,max_side,degrees,export_crop)
    full=encode_jpeg(image,quality,logo)
    thumbnail,size=encode_gallery_thumbnail(image,logo,gallery_crop)
    dimensions={"width":image.width,"height":image.height,"aspectRatio":round(image.width/image.height,8),
        "thumbnailWidth":size["width"],"thumbnailHeight":size["height"],
        "thumbnailVersion":hashlib.sha256(thumbnail).hexdigest()[:12],"mediaVersion":hashlib.sha256(full).hexdigest()[:12]}
    return full,thumbnail,dimensions


def publish_image(source,destination,max_side=1080,degrees=0,logo=None,quality=90,export_crop=None,thumbnail_destination=None,gallery_crop=None):
    source=Path(source);destination=Path(destination)
    if source.resolve()==destination.resolve():raise ValueError("Output may not overwrite the original.")
    if destination.exists():raise FileExistsError("Would overwrite an existing publication image: "+str(destination))
    thumbnail_destination=Path(thumbnail_destination) if thumbnail_destination is not None else None
    if thumbnail_destination is not None:
        if thumbnail_destination.resolve() in (source.resolve(),destination.resolve()):raise ValueError("Thumbnail must be a separate derived file.")
        if thumbnail_destination.exists():raise FileExistsError(thumbnail_destination)
        data,thumbnail,dimensions=encode_publication_pair(source,max_side,degrees,logo,quality,export_crop,gallery_crop)
    else:data,dimensions=encode_publication(source,max_side,degrees,logo,quality,export_crop)
    destination.parent.mkdir(parents=True,exist_ok=True)
    created=False;thumbnail_created=False
    try:
        with destination.open("xb") as output:
            created=True
            output.write(data)
        if thumbnail_destination is not None:
            thumbnail_destination.parent.mkdir(parents=True,exist_ok=True)
            with thumbnail_destination.open("xb") as output:
                thumbnail_created=True;output.write(thumbnail)
    except BaseException:
        if created:destination.unlink(missing_ok=True)
        if thumbnail_created:thumbnail_destination.unlink(missing_ok=True)
        raise
    return dimensions

def framing_translation(zoom, focus_x, focus_y):
    """Return pixel-independent CSS translations for a zoomed justified-row tile.

    A zoom of 1 preserves the complete image. At higher zoom, the specified
    focus point is centered where the available crop permits it.
    """
    zoom=float(zoom); focus_x=float(focus_x); focus_y=float(focus_y)
    if not 1 <= zoom <= 3: raise ValueError("Gallery zoom must be between 1.0 and 3.0")
    if not 0 <= focus_x <= 1 or not 0 <= focus_y <= 1:
        raise ValueError("Gallery focus must be between 0 and 100 percent")
    bound=(zoom-1)/2
    shift_x=max(-bound,min(bound,zoom*(.5-focus_x)))
    shift_y=max(-bound,min(bound,zoom*(.5-focus_y)))
    return shift_x,shift_y


def framed_preview(image,zoom=1,focus_x=.5,focus_y=.5):
    """Simulate the site's zoom and focal controls, retaining tile aspect ratio."""
    zoom=float(zoom)
    sx,sy=framing_translation(zoom,focus_x,focus_y)
    if zoom==1:return image.copy()
    w,h=image.size
    # Shift values are fractions of *unscaled tile dimensions*.
    cx=w*(.5-sx/zoom)
    cy=h*(.5-sy/zoom)
    cw=w/zoom;ch=h/zoom
    left=max(0,min(w-cw,cx-cw/2))
    top=max(0,min(h-ch,cy-ch/2))
    cropped=image.crop((round(left),round(top),round(left+cw),round(top+ch)))
    return cropped.resize((w,h),Image.Resampling.LANCZOS)
