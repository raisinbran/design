"""Public authorship metadata embedded in every exported photograph."""
from PIL import Image

AUTHOR = "Brandon J. Chen"
ARTIST = 315
XP_AUTHOR = 40093
COPYRIGHT = "Copyright (c) Brandon J. Chen"
COPYRIGHT_TAG = 33432


def author_exif():
    """EXIF with the author (standard Artist and Windows Author tags) and copyright."""
    # Fresh exports deliberately receive only this public metadata.
    exif=Image.Exif()
    exif[ARTIST]=AUTHOR
    exif[XP_AUTHOR]=(AUTHOR+"\0").encode("utf-16le")
    exif[COPYRIGHT_TAG]=COPYRIGHT
    return exif

