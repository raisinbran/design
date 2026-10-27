"""Public opt-out notices, not adversarial pixels or signed Content Credentials.

IPTC/PLUS Data Mining: https://ns.useplus.org/ldf/vocab/DMI-PROHIBITED-AIMLTRAINING
No source metadata, private paths, or timestamps are copied into these notices.
"""
from xml.sax.saxutils import escape
from xml.etree import ElementTree as ET
from PIL import Image
from publication_metadata import AUTHOR, COPYRIGHT, author_exif
from studio_info import APP_NAME, VERSION

DATA_MINING = "http://ns.useplus.org/ldf/vocab/DMI-PROHIBITED-AIMLTRAINING"
NOTICE = ("AI/ML training, generative AI training, model fine-tuning, dataset creation, "
          "and automated style imitation are not authorized. "
          "Contact Brandon J. Chen for permission.")
XMP_HEADER = b"http://ns.adobe.com/xap/1.0/\0"


def export_exif():
    exif = author_exif()
    exif[305] = f"{APP_NAME} {VERSION}"
    exif[37510] = b"ASCII\0\0\0" + NOTICE.encode("ascii")
    return exif


def rights_xmp():
    """An unsigned XMP packet using standard rights and PLUS properties."""
    return (f'<x:xmpmeta xmlns:x="adobe:ns:meta/">'
        '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
        '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" '
        'xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/" '
        'xmlns:plus="http://ns.useplus.org/ldf/xmp/1.0/">'
        f'<dc:creator><rdf:Seq><rdf:li>{escape(AUTHOR)}</rdf:li></rdf:Seq></dc:creator>'
        f'<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">{escape(COPYRIGHT)}</rdf:li></rdf:Alt></dc:rights>'
        '<xmpRights:Marked>True</xmpRights:Marked>'
        f'<xmpRights:UsageTerms><rdf:Alt><rdf:li xml:lang="x-default">{escape(NOTICE)}</rdf:li></rdf:Alt></xmpRights:UsageTerms>'
        f'<plus:DataMining rdf:resource="{DATA_MINING}"/>'
        '</rdf:Description></rdf:RDF></x:xmpmeta>').encode("utf-8")


def jpeg_with_rights(data):
    """Attach XMP to a newly encoded JPEG without another compression pass.

    Writing APP1 directly also supports the oldest Pillow in requirements.txt.
    Call only on a fresh export (not an existing metadata-bearing asset).
    """
    if not data.startswith(b"\xff\xd8"):
        raise ValueError("Expected a freshly encoded JPEG")
    payload = XMP_HEADER + rights_xmp()
    if len(payload) > 65533:
        raise ValueError("Rights metadata exceeds JPEG APP1 limit")
    return data[:2] + b"\xff\xe1" + (len(payload)+2).to_bytes(2,"big") + payload + data[2:]


def rights_segments(data):
    """Locate only EXIF and standard XMP APP1 segments before JPEG scan data."""
    if data[:2] != b"\xff\xd8": raise ValueError("Expected JPEG")
    cursor=2
    while cursor<len(data):
        start=cursor
        if data[cursor]!=255: raise ValueError("Invalid JPEG marker")
        while cursor<len(data) and data[cursor]==255: cursor+=1
        if cursor>=len(data): raise ValueError("Truncated JPEG marker")
        marker=data[cursor];cursor+=1
        if marker in (0xDA,0xD9): return
        if marker==0x01 or 0xD0<=marker<=0xD7: continue
        if cursor+2>len(data): raise ValueError("Truncated JPEG segment")
        length=int.from_bytes(data[cursor:cursor+2],"big");end=cursor+length
        if length<2 or end>len(data): raise ValueError("Invalid JPEG segment")
        payload=data[cursor+2:end]
        if marker==0xE1:
            if payload.startswith(b"Exif\0\0"): yield start,end,"exif",payload
            elif payload.startswith(XMP_HEADER): yield start,end,"xmp",payload[len(XMP_HEADER):]
        cursor=end
    raise ValueError("JPEG has no scan or end marker")


def without_rights_metadata(data):
    for start,end,_kind,_payload in reversed(list(rights_segments(data))):
        data=data[:start]+data[end:]
    return data


def set_jpeg_rights(data):
    """Idempotent, lossless backfill; preserve unrelated EXIF/XMP properties."""
    segments=list(rights_segments(data))
    exifs=[p for _,_,k,p in segments if k=="exif"]
    xmps=[p for _,_,k,p in segments if k=="xmp"]
    if len(exifs)>1 or len(xmps)>1: raise ValueError("Multiple metadata blocks require review")
    # Rewriting a signed/extended manifest would need a separate provenance flow.
    if b"http://ns.adobe.com/xmp/extension/\0" in data or b"c2pa" in data.lower():
        raise ValueError("Extended XMP or signed provenance requires review")
    exif=Image.Exif()
    if exifs: exif.load(exifs[0])
    expected=export_exif()
    rdf="{http://www.w3.org/1999/02/22-rdf-syntax-ns#}"
    template=ET.fromstring(rights_xmp())
    desired=template.find(".//"+rdf+"Description")
    tree=ET.fromstring(xmps[0]) if xmps else template
    descriptions=tree.findall(".//"+rdf+"Description")
    if not descriptions: raise ValueError("XMP has no RDF description")
    def value(node):
        return (node.tag,tuple(sorted(node.attrib.items())),(node.text or "").strip(),tuple(value(c) for c in node))
    compliant=all(any(value(node)==value(wanted) for desc in descriptions for node in desc)
                  for wanted in desired)
    if xmps and compliant and all(exif.get(key)==val for key,val in expected.items()): return data
    for key,val in expected.items(): exif[key]=val
    if xmps:
        owned={node.tag for node in desired}
        for desc in descriptions:
            for node in list(desc):
                if node.tag in owned: desc.remove(node)
        for node in desired: descriptions[0].append(node)
    payloads=[exif.tobytes(),XMP_HEADER+ET.tostring(tree,encoding="utf-8")]
    if any(len(p)>65533 for p in payloads): raise ValueError("Metadata exceeds JPEG APP1 limit")
    stripped=without_rights_metadata(data)
    blocks=b"".join(b"\xff\xe1"+(len(p)+2).to_bytes(2,"big")+p for p in payloads)
    updated=stripped[:2]+blocks+stripped[2:]
    if without_rights_metadata(updated)!=stripped: raise ValueError("JPEG image data changed")
    return updated
