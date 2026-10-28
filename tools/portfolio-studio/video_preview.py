"""Decode one optional still frame; no playback, stream readers, or persistent video buffers."""
from pathlib import Path
from PIL import Image
VIDEO_SUFFIXES={'.mp4','.webm','.mov','.m4v'}

def image_frame(path, max_side=1200):
    """Return RGB PIL image, or None if codec unavailable; release decoder always."""
    if Path(path).suffix.lower() not in VIDEO_SUFFIXES:
        return None
    try:
        import cv2
        capture=cv2.VideoCapture(str(path))
        try:
            if not capture.isOpened():return None
            valid,frame=capture.read()
            if not valid or frame is None:return None
            height,width=frame.shape[:2]
            if width<1 or height<1:return None
            # Resize while still an array, bounding both memory and conversion.
            if max(width,height)>max_side:
                ratio=max_side/max(width,height)
                frame=cv2.resize(frame,(max(1,int(width*ratio)),max(1,int(height*ratio))),interpolation=cv2.INTER_AREA)
            return Image.fromarray(cv2.cvtColor(frame,cv2.COLOR_BGR2RGB))
        finally:capture.release()
    except Exception:
        # Optional preview failure must never stop media editing.
        return None
