"""Public authorship metadata; JPEG updates preserve compressed image bytes."""
from PIL import Image

AUTHOR = "Brandon J. Chen"
ARTIST = 315
XP_AUTHOR = 40093
COPYRIGHT = "Copyright (c) Brandon J. Chen"
COPYRIGHT_TAG = 33432


def author_exif():
    # Fresh exports deliberately receive only this public metadata.
    exif=Image.Exif()
    exif[ARTIST]=AUTHOR
    exif[XP_AUTHOR]=(AUTHOR+"\0").encode("utf-16le")
    exif[COPYRIGHT_TAG]=COPYRIGHT
    return exif


def exif_segments(data):
    if data[:2]!=b"\xff\xd8":raise ValueError("Expected a JPEG file")
    cursor=2
    while cursor<len(data):
        start=cursor
        if data[cursor]!=255:raise ValueError("Invalid JPEG marker")
        while cursor<len(data) and data[cursor]==255:cursor+=1
        if cursor>=len(data):raise ValueError("Truncated JPEG marker")
        marker=data[cursor];cursor+=1
        if marker in (0xDA,0xD9):return
        if marker==0x01 or 0xD0<=marker<=0xD7:continue
        if cursor+2>len(data):raise ValueError("Truncated JPEG segment")
        length=int.from_bytes(data[cursor:cursor+2],"big")
        end=cursor+length
        if length<2 or end>len(data):raise ValueError("Invalid JPEG segment length")
        if marker==0xE1 and data[cursor+2:cursor+8]==b"Exif\0\0":
            yield start,end,data[cursor+2:end]
        cursor=end
    raise ValueError("JPEG has no scan or end marker")


def without_exif(data):
    for start,end,_payload in reversed(list(exif_segments(data))):
        data=data[:start]+data[end:]
    return data


def set_authorship(data):
    segments=list(exif_segments(data))
    if len(segments)>1:raise ValueError("Multiple EXIF blocks require manual review")
    exif=Image.Exif()
    if segments:exif.load(segments[0][2])
    expected=author_exif()
    if all(exif.get(key)==value for key,value in expected.items()):return data
    for key,value in expected.items():exif[key]=value
    payload=exif.tobytes()
    if len(payload)>65533:raise ValueError("EXIF block is too large for JPEG")
    block=b"\xff\xe1"+(len(payload)+2).to_bytes(2,"big")+payload
    if segments:
        start,end,_payload=segments[0]
        updated=data[:start]+block+data[end:]
    else:updated=data[:2]+block+data[2:]
    if without_exif(updated)!=without_exif(data):
        raise ValueError("JPEG image data changed unexpectedly")
    return updated
