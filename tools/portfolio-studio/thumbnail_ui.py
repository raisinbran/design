"""Portfolio Studio thumbnail layout improvements (shared between workspaces)."""
from PIL import Image, ImageOps

THUMB_SIZE = (64, 48)
ROW_HEIGHT = 60

def cover_thumbnail(source, size=THUMB_SIZE):
    """Fill a thumbnail with image content; center-crop instead of grey bars."""
    image=ImageOps.exif_transpose(source).convert('RGB')
    return ImageOps.fit(image,size,method=Image.Resampling.LANCZOS,centering=(0.5,0.5))
